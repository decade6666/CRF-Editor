from typing import Optional, List
from pydantic import BaseModel, Field

from ._common import optional_oid_validator


class CodeListOptionCreate(BaseModel):
    code: Optional[str] = None
    decode: str
    trailing_underscore: int = 0
    order_index: Optional[int] = Field(None, ge=1)

    _validate_code = optional_oid_validator("code")


class CodeListOptionUpdate(BaseModel):
    code: Optional[str] = None
    decode: Optional[str] = None
    trailing_underscore: Optional[int] = None
    order_index: Optional[int] = Field(None, ge=1)

    _validate_code = optional_oid_validator("code")


class CodeListOptionBatchUpdate(BaseModel):
    id: Optional[int] = None
    code: Optional[str] = None
    decode: str
    trailing_underscore: int = 0

    _validate_code = optional_oid_validator("code")


class CodeListOptionResponse(BaseModel):
    id: int
    codelist_id: int
    code: Optional[str] = None
    decode: str
    trailing_underscore: int = 0
    order_index: Optional[int] = Field(None, ge=1)

    model_config = {"from_attributes": True}


class CodeListCreate(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = Field(None, ge=1)
    options: List[CodeListOptionBatchUpdate] = Field(default_factory=list)

    _validate_code = optional_oid_validator("code")


class CodeListUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = Field(None, ge=1)

    _validate_code = optional_oid_validator("code")


class CodeListSnapshotUpdate(BaseModel):
    name: str
    description: Optional[str] = None
    options: List[CodeListOptionBatchUpdate] = Field(default_factory=list)


class CodeListResponse(BaseModel):
    id: int
    project_id: int
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = Field(None, ge=1)
    options: List[CodeListOptionResponse] = []

    model_config = {"from_attributes": True}
