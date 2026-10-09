"""Import Docx Router - Word文档导入预览与执行"""

import logging

from typing import Annotated, Any, Dict, List, Optional


from fastapi import APIRouter, Depends, File, HTTPException, Path, Request, UploadFile

from fastapi.responses import FileResponse

from pydantic import BaseModel, Field

from sqlalchemy.orm import Session


from src.database import get_session

from src.dependencies import get_current_user, require_admin, verify_form_owner, verify_project_owner
from src.rate_limit import limit_import_action

from src.models.project import Project

from src.models.user import User

from src.services.docx_import_service import TEMP_ID_PATTERN, DocxImportService

from src.services.field_type_policy import (
    MULTISELECT_REJECT_MSG,
    allows_multiselect,
    is_multiselect_field_type,
)
from src.services.ai_review_service import (
    VALID_FIELD_TYPES,
    cleanup_old_ai_tasks,
    get_ai_task,
    start_ai_review,
)

from src.services.docx_screenshot_service import DocxScreenshotService


logger = logging.getLogger(__name__)


router = APIRouter(tags=["import-docx"])

# 路径参数与请求体共用的临时编号格式：32 位小写十六进制，不符合返回 422。
# min/max_length 兜住 pattern 的 search 语义放过尾部换行的形状（"$" 匹配末行前）。
TempId = Annotated[str, Path(pattern=TEMP_ID_PATTERN, min_length=32, max_length=32)]


# ── Schema ──


class DocxFieldPreview(BaseModel):
    index: int

    label: str

    field_type: str

    options: Optional[List[Dict[str, Any] | str]] = None

    # 数值型精度（补全，用于 SimulatedCRFForm 正确渲染格子数）

    integer_digits: Optional[int] = None

    decimal_digits: Optional[int] = None

    # 默认值和行内标记（补全，用于标签型/文本型渲染一致性）

    default_value: Optional[str] = None

    inline_mark: Optional[bool] = None

    # 日期格式和单位（用于渲染一致性）

    date_format: Optional[str] = None

    unit_symbol: Optional[str] = None


class DocxAISuggestionField(BaseModel):
    label: str

    field_type: str

    inline_mark: Optional[bool] = None


class DocxAISuggestion(BaseModel):
    index: int

    suggested_type: str

    reason: str

    suggested_fields: Optional[List[DocxAISuggestionField]] = None


class DocxFormPreview(BaseModel):
    index: int

    name: str

    field_count: int

    fields: Optional[List[DocxFieldPreview]] = None

    ai_suggestions: Optional[List[DocxAISuggestion]] = None

    raw_html: Optional[str] = None


class DocxPreviewResponse(BaseModel):
    forms: List[DocxFormPreview]

    temp_id: str

    ai_error: Optional[str] = None

    ai_task_id: Optional[str] = None


class AIReviewStatusResponse(BaseModel):
    status: str

    progress: Optional[Dict[str, int]] = None

    suggestions: Optional[Dict[int, List[DocxAISuggestion]]] = None

    error: Optional[str] = None


class DocxAIFieldOverride(BaseModel):
    """单个字段的AI建议覆盖"""

    index: int  # 字段在 fields 数组中的索引

    field_type: str  # AI建议的字段类型（一对多时取首项类型）

    suggested_fields: Optional[List[DocxAISuggestionField]] = None


class DocxFormOverride(BaseModel):
    """单个表单的AI建议覆盖集合"""

    form_index: int  # 表单索引

    overrides: List[DocxAIFieldOverride]


class DocxExecuteRequest(BaseModel):
    temp_id: str = Field(pattern=TEMP_ID_PATTERN, min_length=32, max_length=32)

    form_indices: List[int]

    ai_overrides: Optional[List[DocxFormOverride]] = None


class DocxFormResult(BaseModel):
    name: str

    field_count: int

    form_id: int


class DocxExecuteResponse(BaseModel):
    imported_form_count: int

    detail: List[DocxFormResult]


def _get_real_fields(fields_raw: List[dict]) -> List[dict]:
    return [field for field in fields_raw if field.get("type") != "log_row"]


