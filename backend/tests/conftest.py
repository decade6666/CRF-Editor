"""共享测试夹具。"""

import sys
import warnings
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

warnings.filterwarnings(
    "ignore",
    message="Please use `import python_multipart` instead.",
    category=PendingDeprecationWarning,
)

from main import app
from src.config import AppConfig, AdminConfig, AuthConfig
from src.database import get_session
from src.models import Base

# 测试用配置：只固定有效 secret_key，其余字段走默认值。
_TEST_CONFIG = AppConfig(
    auth=AuthConfig(secret_key="test-secret-key-for-testing"),
    admin=AdminConfig(username="admin"),
)


@pytest.fixture
def engine():
    """内存 SQLite 引擎，开启外键并允许跨线程访问。"""
    _engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(_engine, "connect")
    def _configure(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys = ON")

    Base.metadata.create_all(_engine)
    yield _engine
    _engine.dispose()


@pytest.fixture
def client(engine):
    """TestClient：注入内存 Session，并 patch 配置以通过 startup 校验。"""

    def _override():
        with Session(engine) as session:
            with session.begin():
                yield session

    app.dependency_overrides[get_session] = _override

    with patch("main.get_config", return_value=_TEST_CONFIG), \
         patch("src.database.get_config", return_value=_TEST_CONFIG), \
         patch("src.services.auth_service.get_config", return_value=_TEST_CONFIG), \
         patch("src.dependencies.get_config", return_value=_TEST_CONFIG), \
         patch("src.routers.admin.get_config", return_value=_TEST_CONFIG), \
         patch("main.init_db"):
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c

    app.dependency_overrides.clear()
