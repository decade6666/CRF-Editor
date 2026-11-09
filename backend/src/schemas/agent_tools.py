"""十工具封闭输入/输出 DTO 与静态清单注册表。

所有输入 DTO 禁止额外键；正 ID 是互不通用的定义/实例/表单 ID，
不是可互换的 OID。输出统一信封：typed data + project_fingerprint + warnings
+ 结构化错误分支（错误经 HTTPException/JSONResponse 呈现）。
"""

from __future__ import annotations

from typing import Generic, List, Literal, Optional, TypeVar

from pydantic import BaseModel, Field, field_validator, model_validator

from src.schemas._common import OID_PATTERN

# 常驻字段类型（前端 FieldsTab.vue 十类，排除结构性 标签/日志行）
REGULAR_FIELD_TYPES = (
    "文本",
    "数值",
    "日期",
    "日期时间",
    "时间",
    "单选",
    "多选",
    "单选（纵向）",
    "多选（纵向）",
    "复选",
)
DATE_FORMAT_FIELD_TYPES = ("日期", "日期时间", "时间")
CHOICE_FIELD_TYPES = ("单选", "多选", "单选（纵向）", "多选（纵向）")
NUMERIC_FIELD_TYPES = ("数值",)
# 单位可用类型（前端 formDesignerPropertyEditor.js::UNIT_FIELD_TYPES 同契约）
UNIT_FIELD_TYPES = ("文本", "数值")

FINGERPRINT_PATTERN = r"^[0-9a-f]{64}$"
REQUEST_ID_PATTERN = r"^[A-Za-z0-9._:-]{1,64}$"

MAX_FORM_FIELDS = 500
MAX_REFERENCE_ITEMS = 500
MAX_SEARCH_PAGE_SIZE = 100
SEARCH_DEFAULT_LIMIT = 20
MAX_INPUT_BYTES = 64 * 1024
# 完整投影/提案/结果输出的统一上限（拒绝而非截断）
MAX_OUTPUT_BYTES = 1024 * 1024

REGULAR_FIELD_TYPE_PATTERN = "^(" + "|".join(REGULAR_FIELD_TYPES) + ")$"


# 稳定领域错误码（错误响应体 {detail, code} 中的 code）
CODE_GRANT_DENIED = "GRANT_DENIED"
CODE_NOT_FOUND = "NOT_FOUND"
CODE_VALIDATION = "VALIDATION"
CODE_STALE_STATE = "STALE_STATE"
CODE_IDENTITY_REUSED = "IDENTITY_REUSED"
CODE_APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
CODE_APPROVAL_REJECTED = "APPROVAL_REJECTED"
CODE_PROPOSAL_EXPIRED = "PROPOSAL_EXPIRED"
CODE_INCOMPATIBLE_DATA = "INCOMPATIBLE_DATA"
CODE_LIMIT_EXCEEDED = "LIMIT_EXCEEDED"
CODE_RATE_LIMITED = "RATE_LIMITED"
CODE_CONFLICT = "CONFLICT"
CODE_INTERNAL = "INTERNAL"

STATUS_DEFAULT_CODES = {
    400: CODE_VALIDATION,
    401: CODE_GRANT_DENIED,
    403: CODE_GRANT_DENIED,
    404: CODE_NOT_FOUND,
    409: CODE_CONFLICT,
    410: CODE_PROPOSAL_EXPIRED,
    413: CODE_LIMIT_EXCEEDED,
    422: CODE_VALIDATION,
    429: CODE_RATE_LIMITED,
    500: CODE_INTERNAL,
}


class AgentToolInput(BaseModel):
    """所有工具输入的基类：封闭 schema。"""

    model_config = {"extra": "forbid"}

    @field_validator("request_id", check_fields=False)
    @classmethod
    def _reject_path_ambiguous_request_id(cls, value: Optional[str]) -> Optional[str]:
        # "." 与 ".." 在 URL 路径规范化中会丢失，导致结果查询无法寻址
        if value in (".", ".."):
            raise ValueError("request_id 不能是 . 或 ..")
        return value