def _build_preview_forms(full_forms: List[dict]) -> List[DocxFormPreview]:
    preview_forms: List[DocxFormPreview] = []
    for form_index, form in enumerate(full_forms):
        real_fields = _get_real_fields(form.get("fields", []))
        field_previews = [
            DocxFieldPreview(
                index=field_index,
                label=field.get("label", ""),
                field_type=field.get("field_type", "未知"),
                options=field.get("options"),
                integer_digits=field.get("integer_digits"),
                decimal_digits=field.get("decimal_digits"),
                default_value=field.get("default_value"),
                inline_mark=field.get("inline_mark"),
                date_format=field.get("date_format"),
                unit_symbol=field.get("unit_symbol"),
            )
            for field_index, field in enumerate(real_fields)
        ]
        preview_forms.append(
            DocxFormPreview(
                index=form_index,
                name=form["name"],
                field_count=len(real_fields),
                fields=field_previews or None,
                raw_html=form.get("raw_html"),
            )
        )
    return preview_forms


def _build_filtered_forms_data(full_forms: List[dict]) -> List[dict]:
    return [
        {
            "name": form["name"],
            "fields": _get_real_fields(form.get("fields", [])),
        }
        for form in full_forms
    ]


def _serialize_ai_suggestions(
    suggestions: Dict[int, List[dict]],
) -> Optional[Dict[int, List[DocxAISuggestion]]]:
    if not suggestions:
        return None
    return {
        form_index: [
            DocxAISuggestion(
                index=item["index"],
                suggested_type=item["suggested_type"],
                reason=item.get("reason", ""),
                suggested_fields=item.get("suggested_fields"),
            )
            for item in items
        ]
        for form_index, items in suggestions.items()
    }


def _owned_upload(temp_id: str, project_id: int, user: User) -> Optional[str]:
    """当前用户在该项目下的上传文件路径；编号非本人/非本项目/不存在均返回 None。"""
    return DocxImportService.get_owned_temp_path(temp_id, user_id=user.id, project_id=project_id)


def _build_ai_review_status_response(task) -> AIReviewStatusResponse:
    return AIReviewStatusResponse(
        status=task.status,
        progress={"completed": task.completed, "total": task.total},
        suggestions=_serialize_ai_suggestions(task.suggestions),
        error=task.error,
    )


# ── Endpoints ──


