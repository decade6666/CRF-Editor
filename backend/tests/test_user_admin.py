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


def test_deleted_projects_do_not_inflate_count_when_active_projects_exist(client, engine):
    """混合场景下只统计活跃项目，且活跃项目仍会阻止删除用户。"""
    token = login_as(client, "admin")
    create_resp = client.post(
        "/api/admin/users",
        json={"username": "mixed_project_user"},
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
        json={"username": "deleted_only_user"},
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


def test_admin_can_list_active_projects_for_specific_user(client, engine):
    admin_token = login_as(client, "admin")
    client.post("/api/auth/enter", json={"username": "target_user"})

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
    client.post("/api/auth/enter", json={"username": "other_user"})

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
