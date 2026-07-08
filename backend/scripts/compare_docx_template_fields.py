from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.services.docx_import_service import DocxImportService  # noqa: E402


CHOICE_TYPES = {"单选", "多选", "单选（纵向）", "多选（纵向）"}


def _normalize_options(options: list[Any] | None) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for option in options or []:
        if isinstance(option, str):
            decode = option.strip()
            trailing = 0
        else:
            decode = str((option or {}).get("decode", "")).strip()
            trailing = int((option or {}).get("trailing_underscore", 0) or 0)
        if decode:
            normalized.append({
                "decode": decode,
                "trailing_underscore": trailing,
            })
    return normalized


def _extract_real_fields(fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [field for field in fields if field.get("type") != "log_row"]


def _load_template_forms(template_db_path: str) -> list[dict[str, Any]]:
    conn = sqlite3.connect(f"file:{Path(template_db_path).resolve()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        forms: list[dict[str, Any]] = []
        form_rows = conn.execute(
            """
            SELECT id, name
            FROM form
            ORDER BY COALESCE(order_index, id), id
            """
        ).fetchall()
        for form_row in form_rows:
            fields: list[dict[str, Any]] = []
            field_rows = conn.execute(
                """
                SELECT
                    ff.field_definition_id,
                    ff.is_log_row,
                    ff.default_value,
                    ff.inline_mark,
                    COALESCE(ff.label_override, fd.label) AS label,
                    fd.field_type,
                    fd.integer_digits,
                    fd.decimal_digits,
                    fd.date_format,
                    fd.codelist_id,
                    u.symbol AS unit_symbol
                FROM form_field AS ff
                LEFT JOIN field_definition AS fd ON fd.id = ff.field_definition_id
                LEFT JOIN unit AS u ON u.id = fd.unit_id
                WHERE ff.form_id = ?
                ORDER BY ff.order_index, ff.id
                """,
                (form_row["id"],),
            ).fetchall()
            for row in field_rows:
                if row["is_log_row"] or row["field_definition_id"] is None:
                    continue
                options = []
                if row["codelist_id"] is not None:
                    options = [
                        {
                            "decode": option_row["decode"],
                            "trailing_underscore": int(option_row["trailing_underscore"] or 0),
                        }
                        for option_row in conn.execute(
                            """
                            SELECT decode, trailing_underscore
                            FROM codelist_option
                            WHERE codelist_id = ?
                            ORDER BY order_index, id
                            """,
                            (row["codelist_id"],),
                        ).fetchall()
                    ]
                fields.append(
                    {
                        "label": row["label"],
                        "field_type": row["field_type"],
                        "default_value": row["default_value"],
                        "inline_mark": row["inline_mark"],
                        "integer_digits": row["integer_digits"],
                        "decimal_digits": row["decimal_digits"],
                        "date_format": row["date_format"],
                        "unit_symbol": row["unit_symbol"],
                        "options": options,
                    }
                )
            forms.append({"name": form_row["name"], "fields": fields})
        return forms
    finally:
        conn.close()


def _compare_form(parsed_form: dict[str, Any], template_form: dict[str, Any]) -> dict[str, Any]:
    parsed_fields = _extract_real_fields(parsed_form.get("fields", []))
    template_fields = _extract_real_fields(template_form.get("fields", []))
    common_count = min(len(parsed_fields), len(template_fields))

    type_matches = 0
    option_compared = 0
    option_matches = 0
    trailing_compared = 0
    trailing_matches = 0
    mismatches: list[dict[str, Any]] = []

    for index in range(common_count):
        parsed_field = parsed_fields[index]
        template_field = template_fields[index]
        issues: list[str] = []

        if parsed_field.get("label") != template_field.get("label"):
            issues.append("label")
        if parsed_field.get("field_type") == template_field.get("field_type"):
            type_matches += 1
        else:
            issues.append("field_type")

        parsed_options = _normalize_options(parsed_field.get("options"))
        template_options = _normalize_options(template_field.get("options"))
        parsed_decodes = [item["decode"] for item in parsed_options]
        template_decodes = [item["decode"] for item in template_options]
        parsed_trailing = [item["trailing_underscore"] for item in parsed_options]
        template_trailing = [item["trailing_underscore"] for item in template_options]

        if (
            parsed_field.get("field_type") in CHOICE_TYPES
            or template_field.get("field_type") in CHOICE_TYPES
            or parsed_options
            or template_options
        ):
            option_compared += 1
            trailing_compared += 1
            if parsed_decodes == template_decodes:
                option_matches += 1
            else:
                issues.append("options")
            if parsed_trailing == template_trailing:
                trailing_matches += 1
            else:
                issues.append("trailing_underscore")

        if issues:
            mismatches.append(
                {
                    "index": index + 1,
                    "issues": issues,
                    "parsed": {
                        "label": parsed_field.get("label"),
                        "field_type": parsed_field.get("field_type"),
                        "options": parsed_options,
                    },
                    "template": {
                        "label": template_field.get("label"),
                        "field_type": template_field.get("field_type"),
                        "options": template_options,
                    },
                }
            )

    for extra_index in range(common_count, len(parsed_fields)):
        mismatches.append(
            {
                "index": extra_index + 1,
                "issues": ["extra_parsed_field"],
                "parsed": parsed_fields[extra_index],
                "template": None,
            }
        )

    for extra_index in range(common_count, len(template_fields)):
        mismatches.append(
            {
                "index": extra_index + 1,
                "issues": ["missing_parsed_field"],
                "parsed": None,
                "template": template_fields[extra_index],
            }
        )

    return {
        "name": parsed_form["name"],
        "parsed_field_count": len(parsed_fields),
        "template_field_count": len(template_fields),
        "count_match": len(parsed_fields) == len(template_fields),
        "common_field_count": common_count,
        "type_matches": type_matches,
        "type_match_rate": (type_matches / common_count) if common_count else None,
        "option_matches": option_matches,
        "option_compared": option_compared,
        "option_match_rate": (option_matches / option_compared) if option_compared else None,
        "trailing_matches": trailing_matches,
        "trailing_compared": trailing_compared,
        "trailing_match_rate": (trailing_matches / trailing_compared) if trailing_compared else None,
        "mismatches": mismatches,
    }


def build_report(docx_path: str, template_db_path: str) -> dict[str, Any]:
    parsed_forms = DocxImportService.parse_full(docx_path)
    template_forms = _load_template_forms(template_db_path)
    parsed_by_name = {form["name"]: form for form in parsed_forms}
    template_by_name = {form["name"]: form for form in template_forms}

    shared_names = [form["name"] for form in template_forms if form["name"] in parsed_by_name]
    extra_docx_names = [form["name"] for form in parsed_forms if form["name"] not in template_by_name]
    missing_docx_names = [form["name"] for form in template_forms if form["name"] not in parsed_by_name]

    compared_forms = [
        _compare_form(parsed_by_name[name], template_by_name[name])
        for name in shared_names
    ]

    total_common_fields = sum(item["common_field_count"] for item in compared_forms)
    total_type_matches = sum(item["type_matches"] for item in compared_forms)
    total_option_compared = sum(item["option_compared"] for item in compared_forms)
    total_option_matches = sum(item["option_matches"] for item in compared_forms)
    total_trailing_compared = sum(item["trailing_compared"] for item in compared_forms)
    total_trailing_matches = sum(item["trailing_matches"] for item in compared_forms)

    return {
        "docx_path": str(Path(docx_path).resolve()),
        "template_db_path": str(Path(template_db_path).resolve()),
        "summary": {
            "parsed_form_count": len(parsed_forms),
            "template_form_count": len(template_forms),
            "shared_form_count": len(shared_names),
            "extra_docx_forms": extra_docx_names,
            "missing_docx_forms": missing_docx_names,
            "total_common_fields": total_common_fields,
            "type_matches": total_type_matches,
            "type_mismatches": total_common_fields - total_type_matches,
            "type_match_rate": (
                total_type_matches / total_common_fields if total_common_fields else None
            ),
            "option_compared": total_option_compared,
            "option_matches": total_option_matches,
            "option_mismatches": total_option_compared - total_option_matches,
            "option_match_rate": (
                total_option_matches / total_option_compared if total_option_compared else None
            ),
            "trailing_compared": total_trailing_compared,
            "trailing_matches": total_trailing_matches,
            "trailing_mismatches": total_trailing_compared - total_trailing_matches,
            "trailing_match_rate": (
                total_trailing_matches / total_trailing_compared
                if total_trailing_compared
                else None
            ),
        },
        "forms": compared_forms,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Compare parsed .docx forms with a template database form/field baseline."
    )
    parser.add_argument("docx_path", help="Path to the source .docx file")
    parser.add_argument("template_db_path", help="Path to the template SQLite database")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    report = build_report(args.docx_path, args.template_db_path)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
