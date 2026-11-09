"""Agent 私有状态可移植性测试：导出剥离、导入/复制不继承、生命周期。"""

from __future__ import annotations

import hashlib
import sqlite3

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from agent_access_helpers import issue_credential, seed_full_project, reset_agent_limiter
from src.models.agent_access import AgentAuditEvent, AgentCredential, AgentOperation
from src.services.agent_access_service import issue_credential as svc_issue_credential
from src.services.database_export_service import (
    export_full_database,
    export_project_database,
    export_user_projects_database,
)

pytestmark = pytest.mark.integration

AGENT_TABLES = ("agent_credential", "agent_operation", "agent_audit_event")


@pytest.fixture
def file_db(tmp_path):
    """真实文件数据库 + 种子（用户/项目/凭据/操作/审计）。"""
    from sqlalchemy import create_engine, event
    from sqlalchemy.pool import StaticPool

    from src.models import Base
    from src.models.field_definition import FieldDefinition
    from src.models.project import Project
    from src.models.user import User

    db_path = tmp_path / "portability.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _configure(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys = ON")

    Base.metadata.create_all(engine)
    with Session(engine) as session:
        alice = User(username="alice", auth_version=0)
        bob = User(username="bob", auth_version=0)
        session.add_all([alice, bob])
        session.flush()
        project_a = Project(name="项目A", version="1.0", owner_id=alice.id, order_index=1)
        project_b = Project(name="项目B", version="1.0", owner_id=alice.id, order_index=2)
        session.add_all([project_a, project_b])
        session.flush()
        session.add(
            FieldDefinition(
                project_id=project_a.id, variable_name="P_DEF", label="字段", field_type="文本", order_index=1
            )
        )
        credential, _raw = svc_issue_credential(session, project_a, alice, "便携凭据", "read", 24)
        session.flush()
        session.add(
            AgentOperation(
                credential_id=credential.id,
                project_id=project_a.id,
                request_id="op-1",
                tool_name="crf_list_projects",
                input_digest="0" * 64,
                status="done",
                result_json="{}",
            )
        )
        session.flush()
        session.commit()
    engine.dispose()
    return str(db_path)


