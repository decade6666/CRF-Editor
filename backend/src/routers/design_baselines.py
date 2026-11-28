"""Dedicated administrator archive API; ordinary project ownership is unchanged."""

from __future__ import annotations

from collections.abc import Callable, Coroutine, Iterator
from contextlib import nullcontext
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.config import get_config
from src.database import get_plain_session
from src.dependencies import _oauth2_scheme, get_current_user, require_admin
from src.models.design_baseline import DesignBaselineArtifact
from src.schemas.design_baseline import (
    ArchiveProjectList,
    BaselineCreate,
    BaselineDelete,
    BaselineDetail,
    BaselineList,
    BaselineResponse,
    CaptureContext,
    CaptureResponse,
    DeleteResponse,
    OpaqueId,
)
from src.services import design_baseline_access_service as access
from src.services import design_baseline_service as service
from src.services import design_baseline_storage_service as storage
from src.services.design_baseline_state_service import project_history_access, project_history_removal
from src.services.design_revision_service import REVISION_HEADER, DesignStateError
from src.services.design_snapshot_service import SnapshotError

MAX_REQUEST_BYTES = 256 * 1024


class BaselineRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        original = super().get_route_handler()

        async def guarded(request: Request) -> Response:
            try:
                if request.method in {"POST", "DELETE"}:
                    length = request.headers.get("Content-Length")
                    if length is not None:
                        try:
                            declared = int(length)
                        except ValueError as exc:
                            raise HTTPException(400, "请求长度无效") from exc
                        if declared < 0:
                            raise HTTPException(400, "请求长度无效")
                        if declared > MAX_REQUEST_BYTES:
                            raise SnapshotError("留档请求超过处理上限", "BASELINE_LIMIT_EXCEEDED", 413)
                    body = bytearray()
                    async for chunk in request.stream():
                        if len(body) + len(chunk) > MAX_REQUEST_BYTES:
                            raise SnapshotError("留档请求超过处理上限", "BASELINE_LIMIT_EXCEEDED", 413)
                        body.extend(chunk)
                    request._body = bytes(body)
                response = await original(request)
            except SnapshotError as exc:
                response = JSONResponse({"detail": str(exc), "code": exc.code}, status_code=exc.status_code)
            except DesignStateError as exc:
                response = JSONResponse({"detail": str(exc), "code": exc.code}, status_code=exc.status)
            except HTTPException as exc:
                response = JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers)
            except RequestValidationError:
                response = JSONResponse(
                    {"detail": "留档请求格式不正确，请检查编号、标签、备注和确认项"}, status_code=422
                )
            response.headers["Cache-Control"] = "no-store"
            return response

        return guarded


router = APIRouter(tags=["admin-design-baselines"], route_class=BaselineRoute)


def archive_scope(
    request: Request,
    response: Response,
    token: str = Depends(_oauth2_scheme),
    session: Session = Depends(get_plain_session),
) -> Iterator[access.AdminArchiveScope]:
    access.begin_snapshot(session, write=False)
    user = get_current_user(token=token, session=session, response=response)
    require_admin(user)
    raw_id = request.path_params.get("project_id")
    project_id = None
    if raw_id is not None:
        try:
            project_id = int(raw_id)
        except ValueError as exc:
            raise HTTPException(422, "项目编号无效") from exc
        if not 0 < project_id < 2**63:
            raise HTTPException(422, "项目编号无效")
    scope = access.AdminArchiveScope(session, user.id, user.username, get_config(), token, project_id)
    # Preflight authentication must not disclose lease state to unauthorized callers.
    # Discard its snapshot: only a fresh snapshot under the lease may read history.
    session.rollback()
    context = (
        (project_history_removal(project_id) if request.method == "DELETE" else project_history_access(project_id))
        if project_id is not None
        else nullcontext()
    )
    with context:
        try:
            access.begin_snapshot(session, write=request.method in {"POST", "DELETE"})
            scope.authorize(response=response)
            yield scope
        finally:
            if session.in_transaction():
                session.rollback()


@router.get("/admin/design-baseline-projects", response_model=ArchiveProjectList)
def projects(
    scope: access.AdminArchiveScope = Depends(archive_scope),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    return access.list_archive_projects(scope, limit, offset)


@router.get("/admin/projects/{project_id}/design-baselines/capture-context", response_model=CaptureContext)
def capture_context(response: Response, scope: access.AdminArchiveScope = Depends(archive_scope)) -> dict[str, Any]:
    result = access.capture_context(scope)
    response.headers[REVISION_HEADER] = result["source_revision"]
    return result


@router.get("/admin/projects/{project_id}/design-baselines/requests/{request_id}", response_model=CaptureResponse)
def request_status(request_id: OpaqueId, scope: access.AdminArchiveScope = Depends(archive_scope)) -> dict[str, Any]:
    return access.capture_status(scope, request_id)


@router.get("/admin/projects/{project_id}/design-baselines", response_model=BaselineList)
def list_baselines(
    scope: access.AdminArchiveScope = Depends(archive_scope),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    return access.list_baselines(scope, limit, offset)


@router.post("/admin/projects/{project_id}/design-baselines", response_model=BaselineResponse, status_code=201)
def create_baseline(
    data: BaselineCreate,
    response: Response,
    scope: access.AdminArchiveScope = Depends(archive_scope),
    if_match: str | None = Header(default=None, alias="If-Match"),
) -> dict[str, Any]:
    result, replay = service.create_baseline(scope, data, if_match)
    response.status_code = 200 if replay else 201
    return result


@router.get("/admin/projects/{project_id}/design-baselines/{baseline_id}", response_model=BaselineDetail)
def detail(baseline_id: OpaqueId, scope: access.AdminArchiveScope = Depends(archive_scope)) -> dict[str, Any]:
    return access.baseline_detail(scope, baseline_id)


@router.get("/admin/projects/{project_id}/design-baselines/{baseline_id}/originals/{kind}")
def download(
    baseline_id: OpaqueId, kind: Literal["ecrf", "acrf"], scope: access.AdminArchiveScope = Depends(archive_scope)
) -> Response:
    row = access.find_baseline(scope, baseline_id)
    artifact = scope.session.scalars(
        select(DesignBaselineArtifact).where(
            DesignBaselineArtifact.baseline_id == row.id, DesignBaselineArtifact.kind == kind
        )
    ).one_or_none()
    if artifact is None:
        raise SnapshotError("原件索引不完整，不能下载", "BASELINE_INTEGRITY_FAILED", 500)
    root = storage.history_root(scope.config)
    content = storage.read_original(root, row.storage_key, kind, artifact.sha256, artifact.byte_count)
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="baseline-{baseline_id}-{kind}.docx"',
            "X-CRF-Original-SHA256": artifact.sha256,
            "Cache-Control": "no-store",
        },
    )


@router.delete("/admin/projects/{project_id}/design-baselines/{baseline_id}", response_model=DeleteResponse)
def remove(
    baseline_id: OpaqueId, data: BaselineDelete, scope: access.AdminArchiveScope = Depends(archive_scope)
) -> dict[str, Any]:
    return service.delete_baseline(scope, baseline_id)
