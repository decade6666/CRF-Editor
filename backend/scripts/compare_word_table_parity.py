from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.services.word_table_parity import (  # noqa: E402
    compare_table_field_forms,
    extract_docx_form_table_fields,
    load_preview_table_fields,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Compare browser Word preview table-field JSON with exported .docx form tables."
    )
    parser.add_argument("preview_json", help="JSON file with {forms:[{name,tables:[[[cell]]]}]} preview extraction")
    parser.add_argument("docx_path", help="Exported .docx file to compare")
    parser.add_argument(
        "--max-mismatches",
        type=int,
        default=100,
        help="Maximum mismatch examples to include in the report",
    )
    parser.add_argument(
        "--allow-mismatch",
        action="store_true",
        help="Return exit code 0 even when exact parity is not reached",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    preview_forms = load_preview_table_fields(args.preview_json)
    export_forms = extract_docx_form_table_fields(args.docx_path)
    report = compare_table_field_forms(
        preview_forms,
        export_forms,
        max_mismatches=args.max_mismatches,
    )
    print(json.dumps(report.to_dict(), ensure_ascii=False, indent=2))
    if args.allow_mismatch:
        return 0
    return 0 if report.exact_cell_ratio == 1.0 and report.form_order_matches else 1


if __name__ == "__main__":
    raise SystemExit(main())
