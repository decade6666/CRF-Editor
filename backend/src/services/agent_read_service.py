"""Agent 读服务：有界授权投影 / 字面检索 / 引用影响。

所有投影完整且真实（存储覆盖与有效值区分、有序选项、字典/单位链接、
真实放置与访视/实例标识）；任何隐藏跨项目关联一律 fail closed 拒绝（422），
不序列化也不静默排除外部内容。
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.models.codelist import CodeList, CodeListOption
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.unit import Unit
from src.models.visit import Visit
from src.models.visit_form import VisitForm
from src.schemas.agent_tools import (
    DATE_FORMAT_FIELD_TYPES,
    MAX_FORM_FIELDS,
    MAX_REFERENCE_ITEMS,
    MAX_SEARCH_PAGE_SIZE,
    REGULAR_FIELD_TYPES,
    SEARCH_DEFAULT_LIMIT,
    CHOICE_FIELD_TYPES,
    CODE_INCOMPATIBLE_DATA,
)
from src.agent_dependencies import AgentToolError
from src.services.agent_state_service import (
    compute_project_fingerprint,
    ensure_definitions_in_project,
    ensure_no_foreign_links,
    ensure_visit_form_links_in_project,
    resolve_project_codelist,
    resolve_project_definition,
    resolve_project_form,
    resolve_project_unit,
)

# 结构性类型不出现在 agent 常规字段检索/创作
STRUCTURAL_FIELD_TYPES = ("标签", "日志行")

_MAX_OUTLINE_ITEMS = 500
_MAX_OUTLINE_OPTION_COUNT = 500


def _project_summary(project: Project) -> dict:
    return {"id": project.id, "name": project.name, "version": project.version, "db_type": project.db_type or "其他"}


def _visit_names_for_forms(session: Session, form_ids: list[int]) -> dict[int, list[str]]:
    """表单 → 访视名（稳定排序）；一次查询带出。"""
    if not form_ids:
        return {}
    rows = session.execute(
        select(VisitForm.form_id, Visit.name)
        .join(Visit, Visit.id == VisitForm.visit_id)
        .where(VisitForm.form_id.in_(form_ids))
        .order_by(VisitForm.form_id, Visit.sequence, Visit.id)
    ).all()
    names: dict[int, list[str]] = {}
    for form_id, name in rows:
        names.setdefault(form_id, []).append(name)
    return names


def list_granted_project(session: Session, project: Project) -> dict:
    fingerprint = compute_project_fingerprint(session, project.id)
    return {
        "data": {"projects": [_project_summary(project)]},
        "project_fingerprint": fingerprint,
        "warnings": [],
    }


def get_project_outline(session: Session, project: Project) -> dict:
    pid = project.id
    forms = list(session.scalars(select(Form).where(Form.project_id == pid).order_by(Form.order_index, Form.id)).all())
    visits = list(
        session.scalars(select(Visit).where(Visit.project_id == pid).order_by(Visit.sequence, Visit.id)).all()
    )
    codelists = list(
        session.scalars(
            select(CodeList).where(CodeList.project_id == pid).order_by(CodeList.order_index, CodeList.id)
        ).all()
    )
    units = list(session.scalars(select(Unit).where(Unit.project_id == pid).order_by(Unit.order_index, Unit.id)).all())
    if max(len(forms), len(visits), len(codelists), len(units)) > _MAX_OUTLINE_ITEMS:
        raise HTTPException(413, "项目摘要条目超出上限")

    # 访视↔表单链接双向 fail closed：外部访视链接授权表单 / 授权访视链接外部表单 → 拒绝
    ensure_visit_form_links_in_project(
        session, pid, form_ids=[form.id for form in forms], visit_ids=[visit.id for visit in visits]
    )

    visit_forms = list(
        session.scalars(
            select(VisitForm).where(VisitForm.visit_id.in_([v.id for v in visits])).order_by(VisitForm.sequence)
        ).all()
    )
    # 选项计数只统计授权项目的字典：其他属主/回收站项目的大字典不得耦合全局上限
    option_counts = dict(
        session.execute(
            select(CodeListOption.codelist_id, func.count(CodeListOption.id))
            .join(CodeList, CodeList.id == CodeListOption.codelist_id)
            .where(CodeList.project_id == pid)
            .group_by(CodeListOption.codelist_id)
        ).all()
    )
    if option_counts and max(option_counts.values()) > _MAX_OUTLINE_OPTION_COUNT:
        raise HTTPException(413, "字典选项数超出摘要上限")

    return {
        "data": {
            "project": _project_summary(project),
            "forms": [
                {
                    "id": f.id,
                    "name": f.name,
                    "code": f.code,
                    "domain": f.domain,
                    "order_index": f.order_index,
                    "paper_orientation": f.paper_orientation or "auto",
                }
                for f in forms
            ],
            "visits": [
                {
                    "id": v.id,
                    "name": v.name,
                    "code": v.code,
                    "sequence": v.sequence,
                    "form_ids": [vf.form_id for vf in visit_forms if vf.visit_id == v.id],
                }
                for v in visits
            ],
            "codelists": [
                {"id": c.id, "name": c.name, "code": c.code, "option_count": option_counts.get(c.id, 0)}
                for c in codelists
            ],
            "units": [{"id": u.id, "symbol": u.symbol, "code": u.code} for u in units],
            "editing_rules": {
                "regular_field_types": list(REGULAR_FIELD_TYPES),
                "structural_field_types": list(STRUCTURAL_FIELD_TYPES),
                "date_format_field_types": list(DATE_FORMAT_FIELD_TYPES),
                "choice_field_types": list(CHOICE_FIELD_TYPES),
                "saimeisi_field_oid_max_length": 8,
                "integer_digits_range": [1, 20],
                "decimal_digits_range": [0, 15],
                "max_form_fields": MAX_FORM_FIELDS,
            },
        },
        "project_fingerprint": compute_project_fingerprint(session, pid),
        "warnings": [],
    }


def _ordered_options(session: Session, codelist_ids: list[int]) -> dict[int, list[CodeListOption]]:
    """字典 → 有序选项（order_index, id）；引用的字典内容属授权项目（已 fail closed 校验）。"""
    if not codelist_ids:
        return {}
    options = list(
        session.scalars(
            select(CodeListOption)
            .where(CodeListOption.codelist_id.in_(codelist_ids))
            .order_by(CodeListOption.order_index.nulls_last(), CodeListOption.id)
        ).all()
    )
    grouped: dict[int, list[CodeListOption]] = {}
    for option in options:
        grouped.setdefault(option.codelist_id, []).append(option)
    return grouped


def _definition_view(session: Session, definition: FieldDefinition) -> dict:
    """完整有效定义投影（类型专属设置 + 字典/单位链接 + 有序选项）。

    损坏的外部字典/单位链接 fail closed（422），不走 404 解析路径。
    """
    ensure_no_foreign_links(session, definition.project_id, definition)
    codelist = (
        resolve_project_codelist(session, definition.project_id, definition.codelist_id)
        if definition.codelist_id is not None
        else None
    )
    unit = (
        resolve_project_unit(session, definition.project_id, definition.unit_id)
        if definition.unit_id is not None
        else None
    )
    options = _ordered_options(session, [definition.codelist_id]).get(definition.codelist_id, []) if codelist else []
    return {
        "id": definition.id,
        "variable_name": definition.variable_name,
        "label": definition.label,
        "field_type": definition.field_type,
        "checkbox_label": definition.checkbox_label,
        "integer_digits": definition.integer_digits,
        "decimal_digits": definition.decimal_digits,
        "date_format": definition.date_format,
        "codelist_id": definition.codelist_id,
        "codelist_name": codelist.name if codelist else None,
        "unit_id": definition.unit_id,
        "unit_symbol": unit.symbol if unit else None,
        "options": [{"id": o.id, "code": o.code, "decode": o.decode} for o in options],
    }


def get_form_detail(session: Session, project: Project, form_id: int) -> dict:
    form = resolve_project_form(session, project.id, form_id)
    rows = list(
        session.scalars(
            select(FormField).where(FormField.form_id == form.id).order_by(FormField.order_index, FormField.id)
        ).all()
    )
    if len(rows) > MAX_FORM_FIELDS:
        raise HTTPException(413, f"表单字段超出上限 {MAX_FORM_FIELDS}")

    definition_ids = [ff.field_definition_id for ff in rows if ff.field_definition_id]
    # 隐藏跨项目/缺失定义引用 → fail closed（不序列化外部定义元数据）
    definitions = ensure_definitions_in_project(session, project.id, definition_ids)

    rendered = []
    for ff in rows:
        definition = definitions.get(ff.field_definition_id) if ff.field_definition_id else None
        effective_label = ff.label_override or (definition.label if definition else None)
        rendered.append(
            {
                "id": ff.id,
                "order_index": ff.order_index,
                "is_log_row": bool(ff.is_log_row),
                "definition": _definition_view(session, definition) if definition else None,
                "label_override": ff.label_override,
                "label": effective_label,
                "required": bool(ff.required),
                "inline_mark": bool(ff.inline_mark),
                "default_value": ff.default_value,
                "help_text": ff.help_text,
                "bg_color": ff.bg_color,
                "text_color": ff.text_color,
                "label_bold": bool(ff.label_bold),
                "label_font_size": ff.label_font_size,
            }
        )

    return {
        "data": {
            "form": {
                "id": form.id,
                "name": form.name,
                "code": form.code,
                "domain": form.domain,
                "order_index": form.order_index,
                "paper_orientation": form.paper_orientation or "auto",
            },
            "rows": rendered,
            "definition_count": len(definitions),
        },
        "project_fingerprint": compute_project_fingerprint(session, project.id),
        "warnings": [],
    }


def search_field_definitions(
    session: Session,
    project: Project,
    query: str,
    limit: int = SEARCH_DEFAULT_LIMIT,
    offset: int = 0,
) -> dict:
    """项目内常规字段候选：精确 OID 优先 → OID/标签子串；不做模糊/自动首匹配。"""
    limit = min(limit, MAX_SEARCH_PAGE_SIZE)
    text = query.strip()
    if not text:
        raise HTTPException(422, "检索词不能为空")

    rows = list(
        session.scalars(
            select(FieldDefinition)
            .where(
                FieldDefinition.project_id == project.id,
                FieldDefinition.field_type.notin_(STRUCTURAL_FIELD_TYPES),
            )
            .order_by(FieldDefinition.order_index, FieldDefinition.id)
        ).all()
    )
    if len(rows) > MAX_FORM_FIELDS * 10:
        raise HTTPException(413, "字段库条目超出检索上限")

    exact, substring = [], []
    lowered = text.lower()
    for fd in rows:
        if fd.variable_name == text:
            exact.append(fd)
        elif lowered in (fd.variable_name or "").lower() or lowered in (fd.label or "").lower():
            substring.append(fd)

    matches = exact + substring
    total = len(matches)
    page = matches[offset : offset + limit]

    # 真实放置表单（授权项目内；排除日志行实例外的普通绑定）
    placements: dict[int, list[int]] = {}
    page_ids = [fd.id for fd in page]
    if page_ids:
        placement_rows = session.execute(
            select(FormField.field_definition_id, Form.id)
            .join(Form, Form.id == FormField.form_id)
            .where(FormField.field_definition_id.in_(page_ids), Form.project_id == project.id)
            .order_by(Form.id)
        ).all()
        for definition_id, form_id in placement_rows:
            forms_for = placements.setdefault(definition_id, [])
            if form_id not in forms_for:
                forms_for.append(form_id)

    return {
        "data": {
            "candidates": [
                {
                    "definition_id": fd.id,
                    "variable_name": fd.variable_name,
                    "label": fd.label,
                    "field_type": fd.field_type,
                    "placed_form_ids": placements.get(fd.id, []),
                    "match_kind": "exact" if fd in exact else "substring",
                }
                for fd in page
            ],
            "total": total,
            "offset": offset,
            "has_more": offset + limit < total,
        },
        "project_fingerprint": compute_project_fingerprint(session, project.id),
        "warnings": [],
    }


def get_reference_impact(session: Session, project: Project, resource_type: str, resource_id: int) -> dict:
    """授权资源引用影响：已放置影响 + 未放置定义单列（完整集合，超限拒绝）。"""
    pid = project.id
    if resource_type == "definition":
        fd = resolve_project_definition(session, pid, resource_id)
        resource = {
            "id": fd.id,
            "variable_name": fd.variable_name,
            "label": fd.label,
            "field_type": fd.field_type,
        }
        # 全量引用（无项目过滤）先做 fail closed：隐藏外部表单引用 → 拒绝
        placed = _definition_placed_impact(session, pid, fd.id)
        unplaced: list = []
    elif resource_type == "codelist":
        cl = resolve_project_codelist(session, pid, resource_id)
        resource = {"id": cl.id, "name": cl.name, "code": cl.code}
        placed, unplaced = _codelist_unit_impact(session, pid, FieldDefinition.codelist_id, resource_id)
    elif resource_type == "unit":
        unit = resolve_project_unit(session, pid, resource_id)
        resource = {"id": unit.id, "symbol": unit.symbol, "code": unit.code}
        placed, unplaced = _codelist_unit_impact(session, pid, FieldDefinition.unit_id, resource_id)
    elif resource_type == "form":
        form = resolve_project_form(session, pid, resource_id)
        resource = {"id": form.id, "name": form.name, "code": form.code}
        placed = _form_placed_impact(session, pid, form)
        unplaced = []
    else:
        raise HTTPException(422, "resource_type 不支持")

    total = sum(len(item.get("instance_ids") or []) + 1 for item in placed) + len(unplaced)
    if total > MAX_REFERENCE_ITEMS:
        raise HTTPException(413, "引用影响条目超出上限，请缩小范围")

    return {
        "data": {
            "resource_type": resource_type,
            "resource": resource,
            "placed_forms": placed,
            "unplaced_definitions": unplaced,
            "total_items": total,
        },
        "project_fingerprint": compute_project_fingerprint(session, pid),
        "warnings": [],
    }


def _form_placed_impact(session: Session, project_id: int, form: Form) -> list[dict]:
    # 表单 → 访视方向 fail closed：外部访视链接授权表单 → 拒绝（不序列化外部访视名）
    ensure_visit_form_links_in_project(session, project_id, form_ids=[form.id])
    visits = list(
        session.scalars(
            select(Visit.name)
            .join(VisitForm, VisitForm.visit_id == Visit.id)
            .where(VisitForm.form_id == form.id)
            .order_by(Visit.sequence, Visit.id)
        ).all()
    )
    return [
        {
            "form_id": form.id,
            "form_name": form.name,
            "form_oid": form.code,
            "visit_names": visits,
            "instance_ids": [],
            "attribute_changes": [],
        }
    ]


def _definition_placed_impact(session: Session, project_id: int, definition_id: int) -> list[dict]:
    """定义的已放置影响（真实表单/实例/访视标识；外部引用 fail closed）。"""
    pairs = list(
        session.execute(
            select(FormField, Form)
            .join(Form, Form.id == FormField.form_id)
            .where(FormField.field_definition_id == definition_id)
            .order_by(Form.order_index, Form.id, FormField.id)
        ).all()
    )
    foreign = [form for _ff, form in pairs if form.project_id != project_id]
    if foreign:
        raise AgentToolError(422, "数据存在无效的跨项目关联，已拒绝操作", CODE_INCOMPATIBLE_DATA)
    grouped: dict[int, list[int]] = {}
    forms_by_id: dict[int, Form] = {}
    for ff, form in pairs:
        grouped.setdefault(form.id, []).append(ff.id)
        forms_by_id[form.id] = form
    ensure_visit_form_links_in_project(session, project_id, form_ids=list(grouped))
    visit_names = _visit_names_for_forms(session, list(grouped))
    return [
        {
            "form_id": form_id,
            "form_name": forms_by_id[form_id].name,
            "form_oid": forms_by_id[form_id].code,
            "visit_names": visit_names.get(form_id, []),
            "instance_ids": instance_ids,
            "attribute_changes": [],
        }
        for form_id, instance_ids in sorted(grouped.items())
    ]


def _codelist_unit_impact(session: Session, project_id: int, fk_column, resource_id: int):
    """字典/单位引用：已放置（真实表单/实例/访视标识）+ 未放置定义单列。

    全量引用先 fail closed：引用方定义或宿主表单跨项目 → 422（不泄露外部名称）。
    """
    linked_definition_ids = list(
        session.scalars(select(FieldDefinition.id).where(fk_column == resource_id).order_by(FieldDefinition.id)).all()
    )
    if linked_definition_ids:
        ensure_definitions_in_project(session, project_id, linked_definition_ids)

    placed_map: dict[int, dict] = {}
    referenced_ids: set[int] = set()
    if linked_definition_ids:
        pairs = list(
            session.execute(
                select(FormField, Form)
                .join(Form, Form.id == FormField.form_id)
                .where(FormField.field_definition_id.in_(linked_definition_ids))
                .order_by(Form.order_index, Form.id, FormField.id)
            ).all()
        )
        foreign = [form for _ff, form in pairs if form.project_id != project_id]
        if foreign:
            raise AgentToolError(422, "数据存在无效的跨项目关联，已拒绝操作", CODE_INCOMPATIBLE_DATA)
        for ff, form in pairs:
            entry = placed_map.setdefault(
                form.id,
                {
                    "form_id": form.id,
                    "form_name": form.name,
                    "form_oid": form.code,
                    "visit_names": [],
                    "instance_ids": [],
                    "attribute_changes": [],
                },
            )
            entry["instance_ids"].append(ff.id)
            referenced_ids.add(ff.field_definition_id)

    ensure_visit_form_links_in_project(session, project_id, form_ids=list(placed_map))
    visit_names = _visit_names_for_forms(session, list(placed_map))
    for form_id, entry in placed_map.items():
        entry["visit_names"] = visit_names.get(form_id, [])

    # 未放置（仅字段库）定义：授权项目内、引用该字典/单位且无任何实例
    unplaced_defs = list(
        session.scalars(
            select(FieldDefinition)
            .where(
                fk_column == resource_id,
                FieldDefinition.project_id == project_id,
                FieldDefinition.id.notin_(
                    select(FormField.field_definition_id).where(FormField.field_definition_id.isnot(None))
                ),
            )
            .order_by(FieldDefinition.id)
        ).all()
    )
    unplaced = [
        {"id": d.id, "variable_name": d.variable_name, "label": d.label, "field_type": d.field_type}
        for d in unplaced_defs
    ]

    placed = [placed_map[form_id] for form_id in sorted(placed_map)]
    return placed, unplaced
