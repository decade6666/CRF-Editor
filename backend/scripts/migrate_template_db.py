"""模板库迁移脚本 - 将旧版模板库转换为兼容格式

用法：
    python scripts/migrate_template_db.py <输入模板库路径> [输出路径]

示例：
    python scripts/migrate_template_db.py template_v1.db template_v2.db
    python scripts/migrate_template_db.py template_v1.db  # 输出到 template_v1_migrated.db
"""
import argparse
import shutil
import sqlite3
from pathlib import Path


# Task 3.5: 必需列定义（与 import_service.py 保持一致）
REQUIRED_COLUMNS = {
    "form": ["order_index"],
    "form_field": ["order_index", "is_log_row", "inline_mark"],
    "field_definition": ["order_index"],
    "codelist_option": ["order_index"],
    "unit": ["order_index"],
}

# 列默认值（order_index 基于 id 序列）
COLUMN_DEFAULTS = {
    "order_index": "id",  # 特殊处理：使用现有 id 序列
    "is_log_row": 0,
    "inline_mark": 0,
}


def get_existing_columns(conn: sqlite3.Connection, table: str) -> set:
    """获取表的现有列名"""
    cursor = conn.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cursor.fetchall()}


def add_missing_columns(conn: sqlite3.Connection, table: str, missing_cols: list) -> None:
    """添加缺失列并填充默认值"""
    for col in missing_cols:
        # 添加列
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} INTEGER")

        # 填充默认值
        if col == "order_index":
            # 基于 id 序列填充 order_index
            conn.execute(f"UPDATE {table} SET order_index = id WHERE order_index IS NULL")
        else:
            default_val = COLUMN_DEFAULTS.get(col, 0)
            conn.execute(f"UPDATE {table} SET {col} = {default_val} WHERE {col} IS NULL")


def migrate_template(input_path: Path, output_path: Path) -> dict:
    """迁移模板库，返回迁移报告"""
    # 复制输入文件到输出位置
    shutil.copy2(input_path, output_path)

    conn = sqlite3.connect(str(output_path))
    report = {"input": str(input_path), "output": str(output_path), "migrations": []}

    try:
        for table, required_cols in REQUIRED_COLUMNS.items():
            # 检查表是否存在
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                (table,)
            )
            if not cursor.fetchone():
                report["migrations"].append({
                    "table": table,
                    "status": "skipped",
                    "reason": "表不存在",
                })
                continue

            existing_cols = get_existing_columns(conn, table)
            missing = [c for c in required_cols if c not in existing_cols]

            if missing:
                add_missing_columns(conn, table, missing)
                conn.commit()
                report["migrations"].append({
                    "table": table,
                    "status": "migrated",
                    "added_columns": missing,
                })
            else:
                report["migrations"].append({
                    "table": table,
                    "status": "already_compatible",
                })

        # 验证迁移后兼容性
        for table, required_cols in REQUIRED_COLUMNS.items():
            existing_cols = get_existing_columns(conn, table)
            still_missing = [c for c in required_cols if c not in existing_cols]
            if still_missing:
                report["error"] = f"迁移后仍缺失列：{table}.{still_missing}"
                return report

        report["success"] = True

    except Exception as e:
        report["error"] = str(e)
        conn.rollback()
    finally:
        conn.close()

    return report


def main():
    parser = argparse.ArgumentParser(description="迁移旧版模板库到兼容格式")
    parser.add_argument("input", help="输入模板库路径")
    parser.add_argument("output", nargs="?", help="输出路径（默认为输入文件名_migrated.db）")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"错误：输入文件不存在 - {input_path}")
        return 1

    if input_path.suffix.lower() != ".db":
        print(f"错误：输入文件必须是 .db 格式 - {input_path}")
        return 1

    output_path = Path(args.output) if args.output else Path(f"{input_path.stem}_migrated.db")

    if output_path.exists():
        print(f"警告：输出文件已存在，将被覆盖 - {output_path}")

    print(f"迁移模板库: {input_path} -> {output_path}")
    report = migrate_template(input_path, output_path)

    if report.get("error"):
        print(f"\n迁移失败: {report['error']}")
        return 1

    print("\n迁移完成:")
    for m in report.get("migrations", []):
        status = m.get("status")
        table = m.get("table")
        if status == "migrated":
            cols = m.get("added_columns", [])
            print(f"  - {table}: 添加列 {cols}")
        elif status == "already_compatible":
            print(f"  - {table}: 已兼容，无需修改")
        else:
            reason = m.get("reason", "未知")
            print(f"  - {table}: 跳过 ({reason})")

    print(f"\n输出文件: {output_path}")
    print("原文件保持不变，可安全删除输出文件后重新迁移。")
    return 0


if __name__ == "__main__":
    exit(main())