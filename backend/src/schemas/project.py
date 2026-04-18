from datetime import datetime, date
import re
from typing import Optional

from pydantic import BaseModel, field_validator


_CONTROL_CHAR_PATTERN = re.compile(r"[\x00-\x1f\x7f]")


def normalize_screening_number_format(value):
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray)):
        try:
            value = bytes(value).decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("筛选号格式必须是有效UTF-8文本") from exc
    if not isinstance(value, str):
        raise ValueError("筛选号格式必须是字符串")
    # 先在原始输入上拦截换行/控制字符，避免被 strip() 静默吞掉首尾换行或 Tab
    if _CONTROL_CHAR_PATTERN.search(value):
        raise ValueError("筛选号格式不能包含换行或控制字符")
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > 100:
        raise ValueError("筛选号格式长度不能超过100个字符")
    return normalized


class ProjectCreate(BaseModel):
    name: str
    version: str
    trial_name: Optional[str] = None
    crf_version: Optional[str] = None
    crf_version_date: Optional[date] = None
    protocol_number: Optional[str] = None
    screening_number_format: Optional[str] = None
    sponsor: Optional[str] = None
    data_management_unit: Optional[str] = None

    @field_validator("crf_version_date", mode="before")
    @classmethod
    def empty_str_to_none(cls, value):
        if value == "":
            return None
        return value

    @field_validator("screening_number_format", mode="before")
    @classmethod
    def normalize_screening_number_format(cls, value):
        return normalize_screening_number_format(value)


class ProjectUpdate(ProjectCreate):
    pass


class ProjectResponse(ProjectCreate):
    id: int
    order_index: int
    created_at: datetime
    deleted_at: Optional[datetime] = None
    company_logo_path: Optional[str] = None

    model_config = {"from_attributes": True}
