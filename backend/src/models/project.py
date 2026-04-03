"""Project 模型"""
from datetime import datetime, date
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from . import Base

if TYPE_CHECKING:
    from .codelist import CodeList
    from .form import Form
    from .unit import Unit
    from .user import User
    from .visit import Visit
    from .field_definition import FieldDefinition


class Project(Base):
    """项目模型"""
    __tablename__ = "project"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    # CRF 元数据字段
    trial_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    crf_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    crf_version_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    protocol_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    sponsor: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # 项目扩展字段
    company_logo_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    data_management_unit: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # 归属用户
    owner_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("user.id"), nullable=True, index=True
    )
    owner: Mapped[Optional["User"]] = relationship(back_populates="projects")

    visits: Mapped[list["Visit"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan"
    )
    forms: Mapped[list["Form"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan"
    )
    units: Mapped[list["Unit"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan"
    )
    codelists: Mapped[list["CodeList"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan"
    )
    field_definitions: Mapped[list["FieldDefinition"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan"
    )
