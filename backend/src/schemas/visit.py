from typing import Optional

from pydantic import BaseModel, Field


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


class VisitFormSequenceUpdate(BaseModel):
    sequence: int = Field(..., ge=1, description="目标序号（从 1 开始）")
