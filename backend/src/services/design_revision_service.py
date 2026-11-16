"""Online project invalidation, separate from business versions and Agent hashes.

Only init_db installs this schema/triggers, never an external template/import engine.
C6 callers must authorize inside their physical transaction, assert the reviewed
revision, reconcile the graph, and invalidate even an empty/no-op replacement.
The transaction owns commit/rollback; history bookkeeping must not call invalidate.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session

from src.models import Base

REVISION_HEADER = "X-CRF-Design-Revision"
STATE_TABLE = "project_design_state"
TRIGGER_PREFIX = "crf_design_v1_"
DESIGN_TABLES = (
    "project",
    "form",
    "field_definition",
    "form_field",
    "field",
    "codelist",
    "codelist_option",
    "unit",
    "visit",
    "visit_form",
)
_IGNORED_COLUMNS = frozenset({"created_at", "updated_at"})
_PROJECT_IGNORED_COLUMNS = _IGNORED_COLUMNS | {"owner_id", "deleted_at"}


class DesignStateError(Exception):
    """Safe coded failure; never includes raw rows, headers or foreign state."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


def read_design_revision(session: Session, project_id: int) -> str:
    """Read within the SAME physical snapshot/transaction as the editable body."""
    row = session.execute(
        text("SELECT incarnation,revision FROM project_design_state WHERE project_id=:id"),
        {"id": project_id},
    ).one_or_none()
    if row is None:
        raise RuntimeError("项目在线设计状态未初始化")
    return f'"crf-design-v1:p{project_id}:{row.incarnation}:r{row.revision}"'


def assert_design_revision(session: Session, project_id: int, expected: str | None) -> None:
    """Caller must already own BEGIN IMMEDIATE and reauthorize current access."""
    if not expected:
        raise DesignStateError(428, "PRECONDITION_REQUIRED", "页面缺少设计状态，请更新页面后重试；请先保留未保存内容")
    if len(expected) > 160 or expected != read_design_revision(session, project_id):
        raise DesignStateError(409, "STALE_STATE", "项目设计已发生变化，未保存本次修改；请查看最新内容后确认")


def invalidate_project_design(session: Session, project_id: int) -> None:
    """C6 graph replacement advances the current counter, never restores old state."""
    result = session.execute(
        text("UPDATE project_design_state SET revision=revision+1 WHERE project_id=:id"),
        {"id": project_id},
    )
    if result.rowcount != 1:
        raise RuntimeError("项目在线设计状态未初始化")


def _definition_consumers(predicate: str) -> str:
    return (
        f"SELECT project_id FROM field_definition WHERE {predicate} UNION "
        "SELECT f.project_id FROM form f JOIN form_field ff ON ff.form_id=f.id "
        f"JOIN field_definition d ON d.id=ff.field_definition_id WHERE d.{predicate}"
    )


