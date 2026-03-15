from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class CodeListOptionCreate(BaseModel):
    code: Optional[str] = None
    decode: str
    trailing_underscore: int = 0
    order_index: Optional[int] = None


class CodeListOptionUpdate(BaseModel):
    code: Optional[str] = None
    decode: Optional[str] = None
    trailing_underscore: Optional[int] = None
    order_index: Optional[int] = None


class CodeListOptionResponse(BaseModel):
    id: int
    codelist_id: int
    code: Optional[str] = None
    decode: str
    trailing_underscore: int = 0
    order_index: Optional[int] = None

    model_config = {"from_attributes": True}


class CodeListCreate(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = None


class CodeListUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = None


class CodeListResponse(BaseModel):
    id: int
    project_id: int
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = None
    options: List[CodeListOptionResponse] = []

    model_config = {"from_attributes": True}
