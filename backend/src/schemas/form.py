import json
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, StrictInt, ValidationError, field_validator


PaperOrientation = Literal["auto", "landscape", "portrait"]
ANNOTATION_FORM_KEY = "_form"
ANNOTATION_POSITION_MIN_Y = -200
ANNOTATION_POSITION_MAX_Y = 200


class AnnotationPosition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    y: StrictInt

    @field_validator("y")
    @classmethod
    def clamp_y(cls, value: int) -> int:
        return max(ANNOTATION_POSITION_MIN_Y, min(ANNOTATION_POSITION_MAX_Y, value))


AnnotationPositions = Dict[str, AnnotationPosition]


def normalize_annotation_key(key: Any) -> str:
    if not isinstance(key, str):
        return ""
    return key.strip()


def _validate_annotation_key(key: Any) -> str:
    normalized_key = normalize_annotation_key(key)
    if not normalized_key:
        raise ValueError("annotation_positions 的 key 必须是非空字符串")
    if normalized_key.startswith("_") and normalized_key != ANNOTATION_FORM_KEY:
        raise ValueError("annotation_positions 仅允许使用 _form 作为保留 key")
    return normalized_key


def _validate_annotation_position(value: Any) -> AnnotationPosition:
    if isinstance(value, AnnotationPosition):
        return value
    try:
        return AnnotationPosition.model_validate(value)
    except ValidationError as exc:
        raise ValueError(str(exc)) from exc


def parse_annotation_positions(value: Any) -> AnnotationPositions | None:
    if value is None:
        return None
    if isinstance(value, str):
        if not value.strip():
            return None
        try:
            value = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError("annotation_positions 必须是合法 JSON") from exc
    if not isinstance(value, dict):
        raise ValueError("annotation_positions 必须是对象")

    return {
        _validate_annotation_key(key): _validate_annotation_position(item)
        for key, item in value.items()
    }


def serialize_annotation_positions(value: Any) -> str | None:
    validated = parse_annotation_positions(value)
    if validated is None:
        return None
    return json.dumps(
        {key: item.model_dump() for key, item in validated.items()},
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def preserve_annotation_positions_storage(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        if not value.strip():
            return None
        parse_annotation_positions(value)
        return value
    return serialize_annotation_positions(value)


class FormCreate(BaseModel):
    name: str
    code: Optional[str] = None
    domain: Optional[str] = None
    order_index: Optional[int] = None
    annotation_positions: Optional[AnnotationPositions] = None
    paper_orientation: PaperOrientation = "auto"

    @field_validator("annotation_positions", mode="before")
    @classmethod
    def validate_annotation_positions(cls, value: Any) -> AnnotationPositions | None:
        return parse_annotation_positions(value)


class FormUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    domain: Optional[str] = None
    order_index: Optional[int] = None
    design_notes: Optional[str] = None
    annotation_positions: Optional[AnnotationPositions] = None
    paper_orientation: Optional[PaperOrientation] = None

    @field_validator("annotation_positions", mode="before")
    @classmethod
    def validate_annotation_positions(cls, value: Any) -> AnnotationPositions | None:
        return parse_annotation_positions(value)


class FormResponse(BaseModel):
    id: int
    project_id: int
    name: str
    code: Optional[str] = None
    domain: Optional[str] = None
    order_index: Optional[int] = None
    design_notes: Optional[str] = None
    annotation_positions: Optional[AnnotationPositions] = None
    paper_orientation: PaperOrientation = "auto"

    model_config = {"from_attributes": True}

    @field_validator("annotation_positions", mode="before")
    @classmethod
    def validate_annotation_positions(cls, value: Any) -> AnnotationPositions | None:
        return parse_annotation_positions(value)
