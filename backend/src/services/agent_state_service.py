"""Agent 状态服务：项目内容指纹与项目内资源/链接严格解析。"""

from __future__ import annotations

import hashlib
import json

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

# 指纹行数上限（单表与全部设计表累计；超过则拒绝，不静默截断）
MAX_FINGERPRINT_ROWS = 50000

FOREIGN_LINK_MSG = "数据存在无效的跨项目关联，已拒绝操作"


def _canon(value):
    """数据库值的确定性规范化：datetime/date → ISO，其余原样。"""
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def compute_project_fingerprint(session: Session, project_id: int) -> str:
    """授权项目设计元数据的规范 SHA-256 指纹。

    覆盖 project/dictionaries+options/units/definitions/forms/instances/
    visits/visit-form links 的全部持久化设计列（不含时间戳 created_at/
    updated_at、生命周期 deleted_at 与授权簿记 owner_id）；不含凭据/操作/
    审计（审批簿记不得使自身提案失效）。项目行含 crf_version_date/
    screening_number_format/company_logo_path/data_management_unit/order_index
    等全部设计值（company_logo_path 只参与指纹哈希，不出现在工具输出）。
    日期/时间值经 _canon 确定性规范化后序列化。行数上限按表计数并在累计上
    强制（先计数后取行，有界读取）。
    """
    chunks: list[str] = []
    counted = {"rows": 0}

    def _cap(table: str, count: int) -> None:
        if count > MAX_FINGERPRINT_ROWS or counted["rows"] + count > MAX_FINGERPRINT_ROWS:
            raise HTTPException(
                413,
                f"项目数据超出指纹计算上限（{table} {count} 行，累计 {counted['rows'] + count} 行，上限 {MAX_FINGERPRINT_ROWS}）",
            )
        counted["rows"] += count

    def _count(stmt) -> int:
        return int(session.scalar(select(func.count()).select_from(stmt.subquery())) or 0)

    def add(table: str, columns: list[str], rows: list[tuple]):
        normalized = [tuple(_canon(value) for value in row) for row in rows]
        rows_sorted = sorted(normalized, key=lambda r: json.dumps(r, ensure_ascii=False))
        chunks.append(table + "|" + "|".join(columns) + "|" + json.dumps(rows_sorted, ensure_ascii=False))

    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(404, "项目不存在")
    add(
        "project",
        [
            "id",
            "name",
            "version",
            "db_type",
            "order_index",
            "trial_name",
            "crf_version",
            "crf_version_date",
            "protocol_number",
            "screening_number_format",
            "sponsor",
            "company_logo_path",
            "data_management_unit",
        ],
        [
            (
                project.id,
                project.name,
                project.version,
                project.db_type,
                project.order_index,
                project.trial_name,
                project.crf_version,
                project.crf_version_date,
                project.protocol_number,
                project.screening_number_format,
                project.sponsor,
                project.company_logo_path,
                project.data_management_unit,
            )
        ],
    )
    counted["rows"] += 1

    _cap("codelist", _count(select(CodeList).where(CodeList.project_id == project_id)))
    codelists = list(
        session.scalars(select(CodeList).where(CodeList.project_id == project_id).order_by(CodeList.id)).all()
    )
    add(
        "codelist",
        ["id", "name", "code", "description", "order_index"],
        [(c.id, c.name, c.code, c.description, c.order_index) for c in codelists],
    )

    codelist_ids = [c.id for c in codelists]
    option_count = (
        _count(select(CodeListOption).where(CodeListOption.codelist_id.in_(codelist_ids))) if codelist_ids else 0
    )
    _cap("codelist_option", option_count)
    options = (
        list(
            session.scalars(
                select(CodeListOption).where(CodeListOption.codelist_id.in_(codelist_ids)).order_by(CodeListOption.id)
            ).all()
        )
        if codelist_ids
        else []
    )
    add(
        "codelist_option",
        ["id", "codelist_id", "code", "decode", "order_index"],
        [(o.id, o.codelist_id, o.code, o.decode, o.order_index) for o in options],
    )

    _cap("unit", _count(select(Unit).where(Unit.project_id == project_id)))
    units = list(session.scalars(select(Unit).where(Unit.project_id == project_id).order_by(Unit.id)).all())
    add("unit", ["id", "symbol", "code", "order_index"], [(u.id, u.symbol, u.code, u.order_index) for u in units])

    _cap("field_definition", _count(select(FieldDefinition).where(FieldDefinition.project_id == project_id)))
    definitions = list(
        session.scalars(
            select(FieldDefinition).where(FieldDefinition.project_id == project_id).order_by(FieldDefinition.id)
        ).all()
    )
    add(
        "field_definition",
        [
            "id",
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
            "order_index",
        ],
        [
            (
                d.id,
                d.variable_name,
                d.label,
                d.field_type,
                d.checkbox_label,
                d.integer_digits,
                d.decimal_digits,
                d.date_format,
                d.codelist_id,
                d.unit_id,
                d.is_multi_record,
                d.table_type,
                d.order_index,
            )
            for d in definitions
        ],
    )

    _cap("form", _count(select(Form).where(Form.project_id == project_id)))
    forms = list(session.scalars(select(Form).where(Form.project_id == project_id).order_by(Form.id)).all())
    add(
        "form",
        ["id", "name", "code", "domain", "order_index", "design_notes", "annotation_positions", "paper_orientation"],
        [
            (f.id, f.name, f.code, f.domain, f.order_index, f.design_notes, f.annotation_positions, f.paper_orientation)
            for f in forms
        ],
    )

    form_ids = [f.id for f in forms]
    _cap("form_field", _count(select(FormField).where(FormField.form_id.in_(form_ids))) if form_ids else 0)
    instances = (
        list(session.scalars(select(FormField).where(FormField.form_id.in_(form_ids)).order_by(FormField.id)).all())
        if form_ids
        else []
    )
    add(
        "form_field",
        [
            "id",
            "form_id",
            "field_definition_id",
            "is_log_row",
            "order_index",
            "required",
            "label_override",
            "help_text",
            "default_value",
            "inline_mark",
            "bg_color",
            "text_color",
            "label_bold",
            "label_font_size",
        ],
        [
            (
                ff.id,
                ff.form_id,
                ff.field_definition_id,
                ff.is_log_row,
                ff.order_index,
                ff.required,
                ff.label_override,
                ff.help_text,
                ff.default_value,
                ff.inline_mark,
                ff.bg_color,
                ff.text_color,
                ff.label_bold,
                ff.label_font_size,
            )
            for ff in instances
        ],
    )

    _cap("visit", _count(select(Visit).where(Visit.project_id == project_id)))
    visits = list(session.scalars(select(Visit).where(Visit.project_id == project_id).order_by(Visit.id)).all())
    add("visit", ["id", "name", "code", "sequence"], [(v.id, v.name, v.code, v.sequence) for v in visits])

    visit_ids = [v.id for v in visits]
    _cap("visit_form", _count(select(VisitForm).where(VisitForm.visit_id.in_(visit_ids))) if visit_ids else 0)
    visit_forms = (
        list(session.scalars(select(VisitForm).where(VisitForm.visit_id.in_(visit_ids)).order_by(VisitForm.id)).all())
        if visit_ids
        else []
    )
    add(
        "visit_form",
        ["id", "visit_id", "form_id", "sequence"],
        [(vf.id, vf.visit_id, vf.form_id, vf.sequence) for vf in visit_forms],
    )

    return hashlib.sha256("\n".join(chunks).encode("utf-8")).hexdigest()


