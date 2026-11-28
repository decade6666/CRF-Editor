"""Formal-pair publication and explicit deletion; no live design writes or queues."""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator

from fastapi import HTTPException
from sqlalchemy import delete, insert, select, update
from sqlalchemy.orm import Session

from src.models.design_baseline import DesignBaseline, DesignBaselineArtifact, DesignBaselineCapture
from src.schemas.design_baseline import BaselineCreate
from src.services import design_baseline_storage_service as storage
from src.services import frozen_render_service as frozen
from src.services.design_baseline_access_service import (
    AdminArchiveScope,
    baseline_summary,
    begin_snapshot,
    find_baseline,
    frozen_logo,
)
from src.services.design_baseline_state_service import RENDER_CONTRACT_VERSION
from src.services.design_revision_service import DesignStateError, assert_design_revision, read_design_revision
from src.services.design_snapshot_service import (
    SNAPSHOT_SCHEMA_VERSION,
    SnapshotError,
    assert_formal_renderable,
    capture_project_design,
)

logger = logging.getLogger(__name__)
_ACTIVE_LOCK = threading.Lock()
_ACTIVE_CAPTURES: set[tuple[int, int, str]] = set()


def _failure(code: str, message: str, status: int = 409) -> SnapshotError:
    return SnapshotError(message, code, status)


@contextmanager
def _capture_admission(identity: tuple[int, int, str]) -> Iterator[None]:
    with _ACTIVE_LOCK:
        if identity in _ACTIVE_CAPTURES:
            raise _failure("BASELINE_CAPTURE_PENDING", "该请求仍在生成，请查询请求状态后再操作")
        _ACTIVE_CAPTURES.add(identity)
    try:
        yield
    finally:
        with _ACTIVE_LOCK:
            _ACTIVE_CAPTURES.remove(identity)


def _request_hash(data: BaselineCreate, revision: str | None) -> str:
    try:
        payload = {
            "label": data.label,
            "remark": data.remark,
            "column_widths": data.column_widths,
            "source_revision": revision,
        }
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode(
                "utf-8"
            )
        ).hexdigest()
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise _failure("BASELINE_LAYOUT_INVALID", "留档输入无效，请重新预览", 422) from exc


def _existing_request(scope: AdminArchiveScope, data: BaselineCreate, input_hash: str) -> DesignBaselineCapture | None:
    row = scope.session.scalars(
        select(DesignBaselineCapture).where(
            DesignBaselineCapture.project_id == scope.project_id,
            DesignBaselineCapture.actor_user_id == scope.user_id,
            DesignBaselineCapture.request_id == data.request_id,
        )
    ).one_or_none()
    if row is not None:
        if row.input_hash != input_hash or row.actor_username != scope.username:
            raise _failure("BASELINE_REQUEST_CONFLICT", "同一留档请求不能更换输入，请使用新的请求")
        if row.status == "deleted":
            raise _failure("BASELINE_REQUEST_DELETED", "该留档已被明确删除，旧请求不能重新创建", 410)
    return row


def _app_version() -> str:
    # The existing release process versions frontend/package.json. No runtime
    # private config or Git subprocess is read; missing bundle metadata is explicit.
    try:
        path = Path(__file__).resolve().parents[3] / "frontend" / "package.json"
        value = json.loads(path.read_text(encoding="utf-8"))["version"]
        if isinstance(value, str) and 0 < len(value) <= 64:
            return value
    except (OSError, KeyError, ValueError):
        pass
    return "unavailable"


def _prepare_capture(
    scope: AdminArchiveScope,
    data: BaselineCreate,
    expected: str | None,
    previous: DesignBaselineCapture | None,
    digest: str,
) -> tuple[int, str, frozen.FrozenRenderInput, storage.Stage, datetime, str]:
    if previous is not None and not data.retry:
        raise _failure(
            "BASELINE_CAPTURE_PENDING" if previous.status == "pending" else "BASELINE_CAPTURE_FAILED",
            "该请求尚未完成；确认状态后显式重试，或重新预览并发起新请求",
        )
    assert_design_revision(scope.session, scope.project_id, expected)
    project = scope.authorize()
    design = capture_project_design(scope.session, project.id)
    assert_formal_renderable(design)
    inputs = frozen.freeze_render_input(design, data.column_widths, frozen_logo(project, scope.config))
    capture = previous or DesignBaselineCapture(
        project_id=scope.project_id,
        actor_user_id=scope.user_id,
        actor_username=scope.username,
        request_id=data.request_id,
        input_hash=digest,
    )
    capture.status, capture.error_code = "pending", None
    scope.session.add(capture)
    scope.session.flush()
    capture_id = capture.id
    captured_at, version = datetime.utcnow(), _app_version()
    stage = storage.prepare_stage(scope.config)
    return capture_id, expected, inputs, stage, captured_at, version


