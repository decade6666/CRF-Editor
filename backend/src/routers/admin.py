"""管理员路由：身份查询 + 导入功能 + 用户管理"""
import os
import sqlite3
import tempfile
from pathlib import Path

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


async def _save_upload_to_temp(file: UploadFile) -> Path:
    """将上传文件保存到临时文件，返回路径。调用方负责删除。"""
    fd, tmp_path = tempfile.mkstemp(suffix=".db")
    total_size = 0
    first_chunk = True
    try:
        with os.fdopen(fd, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                if first_chunk:
                    first_chunk = False
                    if not chunk[:16].startswith(b"SQLite format 3"):
                        raise HTTPException(400, "文件不是有效的 SQLite 数据库")
                total_size += len(chunk)
                if total_size > _MAX_IMPORT_SIZE:
                    raise HTTPException(
                        400,
                        f"文件大小超过限制（最大 {_MAX_IMPORT_SIZE // 1024 // 1024} MB）",
                    )
                f.write(chunk)
        if first_chunk:
            raise HTTPException(400, "文件不是有效的 SQLite 数据库")
    except Exception:
        os.unlink(tmp_path)
        raise
    return Path(tmp_path)


@router.post("/admin/import/project-db")
async def import_project_db(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """导入单项目 .db 文件。"""
    tmp_path = await _save_upload_to_temp(file)
    try:
        result = ProjectDbImportService.import_single_project(
            str(tmp_path), current_user.id, session
        )
        return {"project_id": result.project_id, "project_name": result.project_name}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except sqlite3.DatabaseError as e:
        raise HTTPException(400, f"数据库 schema 不兼容: {e}")
    finally:
        tmp_path.unlink(missing_ok=True)


@router.post("/admin/import/database-merge")
async def import_database_merge(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """整库合并导入。"""
    tmp_path = await _save_upload_to_temp(file)
    try:
        report = DatabaseMergeService.merge(
            str(tmp_path), current_user.id, session
        )
        return {
            "imported": [
                {"id": r.project_id, "name": r.project_name}
                for r in report.imported
            ],
            "renamed": report.renamed,
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
    except sqlite3.DatabaseError as e:
        raise HTTPException(400, f"数据库 schema 不兼容: {e}")
    finally:
        tmp_path.unlink(missing_ok=True)


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
