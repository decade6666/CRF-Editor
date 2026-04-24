"""认证测试辅助。"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Dict, Optional

from fastapi.testclient import TestClient
from sqlalchemy import select

from src.database import get_session
from src.models.user import User
from src.services.auth_service import hash_password, verify_password
from src.services.user_admin_service import is_reserved_admin_username


@contextmanager
def _override_session(client: TestClient):
    """复用测试依赖覆盖中的 Session，便于显式种子数据。"""
    override = client.app.dependency_overrides.get(get_session)
    if override is None:
        yield None
        return

    session_iter = override()
    session = next(session_iter)
    try:
        yield session
    finally:
        try:
            next(session_iter)
        except StopIteration:
            pass


def seed_user(
    client: TestClient,
    username: str,
    is_admin: bool = False,
    password: Optional[str] = "test-pass-123",
) -> Optional[int]:
    """确保测试库中存在指定用户；必要时同步 is_admin 与密码。"""
    normalized = username.strip()
    with _override_session(client) as session:
        if session is None:
            return None

        user = session.scalar(select(User).where(User.username == normalized))
        hashed_password = hash_password(password) if password is not None else None
        if not user:
            user = User(
                username=normalized,
                hashed_password=hashed_password,
                is_admin=is_admin,
            )
            session.add(user)
            session.flush()
        else:
            updated = False
            if is_admin and not user.is_admin:
                user.is_admin = True
                updated = True
            if password is None:
                if user.hashed_password is not None:
                    user.hashed_password = None
                    user.auth_version += 1
                    updated = True
            elif not verify_password(password, user.hashed_password or ""):
                user.hashed_password = hashed_password
                user.auth_version += 1
                updated = True
            if updated:
                session.flush()
        return user.id


def login_as(client: TestClient, username: str, password: str = "test-pass-123") -> str:
    """登录指定用户名，返回 access_token。"""
    normalized = username.strip()
    if is_reserved_admin_username(normalized):
        seed_user(client, normalized, is_admin=True, password=password)
    else:
        seed_user(client, normalized, password=password)
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def auth_headers(token: str) -> Dict[str, str]:
    """生成 Bearer Authorization 头。"""
    return {"Authorization": f"Bearer {token}"}
