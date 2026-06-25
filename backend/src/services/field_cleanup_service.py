"""字段删除后结构性定义清理。"""
from __future__ import annotations

from collections import defaultdict
from typing import Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.models.field_definition import FieldDefinition
from src.models.form_field import FormField
from src.repositories.field_definition_repository import FieldDefinitionRepository
from src.repositories.form_field_repository import FormFieldRepository
from src.services.order_service import OrderService

LABEL_FIELD_TYPE = "标签"


def _collect_label_definitions(
    field_definitions: Iterable[FieldDefinition | None],
) -> dict[int, FieldDefinition]:
    collected: dict[int, FieldDefinition] = {}
    for field_definition in field_definitions:
        if field_definition is None or field_definition.id is None:
            continue
        if field_definition.field_type != LABEL_FIELD_TYPE:
            continue
        collected[field_definition.id] = field_definition
    return collected


def _delete_orphan_label_definitions(
    session: Session,
    field_definitions: Iterable[FieldDefinition | None],
) -> None:
    collected = _collect_label_definitions(field_definitions)
    if not collected:
        return

    remaining_ids = set(session.scalars(
        select(FormField.field_definition_id).where(
            FormField.field_definition_id.in_(list(collected.keys()))
        )
    ).all())

    orphan_ids_by_project: dict[int, list[int]] = defaultdict(list)
    for field_definition_id, field_definition in collected.items():
        if field_definition_id in remaining_ids:
            continue
        orphan_ids_by_project[field_definition.project_id].append(field_definition_id)

    repo = FieldDefinitionRepository(session)
    for project_id, orphan_ids in orphan_ids_by_project.items():
        repo.batch_delete(orphan_ids, project_id=project_id)
        OrderService.compact_after_batch_delete(
            session,
            FieldDefinition,
            FieldDefinition.project_id == project_id,
        )


def delete_form_field_and_cleanup_label_definition(
    session: Session,
    form_field: FormField,
) -> None:
    field_definition = form_field.field_definition
    OrderService.delete_and_compact(
        session,
        FormField,
        FormField.form_id == form_field.form_id,
        form_field,
    )
    _delete_orphan_label_definitions(session, [field_definition])


def batch_delete_form_fields_and_cleanup_label_definitions(
    session: Session,
    form_fields: Sequence[FormField],
) -> int:
    if not form_fields:
        return 0

    form_id = form_fields[0].form_id
    field_definitions = [form_field.field_definition for form_field in form_fields]
    count = FormFieldRepository(session).batch_delete([form_field.id for form_field in form_fields])
    OrderService.compact_after_batch_delete(
        session,
        FormField,
        FormField.form_id == form_id,
    )
    _delete_orphan_label_definitions(session, field_definitions)
    return count
