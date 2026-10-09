"""项目彻底删除服务：ORM 级联删除，供回收站操作与定时清理共用。

Logo 文件不在这里删：purge_project 只返回 Logo 相对文件名，调用方在数据库
提交成功后经 logo_storage_service.delete_file(PROJECT_NAMESPACE, ...) 清理。
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from src.models.project import Project


def purge_project(session: Session, project: Project) -> Optional[str]:
    """彻底删除项目及其关联数据图，返回待删除的 Logo 相对文件名（无 Logo 为 None）。

    调用方保证 project 已存在于回收站中（deleted_at 非空）。
    本函数只做数据库删除（delete + flush），不碰文件系统：调用方必须在
    session.commit() 成功之后调用 logo_storage_service.delete_file()——否则提交
    失败时项目会回到回收站，而 Logo 文件已经丢失。
    """
    logo_rel = project.company_logo_path or None
    session.delete(project)
    session.flush()
    return logo_rel
