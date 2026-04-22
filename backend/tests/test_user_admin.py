"""用户管理集成测试（Phase 5）"""
import sqlite3

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as, seed_user
from src.config import AdminConfig, AppConfig, AuthConfig, DatabaseConfig
from src.models.project import Project
from src.models.user import User
from src.services.auth_service import hash_password


def _run_init_db_for_test(
    db_path,
    monkeypatch,
    *,
    env=None,
    admin_username="admin",
    bootstrap_password="bootstrap-pass-123",
):
    """在独立 SQLite 文件上执行 init_db，便于验证迁移与启动自愈。"""
    import src.database as database_module

    test_config = AppConfig(
        database=DatabaseConfig(path=str(db_path)),
        auth=AuthConfig(secret_key="test-secret-key-for-testing"),
        admin=AdminConfig(username=admin_username, bootstrap_password=bootstrap_password),
    )
    previous_engine = database_module._engine
    database_module._engine = None
    monkeypatch.setattr(database_module, "get_config", lambda: test_config)
    if env is None:
        monkeypatch.delenv("CRF_ENV", raising=False)
    else:
        monkeypatch.setenv("CRF_ENV", env)
    try:
        database_module.init_db()
    finally:
        current_engine = database_module._engine
        if current_engine is not None:
            current_engine.dispose()
        database_module._engine = previous_engine


# ── Admin Gate ────────────────────────────────────────────────


def test_list_users_requires_admin(client, engine):
    token = login_as(client, "bob")
    resp = client.get("/api/admin/users", headers=auth_headers(token))
    assert resp.status_code == 403


