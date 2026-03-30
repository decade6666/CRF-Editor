"""认证路由：无密码登录"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.database import get_session
from src.models.user import User
from src.services.auth_service import create_access_token

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
def enter(data: EnterRequest, session: Session = Depends(get_session)):
    """无密码登录：用户名不存在则自动创建。"""
    user = session.scalar(select(User).where(User.username == data.username))
    if not user:
        user = User(username=data.username, hashed_password=None)
        session.add(user)
        session.flush()
    return TokenResponse(access_token=create_access_token(user.username))
