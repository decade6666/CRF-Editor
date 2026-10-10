"""保留管理员账号修复逻辑的特征测试（characterization tests）。

锁定 `heal_reserved_admin_account` 现行全部分支行为，作为「移出迁移代码」改造的回归网。
统一补丁面（helper `_run_heal`）：均补 `src.services.admin_bootstrap_service` 命名空间。

不可达分支说明：最终检查（production 未找到可用管理员 → RuntimeError）在真实数据下不可达 ——
首条提升 UPDATE 会把所有 TRIM 匹配行置为 is_admin=1，且最终检查选中的最低 id 行就是修复分支
处理过的同一行。锁定该分支只能用状态化桩，见 `test_should_raise_when_final_check_finds_no_usable_admin`。
"""

import sqlite3
from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, text

from src.config import AdminConfig, AppConfig, AuthConfig
from src.services.admin_bootstrap_service import heal_reserved_admin_account
from src.services.auth_service import has_usable_password_hash, verify_password

_BOOTSTRAP_PASSWORD = "bootstrap-pass-123"

_CREATE_USER_TABLE = """
    CREATE TABLE "user" (
        id INTEGER PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        hashed_password VARCHAR(255),
        is_admin BOOLEAN NOT NULL DEFAULT 0,
        auth_version INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
"""


def _config(username: str, bootstrap_password: str = "") -> AppConfig:
    return AppConfig(
        auth=AuthConfig(secret_key="test-secret-key-for-testing"),
        admin=AdminConfig(username=username, bootstrap_password=bootstrap_password),
    )


def _engine_for(db_path: Path, *, with_user_table: bool = True):
    if with_user_table:
        conn = sqlite3.connect(str(db_path))
        try:
            conn.execute(_CREATE_USER_TABLE)
            conn.commit()
        finally:
            conn.close()
    return create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")


def _insert_user(
    engine,
    *,
    user_id: int,
    username: str,
    hashed_password: str | None,
    is_admin: int = 0,
    auth_version: int = 0,
) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                'INSERT INTO "user" (id, username, hashed_password, is_admin, auth_version) '
                "VALUES (:id, :username, :hashed_password, :is_admin, :auth_version)"
            ),
            {
                "id": user_id,
                "username": username,
                "hashed_password": hashed_password,
                "is_admin": is_admin,
                "auth_version": auth_version,
            },
        )


def _fetch_users(engine) -> list[tuple]:
    with engine.connect() as conn:
        return conn.execute(
            text('SELECT id, username, hashed_password, is_admin, auth_version FROM "user" ORDER BY id')
        ).fetchall()


def _run_heal(engine, *, username: str, bootstrap_password: str = "", production: bool) -> None:
    """在统一的补丁面（admin_bootstrap_service 命名空间）下执行一次修复。"""
    with (
        patch("src.services.admin_bootstrap_service.get_config", return_value=_config(username, bootstrap_password)),
        patch("src.services.admin_bootstrap_service.is_production_env", return_value=production),
    ):
        heal_reserved_admin_account(engine)


def test_should_noop_when_user_table_missing(tmp_path: Path) -> None:
    db_path = tmp_path / "no-user-table.db"
    engine = _engine_for(db_path, with_user_table=False)

    _run_heal(engine, username="admin", production=True)

    conn = sqlite3.connect(str(db_path))
    try:
        assert conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user'").fetchone() is None
    finally:
        conn.close()


def test_should_noop_when_configured_username_blank(tmp_path: Path) -> None:
    engine = _engine_for(tmp_path / "blank-username.db")
    _insert_user(engine, user_id=1, username="admin", hashed_password="x", is_admin=0)

    _run_heal(engine, username="   ", production=True)

    users = _fetch_users(engine)
    assert len(users) == 1
    assert users[0][3] == 0


def test_should_promote_trim_matched_user_to_admin_in_non_production(tmp_path: Path) -> None:
    engine = _engine_for(tmp_path / "promote.db")
    _insert_user(engine, user_id=1, username="admin ", hashed_password="x", is_admin=0)

    _run_heal(engine, username="admin", production=False)

    users = _fetch_users(engine)
    assert len(users) == 1
    assert users[0][1] == "admin"
    assert users[0][3] == 1


def test_should_insert_nothing_in_non_production_when_no_admin_row(tmp_path: Path) -> None:
    engine = _engine_for(tmp_path / "dev-no-admin.db")

    _run_heal(engine, username="admin", bootstrap_password=_BOOTSTRAP_PASSWORD, production=False)

    assert _fetch_users(engine) == []


def test_should_raise_in_production_when_no_admin_row_and_no_bootstrap_password(tmp_path: Path) -> None:
    engine = _engine_for(tmp_path / "prod-no-bootstrap.db")

    with pytest.raises(RuntimeError, match="无法初始化保留管理员账号"):
        _run_heal(engine, username="admin", production=True)

    assert _fetch_users(engine) == []


