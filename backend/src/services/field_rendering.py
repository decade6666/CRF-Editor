"""字段渲染共享模块

提供预览端和导出端共用的字段渲染逻辑，确保一致性。
"""
from typing import List, Optional, Tuple
import html

from src.services.width_planning import (
    compute_text_weight,
    compute_choice_atom_weight,
    FILL_LINE_WEIGHT,
)


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


def build_inline_column_demands(
    marked_fields,
) -> List[Tuple[str, float]]:
    """构建 inline 表格各列的内容需求权重。

    用于前端预览和后端导出共享同一宽度语义。

    Args:
        marked_fields: 标记为横向表格的 FormField 列表

    Returns:
        List[Tuple[label, weight]]: 每列的标签和内在权重
    """
    if not marked_fields:
        return []

    demands = []
    for form_field in marked_fields:
        field_def = getattr(form_field, "field_definition", None)
        if not field_def:
            demands.append(("", FILL_LINE_WEIGHT))
            continue

        # 标签权重
        label = form_field.label_override or field_def.label or ""
        weight = compute_text_weight(label)

        # 默认值权重
        default_lines = extract_default_lines(form_field)
        if default_lines:
            for line in default_lines:
                weight = max(weight, compute_text_weight(line))
        else:
            # 控件占位符权重
            field_type = getattr(field_def, "field_type", None)
            if field_type in ["单选", "多选", "单选（纵向）", "多选（纵向）"]:
                # choice 字段：计算所有选项的权重
                option_data = _get_option_data_for_width(field_def)
                if option_data:
                    # 取最大选项权重
                    max_opt_weight = max(
                        compute_choice_atom_weight(opt_label, has_trailing)
                        for opt_label, has_trailing in option_data
                    )
                    weight = max(weight, max_opt_weight)
                else:
                    weight = max(weight, FILL_LINE_WEIGHT)
            else:
                # 其他控件：使用默认填写线权重
                weight = max(weight, FILL_LINE_WEIGHT)

        demands.append((label, weight))

    return demands


def _get_option_data_for_width(field_def) -> List[Tuple[str, bool]]:
    """获取选项数据用于宽度计算（按 order_index 排序）。"""
    if not hasattr(field_def, "codelist") or not field_def.codelist:
        return []
    if not hasattr(field_def.codelist, "options") or not field_def.codelist.options:
        return []
    # 按 order_index 排序，回退到 id
    options = sorted(
        field_def.codelist.options,
        key=lambda o: (o.order_index if o.order_index is not None else float('inf'), o.id or 0)
    )
    result = []
    for opt in options:
        if not opt.decode:
            continue
        result.append((opt.decode, bool(getattr(opt, "trailing_underscore", 0))))
    return result