def test_create_user_requires_admin(client, engine):
    token = login_as(client, "bob")
    resp = client.post(
        "/api/admin/users",
        json={"username": "newguy", "password": "test-pass-123"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 403


def test_rename_user_requires_admin(client, engine):
    token = login_as(client, "bob")
    resp = client.patch(
        "/api/admin/users/1",
        json={"username": "x"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 403


def test_delete_user_requires_admin(client, engine):
    token = login_as(client, "bob")
    resp = client.delete("/api/admin/users/1", headers=auth_headers(token))
    assert resp.status_code == 403


# ── List Users ────────────────────────────────────────────────


def test_list_users_returns_all(client, engine):
    """列出所有用户及其项目数。"""
    token = login_as(client, "admin")
    # 登录 admin 和 bob 两个用户
    login_as(client, "bob")

    resp = client.get("/api/admin/users", headers=auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    usernames = {u["username"] for u in data}
    assert "admin" in usernames
    assert "bob" in usernames
    for u in data:
        assert "project_count" in u


def test_list_users_project_count(client, engine):
    """项目数应反映实际关联。"""
    token = login_as(client, "admin")

    with Session(engine) as session:
        with session.begin():
            admin_user = session.scalar(
                select(User).where(User.username == "admin")
            )
            session.add(
                Project(name="测试项目", version="1.0", owner_id=admin_user.id)
            )

    resp = client.get("/api/admin/users", headers=auth_headers(token))
    data = resp.json()
    admin_info = next(u for u in data if u["username"] == "admin")
    assert admin_info["project_count"] >= 1


def test_auth_me_and_admin_guard_use_is_admin_flag(client, engine):
    """/api/auth/me 与管理员门禁都应依赖 user.is_admin。"""
    seed_user(client, "ops_root", is_admin=True)
    admin_token = login_as(client, "ops_root")
    user_token = login_as(client, "bob")

    admin_me = client.get("/api/auth/me", headers=auth_headers(admin_token))
    assert admin_me.status_code == 200, admin_me.text
    assert admin_me.json() == {"username": "ops_root", "is_admin": True}

    user_me = client.get("/api/auth/me", headers=auth_headers(user_token))
    assert user_me.status_code == 200, user_me.text
    assert user_me.json() == {"username": "bob", "is_admin": False}

    admin_resp = client.get("/api/admin/users", headers=auth_headers(admin_token))
    assert admin_resp.status_code == 200, admin_resp.text


# ── Create User ───────────────────────────────────────────────


def test_create_user_success(client, engine):
    token = login_as(client, "admin")
    resp = client.post(
        "/api/admin/users",
        json={"username": "newuser", "password": "newuser-pass-123"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "newuser"
    assert "id" in data

    with Session(engine) as session:
        user = session.scalar(select(User).where(User.username == "newuser"))
        assert user is not None
        assert user.hashed_password is not None


def test_create_user_rejects_invalid_password(client, engine):
    token = login_as(client, "admin")
    resp = client.post(
        "/api/admin/users",
        json={"username": "newuser2", "password": "123"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    assert "密码长度不能少于" in resp.json()["detail"]


def test_create_user_duplicate(client, engine):
    """重复用户名应返回 409。"""
    token = login_as(client, "admin")
    client.post(
        "/api/admin/users",
        json={"username": "dupuser", "password": "dupuser-pass-123"},
        headers=auth_headers(token),
    )
    resp = client.post(
        "/api/admin/users",
        json={"username": "dupuser", "password": "dupuser-pass-123"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 409


def test_create_user_empty_name(client, engine):
    """空用户名应返回 409 或 400。"""
    token = login_as(client, "admin")
    resp = client.post(
        "/api/admin/users",
        json={"username": "  ", "password": "test-pass-123"},
        headers=auth_headers(token),
    )
    assert resp.status_code in (400, 409)


def test_create_user_rejects_reserved_admin_username(client, engine):
    token = login_as(client, "admin")
    resp = client.post(
        "/api/admin/users",
        json={"username": "admin", "password": "test-pass-123"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    assert "保留管理员账号" in resp.json()["detail"]


def test_reserved_admin_username_cannot_be_auto_created_by_login(client, engine):
    resp = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "test-pass-123"},
    )
    assert resp.status_code == 401, resp.text
    assert resp.json()["detail"] == "用户名或密码错误"

    with Session(engine) as session:
        admin_user = session.scalar(select(User).where(User.username == "admin"))
        assert admin_user is None



def test_reserved_admin_login_accepts_legacy_whitespace_username_after_heal(client, engine):
    with Session(engine) as session:
        with session.begin():
            session.add(
                User(
                    username=" admin ",
                    hashed_password=hash_password("admin-pass-123"),
                    is_admin=True,
                )
            )

    resp = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin-pass-123"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["access_token"]


# ── Rename User ───────────────────────────────────────────────


def test_rename_user_success(client, engine):
    token = login_as(client, "admin")
    create_resp = client.post(
        "/api/admin/users",
        json={"username": "rename_me", "password": "rename-pass-123"},
        headers=auth_headers(token),
    )
    uid = create_resp.json()["id"]

    resp = client.patch(
        f"/api/admin/users/{uid}",
        json={"username": "renamed"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["username"] == "renamed"


def test_rename_user_conflict(client, engine):
    """改名到已存在的用户名应返回 409。"""
    token = login_as(client, "admin")
    client.post(
        "/api/admin/users",
        json={"username": "existing", "password": "existing-pass-123"},
        headers=auth_headers(token),
    )
    create_resp = client.post(
        "/api/admin/users",
        json={"username": "to_rename", "password": "rename-pass-123"},
        headers=auth_headers(token),
    )
    uid = create_resp.json()["id"]

    resp = client.patch(
        f"/api/admin/users/{uid}",
        json={"username": "existing"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 409


def test_rename_nonexistent_user(client, engine):
    token = login_as(client, "admin")
    resp = client.patch(
        "/api/admin/users/99999",
        json={"username": "whatever"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400


def test_rename_user_to_reserved_admin_username_is_rejected(client, engine):
    token = login_as(client, "admin")
    create_resp = client.post(
        "/api/admin/users",
        json={"username": "rename_target", "password": "rename-target-pass-123"},
        headers=auth_headers(token),
    )
    uid = create_resp.json()["id"]

    resp = client.patch(
        f"/api/admin/users/{uid}",
        json={"username": "admin"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    assert "保留管理员账号" in resp.json()["detail"]


def test_reserved_admin_user_cannot_be_renamed(client, engine):
    token = login_as(client, "admin")

    with Session(engine) as session:
        admin_user = session.scalar(select(User).where(User.username == "admin"))
        admin_id = admin_user.id

    resp = client.patch(
        f"/api/admin/users/{admin_id}",
        json={"username": "admin_renamed"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    assert "保留管理员账号" in resp.json()["detail"]


def test_old_token_stays_invalid_after_rename_and_recreate_username(
    client, engine
):
    """用户改名后旧 token 即使在旧用户名被重建后也必须继续 401。"""
    admin_token = login_as(client, "admin")
    old_token = login_as(client, "bob")

    with Session(engine) as session:
        bob = session.scalar(select(User).where(User.username == "bob"))
        bob_id = bob.id

    rename_resp = client.patch(
        f"/api/admin/users/{bob_id}",
        json={"username": "bob_renamed"},
        headers=auth_headers(admin_token),
    )
    assert rename_resp.status_code == 200

    old_token_resp = client.get("/api/projects", headers=auth_headers(old_token))
    assert old_token_resp.status_code == 401

    seed_user(client, "bob", password="bob-new-pass-123")
    recreate_resp = client.post(
        "/api/auth/login",
        json={"username": "bob", "password": "bob-new-pass-123"},
    )
    assert recreate_resp.status_code == 200

    reused_token_resp = client.get("/api/projects", headers=auth_headers(old_token))
    assert reused_token_resp.status_code == 401


def test_list_users_includes_has_password(client, engine):
    admin_token = login_as(client, "admin")
    seed_user(client, "with_password", password="with-password-123")
    seed_user(client, "without_password", password=None)

    response = client.get("/api/admin/users", headers=auth_headers(admin_token))
    assert response.status_code == 200, response.text
    users = {user["username"]: user for user in response.json()}
    assert users["with_password"]["has_password"] is True
    assert users["without_password"]["has_password"] is False


def test_admin_can_reset_user_password_and_invalidate_old_token(client, engine):
    admin_token = login_as(client, "admin")
    old_token = login_as(client, "reset_me", password="old-pass-123")

    with Session(engine) as session:
        user = session.scalar(select(User).where(User.username == "reset_me"))
        user_id = user.id

    reset_resp = client.put(
        f"/api/admin/users/{user_id}/password",
        json={"password": "new-pass-123"},
        headers=auth_headers(admin_token),
    )
    assert reset_resp.status_code == 204, reset_resp.text

    old_token_resp = client.get("/api/projects", headers=auth_headers(old_token))
    assert old_token_resp.status_code == 401

    login_resp = client.post(
        "/api/auth/login",
        json={"username": "reset_me", "password": "new-pass-123"},
    )
    assert login_resp.status_code == 200, login_resp.text


# ── Delete User ───────────────────────────────────────────────


def test_delete_user_success(client, engine):
    token = login_as(client, "admin")
    create_resp = client.post(
        "/api/admin/users",
        json={"username": "del_me", "password": "delete-pass-123"},
        headers=auth_headers(token),
    )
    uid = create_resp.json()["id"]

    resp = client.delete(
        f"/api/admin/users/{uid}", headers=auth_headers(token)
    )
    assert resp.status_code == 204


def test_delete_user_with_projects(client, engine):
    """有项目的用户不能删除，返回 409。"""
    token = login_as(client, "admin")
    create_resp = client.post(
        "/api/admin/users",
        json={"username": "has_projects", "password": "has-projects-pass-123"},
        headers=auth_headers(token),
    )
    uid = create_resp.json()["id"]

    with Session(engine) as session:
        with session.begin():
            session.add(
                Project(name="某项目", version="1.0", owner_id=uid)
            )

    resp = client.delete(
        f"/api/admin/users/{uid}", headers=auth_headers(token)
    )
    assert resp.status_code == 409
    assert "项目" in resp.json()["detail"]


def test_deleted_projects_do_not_inflate_count_when_active_projects_exist(client, engine):
    """混合场景下只统计活跃项目，且活跃项目仍会阻止删除用户。"""
    token = login_as(client, "admin")
    create_resp = client.post(
        "/api/admin/users",
        json={"username": "mixed_project_user", "password": "mixed-project-pass-123"},
        headers=auth_headers(token),
    )
    uid = create_resp.json()["id"]

    with Session(engine) as session:
        with session.begin():
            active_project = Project(
                name="活跃项目",
                version="1.0",
                owner_id=uid,
            )
            deleted_project = Project(
                name="回收站项目",
                version="1.0",
                owner_id=uid,
            )
            session.add_all([active_project, deleted_project])
            session.flush()
            deleted_project.deleted_at = deleted_project.created_at

    list_resp = client.get("/api/admin/users", headers=auth_headers(token))
    assert list_resp.status_code == 200, list_resp.text
    user_info = next(
        user for user in list_resp.json() if user["id"] == uid
    )
    assert user_info["project_count"] == 1

    delete_resp = client.delete(
        f"/api/admin/users/{uid}", headers=auth_headers(token)
    )
    assert delete_resp.status_code == 409, delete_resp.text
    assert "项目" in delete_resp.json()["detail"]


def test_deleted_projects_do_not_block_user_count_or_deletion(client, engine):
    """仅剩回收站项目时，项目数应为 0 且允许删除用户。"""
    token = login_as(client, "admin")
    create_resp = client.post(
        "/api/admin/users",
        json={"username": "deleted_only_user", "password": "deleted-only-pass-123"},
        headers=auth_headers(token),
    )
    uid = create_resp.json()["id"]

    with Session(engine) as session:
        with session.begin():
            deleted_project = Project(
                name="回收站项目",
                version="1.0",
                owner_id=uid,
            )
            session.add(deleted_project)
            session.flush()
            deleted_project.deleted_at = deleted_project.created_at

    list_resp = client.get("/api/admin/users", headers=auth_headers(token))
    assert list_resp.status_code == 200, list_resp.text
    user_info = next(
        user for user in list_resp.json() if user["id"] == uid
    )
    assert user_info["project_count"] == 0

    delete_resp = client.delete(
        f"/api/admin/users/{uid}", headers=auth_headers(token)
    )
    assert delete_resp.status_code == 204, delete_resp.text

    with Session(engine) as session:
        assert session.get(User, uid) is None


def test_delete_nonexistent_user(client, engine):
    token = login_as(client, "admin")
    resp = client.delete(
        "/api/admin/users/99999", headers=auth_headers(token)
    )
    assert resp.status_code == 400


def test_reserved_admin_user_cannot_be_deleted(client, engine):
    token = login_as(client, "admin")

    with Session(engine) as session:
        admin_user = session.scalar(select(User).where(User.username == "admin"))
        admin_id = admin_user.id

    resp = client.delete(
        f"/api/admin/users/{admin_id}",
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    assert "保留管理员账号" in resp.json()["detail"]


def test_admin_can_list_active_projects_for_specific_user(client, engine):
    admin_token = login_as(client, "admin")
    seed_user(client, "target_user")

    with Session(engine) as session:
        with session.begin():
            admin_user = session.scalar(select(User).where(User.username == "admin"))
            target_user = session.scalar(select(User).where(User.username == "target_user"))
            target_user_id = target_user.id
            session.add(Project(name="管理员项目", version="1.0", owner_id=admin_user.id))
            session.add(Project(name="目标活跃项目", version="1.0", owner_id=target_user_id))
            deleted_project = Project(name="目标回收站项目", version="1.0", owner_id=target_user_id)
            session.add(deleted_project)
            session.flush()
            deleted_project.deleted_at = deleted_project.created_at

    resp = client.get(
        f"/api/projects?user_id={target_user_id}",
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200, resp.text
    names = [project["name"] for project in resp.json()]
    assert names == ["目标活跃项目"]


def test_non_admin_cannot_list_other_users_projects(client, engine):
    owner_token = login_as(client, "owner_user")
    seed_user(client, "other_user")

    with Session(engine) as session:
        owner = session.scalar(select(User).where(User.username == "owner_user"))
        other = session.scalar(select(User).where(User.username == "other_user"))
        owner_id = owner.id
        other_id = other.id

    resp = client.get(
        f"/api/projects?user_id={other_id}",
        headers=auth_headers(owner_token),
    )
    assert resp.status_code == 403

    own_resp = client.get(
        f"/api/projects?user_id={owner_id}",
        headers=auth_headers(owner_token),
    )
    assert resp.status_code == 403

    own_resp = client.get(
        f"/api/projects?user_id={owner.id}",
        headers=auth_headers(owner_token),
    )
    assert own_resp.status_code == 200, own_resp.text


def test_init_db_migrates_is_admin_and_heals_reserved_admin(tmp_path, monkeypatch):
    db_path = tmp_path / "legacy-user.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        """
        CREATE TABLE user (
            id INTEGER PRIMARY KEY,
            username VARCHAR(100) NOT NULL UNIQUE,
            hashed_password VARCHAR(255) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        'INSERT INTO user (username, hashed_password) VALUES (?, ?)',
        ("admin", "legacy-secret"),
    )
    conn.execute(
        'INSERT INTO user (username, hashed_password) VALUES (?, ?)',
        ("alice", "legacy-secret"),
    )
    conn.commit()
    conn.close()

    _run_init_db_for_test(db_path, monkeypatch)

    conn = sqlite3.connect(str(db_path))
    columns = {
        row[1]: row for row in conn.execute("PRAGMA table_info(user)").fetchall()
    }
    assert "is_admin" in columns
    assert columns["is_admin"][3] == 1
    assert "0" in str(columns["is_admin"][4])
    rows = conn.execute(
        'SELECT username, is_admin FROM user ORDER BY id'
    ).fetchall()
    assert rows == [("admin", 1), ("alice", 0)]
    conn.close()

    _run_init_db_for_test(db_path, monkeypatch)

    conn = sqlite3.connect(str(db_path))
    admin_rows = conn.execute(
        'SELECT COUNT(*) FROM user WHERE username = ?',
        ("admin",),
    ).fetchone()[0]
    admin_flag = conn.execute(
        'SELECT is_admin FROM user WHERE username = ?',
        ("admin",),
    ).fetchone()[0]
    assert admin_rows == 1
    assert admin_flag == 1
    conn.close()


def test_init_db_bootstraps_reserved_admin_once_in_production(tmp_path, monkeypatch):
    db_path = tmp_path / "production-bootstrap.db"

    _run_init_db_for_test(db_path, monkeypatch, env="production")

    conn = sqlite3.connect(str(db_path))
    rows = conn.execute(
        'SELECT username, is_admin, hashed_password, auth_version FROM user ORDER BY id'
    ).fetchall()
    assert len(rows) == 1
    assert rows[0][0] == "admin"
    assert rows[0][1] == 1
    assert rows[0][2].startswith("$pbkdf2-sha256$")
    assert rows[0][3] == 1
    conn.close()

    _run_init_db_for_test(db_path, monkeypatch, env="production")

    conn = sqlite3.connect(str(db_path))
    rows = conn.execute(
        'SELECT username, is_admin FROM user ORDER BY id'
    ).fetchall()
    assert rows == [("admin", 1)]
    conn.close()



def test_init_db_repairs_reserved_admin_when_production_db_is_not_empty(tmp_path, monkeypatch):
    db_path = tmp_path / "production-non-empty.db"

    _run_init_db_for_test(db_path, monkeypatch)

    conn = sqlite3.connect(str(db_path))
    conn.execute(
        'INSERT INTO user (username, hashed_password, is_admin, auth_version) VALUES (?, ?, ?, ?)',
        ("alice", None, 0, 0),
    )
    conn.commit()
    conn.close()

    _run_init_db_for_test(db_path, monkeypatch, env="production")

    conn = sqlite3.connect(str(db_path))
    rows = conn.execute(
        'SELECT username, is_admin, hashed_password FROM user ORDER BY id'
    ).fetchall()
    assert len(rows) == 2
    assert rows[0] == ("alice", 0, None)
    assert rows[1][0] == "admin"
    assert rows[1][1] == 1
    assert rows[1][2].startswith("$pbkdf2-sha256$")
    conn.close()



def test_init_db_fails_fast_without_bootstrap_password_in_production(tmp_path, monkeypatch):
    db_path = tmp_path / "production-missing-bootstrap.db"

    with pytest.raises(RuntimeError, match="bootstrap_password"):
        _run_init_db_for_test(
            db_path,
            monkeypatch,
            env="production",
            bootstrap_password="",
        )
