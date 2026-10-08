"""模板字段索引服务 - 只读读取模板库全量可用字段（供 label↔OID 查询）"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional, Set

from sqlalchemy import text
from sqlalchemy.orm import Session

from src.services.import_service import ImportService

logger = logging.getLogger(__name__)

_LABEL_FIELD_TYPE = "标签"


def build_template_field_index(template_path: str) -> List[dict]:
    """打开模板库并返回按模板顺序排列的字段索引条目（dict 与路由响应模型对应）。"""
    session = ImportService._open_template_session(template_path)
    try:
        data = _load_template_data(session)
    finally:
        session.close()
    return _build_entries(data)


def _table_columns(session: Session, table: str) -> Set[str]:
    rows = session.execute(text(f"PRAGMA table_info({table})")).all()
    return {row[1] for row in rows}


def _load_template_data(session: Session) -> dict:
    """整表读取模板数据并在 Python 侧过滤（不用 ORM、不用 IN 参数列表）。"""
    columns = {
        "project_deleted_at": "deleted_at" in _table_columns(session, "project"),
        "form_code": "code" in _table_columns(session, "form"),
        "form_field_label_override": "label_override" in _table_columns(session, "form_field"),
        "field_definition_checkbox_label": "checkbox_label" in _table_columns(session, "field_definition"),
    }
    return {
        "projects": _load_active_projects(session, columns["project_deleted_at"]),
        "forms_by_project": _group_forms(_load_forms(session, columns["form_code"])),
        "fields_by_form": _group_form_fields(
            _load_form_fields(session, columns["form_field_label_override"])
        ),
        "definitions_by_project": _group_definitions(
            _load_definitions(session, columns["field_definition_checkbox_label"])
        ),
        "codelists": _load_codelist_names(session),
        "options_by_codelist": _load_codelist_options(session),
        "units": _load_unit_symbols(session),
    }


def _load_active_projects(session: Session, has_deleted_at: bool) -> List[dict]:
    sql = "SELECT id, name, version FROM project"
    if has_deleted_at:
        sql += " WHERE deleted_at IS NULL"
    sql += " ORDER BY id"
    rows = session.execute(text(sql)).all()
    return [{"id": row[0], "name": row[1], "version": row[2]} for row in rows]


def _load_forms(session: Session, has_code: bool) -> List[dict]:
    code_column = "code" if has_code else "NULL"
    rows = session.execute(
        text(
            f"SELECT id, project_id, name, {code_column} "
            "FROM form ORDER BY project_id, order_index, id"
        )
    ).all()
    return [{"id": row[0], "project_id": row[1], "name": row[2], "code": row[3]} for row in rows]


def _group_forms(forms: List[dict]) -> Dict[int, List[dict]]:
    grouped: Dict[int, List[dict]] = {}
    for form in forms:
        grouped.setdefault(form["project_id"], []).append(
            {"id": form["id"], "name": form["name"], "code": form["code"]}
        )
    return grouped


def _load_form_fields(session: Session, has_label_override: bool) -> List[dict]:
    override_column = "label_override" if has_label_override else "NULL"
    rows = session.execute(
        text(
            "SELECT form_id, field_definition_id, is_log_row, "
            f"{override_column} FROM form_field ORDER BY form_id, order_index, id"
        )
    ).all()
    return [
        {
            "form_id": row[0],
            "definition_id": row[1],
            "is_log_row": row[2],
            "label_override": row[3],
        }
        for row in rows
    ]


def _group_form_fields(form_fields: List[dict]) -> Dict[int, List[dict]]:
    grouped: Dict[int, List[dict]] = {}
    for form_field in form_fields:
        if form_field["is_log_row"] or form_field["definition_id"] is None:
            continue
        grouped.setdefault(form_field["form_id"], []).append(form_field)
    return grouped


def _load_definitions(session: Session, has_checkbox_label: bool) -> List[dict]:
    checkbox_column = "checkbox_label" if has_checkbox_label else "NULL"
    rows = session.execute(
        text(
            "SELECT id, project_id, variable_name, label, field_type, integer_digits, "
            "decimal_digits, date_format, codelist_id, unit_id, "
            f"{checkbox_column} FROM field_definition ORDER BY project_id, order_index, id"
        )
    ).all()
    return [
        {
            "id": row[0],
            "project_id": row[1],
            "variable_name": row[2],
            "label": row[3],
            "field_type": row[4],
            "integer_digits": row[5],
            "decimal_digits": row[6],
            "date_format": row[7],
            "codelist_id": row[8],
            "unit_id": row[9],
            "checkbox_label": row[10],
        }
        for row in rows
    ]


def _group_definitions(definitions: List[dict]) -> Dict[int, List[dict]]:
    grouped: Dict[int, List[dict]] = {}
    for definition in definitions:
        grouped.setdefault(definition["project_id"], []).append(definition)
    return grouped


def _load_codelist_names(session: Session) -> Dict[int, str]:
    rows = session.execute(text("SELECT id, name FROM codelist")).all()
    return {row[0]: row[1] for row in rows}


def _load_codelist_options(session: Session) -> Dict[int, List[dict]]:
    rows = session.execute(
        text(
            "SELECT codelist_id, code, decode FROM codelist_option "
            "ORDER BY codelist_id, order_index, id"
        )
    ).all()
    grouped: Dict[int, List[dict]] = {}
    for row in rows:
        grouped.setdefault(row[0], []).append({"code": row[1], "decode": row[2]})
    return grouped


def _load_unit_symbols(session: Session) -> Dict[int, str]:
    rows = session.execute(text("SELECT id, symbol FROM unit")).all()
    return {row[0]: row[1] for row in rows}


def _build_entries(data: dict) -> List[dict]:
    entries: List[dict] = []
    index_by_key: Dict[tuple, int] = {}
    referenced = _collect_form_entries(data, entries, index_by_key)
    _collect_library_only_entries(data, entries, index_by_key, referenced)
    return entries


def _collect_form_entries(data: dict, entries: List[dict], index_by_key: Dict[tuple, int]) -> Dict[int, Set[int]]:
    referenced: Dict[int, Set[int]] = {}
    for project in data["projects"]:
        project_id = project["id"]
        by_id = {d["id"]: d for d in data["definitions_by_project"].get(project_id, [])}
        used: Set[int] = set()
        for form in data["forms_by_project"].get(project_id, []):
            for form_field in data["fields_by_form"].get(form["id"], []):
                definition = by_id.get(form_field["definition_id"])
                if definition is None or definition["field_type"] == _LABEL_FIELD_TYPE:
                    continue
                used.add(definition["id"])
                source = {
                    "project_name": project["name"],
                    "project_version": project["version"],
                    "form_name": form["name"],
                    "form_code": _clean_optional(form["code"]),
                    "display_label": _display_label(
                        form_field["label_override"], definition["label"]
                    ),
                }
                _append_entry(entries, index_by_key, data, definition, source)
        referenced[project_id] = used
    return referenced


def _collect_library_only_entries(
    data: dict,
    entries: List[dict],
    index_by_key: Dict[tuple, int],
    referenced: Dict[int, Set[int]],
) -> None:
    for project in data["projects"]:
        project_id = project["id"]
        used = referenced.get(project_id, set())
        for definition in data["definitions_by_project"].get(project_id, []):
            if definition["id"] in used or definition["field_type"] == _LABEL_FIELD_TYPE:
                continue
            source = {
                "project_name": project["name"],
                "project_version": project["version"],
                "form_name": None,
                "form_code": None,
                "display_label": None,
            }
            _append_entry(entries, index_by_key, data, definition, source)


def _display_label(raw_override: Optional[str], label: str) -> Optional[str]:
    if not raw_override:
        return None
    stripped = str(raw_override).strip()
    if not stripped or stripped == label:
        return None
    return stripped


def _entry_from_definition(data: dict, definition: dict) -> dict:
    codelist_id = definition["codelist_id"]
    options = data["options_by_codelist"].get(codelist_id, []) if codelist_id is not None else []
    return {
        "key": f"{definition['project_id']}:{definition['id']}",
        "variable_name": definition["variable_name"],
        "label": definition["label"],
        "field_type": definition["field_type"],
        "integer_digits": definition["integer_digits"],
        "decimal_digits": definition["decimal_digits"],
        "date_format": definition["date_format"],
        "checkbox_label": _clean_optional(definition["checkbox_label"]),
        "codelist_name": data["codelists"].get(codelist_id),
        "options": [{"code": option["code"], "decode": option["decode"]} for option in options],
        "unit_symbol": data["units"].get(definition["unit_id"]),
        "label_aliases": [],
        "sources": [],
    }


def _clean_optional(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = str(value).strip()
    return stripped or None


def _merge_key(entry: dict) -> tuple:
    return (
        entry["variable_name"],
        entry["label"],
        entry["field_type"],
        entry["integer_digits"],
        entry["decimal_digits"],
        entry["date_format"],
        entry["checkbox_label"],
        entry["codelist_name"],
        tuple((option["code"], option["decode"]) for option in entry["options"]),
        entry["unit_symbol"],
    )


def _append_entry(
    entries: List[dict],
    index_by_key: Dict[tuple, int],
    data: dict,
    definition: dict,
    source: dict,
) -> None:
    entry = _entry_from_definition(data, definition)
    key = _merge_key(entry)
    index = index_by_key.get(key)
    if index is None:
        entry["sources"].append(source)
        if source["display_label"] is not None:
            entry["label_aliases"].append(source["display_label"])
        index_by_key[key] = len(entries)
        entries.append(entry)
        return
    existing = entries[index]
    existing["sources"].append(source)
    if source["display_label"] is not None and source["display_label"] not in existing["label_aliases"]:
        existing["label_aliases"].append(source["display_label"])
