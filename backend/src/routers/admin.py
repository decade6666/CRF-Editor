"""管理员路由：身份查询 + 导入功能 + 用户管理"""
import os
import sqlite3
import tempfile
from pathlib import Path
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.config import get_config
from src.database import get_session
from src.dependencies import get_current_user, require_admin
from src.models.project import Project
from src.models.user import User
from src.services.project_import_service import (
    DatabaseMergeService,
    ProjectDbImportService,
)
from src.services.user_admin_service import UserAdminService

router = APIRouter(tags=["admin"])

_MAX_IMPORT_SIZE = 200 * 1024 * 1024  # 200 MB


class MeResponse(BaseModel):
    username: str
    is_admin: bool


@router.get("/auth/me", response_model=MeResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """返回当前用户信息及管理员标识。"""
    return MeResponse(
        username=current_user.username,
        is_admin=current_user.is_admin,
    )


from src.repositories.project_repository import ProjectRepository
from src.schemas.project import ProjectResponse
from src.services.order_service import OrderService
from src.services.project_clone_service import ProjectCloneService


class RecycleBinProjectResponse(ProjectResponse):
    owner_id: Optional[int] = None
    owner_username: Optional[str] = None


@router.get("/admin/projects/recycle-bin", response_model=List[RecycleBinProjectResponse])
def list_recycle_bin(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """管理员查看所有用户的回收站。"""
    from src.models.project import Project
    stmt = (
        select(Project, User.username)
        .outerjoin(User, User.id == Project.owner_id)
        .where(Project.deleted_at.is_not(None))
        .order_by(Project.deleted_at.desc(), Project.id.desc())
    )
    rows = session.execute(stmt).all()
    return [
        RecycleBinProjectResponse(
            **ProjectResponse.model_validate(project).model_dump(),
            owner_id=project.owner_id,
            owner_username=username,
        )
        for project, username in rows
    ]


class BatchDeleteRequest(BaseModel):
    project_ids: List[int]


@router.post("/admin/projects/batch-delete", status_code=204)
def batch_delete_projects(
    data: BatchDeleteRequest,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
):
    """批量软删除项目。"""
    from src.models.project import Project

    projects = session.scalars(
        select(Project).where(Project.id.in_(data.project_ids)).order_by(Project.id)
    ).all()
    if len(projects) != len(data.project_ids):
        raise HTTPException(400, "project_ids 包含不存在的项目")
    invalid = [project.id for project in projects if project.deleted_at is not None]
    if invalid:
        raise HTTPException(400, "project_ids 包含已软删项目")

    now = datetime.now()
    for project in projects:
        project.deleted_at = now
    session.flush()


def _resolve_restore_name(session: Session, owner_id: int, base_name: str) -> str:
    existing_names = set(
        session.scalars(
            select(Project.name).where(Project.owner_id == owner_id, Project.deleted_at.is_(None))
        ).all()
    )
    candidate = f"{base_name} (恢复)"
    if candidate not in existing_names:
        return candidate

    index = 2
    while True:
        candidate = f"{base_name} (恢复{index})"
        if candidate not in existing_names:
            return candidate
        index += 1


@router.post("/admin/projects/{project_id}/restore", response_model=ProjectResponse)
def restore_project(
    project_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
):
    """还原项目。"""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    if project.deleted_at is None:
        raise HTTPException(400, "仅可恢复回收站中的项目")

    existing_active_name = session.scalar(
        select(Project.id).where(
            Project.owner_id == project.owner_id,
            Project.deleted_at.is_(None),
            Project.name == project.name,
            Project.id != project.id,
        )
    )
    if existing_active_name is not None:
        project.name = _resolve_restore_name(session, project.owner_id, project.name)

    next_order = (
        session.scalar(
            select(func.max(Project.order_index)).where(
                Project.owner_id == project.owner_id,
                Project.deleted_at.is_(None),
                Project.id != project.id,
            )
        )
        or 0
    ) + 1

    project.deleted_at = None
    project.order_index = next_order
    session.flush()
    return project


@router.delete("/admin/projects/{project_id}/hard-delete", status_code=204)
def hard_delete_project(
    project_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
):
    """彻底删除项目。"""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    if project.deleted_at is None:
        raise HTTPException(400, "仅可彻底删除回收站中的项目")

    logo_path = None
    if project.company_logo_path:
        logo_path = Path(get_config().upload_path) / "logos" / project.company_logo_path

    session.delete(project)
    session.flush()

    if logo_path and logo_path.exists():
        logo_path.unlink()


class BatchCopyRequest(BaseModel):
    project_ids: List[int]
    target_user_id: int


@router.post("/admin/projects/batch-copy")
def batch_copy_projects(
    data: BatchCopyRequest,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
):
    """批量复制項目给其他用戶。"""
    target_user = session.get(User, data.target_user_id)
    if not target_user:
        raise HTTPException(404, "目标用户不存在")

    results = []
    for pid in data.project_ids:
        try:
            with session.begin_nested():
                cloned = ProjectCloneService.clone(pid, data.target_user_id, session)
                session.flush()
                results.append({"original_id": pid, "new_id": cloned.id, "status": "success"})
        except Exception as e:
            results.append({"original_id": pid, "status": "failed", "error": str(e)})
    return results


class BatchMoveRequest(BaseModel):
    project_ids: List[int]
    target_user_id: int


@router.post("/admin/projects/batch-move")
def batch_move_projects(
    data: BatchMoveRequest,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
):
    """批量迁移項目所有者。"""
    target_user = session.get(User, data.target_user_id)
    if not target_user:
        raise HTTPException(404, "目标用户不存在")

    projects = session.scalars(
        select(Project).where(Project.id.in_(data.project_ids)).order_by(Project.id)
    ).all()
    if len(projects) != len(data.project_ids):
        raise HTTPException(400, "project_ids 包含不存在的项目")
    invalid = [project.id for project in projects if project.deleted_at is not None]
    if invalid:
        raise HTTPException(400, "project_ids 包含已软删项目")

    next_order = (
        session.scalar(
            select(func.max(Project.order_index)).where(
                Project.owner_id == data.target_user_id,
                Project.deleted_at.is_(None),
            )
        )
        or 0
    )

    for offset, project in enumerate(projects, start=1):
        project.owner_id = data.target_user_id
        project.order_index = next_order + offset
    session.flush()
    return {"status": "success"}


# ── 用户管理 ────────────────────────────────────────────────


class UserCreateRequest(BaseModel):
    username: str
    password: str


class UserRenameRequest(BaseModel):
    username: str


class UserPasswordResetRequest(BaseModel):
    password: str


class UserResponse(BaseModel):
    id: int
    username: str

    model_config = {"from_attributes": True}


class UserListItem(BaseModel):
    id: int
    username: str
    project_count: int
    has_password: bool
    is_admin: bool


@router.get("/admin/users", response_model=List[UserListItem])
def list_users(
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
):
    """列出所有用户及其项目数。"""
    users = UserAdminService.list_users(session)
    return [
        UserListItem(
            id=u.id,
            username=u.username,
            project_count=u.project_count,
            has_password=u.has_password,
            is_admin=u.is_admin,
        )
        for u in users
    ]


@router.post("/admin/users", response_model=UserResponse, status_code=201)
def create_user(
    data: UserCreateRequest,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
):
    """新增用户。"""
    try:
        user = UserAdminService.create_user(session, data.username, data.password)
        return user
    except ValueError as e:
        status = 409 if "已存在" in str(e) else 400
        raise HTTPException(status, str(e))


@router.patch("/admin/users/{user_id}", response_model=UserResponse)
def rename_user(
    user_id: int,
    data: UserRenameRequest,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
):
    """修改用户名。"""
    try:
        user = UserAdminService.rename_user(session, user_id, data.username)
        return user
    except ValueError as e:
        status = 409 if "已存在" in str(e) else 400
        raise HTTPException(status, str(e))


@router.put("/admin/users/{user_id}/password", status_code=204)
def reset_user_password(
    user_id: int,
    data: UserPasswordResetRequest,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
):
    """重置用户密码。"""
    try:
        UserAdminService.reset_password(session, user_id, data.password)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/admin/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
):
    """删除用户（有项目时拒绝）。"""
    try:
        UserAdminService.delete_user(session, user_id)
    except ValueError as e:
        status = 409 if "项目" in str(e) else 400
        raise HTTPException(status, str(e))
