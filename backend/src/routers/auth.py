"""认证路由：账号密码登录"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.config import is_production_env
from src.database import get_session
from src.models.user import User
from src.rate_limit import limit_auth_login
from src.services.auth_service import (
    create_access_token,
    has_usable_password_hash,
    verify_password,
)
from src.services.user_admin_service import is_reserved_admin_username

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("用户名不能为空")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not v:
            raise ValueError("密码不能为空")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


def _build_login_error(user: Optional[User]) -> HTTPException:
    if user and not has_usable_password_hash(user.hashed_password) and not is_production_env():
        return HTTPException(
            status_code=401,
            detail="该账号尚未设置密码，请联系管理员完成迁移",
        )
    return HTTPException(status_code=401, detail="用户名或密码错误")


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, data: LoginRequest, session: Session = Depends(get_session)):
    """账号密码登录。"""
    limit_auth_login(request, data.username)
    user = session.scalar(select(User).where(User.username == data.username))
    if not user and is_reserved_admin_username(data.username):
        user = session.scalar(
            select(User)
            .where(func.trim(User.username) == data.username)
            .order_by(User.id)
        )
    if not user or not has_usable_password_hash(user.hashed_password):
        raise _build_login_error(user)
    if not verify_password(data.password, user.hashed_password):
        raise _build_login_error(None)
    return TokenResponse(
        access_token=create_access_token(user.id, user.username, user.auth_version)
    )
