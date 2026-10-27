"""删除撤销的原子批量恢复服务（R9，`POST /api/forms/{form_id}/fields/restore-batch`）。

单次请求内恢复实例、顺序与（仅标签）被清理的定义；任何条目失败或整批终态
违反单横向表格规则时抛错，由调用方请求事务整体回滚。绝不用于导入 /
整表复制 / 整项目复制，也不提供绕过块数规则的开关。

- 常规字段必须绑定现存定义（缺失且无标签快照 → 404）。
- `field_definition` 快照是**标签兜底**：仅当定义已不存在且快照为标签时，
  按既有创建校验重建；绝不借兜底绕过外来定义的归属校验，也不改写现存定义。
- 实例属性（含遗留 inline_mark）按快照原样恢复，不做静默归一。
"""

from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.dependencies import verify_field_definition_owner, verify_project_codelist_owner, verify_project_unit_owner
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.user import User
from src.schemas.field import FieldDefinitionCreate, FormFieldCreate, FormFieldRestoreBatchRequest, FormFieldRestoreItem
from src.services.field_type_policy import allows_multiselect, is_multiselect_field_type
from src.services.inline_table_guard import capture_inline_block_count, ensure_inline_block_limit
from src.services.order_service import OrderService

LABEL_FIELD_TYPE = "标签"
RESTORE_DUPLICATE_MSG = "该字段已在表单中"
RESTORE_SNAPSHOT_CONFLICT_MSG = "恢复失败：快照与现有字段定义不一致"
RESTORE_OID_CONFLICT_MSG = "恢复失败：字段OID与现有字段定义冲突"
RESTORE_SNAPSHOT_NEEDS_DEFINITION_MSG = "恢复快照必须绑定字段定义"


def _reject_disallowed_multiselect(project: Project, field_type: str) -> None:
    if is_multiselect_field_type(field_type) and not allows_multiselect(getattr(project, "db_type", None)):
        raise HTTPException(400, "当前项目数据库类型为「其他」，不支持「多选」/「多选（纵向）」字段类型")


def _validate_definition_links(
    project: Project, definition_payload: FieldDefinitionCreate, current_user: User, session: Session
) -> None:
    _reject_disallowed_multiselect(project, definition_payload.field_type)
    if definition_payload.codelist_id is not None:
        verify_project_codelist_owner(definition_payload.codelist_id, project.id, current_user, session)
    if definition_payload.unit_id is not None:
        verify_project_unit_owner(definition_payload.unit_id, project.id, current_user, session)


def _resolve_existing_definition(
    session: Session,
    project: Project,
    current_user: User,
    definition_id: int,
    snapshot: Optional[FieldDefinitionCreate],
) -> Optional[FieldDefinition]:
    """校验现存定义归属 / 陈旧快照冲突；缺失定义交由调用方走标签兜底或 404。"""
    existing = session.get(FieldDefinition, definition_id)
    if existing is None:
        return None
    verify_field_definition_owner(definition_id, current_user, session)
    if existing.project_id != project.id:
        raise HTTPException(403, "无权向该表单添加其他项目的字段定义")
    if snapshot is not None and snapshot.variable_name != existing.variable_name:
        raise HTTPException(409, RESTORE_SNAPSHOT_CONFLICT_MSG)
    return existing


