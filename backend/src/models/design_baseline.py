"""Private formal archives and request identities; never part of product exchange."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from . import Base


def _hash_constraint(column: str, *, optional: bool = False) -> CheckConstraint:
    rule = f"length({column})=64 AND {column} NOT GLOB '*[^0-9a-f]*'"
    return CheckConstraint(f"{column} IS NULL OR ({rule})" if optional else rule)


class DesignBaseline(Base):
    """A completed immutable pair. Failed/pending work belongs to Capture only."""

    __tablename__ = "design_baseline"
    __table_args__ = (
        CheckConstraint("length(id)=32 AND id NOT GLOB '*[^0-9a-f]*'"),
        CheckConstraint("length(storage_key)=32 AND storage_key NOT GLOB '*[^0-9a-f]*'"),
        CheckConstraint("length(label) BETWEEN 1 AND 100 AND length(remark)<=2000"),
        CheckConstraint("snapshot_schema=1 AND status='complete' AND kind='formal_pair'"),
        CheckConstraint("origin IN ('manual','scheduled','restore_protection') AND storage_source='live_history'"),
        _hash_constraint("content_hash"),
        _hash_constraint("layout_hash"),
        _hash_constraint("asset_hash", optional=True),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("project.id", ondelete="CASCADE"), index=True)
    # Immutable provenance, not an authorization FK. Account removal/renaming
    # cannot rewrite an archive; current admin is checked on every API operation.
    creator_user_id: Mapped[int] = mapped_column(Integer)
    creator_name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    label: Mapped[str] = mapped_column(String(100))
    remark: Mapped[str] = mapped_column(Text, default="")
    source_revision: Mapped[str] = mapped_column(String(160))
    snapshot_schema: Mapped[int] = mapped_column(Integer)
    snapshot_json: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    layout_json: Mapped[str] = mapped_column(Text)
    layout_hash: Mapped[str] = mapped_column(String(64))
    asset_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    storage_key: Mapped[str] = mapped_column(String(32), unique=True)
    app_version: Mapped[str] = mapped_column(String(64))
    render_version: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(16), default="formal_pair")
    origin: Mapped[str] = mapped_column(String(24), default="manual")
    storage_source: Mapped[str] = mapped_column(String(16), default="live_history")
    status: Mapped[str] = mapped_column(String(16), default="complete")


class DesignBaselineArtifact(Base):
    """Closed-kind retained original index; insert before its deferred parent."""

    __tablename__ = "design_baseline_artifact"
    __table_args__ = (
        CheckConstraint("kind IN ('ecrf','acrf') AND relative_name=kind||'.docx'"),
        # Schema-v1 hard bound mirrors the approved single-original safety cap.
        CheckConstraint("typeof(byte_count)='integer' AND byte_count BETWEEN 1 AND 67108864"),
        _hash_constraint("sha256"),
    )

    baseline_id: Mapped[str] = mapped_column(
        ForeignKey("design_baseline.id", ondelete="CASCADE", deferrable=True, initially="DEFERRED"), primary_key=True
    )
    kind: Mapped[str] = mapped_column(String(8), primary_key=True)
    relative_name: Mapped[str] = mapped_column(String(16))
    byte_count: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))


class DesignBaselineCapture(Base):
    """Stable actor/project/request binding, including failed/deleted tombstones."""

    __tablename__ = "design_baseline_capture"
    __table_args__ = (
        UniqueConstraint("project_id", "actor_user_id", "request_id", name="uq_design_baseline_capture_request"),
        CheckConstraint("length(request_id)=32 AND request_id NOT GLOB '*[^0-9a-f]*'"),
        CheckConstraint("status IN ('pending','failed','completed','deleted')"),
        _hash_constraint("input_hash"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("project.id", ondelete="CASCADE"), index=True)
    actor_user_id: Mapped[int] = mapped_column(Integer)
    actor_username: Mapped[str] = mapped_column(String(255))
    request_id: Mapped[str] = mapped_column(String(32))
    input_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="pending")
    baseline_id: Mapped[str | None] = mapped_column(
        ForeignKey("design_baseline.id", ondelete="SET NULL"), nullable=True, index=True
    )
    error_code: Mapped[str | None] = mapped_column(String(48), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
