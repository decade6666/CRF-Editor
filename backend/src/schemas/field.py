from typing import Optional, List, Annotated
from datetime import datetime
from pydantic import BaseModel, StringConstraints


class UnitSimple(BaseModel):
    id: int
    symbol: str
    model_config = {"from_attributes": True}


class CodeListOptionSimple(BaseModel):
    id: int
    code: Optional[str] = None
    decode: str
    trailing_underscore: int = 0
    model_config = {"from_attributes": True}


class CodeListSimple(BaseModel):
    id: int
    name: str
    options: List[CodeListOptionSimple] = []
    model_config = {"from_attributes": True}


class FieldDefinitionCreate(BaseModel):
    variable_name: str
    label: str
    field_type: str
    integer_digits: Optional[int] = None
    decimal_digits: Optional[int] = None
    date_format: Optional[str] = None
    codelist_id: Optional[int] = None
    unit_id: Optional[int] = None
    is_multi_record: int = 0
    table_type: str = "固定行"
    order_index: Optional[int] = None


class FieldDefinitionUpdate(BaseModel):
    variable_name: Optional[str] = None
    label: Optional[str] = None
    field_type: Optional[str] = None
    integer_digits: Optional[int] = None
    decimal_digits: Optional[int] = None
    date_format: Optional[str] = None
    codelist_id: Optional[int] = None
    unit_id: Optional[int] = None
    is_multi_record: Optional[int] = None
    table_type: Optional[str] = None
    order_index: Optional[int] = None


class FieldDefinitionResponse(BaseModel):
    id: int
    project_id: int
    variable_name: str
    label: str
    field_type: str
    integer_digits: Optional[int] = None
    decimal_digits: Optional[int] = None
    date_format: Optional[str] = None
    codelist_id: Optional[int] = None
    unit_id: Optional[int] = None
    is_multi_record: int = 0
    table_type: str = "固定行"
    order_index: Optional[int] = None
    codelist: Optional[CodeListSimple] = None
    unit: Optional[UnitSimple] = None

    model_config = {"from_attributes": True}


HexColor = Annotated[str, StringConstraints(pattern=r"^[0-9A-Fa-f]{6}$")]


class FormFieldCreate(BaseModel):
    field_definition_id: Optional[int] = None
    is_log_row: int = 0
    order_index: Optional[int] = None
    required: int = 0
    label_override: Optional[str] = None
    help_text: Optional[str] = None
    default_value: Optional[str] = None
    inline_mark: int = 0
    bg_color: Optional[HexColor] = None
    text_color: Optional[HexColor] = None


class FormFieldUpdate(BaseModel):
    required: Optional[int] = None
    label_override: Optional[str] = None
    help_text: Optional[str] = None
    default_value: Optional[str] = None
    inline_mark: Optional[int] = None
    bg_color: Optional[HexColor] = None
    text_color: Optional[HexColor] = None


class FormFieldResponse(BaseModel):
    id: int
    form_id: int
    field_definition_id: Optional[int] = None
    is_log_row: int = 0
    order_index: int
    required: int
    label_override: Optional[str] = None
    help_text: Optional[str] = None
    default_value: Optional[str] = None
    inline_mark: int
    bg_color: Optional[str] = None
    text_color: Optional[str] = None
    field_definition: Optional[FieldDefinitionResponse] = None

    model_config = {"from_attributes": True}
