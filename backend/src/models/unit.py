"""Unit 模型"""
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from . import Base

if TYPE_CHECKING:
    from .project import Project


class Unit(Base):
    """单位模型"""
    __tablename__ = "unit"
    __table_args__ = (
        UniqueConstraint("project_id", "code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False
    )
    symbol: Mapped[str] = mapped_column(String(50), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    order_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="units")
