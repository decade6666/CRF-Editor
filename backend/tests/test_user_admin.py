"""用户管理集成测试（Phase 5）"""
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as
from src.models.project import Project
from src.models.user import User


# ── Admin Gate ────────────────────────────────────────────────


def test_list_users_requires_admin(client, engine):
    token = login_as(client, "bob")
    resp = client.get("/api/admin/users", headers=auth_headers(token))
    assert resp.status_code == 403


def test_create_user_requires_admin(client, engine):
    token = login_as(client, "bob")
    resp = client.post(
        "/api/admin/users",
        json={"username": "newguy"},
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


# ── Create User ───────────────────────────────────────────────


def test_create_user_success(client, engine):
    token = login_as(client, "admin")
    resp = client.post(
        "/api/admin/users",
        json={"username": "newuser"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "newuser"
    assert "id" in data


def test_create_user_duplicate(client, engine):
    """重复用户名应返回 409。"""
    token = login_as(client, "admin")
    client.post(
        "/api/admin/users",
        json={"username": "dupuser"},
        headers=auth_headers(token),
    )
    resp = client.post(
        "/api/admin/users",
        json={"username": "dupuser"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 409


def test_create_user_empty_name(client, engine):
    """空用户名应返回 409 或 400。"""
    token = login_as(client, "admin")
    resp = client.post(
        "/api/admin/users",
        json={"username": "  "},
        headers=auth_headers(token),
    )
    assert resp.status_code in (400, 409)


# ── Rename User ───────────────────────────────────────────────


def test_rename_user_success(client, engine):
    token = login_as(client, "admin")
    create_resp = client.post(
        "/api/admin/users",
        json={"username": "rename_me"},
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
        json={"username": "existing"},
        headers=auth_headers(token),
    )
    create_resp = client.post(
        "/api/admin/users",
        json={"username": "to_rename"},
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

    recreate_resp = client.post(
        "/api/auth/enter",
        json={"username": "bob"},
    )
    assert recreate_resp.status_code == 200

    reused_token_resp = client.get("/api/projects", headers=auth_headers(old_token))
    assert reused_token_resp.status_code == 401


# ── Delete User ───────────────────────────────────────────────


def test_delete_user_success(client, engine):
    token = login_as(client, "admin")
    create_resp = client.post(
        "/api/admin/users",
        json={"username": "del_me"},
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
        json={"username": "has_projects"},
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


def test_delete_nonexistent_user(client, engine):
    token = login_as(client, "admin")
    resp = client.delete(
        "/api/admin/users/99999", headers=auth_headers(token)
    )
    assert resp.status_code == 400