# ── 读工具 ────────────────────────────────────────────────────────────────


class ListProjectsInput(AgentToolInput):
    pass


class ProjectOutlineInput(AgentToolInput):
    project_id: int = Field(gt=0)


class FormDetailInput(AgentToolInput):
    project_id: int = Field(gt=0)
    form_id: int = Field(gt=0)


class SearchFieldDefinitionsInput(AgentToolInput):
    project_id: int = Field(gt=0)
    query: str = Field(min_length=1, max_length=255)
    limit: int = Field(default=SEARCH_DEFAULT_LIMIT, ge=1, le=MAX_SEARCH_PAGE_SIZE)
    offset: int = Field(default=0, ge=0)


class ReferenceImpactInput(AgentToolInput):
    project_id: int = Field(gt=0)
    resource_type: Literal["definition", "codelist", "unit", "form"]
    resource_id: int = Field(gt=0)


# ── 本地写工具 ────────────────────────────────────────────────────────────


class FormFieldInstancePatch(AgentToolInput):
    """封闭类型化的实例补丁；省略 = 不变，显式 null = 清值（非空布尔拒绝 null）。"""

    required: Optional[Literal[0, 1]] = None
    label_override: Optional[str] = Field(default=None, max_length=255)
    help_text: Optional[str] = Field(default=None, max_length=255)
    default_value: Optional[str] = None
    inline_mark: Optional[Literal[0, 1]] = None
    bg_color: Optional[str] = Field(default=None, pattern=r"^[0-9a-fA-F]{6}$")
    text_color: Optional[str] = Field(default=None, pattern=r"^[0-9a-fA-F]{6}$")
    label_bold: Optional[Literal[0, 1]] = None
    label_font_size: Optional[Literal["large", "default", "small"]] = None

    @model_validator(mode="before")
    @classmethod
    def _reject_null_booleans(cls, values: object) -> object:
        if isinstance(values, dict):
            for key in ("required", "label_bold", "inline_mark"):
                if key in values and values[key] is None:
                    raise ValueError(f"{key} 不接受 null（只能省略或提供 0/1）")
        return values


class NewDefinitionSource(AgentToolInput):
    """严格类型化的新定义（新写 OID：后端写入分支做 ASCII 大写归一）。

    保留的 is_multi_record / table_type 是内部既有默认，不对外暴露创作面。
    """

    variable_name: str = Field(min_length=1, max_length=100, pattern=OID_PATTERN)
    label: str = Field(min_length=1, max_length=255)
    field_type: str = Field(pattern=REGULAR_FIELD_TYPE_PATTERN)
    checkbox_label: Optional[str] = Field(default=None, max_length=255)
    integer_digits: Optional[int] = Field(default=None, ge=1, le=20)
    decimal_digits: Optional[int] = Field(default=None, ge=0, le=15)
    date_format: Optional[str] = None
    codelist_id: Optional[int] = Field(default=None, gt=0)
    unit_id: Optional[int] = Field(default=None, gt=0)


class AddFormFieldSource(AgentToolInput):
    """source = 既有定义 ID 或严格类型化新定义，真互斥二选一。"""

    definition_id: Optional[int] = Field(default=None, gt=0)
    new_definition: Optional[NewDefinitionSource] = None

    @model_validator(mode="after")
    def _exactly_one_source(self):
        provided = [name for name in ("definition_id", "new_definition") if getattr(self, name) is not None]
        if len(provided) != 1:
            raise ValueError("source 需要 definition_id 或 new_definition（且只能其一）")
        return self


