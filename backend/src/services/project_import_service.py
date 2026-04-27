"""项目导入服务 — 从外部 .db 文件导入单项目或合并整库"""
from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List

from sqlalchemy import create_engine, event, inspect, select, text
from sqlalchemy.orm import Session, sessionmaker

from src.database import _is_form_field_rowid_pk_compatible
from src.perf import perf_span
from src.models.project import Project
from src.schemas.project import normalize_screening_number_format
from src.services.project_clone_service import ProjectCloneService, ProjectGraph, ProjectGraphLoader

logger = logging.getLogger(__name__)

# 导入兼容性要求的核心表
_REQUIRED_TABLES = frozenset({
    "project", "visit", "form", "visit_form",
    "field_definition", "form_field",
    "codelist", "codelist_option", "unit",
})

_REQUIRED_COLUMNS: Dict[str, frozenset[str]] = {
    "project": frozenset({
        "id", "name", "version", "order_index", "created_at", "deleted_at",
        "trial_name", "crf_version", "crf_version_date", "protocol_number", "screening_number_format", "sponsor",
        "company_logo_path", "data_management_unit", "owner_id",
    }),
    "visit": frozenset({"id", "project_id", "name", "code", "sequence"}),
    "form": frozenset({"id", "project_id", "name", "code", "domain", "order_index", "design_notes"}),
    "visit_form": frozenset({"id", "visit_id", "form_id", "sequence"}),
    "field_definition": frozenset({
        "id", "project_id", "variable_name", "label", "field_type",
        "integer_digits", "decimal_digits", "date_format", "codelist_id", "unit_id",
        "is_multi_record", "table_type", "order_index", "created_at", "updated_at",
    }),
    "form_field": frozenset({
        "id", "form_id", "field_definition_id", "is_log_row", "order_index", "required",
        "label_override", "help_text", "default_value", "inline_mark", "bg_color",
        "text_color", "created_at", "updated_at",
    }),
    "codelist": frozenset({"id", "project_id", "name", "code", "description", "order_index"}),
    "codelist_option": frozenset({
        "id", "codelist_id", "code", "decode", "order_index", "trailing_underscore"
    }),
    "unit": frozenset({"id", "project_id", "symbol", "code", "order_index"}),
}


def _patch_legacy_project_schema(file_path: str) -> None:
    """为旧版项目库补齐导入所需的新增 project 列，仅修改临时副本。"""
    conn = sqlite3.connect(file_path)
    try:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        if 'project' not in tables:
            return
        cols = {row[1] for row in conn.execute("PRAGMA table_info(project)").fetchall()}
        if 'screening_number_format' not in cols:
            conn.execute('ALTER TABLE project ADD COLUMN screening_number_format VARCHAR(100)')
            conn.commit()
    finally:
        conn.close()


def _build_import_project_snapshot(project: Project) -> Project:
    """构造脱离外部 session 的项目快照，避免只读库 autoflush。"""
    return Project(
        name=project.name,
        version=project.version,
        trial_name=project.trial_name,
        crf_version=project.crf_version,
        crf_version_date=project.crf_version_date,
        protocol_number=project.protocol_number,
        screening_number_format=normalize_screening_number_format(project.screening_number_format),
        sponsor=project.sponsor,
        company_logo_path=project.company_logo_path,
        data_management_unit=project.data_management_unit,
        owner_id=project.owner_id,
        order_index=project.order_index or 1,
        deleted_at=project.deleted_at,
    )


def _open_readonly_sqlite(file_path: str) -> Session:
    """打开外部 SQLite 文件为只读 Session（支持中文路径）。"""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"文件不存在: {file_path}")

    db_path = str(path.resolve())

    engine = create_engine(
        "sqlite+pysqlite://",
        creator=lambda: sqlite3.connect(db_path, check_same_thread=False),
    )

    @event.listens_for(engine, "connect")
    def _set_readonly(dbapi_conn, connection_record):
        dbapi_conn.execute("PRAGMA query_only = ON")

    return sessionmaker(bind=engine)()


def _validate_schema(ext_session: Session) -> None:
    """校验外部数据库包含所有核心表及关键列。"""
    result = ext_session.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
    existing = {row[0] for row in result}
    missing = _REQUIRED_TABLES - existing
    if missing:
        raise ValueError(f"数据库缺少核心表: {', '.join(sorted(missing))}")

    inspector = inspect(ext_session.get_bind())
    incompatible: list[str] = []
    for table_name, required_columns in _REQUIRED_COLUMNS.items():
        existing_columns = {col["name"] for col in inspector.get_columns(table_name)}
        effective_required_columns = set(required_columns)
        if table_name == "project":
            effective_required_columns.discard("screening_number_format")
        missing_columns = effective_required_columns - existing_columns
        if missing_columns:
            incompatible.append(
                f"{table_name} 缺少列: {', '.join(sorted(missing_columns))}"
            )
    if incompatible:
        raise ValueError(
            "数据库 schema 不兼容: " + "; ".join(incompatible)
        )


