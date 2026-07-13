"""FieldDefinition 模型 - 项目级字段库定义"""
from __future__ import annotations

from typing import TYPE_CHECKING, List, Optional
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, UniqueConstraint, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates
from sqlalchemy.sql import func

from . import Base

if TYPE_CHECKING:
    from .codelist import CodeList
    from .project import Project
    from .unit import Unit
    from .form_field import FormField


class FieldDefinition(Base):
    """字段定义模型 - 项目级字段库"""
    __tablename__ = "field_definition"
    __table_args__ = (
        UniqueConstraint("project_id", "variable_name", name="uq_field_def_var_name"),
        CheckConstraint("integer_digits BETWEEN 1 AND 20", name="ck_integer_digits"),
        CheckConstraint("decimal_digits BETWEEN 0 AND 15", name="ck_decimal_digits"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False
    )
    variable_name: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    field_type: Mapped[str] = mapped_column(String(50), nullable=False)
    checkbox_label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # 数值类型配置
    integer_digits: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    decimal_digits: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # 日期类型配置
    date_format: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # 编码字典和单位
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

    # 序号
    order_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    @validates("field_type")
    def clear_checkbox_codelist_on_type_change(
        self,
        _key: str,
        field_type: str,
    ) -> str:
        if field_type == "复选":
            self.codelist_id = None
        else:
            self.checkbox_label = None
        return field_type

    @validates("codelist_id")
    def clear_checkbox_codelist(
        self,
        _key: str,
        codelist_id: Optional[int],
    ) -> Optional[int]:
        if getattr(self, "field_type", None) == "复选":
            return None
        return codelist_id

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
    project: Mapped["Project"] = relationship(back_populates="field_definitions")
    codelist: Mapped[Optional["CodeList"]] = relationship()
    unit: Mapped[Optional["Unit"]] = relationship()
    form_fields: Mapped[List["FormField"]] = relationship(
        back_populates="field_definition",
        cascade="all, delete-orphan"
    )
