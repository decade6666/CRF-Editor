"""项目彻底删除服务：ORM 级联删除，供回收站操作与定时清理共用。

Logo 文件不在这里删：purge_project 只返回 Logo 相对文件名，调用方在数据库
提交成功后经 logo_storage_service.delete_file(PROJECT_NAMESPACE, ...) 清理。
"""

from __future__ import annotations

from contextlib import ExitStack, contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.config import AppConfig
from src.models.design_baseline import DesignBaseline
from src.models.project import Project
from src.services import design_baseline_storage_service as history_storage
from src.services.design_baseline_state_service import project_history_removal


@dataclass(frozen=True)
class HistoryPurgeFiles:
    root: Path | None
    keys: tuple[str, ...]

    def cleanup_after_commit(self) -> None:
        if self.root is not None:
            for key in self.keys:
                history_storage.cleanup_published(self.root, key)


@contextmanager
def reserve_project_history_purge(session: Session, project_id: int, config: AppConfig) -> Iterator[HistoryPurgeFiles]:
    """Reserve live history only, across DB deletion/commit/post-commit cleanup."""
    with project_history_removal(project_id), ExitStack() as leases:
        keys = tuple(
            session.scalars(select(DesignBaseline.storage_key).where(DesignBaseline.project_id == project_id)).all()
        )
        root = history_storage.history_root(config) if keys else None
        for key in keys:
            leases.enter_context(history_storage.history_removal(root, key))
        yield HistoryPurgeFiles(root, keys)


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
