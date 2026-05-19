"""表单纸张方向 (paper_orientation) 集成测试

覆盖：
- 默认值 'auto'
- PUT 持久化与非法值 422
- copy_form / project clone 继承
- 数据库轻量迁移：旧库无列也可启动
- 模板导入兼容性：缺列模板会自动补齐
"""
import sqlite3
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from helpers import auth_headers, login_as
from main import app
from src.config import AdminConfig, AppConfig, AuthConfig
from src.database import (
    _migrate_add_form_paper_orientation,
    get_session,
)
from src.models import Base
from src.services.import_service import ImportService

_TEST_CONFIG = AppConfig(
    auth=AuthConfig(secret_key="test-secret-key-for-testing"),
    admin=AdminConfig(username="admin"),
)


@pytest.fixture
def engine():
    _engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(_engine, "connect")
    def _enable_fk(dbapi_conn, connection_record):
        dbapi_conn.execute("PRAGMA foreign_keys = ON")

    Base.metadata.create_all(_engine)
    yield _engine
    _engine.dispose()


@pytest.fixture
def client(engine):
    def _override():
        with Session(engine) as session:
            with session.begin():
                yield session

    app.dependency_overrides[get_session] = _override
    with patch("main.get_config", return_value=_TEST_CONFIG), \
         patch("src.database.get_config", return_value=_TEST_CONFIG), \
         patch("src.services.auth_service.get_config", return_value=_TEST_CONFIG), \
         patch("src.services.user_admin_service.get_config", return_value=_TEST_CONFIG), \
         patch("src.routers.admin.get_config", return_value=_TEST_CONFIG), \
         patch("main.init_db"):
        with TestClient(app, raise_server_exceptions=False) as c:
            token = login_as(c, "alice")
            c.headers.update(auth_headers(token))
            yield c
    app.dependency_overrides.clear()


@pytest.fixture
def project_id(client: TestClient) -> int:
    resp = client.post("/api/projects", json={"name": "test_project", "version": "1.0"})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def form_id(client: TestClient, project_id: int) -> int:
    resp = client.post(f"/api/projects/{project_id}/forms", json={"name": "OrientForm"})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ── 基础 schema/路由 ───────────────────────────────────────────


def test_create_form_default_paper_orientation_auto(client: TestClient, project_id: int):
    resp = client.post(f"/api/projects/{project_id}/forms", json={"name": "FormA"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["paper_orientation"] == "auto"


def test_update_form_paper_orientation_landscape(client: TestClient, form_id: int):
    resp = client.put(f"/api/forms/{form_id}", json={"paper_orientation": "landscape"})
    assert resp.status_code == 200
    assert resp.json()["paper_orientation"] == "landscape"


def test_update_form_paper_orientation_portrait(client: TestClient, form_id: int):
    resp = client.put(f"/api/forms/{form_id}", json={"paper_orientation": "portrait"})
    assert resp.status_code == 200
    assert resp.json()["paper_orientation"] == "portrait"


def test_update_form_paper_orientation_invalid_returns_422(client: TestClient, form_id: int):
    resp = client.put(f"/api/forms/{form_id}", json={"paper_orientation": "diagonal"})
    assert resp.status_code == 422


def test_list_forms_includes_paper_orientation(client: TestClient, project_id: int, form_id: int):
    client.put(f"/api/forms/{form_id}", json={"paper_orientation": "landscape"})
    resp = client.get(f"/api/projects/{project_id}/forms")
    assert resp.status_code == 200
    matched = [f for f in resp.json() if f["id"] == form_id]
    assert matched and matched[0]["paper_orientation"] == "landscape"


def test_copy_form_inherits_paper_orientation(client: TestClient, form_id: int):
    client.put(f"/api/forms/{form_id}", json={"paper_orientation": "portrait"})
    resp = client.post(f"/api/forms/{form_id}/copy")
    assert resp.status_code == 201
    assert resp.json()["paper_orientation"] == "portrait"


def test_update_other_fields_does_not_clear_paper_orientation(client: TestClient, form_id: int):
    client.put(f"/api/forms/{form_id}", json={"paper_orientation": "landscape"})
    resp = client.put(f"/api/forms/{form_id}", json={"name": "Renamed"})
    assert resp.status_code == 200
    assert resp.json()["paper_orientation"] == "landscape"


# ── 轻量迁移 ─────────────────────────────────────────────────


def test_migration_adds_paper_orientation_to_legacy_form_table(tmp_path: Path):
    """老库（form 表无 paper_orientation 列）启动迁移后应自动补齐 'auto' 默认值。"""
    db_path = tmp_path / "legacy.db"
    legacy = sqlite3.connect(str(db_path))
    legacy.execute(
        "CREATE TABLE form (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, name VARCHAR(255) NOT NULL)"
    )
    legacy.execute("INSERT INTO form (id, project_id, name) VALUES (1, 1, 'OldForm')")
    legacy.commit()
    legacy.close()

    eng = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    _migrate_add_form_paper_orientation(eng)

    insp = inspect(eng)
    cols = {c["name"]: c for c in insp.get_columns("form")}
    assert "paper_orientation" in cols
    with eng.connect() as conn:
        row = conn.execute(text("SELECT paper_orientation FROM form WHERE id = 1")).scalar()
    assert row == "auto"


def test_migration_is_idempotent(tmp_path: Path):
    db_path = tmp_path / "already.db"
    eng = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    Base.metadata.create_all(eng)
    _migrate_add_form_paper_orientation(eng)
    _migrate_add_form_paper_orientation(eng)
    insp = inspect(eng)
    cols = [c["name"] for c in insp.get_columns("form")]
    assert cols.count("paper_orientation") == 1


# ── 模板导入兼容性 ───────────────────────────────────────────


def test_ensure_template_paper_orientation_patches_legacy_template(tmp_path: Path):
    """旧模板缺 paper_orientation 列时，_ensure_template_paper_orientation 自动补齐。"""
    db_path = tmp_path / "tpl.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        "CREATE TABLE form (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, name VARCHAR(255) NOT NULL)"
    )
    conn.execute("INSERT INTO form (id, project_id, name) VALUES (1, 1, 'OldForm')")
    conn.commit()
    conn.close()

    ImportService._ensure_template_paper_orientation(str(db_path))

    conn = sqlite3.connect(str(db_path))
    cols = {row[1] for row in conn.execute("PRAGMA table_info(form)").fetchall()}
    conn.close()
    assert "paper_orientation" in cols


def test_ensure_template_paper_orientation_skips_when_present(tmp_path: Path):
    db_path = tmp_path / "ok.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        "CREATE TABLE form (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, "
        "name VARCHAR(255) NOT NULL, paper_orientation VARCHAR(16) NOT NULL DEFAULT 'auto')"
    )
    conn.commit()
    conn.close()

    # 应保持幂等不抛错
    ImportService._ensure_template_paper_orientation(str(db_path))
    ImportService._ensure_template_paper_orientation(str(db_path))
