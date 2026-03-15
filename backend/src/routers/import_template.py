"""Import Template Router - 模板导入预览与执行"""
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.config import get_config
from src.database import get_session
from src.models.project import Project
from src.services.import_service import ImportService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["import-template"])


# ---- Schema ----

class TemplateFormItem(BaseModel):
    id: int
    name: str
    domain: Optional[str] = None


class TemplateProjectItem(BaseModel):
    id: int
    name: str
    version: str
    forms: List[TemplateFormItem]


class ImportPreviewResponse(BaseModel):
    projects: List[TemplateProjectItem]


class ImportExecuteRequest(BaseModel):
    source_project_id: int
    form_ids: List[int]


class ImportExecuteResponse(BaseModel):
    imported_form_count: int
    renamed_forms: List[str]
    merged_codelists: int
    merged_units: int
    created_field_definitions: int
    created_form_fields: int


class TemplateFieldPreview(BaseModel):
    index: int
    label: str
    field_type: str
    options: Optional[List[str]] = None
    integer_digits: Optional[int] = None
    decimal_digits: Optional[int] = None
    date_format: Optional[str] = None
    default_value: Optional[str] = None
    inline_mark: Optional[bool] = None
    unit_symbol: Optional[str] = None


class TemplateFormFieldsResponse(BaseModel):
    form_id: int
    fields: List[TemplateFieldPreview]


# ---- Endpoints ----

@router.post(
    "/projects/{project_id}/import-template",
    response_model=ImportPreviewResponse,
)
def preview_import(project_id: int, session: Session = Depends(get_session)):
    """预览模板库：返回项目列表及其表单"""
    # 校验目标项目是否存在
    if not session.get(Project, project_id):
        raise HTTPException(404, "目标项目不存在")
    cfg = get_config()
    if not cfg.template_path:
        raise HTTPException(400, "未配置模板路径，请先在设置中配置")
    try:
        svc = ImportService(session)
        projects = svc.get_template_projects(cfg.template_path)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ImportPreviewResponse(projects=projects)


@router.get(
    "/projects/{project_id}/import-template/form-fields",
    response_model=TemplateFormFieldsResponse,
)
def preview_form_fields(
    project_id: int,
    form_id: int,
    session: Session = Depends(get_session),
):
    """预览模板表单字段详情：供前端模拟渲染导入效果"""
    if not session.get(Project, project_id):
        raise HTTPException(404, "目标项目不存在")
    cfg = get_config()
    if not cfg.template_path:
        raise HTTPException(400, "未配置模板路径，请先在设置中配置")
    try:
        svc = ImportService(session)
        fields = svc.get_template_form_fields(cfg.template_path, form_id)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return TemplateFormFieldsResponse(form_id=form_id, fields=fields)


@router.post(
    "/projects/{project_id}/import-template/execute",
    response_model=ImportExecuteResponse,
)
def execute_import(
    project_id: int,
    payload: ImportExecuteRequest,
    session: Session = Depends(get_session),
):
    """执行导入：将选中的表单导入到目标项目"""
    # 校验目标项目是否存在
    if not session.get(Project, project_id):
        raise HTTPException(404, "目标项目不存在")
    cfg = get_config()
    if not cfg.template_path:
        raise HTTPException(400, "未配置模板路径，请先在设置中配置")
    if not payload.form_ids:
        raise HTTPException(400, "请至少选择一个表单")
    try:
        svc = ImportService(session)
        result = svc.import_forms(
            target_project_id=project_id,
            template_path=cfg.template_path,
            source_project_id=payload.source_project_id,
            form_ids=payload.form_ids,
        )
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        logger.exception("导入模板执行失败")
        raise HTTPException(500, "导入失败，请检查模板文件是否有效")
    return ImportExecuteResponse(**result)
