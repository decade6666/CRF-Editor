"""认证测试辅助函数"""
from fastapi.testclient import TestClient


def login_as(client: TestClient, username: str) -> str:
    """无密码登录并返回 access_token。"""
    r = client.post("/api/auth/enter", json={"username": username})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def auth_headers(token: str) -> dict:
    """构造 Bearer Authorization 请求头。"""
    return {"Authorization": f"Bearer {token}"}
