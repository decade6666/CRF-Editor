"""Import Template Router - 模板导入预览与执行"""

import logging


from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session


from src.config import get_config
from src.database import get_session
from src.dependencies import get_current_user, verify_project_owner
from src.models.project import Project
from src.models.user import User
from src.schemas.template_import import (
    ImportExecuteRequest,
    ImportExecuteResponse,
    ImportPreviewResponse,
    TemplateFormFieldsResponse,
)
from src.services.import_service import ImportService


logger = logging.getLogger(__name__)


router = APIRouter(tags=["import-template"])


# Task 3.4: 兼容性错误响应 helper
def _compatibility_error(message: str) -> JSONResponse:
    """返回稳定的兼容性错误 JSON（detail + code）"""
    return JSONResponse(
        status_code=400,
        content={"detail": message, "code": "TEMPLATE_INCOMPATIBLE"},
    )


def _template_import_error_response(exc: FileNotFoundError | ValueError) -> JSONResponse:
    """把模板导入异常映射为 HTTP 响应（三个端点共用）。

    - `FileNotFoundError` → 抛 404 `HTTPException`（detail = 异常消息）；
    - `ValueError` 含「模板库不兼容」→ 返回结构化 `TEMPLATE_INCOMPATIBLE` JSON；
    - 其余 `ValueError` → 抛 400 `HTTPException`（detail = 异常消息）。

    前两种抛异常而非返回，保持走 FastAPI 的 HTTPException 处理路径（与改造前一致）。
    """
    if isinstance(exc, FileNotFoundError):
        raise HTTPException(404, str(exc))
    message = str(exc)
    if "模板库不兼容" in message:
        return _compatibility_error(message)
    raise HTTPException(400, message)


# ---- Schema ----
# 请求 / 响应模型已迁入 src.schemas.template_import；此处重新导出 ImportExecuteRequest，
# 保持既有 `from src.routers.import_template import ImportExecuteRequest` 调用点可用。


# ---- Endpoints ----


@router.post(
    "/projects/{project_id}/import-template",
    response_model=ImportPreviewResponse,
)
def preview_import(
    project_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)
):
    """预览模板库：返回项目列表及其表单"""
    verify_project_owner(project_id, current_user, session)
    cfg = get_config()
    if not cfg.template_path:
        raise HTTPException(400, "未配置模板路径，请先在设置中配置")
    try:
        svc = ImportService(session)
        projects = svc.get_template_projects(cfg.template_path)
    except (FileNotFoundError, ValueError) as e:
        return _template_import_error_response(e)
    return ImportPreviewResponse(projects=projects)


@router.get(
    "/projects/{project_id}/import-template/form-fields",
    response_model=TemplateFormFieldsResponse,
)
def preview_form_fields(
    project_id: int,
    form_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """预览模板表单字段详情：供前端模拟渲染导入效果"""
    verify_project_owner(project_id, current_user, session)
    cfg = get_config()
    if not cfg.template_path:
        raise HTTPException(400, "未配置模板路径，请先在设置中配置")
    try:
        svc = ImportService(session)
        fields = svc.get_template_form_fields(cfg.template_path, form_id)
        paper_orientation = svc.get_template_form_paper_orientation(cfg.template_path, form_id)
    except (FileNotFoundError, ValueError) as e:
        return _template_import_error_response(e)
    return TemplateFormFieldsResponse(form_id=form_id, fields=fields, paper_orientation=paper_orientation)


@router.post(
    "/projects/{project_id}/import-template/execute",
    response_model=ImportExecuteResponse,
)
def execute_import(
    project_id: int,
    payload: ImportExecuteRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """执行导入：将选中的表单导入到目标项目"""
    verify_project_owner(project_id, current_user, session)
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
            field_ids=payload.field_ids,
        )
    except (FileNotFoundError, ValueError) as e:
        return _template_import_error_response(e)
    except Exception:
        logger.exception("导入模板执行失败")
        raise HTTPException(500, "导入失败，请检查模板文件是否有效")
    return ImportExecuteResponse(**result)