class AddFormFieldInput(AgentToolInput):
    project_id: int = Field(gt=0)
    form_id: int = Field(gt=0)
    source: AddFormFieldSource
    instance: FormFieldInstancePatch = Field(default_factory=FormFieldInstancePatch)
    # 插入位置 1-based（与既有 OrderService.insert_at 语义一致）；合法上界按
    # 表单当前行数在服务内校验（越界 400 并整体回滚）
    position: Optional[int] = Field(default=None, ge=1)
    expected_project_fingerprint: str = Field(pattern=FINGERPRINT_PATTERN)
    request_id: str = Field(pattern=REQUEST_ID_PATTERN)


class UpdateFormFieldInstanceInput(AgentToolInput):
    project_id: int = Field(gt=0)
    form_field_id: int = Field(gt=0)
    patch: FormFieldInstancePatch
    expected_project_fingerprint: str = Field(pattern=FINGERPRINT_PATTERN)
    request_id: str = Field(pattern=REQUEST_ID_PATTERN)


class ReorderFormFieldsInput(AgentToolInput):
    project_id: int = Field(gt=0)
    form_id: int = Field(gt=0)
    ordered_form_field_ids: List[int] = Field(min_length=1, max_length=MAX_FORM_FIELDS)
    expected_project_fingerprint: str = Field(pattern=FINGERPRINT_PATTERN)
    request_id: str = Field(pattern=REQUEST_ID_PATTERN)


class SharedDefinitionPatch(AgentToolInput):
    """共享定义补丁键（不含 OID / 表格标记 / 排序 / 删除）。

    省略 = 不变；显式 null = 清值，仅限可空键（checkbox_label / date_format /
    codelist_id / unit_id）；label / field_type / digits 为非空键，显式 null 拒绝。
    """

    label: Optional[str] = Field(default=None, min_length=1, max_length=255)
    field_type: Optional[str] = Field(default=None, pattern=REGULAR_FIELD_TYPE_PATTERN)
    checkbox_label: Optional[str] = Field(default=None, max_length=255)
    integer_digits: Optional[int] = Field(default=None, ge=1, le=20)
    decimal_digits: Optional[int] = Field(default=None, ge=0, le=15)
    date_format: Optional[str] = None
    codelist_id: Optional[int] = Field(default=None, gt=0)
    unit_id: Optional[int] = Field(default=None, gt=0)

    @model_validator(mode="before")
    @classmethod
    def _reject_null_on_nonclearable(cls, values: object) -> object:
        if isinstance(values, dict):
            for key in ("label", "field_type", "integer_digits", "decimal_digits"):
                if key in values and values[key] is None:
                    raise ValueError(f"{key} 不接受 null")
        return values


class PreviewSharedDefinitionChangeInput(AgentToolInput):
    project_id: int = Field(gt=0)
    definition_id: int = Field(gt=0)
    patch: SharedDefinitionPatch
    expected_project_fingerprint: str = Field(pattern=FINGERPRINT_PATTERN)
    request_id: str = Field(pattern=REQUEST_ID_PATTERN)


class ApplySharedDefinitionChangeInput(AgentToolInput):
    project_id: int = Field(gt=0)
    change_id: int = Field(gt=0)


# ── 结果查询请求体（非清单工具，绝不进入 build_manifest） ─────────────────

# 允许固定查询的工具：有 request_id 幂等身份的本地写/预览命令（共享应用走 change_id）
LOOKUP_TOOL_NAMES = (
    "crf_add_form_field",
    "crf_update_form_field_instance",
    "crf_reorder_form_fields",
    "crf_preview_shared_definition_change",
)


class AgentOperationLookupRequest(BaseModel):
    """POST /agent/operations/{request_id} 的封闭请求体。

    arguments 先按对应工具 DTO 校验，再与路径 request_id 及存储的请求身份绑定
    （工具或规范化输入不一致 → 409 IDENTITY_REUSED）。
    """

    model_config = {"extra": "forbid"}

    tool_name: Literal[
        "crf_add_form_field",
        "crf_update_form_field_instance",
        "crf_reorder_form_fields",
        "crf_preview_shared_definition_change",
    ]
    arguments: dict