def _tables(db_path: str) -> set:
    conn = sqlite3.connect(db_path)
    try:
        return {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    finally:
        conn.close()


def _count(db_path: str, table: str) -> int:
    conn = sqlite3.connect(db_path)
    try:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    finally:
        conn.close()


def test_full_export_strips_agent_tables_and_vacuums(file_db):
    out = export_full_database(file_db)
    try:
        tables = _tables(out)
        for table in AGENT_TABLES:
            assert table not in tables, f"完整导出仍包含 {table}"
        # 设计数据保留
        assert "project" in tables and "field_definition" in tables
        # 剥离后 VACUUM：私有数据不残留在自由页（表已不存在即为结构证据）
        conn = sqlite3.connect(out)
        try:
            residue = conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'agent_%'").fetchone()[0]
        finally:
            conn.close()
        assert residue == 0
    finally:
        import os

        os.unlink(out)
    # 源库不受影响
    tables = _tables(file_db)
    assert set(AGENT_TABLES) <= tables


def test_project_export_strips_agent_tables(file_db):
    out = export_project_database(file_db, 1, "项目A")
    try:
        tables = _tables(out)
        for table in AGENT_TABLES:
            assert table not in tables
        assert _count(out, "project") == 1
    finally:
        import os

        os.unlink(out)


def test_user_export_strips_agent_tables(file_db):
    out = export_user_projects_database(file_db, 1, "alice")
    try:
        tables = _tables(out)
        for table in AGENT_TABLES:
            assert table not in tables
    finally:
        import os

        os.unlink(out)


def test_legacy_db_without_agent_tables_still_exports(tmp_path):
    """旧库（无 agent 表）导出不受影响。"""
    src = tmp_path / "legacy.db"
    conn = sqlite3.connect(src)
    try:
        conn.execute(
            "CREATE TABLE project (id INTEGER PRIMARY KEY, name TEXT, version TEXT, db_type TEXT, order_index INTEGER, created_at TEXT, deleted_at TEXT, trial_name TEXT, crf_version TEXT, crf_version_date TEXT, protocol_number TEXT, screening_number_format TEXT, sponsor TEXT, company_logo_path TEXT, data_management_unit TEXT, owner_id INTEGER)"
        )
        conn.execute(
            "CREATE TABLE form_field (id INTEGER PRIMARY KEY, form_id INTEGER, field_definition_id INTEGER, is_log_row INTEGER, order_index INTEGER, required INTEGER, label_override TEXT, help_text TEXT, default_value TEXT, inline_mark INTEGER, bg_color TEXT, text_color TEXT, label_bold INTEGER, label_font_size TEXT, created_at TEXT, updated_at TEXT)"
        )
        conn.execute(
            "CREATE TABLE form (id INTEGER PRIMARY KEY, project_id INTEGER, name TEXT, code TEXT, domain TEXT, order_index INTEGER, design_notes TEXT, annotation_positions TEXT, paper_orientation TEXT)"
        )
        conn.commit()
    finally:
        conn.close()
    out = export_full_database(str(src))
    try:
        assert "form" in _tables(out)
    finally:
        import os

        os.unlink(out)
    src.unlink()


def test_project_import_ignores_agent_tables(file_db, tmp_path):
    """带 agent 表的导出文件导入：不继承私有状态；无 agent 表的旧文件也兼容。"""
    from src.services.project_import_service import DatabaseMergeService, ProjectDbImportService
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session as S
    from src.models import Base
    from src.models.project import Project

    # 宿主库（干净）
    host = tmp_path / "host.db"
    host_engine = create_engine(f"sqlite:///{host}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(host_engine)
    with S(host_engine) as session:
        from src.models.user import User

        host_user = User(username="importer", auth_version=0)
        session.add(host_user)
        session.commit()
        host_user_id = host_user.id

    # 源文件 = 完整导出（agent 表已剥离）；即使人为回灌 agent 表也应被忽略
    src = export_full_database(file_db)
    try:
        conn = sqlite3.connect(src)
        try:
            conn.execute("PRAGMA foreign_keys = OFF")
            # 人为注入私有表行，模拟旧版导出携带
            conn.execute(
                "CREATE TABLE agent_credential (id INTEGER PRIMARY KEY, project_id INTEGER, owner_id INTEGER, name TEXT, token_hash TEXT, permission TEXT, auth_version INTEGER, expires_at TEXT, revoked INTEGER, created_at TEXT)"
            )
            conn.execute(
                "CREATE TABLE agent_operation (id INTEGER PRIMARY KEY, credential_id INTEGER, project_id INTEGER, request_id TEXT, tool_name TEXT, input_digest TEXT, status TEXT, result_json TEXT, change_kind TEXT, definition_id INTEGER, normalized_command_json TEXT, impact_json TEXT, base_fingerprint TEXT, proposal_digest TEXT, contract_version TEXT, expires_at TEXT, approval_state TEXT, approved_by INTEGER, approved_at TEXT, after_fingerprint TEXT, created_at TEXT, updated_at TEXT)"
            )
            conn.execute(
                "CREATE TABLE agent_audit_event (id INTEGER PRIMARY KEY, credential_id INTEGER, project_id INTEGER, operation_id INTEGER, actor_user_id INTEGER, tool_name TEXT, result_code TEXT, summary_json TEXT, created_at TEXT)"
            )
            # 每表注入一行（运行时构造值，无真实秘密），验证导入确实忽略已有私有行
            digest = hashlib.sha256(("a" * 64).encode("utf-8")).hexdigest()
            conn.execute(
                "INSERT INTO agent_credential (id, project_id, owner_id, name, token_hash, permission, auth_version, expires_at, revoked, created_at)"
                " VALUES (1, 1, 1, 'legacy', ?, 'read', 0, NULL, 0, NULL)",
                (digest,),
            )
            conn.execute(
                "INSERT INTO agent_operation (id, credential_id, project_id, request_id, tool_name, input_digest, status, result_json, change_kind, definition_id, normalized_command_json, impact_json, base_fingerprint, proposal_digest, contract_version, expires_at, approval_state, approved_by, approved_at, after_fingerprint, created_at, updated_at)"
                " VALUES (1, 1, 1, 'legacy-op', 'crf_list_projects', ?, 'done', '{}', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)",
                (digest,),
            )
            conn.execute(
                "INSERT INTO agent_audit_event (id, credential_id, project_id, operation_id, actor_user_id, tool_name, result_code, summary_json, created_at)"
                " VALUES (1, 1, 1, 1, NULL, 'crf_list_projects', 'success', '{}', NULL)"
            )
            conn.commit()
        finally:
            conn.close()

        # 注入行在源文件中真实存在（先证有、再证导入后无）
        assert _count(src, "agent_credential") == 1
        assert _count(src, "agent_operation") == 1
        assert _count(src, "agent_audit_event") == 1

        # 单项目导入（源库只有一个项目）
        conn = sqlite3.connect(src)
        try:
            conn.execute("DELETE FROM project WHERE id != 1")
            conn.commit()
        finally:
            conn.close()

        with S(host_engine) as session:
            result = ProjectDbImportService.import_single_project(src, host_user_id, session)
            session.commit()
            imported_project_id = result.project_id

        with S(host_engine) as session:
            # 无任何 agent 私有状态被导入
            assert session.scalar(select(AgentCredential.id)) is None
            assert session.scalar(select(AgentOperation.id)) is None
            assert session.scalar(select(AgentAuditEvent.id)) is None
            project = session.get(Project, imported_project_id)
            assert project is not None
    finally:
        import os

        os.unlink(src)


def test_database_merge_ignores_agent_tables(file_db, tmp_path):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session as S
    from src.models import Base
    from src.services.project_import_service import DatabaseMergeService
    from src.models.user import User

    host = tmp_path / "merge_host.db"
    host_engine = create_engine(f"sqlite:///{host}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(host_engine)
    with S(host_engine) as session:
        session.add(User(username="merger", auth_version=0))
        session.commit()
        merger_id = 1

    src = export_full_database(file_db)
    try:
        with S(host_engine) as session:
            report = DatabaseMergeService.merge(src, merger_id, session)
            session.commit()
        assert len(report.imported) >= 1
        with S(host_engine) as session:
            assert session.scalar(select(AgentCredential.id)) is None
            assert session.scalar(select(AgentOperation.id)) is None
    finally:
        import os

        os.unlink(src)


def test_project_copy_does_not_inherit_credentials(client: TestClient, engine):
    """项目复制不继承凭据/提案/审计。"""
    from src.services.project_clone_service import ProjectCloneService

    ctx = seed_full_project(client, engine, "alice")
    issue_credential(client, ctx["token"], ctx["project_id"], name="复制源凭据")

    with Session(engine) as session:
        cloned = ProjectCloneService.clone(ctx["project_id"], ctx["user_id"], session)
        session.commit()
        cloned_id = cloned.id

        cred_count = len(
            list(session.scalars(select(AgentCredential).where(AgentCredential.project_id == cloned_id)).all())
        )
        op_count = len(
            list(session.scalars(select(AgentOperation).where(AgentOperation.project_id == cloned_id)).all())
        )
    assert cred_count == 0
    assert op_count == 0


def test_project_purge_cascades_credentials(client: TestClient, engine):
    """项目硬删除级联清理凭据（FK CASCADE），无孤儿凭据。"""
    from src.models.project import Project
    from src.services.project_purge_service import purge_project

    ctx = seed_full_project(client, engine, "alice")
    issue_credential(client, ctx["token"], ctx["project_id"], name="待清理凭据")

    with Session(engine) as session:
        project = session.get(Project, ctx["project_id"])
        purge_project(session, project)
        session.commit()

        remaining = len(
            list(
                session.scalars(select(AgentCredential.id).where(AgentCredential.project_id == ctx["project_id"])).all()
            )
        )
    assert remaining == 0
