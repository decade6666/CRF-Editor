"""FormField 模型 - 表单字段实例"""
from typing import TYPE_CHECKING, Optional
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from . import Base

if TYPE_CHECKING:
    from .form import Form
    from .field_definition import FieldDefinition


class FormField(Base):
    """表单字段实例模型 - 表单与字段库的关联"""
    __tablename__ = "form_field"
    # 日志行的 field_definition_id 为 null，不参与唯一约束
    __table_args__ = (
        UniqueConstraint("form_id", "field_definition_id", name="uq_form_field"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    form_id: Mapped[int] = mapped_column(
        ForeignKey("form.id", ondelete="CASCADE"),
        nullable=False
    )
    # 日志行不关联字段定义，此字段可为 null
    field_definition_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("field_definition.id", ondelete="CASCADE"),
        nullable=True
    )

    # 日志行标记：1 表示此行为日志行分隔符，不关联字段定义
    is_log_row: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # 表单内排序
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # 表单级覆盖属性
    required: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    label_override: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    help_text: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    default_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 表单内标记（用于横向表格渲染）
    inline_mark: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # 底纹颜色（HEX颜色值，如 FFFF00，无 # 前缀）
    bg_color: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    # 文字颜色（HEX颜色值，如 FF0000，无 # 前缀）
    text_color: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    # 时间戳
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now()
    )

    # 关系
    form: Mapped["Form"] = relationship(back_populates="form_fields")
    field_definition: Mapped[Optional["FieldDefinition"]] = relationship(back_populates="form_fields")
