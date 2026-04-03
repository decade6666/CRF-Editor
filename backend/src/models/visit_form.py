"""VisitForm 中间表模型 - 访视与表单的多对多关系"""
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from . import Base

if TYPE_CHECKING:
    from .form import Form


class VisitForm(Base):
    """访视-表单关联表"""
    __tablename__ = "visit_form"
    __table_args__ = (
        UniqueConstraint("visit_id", "form_id"),
        UniqueConstraint("visit_id", "sequence"),
        CheckConstraint("sequence >= 1"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    visit_id: Mapped[int] = mapped_column(
        ForeignKey("visit.id", ondelete="CASCADE"),
        nullable=False
    )
    form_id: Mapped[int] = mapped_column(
        ForeignKey("form.id", ondelete="CASCADE"),
        nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, comment="表单在访视中的序号")

    form: Mapped["Form"] = relationship()
