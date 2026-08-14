"""Projects Router"""
import logging
from typing import List, Optional

logger = logging.getLogger("src.projects")
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import update
from sqlalchemy.orm import Session
from pathlib import Path

from src.database import get_plain_session, get_session
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
_PROFILE_LOGO_ACTIONS = {"keep", "preset", "upload", "clear"}


class ProjectProfileMetadata(ProjectUpdate):
    """项目 profile 的 metadata JSON：拒绝一切未声明字段（含 company_logo_path）。"""

    model_config = {"extra": "forbid"}


def _parse_profile_metadata(metadata_raw: str) -> ProjectProfileMetadata:
    import json as _json

    from pydantic import ValidationError

    try:
        data = _json.loads(metadata_raw)
    except (_json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(400, "metadata 必须是合法 JSON") from exc
    try:
        return ProjectProfileMetadata.model_validate(data)
    except ValidationError as exc:
        messages = []
        for err in exc.errors():
            loc = ".".join(str(part) for part in err["loc"]) or "metadata"
            messages.append(f"{loc}: {err['msg']}")
        raise HTTPException(422, "; ".join(messages)) from exc


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


def _save_bytes_to_temp(filename: str, content: bytes) -> Path:
    """将上传内容保存到临时文件，返回路径。调用方负责删除。"""
    import os
    import tempfile
    if not content[:16].startswith(b"SQLite format 3"):
        raise HTTPException(400, "文件不是有效的 SQLite 数据库")
    if len(content) > _MAX_IMPORT_SIZE:
        raise HTTPException(
            400,
            f"文件大小超过限制（最大 {_MAX_IMPORT_SIZE // 1024 // 1024} MB）",
        )
    suffix = Path(filename or 'upload.db').suffix or '.db'
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(content)
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
        file_bytes = await file.read()
    with perf_span("temp_file_write"):
        tmp_path = _save_bytes_to_temp(file.filename or 'upload.db', file_bytes)
    record_payload_size(tmp_path.stat().st_size)
    try:
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
        file_bytes = await file.read()
    with perf_span("temp_file_write"):
        tmp_path = _save_bytes_to_temp(file.filename or 'upload.db', file_bytes)
    record_payload_size(tmp_path.stat().st_size)
    try:
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
    with perf_span("upload_read"):
        file_bytes = await file.read()
    with perf_span("temp_file_write"):
        tmp_path = _save_bytes_to_temp(file.filename or 'upload.db', file_bytes)
    record_payload_size(tmp_path.stat().st_size)
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


@router.put("/{project_id}/profile", response_model=ProjectResponse)
def update_project_profile(
    project_id: int,
    metadata: str = Form(...),
    logo_action: str = Form(...),
    preset_id: Optional[int] = Form(None),
    file: Optional[UploadFile] = File(None),
    session: Session = Depends(get_plain_session),
    current_user: User = Depends(get_current_user),
):
    from src.services.project_profile_service import update_project_profile as _apply_profile

    repo = ProjectRepository(session)
    project = repo.get_by_id(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    if project.owner_id != current_user.id:
        raise HTTPException(403, "无权访问此项目")

    upsert = _parse_profile_metadata(metadata)
    if logo_action not in _PROFILE_LOGO_ACTIONS:
        raise HTTPException(422, "logo_action 必须是 keep/preset/upload/clear")
    if logo_action == "upload" and file is None:
        raise HTTPException(422, "logo_action=upload 需要 file")
    if logo_action == "preset" and preset_id is None:
        raise HTTPException(422, "logo_action=preset 需要 preset_id")
    try:
        return _apply_profile(project, upsert, logo_action, preset_id, file, session)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except FileNotFoundError as exc:
        # 预设 Logo 文件在磁盘缺失：记录真实路径供排查，响应不泄露内部路径
        logger.warning("预设 Logo 文件缺失，无法复制到项目: %s", exc)
        raise HTTPException(500, "保存项目信息失败：预设 Logo 文件缺失") from exc
    except Exception as exc:
        logger.exception("保存项目信息失败（项目 %s）", project_id)
        raise HTTPException(500, "保存项目信息失败：未知错误") from exc


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


@router.get("/{project_id}/logo")
def get_logo(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    from fastapi.responses import FileResponse as FR
    from src.services.logo_storage_service import (
        PROJECT_NAMESPACE,
        read_safe,
        safe_resolve,
    )

    project = ProjectRepository(session).get_by_id(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    if project.owner_id != current_user.id:
        raise HTTPException(403, "无权访问此项目")
    if not project.company_logo_path:
        raise HTTPException(404, "无Logo")

    try:
        read_safe(PROJECT_NAMESPACE, project.company_logo_path)
    except FileNotFoundError as exc:
        raise HTTPException(404, "文件不存在") from exc
    except ValueError as exc:
        raise HTTPException(400, f"Logo 文件不安全: {exc}，请重新上传位图") from exc
    return FR(str(safe_resolve(PROJECT_NAMESPACE, project.company_logo_path)))


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
    if not data.project_ids:
        return
    # 单条带 owner 过滤的批量软删除：仅命中本人项目，他人/不存在 id 被 WHERE 静默排除，
    # 行为与原逐条「get_by_id + owner 校验 + 重写 deleted_at」等价；deleted_at 绑定
    # datetime 对象（ORM 序列化，非 isoformat 字符串），不加 deleted_at IS NULL 过滤以保持等价。
    session.execute(
        update(Project)
        .where(Project.id.in_(data.project_ids))
        .where(Project.owner_id == current_user.id)
        .values(deleted_at=datetime.now())
    )


