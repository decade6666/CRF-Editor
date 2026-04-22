"""认证路由：无密码登录"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.database import get_session
from src.models.user import User
from src.rate_limit import limit_auth_enter
from src.services.auth_service import create_access_token
from src.services.user_admin_service import is_reserved_admin_username

router = APIRouter(prefix="/auth", tags=["auth"])


class EnterRequest(BaseModel):
    username: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("用户名不能为空")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/enter", response_model=TokenResponse)
async def enter(request: Request, data: EnterRequest, session: Session = Depends(get_session)):
    """无密码登录：用户名不存在则自动创建，但保留管理员账号除外。"""
    limit_auth_enter(request, data.username)
    user = session.scalar(select(User).where(User.username == data.username))
    if not user and is_reserved_admin_username(data.username):
        user = session.scalar(
            select(User)
            .where(func.trim(User.username) == data.username)
            .order_by(User.id)
        )
    if not user:
        if is_reserved_admin_username(data.username):
            raise HTTPException(status_code=403, detail="保留管理员账号仅允许在启动时初始化")
        user = User(username=data.username, hashed_password=None, is_admin=False)
        session.add(user)
        session.flush()
    return TokenResponse(
        access_token=create_access_token(user.id, user.username)
    )
