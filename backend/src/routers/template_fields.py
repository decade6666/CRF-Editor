"""Template Fields Router - 模板库字段查询（只读，供 label↔OID 检索）"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from src.config import get_config
from src.dependencies import get_current_user
from src.models.user import User
from src.routers.import_template import _compatibility_error
from src.services.template_field_index_service import build_template_field_index

logger = logging.getLogger(__name__)


router = APIRouter(tags=["template-fields"])


# ---- Schema ----


class TemplateFieldOption(BaseModel):
    code: Optional[str] = None
    decode: str


class TemplateFieldSource(BaseModel):
    project_name: str
    project_version: Optional[str] = None
    form_name: Optional[str] = None      # None = 定义仅存在于项目字段库
    form_code: Optional[str] = None      # 表单 OID（form.code）；历史库缺列或空白时为 None
    display_label: Optional[str] = None  # 表单级 label_override，与定义 label 不同时返回


class TemplateFieldEntry(BaseModel):
    key: str                             # "<first_project_id>:<first_definition_id>"
    variable_name: str
    label: str
    field_type: str
    integer_digits: Optional[int] = None
    decimal_digits: Optional[int] = None
    date_format: Optional[str] = None
    checkbox_label: Optional[str] = None
    codelist_name: Optional[str] = None
    options: List[TemplateFieldOption] = []
    unit_symbol: Optional[str] = None
    label_aliases: List[str] = []        # 去重后的 display_label，按首次出现顺序
    sources: List[TemplateFieldSource]


class TemplateFieldIndexResponse(BaseModel):
    entries: List[TemplateFieldEntry]


# ---- Endpoints ----


@router.get("/template-fields", response_model=TemplateFieldIndexResponse)
def list_template_fields(
    current_user: User = Depends(get_current_user),
):
    """返回模板库中全部可用字段的索引（排除标签、log 行与软删项目）。"""
    cfg = get_config()
    if not cfg.template_path:
        raise HTTPException(400, "未配置模板库，请联系管理员在设置中配置模板路径")
    try:
        entries = build_template_field_index(cfg.template_path)
    except FileNotFoundError as e:
        logger.warning("模板字段查询：模板文件不存在（%s）", e)
        raise HTTPException(404, "模板文件不存在，请联系管理员检查模板路径")
    except ValueError as e:
        msg = str(e)
        if "模板库不兼容" in msg:
            return _compatibility_error(msg)
        logger.warning("模板字段查询：模板路径无效（%s）", e)
        raise HTTPException(400, "模板路径无效，请联系管理员检查模板路径")
    except Exception:
        logger.exception("读取模板字段失败")
        raise HTTPException(500, "读取模板字段失败")
    return TemplateFieldIndexResponse(entries=entries)
