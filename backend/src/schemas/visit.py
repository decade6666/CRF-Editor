from typing import Optional
from pydantic import BaseModel


class VisitCreate(BaseModel):
    name: str
    code: Optional[str] = None
    sequence: Optional[int] = None


class VisitUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    sequence: Optional[int] = None


class VisitResponse(BaseModel):
    id: int
    project_id: int
    name: str
    code: Optional[str] = None
    sequence: int

    model_config = {"from_attributes": True}
