"""模板导入路由的请求 / 响应模型。"""

from typing import List, Optional

from pydantic import BaseModel, Field


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
    field_ids: Optional[List[int]] = None


class ImportExecuteResponse(BaseModel):
    imported_form_count: int
    renamed_forms: List[str]
    merged_codelists: int
    merged_units: int
    created_field_definitions: int
    created_form_fields: int
    # 加字段兼容：目標項目本次導入實際建立的表單 id（創建順序）。
    # 舊構造路徑缺省為空列表，前端僅在列表非空時選中首個 id。
    imported_form_ids: List[int] = Field(default_factory=list)


class TemplateFieldOptionPreview(BaseModel):
    id: Optional[int] = None
    code: Optional[str] = None
    decode: str


class TemplateFieldDefinitionPreview(BaseModel):
    """字段定义预览 - 嵌套在 TemplateFieldPreview 中"""

    id: int
    project_id: int
    variable_name: str
    label: str
    field_type: str
    integer_digits: Optional[int] = None
    decimal_digits: Optional[int] = None
    date_format: Optional[str] = None
    order_index: Optional[int] = None


class TemplateFieldPreview(BaseModel):
    id: int
    project_id: int
    order_index: int
    index: int
    label: str
    field_type: str
    options: Optional[List[TemplateFieldOptionPreview]] = None
    integer_digits: Optional[int] = None
    decimal_digits: Optional[int] = None
    date_format: Optional[str] = None
    default_value: Optional[str] = None
    inline_mark: int = 0
    unit_symbol: Optional[str] = None
    # 结构性行与样式属性（Task 3.1）
    is_log_row: int = 0
    bg_color: Optional[str] = None
    text_color: Optional[str] = None
    label_bold: Optional[int] = None
    label_font_size: Optional[str] = None
    field_definition: Optional[TemplateFieldDefinitionPreview] = None


class TemplateFormFieldsResponse(BaseModel):
    form_id: int
    fields: List[TemplateFieldPreview]
    # 模板表单纸张方向（auto/portrait/landscape）；旧模板缺列时回退 'auto'。
    # 供前端模板预览解析 normal 表填写线可用宽度，与导出 _build_form_table 一致。
    paper_orientation: str = "auto"
