"""Settings Router - 全局配置读写"""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.config import get_config, update_config
from src.services.ai_review_service import test_ai_connection
from src.utils import is_safe_url, is_safe_path, mask_secret

router = APIRouter(tags=["settings"])


class SettingsResponse(BaseModel):
    template_path: str
    ai_enabled: bool = False
    ai_api_url: str = ""
    ai_api_key: str = ""
    ai_model: str = ""
    ai_api_format: str = ""


class SettingsUpdateRequest(BaseModel):
    template_path: str
    ai_enabled: bool = False
    ai_api_url: str = ""
    ai_api_key: str = ""
    ai_model: str = ""
    ai_api_format: str = ""


class AITestRequest(BaseModel):
    ai_api_url: Optional[str] = None
    ai_api_key: Optional[str] = None
    ai_model: Optional[str] = None
    timeout: Optional[int] = None


class AITestResponse(BaseModel):
    ok: bool
    latency_ms: Optional[int] = None
    model: str = ""
    error: str = ""
    api_format: str = ""


@router.get("/settings", response_model=SettingsResponse)
def get_settings():
    """读取当前配置（密钥脱敏）"""
    cfg = get_config()
    ai = cfg.ai_config
    return SettingsResponse(
        template_path=cfg.template_path,
        ai_enabled=ai.enabled,
        ai_api_url=ai.api_url,
        ai_api_key=mask_secret(ai.api_key),  # 脱敏处理
        ai_model=ai.model,
        ai_api_format=ai.api_format,
    )


@router.put("/settings", response_model=SettingsResponse)
def update_settings(payload: SettingsUpdateRequest):
    """更新配置并写入 config.yaml"""
    # 路径安全校验
    is_valid, error_msg = is_safe_path(payload.template_path)
    if not is_valid:
        raise HTTPException(status_code=400, detail=f"模板路径不安全: {error_msg}")

    # URL 安全校验（如果启用 AI）
    if payload.ai_enabled and payload.ai_api_url:
        is_valid, error_msg = is_safe_url(payload.ai_api_url)
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"AI API URL 不安全: {error_msg}")

    # 若传入值包含 * 说明是脱敏占位符，跳过更新以保留原始密钥
    ai_updates: dict = {
        "enabled": payload.ai_enabled,
        "api_url": payload.ai_api_url,
        "model": payload.ai_model,
        "api_format": payload.ai_api_format,
    }
    if payload.ai_api_key and "*" not in payload.ai_api_key:
        ai_updates["api_key"] = payload.ai_api_key

    cfg = update_config({
        "template": {"template_path": payload.template_path},
        "ai": ai_updates,
    })
    ai = cfg.ai_config
    return SettingsResponse(
        template_path=cfg.template_path,
        ai_enabled=ai.enabled,
        ai_api_url=ai.api_url,
        ai_api_key=mask_secret(ai.api_key),  # 返回时也脱敏
        ai_model=ai.model,
        ai_api_format=ai.api_format,
    )


@router.post("/settings/ai/test", response_model=AITestResponse)
async def test_ai(payload: AITestRequest):
    """测试AI连接，支持传入临时配置（未保存也能测试）"""
    cfg = get_config().ai_config
    api_url = payload.ai_api_url if payload.ai_api_url else cfg.api_url
    api_key = payload.ai_api_key if payload.ai_api_key else cfg.api_key
    model = payload.ai_model if payload.ai_model else cfg.model
    timeout = payload.timeout if payload.timeout else cfg.timeout

    if not api_url or not api_key or not model:
        return AITestResponse(ok=False, error="AI配置不完整，请填写API URL、Key和模型")

    # URL 安全校验（防止 SSRF）
    is_valid, error_msg = is_safe_url(api_url)
    if not is_valid:
        return AITestResponse(ok=False, error=f"URL 不安全: {error_msg}")

    ok, latency_ms, error, detected_format = await test_ai_connection(
        api_url=api_url, api_key=api_key, model=model, timeout=timeout,
    )
    return AITestResponse(
        ok=ok, latency_ms=latency_ms, model=model, error=error,
        api_format=detected_format,
    )
