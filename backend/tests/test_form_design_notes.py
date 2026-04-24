"""表单设计备注 (design_notes) 集成测试

验证 design_notes 字段的完整 CRUD 生命周期：
- 创建表单时不含 design_notes（默认为 null）
- 更新表单 design_notes
- 列表接口返回 design_notes
- 复制表单时继承 design_notes
"""
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from helpers import auth_headers, login_as
from main import app
from src.config import AdminConfig, AppConfig, AuthConfig
from src.database import get_session
from src.models import Base

_TEST_CONFIG = AppConfig(
    auth=AuthConfig(secret_key="test-secret-key-for-testing"),
    admin=AdminConfig(username="admin"),
)


@pytest.fixture
def engine():
    """内存 SQLite 引擎，允许跨线程访问（TestClient 在独立线程跑 ASGI）。"""
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
    """TestClient，依赖注入替换为内存 Session。

    模仿 get_session 的事务模式：每次请求一个独立事务。
    """

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
    """创建一个测试用项目，返回 project_id。"""
    resp = client.post("/api/projects", json={"name": "test_project", "version": "1.0"})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def form_id(client: TestClient, project_id: int) -> int:
    """创建一个测试用表单，返回 form_id。"""
    resp = client.post(f"/api/projects/{project_id}/forms", json={"name": "TestForm"})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# ── 测试用例 ───────────────────────────────────────────────


def test_create_form_design_notes_defaults_to_none(client: TestClient, project_id: int):
    """新建表单，design_notes 应为 null。"""
    resp = client.post(f"/api/projects/{project_id}/forms", json={"name": "FormA"})
    assert resp.status_code == 201
    data = resp.json()
    assert "design_notes" in data
    assert data["design_notes"] is None


def test_update_form_design_notes(client: TestClient, form_id: int):
    """PUT 更新 design_notes 后应持久化。"""
    notes = "这是一段设计备注\n换行测试"
    resp = client.put(f"/api/forms/{form_id}", json={"design_notes": notes})
    assert resp.status_code == 200
    assert resp.json()["design_notes"] == notes


def test_update_form_design_notes_to_empty(client: TestClient, form_id: int):
    """design_notes 可以被清空为空字符串。"""
    # 先写入
    client.put(f"/api/forms/{form_id}", json={"design_notes": "初始备注"})
    # 再清空
    resp = client.put(f"/api/forms/{form_id}", json={"design_notes": ""})
    assert resp.status_code == 200
    assert resp.json()["design_notes"] == ""


def test_list_forms_includes_design_notes(client: TestClient, project_id: int, form_id: int):
    """GET 列表接口应返回 design_notes 字段。"""
    notes = "列表测试备注"
    client.put(f"/api/forms/{form_id}", json={"design_notes": notes})

    resp = client.get(f"/api/projects/{project_id}/forms")
    assert resp.status_code == 200
    forms = resp.json()
    matched = [f for f in forms if f["id"] == form_id]
    assert len(matched) == 1
    assert matched[0]["design_notes"] == notes


def test_copy_form_inherits_design_notes(client: TestClient, form_id: int):
    """POST copy 应将 design_notes 复制到新表单。"""
    original_notes = "复制备注测试"
    client.put(f"/api/forms/{form_id}", json={"design_notes": original_notes})

    resp = client.post(f"/api/forms/{form_id}/copy")
    assert resp.status_code == 201
    copied = resp.json()
    assert copied["id"] != form_id
    assert copied["design_notes"] == original_notes


def test_update_other_fields_does_not_clear_design_notes(client: TestClient, form_id: int):
    """更新 name 等其他字段时，design_notes 应保持不变（exclude_unset 验证）。"""
    notes = "不应被清除的备注"
    client.put(f"/api/forms/{form_id}", json={"design_notes": notes})

    # 只更新 name
    resp = client.put(f"/api/forms/{form_id}", json={"name": "RenamedForm"})
    assert resp.status_code == 200
    assert resp.json()["design_notes"] == notes
