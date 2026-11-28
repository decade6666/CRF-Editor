"""Coherent current-admin access and safe read projections for formal archives."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import stat
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.config import AppConfig
from src.dependencies import get_current_user, require_admin
from src.models.design_baseline import DesignBaseline, DesignBaselineArtifact, DesignBaselineCapture
from src.models.project import Project
from src.models.user import User
from src.services.design_revision_service import read_design_revision
from src.services.design_snapshot_service import (
    SnapshotError,
    capture_project_design,
    decode_project_design,
    describe_history,
)
from src.services.frozen_render_service import freeze_render_input
from src.services.logo_storage_service import LOGO_BLOCKED_EXTENSIONS, MAX_LOGO_BYTES, PROJECT_NAMESPACE, safe_resolve


@dataclass(frozen=True)
class AdminArchiveScope:
    session: Session
    user_id: int
    username: str
    config: AppConfig
    token: str = field(repr=False)
    project_id: int | None = None

    def authorize(self, *, response: Response | None = None) -> Project | None:
        user = get_current_user(token=self.token, session=self.session, response=response)
        require_admin(user)
        if self.project_id is None:
            return None
        project = self.session.get(Project, self.project_id)
        if project is None or project.deleted_at is not None:
            raise HTTPException(404, "项目不存在或已回收")
        return project


def begin_snapshot(session: Session, *, write: bool) -> None:
    connection = session.connection()
    if connection.dialect.name != "sqlite" or connection.connection.driver_connection.in_transaction:
        raise RuntimeError("留档事务必须在当前鉴权与读取前建立")
    connection.exec_driver_sql("BEGIN IMMEDIATE" if write else "BEGIN")


def _asset_failure() -> SnapshotError:
    return SnapshotError("项目 Logo 无法安全冻结，请重新检查后留档", "BASELINE_ASSET_INVALID", 422)


def frozen_logo(project: Project, config: AppConfig) -> bytes | None:
    """Bounded non-following read; immutable name and open identity must agree."""
    if not project.company_logo_path:
        return None
    try:
        path = safe_resolve(PROJECT_NAMESPACE, project.company_logo_path)
        expected_parent = Path(config.upload_path) / PROJECT_NAMESPACE
        if path.parent != expected_parent or path.suffix.lower() in LOGO_BLOCKED_EXTENSIONS:
            raise _asset_failure()
        for ancestor in (path.parent, *path.parent.parents):
            if ancestor.is_symlink():
                raise _asset_failure()
        before = path.lstat()
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not 0 < before.st_size <= MAX_LOGO_BYTES:
            raise _asset_failure()
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_BINARY", 0))
        with os.fdopen(descriptor, "rb") as stream:
            content = stream.read(MAX_LOGO_BYTES + 1)
            after = os.fstat(stream.fileno())
        identity = lambda info: (
            info.st_dev,
            info.st_ino,
            info.st_size,
            info.st_nlink,
            info.st_mtime_ns,
            info.st_ctime_ns,
        )
        if (
            identity(before) != identity(after)
            or identity(before) != identity(path.lstat())
            or len(content) != before.st_size
        ):
            raise _asset_failure()
        return content
    except SnapshotError:
        raise
    except (OSError, ValueError) as exc:
        raise _asset_failure() from exc


def capture_context(scope: AdminArchiveScope) -> dict[str, Any]:
    project = scope.authorize()
    revision = read_design_revision(scope.session, project.id)
    snapshot = capture_project_design(scope.session, project.id)
    inputs = freeze_render_input(snapshot, logo=frozen_logo(project, scope.config))
    logo_url = None
    if inputs.logo is not None:
        from docx.image.image import Image

        logo_url = f"data:{Image.from_blob(inputs.logo).content_type};base64," + base64.b64encode(inputs.logo).decode(
            "ascii"
        )
    label = project.crf_version or f"正式留档 {datetime.utcnow():%Y-%m-%d}"
    return {
        "snapshot": snapshot.to_dict(),
        "source_revision": revision,
        "content_hash": snapshot.content_hash,
        "suggested_label": label[:100],
        "logo_data_url": logo_url,
    }


def find_baseline(scope: AdminArchiveScope, baseline_id: str) -> DesignBaseline:
    baseline = scope.session.scalars(
        select(DesignBaseline).where(DesignBaseline.id == baseline_id, DesignBaseline.project_id == scope.project_id)
    ).one_or_none()
    if baseline is None:
        raise HTTPException(404, "留档不存在")
    return baseline


def baseline_summary(session: Session, row: DesignBaseline) -> dict[str, Any]:
    artifacts = session.scalars(
        select(DesignBaselineArtifact)
        .where(DesignBaselineArtifact.baseline_id == row.id)
        .order_by(DesignBaselineArtifact.kind)
    ).all()
    result = {
        key: getattr(row, key)
        for key in (
            "id",
            "project_id",
            "creator_user_id",
            "creator_name",
            "label",
            "remark",
            "source_revision",
            "snapshot_schema",
            "content_hash",
            "layout_hash",
            "asset_hash",
            "app_version",
            "render_version",
            "kind",
            "origin",
            "storage_source",
            "status",
        )
    }
    result["created_at"] = row.created_at.isoformat(timespec="microseconds") + "Z"
    result["artifacts"] = [
        {"kind": item.kind, "byte_count": item.byte_count, "sha256": item.sha256} for item in artifacts
    ]
    result["capabilities"] = describe_history(
        row.kind, row.origin, row.storage_source, [item.kind for item in artifacts]
    )
    return result


def baseline_detail(scope: AdminArchiveScope, baseline_id: str) -> dict[str, Any]:
    row = find_baseline(scope, baseline_id)
    design = decode_project_design(row.snapshot_json)
    if (
        design.content_hash != row.content_hash
        or hashlib.sha256(row.layout_json.encode()).hexdigest() != row.layout_hash
    ):
        raise SnapshotError("留档设计校验失败，不能读取", "BASELINE_INTEGRITY_FAILED", 500)
    return {
        **baseline_summary(scope.session, row),
        "snapshot": design.to_dict(),
        "column_widths": json.loads(row.layout_json),
    }


def list_baselines(scope: AdminArchiveScope, limit: int, offset: int) -> dict[str, Any]:
    statement = (
        select(DesignBaseline)
        .where(DesignBaseline.project_id == scope.project_id)
        .order_by(DesignBaseline.created_at.desc(), DesignBaseline.id.desc())
    )
    rows = scope.session.scalars(statement.limit(limit).offset(offset)).all()
    total = scope.session.scalar(
        select(func.count()).select_from(DesignBaseline).where(DesignBaseline.project_id == scope.project_id)
    )
    return {
        "items": [baseline_summary(scope.session, row) for row in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def list_archive_projects(scope: AdminArchiveScope, limit: int, offset: int) -> dict[str, Any]:
    rows = scope.session.execute(
        select(Project.id, Project.name, User.username)
        .outerjoin(User, User.id == Project.owner_id)
        .where(Project.deleted_at.is_(None))
        .order_by(Project.id)
        .limit(limit)
        .offset(offset)
    ).all()
    total = scope.session.scalar(select(func.count()).select_from(Project).where(Project.deleted_at.is_(None)))
    return {
        "items": [{"id": row.id, "name": row.name, "owner_username": row.username} for row in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def find_capture(scope: AdminArchiveScope, request_id: str) -> DesignBaselineCapture | None:
    return scope.session.scalars(
        select(DesignBaselineCapture).where(
            DesignBaselineCapture.project_id == scope.project_id,
            DesignBaselineCapture.actor_user_id == scope.user_id,
            DesignBaselineCapture.actor_username == scope.username,
            DesignBaselineCapture.request_id == request_id,
        )
    ).one_or_none()


def capture_status(scope: AdminArchiveScope, request_id: str) -> dict[str, Any]:
    row = find_capture(scope, request_id)
    if row is None:
        raise HTTPException(404, "留档请求不存在")
    return {
        "request_id": row.request_id,
        "status": row.status,
        "baseline_id": row.baseline_id,
        "error_code": row.error_code,
    }
