"""Agent 编辑服务：本地 profile 编辑与完整重排（幂等 + 守卫）。

复用既有 field_profile / order / inline guard 服务；全部在调用方的
写事务内执行，服务自身不提交。
"""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.models.agent_access import AgentCredential
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.agent_dependencies import AgentToolError
from src.schemas.agent_tools import (
    AddFormFieldInput,
    CHOICE_FIELD_TYPES,
    ReorderFormFieldsInput,
    UpdateFormFieldInstanceInput,
    CODE_INCOMPATIBLE_DATA,
    CODE_STALE_STATE,
    DATE_FORMAT_FIELD_TYPES,
    REGULAR_FIELD_TYPES,
    UNIT_FIELD_TYPES,
)
from src.services.agent_operation_service import bind_or_reject, canonical_input_payload, load_result, record_success
from src.services.agent_state_service import (
    FOREIGN_LINK_MSG,
    compute_project_fingerprint,
    ensure_no_foreign_links,
    resolve_project_definition,
    resolve_project_form,
    resolve_project_form_field,
)

# 赛美斯项目人工新写字段 OID 上限（与前端 FIELD_OID_MAX_LENGTH 契约一致）
_SAIMEISI_FIELD_OID_MAX_LENGTH = 8

# 实例补丁允许键（InstanceUpsert 的封闭子集）
INSTANCE_PATCH_KEYS = frozenset(
    {
        "required",
        "label_override",
        "help_text",
        "default_value",
        "inline_mark",
        "bg_color",
        "text_color",
        "label_bold",
        "label_font_size",
    }
)
_HEX_COLOR_KEYS = frozenset({"bg_color", "text_color"})
_LABEL_FONT_SIZES = frozenset({"large", "default", "small"})


def _check_fingerprint(session: Session, project_id: int, expected: str) -> str:
    current = compute_project_fingerprint(session, project_id)
    if current != expected:
        raise AgentToolError(
            409,
            "项目内容已变化（指纹不匹配），请重新读取项目状态后重试；request_id 保持不变可安全重试",
            CODE_STALE_STATE,
        )
    return current


def _validate_patch(patch: dict, structural_forbidden: bool = True) -> dict:
    """实例补丁封闭校验：未知键 422，值域校验。"""
    unknown = set(patch) - INSTANCE_PATCH_KEYS
    if unknown:
        raise HTTPException(422, f"补丁包含不支持的键: {', '.join(sorted(unknown))}")
    if "label_bold" in patch and patch["label_bold"] not in (0, 1):
        raise HTTPException(422, "label_bold 必须是 0 或 1")
    if "required" in patch and patch["required"] not in (0, 1):
        raise HTTPException(422, "required 必须是 0 或 1")
    if "inline_mark" in patch and patch["inline_mark"] not in (0, 1):
        raise HTTPException(422, "inline_mark 必须是 0 或 1")
    if "label_font_size" in patch and patch["label_font_size"] not in _LABEL_FONT_SIZES:
        raise HTTPException(422, "label_font_size 必须是 large/default/small")
    for key in _HEX_COLOR_KEYS:
        if key in patch and patch[key] is not None:
            value = patch[key]
            if not isinstance(value, str) or len(value) != 6 or any(c not in "0123456789abcdefABCDEF" for c in value):
                raise HTTPException(422, f"{key} 必须是 6 位 HEX 颜色")
    for key in ("label_override", "help_text"):
        if key in patch and patch[key] is not None and len(str(patch[key])) > 255:
            raise HTTPException(422, f"{key} 超过长度上限")
    return patch


