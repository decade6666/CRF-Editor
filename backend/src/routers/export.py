"""Export Router"""
import logging
import tempfile
import os
import uuid
import time
from typing import Dict, Tuple
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from src.database import get_session, get_read_session
from src.repositories.project_repository import ProjectRepository
from src.services.export_service import ExportService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["export"])

# 临时存储导出文件 {token: (tmp_path, filename, expire_time)}
_export_cache: Dict[str, Tuple[str, str, float]] = {}
_TOKEN_TTL = 300  # 令牌有效期5分钟


def _cleanup_expired():
    """清理过期的导出缓存及临时文件"""
    now = time.time()
    expired = [k for k, v in _export_cache.items() if v[2] < now]
    for k in expired:
        tmp_path = _export_cache.pop(k)[0]
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@router.post("/projects/{project_id}/export/word/prepare")
def prepare_export(project_id: int, session: Session = Depends(get_read_session)):
    """生成导出文件并返回下载令牌（使用只读 Session，不持有写事务）"""
    _cleanup_expired()
    project = ProjectRepository(session).get_by_id(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")

    tmp = tempfile.NamedTemporaryFile(suffix=".docx", delete=False)
    tmp_path = tmp.name
    tmp.close()

    try:
        ok = ExportService(session).export_project_to_word(project_id, tmp_path)
        if not ok:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
            raise HTTPException(500, "导出失败，请检查项目数据是否完整")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("导出Word文档失败")
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        raise HTTPException(500, "导出失败，请稍后重试或联系管理员")

    token = str(uuid.uuid4())
    filename = f"{project.name}_CRF.docx"
    _export_cache[token] = (tmp_path, filename, time.time() + _TOKEN_TTL)
    return {"token": token}


@router.get("/export/download/{token}")
def download_by_token(token: str):
    """通过令牌下载文件，令牌5分钟内有效，支持IDM重复请求"""
    entry = _export_cache.get(token)
    if not entry:
        raise HTTPException(404, "下载链接已过期，请重新导出")

    tmp_path, filename, expire_time = entry
    if time.time() > expire_time or not os.path.exists(tmp_path):
        _export_cache.pop(token, None)
        raise HTTPException(404, "下载链接已过期，请重新导出")

    return FileResponse(
        tmp_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
    )
