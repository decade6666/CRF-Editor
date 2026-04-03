"""Form 模型"""
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from . import Base

if TYPE_CHECKING:
    from .field import Field
    from .project import Project
    from .form_field import FormField


class Form(Base):
    """表单模型（独立于访视）"""
    __tablename__ = "form"
    __table_args__ = (
        UniqueConstraint("project_id", "name"),
        UniqueConstraint("project_id", "code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    order_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    design_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="forms")
    fields: Mapped[list["Field"]] = relationship(
        back_populates="form",
        cascade="all, delete-orphan"
    )
    form_fields: Mapped[list["FormField"]] = relationship(
        back_populates="form",
        cascade="all, delete-orphan"
    )
