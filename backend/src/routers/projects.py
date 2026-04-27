"""Projects Router"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from pathlib import Path
import shutil

from src.database import get_session
from src.config import get_config
from src.dependencies import get_current_user, require_admin
from src.rate_limit import limit_import_action
from src.models.project import Project
from src.models.user import User
from src.repositories.project_repository import ProjectRepository
from src.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from src.services.project_clone_service import ProjectCloneService
from src.perf import perf_span, record_counter, record_payload_size

from src.services.project_import_service import (
    DatabaseMergeService,
    ProjectDbImportService,
)

router = APIRouter(prefix="/projects", tags=["projects"])


_MAX_IMPORT_SIZE = 200 * 1024 * 1024  # 200 MB
_LOGO_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/bmp", "image/webp"]
_LOGO_BLOCKED_EXTENSIONS = {".svg", ".xml"}


# Task 4.4: 项目导入自定义异常（确保事务回滚 + 稳定 JSON 响应）
class ImportError(Exception):
    """项目导入错误，携带 detail + code + status_code"""

    def __init__(self, message: str, code: str, status_code: int = 400):
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(message)


_IMPORT_ERROR_CODES = {
    "SCHEMA_INCOMPATIBLE": "IMPORT_SCHEMA_INCOMPATIBLE",
    "DATABASE_ERROR": "IMPORT_DATABASE_ERROR",
    "UNEXPECTED_ERROR": "IMPORT_UNEXPECTED_ERROR",
}


async def _save_upload_to_temp(file: UploadFile) -> Path:
    """将上传文件保存到临时文件，返回路径。调用方负责删除。"""
    import os
    import tempfile
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


@router.post("/import/project-db")
async def import_project_db(
    request: Request,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    with perf_span("rate_limit"):
        limit_import_action(request, current_user.id,"project-db-import")
    """导入单项目 .db 文件。"""
    import sqlite3
    with perf_span("upload_read"):
        tmp_path = await _save_upload_to_temp(file)
    record_payload_size(tmp_path.stat().st_size)
    try:
        with perf_span("temp_file_write"):
            result = ProjectDbImportService.import_single_project(
                str(tmp_path), current_user.id, session
            )
        record_counter("project_count", 1)
        return {"project_id": result.project_id, "project_name": result.project_name}
    except ValueError as e:
        raise ImportError(str(e), _IMPORT_ERROR_CODES["SCHEMA_INCOMPATIBLE"])
    except sqlite3.DatabaseError as e:
        raise ImportError(
            f"数据库 schema 不兼容: {e}", _IMPORT_ERROR_CODES["DATABASE_ERROR"]
        )
    except Exception as e:
        raise ImportError(
            f"导入失败: {e}", _IMPORT_ERROR_CODES["UNEXPECTED_ERROR"], 500
        )
    finally:
        tmp_path.unlink(missing_ok=True)


@router.post("/import/database-merge")
async def import_database_merge(
    request: Request,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """整库合并导入。"""
    with perf_span("rate_limit"):
        limit_import_action(request, current_user.id, "database-merge-import")
    import sqlite3
    with perf_span("upload_read"):
        tmp_path = await _save_upload_to_temp(file)
    record_payload_size(tmp_path.stat().st_size)
    try:
        with perf_span("temp_file_write"):
            report = DatabaseMergeService.merge(
                str(tmp_path), current_user.id, session
            )
        record_counter("project_count", len(report.imported))
        return {
            "imported": [
                {"id": r.project_id, "name": r.project_name}
                for r in report.imported
            ],
            "renamed": report.renamed,
        }
    except ValueError as e:
        raise ImportError(str(e), _IMPORT_ERROR_CODES["SCHEMA_INCOMPATIBLE"])
    except sqlite3.DatabaseError as e:
        raise ImportError(
            f"数据库 schema 不兼容: {e}", _IMPORT_ERROR_CODES["DATABASE_ERROR"]
        )
    except Exception as e:
        raise ImportError(
            f"导入失败: {e}", _IMPORT_ERROR_CODES["UNEXPECTED_ERROR"], 500
        )
    finally:
        tmp_path.unlink(missing_ok=True)


@router.post("/import/auto")
async def import_auto(
    request: Request,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """统一导入入口：自动检测 db 文件类型（单项目/多项目），调用对应服务。"""
    limit_import_action(request, current_user.id, "auto-import")
    import sqlite3
    tmp_path = await _save_upload_to_temp(file)
    try:
        report = DatabaseMergeService.merge(
            str(tmp_path), current_user.id, session
        )
        imported = [
            {"id": r.project_id, "name": r.project_name}
            for r in report.imported
        ]
        return {
            "imported": imported,
            "renamed": report.renamed,
            "count": len(imported),
        }
    except ValueError as e:
        raise ImportError(str(e), _IMPORT_ERROR_CODES["SCHEMA_INCOMPATIBLE"])
    except sqlite3.DatabaseError as e:
        raise ImportError(
            f"数据库 schema 不兼容: {e}", _IMPORT_ERROR_CODES["DATABASE_ERROR"]
        )
    except Exception as e:
        raise ImportError(
            f"导入失败: {e}", _IMPORT_ERROR_CODES["UNEXPECTED_ERROR"], 500
        )
    finally:
        tmp_path.unlink(missing_ok=True)


@router.get("", response_model=List[ProjectResponse])
def list_projects(
    user_id: Optional[int] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    target_user_id = current_user.id
    if user_id is not None and user_id != current_user.id:
        require_admin(current_user)
        target_user_id = user_id
    return ProjectRepository(session).get_all_by_owner(target_user_id)


@router.post("/reorder", status_code=204)
def reorder_projects(
    id_list: List[int],
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """批量重排序项目（针对当前用户）"""
    ProjectRepository(session).reorder(current_user.id, id_list)


@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(
    data: ProjectCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    repo = ProjectRepository(session)
    project = repo.create_with_owner(Project(**data.model_dump()), current_user.id)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    project = ProjectRepository(session).get_by_id(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    if project.owner_id != current_user.id:
        raise HTTPException(403, "无权访问此项目")
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int,
    data: ProjectUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    repo = ProjectRepository(session)
    project = repo.get_by_id(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    if project.owner_id != current_user.id:
        raise HTTPException(403, "无权访问此项目")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(project, k, v)
    repo.update(project)
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    from datetime import datetime
    repo = ProjectRepository(session)
    project = repo.get_by_id(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    if project.owner_id != current_user.id:
        raise HTTPException(403, "无权访问此项目")
    
    project.deleted_at = datetime.now()
    repo.update(project)


@router.post("/{project_id}/copy", response_model=ProjectResponse, status_code=201)
def copy_project(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    with perf_span("auth_owner"):
        project = ProjectRepository(session).get_by_id(project_id)
        if not project:
            raise HTTPException(404, "项目不存在")
        if project.owner_id != current_user.id:
            raise HTTPException(403, "无权访问此项目")

    cloned_project = ProjectCloneService.clone(project_id, current_user.id, session)
    with perf_span("flush"):
        session.flush()
    session.refresh(cloned_project)
    return cloned_project


def _resolve_logo_path(upload_dir: Path, logo_name: str) -> Path:
    raw_path = Path(logo_name)
    if raw_path.is_absolute() or raw_path.name != logo_name or ".." in raw_path.parts:
        raise HTTPException(400, "Logo 文件不安全: 非法路径")
    return upload_dir / logo_name


@router.get("/{project_id}/logo")
def get_logo(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    from fastapi.responses import FileResponse as FR
    from src.utils import is_safe_file_upload

    project = ProjectRepository(session).get_by_id(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    if project.owner_id != current_user.id:
        raise HTTPException(403, "无权访问此项目")
    if not project.company_logo_path:
        raise HTTPException(404, "无Logo")

    upload_dir = Path(get_config().upload_path) / "logos"
    logo_path = _resolve_logo_path(upload_dir, project.company_logo_path)
    if logo_path.suffix.lower() in _LOGO_BLOCKED_EXTENSIONS:
        raise HTTPException(400, "Logo 文件不安全: 不允许 SVG/XML 图片，请重新上传位图")
    if not logo_path.exists():
        raise HTTPException(404, "文件不存在")

    file_content = logo_path.read_bytes()
    is_valid, error_msg, _ = is_safe_file_upload(
        filename=logo_path.name,
        content=file_content,
        allowed_mime_types=_LOGO_ALLOWED_TYPES,
        max_size_mb=5,
    )
    if not is_valid:
        raise HTTPException(400, f"Logo 文件不安全: {error_msg}，请重新上传位图")
    return FR(str(logo_path))


class BatchDeleteRequest(BaseModel):
    project_ids: List[int]


@router.post("/batch-delete", status_code=204)
def batch_delete_projects(
    data: BatchDeleteRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """当前用户批量软删除自己的项目。"""
    from datetime import datetime
    repo = ProjectRepository(session)
    for pid in data.project_ids:
        project = repo.get_by_id(pid)
        if project and project.owner_id == current_user.id:
            project.deleted_at = datetime.now()
            repo.update(project)


@router.post("/{project_id}/logo", response_model=ProjectResponse)
def upload_logo(
    project_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    import uuid
    from src.utils import is_safe_file_upload

    repo = ProjectRepository(session)
    project = repo.get_by_id(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    if project.owner_id != current_user.id:
        raise HTTPException(403, "无权访问此项目")

    file_content = file.file.read()

    is_valid, error_msg, detected_ext = is_safe_file_upload(
        filename=file.filename or "logo",
        content=file_content,
        allowed_mime_types=_LOGO_ALLOWED_TYPES,
        max_size_mb=5,
    )
    if not is_valid:
        raise HTTPException(status_code=400, detail=f"文件不安全: {error_msg}")

    safe_filename = f"{uuid.uuid4().hex}.{detected_ext}"

    upload_dir = Path(get_config().upload_path) / "logos"
    upload_dir.mkdir(parents=True, exist_ok=True)

    if project.company_logo_path:
        old_logo = _resolve_logo_path(upload_dir, project.company_logo_path)
        if old_logo.exists():
            old_logo.unlink()

    with open(upload_dir / safe_filename, "wb") as f:
        f.write(file_content)

    project.company_logo_path = safe_filename
    repo.update(project)
    return project