# ── 项目内资源严格解析 ────────────────────────────────────────────────────


def resolve_project_form(session: Session, project_id: int, form_id: int) -> Form:
    form = session.get(Form, form_id)
    if form is None:
        raise HTTPException(404, "表单不存在")
    if form.project_id != project_id:
        # 跨项目存在性不泄露：与不存在一致
        raise HTTPException(404, "表单不存在")
    return form


def resolve_project_form_field(session: Session, project_id: int, form_field_id: int) -> FormField:
    ff = session.get(FormField, form_field_id)
    if ff is None:
        raise HTTPException(404, "表单字段不存在")
    form = session.get(Form, ff.form_id)
    if form is None or form.project_id != project_id:
        raise HTTPException(404, "表单字段不存在")
    return ff


def resolve_project_definition(session: Session, project_id: int, definition_id: int) -> FieldDefinition:
    fd = session.get(FieldDefinition, definition_id)
    if fd is None or fd.project_id != project_id:
        raise HTTPException(404, "字段定义不存在")
    return fd


def resolve_project_codelist(session: Session, project_id: int, codelist_id: int) -> CodeList:
    cl = session.get(CodeList, codelist_id)
    if cl is None or cl.project_id != project_id:
        raise HTTPException(404, "编码字典不存在")
    return cl


