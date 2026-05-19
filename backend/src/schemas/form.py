from typing import Literal, Optional

from pydantic import BaseModel


PaperOrientation = Literal["auto", "landscape", "portrait"]


class FormCreate(BaseModel):
    name: str
    code: Optional[str] = None
    domain: Optional[str] = None
    order_index: Optional[int] = None
    paper_orientation: PaperOrientation = "auto"


class FormUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    domain: Optional[str] = None
    order_index: Optional[int] = None
    design_notes: Optional[str] = None
    paper_orientation: Optional[PaperOrientation] = None


class FormResponse(BaseModel):
    id: int
    project_id: int
    name: str
    code: Optional[str] = None
    domain: Optional[str] = None
    order_index: Optional[int] = None
    design_notes: Optional[str] = None
    paper_orientation: PaperOrientation = "auto"

    model_config = {"from_attributes": True}
