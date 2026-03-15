from typing import Optional
from pydantic import BaseModel


class FormCreate(BaseModel):
    name: str
    code: Optional[str] = None
    domain: Optional[str] = None
    order_index: Optional[int] = None


class FormUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    domain: Optional[str] = None
    order_index: Optional[int] = None


class FormResponse(BaseModel):
    id: int
    project_id: int
    name: str
    code: Optional[str] = None
    domain: Optional[str] = None
    order_index: Optional[int] = None

    model_config = {"from_attributes": True}
