"""共享测试夹具。"""

import atexit
import functools
import os
import secrets
import shutil
import sys
import tempfile
import warnings
from collections.abc import Iterator
from pathlib import Path
from unittest.mock import patch

# 后台任务开关必须在 import main 之前设置：TestClient 会真实执行 lifespan，
# 若不禁用，循环会连真实 crf_editor.db 执行不可逆删除。
os.environ.setdefault("CRF_DISABLE_BACKGROUND_JOBS", "1")

# 测试会话专用根目录：数据库、上传、截图、Word 导入临时文件的运行时路径
# 全部落在这里，绝不触碰仓库内的真实数据库 / 配置 / 上传目录。
# atexit 兜底清理：collect-only / 部分运行 / -k 反选等不会请求 test_root
# 夹具的调用路径也保证删除；夹具内的 rmtree 提前执行，二者幂等共存。
TEST_ROOT = Path(tempfile.mkdtemp(prefix="crf-editor-tests-"))
UPLOAD_DIR = TEST_ROOT / "uploads"
atexit.register(functools.partial(shutil.rmtree, TEST_ROOT, ignore_errors=True))
# 强制覆盖（赋值而非 setdefault）：不受开发者 shell 里同名环境变量的影响；
# get_config 在 import main 时首次求值并缓存，必须在此之前设置完毕。
os.environ["CRF_DATABASE_PATH"] = str(TEST_ROOT / "crf_editor.db")
os.environ["CRF_STORAGE_UPLOAD_PATH"] = str(UPLOAD_DIR)
# 全新 worktree 没有 config.yaml 时，main 导入期校验需要非空 secret_key。
if not os.environ.get("CRF_AUTH_SECRET_KEY", "").strip():
    os.environ["CRF_AUTH_SECRET_KEY"] = secrets.token_hex(32)
# 生产模式只允许个别测试用 monkeypatch 显式开启，防止继承外部环境。
os.environ.pop("CRF_ENV", None)

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
from src.config import AppConfig, AdminConfig, AuthConfig, StorageConfig
from src.database import get_plain_session, get_session
from src.models import Base
from src.services.docx_import_service import DocxImportService
from src.services.docx_screenshot_service import DocxScreenshotService

# 测试用配置：固定有效 secret_key，上传目录指向会话临时根目录，其余字段走默认值。
_TEST_CONFIG = AppConfig(
    auth=AuthConfig(secret_key="test-secret-key-for-testing"),
    admin=AdminConfig(username="admin", bootstrap_password="bootstrap-pass-123"),
    storage=StorageConfig(upload_path=str(UPLOAD_DIR)),
)


@pytest.fixture(scope="session")
def test_root() -> Iterator[Path]:
    """会话级测试根目录：守卫测试据此断言运行时路径全部隔离；会话结束后整体清理。"""
    yield TEST_ROOT
    shutil.rmtree(TEST_ROOT, ignore_errors=True)


@pytest.fixture(scope="session", autouse=True)
def _isolate_docx_dirs() -> Iterator[None]:
    """截图缓存与 Word 导入临时目录指向测试根目录。

    应用退出时的 cleanup_old_caches(days=0) 清扫与导入写文件因此都落在临时目录，
    不再触碰仓库内的 backend/uploads/docx_temp；个别测试用函数级 monkeypatch
    指到自己的 tmp_path 时，结束后会自动恢复到这里的会话值。
    """
    docx_temp = str(TEST_ROOT / "docx_temp")
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(DocxScreenshotService, "BASE_DIR", docx_temp)
        mp.setattr(DocxImportService, "TEMP_DIR", docx_temp)
        yield


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

    def _override_plain():
        # 与生产 get_plain_session 一致：不预开事务，组合写服务在函数内 commit
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = _override
    app.dependency_overrides[get_plain_session] = _override_plain

    with patch("main.get_config", return_value=_TEST_CONFIG), \
         patch("src.database.get_config", return_value=_TEST_CONFIG), \
         patch("src.services.auth_service.get_config", return_value=_TEST_CONFIG), \
         patch("src.services.user_admin_service.get_config", return_value=_TEST_CONFIG), \
         patch("src.routers.admin.get_config", return_value=_TEST_CONFIG), \
         patch("src.services.project_purge_service.get_config", return_value=_TEST_CONFIG), \
         patch("src.services.project_size_service.get_config", return_value=_TEST_CONFIG), \
         patch("src.services.recycle_bin_cleanup_service.get_config", return_value=_TEST_CONFIG), \
         patch("main.init_db"):
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c

    app.dependency_overrides.clear()
