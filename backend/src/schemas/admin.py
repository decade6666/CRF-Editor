"""管理员路由的请求 / 响应模型。"""

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class MeResponse(BaseModel):
    username: str
    is_admin: bool


class BatchCopyRequest(BaseModel):
    project_ids: List[int]
    target_user_id: int


class BatchMoveRequest(BaseModel):
    project_ids: List[int]
    target_user_id: int


class CleanupRuleAge(BaseModel):
    enabled: bool = False
    value: int = Field(ge=1)
    unit: Literal["day", "month", "year"] = "day"


class CleanupRuleSize(BaseModel):
    enabled: bool = False
    value: int = Field(ge=1)
    unit: Literal["MB", "GB"] = "MB"


class CleanupPolicyUpdateRequest(BaseModel):
    interval_minutes: int = Field(ge=1, le=1440)
    min_retain_hours: int = Field(ge=0)
    age: CleanupRuleAge
    size: CleanupRuleSize


class CleanupPolicyResponse(CleanupPolicyUpdateRequest):
    total_estimated_size_bytes: int = 0
    recycled_project_count: int = 0


class CleanupPreviewItem(BaseModel):
    id: int
    name: str
    owner_username: Optional[str] = None
    deleted_at: datetime
    estimated_size_bytes: int
    matched_rules: List[str]


class UserCreateRequest(BaseModel):
    username: str
    password: str


class UserRenameRequest(BaseModel):
    username: str


class UserPasswordResetRequest(BaseModel):
    password: str


class UserResponse(BaseModel):
    id: int
    username: str

    model_config = {"from_attributes": True}


class UserListItem(BaseModel):
    id: int
    username: str
    project_count: int
    has_password: bool
    is_admin: bool
