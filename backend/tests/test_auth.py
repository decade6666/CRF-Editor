"""认证接口集成测试。"""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as, seed_user
from src.config import AppConfig, AuthConfig
from src.models.user import User
from src.rate_limit import limiter
from src.services.auth_service import create_access_token, verify_password

_TEST_CONFIG = AppConfig(auth=AuthConfig(secret_key="test-secret-key-for-testing"))


def _user_credentials(engine, username: str):
    with Session(engine) as session:
        user = session.scalar(select(User).where(User.username == username))
        assert user is not None
        return user.hashed_password, user.auth_version


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


def test_login_returns_migration_hint_for_damaged_hash_in_development(
    client: TestClient, engine
):
    seed_user(client, "damaged_user", password="good-pass-123")
    with Session(engine) as session:
        with session.begin():
            user = session.scalar(
                select(User).where(User.username == "damaged_user")
            )
            user.hashed_password = "$pbkdf2-sha256$bad"

    response = client.post(
        "/api/auth/login",
        json={"username": "damaged_user", "password": "good-pass-123"},
    )

    assert response.status_code == 401, response.text
    assert "联系管理员" in response.json()["detail"]


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


def test_self_password_change_success_updates_password_and_auth_version(
    client: TestClient, engine
):
    token = login_as(client, "alice", password="alice-pass-123")
    _, before_version = _user_credentials(engine, "alice")

    response = client.put(
        "/api/auth/me/password",
        json={
            "current_password": "alice-pass-123",
            "new_password": "alice-new-pass-456",
        },
        headers=auth_headers(token),
    )

    assert response.status_code == 204, response.text
    assert response.content == b""
    after_hash, after_version = _user_credentials(engine, "alice")
    assert verify_password("alice-new-pass-456", after_hash)
    assert after_version == before_version + 1


def test_self_password_change_invalidates_old_jwt(client: TestClient):
    token = login_as(client, "alice", password="alice-pass-123")

    response = client.put(
        "/api/auth/me/password",
        json={
            "current_password": "alice-pass-123",
            "new_password": "alice-new-pass-456",
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 204, response.text

    old_token_response = client.get("/api/projects", headers=auth_headers(token))
    assert old_token_response.status_code == 401


def test_self_password_change_updates_login_password(client: TestClient):
    token = login_as(client, "alice", password="alice-pass-123")

    response = client.put(
        "/api/auth/me/password",
        json={
            "current_password": "alice-pass-123",
            "new_password": "alice-new-pass-456",
        },
        headers=auth_headers(token),
    )
    assert response.status_code == 204, response.text

    old_login = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "alice-pass-123"},
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "alice-new-pass-456"},
    )
    assert new_login.status_code == 200, new_login.text
    assert "access_token" in new_login.json()


def test_self_password_change_wrong_current_password_keeps_database_unchanged(
    client: TestClient, engine
):
    token = login_as(client, "alice", password="alice-pass-123")
    before_hash, before_version = _user_credentials(engine, "alice")

    response = client.put(
        "/api/auth/me/password",
        json={
            "current_password": "wrong-pass-123",
            "new_password": "alice-new-pass-456",
        },
        headers=auth_headers(token),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "当前密码错误"
    assert _user_credentials(engine, "alice") == (before_hash, before_version)
    still_valid = client.get("/api/projects", headers=auth_headers(token))
    assert still_valid.status_code == 200, still_valid.text


def test_self_password_change_policy_violation_keeps_database_unchanged(
    client: TestClient, engine
):
    token = login_as(client, "alice", password="alice-pass-123")
    before_hash, before_version = _user_credentials(engine, "alice")

    response = client.put(
        "/api/auth/me/password",
        json={"current_password": "alice-pass-123", "new_password": "short"},
        headers=auth_headers(token),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "密码长度不能少于 8 个字符"
    assert _user_credentials(engine, "alice") == (before_hash, before_version)


def test_self_password_change_rejects_same_password(client: TestClient, engine):
    token = login_as(client, "alice", password="alice-pass-123")
    before_hash, before_version = _user_credentials(engine, "alice")

    response = client.put(
        "/api/auth/me/password",
        json={
            "current_password": "alice-pass-123",
            "new_password": "alice-pass-123",
        },
        headers=auth_headers(token),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "新密码不能与当前密码相同"
    assert _user_credentials(engine, "alice") == (before_hash, before_version)


def test_self_password_change_rejects_admin(client: TestClient, engine):
    token = login_as(client, "admin", password="admin-pass-123")
    before_hash, before_version = _user_credentials(engine, "admin")

    response = client.put(
        "/api/auth/me/password",
        json={
            "current_password": "admin-pass-123",
            "new_password": "admin-new-pass-456",
        },
        headers=auth_headers(token),
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "管理员不能使用普通用户自助改密"
    assert _user_credentials(engine, "admin") == (before_hash, before_version)


def test_self_password_change_rejects_extra_fields(client: TestClient):
    token = login_as(client, "alice", password="alice-pass-123")

    response = client.put(
        "/api/auth/me/password",
        json={
            "current_password": "alice-pass-123",
            "new_password": "alice-new-pass-456",
            "confirm_new_password": "alice-new-pass-456",
        },
        headers=auth_headers(token),
    )

    assert response.status_code == 422


def test_self_password_change_reuses_login_throttle_in_production(
    client: TestClient, monkeypatch
):
    monkeypatch.delenv("CRF_ENV", raising=False)
    token = login_as(client, "alice", password="alice-pass-123")
    limiter.reset()
    monkeypatch.setenv("CRF_ENV", "production")

    try:
        for _ in range(5):
            response = client.put(
                "/api/auth/me/password",
                json={
                    "current_password": "wrong-pass-123",
                    "new_password": "alice-new-pass-456",
                },
                headers=auth_headers(token),
            )
            assert response.status_code == 400, response.text

        blocked = client.put(
            "/api/auth/me/password",
            json={
                "current_password": "wrong-pass-123",
                "new_password": "alice-new-pass-456",
            },
            headers=auth_headers(token),
        )

        assert blocked.status_code == 429, blocked.text
        assert blocked.json()["detail"] == "操作过于频繁，请稍后重试"
        assert int(blocked.headers["retry-after"]) >= 1
    finally:
        limiter.reset()
