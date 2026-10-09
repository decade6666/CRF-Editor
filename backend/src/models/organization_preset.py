"""机构预设模型（管理员维护，项目快照消费）"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from . import Base


class OrganizationPreset(Base):
    """机构名称 + 数据管理单位 + Logo 的填充模板。

    name / data_management_unit 使用 NOCASE 唯一（SQLite 仅折叠 ASCII 大小写），
    空白单位在 schema before-validator 归一为 None，允许多条空单位共存。
    """

    __tablename__ = "organization_preset"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255, collation="NOCASE"), nullable=False)
    data_management_unit: Mapped[Optional[str]] = mapped_column(String(255, collation="NOCASE"), nullable=True)
    logo_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("name", name="uq_org_preset_name"),
        UniqueConstraint("data_management_unit", name="uq_org_preset_unit"),
    )
