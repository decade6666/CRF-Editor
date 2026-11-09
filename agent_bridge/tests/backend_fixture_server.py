"""E2E 一次性 HTTP 后端（由 BACKEND_PY 解释器运行的独立进程）。

- 与 backend/tests/conftest 同等隔离：临时库/上传/截图目录、禁后台任务、
  不存在的 CONFIG_FILE、随机会话密钥、清除 CRF_* 覆盖。
- 启动时种子一次性测试用户 + 项目 + 表单 + 定义（运行时随机口令）。
- 在临时目录写 0600 握手 JSON（端口/用户名/口令/项目/表单/定义 id）供
  测试进程读取；测试夹具在 teardown 删除握手文件与整个临时根目录。
  不打印任何口令/令牌。
- uvicorn 临时端口（127.0.0.1 随机空闲端口）。
"""

from __future__ import annotations

import json
import os
import secrets
import socket
import sys
import tempfile
from pathlib import Path


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main() -> None:
    root = Path(tempfile.mkdtemp(prefix="crf-agent-e2e-"))
    os.environ["CRF_DATABASE_PATH"] = str(root / "crf_editor.db")
    os.environ["CRF_STORAGE_UPLOAD_PATH"] = str(root / "uploads")
    os.environ["CRF_AUTH_SECRET_KEY"] = secrets.token_hex(32)
    os.environ["CRF_DISABLE_BACKGROUND_JOBS"] = "1"
    os.environ.pop("CRF_ENV", None)
    (root / "uploads").mkdir(parents=True, exist_ok=True)

    backend_root = Path(__file__).resolve().parents[2] / "backend"
    sys.path.insert(0, str(backend_root))

    import src.config as config_module  # noqa: E402 - sys.path 注入后导入

    # 清除开发者 shell 的 CRF_* 覆盖（与 conftest 同契约，保留三个强制键）
    for name in list(os.environ.keys()):
        if name.startswith("CRF_") and name not in (
            "CRF_DATABASE_PATH",
            "CRF_STORAGE_UPLOAD_PATH",
            "CRF_AUTH_SECRET_KEY",
            "CRF_DISABLE_BACKGROUND_JOBS",
        ):
            os.environ.pop(name, None)
    config_module.CONFIG_FILE = root / "config.yaml"
    config_module.get_config.cache_clear()

    from src.database import init_db
    from src.models.field_definition import FieldDefinition
    from src.models.form import Form
    from src.models.form_field import FormField
    from src.models.project import Project
    from src.models.user import User
    from src.services.auth_service import hash_password

    init_db()

    username = "e2e_owner_" + secrets.token_hex(4)
    password = "E2e-" + secrets.token_hex(12) + "!aA1"
    with __import__("src.database", fromlist=["Session"]).Session(get_engine()) as session:  # noqa: F405
        user = User(username=username, hashed_password=hash_password(password), auth_version=0)
        session.add(user)
        session.flush()
        project = Project(name="E2E 项目", version="1.0", owner_id=user.id, order_index=1)
        session.add(project)
        session.flush()
        fd = FieldDefinition(
            project_id=project.id, variable_name="BASE_DEF", label="基础字段", field_type="文本", order_index=1
        )
        session.add(fd)
        session.flush()
        form = Form(project_id=project.id, name="表单A", code="F_A", order_index=1)
        session.add(form)
        session.flush()
        ff = FormField(form_id=form.id, field_definition_id=fd.id, order_index=1)
        session.add(ff)
        session.commit()
        handshake = {
            "port": _free_port(),
            "username": username,
            "password": password,
            "user_id": user.id,
            "project_id": project.id,
            "form_id": form.id,
            "field_definition_id": fd.id,
            "form_field_id": ff.id,
            "tmp_root": str(root),
        }

    handshake_path = Path(os.environ.get("E2E_HANDSHAKE_PATH", str(root / "handshake.json")))
    handshake_path.parent.mkdir(parents=True, exist_ok=True)
    handshake_path.write_text(json.dumps(handshake), encoding="utf-8")
    os.chmod(handshake_path, 0o600)

    import uvicorn

    from main import app

    config = uvicorn.Config(app, host="127.0.0.1", port=handshake["port"], log_level="warning")
    server = uvicorn.Server(config)
    # 就绪信号：握手文件已存在即就绪（测试轮询该文件）
    server.run()


def get_engine():
    from src.database import get_engine

    return get_engine()


if __name__ == "__main__":
    main()
