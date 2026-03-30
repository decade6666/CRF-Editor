"""共享 FastAPI 依赖"""
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.database import get_session
from src.models.user import User
from src.services.auth_service import decode_token

_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(_oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    """从 Bearer token 解码并返回当前用户，失败返回 401。"""
    try:
        username = decode_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="未授权")

    user = session.scalar(select(User).where(User.username == username))
    if not user:
        raise HTTPException(status_code=401, detail="未授权")
    return user


def verify_project_owner(project_id: int, current_user: User, session: Session):
    """校验项目存在且属于 current_user，返回 Project；失败抛 404/403。"""
    from src.models.project import Project
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问此项目")
    return project
