"""机构预设服务：文件 + DB 补偿式写入。

普通 get_session 在路由返回后才提交，无法在函数内感知 commit 失败并补偿文件；
因此组合写默认使用服务自有短生命周期 Session(get_engine()) 事务：
准备新文件（事务外）→ 事务内复核/写 DB → commit 失败删新文件；成功再删旧文件。
测试可注入内存 Session 以覆盖真实引擎。
"""
import logging
from contextlib import contextmanager
from typing import Iterator, Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.database import get_engine
from src.models.organization_preset import OrganizationPreset
from src.schemas.organization_preset import OrganizationPresetUpsert
from src.services import logo_storage_service as storage

logger = logging.getLogger("src.organization_preset")


class PresetConflictError(Exception):
    """预设名称/单位唯一冲突（预检失败或数据库约束兜底）。"""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


@contextmanager
def _tx(session: Session) -> Iterator[Session]:
    """已处于事务中的 session（路由 get_session / 测试覆盖）直接复用，否则自建 begin。"""
    if session.in_transaction():
        yield session
    else:
        with session.begin():
            yield session


def _conflict_message(session: Session, upsert: OrganizationPresetUpsert, exclude_id: Optional[int]) -> Optional[str]:
    stmt = select(OrganizationPreset).where(OrganizationPreset.name == upsert.name)
    if exclude_id is not None:
        stmt = stmt.where(OrganizationPreset.id != exclude_id)
    if session.scalar(stmt):
        return "机构名称已存在"
    if upsert.data_management_unit is not None:
        stmt = select(OrganizationPreset).where(
            OrganizationPreset.data_management_unit == upsert.data_management_unit
        )
        if exclude_id is not None:
            stmt = stmt.where(OrganizationPreset.id != exclude_id)
        if session.scalar(stmt):
            return "数据管理单位已存在"
    return None


def _prepare_upload(logo_action: str, upload_file) -> Optional[str]:
    if logo_action != "upload":
        return None
    content = storage.read_bounded_upload(upload_file)
    ext = storage.validate_bitmap(upload_file.filename or "logo", content)
    return storage.prepare_new_file(storage.ORGANIZATION_NAMESPACE, content, ext)


def _discard_new_file(rel: Optional[str]) -> None:
    if rel:
        storage.delete_file(storage.ORGANIZATION_NAMESPACE, rel)


def create_preset(
    upsert: OrganizationPresetUpsert,
    logo_action: str,
    upload_file,
    session: Optional[Session] = None,
) -> OrganizationPreset:
    new_logo_rel = _prepare_upload(logo_action, upload_file)
    owns_session = session is None
    session = session or Session(get_engine())
    try:
        with _tx(session):
            conflict = _conflict_message(session, upsert, exclude_id=None)
            if conflict:
                raise PresetConflictError(conflict)
            preset = OrganizationPreset(
                name=upsert.name,
                data_management_unit=upsert.data_management_unit,
                logo_path=new_logo_rel,
            )
            session.add(preset)
            try:
                session.flush()
            except IntegrityError as exc:
                raise PresetConflictError("机构名称或数据管理单位已存在") from exc
            session.refresh(preset)
    except Exception:
        _discard_new_file(new_logo_rel)
        raise
    finally:
        if owns_session:
            session.close()
    return preset


def update_preset(
    preset_id: int,
    upsert: OrganizationPresetUpsert,
    logo_action: str,
    upload_file,
    session: Optional[Session] = None,
) -> OrganizationPreset:
    new_logo_rel = _prepare_upload(logo_action, upload_file)
    owns_session = session is None
    session = session or Session(get_engine())
    old_logo_rel = None
    try:
        with _tx(session):
            preset = session.get(OrganizationPreset, preset_id)
            if preset is None:
                raise HTTPException(404, "机构预设不存在")
            conflict = _conflict_message(session, upsert, exclude_id=preset_id)
            if conflict:
                raise PresetConflictError(conflict)
            old_logo_rel = preset.logo_path
            preset.name = upsert.name
            preset.data_management_unit = upsert.data_management_unit
            if logo_action == "upload":
                preset.logo_path = new_logo_rel
            elif logo_action == "clear":
                preset.logo_path = None
            try:
                session.flush()
            except IntegrityError as exc:
                raise PresetConflictError("机构名称或数据管理单位已存在") from exc
            session.refresh(preset)
    except Exception:
        _discard_new_file(new_logo_rel)
        raise
    finally:
        if owns_session:
            session.close()
    if logo_action in ("upload", "clear") and old_logo_rel:
        storage.delete_file(storage.ORGANIZATION_NAMESPACE, old_logo_rel)
    return preset


def delete_preset(preset_id: int, session: Optional[Session] = None) -> None:
    owns_session = session is None
    session = session or Session(get_engine())
    logo_rel = None
    try:
        with _tx(session):
            preset = session.get(OrganizationPreset, preset_id)
            if preset is None:
                raise HTTPException(404, "机构预设不存在")
            logo_rel = preset.logo_path
            session.delete(preset)
    finally:
        if owns_session:
            session.close()
    if logo_rel:
        storage.delete_file(storage.ORGANIZATION_NAMESPACE, logo_rel)


def list_presets(session: Session) -> list[OrganizationPreset]:
    return list(
        session.scalars(
            select(OrganizationPreset).order_by(OrganizationPreset.name.collate("NOCASE"))
        )
    )


def list_candidates(session: Session) -> list[OrganizationPreset]:
    """仅非空单位候选，按机构名称 NOCASE 稳定排序。"""
    return list(
        session.scalars(
            select(OrganizationPreset)
            .where(OrganizationPreset.data_management_unit.is_not(None))
            .order_by(OrganizationPreset.name.collate("NOCASE"))
        )
    )