def test_should_insert_admin_with_usable_hash_in_production(tmp_path: Path) -> None:
    engine = _engine_for(tmp_path / "prod-insert.db")

    _run_heal(engine, username="admin", bootstrap_password=_BOOTSTRAP_PASSWORD, production=True)

    users = _fetch_users(engine)
    assert len(users) == 1
    _, username, hashed_password, is_admin, auth_version = users[0]
    assert username == "admin"
    assert is_admin == 1
    assert auth_version == 1
    assert has_usable_password_hash(hashed_password)
    assert verify_password(_BOOTSTRAP_PASSWORD, hashed_password)


def test_should_rename_trim_matched_user_when_no_exact_row_conflicts(tmp_path: Path) -> None:
    engine = _engine_for(tmp_path / "rename.db")
    _insert_user(engine, user_id=1, username="admin ", hashed_password="x", is_admin=0)

    _run_heal(engine, username="admin", production=False)

    users = _fetch_users(engine)
    assert len(users) == 1
    assert users[0][1] == "admin"
    assert users[0][3] == 1


def test_should_keep_trim_matched_username_when_exact_row_already_exists(tmp_path: Path) -> None:
    engine = _engine_for(tmp_path / "rename-conflict.db")
    _insert_user(engine, user_id=1, username=" admin", hashed_password="x", is_admin=0)
    _insert_user(engine, user_id=2, username="admin", hashed_password="x", is_admin=1)

    _run_heal(engine, username="admin", production=False)

    users = _fetch_users(engine)
    assert len(users) == 2
    assert users[0][1] == " admin"
    assert users[0][3] == 1
    assert users[1][1] == "admin"
    assert users[1][3] == 1


def test_should_raise_in_production_when_unusable_hash_and_no_bootstrap_password(tmp_path: Path) -> None:
    engine = _engine_for(tmp_path / "prod-unusable-no-bootstrap.db")
    _insert_user(engine, user_id=1, username="admin", hashed_password="broken-hash", is_admin=1, auth_version=3)

    with pytest.raises(RuntimeError, match="无法修复保留管理员账号"):
        _run_heal(engine, username="admin", production=True)

    users = _fetch_users(engine)
    assert users[0][2] == "broken-hash"
    assert users[0][4] == 3


def test_should_reset_unusable_hash_and_bump_auth_version_in_production(tmp_path: Path) -> None:
    engine = _engine_for(tmp_path / "prod-reset.db")
    _insert_user(engine, user_id=1, username="admin", hashed_password="broken-hash", is_admin=1, auth_version=3)

    _run_heal(engine, username="admin", bootstrap_password=_BOOTSTRAP_PASSWORD, production=True)

    users = _fetch_users(engine)
    assert len(users) == 1
    _, username, hashed_password, is_admin, auth_version = users[0]
    assert is_admin == 1
    assert auth_version == 4
    assert has_usable_password_hash(hashed_password)
    assert verify_password(_BOOTSTRAP_PASSWORD, hashed_password)


def test_should_raise_when_final_check_finds_no_usable_admin(tmp_path: Path) -> None:
    """锁定最终检查分支：production 下未找到可用管理员 → RuntimeError。

    真实数据下不可达（修复门与最终检查门共用同一 is_production_env 判定，且提升 UPDATE 保证
    最终检查行就是修复分支处理过的行），因此用状态化桩：第一次（修复门）判非 production 跳过
    修复，第二次（最终检查门）判 production 触发检查。异常在 engine.begin() 内抛出并回滚。
    """
    engine = _engine_for(tmp_path / "prod-final-check.db")
    _insert_user(engine, user_id=1, username="admin", hashed_password="broken-hash", is_admin=0, auth_version=2)

    with (
        patch("src.services.admin_bootstrap_service.get_config", return_value=_config("admin")),
        patch("src.services.admin_bootstrap_service.is_production_env", side_effect=[False, True]),
    ):
        with pytest.raises(RuntimeError, match="未找到可用的保留管理员账号"):
            heal_reserved_admin_account(engine)

    users = _fetch_users(engine)
    assert users[0][2] == "broken-hash"
    assert users[0][3] == 0
    assert users[0][4] == 2


def test_should_be_idempotent_across_restarts(tmp_path: Path) -> None:
    engine = _engine_for(tmp_path / "idempotent.db")
    _insert_user(engine, user_id=1, username="admin", hashed_password="broken-hash", is_admin=0, auth_version=2)

    _run_heal(engine, username="admin", bootstrap_password=_BOOTSTRAP_PASSWORD, production=True)
    first = _fetch_users(engine)

    _run_heal(engine, username="admin", bootstrap_password=_BOOTSTRAP_PASSWORD, production=True)
    second = _fetch_users(engine)

    assert first == second
    assert second[0][4] == 3
