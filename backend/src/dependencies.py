"""共享 FastAPI 依赖"""
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.config import get_config
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
        identity = decode_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="未授权")

    user = session.get(User, identity.user_id)
    if not user or user.username != identity.username:
        raise HTTPException(status_code=401, detail="未授权")
    return user


def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """校验当前用户为管理员（用户名与 config.admin.username 一致），不满足则 403。"""
    admin_username = get_config().admin.username.strip()
    if current_user.username.strip() != admin_username:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return current_user


def verify_project_owner(project_id: int, current_user: User, session: Session):
    """校验项目存在且属于 current_user，返回 Project；失败抛 404/403。"""
    from src.models.project import Project
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问此项目")
    return project
