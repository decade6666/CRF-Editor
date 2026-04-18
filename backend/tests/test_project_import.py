"""项目导入集成测试（task 4.7）"""
import sqlite3
from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as
from src.config import AppConfig, AuthConfig
from src.models import Base
from src.models.codelist import CodeList, CodeListOption
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.unit import Unit
from src.models.user import User
from src.models.visit import Visit
from src.models.visit_form import VisitForm
from src.database import _migrate_project_soft_delete_and_ordering
from src.services.project_clone_service import ProjectCloneService
from src.services.project_import_service import _validate_schema

_TEST_CONFIG = AppConfig(auth=AuthConfig(secret_key="test-secret-key-for-testing"))


# ── 辅助函数 ───────────────────────────────────────────────────


def _create_export_db(
    db_path: Path,
    project_count: int = 1,
    with_children: bool = False,
    project_names: list | None = None,
) -> Path:
    """创建模拟导出的 .db 文件，包含完整 ORM schema。"""
    engine = create_engine(f"sqlite:///{db_path}")

    @event.listens_for(engine, "connect")
    def _fk(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys = ON")

    Base.metadata.create_all(engine)

    with Session(engine) as session:
        with session.begin():
            user = User(username="export_user")
            session.add(user)
            session.flush()

            names = project_names or [f"项目{i + 1}" for i in range(project_count)]
            for i, name in enumerate(names):
                project = Project(name=name, version="1.0", owner_id=user.id, screening_number_format=f"SCR-{i + 1:03d}")
                session.add(project)
                session.flush()

                if with_children:
                    unit = Unit(
                        project_id=project.id,
                        symbol="kg",
                        code=f"U{i}",
                        order_index=1,
                    )
                    session.add(unit)
                    session.flush()

                    cl = CodeList(
                        project_id=project.id,
                        name="字典",
                        code=f"CL{i}",
                        order_index=1,
                    )
                    session.add(cl)
                    session.flush()

                    session.add(
                        CodeListOption(
                            codelist_id=cl.id,
                            code="1",
                            decode="选项",
                            order_index=1,
                        )
                    )
                    session.flush()

                    fd = FieldDefinition(
                        project_id=project.id,
                        variable_name=f"VAR{i}",
                        label="字段",
                        field_type="文本",
                        order_index=1,
                    )
                    session.add(fd)
                    session.flush()

                    form = Form(
                        project_id=project.id,
                        name="表单",
                        code=f"F{i}",
                        order_index=1,
                    )
                    session.add(form)
                    session.flush()

                    session.add(
                        FormField(
                            form_id=form.id,
                            field_definition_id=fd.id,
                            order_index=1,
                        )
                    )

                    visit = Visit(
                        project_id=project.id,
                        name="V1",
                        code=f"V{i}",
                        sequence=1,
                    )
                    session.add(visit)
                    session.flush()

                    session.add(
                        VisitForm(
                            visit_id=visit.id, form_id=form.id, sequence=1
                        )
                    )
                    session.flush()

    engine.dispose()
    return db_path


def _upload_db(client, endpoint: str, db_path: Path, token: str):
    """通过 multipart/form-data 上传 .db 文件。"""
    with open(db_path, "rb") as f:
        return client.post(
            endpoint,
            files={"file": ("test.db", f, "application/octet-stream")},
            headers=auth_headers(token),
        )


# ── Admin Gate 403 ─────────────────────────────────────────────


def test_import_project_db_accepts_authenticated_user(client, engine, tmp_path):
    """普通登录用户也可导入单项目，owner 需重绑到当前用户。"""
    token = login_as(client, "bob")
    db_path = _create_export_db(tmp_path / "export.db", project_count=1)
    resp = _upload_db(client, "/api/projects/import/project-db", db_path, token)
    assert resp.status_code == 200, resp.text

    data = resp.json()
    with Session(engine) as session:
        bob = session.scalar(select(User).where(User.username == "bob"))
        imported = session.get(Project, data["project_id"])
        assert bob is not None
        assert imported is not None
        assert imported.owner_id == bob.id
        assert imported.screening_number_format == "SCR-001"


def test_merge_database_accepts_authenticated_user(client, engine, tmp_path):
    """普通登录用户也可整库合并导入，owner 需重绑到当前用户。"""
    token = login_as(client, "bob")
    db_path = _create_export_db(tmp_path / "export.db", project_count=2)
    resp = _upload_db(client, "/api/projects/import/database-merge", db_path, token)
    assert resp.status_code == 200, resp.text

    imported_ids = [item["id"] for item in resp.json()["imported"]]
    with Session(engine) as session:
        bob = session.scalar(select(User).where(User.username == "bob"))
        imported_projects = session.scalars(
            select(Project).where(Project.id.in_(imported_ids)).order_by(Project.id)
        ).all()
        assert bob is not None
        assert len(imported_projects) == 2
        assert all(project.owner_id == bob.id for project in imported_projects)
        assert {project.screening_number_format for project in imported_projects} == {"SCR-001", "SCR-002"}


# ── 文件校验 ───────────────────────────────────────────────────


def test_import_rejects_non_sqlite_file(client, engine, tmp_path):
    """非 SQLite 文件应返回 400。"""
    token = login_as(client, "admin")
    fake = tmp_path / "fake.db"
    fake.write_bytes(b"This is not a SQLite file at all")
    resp = _upload_db(client, "/api/projects/import/project-db", fake, token)
    assert resp.status_code == 400
    assert "SQLite" in resp.json()["detail"]


def test_validate_schema_rejects_incomplete_db(tmp_path):
    """缺少核心表时 _validate_schema 应抛出 ValueError。"""
    db_path = tmp_path / "incomplete.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute("CREATE TABLE project (id INTEGER PRIMARY KEY)")
    conn.execute("CREATE TABLE dummy (id INTEGER PRIMARY KEY)")
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite:///{db_path}")
    session = Session(engine)
    with pytest.raises(ValueError, match="核心表"):
        _validate_schema(session)
    session.close()
    engine.dispose()


def test_import_rejects_incompatible_schema_via_endpoint(
    client, engine, tmp_path
):
    """表名齐全但关键列缺失的 .db 应返回 400，包含 detail + code（Task 4.4）。"""
    token = login_as(client, "admin")
    db_path = tmp_path / "incompatible.db"
    conn = sqlite3.connect(str(db_path))
    conn.executescript(
        """
        CREATE TABLE project (id INTEGER PRIMARY KEY);
        CREATE TABLE visit (id INTEGER PRIMARY KEY);
        CREATE TABLE form (id INTEGER PRIMARY KEY);
        CREATE TABLE visit_form (id INTEGER PRIMARY KEY);
        CREATE TABLE field_definition (id INTEGER PRIMARY KEY);
        CREATE TABLE form_field (id INTEGER PRIMARY KEY);
        CREATE TABLE codelist (id INTEGER PRIMARY KEY);
        CREATE TABLE codelist_option (id INTEGER PRIMARY KEY);
        CREATE TABLE unit (id INTEGER PRIMARY KEY);
        """
    )
    conn.commit()
    conn.close()

    with Session(engine) as session:
        before_count = len(session.scalars(select(Project)).all())

    resp = _upload_db(client, "/api/projects/import/project-db", db_path, token)
    assert resp.status_code == 400
    body = resp.json()
    assert "detail" in body
    assert "code" in body
    assert "schema" in body["detail"] or "核心表" in body["detail"]
    assert body["code"] == "IMPORT_SCHEMA_INCOMPATIBLE"

    with Session(engine) as session:
        after_count = len(session.scalars(select(Project)).all())
    assert after_count == before_count


# ── 单项目导入 ─────────────────────────────────────────────────


def test_import_single_project_owner_rebind(client, engine, tmp_path):
    """导入单项目后 owner 应重绑为当前登录的管理员用户。"""
    token = login_as(client, "admin")
    db_path = _create_export_db(
        tmp_path / "export.db",
        project_count=1,
        with_children=True,
        project_names=["导入测试"],
    )

    resp = _upload_db(client, "/api/projects/import/project-db", db_path, token)
    assert resp.status_code == 200, resp.text

    data = resp.json()
    assert data["project_name"] == "导入测试"

    with Session(engine) as session:
        admin_user = session.scalar(
            select(User).where(User.username == "admin")
        )
        imported = session.get(Project, data["project_id"])
        assert imported is not None
        assert imported.owner_id == admin_user.id
        assert imported.screening_number_format == "SCR-001"

        # 子资源完整性
        fds = session.scalars(
            select(FieldDefinition).where(
                FieldDefinition.project_id == imported.id
            )
        ).all()
        assert len(fds) >= 1


def test_import_non_single_project_zero(client, engine, tmp_path):
    """包含 0 个项目的 .db 应返回 400。"""
    token = login_as(client, "admin")
    db_path = _create_export_db(tmp_path / "zero.db", project_count=0)
    resp = _upload_db(client, "/api/projects/import/project-db", db_path, token)
    assert resp.status_code == 400
    assert "0" in resp.json()["detail"]


def test_import_non_single_project_two(client, engine, tmp_path):
    """包含 2 个项目的 .db 应返回 400。"""
    token = login_as(client, "admin")
    db_path = _create_export_db(tmp_path / "two.db", project_count=2)
    resp = _upload_db(client, "/api/projects/import/project-db", db_path, token)
    assert resp.status_code == 400
    assert "2" in resp.json()["detail"]


def test_import_single_project_name_conflict(client, engine, tmp_path):
    """同名项目导入时应自动重命名为 '_导入'（Task 4.1 新规则）。"""
    token = login_as(client, "admin")

    # 先在本库创建同名项目
    with Session(engine) as session:
        with session.begin():
            admin_user = session.scalar(
                select(User).where(User.username == "admin")
            )
            session.add(Project(name="冲突项目", version="1.0", owner_id=admin_user.id))

    db_path = _create_export_db(
        tmp_path / "export.db",
        project_count=1,
        project_names=["冲突项目"],
    )

    resp = _upload_db(client, "/api/projects/import/project-db", db_path, token)
    assert resp.status_code == 200
    assert resp.json()["project_name"] == "冲突项目_导入"


def test_import_single_project_name_conflict_increment(client, engine, tmp_path):
    """多次同名导入应递增为 '_导入2', '_导入3'..."""
    token = login_as(client, "admin")

    # 先在本库创建两个同名项目（原始 + _导入）
    with Session(engine) as session:
        with session.begin():
            admin_user = session.scalar(
                select(User).where(User.username == "admin")
            )
            session.add(Project(name="递增项目", version="1.0", owner_id=admin_user.id))
            session.add(Project(name="递增项目_导入", version="1.0", owner_id=admin_user.id))

    db_path = _create_export_db(
        tmp_path / "export.db",
        project_count=1,
        project_names=["递增项目"],
    )

    resp = _upload_db(client, "/api/projects/import/project-db", db_path, token)
    assert resp.status_code == 200
    assert resp.json()["project_name"] == "递增项目_导入2"


def test_import_single_project_ignores_deleted(client, engine, tmp_path):
    """回收站项目不占名，导入同名项目应直接使用原名（Task 4.1）。"""
    from datetime import datetime

    token = login_as(client, "admin")

    # 创建项目并软删除
    with Session(engine) as session:
        with session.begin():
            admin_user = session.scalar(
                select(User).where(User.username == "admin")
            )
            project = Project(name="回收站项目", version="1.0", owner_id=admin_user.id)
            session.add(project)
            session.flush()
            project.deleted_at = datetime.now()  # 软删除

    db_path = _create_export_db(
        tmp_path / "export.db",
        project_count=1,
        project_names=["回收站项目"],
    )

    resp = _upload_db(client, "/api/projects/import/project-db", db_path, token)
    assert resp.status_code == 200
    # 回收站项目不占名，应直接使用原名
    assert resp.json()["project_name"] == "回收站项目"


# ── 整库合并 ───────────────────────────────────────────────────


def test_merge_imports_all_projects(client, engine, tmp_path):
    """合并导入应导入所有项目并保持 owner 归属。"""
    token = login_as(client, "admin")
    db_path = _create_export_db(
        tmp_path / "export.db",
        project_count=3,
        with_children=True,
        project_names=["项目A", "项目B", "项目C"],
    )

    resp = _upload_db(client, "/api/projects/import/database-merge", db_path, token)
    assert resp.status_code == 200, resp.text

    data = resp.json()
    assert len(data["imported"]) == 3
    imported_names = {p["name"] for p in data["imported"]}
    assert imported_names == {"项目A", "项目B", "项目C"}

    with Session(engine) as session:
        admin_user = session.scalar(
            select(User).where(User.username == "admin")
        )
        imported_projects = []
        for item in data["imported"]:
            p = session.get(Project, item["id"])
            assert p is not None
            assert p.owner_id == admin_user.id
            imported_projects.append(p)
        assert {p.screening_number_format for p in imported_projects} == {"SCR-001", "SCR-002", "SCR-003"}


def test_merge_rename_on_conflict(client, engine, tmp_path):
    """合并导入重名项目时应自动重命名并返回 renamed 列表（Task 4.1 新规则）。"""
    token = login_as(client, "admin")

    with Session(engine) as session:
        with session.begin():
            admin_user = session.scalar(
                select(User).where(User.username == "admin")
            )
            session.add(Project(name="项目X", version="1.0", owner_id=admin_user.id))

    db_path = _create_export_db(
        tmp_path / "export.db",
        project_count=2,
        project_names=["项目X", "项目Y"],
    )

    resp = _upload_db(client, "/api/projects/import/database-merge", db_path, token)
    assert resp.status_code == 200

    data = resp.json()
    assert len(data["imported"]) == 2
    assert len(data["renamed"]) == 1
    assert data["renamed"][0]["original"] == "项目X"
    assert data["renamed"][0]["new"] == "项目X_导入"


def test_import_unknown_exception_returns_json(client, engine, tmp_path):
    """未知异常应返回 JSON 格式错误体，包含 detail + code（Task 4.4）。"""
    token = login_as(client, "admin")
    db_path = _create_export_db(tmp_path / "export.db", project_count=1)

    with patch(
        "src.services.project_import_service.ProjectDbImportService.import_single_project",
        side_effect=RuntimeError("模拟未知异常"),
    ):
        resp = _upload_db(client, "/api/projects/import/project-db", db_path, token)

    assert resp.status_code == 500
    # 应返回 JSON 格式，包含 detail + code 字段
    body = resp.json()
    assert "detail" in body
    assert "code" in body
    assert "导入失败" in body["detail"]
    assert body["code"] == "IMPORT_UNEXPECTED_ERROR"


def test_import_retry_idempotent(client, engine, tmp_path):
    """导入失败后重试应幂等，不产生残留（Task 4.5）。"""
    token = login_as(client, "admin")

    # 第一次：模拟失败
    db_path = _create_export_db(
        tmp_path / "export.db",
        project_count=1,
        project_names=["幂等测试"],
    )

    with Session(engine) as session:
        before_count = len(session.scalars(select(Project)).all())

    _original = ProjectCloneService.clone_from_graph
    call_count = [0]

    def _fail_once(*args, **kwargs):
        call_count[0] += 1
        if call_count[0] == 1:
            raise RuntimeError("模拟首次失败")
        return _original(*args, **kwargs)

    with patch(
        "src.services.project_import_service.ProjectCloneService.clone_from_graph",
        side_effect=_fail_once,
    ):
        resp = _upload_db(client, "/api/projects/import/project-db", db_path, token)
        assert resp.status_code == 500

    # 验证无残留
    with Session(engine) as session:
        after_fail_count = len(session.scalars(select(Project)).all())
    assert after_fail_count == before_count

    # 第二次：正常导入（重试）
    with patch.object(
        ProjectCloneService, "clone_from_graph", _original
    ):
        resp = _upload_db(client, "/api/projects/import/project-db", db_path, token)
        assert resp.status_code == 200

    # 验证成功导入且无重复
    with Session(engine) as session:
        final_count = len(session.scalars(select(Project)).all())
        imported = session.scalar(
            select(Project).where(Project.name == "幂等测试")
        )
    assert final_count == before_count + 1
    assert imported is not None


def test_merge_empty_db_returns_400(client, engine, tmp_path):
    """合并导入空项目的 .db 应返回 400。"""
    token = login_as(client, "admin")
    db_path = _create_export_db(tmp_path / "empty.db", project_count=0)
    resp = _upload_db(client, "/api/projects/import/database-merge", db_path, token)
    assert resp.status_code == 400
    assert "没有项目" in resp.json()["detail"]


def test_merge_skips_deleted_source_projects(client, engine, tmp_path):
    """整库 merge 应跳过源库中已软删除的项目，不复活。"""
    from datetime import datetime as dt

    token = login_as(client, "admin")
    db_path = tmp_path / "with_deleted.db"

    # 创建包含正常项目和已删除项目的源库
    src_engine = create_engine(f"sqlite:///{db_path}")

    @event.listens_for(src_engine, "connect")
    def _fk(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys = ON")

    Base.metadata.create_all(src_engine)

    with Session(src_engine) as s:
        with s.begin():
            user = User(username="src_user")
            s.add(user)
            s.flush()
            # 正常项目
            s.add(Project(name="正常项目", version="1.0", owner_id=user.id))
            # 已删除项目
            deleted = Project(name="已删除项目", version="1.0", owner_id=user.id)
            s.add(deleted)
            s.flush()
            deleted.deleted_at = dt.now()

    src_engine.dispose()

    resp = _upload_db(client, "/api/projects/import/database-merge", db_path, token)
    assert resp.status_code == 200, resp.text

    data = resp.json()
    imported_names = {p["name"] for p in data["imported"]}
    assert "正常项目" in imported_names
    assert "已删除项目" not in imported_names
    assert len(data["imported"]) == 1


# =============================================================================
# Task 4.5 / 4.6: 历史坏导出稳定拒绝测试
# =============================================================================


def test_import_rejects_legacy_form_field_schema(client, engine, tmp_path):
    """Task 4.5 / 4.6: 导入 legacy form_field（有 sort_order 但无 order_index）应稳定拒绝。

    验证导入服务对历史坏导出文件的拒绝行为，返回结构化错误（detail + code）。
    """
    token = login_as(client, "admin")
    db_path = tmp_path / "legacy_export.db"

    # 创建一个 legacy schema 的 .db 文件
    # 包含完整表结构，但 form_field 用 legacy sort_order 替代 order_index
    conn = sqlite3.connect(str(db_path))
    conn.executescript(
        """
        CREATE TABLE project (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            version TEXT
        );
        CREATE TABLE visit (
            id INTEGER PRIMARY KEY,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            code TEXT NOT NULL,
            sequence INTEGER NOT NULL
        );
        CREATE TABLE form (
            id INTEGER PRIMARY KEY,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            code TEXT NOT NULL,
            order_index INTEGER NOT NULL
        );
        CREATE TABLE visit_form (
            id INTEGER PRIMARY KEY,
            visit_id INTEGER NOT NULL,
            form_id INTEGER NOT NULL,
            sequence INTEGER NOT NULL
        );
        CREATE TABLE field_definition (
            id INTEGER PRIMARY KEY,
            project_id INTEGER NOT NULL,
            variable_name TEXT NOT NULL,
            label TEXT NOT NULL,
            field_type TEXT NOT NULL,
            order_index INTEGER NOT NULL
        );
        -- Legacy form_field: 使用 sort_order 而非 order_index
        CREATE TABLE form_field (
            id INTEGER PRIMARY KEY,
            form_id INTEGER NOT NULL,
            field_definition_id INTEGER NOT NULL,
            sort_order INTEGER NOT NULL,
            required INTEGER DEFAULT 1
        );
        CREATE TABLE codelist (
            id INTEGER PRIMARY KEY,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            code TEXT NOT NULL,
            order_index INTEGER NOT NULL
        );
        CREATE TABLE codelist_option (
            id INTEGER PRIMARY KEY,
            codelist_id INTEGER NOT NULL,
            code TEXT NOT NULL,
            decode TEXT NOT NULL,
            order_index INTEGER NOT NULL,
            trailing_underscore TEXT
        );
        CREATE TABLE unit (
            id INTEGER PRIMARY KEY,
            project_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            code TEXT NOT NULL,
            order_index INTEGER NOT NULL
        );

        -- 插入一个完整的项目数据
        INSERT INTO project (id, name, version) VALUES (1, '历史项目', '1.0');
        INSERT INTO visit (id, project_id, name, code, sequence) VALUES (1, 1, 'V1', 'V1', 1);
        INSERT INTO form (id, project_id, name, code, order_index) VALUES (1, 1, '表单1', 'F1', 1);
        INSERT INTO visit_form (id, visit_id, form_id, sequence) VALUES (1, 1, 1, 1);
        INSERT INTO field_definition (id, project_id, variable_name, label, field_type, order_index)
            VALUES (1, 1, 'VAR1', '字段1', '文本', 1);
        INSERT INTO form_field (id, form_id, field_definition_id, sort_order, required)
            VALUES (1, 1, 1, 1, 1);
        """
    )
    conn.commit()
    conn.close()

    with Session(engine) as session:
        before_count = len(session.scalars(select(Project)).all())

    # 尝试导入该 legacy .db 文件
    resp = _upload_db(client, "/api/projects/import/project-db", db_path, token)

    # 应返回 400 结构化错误
    assert resp.status_code == 400
    body = resp.json()
    assert "detail" in body
    assert "code" in body
    # form_field 缺少 order_index 列
    assert "form_field" in body["detail"] and ("order_index" in body["detail"] or "缺少列" in body["detail"])
    assert body["code"] == "IMPORT_SCHEMA_INCOMPATIBLE"

    # 验证零残留
    with Session(engine) as session:
        after_count = len(session.scalars(select(Project)).all())
    assert after_count == before_count, "导入失败不应产生新项目"


# ── 原子性 ─────────────────────────────────────────────────────


def test_merge_atomicity_on_failure(client, engine, tmp_path):
    """合并过程中第二个项目失败时应回滚全部变更（零变更）。"""
    token = login_as(client, "admin")
    db_path = _create_export_db(
        tmp_path / "export.db",
        project_count=2,
        project_names=["原子A", "原子B"],
    )

    with Session(engine) as session:
        before_count = len(session.scalars(select(Project)).all())

    _original = ProjectCloneService.clone_from_graph
    call_count = [0]

    def _fail_on_second(*args, **kwargs):
        call_count[0] += 1
        if call_count[0] >= 2:
            raise RuntimeError("模拟克隆失败")
        return _original(*args, **kwargs)

    with patch(
        "src.services.project_import_service.ProjectCloneService.clone_from_graph",
        side_effect=_fail_on_second,
    ):
        resp = _upload_db(
            client, "/api/projects/import/database-merge", db_path, token
        )

    assert resp.status_code == 500

    with Session(engine) as session:
        after_count = len(session.scalars(select(Project)).all())
    assert after_count == before_count, "合并失败后不应有新增项目"


# =============================================================================
# Task 4.1: form_field 重建保留约束测试
# =============================================================================


def test_form_field_rebuild_preserves_constraints(tmp_path: Path) -> None:
    """Task 4.1: 重建 form_field 表时保留主键、外键、NOT NULL 约束"""
    from src.database import _rebuild_form_field_without_sort_order
    from sqlalchemy import inspect

    # 创建一个带有 legacy sort_order 列的数据库
    db_path = tmp_path / "legacy.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(engine)

    # 手动添加 sort_order 列（模拟 legacy schema）
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE form_field ADD COLUMN sort_order INTEGER"))

    # 添加测试数据
    with Session(engine) as session:
        project = Project(name="测试项目", version="v1.0")
        session.add(project)
        session.flush()

        form = Form(project_id=project.id, name="测试表单")
        session.add(form)
        session.flush()

        fd = FieldDefinition(
            project_id=project.id,
            variable_name="TEST",
            label="测试字段",
            field_type="文本",
        )
        session.add(fd)
        session.flush()

        # 添加 form_field（带 legacy sort_order）
        ff = FormField(
            form_id=form.id,
            field_definition_id=fd.id,
            order_index=1,
        )
        session.add(ff)
        session.commit()

    # 执行重建迁移
    insp = inspect(engine)
    with engine.begin() as conn:
        _rebuild_form_field_without_sort_order(conn, insp)

    # 验证约束保留
    insp_after = inspect(engine)

    # 1. 主键检查
    pk = insp_after.get_pk_constraint("form_field")
    assert pk["constrained_columns"] == ["id"], "主键应保留"

    # 2. 外键检查
    fks = insp_after.get_foreign_keys("form_field")
    fk_names = {fk["referred_table"] for fk in fks}
    assert "form" in fk_names, "form_id 外键应保留"
    assert "field_definition" in fk_names, "field_definition_id 外键应保留"

    # 3. NOT NULL 约束检查
    cols = insp_after.get_columns("form_field")
    order_index_col = next(c for c in cols if c["name"] == "order_index")
    assert order_index_col["nullable"] is False, "order_index NOT NULL 应保留"

    # 4. sort_order 列已移除
    col_names = {c["name"] for c in cols}
    assert "sort_order" not in col_names, "sort_order 列应已移除"

    # 5. 数据完整性
    with Session(engine) as session:
        ffs = session.scalars(select(FormField)).all()
        assert len(ffs) == 1
        assert ffs[0].order_index == 1


# =============================================================================
# rowid 兼容性判定边缘用例
# =============================================================================


@pytest.mark.parametrize(
    "id_ddl,expected",
    [
        ("id INTEGER PRIMARY KEY", True),
        ("id INTEGER NOT NULL PRIMARY KEY", True),
        ("id INT PRIMARY KEY", False),
        ("id BIGINT PRIMARY KEY", False),
        ("id INTEGER PRIMARY KEY DESC", False),
    ],
    ids=[
        "INTEGER_PK_inline",
        "INTEGER_NOT_NULL_PK",
        "INT_PK_not_rowid",
        "BIGINT_PK_not_rowid",
        "INTEGER_PK_DESC",
    ],
)
def test_rowid_pk_detection_variants(tmp_path: Path, id_ddl: str, expected: bool) -> None:
    """_is_form_field_rowid_pk_compatible 应精确区分 rowid alias 与非 rowid 主键。"""
    from src.database import _is_form_field_rowid_pk_compatible

    db_path = tmp_path / "variant.db"
    import sqlite3
    conn = sqlite3.connect(str(db_path))
    conn.execute(f"""
        CREATE TABLE form_field (
            {id_ddl},
            form_id INTEGER NOT NULL,
            field_definition_id INTEGER,
            order_index INTEGER NOT NULL DEFAULT 1
        )
    """)
    conn.commit()
    conn.close()

    eng = create_engine(f"sqlite:///{db_path}")
    assert _is_form_field_rowid_pk_compatible(eng) is expected
    eng.dispose()


def test_rowid_pk_detection_table_level_pk(tmp_path: Path) -> None:
    """表级 PRIMARY KEY(id) + INTEGER 类型应被判为兼容。"""
    from src.database import _is_form_field_rowid_pk_compatible

    db_path = tmp_path / "table_pk.db"
    import sqlite3
    conn = sqlite3.connect(str(db_path))
    conn.execute("""
        CREATE TABLE form_field (
            id INTEGER NOT NULL,
            form_id INTEGER NOT NULL,
            field_definition_id INTEGER,
            order_index INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (id)
        )
    """)
    conn.commit()
    conn.close()

    eng = create_engine(f"sqlite:///{db_path}")
    assert _is_form_field_rowid_pk_compatible(eng) is True
    eng.dispose()


def test_rowid_pk_detection_without_rowid(tmp_path: Path) -> None:
    """WITHOUT ROWID 表应被判为不兼容。"""
    from src.database import _is_form_field_rowid_pk_compatible

    db_path = tmp_path / "without_rowid.db"
    import sqlite3
    conn = sqlite3.connect(str(db_path))
    conn.execute("""
        CREATE TABLE form_field (
            id INTEGER PRIMARY KEY,
            form_id INTEGER NOT NULL,
            field_definition_id INTEGER,
            order_index INTEGER NOT NULL DEFAULT 1
        ) WITHOUT ROWID
    """)
    conn.commit()
    conn.close()

    eng = create_engine(f"sqlite:///{db_path}")
    assert _is_form_field_rowid_pk_compatible(eng) is False
    eng.dispose()


# =============================================================================
# Task 4.2: 导出导入回环测试（根因回归验证）
# =============================================================================


def test_import_rejects_host_form_field_non_rowid_pk(client, engine, tmp_path: Path) -> None:
    """宿主库 form_field 主键语义漂移时，应前置拒绝导入并返回结构化错误。"""
    token = login_as(client, "admin")
    db_path = _create_export_db(
        tmp_path / "export.db",
        project_count=1,
        with_children=True,
        project_names=["宿主库漂移测试"],
    )

    with engine.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys = OFF"))
        conn.execute(text("""
            CREATE TABLE form_field_broken (
                id BIGINT PRIMARY KEY,
                form_id INTEGER NOT NULL REFERENCES form(id) ON DELETE CASCADE,
                field_definition_id INTEGER REFERENCES field_definition(id) ON DELETE CASCADE,
                is_log_row INTEGER NOT NULL DEFAULT 0,
                order_index INTEGER NOT NULL DEFAULT 1,
                required INTEGER NOT NULL DEFAULT 0,
                label_override VARCHAR(255),
                help_text VARCHAR(255),
                default_value TEXT,
                inline_mark INTEGER NOT NULL DEFAULT 0,
                bg_color VARCHAR(10),
                text_color VARCHAR(10),
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text(
            "INSERT INTO form_field_broken "
            "SELECT id, form_id, field_definition_id, is_log_row, order_index, required, "
            "label_override, help_text, default_value, inline_mark, bg_color, text_color, "
            "created_at, updated_at FROM form_field"
        ))
        conn.execute(text("DROP TABLE form_field"))
        conn.execute(text("ALTER TABLE form_field_broken RENAME TO form_field"))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_form_field "
            "ON form_field(form_id, field_definition_id)"
        ))
        conn.execute(text("PRAGMA foreign_keys = ON"))

    resp = _upload_db(client, "/api/projects/import/project-db", db_path, token)
    assert resp.status_code == 400
    body = resp.json()
    assert body["code"] == "IMPORT_SCHEMA_INCOMPATIBLE"
    assert "form_field 主键结构不兼容" in body["detail"]



def test_import_rejects_db_missing_project_orm_columns(client, engine, tmp_path):
    """缺少 Project ORM 实际读取列时，应稳定返回 schema incompatible。"""
    token = login_as(client, "admin")
    db_path = tmp_path / "missing_project_columns.db"
    conn = sqlite3.connect(str(db_path))
    conn.executescript(
        """
        CREATE TABLE user (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL,
            hashed_password TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE project (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            version TEXT NOT NULL,
            screening_number_format TEXT
        );
        CREATE TABLE visit (
            id INTEGER PRIMARY KEY,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            code TEXT,
            sequence INTEGER NOT NULL
        );
        CREATE TABLE form (
            id INTEGER PRIMARY KEY,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            code TEXT,
            domain TEXT,
            order_index INTEGER,
            design_notes TEXT
        );
        CREATE TABLE visit_form (
            id INTEGER PRIMARY KEY,
            visit_id INTEGER NOT NULL,
            form_id INTEGER NOT NULL,
            sequence INTEGER NOT NULL
        );
        CREATE TABLE field_definition (
            id INTEGER PRIMARY KEY,
            project_id INTEGER NOT NULL,
            variable_name TEXT NOT NULL,
            label TEXT NOT NULL,
            field_type TEXT NOT NULL,
            integer_digits INTEGER,
            decimal_digits INTEGER,
            date_format TEXT,
            codelist_id INTEGER,
            unit_id INTEGER,
            is_multi_record INTEGER NOT NULL DEFAULT 0,
            table_type TEXT NOT NULL DEFAULT '固定行',
            order_index INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE form_field (
            id INTEGER PRIMARY KEY,
            form_id INTEGER NOT NULL,
            field_definition_id INTEGER,
            is_log_row INTEGER NOT NULL DEFAULT 0,
            order_index INTEGER NOT NULL DEFAULT 1,
            required INTEGER NOT NULL DEFAULT 0,
            label_override TEXT,
            help_text TEXT,
            default_value TEXT,
            inline_mark INTEGER NOT NULL DEFAULT 0,
            bg_color TEXT,
            text_color TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE codelist (
            id INTEGER PRIMARY KEY,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            code TEXT,
            description TEXT,
            order_index INTEGER
        );
        CREATE TABLE codelist_option (
            id INTEGER PRIMARY KEY,
            codelist_id INTEGER NOT NULL,
            code TEXT,
            decode TEXT NOT NULL,
            order_index INTEGER,
            trailing_underscore INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE unit (
            id INTEGER PRIMARY KEY,
            project_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            code TEXT,
            order_index INTEGER
        );
        INSERT INTO user (id, username) VALUES (1, 'export_user');
        INSERT INTO project (id, name, version, screening_number_format) VALUES (1, '缺列项目', '1.0', 'LEGACY-SCR');
        """
    )
    conn.commit()
    conn.close()

    resp = _upload_db(client, "/api/projects/import/project-db", db_path, token)
    assert resp.status_code == 400
    body = resp.json()
    assert body["code"] == "IMPORT_SCHEMA_INCOMPATIBLE"
    assert "project 缺少列" in body["detail"]
    assert "order_index" in body["detail"]



def test_project_order_index_migration_is_idempotent(engine):
    """已有项目排序不应在重复执行迁移时被重置。"""
    with Session(engine) as session:
        with session.begin():
            user = User(username="sort_owner")
            session.add(user)
            session.flush()
            session.add_all([
                Project(name="项目A", version="1.0", owner_id=user.id, order_index=20),
                Project(name="项目B", version="1.0", owner_id=user.id, order_index=10),
            ])

    _migrate_project_soft_delete_and_ordering(engine)

    with Session(engine) as session:
        projects = session.scalars(
            select(Project).where(Project.owner_id.is_not(None)).order_by(Project.id)
        ).all()

    assert [project.order_index for project in projects] == [20, 10]



def test_startup_auto_heals_broken_form_field_and_import_succeeds(tmp_path: Path) -> None:
    """startup 自愈：init_db 应修复坏 form_field schema，修复后导入成功。"""
    from unittest.mock import patch as mock_patch
    from src.config import AppConfig, AuthConfig
    from src.database import init_db, get_engine, _is_form_field_rowid_pk_compatible

    from src.config import DatabaseConfig

    db_path = tmp_path / "startup_heal.db"
    test_config = AppConfig(
        database=DatabaseConfig(path=str(db_path)),
        auth=AuthConfig(secret_key="test-secret-key-for-testing"),
    )

    # 1. 用 init_db 创建正常库
    import src.database as db_mod
    old_engine = db_mod._engine
    db_mod._engine = None
    try:
        with mock_patch("src.database.get_config", return_value=test_config):
            init_db()
            eng = get_engine()

            # 2. 破坏 form_field 主键
            with eng.begin() as conn:
                conn.execute(text("PRAGMA foreign_keys = OFF"))
                conn.execute(text("""
                    CREATE TABLE form_field_broken (
                        id BIGINT PRIMARY KEY,
                        form_id INTEGER NOT NULL,
                        field_definition_id INTEGER,
                        is_log_row INTEGER NOT NULL DEFAULT 0,
                        order_index INTEGER NOT NULL DEFAULT 1,
                        required INTEGER NOT NULL DEFAULT 0,
                        label_override VARCHAR(255),
                        help_text VARCHAR(255),
                        default_value TEXT,
                        inline_mark INTEGER NOT NULL DEFAULT 0,
                        bg_color VARCHAR(10),
                        text_color VARCHAR(10),
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.execute(text(
                    "INSERT INTO form_field_broken "
                    "SELECT * FROM form_field"
                ))
                conn.execute(text("DROP TABLE form_field"))
                conn.execute(text("ALTER TABLE form_field_broken RENAME TO form_field"))
                conn.execute(text("PRAGMA foreign_keys = ON"))

            assert not _is_form_field_rowid_pk_compatible(eng)

            # 3. 重新 init_db 模拟 startup 自愈
            init_db()
            assert _is_form_field_rowid_pk_compatible(eng)

            # 4. 验证修复后可以正常插入 FormField
            with Session(eng) as session:
                with session.begin():
                    user = User(username="heal_user")
                    session.add(user)
                    session.flush()
                    project = Project(name="自愈测试", version="1.0", owner_id=user.id)
                    session.add(project)
                    session.flush()
                    form = Form(project_id=project.id, name="表单", order_index=1)
                    session.add(form)
                    session.flush()
                    fd = FieldDefinition(
                        project_id=project.id,
                        variable_name="HEAL",
                        label="字段",
                        field_type="文本",
                        order_index=1,
                    )
                    session.add(fd)
                    session.flush()
                    ff = FormField(
                        form_id=form.id,
                        field_definition_id=fd.id,
                        order_index=1,
                    )
                    session.add(ff)
                    session.flush()
                    assert ff.id is not None
    finally:
        db_mod._engine = old_engine



def test_export_import_roundtrip_no_null_identity_key(client, engine, tmp_path: Path) -> None:
    """Task 4.2: 新导出项目 `.db` 可再导入，不再触发 FormField NULL identity key"""
    from src.services.export_service import export_project_database

    # 1. 在宿主数据库中创建项目（包含 form_field）
    token = login_as(client, "admin")
    db_path = tmp_path / "host.db"

    # 复制当前宿主数据库结构到临时文件
    engine_copy = create_engine(f"sqlite:///{db_path}")

    @event.listens_for(engine_copy, "connect")
    def _fk(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys = ON")

    Base.metadata.create_all(engine_copy)

    with Session(engine_copy) as session:
        with session.begin():
            user = User(username="test_user")
            session.add(user)
            session.flush()

            project = Project(name="回环测试项目", version="1.0", owner_id=user.id)
            session.add(project)
            session.flush()

            form = Form(project_id=project.id, name="测试表单", order_index=1)
            session.add(form)
            session.flush()

            fd = FieldDefinition(
                project_id=project.id,
                variable_name="TEST_VAR",
                label="测试字段",
                field_type="文本",
                order_index=1,
            )
            session.add(fd)
            session.flush()

            # 创建 form_field（确保 order_index 存在）
            ff = FormField(
                form_id=form.id,
                field_definition_id=fd.id,
                order_index=1,
                required=1,
            )
            session.add(ff)

            visit = Visit(project_id=project.id, name="V1", sequence=1)
            session.add(visit)
            session.flush()

            session.add(VisitForm(visit_id=visit.id, form_id=form.id, sequence=1))

            # 保存 project.id 和 project.name 供后续使用（避免 DetachedInstanceError）
            project_id = project.id
            project_name = project.name

    # 2. 导出该项目
    exported_path = export_project_database(str(db_path), project_id, project_name)

    # 验证导出文件存在且非空
    assert Path(exported_path).exists()
    assert Path(exported_path).stat().st_size > 0

    # 验证导出的 .db 包含正确的 form_field 结构
    with sqlite3.connect(exported_path) as conn:
        cols = conn.execute("PRAGMA table_info(form_field)").fetchall()
        col_names = [c[1] for c in cols]
        assert "order_index" in col_names, "导出的 .db 应包含 order_index 列"
        assert "sort_order" not in col_names, "导出的 .db 不应包含 legacy sort_order 列"

        # 验证 form_field 数据存在
        count = conn.execute("SELECT COUNT(*) FROM form_field").fetchone()[0]
        assert count == 1, "导出的 .db 应包含 form_field 数据"

    # 3. 导入该导出的 `.db` 文件
    resp = _upload_db(client, "/api/projects/import/project-db", Path(exported_path), token)
    assert resp.status_code == 200, f"导入失败: {resp.text}"

    data = resp.json()
    assert data["project_name"].startswith("回环测试项目")

    # 4. 验证导入成功且数据完整
    with Session(engine) as session:
        imported_project = session.scalar(
            select(Project).where(Project.name.startswith("回环测试项目"))
        )
        assert imported_project is not None, "导入的项目应存在"

        imported_forms = session.scalars(
            select(Form).where(Form.project_id == imported_project.id)
        ).all()
        assert len(imported_forms) == 1, "导入的表单应存在"

        imported_fds = session.scalars(
            select(FieldDefinition).where(FieldDefinition.project_id == imported_project.id)
        ).all()
        assert len(imported_fds) == 1, "导入的字段定义应存在"

        imported_ffs = session.scalars(
            select(FormField).where(FormField.form_id == imported_forms[0].id)
        ).all()
        assert len(imported_ffs) == 1, "导入的 form_field 应存在"

        # 关键验证：order_index 存在且有效（非 NULL）
        imported_ff = imported_ffs[0]
        assert imported_ff.order_index is not None, "order_index 应非 NULL"
        assert imported_ff.order_index == 1, "order_index 应保持原值"

        # 验证 id 生成成功（非 NULL identity key）
        assert imported_ff.id is not None, "FormField id 应成功生成"

    engine_copy.dispose()
    # 清理临时导出文件（Windows 可能因文件锁定失败，忽略即可）
    try:
        if Path(exported_path).exists():
            Path(exported_path).unlink()
    except PermissionError:
        pass  # Windows 文件锁定，忽略
