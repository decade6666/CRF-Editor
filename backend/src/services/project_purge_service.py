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


def remove_logo_file(path: Optional[Path]) -> None:
    """删除 Logo 文件；None 或文件已不存在时静默跳过，删除失败只记 warning。

    调用方必须先在数据库提交项目删除，再调用本函数——这样进程被杀最多留下
    孤儿文件，不会出现「文件已删但项目回到回收站」的半删状态。
    """
    if path is None:
        return
    try:
        # missing_ok：不先判断存在再删，避免竞态，且 stat 类错误同样只记 warning
        path.unlink(missing_ok=True)
    except OSError as exc:
        logger.warning("删除 Logo 文件失败 %s: %s", path, exc)


def purge_project(session: Session, project: Project) -> Optional[Path]:
    """彻底删除项目及其关联数据图，返回待删除的 Logo 文件路径（无 Logo 为 None）。

    调用方保证 project 已存在于回收站中（deleted_at 非空）。
    本函数只做数据库删除（delete + flush），不碰文件系统：调用方必须在
    session.commit() 成功之后调用 remove_logo_file()——否则提交失败时
    项目会回到回收站，而 Logo 文件已经丢失。
    """
    logo_path = resolve_logo_path(project)
    session.delete(project)
    session.flush()
    return logo_path