def _plan_item(
    session: Session,
    project: Project,
    form: Form,
    current_user: User,
    item: FormFieldRestoreItem,
    seen_definition_ids: set,
) -> dict:
    """单条目纯校验：归属 / 冲突 / 缺失语义；返回待执行计划，不产生写副作用。"""
    payload: FormFieldCreate = item.form_field
    definition_id = payload.field_definition_id
    snapshot = item.field_definition

    if definition_id is None:
        if snapshot is not None or not payload.is_log_row:
            raise HTTPException(422, RESTORE_SNAPSHOT_NEEDS_DEFINITION_MSG)
        return {"payload": payload, "definition": None, "recreate_label": None}

    if definition_id in seen_definition_ids:
        raise HTTPException(409, RESTORE_DUPLICATE_MSG)
    seen_definition_ids.add(definition_id)

    existing = _resolve_existing_definition(session, project, current_user, definition_id, snapshot)
    if existing is None:
        if snapshot is None or snapshot.field_type != LABEL_FIELD_TYPE:
            # 与既有归属校验保持同一 404 语义；非标签快照不兜底创建共享定义
            raise HTTPException(404, "字段定义不存在")
        return {"payload": payload, "definition": None, "recreate_label": snapshot}

    duplicate = session.scalar(
        select(FormField).where(FormField.form_id == form.id, FormField.field_definition_id == definition_id)
    )
    if duplicate is not None:
        raise HTTPException(409, RESTORE_DUPLICATE_MSG)
    return {"payload": payload, "definition": existing, "recreate_label": None}


def _recreate_label_definition(
    session: Session,
    project: Project,
    current_user: User,
    snapshot: FieldDefinitionCreate,
) -> FieldDefinition:
    """按既有创建校验重建被清理的标签定义（同 OID 冲突 → 409，不覆盖现有定义）。"""
    conflict = session.scalar(
        select(FieldDefinition).where(
            FieldDefinition.project_id == project.id,
            FieldDefinition.variable_name == snapshot.variable_name,
        )
    )
    if conflict is not None:
        raise HTTPException(409, RESTORE_OID_CONFLICT_MSG)
    _validate_definition_links(project, snapshot, current_user, session)
    fd = FieldDefinition(project_id=project.id)
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
        setattr(fd, key, getattr(snapshot, key))
    fd.order_index = OrderService.get_next_order(session, FieldDefinition, FieldDefinition.project_id == project.id)
    session.add(fd)
    session.flush()
    return fd


def _insert_restored_instance(
    session: Session,
    form: Form,
    payload: FormFieldCreate,
    definition: Optional[FieldDefinition],
) -> FormField:
    """按快照位置恢复实例：显式位置走既有插入位移，缺省追加到末尾；不做标记归一。"""
    ff = FormField(
        form_id=form.id,
        field_definition_id=definition.id if definition is not None else None,
        **payload.model_dump(exclude={"order_index", "field_definition_id"}),
    )
    if payload.order_index is None:
        ff.order_index = OrderService.get_next_order(session, FormField, FormField.form_id == form.id)
        session.add(ff)
    else:
        OrderService.insert_at(session, FormField, FormField.form_id == form.id, ff, payload.order_index)
    if definition is not None:
        ff.field_definition = definition
    return ff


def restore_form_fields_batch(
    session: Session,
    project: Project,
    form: Form,
    current_user: User,
    data: FormFieldRestoreBatchRequest,
) -> List[FormField]:
    """整批原子恢复：先全量校验，再统一写入并校验一次终态横向块数；失败整体回滚。"""
    seen_definition_ids: set = set()
    plans = [_plan_item(session, project, form, current_user, item, seen_definition_ids) for item in data.items]

    inline_blocks_before = capture_inline_block_count(session, form.id)

    recreated_labels: dict = {}
    for plan in plans:
        if plan["recreate_label"] is not None:
            key = plan["recreate_label"].variable_name
            if key not in recreated_labels:
                recreated_labels[key] = _recreate_label_definition(
                    session, project, current_user, plan["recreate_label"]
                )
            plan["definition"] = recreated_labels[key]

    # 显式位置按升序先插入（insert_at 位移语义），缺省位置最后追加
    ordered_plans = sorted(
        enumerate(plans),
        key=lambda pair: (pair[1]["payload"].order_index is None, pair[1]["payload"].order_index or 0),
    )
    created_by_index: dict = {}
    for index, plan in ordered_plans:
        created_by_index[index] = _insert_restored_instance(session, form, plan["payload"], plan["definition"])
    session.flush()

    ensure_inline_block_limit(session, form.id, inline_blocks_before)

    return [created_by_index[index] for index in range(len(plans))]
