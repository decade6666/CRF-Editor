"""字段定义（字典 / 单位）引用查询共享服务。

删除守卫的判定口径是「任意 FieldDefinition.codelist_id / unit_id 指向目标」，
与字段是否已放入表单无关；而历史的引用查询只走 Form → FormField → FieldDefinition
内连接，看不到仅存在于字段库、未放入任何表单的字段。两个口径必须由同一个查询
构造器统一，避免删除流程的引用检查与守卫不一致。
"""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import InstrumentedAttribute, Session

from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField


def collect_field_definition_references(
    session: Session,
    fk_column: InstrumentedAttribute,
    target_ids: Iterable[int],
    *,
    include_unplaced: bool = False,
) -> dict[int, list[dict]]:
    """按删除守卫口径收集字典 / 单位被字段引用的明细。

    返回 ``{target_id: [{form_name, form_code, field_label, field_var}, ...]}``；
    空 target_ids 直接返回 {}。

    include_unplaced=False（默认）：保持历史内连接口径（Form → FormField →
    FieldDefinition），只返回已放入表单的字段引用，行集与历史响应完全一致。
    include_unplaced=True：改为 FieldDefinition 左外连接 FormField / Form，
    每个已放置的字段定义每个 FormField 生成一行；未放入任何表单的字段定义
    生成一行 form_name / form_code 为 None 的引用行。

    不加 ORDER BY：默认模式输出必须与历史行为逐行一致。
    """
    ids = list(target_ids)
    if not ids:
        return {}

    if include_unplaced:
        stmt = (
            select(fk_column, Form.name, Form.code, FieldDefinition.label, FieldDefinition.variable_name)
            .select_from(FieldDefinition)
            .outerjoin(FormField, FormField.field_definition_id == FieldDefinition.id)
            .outerjoin(Form, Form.id == FormField.form_id)
            .where(fk_column.in_(ids))
        )
    else:
        stmt = (
            select(fk_column, Form.name, Form.code, FieldDefinition.label, FieldDefinition.variable_name)
            .select_from(Form)
            .join(FormField, FormField.form_id == Form.id)
            .join(FieldDefinition, FieldDefinition.id == FormField.field_definition_id)
            .where(fk_column.in_(ids))
        )

    result: dict[int, list[dict]] = {}
    for row in session.execute(stmt).all():
        result.setdefault(row[0], []).append(
            {
                "form_name": row[1],
                "form_code": row[2],
                "field_label": row[3],
                "field_var": row[4],
            }
        )
    return result
