"""Settings Router - 全局配置读写"""

from pathlib import Path
from typing import Any, List


from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator


from src.config import get_config, update_config
from src.dependencies import require_admin
from src.models.user import User

from src.utils import is_safe_path


router = APIRouter(tags=["settings"])

# AI 复核已移除：旧客户端 / 旧页面提交的 ai_* 写入参数在此统一拒绝（不回显提交值）。
LEGACY_AI_REMOVED_DETAIL = "AI 复核功能已移除，请刷新页面后重试"
_LEGACY_AI_KEYS = (
    "ai_enabled",
    "ai_api_url",
    "ai_api_key",
    "ai_model",
    "ai_api_format",
)


class SettingsResponse(BaseModel):
    template_path: str


class SettingsUpdateRequest(BaseModel):
    template_path: str

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_ai_fields(cls, data: Any) -> Any:
        if isinstance(data, dict) and any(key in data for key in _LEGACY_AI_KEYS):
            raise HTTPException(status_code=422, detail=LEGACY_AI_REMOVED_DETAIL)
        return data


def _get_allowed_template_dirs(cfg) -> List[str]:

    db_parent = Path(cfg.db_path).resolve().parent
    upload_dir = Path(cfg.upload_path).resolve()
    return [str(db_parent), str(upload_dir)]


def _validate_template_path(raw_path: str, cfg) -> str:

    if not raw_path:
        raise HTTPException(status_code=400, detail="模板路径不安全: 路径不能为空")

    candidate = Path(raw_path)
    if not candidate.is_absolute():
        config_dir = Path(cfg.db_path).resolve().parent.parent
        candidate = config_dir / raw_path
    resolved_path = candidate.resolve()

    if resolved_path.suffix.lower() != ".db":
        raise HTTPException(status_code=400, detail="模板路径不安全: 模板文件必须是 .db 格式")

    is_valid, error_msg = is_safe_path(
        str(resolved_path),
        allowed_dirs=_get_allowed_template_dirs(cfg),
    )
    if not is_valid:
        raise HTTPException(status_code=400, detail=f"模板路径不安全: {error_msg}")

    return str(resolved_path)


@router.get("/settings", response_model=SettingsResponse)
def get_settings(current_user: User = Depends(require_admin)):
    """读取当前配置（仅模板路径）"""

    cfg = get_config()

    return SettingsResponse(template_path=cfg.template_path)


@router.put("/settings", response_model=SettingsResponse)
def update_settings(payload: SettingsUpdateRequest, current_user: User = Depends(require_admin)):
    """更新配置并写入 config.yaml"""

    cfg = get_config()
    safe_template_path = _validate_template_path(payload.template_path, cfg)

    cfg = update_config(
        {
            "template": {"template_path": safe_template_path},
        }
    )

    return SettingsResponse(template_path=cfg.template_path)