# ── 输出信封 ──────────────────────────────────────────────────────────────


class AgentOutputModel(BaseModel):
    """所有输出模型封闭：额外键一律视为后端漂移并拒绝。"""

    model_config = {"extra": "forbid"}


class AgentErrorBody(AgentOutputModel):
    message: str
    code: str


class AgentErrorEnvelope(AgentOutputModel):
    error: AgentErrorBody


DataT = TypeVar("DataT")


class AgentToolSuccess(AgentOutputModel, Generic[DataT]):
    """成功输出统一信封（structuredContent 契约）。"""

    data: DataT
    project_fingerprint: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)


class AgentProjectSummary(AgentOutputModel):
    id: int
    name: str
    version: str
    db_type: str


class AgentListProjectsData(AgentOutputModel):
    projects: List[AgentProjectSummary]


class AgentVisitSummary(AgentOutputModel):
    id: int
    name: str
    code: Optional[str] = None
    sequence: int
    form_ids: List[int] = Field(default_factory=list)


class AgentFormSummary(AgentOutputModel):
    id: int
    name: str
    code: Optional[str] = None
    domain: Optional[str] = None
    order_index: Optional[int] = None
    paper_orientation: str = "auto"


class AgentCodelistSummary(AgentOutputModel):
    id: int
    name: str
    code: Optional[str] = None
    option_count: int = 0


class AgentUnitSummary(AgentOutputModel):
    id: int
    symbol: str
    code: Optional[str] = None


class AgentEditingRules(AgentOutputModel):
    regular_field_types: List[str] = Field(default_factory=list)
    structural_field_types: List[str] = Field(default_factory=list)
    date_format_field_types: List[str] = Field(default_factory=list)
    choice_field_types: List[str] = Field(default_factory=list)
    numeric_field_types: List[str] = Field(default_factory=list)
    saimeisi_field_oid_max_length: int = 8
    integer_digits_range: List[int] = Field(default_factory=lambda: [1, 20])
    decimal_digits_range: List[int] = Field(default_factory=lambda: [0, 15])
    max_form_fields: int = MAX_FORM_FIELDS


class AgentOutlineData(AgentOutputModel):
    project: AgentProjectSummary
    forms: List[AgentFormSummary] = Field(default_factory=list)
    visits: List[AgentVisitSummary] = Field(default_factory=list)
    codelists: List[AgentCodelistSummary] = Field(default_factory=list)
    units: List[AgentUnitSummary] = Field(default_factory=list)
    editing_rules: AgentEditingRules


class AgentCodeListOptionView(AgentOutputModel):
    id: int
    code: Optional[str] = None
    decode: str


class AgentDefinitionFull(AgentOutputModel):
    """完整有效定义（含类型专属设置与字典/单位链接及有序选项）。"""

    id: int
    variable_name: str
    label: str
    field_type: str
    checkbox_label: Optional[str] = None
    integer_digits: Optional[int] = None
    decimal_digits: Optional[int] = None
    date_format: Optional[str] = None
    codelist_id: Optional[int] = None
    codelist_name: Optional[str] = None
    unit_id: Optional[int] = None
    unit_symbol: Optional[str] = None
    options: List[AgentCodeListOptionView] = Field(default_factory=list)


class AgentFormFieldRow(AgentOutputModel):
    id: int
    order_index: int
    is_log_row: bool = False
    definition: Optional[AgentDefinitionFull] = None
    # 存储覆盖 vs 有效值：label_override 是实例存储值，label 是有效展示值
    label_override: Optional[str] = None
    label: Optional[str] = None
    required: bool = False
    inline_mark: bool = False
    default_value: Optional[str] = None
    help_text: Optional[str] = None
    bg_color: Optional[str] = None
    text_color: Optional[str] = None
    label_bold: bool = True
    label_font_size: Optional[str] = None


class AgentFormDetailData(AgentOutputModel):
    form: AgentFormSummary
    rows: List[AgentFormFieldRow] = Field(default_factory=list)
    definition_count: int = 0


