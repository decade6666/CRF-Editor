"""单横向表格编辑守卫（R1–R6）。

横向块 = 按 (order_index, id) 实际顺序排列后，连续 truthy `inline_mark` 的一段
（与前端 `formFieldPresentation.buildFormDesignerRenderGroups` 的分组语义一致；
非规范 2 / 负数标记与 1 同样按 truthy 保守计入）。允许
`after_count <= max(1, before_count)`：遗留多块表单可保留或减少，不可增加。

本服务只做读取与校验，不提交 / 不回滚事务：调用方在既有请求事务内先
`capture_inline_block_count` 取基线，再执行定义/实例/排序写入，最后
`ensure_inline_block_limit` 校验实际落库的终态；违规抛 400 由 `get_session`
整体回滚。导入 / 整表复制 / 整项目复制不经本守卫。
"""

from typing import Sequence

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.models.form_field import FormField

INLINE_TABLE_LIMIT_MSG = "单个表单最多允许一个横向表格，本次操作会新增横向表格，已取消操作"


def count_inline_blocks(inline_marks: Sequence[int]) -> int:
    """按顺序统计连续 truthy 标记的段数（计数，不 rewrite 数据）。"""
    blocks = 0
    in_block = False
    for mark in inline_marks:
        enabled = bool(mark)
        if enabled and not in_block:
            blocks += 1
        in_block = enabled
    return blocks


def is_block_count_allowed(before_count: int, after_count: int) -> bool:
    """R6 兼容规则：after <= max(1, before)。"""
    return after_count <= max(1, before_count)


def get_ordered_inline_marks(session: Session, form_id: int) -> list[int]:
    """按仓储既有排序 (order_index, id) 读取标记序列。"""
    rows = session.execute(
        select(FormField.inline_mark).where(FormField.form_id == form_id).order_by(FormField.order_index, FormField.id)
    ).all()
    return [row[0] for row in rows]


def capture_inline_block_count(session: Session, form_id: int) -> int:
    """在首个定义 / 实例 / 排序写操作前记录当前横向块数基线。"""
    return count_inline_blocks(get_ordered_inline_marks(session, form_id))


def ensure_inline_block_limit(session: Session, form_id: int, before_count: int) -> None:
    """校验请求事务内实际落库的终态；违规抛 400（调用方事务整体回滚）。"""
    after_count = capture_inline_block_count(session, form_id)
    if not is_block_count_allowed(before_count, after_count):
        raise HTTPException(400, INLINE_TABLE_LIMIT_MSG)
