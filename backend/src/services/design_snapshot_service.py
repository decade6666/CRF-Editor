"""Versioned persisted-design snapshots shared by formal and data-only history.

No account/online bookkeeping, live file reads, rendering, commit or restoration
belongs in this layer. Runtime file names become opaque asset-reference hashes;
formal capture freezes the actual asset bytes separately under its read snapshot.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import date
from typing import Any, Sequence

from sqlalchemy import Date, Integer, String, not_, select
from sqlalchemy.orm import Session

from src.models.codelist import CodeList, CodeListOption
from src.models.field import Field
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.unit import Unit
from src.models.visit import Visit
from src.models.visit_form import VisitForm

SNAPSHOT_SCHEMA_VERSION = 1
MAX_SNAPSHOT_ROWS = 50_000
MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024

_MODELS = {
    "project": Project,
    "unit": Unit,
    "codelist": CodeList,
    "codelist_option": CodeListOption,
    "field_definition": FieldDefinition,
    "form": Form,
    "form_field": FormField,
    "field": Field,
    "visit": Visit,
    "visit_form": VisitForm,
}
_DESIGN_COLUMNS = {
    "project": (
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
        "data_management_unit",
    ),
    "unit": ("id", "project_id", "symbol", "code", "order_index"),
    "codelist": ("id", "project_id", "name", "code", "description", "order_index"),
    "codelist_option": ("id", "codelist_id", "code", "decode", "order_index"),
    "field_definition": (
        "id",
        "project_id",
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
    ),
    "form": (
        "id",
        "project_id",
        "name",
        "code",
        "domain",
        "order_index",
        "design_notes",
        "annotation_positions",
        "paper_orientation",
    ),
    "form_field": (
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
    ),
    "field": (
        "id",
        "form_id",
        "variable_name",
        "label",
        "field_type",
        "integer_digits",
        "decimal_digits",
        "date_format",
        "precision",
        "codelist_id",
        "unit_id",
        "is_multi_record",
        "table_type",
    ),
    "visit": ("id", "project_id", "name", "code", "sequence"),
    "visit_form": ("id", "visit_id", "form_id", "sequence"),
}
_PRIVATE_COLUMNS = {
    "project": ("created_at", "deleted_at", "owner_id"),
    "field_definition": ("created_at", "updated_at"),
    "form_field": ("created_at", "updated_at"),
}
_ASSET_COLUMNS = {"project": ("company_logo_path",)}
_PARENT_SCOPE = {
    "codelist_option": ("codelist", "codelist_id"),
    "form_field": ("form", "form_id"),
    "field": ("form", "form_id"),
    "visit_form": ("visit", "visit_id"),
}


class SnapshotError(ValueError):
    """Safe domain failure; callers translate it without exposing stored values."""

    def __init__(self, message: str, code: str = "SNAPSHOT_INVALID", status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True)
class FrozenProjectDesign:
    payload_json: str
    content_hash: str

    def to_dict(self) -> dict[str, Any]:
        """Return an independent projection, never mutable shared snapshot state."""
        return json.loads(self.payload_json)

    @property
    def project_id(self) -> int:
        return self.to_dict()["project"]["id"]


def snapshot_column_roles() -> dict[str, dict[str, tuple[str, ...]]]:
    """Explicitly classify every model column; new columns require a codec review."""
    return {
        name: {
            "design": _DESIGN_COLUMNS[name],
            "private": _PRIVATE_COLUMNS.get(name, ()),
            "asset": _ASSET_COLUMNS.get(name, ()),
        }
        for name in _MODELS
    }


def _invalid() -> SnapshotError:
    return SnapshotError("项目设计包含不兼容或跨项目关联，无法留档")


def _utf8_bytes(value: str) -> bytes:
    try:
        return value.encode("utf-8")
    except UnicodeEncodeError as exc:
        raise _invalid() from exc


def _is_sqlite_integer(value: Any) -> bool:
    return type(value) is int and -(2**63) <= value < 2**63


def _limit_exceeded() -> SnapshotError:
    return SnapshotError("项目设计超出留档处理上限，未生成留档", "SNAPSHOT_LIMIT_EXCEEDED", 413)


def _verify_registry() -> None:
    for name, roles in snapshot_column_roles().items():
        classified = [column for group in roles.values() for column in group]
        if len(classified) != len(set(classified)) or set(classified) != set(_MODELS[name].__table__.columns.keys()):
            raise SnapshotError("设计字段定义已变化，需要更新留档版本", "SNAPSHOT_SCHEMA_UNSUPPORTED", 409)


def _scope(table_name: str, project_id: int) -> Any:
    table = _MODELS[table_name].__table__
    if table_name == "project":
        return table.c.id == project_id
    if "project_id" in table.c:
        return table.c.project_id == project_id
    parent_name, parent_column = _PARENT_SCOPE[table_name]
    parent = _MODELS[parent_name].__table__
    return table.c[parent_column].in_(select(parent.c.id).where(_scope(parent_name, project_id)))


def _ensure_reverse_links(session: Session, project_id: int) -> None:
    """Reject hidden incoming cross-project references without reading their text."""
    for name, model in _MODELS.items():
        table = model.__table__
        scope_column = "project_id" if "project_id" in table.c else _PARENT_SCOPE.get(name, (None, None))[1]
        for column_name in _DESIGN_COLUMNS[name]:
            if column_name == scope_column:
                continue
            column = table.c[column_name]
            for key in column.foreign_keys:
                parent_name = key.column.table.name
                if parent_name not in _MODELS:
                    continue
                parent = _MODELS[parent_name].__table__
                linked_ids = select(parent.c.id).where(_scope(parent_name, project_id))
                foreign = select(table.c.id).where(column.in_(linked_ids), not_(_scope(name, project_id))).limit(1)
                if session.execute(foreign).first() is not None:
                    raise _invalid()


def _json_row(row: Any) -> dict[str, Any]:
    return {key: value.isoformat() if isinstance(value, date) else value for key, value in row.items()}


def _canonical_json(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    size = 0
    encoder = json.JSONEncoder(ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    for chunk in encoder.iterencode(payload):
        size += len(_utf8_bytes(chunk))
        if size > MAX_SNAPSHOT_BYTES:
            raise _limit_exceeded()
        parts.append(chunk)
    return "".join(parts)


def _read_payload(session: Session, project_id: int) -> dict[str, Any]:
    table = Project.__table__
    columns = (*_DESIGN_COLUMNS["project"], "company_logo_path")
    row = (
        session.execute(select(*(table.c[name] for name in columns)).where(table.c.id == project_id)).mappings().first()
    )
    if row is None:
        raise SnapshotError("项目不存在", "PROJECT_NOT_FOUND", 404)
    project = _json_row(row)
    logo_name = project.pop("company_logo_path")
    logo_reference = hashlib.sha256(_utf8_bytes(logo_name)).hexdigest() if logo_name else None
    _ensure_reverse_links(session, project_id)
    tables: dict[str, list[dict[str, Any]]] = {}
    row_count = 1
    for name, model in _MODELS.items():
        if name == "project":
            continue
        table = model.__table__
        statement = select(*(table.c[key] for key in _DESIGN_COLUMNS[name])).where(_scope(name, project_id))
        rows = session.execute(statement.order_by(table.c.id).limit(MAX_SNAPSHOT_ROWS + 1)).mappings()
        tables[name] = []
        for item in rows:
            row_count += 1
            if row_count > MAX_SNAPSHOT_ROWS:
                raise _limit_exceeded()
            tables[name].append(_json_row(item))
    return {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "project": project,
        "tables": tables,
        "asset_references": {"company_logo": logo_reference},
    }


def _validate_scalar(column: Any, value: Any) -> None:
    if value is None:
        if not column.nullable:
            raise _invalid()
        return
    if isinstance(column.type, Integer):
        if not _is_sqlite_integer(value):
            raise _invalid()
    elif isinstance(column.type, String):
        if not isinstance(value, str):
            raise _invalid()
    elif isinstance(column.type, Date):
        if not isinstance(value, str):
            raise _invalid()
        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise _invalid() from exc
    else:
        raise _invalid()


def _validate_row(name: str, row: Any) -> None:
    if not isinstance(row, dict) or set(row) != set(_DESIGN_COLUMNS[name]):
        raise _invalid()
    for key, value in row.items():
        _validate_scalar(_MODELS[name].__table__.c[key], value)


def _validate_rows(payload: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    tables = payload["tables"]
    if not isinstance(tables, dict) or set(tables) != set(_MODELS) - {"project"}:
        raise _invalid()
    all_rows = {"project": [payload["project"]], **tables}
    row_count = 0
    for name, rows in all_rows.items():
        if not isinstance(rows, list):
            raise _invalid()
        row_count += len(rows)
        if row_count > MAX_SNAPSHOT_ROWS:
            raise _limit_exceeded()
        for row in rows:
            _validate_row(name, row)
        ids = [row["id"] for row in rows]
        if len(ids) != len(set(ids)):
            raise _invalid()
    return all_rows


def _validate_links(all_rows: dict[str, list[dict[str, Any]]]) -> None:
    ids = {name: {row["id"] for row in rows} for name, rows in all_rows.items()}
    project_id = all_rows["project"][0]["id"]
    for name, rows in all_rows.items():
        for row in rows:
            if "project_id" in row and row["project_id"] != project_id:
                raise _invalid()
            if name == "form_field" and row["field_definition_id"] is None and not row["is_log_row"]:
                raise _invalid()
            for key, value in row.items():
                if value is None:
                    continue
                for foreign_key in _MODELS[name].__table__.c[key].foreign_keys:
                    parent_name = foreign_key.column.table.name
                    if parent_name not in ids or value not in ids[parent_name]:
                        raise _invalid()


def _validated_snapshot(payload: Any) -> FrozenProjectDesign:
    _verify_registry()
    if not isinstance(payload, dict) or set(payload) != {"schema_version", "project", "tables", "asset_references"}:
        raise _invalid()
    if type(payload["schema_version"]) is not int or payload["schema_version"] != SNAPSHOT_SCHEMA_VERSION:
        raise SnapshotError("不支持此留档数据版本，请使用兼容版本", "SNAPSHOT_SCHEMA_UNSUPPORTED", 409)
    assets = payload["asset_references"]
    if not isinstance(assets, dict) or set(assets) != {"company_logo"}:
        raise _invalid()
    reference = assets["company_logo"]
    if reference is not None and (not isinstance(reference, str) or re.fullmatch(r"[0-9a-f]{64}", reference) is None):
        raise _invalid()
    all_rows = _validate_rows(payload)
    _validate_links(all_rows)
    encoded = _canonical_json(payload)
    return FrozenProjectDesign(encoded, hashlib.sha256(_utf8_bytes(encoded)).hexdigest())


def capture_project_design(session: Session, project_id: int) -> FrozenProjectDesign:
    """Read one physical SQLite snapshot without flush, commit, files or ORM mutation.

    The caller owns the transaction. Admin callers must start its physical read
    snapshot before authorization too; this guard also makes the pure graph
    capture coherent when used independently by future snapshot producers.
    """
    if not _is_sqlite_integer(project_id):
        raise _invalid()
    _verify_registry()
    with session.no_autoflush:
        connection = session.connection()
        if connection.dialect.name != "sqlite":
            raise SnapshotError("留档仅支持当前 SQLite 存储", "SNAPSHOT_SCHEMA_UNSUPPORTED", 409)
        if not connection.connection.driver_connection.in_transaction:
            connection.exec_driver_sql("BEGIN")
        return _validated_snapshot(_read_payload(session, project_id))


def decode_project_design(payload_json: str) -> FrozenProjectDesign:
    """Validate a stored versioned representation without any database/file access."""
    if not isinstance(payload_json, str):
        raise _invalid()
    if len(_utf8_bytes(payload_json)) > MAX_SNAPSHOT_BYTES:
        raise _limit_exceeded()
    try:
        payload = json.loads(payload_json)
    except (ValueError, RecursionError) as exc:
        raise _invalid() from exc
    return _validated_snapshot(payload)


def assert_formal_renderable(snapshot: FrozenProjectDesign) -> None:
    """Current export renders form_field, not the registered legacy field table."""
    if snapshot.to_dict()["tables"]["field"]:
        raise SnapshotError("项目含旧版字段表数据，当前版本不能完整生成正式原件", "SNAPSHOT_LEGACY_UNSUPPORTED", 409)


def describe_history(
    kind: str,
    origin: str,
    storage_source: str,
    artifact_kinds: Sequence[str] = (),
) -> dict[str, Any]:
    """Capabilities follow captured content, never manual/scheduled origin alone."""
    if kind not in {"data_only", "formal_pair"} or origin not in {"manual", "scheduled", "restore_protection"}:
        raise _invalid()
    if storage_source not in {"live_history", "full_set"}:
        raise _invalid()
    originals = tuple(artifact_kinds)
    paired = kind == "formal_pair"
    if (paired and (len(originals) != 2 or set(originals) != {"ecrf", "acrf"})) or (not paired and originals):
        raise _invalid()
    return {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "kind": kind,
        "origin": origin,
        "storage_source": storage_source,
        "design": True,
        "layout": paired,
        "assets": paired,
        "originals": ["ecrf", "acrf"] if paired else [],
    }
