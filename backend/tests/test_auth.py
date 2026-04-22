"""认证接口集成测试。"""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import jwt
from fastapi.testclient import TestClient

from helpers import auth_headers, seed_user
from src.config import AppConfig, AuthConfig
from src.services.auth_service import create_access_token

_TEST_CONFIG = AppConfig(auth=AuthConfig(secret_key="test-secret-key-for-testing"))


def test_login_returns_token_for_valid_credentials(client: TestClient):
    seed_user(client, "alice", password="alice-pass-123")

    response = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "alice-pass-123"},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

    payload = jwt.decode(
        data["access_token"],
        _TEST_CONFIG.auth.secret_key,
        algorithms=[_TEST_CONFIG.auth.algorithm],
    )
    assert payload["sub"] == "1"
    assert payload["username"] == "alice"
    assert payload["ver"] == 0


def test_login_rejects_wrong_password(client: TestClient):
    seed_user(client, "alice", password="alice-pass-123")

    response = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "wrong-pass-123"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "用户名或密码错误"


def test_login_returns_migration_hint_for_legacy_user_in_development(client: TestClient):
    seed_user(client, "legacy_user", password=None)

    response = client.post(
        "/api/auth/login",
        json={"username": "legacy_user", "password": "any-pass-123"},
    )

    assert response.status_code == 401
    assert "联系管理员" in response.json()["detail"]


def test_login_hides_migration_hint_for_legacy_user_in_production(client: TestClient, monkeypatch):
    monkeypatch.setenv("CRF_ENV", "production")
    seed_user(client, "legacy_user", password=None)

    response = client.post(
        "/api/auth/login",
        json={"username": "legacy_user", "password": "any-pass-123"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "用户名或密码错误"


def test_legacy_token_without_version_claim_is_rejected(client: TestClient):
    seed_user(client, "alice", password="alice-pass-123")
    legacy_token = jwt.encode(
        {
            "sub": "1",
            "username": "alice",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
        },
        _TEST_CONFIG.auth.secret_key,
        algorithm=_TEST_CONFIG.auth.algorithm,
    )

    response = client.get("/api/projects", headers=auth_headers(legacy_token))

    assert response.status_code == 401


def test_no_token_returns_401(client: TestClient):
    response = client.get("/api/projects")
    assert response.status_code == 401


def test_create_access_token_uses_configured_expire_minutes() -> None:
    configured_auth = AuthConfig(
        secret_key="test-secret-key-for-testing",
        access_token_expire_minutes=60,
    )
    configured_config = AppConfig(auth=configured_auth)

    issued_before = datetime.now(timezone.utc)
    with patch("src.services.auth_service.get_config", return_value=configured_config):
        token = create_access_token(user_id=7, username="carol", auth_version=3)
    issued_after = datetime.now(timezone.utc)

    payload = jwt.decode(
        token,
        configured_auth.secret_key,
        algorithms=[configured_auth.algorithm],
    )
    expected_min = int((issued_before + timedelta(minutes=60)).timestamp()) - 1
    expected_max = int((issued_after + timedelta(minutes=60)).timestamp()) + 1

    assert payload["sub"] == "7"
    assert payload["username"] == "carol"
    assert payload["ver"] == 3
    assert expected_min <= payload["exp"] <= expected_max
