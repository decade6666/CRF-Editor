"""项目批量软删除的属主隔离回归。

验证单条带 owner 过滤的批量软删除：仅删自己项目，混入他人 id 时他人项目不受影响。
"""
import pytest
from fastapi.testclient import TestClient

from helpers import auth_headers, login_as


@pytest.fixture
def setup(client: TestClient):
    """alice 与 bob 各建一个项目，返回 (token_a, token_b, pid_a, pid_b)。"""
    token_a = login_as(client, "alice")
    token_b = login_as(client, "bob")

    r_a = client.post(
        "/api/projects",
        json={"name": "A项目", "version": "1.0"},
        headers=auth_headers(token_a),
    )
    assert r_a.status_code in (200, 201), r_a.text
    pid_a = r_a.json()["id"]

    r_b = client.post(
        "/api/projects",
        json={"name": "B项目", "version": "1.0"},
        headers=auth_headers(token_b),
    )
    assert r_b.status_code in (200, 201), r_b.text
    pid_b = r_b.json()["id"]
    return token_a, token_b, pid_a, pid_b


def _project_ids(client: TestClient, token: str) -> set[int]:
    r = client.get("/api/projects", headers=auth_headers(token))
    assert r.status_code == 200, r.text
    return {p["id"] for p in r.json()}


def test_batch_delete_only_removes_own_projects(client: TestClient, setup):
    """alice 批量删除 [自己, bob]：自己被软删、bob 不受影响、返回 204。"""
    token_a, token_b, pid_a, pid_b = setup

    r = client.post(
        "/api/projects/batch-delete",
        json={"project_ids": [pid_a, pid_b]},
        headers=auth_headers(token_a),
    )
    assert r.status_code == 204, r.text

    assert pid_a not in _project_ids(client, token_a)
    # bob 的项目仍存在且可见
    assert pid_b in _project_ids(client, token_b)


def test_batch_delete_empty_list_is_noop(client: TestClient, setup):
    token_a, _, pid_a, _ = setup
    r = client.post(
        "/api/projects/batch-delete",
        json={"project_ids": []},
        headers=auth_headers(token_a),
    )
    assert r.status_code == 204, r.text
    assert pid_a in _project_ids(client, token_a)
