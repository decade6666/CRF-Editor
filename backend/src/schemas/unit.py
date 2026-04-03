from typing import Optional
from pydantic import BaseModel


class UnitCreate(BaseModel):
    symbol: str
    code: Optional[str] = None
    order_index: Optional[int] = None


class UnitUpdate(BaseModel):
    symbol: Optional[str] = None
    code: Optional[str] = None
    order_index: Optional[int] = None


class UnitResponse(BaseModel):
    id: int
    project_id: int
    symbol: str
    code: Optional[str] = None
    order_index: Optional[int] = None

    model_config = {"from_attributes": True}
