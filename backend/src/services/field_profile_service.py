"""字段 profile 原子命令执行核心。

`POST /api/forms/{form_id}/field-profile` 与
`PUT /api/form-fields/{ff_id}/binding-profile` 共享本服务：
所有校验与写操作在调用方传入的单个事务 session 内完成，任一步失败由
`get_session` 整体回滚。

命令组合语义：
- definition_operation.none / update_shared / create_or_restore
- binding.keep / existing / operation_result
- instance.upsert / delete
- cleanup_definition_id：仅限请求开始前实例绑定的定义，换绑/删除后无引用则删
"""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.dependencies import (
    verify_field_definition_owner,
    verify_project_codelist_owner,
    verify_project_unit_owner,
)
from src.models.field_definition import FieldDefinition
from src.models.form_field import FormField
from src.models.user import User
from src.schemas.field_profile import FieldProfileCommand
from src.services.field_cleanup_service import (
    delete_form_field_and_cleanup_label_definition,
)
from src.services.field_normalization import (
    normalize_field_instance_default_value,
    normalize_field_instance_inline_mark,
)
from src.services.order_service import OrderService

FORK_OID_CONFLICT_MSG = "该OID已在字段库中存在，请从候选中选择或修改OID"
LOG_ROW_REJECT_MSG = "日志行不支持换绑或属性修改"
OID_CHANGE_REQUIRES_FORK_MSG = "OID 变更需通过新建字段完成，请修改OID后保存为新字段"
SHARED_DEF_IN_FORM_MSG = "该字段已在表单中"


def _reject_disallowed_multiselect(project, field_type: str) -> None:
    from src.services.field_type_policy import allows_multiselect, is_multiselect_field_type

    if is_multiselect_field_type(field_type) and not allows_multiselect(getattr(project, "db_type", None)):
        raise HTTPException(400, "当前项目数据库类型为「其他」，不支持「多选」/「多选（纵向）」字段类型")


def _validate_definition_links(project, definition_payload, current_user: User, session: Session) -> None:
    _reject_disallowed_multiselect(project, definition_payload.field_type)
    if definition_payload.codelist_id is not None:
        verify_project_codelist_owner(definition_payload.codelist_id, project.id, current_user, session)
    if definition_payload.unit_id is not None:
        verify_project_unit_owner(definition_payload.unit_id, project.id, current_user, session)


def _find_project_definition_by_oid(session: Session, project_id: int, variable_name: str) -> Optional[FieldDefinition]:
    return session.scalar(
        select(FieldDefinition).where(
            FieldDefinition.project_id == project_id,
            FieldDefinition.variable_name == variable_name,
        )
    )


def _apply_definition_payload(fd: FieldDefinition, payload) -> None:
    for key in (
        "variable_name",
        "label",
        "field_type",
        "checkbox_label",
        "integer_digits",
        "decimal_digits",
        "date_format",
        "codelist_id",
        "unit_id",
        "is_multi_record",
        "table_type",
    ):
        setattr(fd, key, getattr(payload, key))


def _resolve_definition_operation(
    session: Session,
    project,
    current_user: User,
    command: FieldProfileCommand,
):
    """执行 definition_operation，返回 (final_definition, created, restored)。"""
    operation = command.definition_operation
    if operation.operation == "none":
        return None, False, False

    if operation.operation == "update_shared":
        payload = operation.update_shared
        fd = verify_field_definition_owner(payload.target_definition_id, current_user, session)
        if fd.project_id != project.id:
            raise HTTPException(403, "无权修改该项目的字段定义")
        if payload.definition.variable_name != fd.variable_name:
            raise HTTPException(422, OID_CHANGE_REQUIRES_FORK_MSG)
        _validate_definition_links(project, payload.definition, current_user, session)
        _apply_definition_payload(fd, payload.definition)
        return fd, False, False

    payload = operation.create_or_restore
    definition_snapshot = payload.definition
    _validate_definition_links(project, definition_snapshot, current_user, session)

    existing = _find_project_definition_by_oid(session, project.id, definition_snapshot.variable_name)
    if existing is not None:
        preferred = payload.preferred_definition_id
        if preferred is not None and existing.id == preferred:
            return existing, False, True
        raise HTTPException(409, FORK_OID_CONFLICT_MSG)

    fd = FieldDefinition(project_id=project.id)
    _apply_definition_payload(fd, definition_snapshot)
    fd.order_index = OrderService.get_next_order(session, FieldDefinition, FieldDefinition.project_id == project.id)
    session.add(fd)
    session.flush()
    return fd, True, False


def _resolve_binding(
    session: Session,
    project,
    current_user: User,
    command: FieldProfileCommand,
    form_id: int,
    final_definition,
    current_form_field: Optional[FormField],
) -> Optional[FieldDefinition]:
    """解析最终绑定的定义；delete 模式返回哨兵（由调用方处理）。"""
    binding = command.binding
    if binding.mode == "keep":
        return current_form_field.field_definition if current_form_field is not None else None
    if binding.mode == "operation_result":
        if final_definition is None:
            raise HTTPException(400, "binding=operation_result 需要创建或恢复定义")
        return final_definition
    # existing
    target = verify_field_definition_owner(binding.target_field_definition_id, current_user, session)
    if target.project_id != project.id:
        raise HTTPException(403, "无权将该项目的字段定义绑定到表单")
    duplicate = session.scalar(
        select(FormField).where(
            FormField.form_id == form_id,
            FormField.field_definition_id == target.id,
        )
    )
    if duplicate is not None and (current_form_field is None or duplicate.id != current_form_field.id):
        raise HTTPException(409, SHARED_DEF_IN_FORM_MSG)
    return target


