"""机构预设 schema"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class OrganizationPresetUpsert(BaseModel):
    """管理员新增/更新预设：名称必填，空白单位归一为 None。"""

    name: str
    data_management_unit: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        if not isinstance(value, str):
            raise ValueError("机构名称必须是字符串")
        normalized = value.strip()
        if not normalized:
            raise ValueError("机构名称不能为空")
        return normalized

    @field_validator("data_management_unit", mode="before")
    @classmethod
    def normalize_unit(cls, value):
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("数据管理单位必须是字符串")
        normalized = value.strip()
        return normalized or None


class OrganizationPresetResponse(BaseModel):
    id: int
    name: str
    data_management_unit: Optional[str] = None
    logo_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PresetCandidateResponse(BaseModel):
    """普通用户可见的候选：只暴露单位与 Logo 有无，不泄露机构名称/路径。"""

    id: int
    data_management_unit: str
    has_logo: bool