def _publish(
    scope: AdminArchiveScope,
    data: BaselineCreate,
    capture_id: int,
    revision: str,
    inputs: frozen.FrozenRenderInput,
    stage: storage.Stage,
    captured_at: datetime,
    version: str,
    identifier: str,
) -> dict[str, Any]:
    artifacts = frozen.render_frozen_pair(inputs, stage.directory)
    if inputs.logo is not None:
        with (stage.directory / "logo.bitmap").open("xb") as stream:
            stream.write(inputs.logo)
    storage.publish_stage(stage)
    scope.session.expire_all()
    begin_snapshot(scope.session, write=True)
    scope.authorize()
    current = read_design_revision(scope.session, scope.project_id)
    if current.rsplit(":r", 1)[0] != revision.rsplit(":r", 1)[0]:
        raise _failure("BASELINE_PROJECT_CHANGED", "项目身份已变化，本次未发布留档")
    for artifact in artifacts:
        scope.session.execute(
            insert(DesignBaselineArtifact).values(
                baseline_id=identifier,
                kind=artifact.kind,
                relative_name=f"{artifact.kind}.docx",
                byte_count=artifact.byte_count,
                sha256=artifact.sha256,
            )
        )
    scope.session.execute(
        insert(DesignBaseline).values(
            id=identifier,
            project_id=scope.project_id,
            creator_user_id=scope.user_id,
            creator_name=scope.username,
            created_at=captured_at,
            label=data.label,
            remark=data.remark,
            source_revision=revision,
            snapshot_schema=SNAPSHOT_SCHEMA_VERSION,
            snapshot_json=inputs.design.payload_json,
            content_hash=inputs.design.content_hash,
            layout_json=inputs.layout_json,
            layout_hash=inputs.layout_hash,
            asset_hash=inputs.asset_hash,
            storage_key=stage.key,
            app_version=version,
            render_version=RENDER_CONTRACT_VERSION,
        )
    )
    changed = scope.session.execute(
        update(DesignBaselineCapture)
        .where(DesignBaselineCapture.id == capture_id, DesignBaselineCapture.status == "pending")
        .values(status="completed", baseline_id=identifier, error_code=None)
    )
    if changed.rowcount != 1:
        raise _failure("BASELINE_REQUEST_CONFLICT", "留档请求状态已变化，未发布本次原件")
    result = baseline_summary(scope.session, scope.session.get(DesignBaseline, identifier))
    scope.session.commit()
    return result


def _compensate(
    scope: AdminArchiveScope, capture_id: int | None, identifier: str, stage: storage.Stage | None, error_code: str
) -> bool:
    engine = scope.session.get_bind()
    scope.session.close()  # rollback uncommitted DB work, including failed flushes
    try:
        with Session(engine) as session:
            exists = session.scalar(select(DesignBaseline.id).where(DesignBaseline.id == identifier)) is not None
            if exists:
                logger.warning("留档提交结果需查询 project_id=%s capture_id=%s", scope.project_id, capture_id)
                return True  # Never unlink a possibly committed completed original.
            if capture_id is not None:
                session.execute(
                    update(DesignBaselineCapture)
                    .where(DesignBaselineCapture.id == capture_id, DesignBaselineCapture.status == "pending")
                    .values(status="failed", error_code=error_code)
                )
                session.commit()
    except Exception as exc:
        logger.warning("留档失败状态未能确认 project_id=%s exception=%s", scope.project_id, type(exc).__name__)
        return True  # Unknown outcome is retained, not guessed away.
    if stage is not None:
        storage.cleanup_stage(stage)
        storage.cleanup_published(stage.root, stage.key)
    return False


def create_baseline(
    scope: AdminArchiveScope, data: BaselineCreate, expected_revision: str | None
) -> tuple[dict[str, Any], bool]:
    digest = _request_hash(data, expected_revision)
    previous = _existing_request(scope, data, digest)
    if previous is not None and previous.status == "completed":
        return baseline_summary(scope.session, find_baseline(scope, previous.baseline_id)), True
    identity = (scope.project_id, scope.user_id, data.request_id)
    identifier, stage, capture_id = uuid.uuid4().hex, None, None
    with _capture_admission(identity):
        try:
            capture_id, revision, inputs, stage, captured_at, version = _prepare_capture(
                scope, data, expected_revision, previous, digest
            )
            scope.session.commit()  # compensation already owns this operation's stage identity
            return _publish(scope, data, capture_id, revision, inputs, stage, captured_at, version, identifier), False
        except Exception as exc:
            code = exc.code if isinstance(exc, SnapshotError) else "BASELINE_CAPTURE_FAILED"
            uncertain = _compensate(scope, capture_id, identifier, stage, code)
            logger.warning(
                "正式留档未完成 project_id=%s code=%s exception=%s", scope.project_id, code, type(exc).__name__
            )
            if isinstance(exc, (HTTPException, SnapshotError, DesignStateError)):
                raise
            message = (
                "留档提交结果不确定，请先查询请求状态，未自动重试" if uncertain else "正式留档失败，未发布不完整原件"
            )
            raise _failure(
                "BASELINE_PUBLISH_UNCERTAIN" if uncertain else "BASELINE_CAPTURE_FAILED", message, 500
            ) from exc


def delete_baseline(scope: AdminArchiveScope, identifier: str) -> dict[str, Any]:
    row = find_baseline(scope, identifier)
    root = storage.history_root(scope.config)
    key = row.storage_key
    with storage.history_removal(root, key):
        try:
            scope.session.execute(
                update(DesignBaselineCapture)
                .where(DesignBaselineCapture.baseline_id == identifier)
                .values(status="deleted", baseline_id=None)
            )
            scope.session.execute(
                delete(DesignBaseline).where(
                    DesignBaseline.id == identifier, DesignBaseline.project_id == scope.project_id
                )
            )
            scope.session.commit()
        except Exception as exc:
            scope.session.close()
            logger.warning("留档删除未完成 project_id=%s exception=%s", scope.project_id, type(exc).__name__)
            raise _failure("BASELINE_DELETE_FAILED", "留档删除未完成，原件文件未清理，请先核对状态", 500) from exc
        return {"deleted": True, "cleanup_complete": storage.cleanup_published(root, key)}
