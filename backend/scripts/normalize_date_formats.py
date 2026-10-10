"""离线规范化脚本 - 把非运行库中日期类字段的 date_format 统一为前端下拉的规范写法

用法：
    python scripts/normalize_date_formats.py <输入库路径> [输出路径] [--dry-run]

示例：
    python scripts/normalize_date_formats.py database/muban.db --dry-run
    python scripts/normalize_date_formats.py database/muban.db
    python scripts/normalize_date_formats.py database/muban.db database/muban_normalized.db

说明：运行库由后端启动时的 _migrate_normalize_date_formats 自动迁移，本脚本只用于
database/ 下那些不经过后端启动流程的离线模板库。原文件保持不变，输出到新文件。
"""

import argparse
import shutil
import sqlite3
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.database import _DATE_FORMAT_CANONICALS


def _collect_changes(conn):
    changed_ids = []
    try:
        rows = conn.execute(
            "SELECT id, field_type, date_format FROM field_definition "
            "WHERE field_type IN ('日期', '日期时间', '时间') AND date_format IS NOT NULL"
        ).fetchall()
    except sqlite3.OperationalError:
        return changed_ids
    for row_id, field_type, date_format in rows:
        canonical = _DATE_FORMAT_CANONICALS.get(field_type, {}).get(date_format.lower())
        if canonical is not None and canonical != date_format:
            changed_ids.append({"id": row_id, "field_type": field_type, "from": date_format, "to": canonical})
    return changed_ids


def normalize_db(input_path: Path, output_path: Path, dry_run: bool = False) -> dict:
    """规范化库中的 date_format，返回迁移报告。dry_run 时不写盘。"""
    if dry_run:
        conn = sqlite3.connect(str(input_path))
        try:
            return {"input": str(input_path), "dry_run": True, "changes": _collect_changes(conn)}
        finally:
            conn.close()

    shutil.copy2(input_path, output_path)
    conn = sqlite3.connect(str(output_path))
    report = {"input": str(input_path), "output": str(output_path), "changes": []}
    try:
        changes = _collect_changes(conn)
        for change in changes:
            conn.execute(
                "UPDATE field_definition SET date_format = ? WHERE id = ?",
                (change["to"], change["id"]),
            )
        conn.commit()
        report["changes"] = changes
        report["success"] = True
    except Exception as e:  # noqa: BLE001 - 脚本入口，需要兜底报告
        report["error"] = str(e)
        conn.rollback()
    finally:
        conn.close()
    return report


def main():
    parser = argparse.ArgumentParser(description="规范化离线库中日期类字段的 date_format 写法")
    parser.add_argument("input", help="输入 SQLite 库路径")
    parser.add_argument("output", nargs="?", help="输出路径（默认为输入文件名_normalized.db；--dry-run 时忽略）")
    parser.add_argument("--dry-run", action="store_true", help="只统计将修改的行，不写盘")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"错误：输入文件不存在 - {input_path}")
        return 1

    if args.dry_run:
        print(f"干跑（不写盘）：{input_path}")
        report = normalize_db(input_path, Path("unused"), dry_run=True)
    else:
        output_path = Path(args.output) if args.output else Path(f"{input_path.stem}_normalized.db")
        if output_path.exists():
            print(f"警告：输出文件已存在，将被覆盖 - {output_path}")
        print(f"规范化: {input_path} -> {output_path}")
        report = normalize_db(input_path, output_path, dry_run=False)

    if report.get("error"):
        print(f"\n失败: {report['error']}")
        return 1

    changes = report.get("changes", [])
    print(f"\n将修改 {len(changes)} 条 date_format：")
    for change in changes:
        print(f"  - id={change['id']} {change['field_type']}: {change['from']} -> {change['to']}")
    if args.dry_run:
        print("\n确认无误后去掉 --dry-run 再执行。")
    else:
        print(f"\n输出文件: {output_path}")
        print("原文件保持不变，可安全删除输出文件后重新迁移。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
