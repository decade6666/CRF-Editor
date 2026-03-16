"""CodeList 模型"""
from typing import TYPE_CHECKING, Optional, List

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint, nullslast
from sqlalchemy.orm import Mapped, mapped_column, relationship

from . import Base

if TYPE_CHECKING:
    from .codelist import CodeListOption
    from .project import Project


class CodeList(Base):
    """编码字典模型"""
    __tablename__ = "codelist"
    __table_args__ = (
        UniqueConstraint("project_id", "code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE"),
        nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    order_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # 关系
    project: Mapped["Project"] = relationship(back_populates="codelists")
    options: Mapped[List["CodeListOption"]] = relationship(
        back_populates="codelist",
        cascade="all, delete-orphan",
        order_by=lambda: nullslast(CodeListOption.order_index.asc())
    )


class CodeListOption(Base):
    """编码字典选项"""
    __tablename__ = "codelist_option"
    __table_args__ = (
        UniqueConstraint("codelist_id", "code", "decode"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    codelist_id: Mapped[int] = mapped_column(
        ForeignKey("codelist.id", ondelete="CASCADE"),
        nullable=False
    )
    code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    decode: Mapped[str] = mapped_column(String(255), nullable=False)
    trailing_underscore: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    order_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # 关系
    codelist: Mapped["CodeList"] = relationship(back_populates="options")