def add_form_field(
    session: Session,
    credential: AgentCredential,
    project: Project,
    data: AddFormFieldInput,
) -> dict:
    """复用或创建定义并按位置放实例：走 create_field_profile 原子命令。"""
    from src.schemas._common import upper_ascii_oid
    from src.schemas.field_profile import (
        BindingOperation,
        DefinitionCreateOrRestore,
        DefinitionOperation,
        DefinitionPayload,
        FieldProfileCommand,
        InstanceOperation,
        InstanceUpsert,
    )
    from src.services.agent_state_service import resolve_project_codelist, resolve_project_unit
    from src.services.field_profile_service import create_field_profile
    from src.services.field_type_policy import allows_multiselect, is_multiselect_field_type

    payload = canonical_input_payload(data)

    form = resolve_project_form(session, project.id, data.form_id)

    source = data.source
    if source.definition_id is None and source.new_definition is None:
        raise HTTPException(422, "source 需要 definition_id 或 new_definition")
    if source.definition_id is not None and source.new_definition is not None:
        raise HTTPException(422, "definition_id 与 new_definition 不能同时提供")

    instance_patch = _validate_patch(data.instance.model_dump(exclude_unset=True))

    if source.definition_id is not None:
        fd = resolve_project_definition(session, project.id, source.definition_id)
        ensure_no_foreign_links(session, project.id, fd)
        if fd.field_type not in REGULAR_FIELD_TYPES:
            raise AgentToolError(422, "结构性字段定义不能通过该工具加入表单", CODE_INCOMPATIBLE_DATA)
        if is_multiselect_field_type(fd.field_type) and not allows_multiselect(project.db_type):
            raise HTTPException(400, "当前项目数据库类型为「其他」，不支持「多选」/「多选（纵向）」字段类型")
        definition_operation = DefinitionOperation(operation="none")
        binding = BindingOperation(mode="existing", target_field_definition_id=fd.id)
        definition_id = fd.id
    else:
        new_def = source.new_definition
        # 新写 OID：ASCII 大写归一（与浏览器写作分支同契约）
        variable_name = upper_ascii_oid(new_def.variable_name)
        # 赛美斯项目人工新写字段 OID ≤ 8 位（服务端策略）
        if project.db_type == "赛美斯" and len(variable_name) > _SAIMEISI_FIELD_OID_MAX_LENGTH:
            raise HTTPException(422, "赛美斯数据库的字段 OID 最多为 8 位")
        if new_def.field_type not in REGULAR_FIELD_TYPES:
            raise HTTPException(422, "不支持的字段类型")
        # 新写 date_format：显式值 canonical 大小写归一（不在契约内 422）；缺省取
        # 类型默认格式；非日期类不适用（normalizeDateFormat / sync 同契约）
        authored_date_format = None
        if new_def.field_type in DATE_FORMAT_FIELD_TYPES:
            if new_def.date_format is None:
                from src.services.field_profile_service import DEFAULT_DATE_FORMATS_BY_TYPE

                authored_date_format = DEFAULT_DATE_FORMATS_BY_TYPE[new_def.field_type]
            else:
                authored_date_format = _validate_date_format(new_def.field_type, new_def.date_format)
        if is_multiselect_field_type(new_def.field_type) and not allows_multiselect(project.db_type):
            raise HTTPException(400, "当前项目数据库类型为「其他」，不支持「多选」/「多选（纵向）」字段类型")
        if new_def.field_type in CHOICE_FIELD_TYPES and new_def.codelist_id is None:
            raise HTTPException(422, "选择类字段（单选/多选/纵向）必须指定项目内编码字典")
        if new_def.codelist_id is not None:
            resolve_project_codelist(session, project.id, new_def.codelist_id)
            if new_def.field_type == "复选":
                raise HTTPException(422, "复选字段不支持编码字典")
        if new_def.unit_id is not None:
            resolve_project_unit(session, project.id, new_def.unit_id)

        # 类型适用性归一（浏览器 syncFieldTypeSpecificProps 同契约）：不适用的
        # 显式值不落库；日期类缺省已取类型默认格式
        definition_payload = DefinitionPayload(
            variable_name=variable_name,
            label=new_def.label,
            field_type=new_def.field_type,
            checkbox_label=new_def.checkbox_label if new_def.field_type == "复选" else None,
            integer_digits=new_def.integer_digits if new_def.field_type == "数值" else None,
            decimal_digits=new_def.decimal_digits if new_def.field_type == "数值" else None,
            date_format=authored_date_format,
            codelist_id=new_def.codelist_id if new_def.field_type in CHOICE_FIELD_TYPES else None,
            unit_id=new_def.unit_id if new_def.field_type in UNIT_FIELD_TYPES else None,
        )
        definition_operation = DefinitionOperation(
            operation="create_or_restore",
            create_or_restore=DefinitionCreateOrRestore(definition=definition_payload),
        )
        binding = BindingOperation(mode="operation_result")
        definition_id = None

    command = FieldProfileCommand(
        definition_operation=definition_operation,
        binding=binding,
        instance=InstanceOperation(
            mode="upsert",
            upsert=InstanceUpsert(**{k: v for k, v in instance_patch.items()}),
        ),
        order_index=data.position,
    )

    try:
        result = create_field_profile(session, project, form, _agent_user(session, credential), command)
    except ValueError as exc:
        # 既有 OrderService.insert_at 的 1..N+1 位置语义：越界是客户端错误
        # （400），调用方事务整体回滚，实例/定义/结果/审计零残留
        raise HTTPException(400, str(exc))
    session.flush()

    ff = result["form_field_obj"]
    outcome = {
        "form_field_id": ff.id,
        "definition_id": ff.field_definition_id,
        "definition_created": bool(result["definition_created"]),
        "project_fingerprint": compute_project_fingerprint(session, project.id),
    }
    record_success(session, credential, project.id, "crf_add_form_field", data.request_id, payload, outcome)
    return outcome


