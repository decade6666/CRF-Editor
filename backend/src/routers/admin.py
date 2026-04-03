"""管理员路由：身份查询 + 导入功能 + 用户管理"""
import os
import sqlite3
import tempfile
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.config import get_config
from src.database import get_session
from src.dependencies import get_current_user, require_admin
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
    admin_username = get_config().admin.username.strip()
    return MeResponse(
        username=current_user.username,
        is_admin=current_user.username.strip() == admin_username,
    )


from src.repositories.project_repository import ProjectRepository
from src.schemas.project import ProjectResponse
from src.services.project_clone_service import ProjectCloneService


@router.get("/admin/projects/recycle-bin", response_model=list[ProjectResponse])
def list_recycle_bin(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """管理员查看所有用户的回收站（或按需调整为仅看自己的）。"""
    from sqlalchemy import select
    from src.models.project import Project
    stmt = select(Project).where(Project.deleted_at.is_not(None)).order_by(Project.deleted_at.desc())
    return list(session.scalars(stmt).all())


class BatchDeleteRequest(BaseModel):
    project_ids: List[int]


@router.post("/admin/projects/batch-delete", status_code=204)
def batch_delete_projects(
    data: BatchDeleteRequest,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
):
    """批量软删除项目。"""
    from datetime import datetime
    from src.models.project import Project
    for pid in data.project_ids:
        project = session.get(Project, pid)
        if project and project.deleted_at is None:
            project.deleted_at = datetime.now()
    session.flush()


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
    project.deleted_at = None
    session.flush()
    return project


@router.delete("/admin/projects/{project_id}/hard-delete", status_code=204)
def hard_delete_project(
    project_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
):
    """彻底删除项目。"""
    from sqlalchemy import delete
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    session.delete(project)
    session.flush()


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
    results = []
    for pid in data.project_ids:
        try:
            cloned = ProjectCloneService.clone(pid, data.target_user_id, session)
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
    for pid in data.project_ids:
        project = session.get(Project, pid)
        if project:
            project.owner_id = data.target_user_id
    session.flush()
    return {"status": "success"}


# ── 用户管理 ────────────────────────────────────────────────


class UserCreateRequest(BaseModel):
    username: str


class UserRenameRequest(BaseModel):
    username: str


class UserResponse(BaseModel):
    id: int
    username: str

    model_config = {"from_attributes": True}


class UserListItem(BaseModel):
    id: int
    username: str
    project_count: int


@router.get("/admin/users", response_model=list[UserListItem])
def list_users(
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
):
    """列出所有用户及其项目数。"""
    users = UserAdminService.list_users(session)
    return [
        UserListItem(id=u.id, username=u.username, project_count=u.project_count)
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
        user = UserAdminService.create_user(session, data.username)
        return user
    except ValueError as e:
        raise HTTPException(409, str(e))


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
