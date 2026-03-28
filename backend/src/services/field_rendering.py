"""字段渲染共享模块

提供预览端和导出端共用的字段渲染逻辑，确保一致性。
"""
from typing import List, Optional, Tuple
import html


NON_INLINE_DEFAULT_VALUE_FIELD_TYPES = {"文本", "数值"}


def is_default_value_supported(form_field) -> bool:
    """判断字段是否允许按当前上下文使用 default_value。"""
    field_def = getattr(form_field, "field_definition", None)
    if not field_def:
        return False
    if bool(getattr(form_field, "inline_mark", 0)):
        return True
    return getattr(field_def, "field_type", None) in NON_INLINE_DEFAULT_VALUE_FIELD_TYPES


def extract_default_lines(form_field) -> List[str]:
    """提取默认值的多行文本（保留空行和空格）

    Args:
        form_field: FormField 对象

    Returns:
        默认值的行列表（保留空行和前后空格）
    """
    if not is_default_value_supported(form_field):
        return []
    default_value = getattr(form_field, "default_value", None) or ""
    if not default_value:
        return []
    # 保留空行和空格，仅去除行尾的 \r（Windows换行符）
    return [line.rstrip("\r") for line in default_value.splitlines()]


def render_default_html(form_field) -> str:
    """将默认值渲染为 HTML 格式（多行用 <br> 分隔）

    Args:
        form_field: FormField 对象

    Returns:
        HTML 格式的默认值字符串（已转义）
    """
    lines = extract_default_lines(form_field)
    if not lines:
        return ""
    return "<br>".join(html.escape(line) for line in lines)


def build_inline_table_model(
    marked_fields,
) -> Tuple[List[str], List[List[Optional[str]]], List[Optional[object]]]:
    """构建横向表格的数据模型

    Args:
        marked_fields: 标记为横向表格的 FormField 列表

    Returns:
        Tuple[headers, rows, field_defs]:
        - headers: 表头列表（字段名称）
        - rows: 行数据列表（每行是一个单元格值列表，None 表示无默认值）
        - field_defs: 字段定义列表
    """
    headers: List[str] = []
    field_defs: List[Optional[object]] = []
    default_rows: List[List[str]] = []
    max_rows = 1

    # 第一遍：收集表头、字段定义、默认值行
    for form_field in marked_fields:
        field_def = getattr(form_field, "field_definition", None)
        field_defs.append(field_def)

        # 提取字段名称作为表头
        label = ""
        if field_def:
            label = form_field.label_override or field_def.label or ""
        headers.append(label)

        # 提取默认值的多行文本
        lines = extract_default_lines(form_field)
        default_rows.append(lines)
        if lines:
            max_rows = max(max_rows, len(lines))

    # 第二遍：构建行数据（按行组织，每行包含所有列的值）
    rows: List[List[Optional[str]]] = []
    for row_idx in range(max_rows):
        row: List[Optional[str]] = []
        for lines in default_rows:
            if row_idx < len(lines):
                row.append(lines[row_idx])
            else:
                row.append(None)  # 无默认值，后续渲染为占位符
        rows.append(row)

    return headers, rows, field_defs