def _load_project_graph_from_session(ext_session: Session, project: Project) -> ProjectGraph:
    """从外部 session 加载项目完整图（复用 ProjectGraphLoader 的加载逻辑）。"""
    return ProjectGraphLoader.load(project.id, ext_session)



def _validate_host_schema(session: Session) -> None:
    """校验当前宿主库关键表结构，避免导入在 flush 阶段才暴露 DDL 漂移。"""
    if not _is_form_field_rowid_pk_compatible(session.get_bind()):
        raise ValueError(
            "当前数据库 form_field 主键结构不兼容，请重启应用完成迁移后再导入。"
        )


def _resolve_import_name(original_name: str, session: Session, owner_id: int) -> str:
    """为导入项目生成不冲突的名称（Task 4.1）。

    命名规则：原名 → 原名_导入 → 原名_导入2 → ...
    查重范围：当前 owner 的未删除项目（回收站项目不占名）
    """
    existing_names = set(
        session.scalars(
            select(Project.name).where(
                Project.owner_id == owner_id,
                Project.deleted_at.is_(None),  # 排除回收站项目
            )
        ).all()
    )
    if original_name not in existing_names:
        return original_name
    # 首选：原名_导入
    candidate = f"{original_name}_导入"
    if candidate not in existing_names:
        return candidate
    # 后续：原名_导入2, 原名_导入3, ...
    n = 2
    while True:
        candidate = f"{original_name}_导入{n}"
        if candidate not in existing_names:
            return candidate
        n += 1


@dataclass
class ImportResult:
    """单项目导入结果。"""
    project_id: int
    project_name: str


@dataclass
class MergeReport:
    """整库合并报告。"""
    imported: List[ImportResult] = field(default_factory=list)
    renamed: List[dict] = field(default_factory=list)  # [{"original": str, "new": str}]


class ProjectDbImportService:
    """单项目 .db 导入服务。"""

    @staticmethod
    def import_single_project(
        file_path: str,
        current_user_id: int,
        session: Session,
    ) -> ImportResult:
        _patch_legacy_project_schema(file_path)
        ext_session = _open_readonly_sqlite(file_path)
        try:
            with perf_span("schema_validate"):
                _validate_schema(ext_session)
            with perf_span("host_schema_validate"):
                _validate_host_schema(session)

            with perf_span("external_graph_load"):
                projects = list(ext_session.scalars(select(Project)).all())
            if len(projects) != 1:
                raise ValueError(
                    f"导入文件必须恰好包含 1 个项目，当前包含 {len(projects)} 个"
                )

            with perf_span("external_graph_load"):
                graph = _load_project_graph_from_session(ext_session, projects[0])
                graph.project = _build_import_project_snapshot(projects[0])
            final_name = _resolve_import_name(
                projects[0].name, session, current_user_id
            )

            with perf_span("clone_entities"):
                cloned = ProjectCloneService.clone_from_graph(
                    graph, current_user_id, session, name_override=final_name
                )
            with perf_span("flush"):
                session.flush()

            return ImportResult(project_id=cloned.id, project_name=cloned.name)
        finally:
            ext_engine = ext_session.get_bind()
            ext_session.close()
            ext_engine.dispose()


class DatabaseMergeService:
    """整库合并服务。"""

    @staticmethod
    def merge(
        file_path: str,
        current_user_id: int,
        session: Session,
    ) -> MergeReport:
        _patch_legacy_project_schema(file_path)
        ext_session = _open_readonly_sqlite(file_path)
        try:
            with perf_span("schema_validate"):
                _validate_schema(ext_session)
            with perf_span("host_schema_validate"):
                _validate_host_schema(session)

            with perf_span("external_graph_load"):
                projects = list(
                    ext_session.scalars(
                        select(Project)
                        .where(Project.deleted_at.is_(None))
                        .order_by(Project.id)
                    ).all()
                )
            if not projects:
                raise ValueError("导入文件中没有项目")

            report = MergeReport()

            for project in projects:
                with perf_span("external_graph_load"):
                    graph = _load_project_graph_from_session(ext_session, project)
                    graph.project = _build_import_project_snapshot(project)
                final_name = _resolve_import_name(
                    project.name, session, current_user_id
                )

                with perf_span("clone_entities"):
                    cloned = ProjectCloneService.clone_from_graph(
                        graph, current_user_id, session, name_override=final_name
                    )
                with perf_span("flush"):
                    session.flush()

                result = ImportResult(
                    project_id=cloned.id,
                    project_name=cloned.name,
                )
                report.imported.append(result)

                if final_name != project.name:
                    report.renamed.append({
                        "original": project.name,
                        "new": final_name,
                    })

            return report
        finally:
            ext_engine = ext_session.get_bind()
            ext_session.close()
            ext_engine.dispose()
