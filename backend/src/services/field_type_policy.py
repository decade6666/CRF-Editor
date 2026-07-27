"""项目数据库类型与多选字段类型策略。"""

from __future__ import annotations

DB_TYPE_SAIMEISI = "赛美斯"
DB_TYPE_OTHER = "其他"
MULTISELECT_FIELD_TYPES = frozenset({"多选", "多选（纵向）"})
MULTISELECT_REJECT_MSG = (
    "当前项目数据库类型为「其他」，不支持「多选」/「多选（纵向）」字段类型"
)


def allows_multiselect(db_type: str | None) -> bool:
    """仅「赛美斯」允许新建/改为多选类型。"""
    return db_type == DB_TYPE_SAIMEISI


def is_multiselect_field_type(field_type: str | None) -> bool:
    return field_type in MULTISELECT_FIELD_TYPES
