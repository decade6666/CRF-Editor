"""数据库导出服务（SQLite 快照 / 裁剪），与 Word 导出无关。

从 `export_service.py` 拆出：Word 导出路径不使用本模块；
`ExportError` 与 `_EXPORT_ERROR_CODES` 仍定义在 `export_service`
（main.py 的全局异常处理器与 Word 路径依赖），此处反向导入，无循环依赖。
"""

from __future__ import annotations

import sqlite3

import tempfile

from src.services.export_service import ExportError, _EXPORT_ERROR_CODES


def _validate_form_field_schema(db_path: str) -> None:
    """验证 form_field 表结构兼容性。

    检查：
    1. form_field 表是否存在
    2. 是否有 legacy sort_order 列（说明迁移未完成）
    3. order_index 列是否存在
    4. field_definition_id 是否有 NULL 值（历史坏数据）

    若不兼容则抛出 ExportError。
    """
    conn = sqlite3.connect(db_path)
    try:
        # 检查 form_field 表是否存在
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='form_field'")
        if not cursor.fetchone():
            # 表不存在，无需验证（可能是空项目）
            return

        # 获取列信息
        cursor = conn.execute("PRAGMA table_info(form_field)")
        columns = {row[1]: row for row in cursor.fetchall()}

        # 检查 legacy sort_order 列存在（说明迁移未完成）
        if "sort_order" in columns:
            raise ExportError(
                "数据库 form_field 表存在 legacy 'sort_order' 列，未完成迁移。请运行最新版本完成迁移后再导出。",
                _EXPORT_ERROR_CODES["SCHEMA_INCOMPATIBLE"],
            )

        # 检查 order_index 列不存在（不兼容）
        if "order_index" not in columns:
            raise ExportError(
                "数据库 form_field 表缺少 'order_index' 列，结构不兼容。",
                _EXPORT_ERROR_CODES["SCHEMA_INCOMPATIBLE"],
            )

        # 检查 field_definition_id 有 NULL 值（历史坏数据）
        # 排除 is_log_row=1 的记录（日志行允许 field_definition_id 为 NULL）
        cursor = conn.execute(
            "SELECT COUNT(*) FROM form_field WHERE field_definition_id IS NULL AND (is_log_row IS NULL OR is_log_row = 0)"
        )
        null_count = cursor.fetchone()[0]
        if null_count > 0:
            raise ExportError(
                f"数据库 form_field 表有 {null_count} 条记录的 field_definition_id 为 NULL，数据不兼容。",
                _EXPORT_ERROR_CODES["DATA_INCOMPATIBLE"],
            )

    finally:
        conn.close()


def export_full_database(db_path: str) -> str:
    """使用 sqlite3.backup() 安全复制运行中数据库到临时文件，返回临时文件路径。"""

    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)

    tmp_path = tmp.name

    tmp.close()

    src_conn = sqlite3.connect(db_path)

    dst_conn = sqlite3.connect(tmp_path)

    try:
        src_conn.backup(dst_conn)

    finally:
        dst_conn.close()

        src_conn.close()

    return tmp_path


def _vacuum_sqlite_file(db_path: str) -> None:
    """对导出后的 SQLite 文件执行 VACUUM。"""
    conn = sqlite3.connect(db_path, isolation_level=None)
    try:
        conn.execute("VACUUM")
    finally:
        conn.close()


def export_project_database(db_path: str, project_id: int, project_name: str) -> str:
    """导出单项目数据库：先验证兼容性，再 backup 完整快照，最后裁剪非目标数据。

    Task 4.5: 在导出前验证 form_field 结构，不兼容则抛出 ExportError。
    """
    # 验证 form_field 结构兼容性
    _validate_form_field_schema(db_path)

    tmp_path = export_full_database(db_path)

    conn = sqlite3.connect(tmp_path)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        # 解除所有项目与 user 的外键关联
        conn.execute("UPDATE project SET owner_id = NULL")
        # 清除用户敏感数据
        conn.execute("DELETE FROM user")
        # 删除其他项目（级联删除关联数据）
        conn.execute("DELETE FROM project WHERE id != ?", (project_id,))
        conn.commit()
    finally:
        conn.close()

    _vacuum_sqlite_file(tmp_path)
    return tmp_path


def export_user_projects_database(db_path: str, owner_id: int, export_name: str = "user_projects") -> str:
    """导出当前用户全部项目数据库：先验证兼容性，再备份，最后保留该用户拥有的项目集合。

    Task 4.5: 在导出前验证 form_field 结构，不兼容则抛出 ExportError。
    """
    # 验证 form_field 结构兼容性
    _validate_form_field_schema(db_path)

    tmp_path = export_full_database(db_path)

    conn = sqlite3.connect(tmp_path)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        project_ids = [
            row[0]
            for row in conn.execute(
                "SELECT id FROM project WHERE owner_id = ? ORDER BY id",
                (owner_id,),
            ).fetchall()
        ]
        if not project_ids:
            raise ValueError("当前用户没有可导出的项目")

        placeholders = ",".join("?" for _ in project_ids)
        conn.execute("UPDATE project SET owner_id = NULL")
        conn.execute("DELETE FROM user")
        conn.execute(
            f"DELETE FROM project WHERE id NOT IN ({placeholders})",
            tuple(project_ids),
        )
        conn.commit()
    finally:
        conn.close()

    _vacuum_sqlite_file(tmp_path)
    return tmp_path
