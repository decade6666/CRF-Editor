"""项目级用户隔离集成测试

验证跨用户数据隔离：
- 用户 B 无法 GET/PUT/DELETE 用户 A 的项目（403）
- GET /api/projects 仅返回当前用户自己的项目
"""
from fastapi.testclient import TestClient

from helpers import auth_headers, login_as


def _create_project(client: TestClient, token: str, name: str) -> int:
    r = client.post(
        "/api/projects",
        json={"name": name, "version": "1.0"},
        headers=auth_headers(token),
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def test_user_b_cannot_get_user_a_project(client: TestClient):
    token_a = login_as(client, "alice")
    token_b = login_as(client, "bob")

    project_id = _create_project(client, token_a, "A项目")

    r = client.get(f"/api/projects/{project_id}", headers=auth_headers(token_b))
    assert r.status_code == 403


def test_user_b_cannot_update_user_a_project(client: TestClient):
    token_a = login_as(client, "alice")
    token_b = login_as(client, "bob")

    project_id = _create_project(client, token_a, "A项目")

    r = client.put(
        f"/api/projects/{project_id}",
        json={"name": "hijack", "version": "1.0"},
        headers=auth_headers(token_b),
    )
    assert r.status_code == 403


def test_user_b_cannot_delete_user_a_project(client: TestClient):
    token_a = login_as(client, "alice")
    token_b = login_as(client, "bob")

    project_id = _create_project(client, token_a, "A项目")

    r = client.delete(f"/api/projects/{project_id}", headers=auth_headers(token_b))
    assert r.status_code == 403


def test_list_returns_only_own_projects(client: TestClient):
    token_a = login_as(client, "alice")
    token_b = login_as(client, "bob")

    _create_project(client, token_a, "A项目")
    _create_project(client, token_b, "B项目")

    r = client.get("/api/projects", headers=auth_headers(token_b))
    assert r.status_code == 200
    names = [p["name"] for p in r.json()]
    assert "B项目" in names
    assert "A项目" not in names
