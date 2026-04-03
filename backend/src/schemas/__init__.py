from typing import List
from pydantic import BaseModel, Field

from src.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse


class BatchDeleteRequest(BaseModel):
    """通用批量删除请求"""
    ids: List[int] = Field(..., min_length=1, max_length=500)
from src.schemas.visit import VisitCreate, VisitUpdate, VisitResponse
from src.schemas.form import FormCreate, FormUpdate, FormResponse
from src.schemas.field import FieldDefinitionCreate, FieldDefinitionUpdate, FieldDefinitionResponse, FormFieldCreate, FormFieldUpdate, FormFieldResponse
from src.schemas.codelist import CodeListCreate, CodeListUpdate, CodeListResponse, CodeListOptionCreate, CodeListOptionResponse
from src.schemas.unit import UnitCreate, UnitResponse
