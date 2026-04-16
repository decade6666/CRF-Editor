from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, field_validator


class ProjectCreate(BaseModel):
    name: str
    version: str
    trial_name: Optional[str] = None
    crf_version: Optional[str] = None
    crf_version_date: Optional[date] = None
    protocol_number: Optional[str] = None
    sponsor: Optional[str] = None
    data_management_unit: Optional[str] = None

    # 前端空字符串转 None，防止 date 解析炸掉
    @field_validator('crf_version_date', mode='before')
    @classmethod
    def empty_str_to_none(cls, v):
        if v == '':
            return None
        return v


class ProjectUpdate(ProjectCreate):
    pass


class ProjectResponse(ProjectCreate):
    id: int
    order_index: int
    created_at: datetime
    deleted_at: Optional[datetime] = None
    company_logo_path: Optional[str] = None

    model_config = {"from_attributes": True}
