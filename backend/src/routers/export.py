"""Export Router"""

import logging
import os
import tempfile
from datetime import date
from typing import Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from src.config import get_config
from src.database import get_read_session
from src.dependencies import get_current_user, require_admin, verify_project_owner
from src.models.user import User
from src.repositories.project_repository import ProjectRepository
from src.services.export_service import (
    ExportService,
    ExportError,
    export_full_database,
    export_project_database,
    export_user_projects_database,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["export"])


def _remove_temp_file(path: str) -> None:
    """删除导出临时文件；失败仅记 warning，不抛给调用方。"""
    try:
        os.unlink(path)
    except OSError as exc:
        # 静默吞错被明令禁止：残留临时文件必须留痕（见 coding-style 错误处理约定）
        logger.warning("删除导出临时文件失败 %s: %s", path, exc)


@router.post("/projects/{project_id}/export/word")
def export_word(
    project_id: int,
    session: Session = Depends(get_read_session),
    current_user: User = Depends(get_current_user),
    column_width_overrides: Optional[Dict] = Body(default=None, embed=True),
    annotated: bool = Body(default=False, embed=True),
):
    """生成 Word 文档并直接返回文件流

    Args:
        column_width_overrides: 可选的列宽覆盖配置，支持两种格式：
            { "inline:fieldIds=1,2,3": [0.5, 0.3, 0.2] }
            { "form_id": { "normal": [0.3, 0.7], "inline": [...], "unified": [...] } }
            其中每个数组元素表示该列占总宽度的比例（0.0~1.0）
    """
    verify_project_owner(project_id, current_user, session)

    project = ProjectRepository(session).get_by_id(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")

    tmp = tempfile.NamedTemporaryFile(suffix=".docx", delete=False)
    tmp_path = tmp.name
    tmp.close()

    try:
        service = ExportService(session)
        ok = service.export_project_to_word(
            project_id,
            tmp_path,
            column_width_overrides=column_width_overrides,
            bake_toc_page_numbers=True,
            annotated=annotated,
        )
        if not ok:
            _remove_temp_file(tmp_path)
            raise HTTPException(500, "导出失败，请检查项目数据是否完整")

        valid, reason = ExportService._validate_output(tmp_path)
        if not valid:
            _remove_temp_file(tmp_path)
            raise HTTPException(500, f"导出失败: {reason}")
    except HTTPException:
        raise
    except ExportError as exc:
        # 具体导出错误原样透出（main.py 的 export_error_handler 转成 detail + code）
        logger.warning("导出Word文档失败：%s", exc.message)
        _remove_temp_file(tmp_path)
        raise
    except Exception:
        logger.exception("导出Word文档失败")
        _remove_temp_file(tmp_path)
        raise HTTPException(500, "导出失败，请稍后重试或联系管理员")

    response = FileResponse(
        tmp_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"{project.name}_{'aCRF' if annotated else 'CRF'}.docx",
        background=BackgroundTask(os.unlink, tmp_path),
    )
    return response


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


@router.get("/projects/export/database")
def export_user_projects_db(
    current_user: User = Depends(get_current_user),
):
    """导出当前用户全部项目数据库。"""
    config = get_config()
    try:
        tmp_path = export_user_projects_database(config.db_path, current_user.id, current_user.username)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    filename = f"{current_user.username}_projects_{date.today().strftime('%Y%m%d')}.db"
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
