"""宽度规划模块

提供确定性、内容驱动的横向表格宽度规划能力。
设计决策冻结参见 design.md：
- 宽度作用域 = 1B（同一张横向表内部统一计算）
- 宽度度量 = 2C（中文按 2、英文/数字按 1）
- 超页宽回退 = 3B（等比缩放，不退化为等宽分配）
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple


# 字符权重常量
WEIGHT_CHINESE = 2  # 中文字符权重
WEIGHT_ASCII = 1    # 英文/数字/标点权重

# 填写线默认权重（代表语义长度，不以实际字符数计算）
FILL_LINE_WEIGHT = 6


@dataclass(frozen=True)
class WidthToken:
    """宽度 token：表格单元格内容的语义表示。"""
    kind: str       # label | control | choice_atom | literal | unit
    text: str       # 原始文本
    weight: float   # 计算后的权重


@dataclass(frozen=True)
class ColumnDemand:
    """列需求：单列的宽度需求信息。"""
    column_key: str       # 列内稳定标识
    intrinsic_weight: float  # 内容驱动的内在权重
    min_weight: float     # 最小权重（可选保护）


@dataclass(frozen=True)
class WidthPlan:
    """宽度规划：一张横向表的完整宽度分配方案。"""
    column_count: int
    demands: List[ColumnDemand]
    normalized_fractions: List[float]  # 归一化后的列比例
    fallback_applied: bool              # 是否应用了缩放回退


def compute_char_weight(char: str) -> float:
    """计算单个字符的宽度权重。

    规则：
    - 中文字符（CJK）：权重 2
    - 英文/数字/标点：权重 1
    """
    code = ord(char)
    # CJK 统一汉字范围（含扩展）
    if (
        0x4E00 <= code <= 0x9FFF      # 基本区
        or 0x3400 <= code <= 0x4DBF   # 扩展A
        or 0x20000 <= code <= 0x2A6DF # 扩展B-F
        or 0x2A700 <= code <= 0x2B73F # 扩展G
        or 0x2B740 <= code <= 0x2B81F # 扩展H
        or 0x2B820 <= code <= 0x2CEAF # 扩展I-J
        or 0xF900 <= code <= 0xFAFF   # 兼容汉字
        or 0x2F800 <= code <= 0x2FA1F # 兼容补充
    ):
        return WEIGHT_CHINESE
    return WEIGHT_ASCII


def compute_text_weight(text: str) -> float:
    """计算文本的总宽度权重。"""
    if not text:
        return 0.0
    return sum(compute_char_weight(c) for c in text)


def compute_choice_atom_weight(label: str, has_trailing: bool) -> float:
    """计算 choice atom 的宽度权重。

    choice_atom = symbol + 空格 + label + trailing_fill_line_if_any
    """
    # 符号（○或□）+ 空格
    weight = 2 * WEIGHT_ASCII
    # 标签文本
    weight += compute_text_weight(label)
    # 尾部填写线（如果存在）
    if has_trailing:
        weight += FILL_LINE_WEIGHT
    return weight


def build_column_demands(
    headers: List[str],
    row_values: List[List[str | None]],
    field_types: List[str | None] = None,
) -> List[ColumnDemand]:
    """根据表头和行数据构建列需求列表。

    Args:
        headers: 表头文本列表
        row_values: 行数据列表（每行是一个单元格值列表）
        field_types: 字段类型列表（可选，用于特殊处理 choice 字段）

    Returns:
        列需求列表
    """
    if not headers:
        return []

    column_count = len(headers)
    field_types = field_types or [None] * column_count
    demands = []

    for col_idx in range(column_count):
        header = headers[col_idx] or ""
        # 收集该列所有内容权重
        weights = [compute_text_weight(header)]

        for row in row_values:
            if col_idx < len(row):
                cell_value = row[col_idx]
                if cell_value is not None:
                    weights.append(compute_text_weight(str(cell_value)))

        # 计算内在权重（取最大值代表该列需求）
        intrinsic = max(weights) if weights else WEIGHT_ASCII

        demands.append(ColumnDemand(
            column_key=f"col_{col_idx}",
            intrinsic_weight=intrinsic,
            min_weight=WEIGHT_ASCII * 4,  # 最小保护宽度
        ))

    return demands


def plan_width(
    demands: List[ColumnDemand],
    available_weight: float,
) -> WidthPlan:
    """根据列需求规划列宽分配。

    Args:
        demands: 列需求列表
        available_weight: 可用总宽度（权重单位）

    Returns:
        宽度规划方案
    """
    if not demands:
        return WidthPlan(
            column_count=0,
            demands=[],
            normalized_fractions=[],
            fallback_applied=False,
        )

    column_count = len(demands)

    # 计算总需求
    total_demand = sum(d.intrinsic_weight for d in demands)

    # 归一化：计算每列比例
    if total_demand == 0:
        # 零需求时等宽分配
        fractions = [1.0 / column_count] * column_count
    else:
        fractions = [d.intrinsic_weight / total_demand for d in demands]

    # 检查是否超预算，应用等比缩放
    fallback_applied = False
    if total_demand > available_weight:
        # 等比缩放，保持比例关系
        scale = available_weight / total_demand
        fractions = [f * scale for f in fractions]
        # 重新归一化
        total_fractions = sum(fractions)
        if total_fractions > 0:
            fractions = [f / total_fractions for f in fractions]
        fallback_applied = True

    return WidthPlan(
        column_count=column_count,
        demands=demands,
        normalized_fractions=fractions,
        fallback_applied=fallback_applied,
    )


def plan_inline_table_width(
    headers: List[str],
    row_values: List[List[str | None]],
    available_cm: float = 23.36,
    semantic_demands: List[Tuple[str, float]] | None = None,
) -> List[float]:
    """为 inline 表格规划列宽（厘米单位）。

    Args:
        headers: 表头文本列表
        row_values: 行数据列表
        available_cm: 可用总宽度（厘米）
        semantic_demands: 可选的语义需求列表 [(label, weight)]，来自
                         build_inline_column_demands，包含 choice/fill-line/unit 等
                         可见内容语义。若提供则优先使用。

    Returns:
        每列宽度列表（厘米）
    """
    if not headers:
        return []

    # 优先使用语义需求（包含 choice/fill-line/unit 等可见内容语义）
    if semantic_demands and len(semantic_demands) == len(headers):
        demands = [
            ColumnDemand(
                column_key=f"col_{i}",
                intrinsic_weight=max(weight, WEIGHT_ASCII * 4),
                min_weight=WEIGHT_ASCII * 4,
            )
            for i, (_label, weight) in enumerate(semantic_demands)
        ]
    else:
        demands = build_column_demands(headers, row_values)

    available_weight = available_cm * 2

    # 规划宽度
    plan = plan_width(demands, available_weight)

    # 转换为厘米
    return [fraction * available_cm for fraction in plan.normalized_fractions]


def plan_unified_table_width(
    segments: List[Tuple[str, List[str], List[List[str | None]]]],
    available_cm: float = 23.36,
    column_count: int | None = None,
    block_demands: List[List[Tuple[str, float]]] | None = None,
) -> List[float]:
    """为 unified 横向表规划列宽（厘米单位）。

    使用按列槽位取最大（per-slot-max）聚合策略：同一列槽位的需求取
    所有 inline block 对该槽位需求的最大值，而非拼接成超长向量。

    Args:
        segments: 片段列表，每个片段为 (type, headers, rows) 元组
        available_cm: 可用总宽度（厘米）
        column_count: unified 表的物理列数（若提供则用于归一化）
        block_demands: 可选的预计算语义需求列表，每个元素对应一个 inline block
                      的 [(label, weight)] 列表。若提供则优先使用。

    Returns:
        每列宽度列表（厘米），长度等于 column_count 或最大 block 列数
    """
    if not segments:
        return []

    # 确定物理列数 N
    max_block_cols = 0
    for seg_type, headers, _rows in segments:
        if seg_type == "inline_block" and headers:
            max_block_cols = max(max_block_cols, len(headers))

    N = column_count if column_count is not None else max_block_cols
    if N <= 0:
        return [available_cm]

    # 按列槽位取最大：每个 slot 收集所有 block 的需求，取 max
    slot_weights = [0.0] * N

    if block_demands:
        # 使用预计算的语义需求
        for demands_list in block_demands:
            for i, (_label, weight) in enumerate(demands_list):
                if i < N:
                    slot_weights[i] = max(slot_weights[i], weight)
    else:
        # 回退到基于 headers/rows 的基础需求
        for seg_type, headers, rows in segments:
            if seg_type == "inline_block" and headers:
                demands = build_column_demands(headers, rows)
                for i, d in enumerate(demands):
                    if i < N:
                        slot_weights[i] = max(slot_weights[i], d.intrinsic_weight)

    # 构建聚合后的列需求
    aggregated_demands = [
        ColumnDemand(
            column_key=f"col_{i}",
            intrinsic_weight=max(w, WEIGHT_ASCII * 4),  # 最小保护
            min_weight=WEIGHT_ASCII * 4,
        )
        for i, w in enumerate(slot_weights)
    ]

    # 规划宽度
    available_weight = available_cm * 2
    plan = plan_width(aggregated_demands, available_weight)

    # 转换为厘米
    return [fraction * available_cm for fraction in plan.normalized_fractions]
