"""项目彻底删除服务：ORM 级联删除 + Logo 文件清理，供回收站操作与定时清理共用。"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from src.config import get_config
from src.models.project import Project

logger = logging.getLogger(__name__)


def resolve_logo_path(project: Project) -> Optional[Path]:
    """解析项目 Logo 文件绝对路径；无 Logo 返回 None。"""
    if not project.company_logo_path:
        return None
    return Path(get_config().upload_path) / "logos" / project.company_logo_path


def purge_project(session: Session, project: Project) -> None:
    """彻底删除项目及其关联数据图与 Logo 文件。

    调用方保证 project 已存在于回收站中（deleted_at 非空）。
    Logo 文件删除失败仅记录 warning，不影响数据库删除结果——
    数据库 commit 先于文件 unlink，进程被杀最多留下孤儿文件，不会有半删的数据图。
    """
    logo_path = resolve_logo_path(project)
    session.delete(project)
    session.flush()
    if logo_path and logo_path.exists():
        try:
            logo_path.unlink()
        except OSError as exc:
            logger.warning("删除 Logo 文件失败 %s: %s", logo_path, exc)