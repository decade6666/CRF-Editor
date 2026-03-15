"""Visit 模型"""
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from . import Base

if TYPE_CHECKING:
    from .form import Form
    from .project import Project
    from .visit_form import VisitForm


class Visit(Base):
    """访视模型"""
    __tablename__ = "visit"
    __table_args__ = (
        UniqueConstraint("project_id", "sequence"),
        UniqueConstraint("project_id", "name"),
        UniqueConstraint("project_id", "code"),
        CheckConstraint("sequence >= 1"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)

    project: Mapped["Project"] = relationship(back_populates="visits")

    # 通过中间表访问表单（多对多关系）
    visit_forms: Mapped[list["VisitForm"]] = relationship(
        cascade="all, delete-orphan",
        foreign_keys="VisitForm.visit_id"
    )
