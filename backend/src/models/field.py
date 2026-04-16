"""Field 模型"""
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from . import Base

if TYPE_CHECKING:
    from .codelist import CodeList
    from .form import Form
    from .unit import Unit


class Field(Base):
    """字段模型"""
    __tablename__ = "field"
    __table_args__ = (
        CheckConstraint("precision BETWEEN 0 AND 15"),
        CheckConstraint("integer_digits BETWEEN 1 AND 20"),
        CheckConstraint("decimal_digits BETWEEN 0 AND 15"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    form_id: Mapped[int] = mapped_column(
        ForeignKey("form.id", ondelete="CASCADE"),
        nullable=False
    )
    variable_name: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    field_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # 数值类型配置
    integer_digits: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    decimal_digits: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # 日期类型配置
    date_format: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # 保留旧字段以兼容
    precision: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=2)

    codelist_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("codelist.id", ondelete="SET NULL"),
        nullable=True
    )
    unit_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("unit.id", ondelete="SET NULL"),
        nullable=True
    )

    # 多记录表格配置
    is_multi_record: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    table_type: Mapped[str] = mapped_column(String(20), nullable=False, default='固定行')

    form: Mapped["Form"] = relationship(back_populates="fields")
    codelist: Mapped[Optional["CodeList"]] = relationship()
    unit: Mapped[Optional["Unit"]] = relationship()