class AgentSearchCandidate(AgentOutputModel):
    definition_id: int
    variable_name: str
    label: str
    field_type: str
    placed_form_ids: List[int] = Field(default_factory=list)
    match_kind: str = "substring"


class AgentSearchData(AgentOutputModel):
    candidates: List[AgentSearchCandidate]
    total: int
    offset: int
    has_more: bool


class AgentReferenceFormImpact(AgentOutputModel):
    form_id: int
    form_name: str
    form_oid: Optional[str] = None
    visit_names: List[str] = Field(default_factory=list)
    instance_ids: List[int] = Field(default_factory=list)
    attribute_changes: List[dict] = Field(default_factory=list)


class AgentUnplacedDefinition(AgentOutputModel):
    id: int
    variable_name: str
    label: str
    field_type: str


class AgentReferenceImpactData(AgentOutputModel):
    resource_type: str
    resource: dict
    # 已放置影响（表单级，稳定 ID 分组）
    placed_forms: List[AgentReferenceFormImpact] = Field(default_factory=list)
    # 未放置（仅字段库）定义引用，单列
    unplaced_definitions: List[AgentUnplacedDefinition] = Field(default_factory=list)
    total_items: int = 0


class AgentWriteData(AgentOutputModel):
    """本地写成功：回读所需标识 + 新指纹。"""

    form_field_id: Optional[int] = None
    definition_id: Optional[int] = None
    definition_created: bool = False
    reordered_count: Optional[int] = None
    replay: Optional[bool] = None


class AgentAttributeChange(AgentOutputModel):
    """定义级属性变化（before/after 含派生效果；before 可为 MISSING 哨兵省略）。"""

    key: str
    before: Optional[object] = None
    after: Optional[object] = None
    derived: bool = False


class AgentInstanceChange(AgentOutputModel):
    instance_id: int
    changes: List[AgentAttributeChange] = Field(default_factory=list)


class AgentFormImpact(AgentOutputModel):
    form_id: int
    form_oid: Optional[str] = None
    form_name: str
    visit_names: List[str] = Field(default_factory=list)
    instance_ids: List[int] = Field(default_factory=list)
    attribute_changes: List[AgentAttributeChange] = Field(default_factory=list)
    instance_changes: List[AgentInstanceChange] = Field(default_factory=list)
    label_overrides_preserved: List[dict] = Field(default_factory=list)


class AgentPreviewData(AgentOutputModel):
    change_id: int
    approval_state: str = "pending"
    expires_at: str
    proposal_digest: str
    impact: List[AgentFormImpact] = Field(default_factory=list)
    semantic_diff: List[AgentAttributeChange] = Field(default_factory=list)
    replay: Optional[bool] = None


class AgentApplyData(AgentOutputModel):
    change_id: int
    applied: bool = True
    replay: bool = False


# ── 静态清单注册表 ────────────────────────────────────────────────────────

TOOL_READ_PERMISSION = "read"
TOOL_WRITE_PERMISSION = "read_write"

