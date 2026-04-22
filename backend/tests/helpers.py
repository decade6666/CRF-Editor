"""认证测试辅助。"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Dict, Optional

from fastapi.testclient import TestClient
from sqlalchemy import select

from src.database import get_session
from src.models.user import User
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


def seed_user(client: TestClient, username: str, is_admin: bool = False) -> Optional[int]:
    """确保测试库中存在指定用户；必要时同步 is_admin。"""
    normalized = username.strip()
    with _override_session(client) as session:
        if session is None:
            return None

        user = session.scalar(select(User).where(User.username == normalized))
        if not user:
            user = User(
                username=normalized,
                hashed_password=None,
                is_admin=is_admin,
            )
            session.add(user)
            session.flush()
        elif is_admin and not user.is_admin:
            user.is_admin = True
            session.flush()
        return user.id


def login_as(client: TestClient, username: str) -> str:
    """登录指定用户名，返回 access_token。"""
    normalized = username.strip()
    if is_reserved_admin_username(normalized):
        seed_user(client, normalized, is_admin=True)
    response = client.post("/api/auth/enter", json={"username": username})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def auth_headers(token: str) -> Dict[str, str]:
    """生成 Bearer Authorization 头。"""
    return {"Authorization": f"Bearer {token}"}
