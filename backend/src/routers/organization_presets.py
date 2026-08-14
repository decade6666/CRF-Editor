"""机构预设路由：管理员 CRUD + 普通用户只读候选与 Logo。"""
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from src.database import get_plain_session, get_session
from src.dependencies import get_current_user, require_admin
from src.models.user import User
from src.schemas.organization_preset import (
    OrganizationPresetResponse,
    OrganizationPresetUpsert,
    PresetCandidateResponse,
)
from src.services import logo_storage_service as storage
from src.services import organization_preset_service as service

router = APIRouter(tags=["organization-presets"])

_VALID_LOGO_ACTIONS = {"keep", "upload", "clear"}


def _parse_metadata(metadata_raw: str) -> OrganizationPresetUpsert:
    try:
        data = json.loads(metadata_raw)
    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(400, "metadata 必须是合法 JSON") from exc
    try:
        return OrganizationPresetUpsert.model_validate(data)
    except ValidationError as exc:
        first = exc.errors()[0]
        raise HTTPException(422, f"{first['loc'][-1]}: {first['msg']}") from exc


def _handle_preset_errors(exc: Exception) -> None:
    if isinstance(exc, service.PresetConflictError):
        raise HTTPException(409, exc.message) from exc
    if isinstance(exc, HTTPException):
        raise exc
    raise exc


@router.get("/admin/organization-presets", response_model=List[OrganizationPresetResponse])
def admin_list_presets(
    session: Session = Depends(get_session),
    _: User = Depends(require_admin),
):
    return service.list_presets(session)


@router.post("/admin/organization-presets", response_model=OrganizationPresetResponse, status_code=201)
def admin_create_preset(
    metadata: str = Form(...),
    logo_action: str = Form(...),
    file: Optional[UploadFile] = File(None),
    session: Session = Depends(get_plain_session),
    _: User = Depends(require_admin),
):
    upsert = _parse_metadata(metadata)
    if logo_action not in _VALID_LOGO_ACTIONS:
        raise HTTPException(422, "logo_action 必须是 keep/upload/clear")
    if logo_action == "upload" and file is None:
        raise HTTPException(422, "logo_action=upload 需要 file")
    try:
        return service.create_preset(upsert, logo_action, file, session=session)
    except Exception as exc:
        _handle_preset_errors(exc)


@router.put("/admin/organization-presets/{preset_id}", response_model=OrganizationPresetResponse)
def admin_update_preset(
    preset_id: int,
    metadata: str = Form(...),
    logo_action: str = Form(...),
    file: Optional[UploadFile] = File(None),
    session: Session = Depends(get_plain_session),
    _: User = Depends(require_admin),
):
    upsert = _parse_metadata(metadata)
    if logo_action not in _VALID_LOGO_ACTIONS:
        raise HTTPException(422, "logo_action 必须是 keep/upload/clear")
    if logo_action == "upload" and file is None:
        raise HTTPException(422, "logo_action=upload 需要 file")
    try:
        return service.update_preset(preset_id, upsert, logo_action, file, session=session)
    except Exception as exc:
        _handle_preset_errors(exc)


@router.delete("/admin/organization-presets/{preset_id}", status_code=204)
def admin_delete_preset(
    preset_id: int,
    session: Session = Depends(get_plain_session),
    _: User = Depends(require_admin),
):
    service.delete_preset(preset_id, session=session)


@router.get("/organization-presets", response_model=List[PresetCandidateResponse])
def list_candidates(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    return [
        PresetCandidateResponse(
            id=p.id,
            data_management_unit=p.data_management_unit,
            has_logo=bool(p.logo_path),
        )
        for p in service.list_candidates(session)
    ]


@router.get("/organization-presets/{preset_id}/logo")
def get_preset_logo(
    preset_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    from src.models.organization_preset import OrganizationPreset

    preset = session.get(OrganizationPreset, preset_id)
    if preset is None:
        raise HTTPException(404, "机构预设不存在")
    if not preset.logo_path:
        raise HTTPException(404, "无Logo")
    try:
        content = storage.read_safe(storage.ORGANIZATION_NAMESPACE, preset.logo_path)
    except FileNotFoundError as exc:
        raise HTTPException(404, "文件不存在") from exc
    except ValueError as exc:
        raise HTTPException(400, f"Logo 文件不安全: {exc}") from exc
    path = storage.safe_resolve(storage.ORGANIZATION_NAMESPACE, preset.logo_path)
    return FileResponse(str(path))
