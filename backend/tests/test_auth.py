"""认证接口集成测试

验证 /enter 端点契约：
- 首次进入创建用户并返回 token
- 再次进入同一用户名返回 token（幂等）
- 空用户名返回 422
- 无 token 访问受保护接口返回 401
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import jwt
from fastapi.testclient import TestClient

from src.config import AppConfig, AuthConfig
from src.services.auth_service import create_access_token

_TEST_CONFIG = AppConfig(auth=AuthConfig(secret_key="test-secret-key-for-testing"))


def test_enter_creates_user_and_returns_token(client: TestClient):
    r = client.post("/api/auth/enter", json={"username": "alice"})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

    payload = jwt.decode(
        data["access_token"],
        _TEST_CONFIG.auth.secret_key,
        algorithms=[_TEST_CONFIG.auth.algorithm],
    )
    assert payload["sub"] == "1"
    assert payload["username"] == "alice"


def test_enter_is_idempotent(client: TestClient):
    r1 = client.post("/api/auth/enter", json={"username": "bob"})
    assert r1.status_code == 200
    token1 = r1.json()["access_token"]

    r2 = client.post("/api/auth/enter", json={"username": "bob"})
    assert r2.status_code == 200
    token2 = r2.json()["access_token"]

    # 两次进入同一用户名，都成功返回 token
    assert token1
    assert token2


def test_enter_empty_username_returns_422(client: TestClient):
    r = client.post("/api/auth/enter", json={"username": "   "})
    assert r.status_code == 422


def test_no_token_returns_401(client: TestClient):
    r = client.get("/api/projects")
    assert r.status_code == 401


def test_create_access_token_uses_configured_expire_minutes() -> None:
    configured_auth = AuthConfig(
        secret_key="test-secret-key-for-testing",
        access_token_expire_minutes=8640,
    )
    configured_config = AppConfig(auth=configured_auth)

    issued_before = datetime.now(timezone.utc)
    with patch("src.services.auth_service.get_config", return_value=configured_config):
        token = create_access_token(user_id=7, username="carol")
    issued_after = datetime.now(timezone.utc)

    payload = jwt.decode(
        token,
        configured_auth.secret_key,
        algorithms=[configured_auth.algorithm],
    )
    expected_min = int((issued_before + timedelta(minutes=8640)).timestamp()) - 1
    expected_max = int((issued_after + timedelta(minutes=8640)).timestamp()) + 1

    assert expected_min <= payload["exp"] <= expected_max
