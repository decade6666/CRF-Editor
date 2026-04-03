"""Export Router"""
import logging
import tempfile
import os
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from src.config import get_config
from src.database import get_read_session
from src.dependencies import get_current_user, require_admin, verify_project_owner
from src.models.user import User
from src.repositories.project_repository import ProjectRepository
from src.services.export_service import ExportService, export_full_database, export_project_database

logger = logging.getLogger(__name__)
router = APIRouter(tags=["export"])


@router.post("/projects/{project_id}/export/word")
def export_word(
    project_id: int,
    session: Session = Depends(get_read_session),
    current_user: User = Depends(get_current_user),
):
    """生成 Word 文档并直接返回文件流"""
    verify_project_owner(project_id, current_user, session)
    project = ProjectRepository(session).get_by_id(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")

    tmp = tempfile.NamedTemporaryFile(suffix=".docx", delete=False)
    tmp_path = tmp.name
    tmp.close()

    try:
        service = ExportService(session)
        ok = service.export_project_to_word(project_id, tmp_path)
        if not ok:
            os.unlink(tmp_path)
            raise HTTPException(500, "导出失败，请检查项目数据是否完整")

        valid, reason = ExportService._validate_output(tmp_path)
        if not valid:
            os.unlink(tmp_path)
            raise HTTPException(500, f"导出失败: {reason}")
    except HTTPException:
        raise
    except Exception:
        logger.exception("导出Word文档失败")
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise HTTPException(500, "导出失败，请稍后重试或联系管理员")

    filename = f"{project.name}_CRF.docx"
    return FileResponse(
        tmp_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
        background=BackgroundTask(os.unlink, tmp_path),
    )


@router.get("/export/database")
def export_database(
    current_user: User = Depends(require_admin),
):
    """导出整个数据库"""
    config = get_config()
    tmp_path = export_full_database(config.db_path)
    filename = f"crf_editor_full_{date.today().strftime('%Y%m%d')}.db"
    return FileResponse(
        tmp_path,
        media_type="application/octet-stream",
        filename=filename,
        background=BackgroundTask(os.unlink, tmp_path),
    )


@router.get("/projects/{project_id}/export/database")
def export_project_db(
    project_id: int,
    session: Session = Depends(get_read_session),
    current_user: User = Depends(get_current_user),
):
    """导出单项目数据库"""
    project = verify_project_owner(project_id, current_user, session)
    config = get_config()
    tmp_path = export_project_database(config.db_path, project_id, project.name)
    filename = f"{project.name}_template_{date.today().strftime('%Y%m%d')}.db"
    return FileResponse(
        tmp_path,
        media_type="application/octet-stream",
        filename=filename,
        background=BackgroundTask(os.unlink, tmp_path),
    )