def update_form_field_instance(
    session: Session,
    credential: AgentCredential,
    project: Project,
    data: UpdateFormFieldInstanceInput,
) -> dict:
    """实例补丁：definition=none / binding=keep / instance=upsert / cleanup=None。

    不做隐式共享更新、换绑、删除或结构行编辑。
    """
    from src.schemas.field_profile import (
        BindingOperation,
        DefinitionOperation,
        FieldProfileCommand,
        InstanceOperation,
        InstanceUpsert,
    )
    from src.services.field_profile_service import update_binding_profile

    payload = canonical_input_payload(data)
    ff = resolve_project_form_field(session, project.id, data.form_field_id)

    if ff.is_log_row:
        raise AgentToolError(422, "日志行不支持属性修改", CODE_INCOMPATIBLE_DATA)

    definition = ff.field_definition
    if definition is None or definition.field_type not in REGULAR_FIELD_TYPES:
        raise AgentToolError(422, "结构性字段实例不支持该工具编辑", CODE_INCOMPATIBLE_DATA)
    # 损坏的前向链接（绑定定义属其他项目，或其字典/单位链接跨项目）→ fail closed：
    # 拒绝实例编辑、不暴露外部细节、不静默换绑修复（R6 / §16 资源隔离契约）
    if definition.project_id != project.id:
        raise AgentToolError(422, FOREIGN_LINK_MSG, CODE_INCOMPATIBLE_DATA)
    ensure_no_foreign_links(session, project.id, definition)

    patch = _validate_patch(data.patch.model_dump(exclude_unset=True))
    command = FieldProfileCommand(
        definition_operation=DefinitionOperation(operation="none"),
        binding=BindingOperation(mode="keep"),
        instance=InstanceOperation(mode="upsert", upsert=InstanceUpsert(**patch)),
        cleanup_definition_id=None,
    )
    result = update_binding_profile(session, ff, project, _agent_user(session, credential), command)
    session.flush()

    updated = result["form_field_obj"]
    outcome = {
        "form_field_id": updated.id,
        "definition_id": updated.field_definition_id,
        "definition_created": False,
        "project_fingerprint": compute_project_fingerprint(session, project.id),
    }
    record_success(session, credential, project.id, "crf_update_form_field_instance", data.request_id, payload, outcome)
    return outcome


def reorder_form_fields(
    session: Session,
    credential: AgentCredential,
    project: Project,
    data: ReorderFormFieldsInput,
) -> dict:
    """完整置换（含日志行）：复用仓储 reorder + 终态横向块守卫。"""
    from src.repositories.form_field_repository import FormFieldRepository
    from src.services.inline_table_guard import capture_inline_block_count, ensure_inline_block_limit

    payload = canonical_input_payload(data)
    form = resolve_project_form(session, project.id, data.form_id)

    inline_before = capture_inline_block_count(session, form.id)
    try:
        FormFieldRepository(session).reorder(form.id, list(data.ordered_form_field_ids))
    except ValueError as exc:
        # 既有 reorder 完整性/重复/越权语义（ValueError → 400，调用方事务整体回滚）
        raise HTTPException(400, str(exc))
    session.flush()
    ensure_inline_block_limit(session, form.id, inline_before)

    outcome = {
        "reordered_count": len(data.ordered_form_field_ids),
        "project_fingerprint": compute_project_fingerprint(session, project.id),
    }
    record_success(session, credential, project.id, "crf_reorder_form_fields", data.request_id, payload, outcome)
    return outcome


def check_and_bind(
    session: Session,
    credential: AgentCredential,
    project: Project,
    tool_name: str,
    request_id: str,
    payload: dict,
    expected_fingerprint: str,
) -> tuple[Optional[dict], str]:
    """写事务开头的统一前置：幂等绑定检查 + 指纹校验。

    返回 (既有结果或 None, 校验通过的当前指纹)。重放时先命中幂等记录、
    再校验指纹：重放不因内容已变而失败，原样返回首次结果。
    """
    existing = bind_or_reject(session, credential, project.id, tool_name, request_id, payload)
    if existing is not None:
        result = load_result(existing)
        result["replay"] = True
        return result, existing.after_fingerprint or _check_fingerprint(session, project.id, expected_fingerprint)
    current = _check_fingerprint(session, project.id, expected_fingerprint)
    return None, current


def _agent_user(session: Session, credential: AgentCredential):
    """profile 服务需要一个 User（属主身份）；agent 操作以属主身份执行业务校验，
    但授权边界仍由凭据/项目范围决定。"""
    from src.models.user import User

    user = session.get(User, credential.owner_id)
    if user is None:
        raise HTTPException(401, "凭据无效或已失效")
    return user


def _validate_date_format(field_type: str, date_format: Optional[str]) -> Optional[str]:
    """显式日期格式必须落在 canonical 前端选项契约内；通过则返回 canonical 写法
    （大小写归一存储，不保留原始大小写）。None / '' 原样返回（由调用方决定缺省）。"""
    from src.database import _DATE_FORMAT_CANONICALS

    if date_format is None or date_format == "":
        return date_format
    canonical = _DATE_FORMAT_CANONICALS.get(field_type, {}).get(date_format.lower())
    if canonical is None:
        raise HTTPException(422, f"不支持的日期格式: {date_format}")
    return canonical
