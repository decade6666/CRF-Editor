"""子资源用户隔离集成测试

验证访视、表单、字段库子接口的归属链校验：
用户 B 的 token 访问用户 A 项目下的子资源返回 403
"""
import pytest
from fastapi.testclient import TestClient

from helpers import auth_headers, login_as


@pytest.fixture
def setup(client: TestClient):
    """创建用户 A 的项目，返回 (token_a, token_b, project_id)。"""
    token_a = login_as(client, "alice")
    token_b = login_as(client, "bob")

    r = client.post(
        "/api/projects",
        json={"name": "A项目", "version": "1.0"},
        headers=auth_headers(token_a),
    )
    assert r.status_code in (200, 201), r.text
    project_id = r.json()["id"]
    return token_a, token_b, project_id


def test_user_b_cannot_list_visits(client: TestClient, setup):
    _, token_b, project_id = setup
    r = client.get(f"/api/projects/{project_id}/visits", headers=auth_headers(token_b))
    assert r.status_code == 403


def test_user_b_cannot_list_forms(client: TestClient, setup):
    _, token_b, project_id = setup
    r = client.get(f"/api/projects/{project_id}/forms", headers=auth_headers(token_b))
    assert r.status_code == 403


def test_user_b_cannot_list_field_definitions(client: TestClient, setup):
    _, token_b, project_id = setup
    r = client.get(f"/api/projects/{project_id}/field-definitions", headers=auth_headers(token_b))
    assert r.status_code == 403
