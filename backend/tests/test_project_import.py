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
                project = Project(name=name, version="1.0", owner_id=user.id)
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
    """表名齐全但关键列缺失的 .db 应返回 400，且不写入任何项目。"""
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
    assert "schema" in resp.json()["detail"] or "核心表" in resp.json()["detail"]

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
    """同名项目导入时应自动重命名为 "(导入1)"。"""
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
    assert resp.json()["project_name"] == "冲突项目 (导入1)"


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
        for item in data["imported"]:
            p = session.get(Project, item["id"])
            assert p is not None
            assert p.owner_id == admin_user.id


def test_merge_rename_on_conflict(client, engine, tmp_path):
    """合并导入重名项目时应自动重命名并返回 renamed 列表。"""
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
    assert data["renamed"][0]["new"] == "项目X (导入1)"


def test_merge_empty_db_returns_400(client, engine, tmp_path):
    """合并导入空项目的 .db 应返回 400。"""
    token = login_as(client, "admin")
    db_path = _create_export_db(tmp_path / "empty.db", project_count=0)
    resp = _upload_db(client, "/api/projects/import/database-merge", db_path, token)
    assert resp.status_code == 400
    assert "没有项目" in resp.json()["detail"]


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