@router.post(
    "/projects/{project_id}/import-docx/preview",
    response_model=DocxPreviewResponse,
)
async def preview_docx_import(
    project_id: int,
    request: Request,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """上传Word文档并预览解析出的表单列表"""

    limit_import_action(request, current_user.id, f"docx-preview:{project_id}")

    project = verify_project_owner(project_id, current_user, session)

    # 校验文件类型

    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(400, "请上传 .docx 格式的Word文件")

    try:
        content = await file.read()

        temp_id, file_path = DocxImportService.save_temp_file(
            content, file.filename, user_id=current_user.id, project_id=project_id
        )

    except ValueError as e:
        raise HTTPException(400, str(e))

    except Exception:
        logger.exception("文件保存失败")

        raise HTTPException(500, "文件保存失败")

    try:
        allow_multi = allows_multiselect(getattr(project, "db_type", None))
        full_forms = DocxImportService.parse_full(file_path, allow_multiselect=allow_multi)

    except Exception:
        DocxImportService.discard_upload(temp_id)

        logger.exception("Word文档解析失败")

        raise HTTPException(400, "Word文档解析失败，请检查文件格式是否正确")

    if not full_forms:
        DocxImportService.discard_upload(temp_id)

        raise HTTPException(400, "未在文档中识别到任何表单")

    preview_forms = _build_preview_forms(full_forms)
    filtered_forms_data = _build_filtered_forms_data(full_forms)
    ai_task_id = None
    try:
        ai_task = await start_ai_review(temp_id, full_forms, allow_multiselect=allow_multi)
        ai_task_id = temp_id if ai_task else None
    except Exception:
        logger.warning("AI复核后台任务启动失败 temp_id=%s", temp_id, exc_info=True)

    # 启动截图任务（异步，不阻塞响应）

    DocxScreenshotService.start(temp_id=temp_id, docx_path=file_path, forms_data=filtered_forms_data)

    response = DocxPreviewResponse(
        forms=preview_forms,
        temp_id=temp_id,
        ai_error=None,
        ai_task_id=ai_task_id,
    )
    return response


@router.get(
    "/projects/{project_id}/import-docx/{temp_id}/ai-review/status",
    response_model=AIReviewStatusResponse,
)
async def get_ai_review_status(
    project_id: int,
    temp_id: TempId,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """查询 AI 复核后台任务状态。"""

    verify_project_owner(project_id, current_user, session)
    if not _owned_upload(temp_id, project_id, current_user):
        raise HTTPException(404, "AI复核任务不存在或已过期")
    task = get_ai_task(temp_id)
    if not task:
        raise HTTPException(404, "AI复核任务不存在或已过期")
    return _build_ai_review_status_response(task)


@router.post(
    "/projects/{project_id}/import-docx/execute",
    response_model=DocxExecuteResponse,
)
def execute_docx_import(
    project_id: int,
    request: Request,
    payload: DocxExecuteRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """执行导入：将选中的表单写入数据库"""

    limit_import_action(request, current_user.id, f"docx-execute:{project_id}")

    project = verify_project_owner(project_id, current_user, session)

    file_path = _owned_upload(payload.temp_id, project_id, current_user)

    if not file_path:
        raise HTTPException(400, "临时文件已过期，请重新上传")

    if not payload.form_indices:
        raise HTTPException(400, "请至少选择一个表单")

    # 校验索引合法性：不允许负数

    if any(i < 0 for i in payload.form_indices):
        raise HTTPException(400, "表单索引不合法")

    # 校验 ai_overrides 中的字段类型合法性

    if payload.ai_overrides:
        for fo in payload.ai_overrides:
            for o in fo.overrides:
                if o.field_type not in VALID_FIELD_TYPES:
                    raise HTTPException(400, f"不支持的字段类型: {o.field_type}")

                if is_multiselect_field_type(o.field_type) and not allows_multiselect(
                    getattr(project, "db_type", None)
                ):
                    raise HTTPException(400, MULTISELECT_REJECT_MSG)

                if getattr(o, "suggested_fields", None):
                    for sf in o.suggested_fields:
                        ft = sf.field_type if hasattr(sf, "field_type") else sf.get("field_type")

                        if is_multiselect_field_type(ft):
                            raise HTTPException(400, MULTISELECT_REJECT_MSG)

                        if ft == "复选":
                            continue

                        if ft not in VALID_FIELD_TYPES:
                            raise HTTPException(400, f"不支持的字段类型: {ft}")

    try:
        svc = DocxImportService(session)

        result = svc.import_forms(
            target_project_id=project_id,
            file_path=file_path,
            form_indices=payload.form_indices,
            ai_overrides=payload.ai_overrides,
        )

    except (ValueError, KeyError) as e:
        logger.warning("Word导入参数错误: %s", e)

        raise HTTPException(400, f"导入失败: {e}")

    except FileNotFoundError:
        # 过期清扫与本次导入并发：归属校验后文件被后台清理删除，按缺失上传应答
        raise HTTPException(400, "临时文件已过期，请重新上传")

    except Exception:
        logger.exception("Word导入执行失败")

        raise HTTPException(500, "导入失败，请检查文件内容")

    finally:
        DocxImportService.discard_upload(payload.temp_id)

    return DocxExecuteResponse(**result)


# ── 截图相关路由 ──


class ScreenshotStartResponse(BaseModel):
    status: str


class ScreenshotStartRequest(BaseModel):
    form_names: List[str] = []

    forms_data: Optional[List[dict]] = None  # 完整表单数据（包含字段列表）


class ScreenshotStatusResponse(BaseModel):
    status: str  # idle | starting | running | done | failed

    page_count: int = 0

    error: Optional[str] = None

    page_ranges: dict = {}

    field_pages: dict = {}  # {表单名: {字段索引: 页码}}


@router.post(
    "/projects/{project_id}/import-docx/{temp_id}/screenshots/start",
    response_model=ScreenshotStartResponse,
)
async def start_docx_screenshot(
    project_id: int,
    temp_id: TempId,
    body: ScreenshotStartRequest = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """触发异步截图任务：将 docx 转为逐页 PNG"""

    project = verify_project_owner(project_id, current_user, session)

    file_path = _owned_upload(temp_id, project_id, current_user)

    if not file_path:
        raise HTTPException(400, "临时文件不存在，请重新上传")

    # 优先使用前端传递的forms_data，避免重新解析导致字段label不一致

    forms_data = body.forms_data if body and body.forms_data else None

    # 如果前端没有传递forms_data，才重新解析docx文件

    if not forms_data:
        form_names = body.form_names if body else []

        if form_names:
            try:
                allow_multi = allows_multiselect(getattr(project, "db_type", None))
                full_forms = DocxImportService.parse_full(file_path, allow_multiselect=allow_multi)

                forms_data = []

                for form in full_forms:
                    if form.get("name") in form_names:
                        fields_raw = form.get("fields", [])

                        real_fields = [fd for fd in fields_raw if fd.get("type") != "log_row"]

                        forms_data.append({"name": form.get("name"), "fields": real_fields})

            except Exception:
                logger.warning("解析docx失败，使用简化模式", exc_info=True)

                forms_data = [{"name": name, "fields": []} for name in form_names]

    task = DocxScreenshotService.start(temp_id, file_path, forms_data)

    return ScreenshotStartResponse(status=task.status)


@router.get(
    "/projects/{project_id}/import-docx/{temp_id}/screenshots/status",
    response_model=ScreenshotStatusResponse,
)
async def get_screenshot_status(
    project_id: int,
    temp_id: TempId,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """查询截图任务状态"""

    verify_project_owner(project_id, current_user, session)

    if not _owned_upload(temp_id, project_id, current_user):
        return ScreenshotStatusResponse(status="idle")

    task = DocxScreenshotService.get_task(temp_id)

    if not task:
        return ScreenshotStatusResponse(status="idle")

    # 调试日志：打印 field_pages 的内容

    if task.field_pages:
        logger.info(
            "返回 field_pages: 表单数=%d, 内容=%s",
            len(task.field_pages),
            {k: f"{len(v)}个字段" for k, v in task.field_pages.items()},
        )

    else:
        logger.warning("field_pages 为空！")

    return ScreenshotStatusResponse(
        status=task.status,
        page_count=task.page_count,
        error=task.error,
        page_ranges=task.page_ranges,
        field_pages=task.field_pages,
    )


@router.get(
    "/projects/{project_id}/import-docx/{temp_id}/screenshots/pages/{page}",
)
async def get_screenshot_page(
    project_id: int,
    temp_id: TempId,
    page: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """获取指定页截图（page 从 1 开始）"""

    verify_project_owner(project_id, current_user, session)

    if page < 1:
        raise HTTPException(400, "页码从 1 开始")

    if not _owned_upload(temp_id, project_id, current_user):
        raise HTTPException(404, "截图不存在或尚未生成")

    img_path = DocxScreenshotService.get_page_path(temp_id, page)

    if not img_path:
        raise HTTPException(404, "截图不存在或尚未生成")

    return FileResponse(
        img_path,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=300"},
    )


# ── 缓存清理路由 ──


class CleanupResponse(BaseModel):
    deleted_count: int

    freed_bytes: int

    freed_mb: float


@router.post(
    "/admin/cleanup-screenshots",
    response_model=CleanupResponse,
)
async def cleanup_screenshots(days: int = 7, current_user: User = Depends(require_admin)):
    """手动清理N天前的截图缓存



    Args:

        days: 清理多少天前的缓存，默认7天

    """

    cleaned_ai_tasks = cleanup_old_ai_tasks()
    result = DocxScreenshotService.cleanup_old_caches(days)
    if cleaned_ai_tasks:
        logger.info("手动清理时额外移除 AI 复核任务 count=%d", cleaned_ai_tasks)

    return CleanupResponse(
        deleted_count=result["deleted_count"],
        freed_bytes=result["freed_bytes"],
        freed_mb=round(result["freed_bytes"] / 1024 / 1024, 2),
    )
