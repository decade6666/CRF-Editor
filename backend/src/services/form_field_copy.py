"""FormField 字段实例复制。

项目复制 / 模板导入 / 表单复制三条路径共用同一份属性清单：
按模型列推导，新增列默认随之复制，避免各路径的复制清单各自漂移。
"""
from __future__ import annotations

from typing import Optional

from src.models.form_field import FormField

# 由调用方显式给定：目标表单、重映射后的字段定义外键、目标内排序
CALLER_SUPPLIED_ATTRS = frozenset({"form_id", "field_definition_id", "order_index"})
# 主键与时间戳：新实例由数据库重新生成，不继承源实例
NEVER_COPIED_ATTRS = frozenset({"id", "created_at", "updated_at"})

# 其余列按值原样复制（含展示属性：底纹 / 文字色 / 加粗 / 字号）
COPIED_ATTRS: tuple[str, ...] = tuple(
    column.name
    for column in FormField.__table__.columns
    if column.name not in CALLER_SUPPLIED_ATTRS and column.name not in NEVER_COPIED_ATTRS
)


def copy_form_field(
    src: FormField,
    *,
    form_id: int,
    field_definition_id: Optional[int],
    order_index: int,
) -> FormField:
    """按模型列复制字段实例的全部属性，返回未入库的新实例。

    form_id / field_definition_id / order_index 由调用方决定（三条路径的外键重映射
    与排序语义各不相同），其余列一律按源实例复制。
    """
    return FormField(
        form_id=form_id,
        field_definition_id=field_definition_id,
        order_index=order_index,
        **{attr: getattr(src, attr) for attr in COPIED_ATTRS},
    )
