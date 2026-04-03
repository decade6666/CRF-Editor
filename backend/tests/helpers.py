"""认证测试辅助。"""

from fastapi.testclient import TestClient


def login_as(client: TestClient, username: str) -> str:
    """登录指定用户名，返回 access_token。"""
    response = client.post("/api/auth/enter", json={"username": username})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    """生成 Bearer Authorization 头。"""
    return {"Authorization": f"Bearer {token}"}
