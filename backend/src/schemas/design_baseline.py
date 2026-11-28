"""Closed bounded browser DTOs for administrator-only formal archives."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictStr, field_validator

OpaqueId = Annotated[str, Field(pattern=r"^[0-9a-f]{32}$", min_length=32, max_length=32)]


class ClosedModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BaselineCreate(ClosedModel):
    request_id: OpaqueId
    label: Annotated[StrictStr, Field(min_length=1, max_length=100)]
    remark: Annotated[StrictStr, Field(max_length=2000)] = ""
    column_widths: dict[str, Any] = Field(default_factory=dict)
    retry: bool = Field(default=False, strict=True)

    @field_validator("label", "remark")
    @classmethod
    def valid_text(cls, value: str) -> str:
        if "\x00" in value:
            raise ValueError("留档文字不能包含空字符")
        try:
            value.encode("utf-8")
        except UnicodeError as exc:
            raise ValueError("留档文字包含无效字符") from exc
        return value


class BaselineDelete(ClosedModel):
    confirm_pair_loss: Literal[True]

    @field_validator("confirm_pair_loss", mode="before")
    @classmethod
    def explicit_confirmation(cls, value: Any) -> bool:
        if value is not True:
            raise ValueError("必须明确确认删除整对原件")
        return True


class ArtifactResponse(ClosedModel):
    kind: Literal["ecrf", "acrf"]
    byte_count: int
    sha256: str


class CapabilityResponse(ClosedModel):
    schema_version: int
    kind: Literal["formal_pair", "data_only"]
    origin: Literal["manual", "scheduled", "restore_protection"]
    storage_source: Literal["live_history", "full_set"]
    design: bool
    layout: bool
    assets: bool
    originals: list[Literal["ecrf", "acrf"]]


class BaselineResponse(ClosedModel):
    id: OpaqueId
    project_id: int
    creator_user_id: int
    creator_name: str
    created_at: str
    label: str
    remark: str
    source_revision: str
    snapshot_schema: int
    content_hash: str
    layout_hash: str
    asset_hash: str | None
    app_version: str
    render_version: str
    kind: Literal["formal_pair"]
    origin: Literal["manual", "scheduled", "restore_protection"]
    storage_source: Literal["live_history"]
    status: Literal["complete"]
    capabilities: CapabilityResponse
    artifacts: list[ArtifactResponse]


class BaselineDetail(BaselineResponse):
    snapshot: dict[str, Any]
    column_widths: dict[str, Any]


class BaselineList(ClosedModel):
    items: list[BaselineResponse]
    total: int
    limit: int
    offset: int


class CaptureContext(ClosedModel):
    snapshot: dict[str, Any]
    source_revision: str
    content_hash: str
    suggested_label: str
    logo_data_url: str | None


class CaptureResponse(ClosedModel):
    request_id: OpaqueId
    status: Literal["pending", "failed", "completed", "deleted"]
    baseline_id: OpaqueId | None
    error_code: str | None


class DeleteResponse(ClosedModel):
    deleted: Literal[True]
    cleanup_complete: bool


class ArchiveProject(ClosedModel):
    id: int
    name: str
    owner_username: str | None


class ArchiveProjectList(ClosedModel):
    items: list[ArchiveProject]
    total: int
    limit: int
    offset: int
