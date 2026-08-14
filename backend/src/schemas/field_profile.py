"""字段 profile 原子命令 schema。

`POST /api/forms/{form_id}/field-profile` 与
`PUT /api/form-fields/{ff_id}/binding-profile` 共享同一命令核心：
definition_operation + binding + instance 三部分相互组合，在单个数据库事务内完成
定义创建/恢复/共享更新、实例创建/改绑/部分更新或删除，以及可选的原绑定定义清理。
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

from ._common import required_oid_validator
from .field import CheckboxLabel, FormFieldResponse, HexColor, LabelBold, LabelFontSize


class DefinitionPayload(BaseModel):
    """字段定义完整快照（创建或整值更新用）。"""

    variable_name: str
    label: str
    field_type: str
    checkbox_label: CheckboxLabel = None
    integer_digits: Optional[int] = None
    decimal_digits: Optional[int] = None
    date_format: Optional[str] = None
    codelist_id: Optional[int] = None
    unit_id: Optional[int] = None
    is_multi_record: int = 0
    table_type: str = "固定行"

    _validate_variable_name = required_oid_validator("variable_name")


class DefinitionUpdateShared(BaseModel):
    """更新既有共享定义（设计器路径禁止改其 OID，由 service 校验）。"""

    target_definition_id: int
    definition: DefinitionPayload


class DefinitionCreateOrRestore(BaseModel):
    """新建定义，或在历史重做时复用既有定义（OID 必须一致）。"""

    preferred_definition_id: Optional[int] = None
    definition: DefinitionPayload


class DefinitionOperation(BaseModel):
    operation: Literal["none", "update_shared", "create_or_restore"] = "none"
    update_shared: Optional[DefinitionUpdateShared] = None
    create_or_restore: Optional[DefinitionCreateOrRestore] = None

    @model_validator(mode="after")
    def _check_operation_payload(self):
        if self.operation == "update_shared" and self.update_shared is None:
            raise ValueError("operation=update_shared 需要 update_shared 载荷")
        if self.operation == "create_or_restore" and self.create_or_restore is None:
            raise ValueError("operation=create_or_restore 需要 create_or_restore 载荷")
        return self


class BindingOperation(BaseModel):
    mode: Literal["keep", "existing", "operation_result"] = "keep"
    target_field_definition_id: Optional[int] = None

    @model_validator(mode="after")
    def _check_binding_payload(self):
        if self.mode == "existing" and self.target_field_definition_id is None:
            raise ValueError("binding=existing 需要 target_field_definition_id")
        return self


class InstanceUpsert(BaseModel):
    """实例属性部分更新；exclude_unset 语义，显式 null 可清值。"""

    required: Optional[int] = None
    label_override: Optional[str] = None
    help_text: Optional[str] = None
    default_value: Optional[str] = None
    inline_mark: Optional[int] = None
    bg_color: Optional[HexColor] = None
    text_color: Optional[HexColor] = None
    label_bold: Optional[LabelBold] = None
    label_font_size: Optional[LabelFontSize] = None

    @model_validator(mode="before")
    @classmethod
    def reject_null_label_bold(cls, values: object) -> object:
        if isinstance(values, dict) and "label_bold" in values and values["label_bold"] is None:
            raise ValueError("label_bold must be 0 or 1")
        return values


class InstanceOperation(BaseModel):
    mode: Literal["upsert", "delete"] = "upsert"
    upsert: Optional[InstanceUpsert] = None

    @model_validator(mode="after")
    def _check_instance_payload(self):
        if self.mode == "upsert" and self.upsert is None:
            raise ValueError("instance=upsert 需要 upsert 载荷")
        return self


class FieldProfileCommand(BaseModel):
    """字段 profile 原子命令（两个路由共享）。"""

    definition_operation: DefinitionOperation = Field(default_factory=DefinitionOperation)
    binding: BindingOperation = Field(default_factory=BindingOperation)
    instance: InstanceOperation = Field(default_factory=InstanceOperation)
    order_index: Optional[int] = None
    # 仅允许指向请求开始前该实例绑定的定义；换绑/删除后无引用则清理
    cleanup_definition_id: Optional[int] = None


class FieldProfileResult(BaseModel):
    """字段 profile 执行结果 envelope。"""

    form_field_id: Optional[int] = None
    form_field: Optional[object] = None
    final_definition_id: Optional[int] = None
    definition_created: bool = False
    definition_restored: bool = False
    cleanup: Optional[dict] = None


class FieldProfileResponse(BaseModel):
    """两个字段 profile 路由的统一响应。"""

    form_field_id: Optional[int] = None
    form_field: Optional[FormFieldResponse] = None
    final_definition_id: Optional[int] = None
    definition_created: bool = False
    definition_restored: bool = False
    cleanup: Optional[dict] = None

    model_config = {"from_attributes": True}