def _reference_projects(table: str, row: str) -> str:
    """Fixed schema identifiers only; include reverse consumers of corrupt links.

    BEFORE DELETE retains parent lookup during FK cascades; UPDATE invalidates
    both old/new membership. No untrusted identifier enters the generated SQL.
    """
    if table == "project":
        return f"SELECT {row}.id"
    if table in {"codelist", "unit"}:
        key = "codelist_id" if table == "codelist" else "unit_id"
        return (
            f"SELECT {row}.project_id UNION "
            + _definition_consumers(f"{key}={row}.id")
            + f" UNION SELECT f.project_id FROM form f JOIN field legacy ON legacy.form_id=f.id WHERE legacy.{key}={row}.id"
        )
    if table == "codelist_option":
        return (
            f"SELECT project_id FROM codelist WHERE id={row}.codelist_id UNION "
            + _definition_consumers(f"codelist_id={row}.codelist_id")
            + " UNION SELECT f.project_id FROM form f JOIN field legacy ON legacy.form_id=f.id "
            f"WHERE legacy.codelist_id={row}.codelist_id"
        )
    if table == "field_definition":
        return (
            f"SELECT {row}.project_id UNION SELECT f.project_id FROM form f "
            f"JOIN form_field ff ON ff.form_id=f.id WHERE ff.field_definition_id={row}.id"
        )
    if table in {"form_field", "field"}:
        projects = f"SELECT project_id FROM form WHERE id={row}.form_id"
        if table == "form_field":
            projects += f" UNION SELECT project_id FROM field_definition WHERE id={row}.field_definition_id"
        return projects
    if table == "visit_form":
        return (
            f"SELECT project_id FROM visit WHERE id={row}.visit_id UNION "
            f"SELECT project_id FROM form WHERE id={row}.form_id"
        )
    if table == "form":
        return (
            f"SELECT {row}.project_id UNION SELECT v.project_id FROM visit v "
            f"JOIN visit_form vf ON vf.visit_id=v.id WHERE vf.form_id={row}.id UNION "
            "SELECT d.project_id FROM field_definition d JOIN form_field ff ON ff.field_definition_id=d.id "
            f"WHERE ff.form_id={row}.id"
        )
    return (
        f"SELECT {row}.project_id UNION SELECT f.project_id FROM form f "
        f"JOIN visit_form vf ON vf.form_id=f.id WHERE vf.visit_id={row}.id"
    )


def _trigger_sql(table: str, action: str) -> str:
    name = f"{TRIGGER_PREFIX}{table}_{action.lower()}"
    row = "NEW" if action == "INSERT" else "OLD"
    projects = _reference_projects(table, row)
    when = ""
    if action == "UPDATE":
        ignored = _PROJECT_IGNORED_COLUMNS if table == "project" else _IGNORED_COLUMNS
        columns = [column.name for column in Base.metadata.tables[table].columns if column.name not in ignored]
        when = "WHEN " + " OR ".join(f'OLD."{column}" IS NOT NEW."{column}"' for column in columns)
        projects += " UNION " + _reference_projects(table, "NEW")
    body = f"UPDATE {STATE_TABLE} SET revision=revision+1 WHERE project_id IN ({projects});"
    if table == "project" and action == "INSERT":
        body = (
            f"INSERT INTO {STATE_TABLE}(project_id,incarnation,revision) VALUES(NEW.id,lower(hex(randomblob(16))),0);"
        )
    timing = "BEFORE" if action == "DELETE" else "AFTER"
    return f'CREATE TRIGGER "{name}" {timing} {action} ON "{table}" {when} BEGIN {body} END'


def drop_design_triggers(conn: Connection) -> None:
    """Temporarily remove ONLY our fixed-name triggers before online schema rebuild."""
    for table in DESIGN_TABLES:
        for action in ("insert", "update", "delete"):
            conn.exec_driver_sql(f'DROP TRIGGER IF EXISTS "{TRIGGER_PREFIX}{table}_{action}"')


def reinstall_design_triggers(conn: Connection) -> None:
    """Recreate fixed definitions after canonical rebuild, without resetting state."""
    exists = conn.exec_driver_sql(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='project_design_state'"
    ).scalar_one_or_none()
    if exists:
        for table in DESIGN_TABLES:
            for action in ("INSERT", "UPDATE", "DELETE"):
                conn.exec_driver_sql(_trigger_sql(table, action))


def initialize_design_state(engine: Engine) -> None:
    """Final online migration: rebuild-safe, idempotent, never reset a revision."""
    with engine.begin() as conn:
        conn.exec_driver_sql(
            f"CREATE TABLE IF NOT EXISTS {STATE_TABLE}("
            "project_id INTEGER PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,"
            "incarnation TEXT NOT NULL CHECK(length(incarnation)=32),"
            "revision INTEGER NOT NULL DEFAULT 0 CHECK(typeof(revision)='integer' AND revision>=0))"
        )
        conn.exec_driver_sql(
            f"INSERT OR IGNORE INTO {STATE_TABLE}(project_id,incarnation,revision) "
            "SELECT id,lower(hex(randomblob(16))),0 FROM project"
        )
        drop_design_triggers(conn)
        reinstall_design_triggers(conn)