_TOOL_DEFINITIONS: list[dict] = [
    {
        "name": "crf_list_projects",
        "description": "列出该凭据被授权的（唯一）活动项目。",
        "permission": TOOL_READ_PERMISSION,
        "input_schema": ListProjectsInput,
        "output_model": AgentListProjectsData,
    },
    {
        "name": "crf_get_project_outline",
        "description": "获取授权项目的有界表单/访视/关系与字典/单位摘要及编辑规则元数据。",
        "permission": TOOL_READ_PERMISSION,
        "input_schema": ProjectOutlineInput,
        "output_model": AgentOutlineData,
    },
    {
        "name": "crf_get_form_detail",
        "description": "获取表单完整元数据、实例/定义链接、完整有效定义（含选项/链接）与存储覆盖标注。",
        "permission": TOOL_READ_PERMISSION,
        "input_schema": FormDetailInput,
        "output_model": AgentFormDetailData,
    },
    {
        "name": "crf_search_field_definitions",
        "description": "项目内常规字段候选字面匹配检索（精确 OID 优先，其次子串；返回真实授权项目内放置表单）。",
        "permission": TOOL_READ_PERMISSION,
        "input_schema": SearchFieldDefinitionsInput,
        "output_model": AgentSearchData,
    },
    {
        "name": "crf_get_reference_impact",
        "description": "获取授权资源（definition/codelist/unit/form）的引用影响，含未放置定义单列与完整表单/实例/访视标识。",
        "permission": TOOL_READ_PERMISSION,
        "input_schema": ReferenceImpactInput,
        "output_model": AgentReferenceImpactData,
    },
    {
        "name": "crf_add_form_field",
        "description": "复用既有定义或创建严格类型化新定义（选择类字段必须指定项目内字典），并按请求位置放入实例。",
        "permission": TOOL_WRITE_PERMISSION,
        "input_schema": AddFormFieldInput,
        "output_model": AgentWriteData,
    },
    {
        "name": "crf_update_form_field_instance",
        "description": "实例属性补丁（省略不变/显式 null 清值；不含隐式共享更新/换绑/删除/结构行编辑）。",
        "permission": TOOL_WRITE_PERMISSION,
        "input_schema": UpdateFormFieldInstanceInput,
        "output_model": AgentWriteData,
    },
    {
        "name": "crf_reorder_form_fields",
        "description": "表单内完整实例 ID 置换（含日志行），复用既有排序与横向块守卫。",
        "permission": TOOL_WRITE_PERMISSION,
        "input_schema": ReorderFormFieldsInput,
        "output_model": AgentWriteData,
    },
    {
        "name": "crf_preview_shared_definition_change",
        "description": "校验共享定义提案（含派生效果与实例变化）并持久化不可变审批提案；不改 CRF 元数据。",
        "permission": TOOL_WRITE_PERMISSION,
        "input_schema": PreviewSharedDefinitionChangeInput,
        "output_model": AgentPreviewData,
    },
    {
        "name": "crf_apply_shared_definition_change",
        "description": "应用已获属主审批的提案；幂等重放返回原应用结果。",
        "permission": TOOL_WRITE_PERMISSION,
        "input_schema": ApplySharedDefinitionChangeInput,
        "output_model": AgentApplyData,
    },
]

TOOL_NAMES = frozenset(item["name"] for item in _TOOL_DEFINITIONS)
AGENT_CONTRACT_VERSION = "1.1.0"

# 错误响应结构（isError=true 的 structuredContent 契约，MCP outputSchema 只描述成功输出）
TOOL_ERROR_SCHEMA = AgentErrorEnvelope.model_json_schema()


def get_tool_registry() -> dict[str, dict]:
    """固定 name → 类型化命令注册表（浅拷贝防外部改写注册表本身）。"""
    return {item["name"]: dict(item) for item in _TOOL_DEFINITIONS}


def get_tool_output_adapter(tool_name: str):
    """成功输出信封的校验适配器（Pydantic 生成，schema 与校验同源）。"""
    from pydantic import TypeAdapter

    spec = get_tool_registry().get(tool_name)
    if spec is None or spec.get("output_model") is None:
        return None
    return TypeAdapter(AgentToolSuccess[spec["output_model"]])


def build_manifest() -> dict:
    """构建认证清单：工具名 + Pydantic 生成的输入/输出 schema（本地引用）。"""
    tools = []
    for item in _TOOL_DEFINITIONS:
        tools.append(
            {
                "name": item["name"],
                "description": item["description"],
                "permission": item["permission"],
                "inputSchema": item["input_schema"].model_json_schema(),
                "outputSchema": AgentToolSuccess[item["output_model"]].model_json_schema(),
            }
        )
    return {"contract_version": AGENT_CONTRACT_VERSION, "tools": tools}