def resolve_project_unit(session: Session, project_id: int, unit_id: int) -> Unit:
    unit = session.get(Unit, unit_id)
    if unit is None or unit.project_id != project_id:
        raise HTTPException(404, "单位不存在")
    return unit


def ensure_no_foreign_links(session: Session, project_id: int, definition: FieldDefinition) -> None:
    """拒绝隐藏跨项目链接（fail closed，不泄露外部细节）。"""
    if definition.codelist_id is not None:
        cl = session.get(CodeList, definition.codelist_id)
        if cl is None or cl.project_id != project_id:
            raise HTTPException(422, FOREIGN_LINK_MSG)
    if definition.unit_id is not None:
        unit = session.get(Unit, definition.unit_id)
        if unit is None or unit.project_id != project_id:
            raise HTTPException(422, FOREIGN_LINK_MSG)


def ensure_definitions_in_project(
    session: Session, project_id: int, definition_ids: list[int]
) -> dict[int, FieldDefinition]:
    """按 ID 批量解析定义；任何缺失或跨项目引用一律 422（fail closed，不序列化外部内容）。"""
    unique_ids = sorted({int(did) for did in definition_ids if did})
    found: dict[int, FieldDefinition] = {}
    if unique_ids:
        rows = session.scalars(select(FieldDefinition).where(FieldDefinition.id.in_(unique_ids))).all()
        found = {row.id: row for row in rows}
    for did in unique_ids:
        definition = found.get(did)
        if definition is None or definition.project_id != project_id:
            raise HTTPException(422, FOREIGN_LINK_MSG)
    return found


def definition_affected_forms(session: Session, project_id: int, definition_id: int) -> list[Form]:
    """定义被授权项目引用的全部表单（去重、稳定排序）。

    隐藏跨项目引用（定义同时被其他项目的表单引用）是矛盾的图状态：
    fail closed 拒绝提案/写入，而不是静默排除外部表单后间接改写它们。
    """
    rows = list(
        session.execute(
            select(Form, Form.project_id)
            .join(FormField, FormField.form_id == Form.id)
            .where(FormField.field_definition_id == definition_id)
            .order_by(Form.order_index, Form.id)
        ).all()
    )
    foreign = [form for form, owner in rows if owner != project_id]
    if foreign:
        raise HTTPException(422, FOREIGN_LINK_MSG)
    seen: dict[int, Form] = {}
    for form, _owner in rows:
        seen[form.id] = form
    return [seen[fid] for fid in sorted(seen)]


def ensure_visit_form_links_in_project(
    session: Session,
    project_id: int,
    form_ids: list[int] | None = None,
    visit_ids: list[int] | None = None,
) -> None:
    """访视↔表单链接双向成员校验（fail closed，不泄露外部名称）。

    - form_ids：这些授权表单关联的访视必须都在项目内（外部访视链接 → 422）
    - visit_ids：这些授权访视关联的表单必须都在项目内（外部表单链接 → 422）
    遗留图里任一方向的跨项目链接都是矛盾状态：拒绝输出/写入，不静默过滤。
    """
    if form_ids:
        rows = session.execute(
            select(VisitForm.form_id, Visit.project_id)
            .join(Visit, Visit.id == VisitForm.visit_id)
            .where(VisitForm.form_id.in_(list(form_ids)))
        ).all()
        if any(owner != project_id for _form_id, owner in rows):
            raise HTTPException(422, FOREIGN_LINK_MSG)
    if visit_ids:
        rows = session.execute(
            select(VisitForm.visit_id, Form.project_id)
            .join(Form, Form.id == VisitForm.form_id)
            .where(VisitForm.visit_id.in_(list(visit_ids)))
        ).all()
        if any(owner != project_id for _visit_id, owner in rows):
            raise HTTPException(422, FOREIGN_LINK_MSG)
