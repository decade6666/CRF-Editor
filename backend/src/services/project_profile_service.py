"""项目 profile 原子保存：metadata + Logo 组合写，文件补偿式。

顺序固定：事务外准备新文件（upload 写 UUID / preset 快照复制）→ 事务内写项目行 →
flush 失败删新文件、旧状态原样 → 成功后再删旧文件（失败仅 warning）。
"""

import logging
from contextlib import contextmanager
from typing import Iterator, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from src.models.organization_preset import OrganizationPreset
from src.models.project import Project
from src.schemas.project import ProjectUpdate
from src.services import logo_storage_service as storage

logger = logging.getLogger("src.project_profile")


@contextmanager
def _tx(session: Session) -> Iterator[Session]:
    if session.in_transaction():
        yield session
        session.commit()
    else:
        with session.begin():
            yield session


def update_project_profile(
    project: Project,
    metadata: ProjectUpdate,
    logo_action: str,
    preset_id: Optional[int],
    upload_file,
    session: Session,
) -> Project:
    new_logo_rel = None
    clear_logo = False

    # 事务外准备新文件
    if logo_action == "upload":
        content = storage.read_bounded_upload(upload_file)
        ext = storage.validate_bitmap(upload_file.filename or "logo", content)
        new_logo_rel = storage.prepare_new_file(storage.PROJECT_NAMESPACE, content, ext)
    elif logo_action == "preset":
        preset = session.get(OrganizationPreset, preset_id)
        if preset is None:
            raise HTTPException(404, "机构预设不存在")
        if preset.logo_path:
            new_logo_rel = storage.copy_file_for_project(storage.ORGANIZATION_NAMESPACE, preset.logo_path)
        else:
            clear_logo = True
    elif logo_action == "clear":
        clear_logo = True

    old_logo_rel = project.company_logo_path
    try:
        with _tx(session):
            for key, value in metadata.model_dump(exclude_unset=True).items():
                setattr(project, key, value)
            if new_logo_rel:
                project.company_logo_path = new_logo_rel
            elif clear_logo:
                project.company_logo_path = None
            session.flush()
    except Exception:
        if new_logo_rel:
            storage.delete_file(storage.PROJECT_NAMESPACE, new_logo_rel)
        raise

    if (new_logo_rel or clear_logo) and old_logo_rel:
        storage.delete_file(storage.PROJECT_NAMESPACE, old_logo_rel)
    return project