def _apply_instance_upsert(ff: FormField, upsert_payload, final_definition: Optional[FieldDefinition]) -> None:
    payload = upsert_payload
    if payload is not None:
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(ff, key, value)

    final_type = final_definition or ff.field_definition or None
    field_type = final_type.field_type if final_type is not None else None
    if field_type is None:
        return
    is_log_row = bool(getattr(ff, "is_log_row", 0))
    ff.inline_mark = normalize_field_instance_inline_mark(field_type, is_log_row, ff.inline_mark)
    ff.default_value = normalize_field_instance_default_value(field_type, ff.inline_mark, ff.default_value)


def _cleanup_previous_definition(
    session: Session,
    command: FieldProfileCommand,
    original_definition_id: Optional[int],
    final_definition_id: Optional[int],
):
    """换绑/删除后清理原绑定定义（无引用才删并压实）。"""
    cleanup_id = command.cleanup_definition_id
    if cleanup_id is None or cleanup_id != original_definition_id:
        return None
    if cleanup_id == final_definition_id:
        return None

    remaining = session.scalar(select(FormField.id).where(FormField.field_definition_id == cleanup_id).limit(1))
    if remaining is not None:
        return {"deleted": False, "retained_in_use": True}

    fd = session.get(FieldDefinition, cleanup_id)
    if fd is None:
        return {"deleted": False, "retained_in_use": False}
    OrderService.delete_and_compact(session, FieldDefinition, FieldDefinition.project_id == fd.project_id, fd)
    return {"deleted": True, "retained_in_use": False}


def _serialize_result(ff: Optional[FormField], final_definition_id, created, restored, cleanup) -> dict:
    return {
        "form_field_id": ff.id if ff is not None else None,
        "form_field_obj": ff,
        "final_definition_id": final_definition_id,
        "definition_created": created,
        "definition_restored": restored,
        "cleanup": cleanup,
    }


def create_field_profile(
    session: Session,
    project,
    form,
    current_user: User,
    command: FieldProfileCommand,
) -> dict:
    """新增草稿落库：定义操作 + 实例创建（或绑定既有定义）。"""
    if command.instance.mode != "upsert":
        raise HTTPException(400, "新增字段仅支持 instance=upsert")

    if command.definition_operation.operation == "create_or_restore" and command.binding.mode != "operation_result":
        raise HTTPException(400, "新建定义必须绑定到新实例")

    final_definition, created, restored = _resolve_definition_operation(session, project, current_user, command)

    if final_definition is None and command.binding.mode != "existing":
        raise HTTPException(400, "新增字段需要创建定义或绑定既有定义")

    target_definition = _resolve_binding(
        session,
        project,
        current_user,
        command,
        form.id,
        final_definition,
        None,
    )
    final_definition_id = target_definition.id if target_definition is not None else None

    ff = FormField(form_id=form.id, field_definition_id=final_definition_id)
    session.add(ff)
    ff.field_definition = target_definition
    upsert = command.instance.upsert
    if upsert is not None:
        for key, value in upsert.model_dump(exclude_unset=True).items():
            setattr(ff, key, value)
    ff.inline_mark = normalize_field_instance_inline_mark(
        target_definition.field_type if target_definition is not None else "",
        False,
        ff.inline_mark,
    )
    ff.default_value = normalize_field_instance_default_value(
        target_definition.field_type if target_definition is not None else "",
        ff.inline_mark,
        ff.default_value,
    )

    if command.order_index is None:
        ff.order_index = OrderService.get_next_order(session, FormField, FormField.form_id == form.id)
    else:
        OrderService.insert_at(session, FormField, FormField.form_id == form.id, ff, command.order_index)
    session.flush()
    return _serialize_result(ff, final_definition_id, created, restored, None)


def update_binding_profile(
    session: Session,
    ff: FormField,
    project,
    current_user: User,
    command: FieldProfileCommand,
) -> dict:
    """已有字段：定义操作 + 换绑 + 实例部分更新/删除 + 原定义清理。"""
    if bool(ff.is_log_row):
        raise HTTPException(400, LOG_ROW_REJECT_MSG)

    original_definition_id = ff.field_definition_id

    if command.instance.mode == "delete":
        delete_form_field_and_cleanup_label_definition(session, ff)
        session.flush()
        cleanup = _cleanup_previous_definition(session, command, original_definition_id, None)
        return _serialize_result(None, None, False, False, cleanup)

    final_definition, created, restored = _resolve_definition_operation(session, project, current_user, command)
    target_definition = _resolve_binding(
        session,
        project,
        current_user,
        command,
        ff.form_id,
        final_definition,
        ff,
    )
    final_definition_id = target_definition.id if target_definition is not None else None

    if command.binding.mode == "operation_result" and final_definition is None:
        raise HTTPException(400, "binding=operation_result 需要创建或恢复定义")

    if final_definition_id != ff.field_definition_id and command.instance.mode != "delete":
        ff.field_definition_id = final_definition_id
        ff.field_definition = target_definition

    _apply_instance_upsert(
        ff, command.instance.upsert if command.instance.mode == "upsert" else None, target_definition
    )
    session.flush()

    cleanup = _cleanup_previous_definition(session, command, original_definition_id, final_definition_id)
    return _serialize_result(ff, final_definition_id, created, restored, cleanup)
