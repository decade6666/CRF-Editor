"""Scoped browser revision boundary; unrelated management/Agent routes unchanged."""

from __future__ import annotations

from collections.abc import Callable, Coroutine, Iterator
from typing import Any

from fastapi import Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy.orm import Session

from src.database import get_session
from src.dependencies import (
    get_current_user,
    verify_field_definition_owner,
    verify_form_field_owner,
    verify_form_owner,
    verify_project_owner,
)
from src.models.form import Form
from src.models.project import Project
from src.models.user import User
from src.services.design_revision_service import (
    REVISION_HEADER,
    DesignStateError,
    assert_design_revision,
    read_design_revision,
)

CORE_MUTATIONS = frozenset(
    {
        ("POST", "/projects/{project_id}/forms"),
        ("PUT", "/forms/{form_id}"),
        ("PATCH", "/forms/{form_id}"),
        ("DELETE", "/forms/{form_id}"),
        ("POST", "/projects/{project_id}/forms/batch-delete"),
        ("POST", "/projects/{project_id}/forms/reorder"),
        ("POST", "/projects/{project_id}/field-definitions"),
        ("PUT", "/projects/{project_id}/field-definitions/{fd_id}"),
        ("DELETE", "/field-definitions/{fd_id}"),
        ("POST", "/projects/{project_id}/field-definitions/batch-delete"),
        ("POST", "/projects/{project_id}/field-definitions/reorder"),
        ("POST", "/field-definitions/{fd_id}/copy"),
        ("POST", "/forms/{form_id}/fields"),
        ("POST", "/forms/{form_id}/field-profile"),
        ("PUT", "/form-fields/{ff_id}/binding-profile"),
        ("DELETE", "/form-fields/{ff_id}"),
        ("POST", "/forms/{form_id}/fields/reorder"),
        ("POST", "/forms/{form_id}/fields/restore-batch"),
        ("POST", "/forms/{form_id}/fields/batch-delete"),
    }
)
COHERENT_READS = frozenset(
    {
        ("GET", "/projects/{project_id}/forms"),
        ("GET", "/forms/{form_id}/references"),
        ("POST", "/projects/{project_id}/forms/batch-references"),
        ("GET", "/projects/{project_id}/field-definitions"),
        ("GET", "/field-definitions/{fd_id}/references"),
        ("POST", "/projects/{project_id}/field-definitions/batch-references"),
        ("GET", "/forms/{form_id}/fields"),
        ("GET", "/projects/{project_id}/codelists"),
        ("GET", "/projects/{project_id}/units"),
    }
)
INVALIDATION_METADATA = frozenset({("POST", "/forms/{form_id}/copy")})


def get_design_session(request: Request, session: Session = Depends(get_session)) -> Iterator[Session]:
    """The existing request Session owns the real transaction and final commit.

    This dependency is resolved BEFORE get_current_user's first user SELECT.
    No second connection/Session or nested writer is opened. Serialization and
    the revision read finish before the existing owner commits; the outer route
    adds the staged tag only after dependency teardown/commit succeeded.
    """
    conn = session.connection()
    if conn.connection.driver_connection.in_transaction:
        raise RuntimeError("设计事务必须在鉴权和数据读取前启动")
    statement = "BEGIN" if request.state.design_read else "BEGIN IMMEDIATE"
    conn.exec_driver_sql(statement)
    yield session
    session.flush()
    request.state.design_committed_revision = read_design_revision(session, request.state.design_project_id)


def _project_for_request(request: Request, user: User, session: Session) -> Project:
    params = request.path_params
    try:
        if "project_id" in params:
            project_id = int(params["project_id"])
        elif "form_id" in params:
            project_id = verify_form_owner(int(params["form_id"]), user, session).project_id
        elif "fd_id" in params:
            project_id = verify_field_definition_owner(int(params["fd_id"]), user, session).project_id
        else:
            field = verify_form_field_owner(int(params["ff_id"]), user, session)
            project_id = session.get(Form, field.form_id).project_id
    except ValueError as exc:
        raise HTTPException(422, "资源编号必须为整数") from exc
    return verify_project_owner(project_id, user, session)


def design_scope(
    request: Request,
    session: Session = Depends(get_design_session),
    user: User = Depends(get_current_user),
) -> None:
    project = _project_for_request(request, user, session)
    request.state.design_project_id = project.id
    if request.state.design_gated:
        if project.deleted_at is not None:
            raise HTTPException(404, "项目不存在")
        assert_design_revision(session, project.id, request.headers.get("If-Match"))


class DesignRoute(APIRoute):
    """Explicit allowlists, not verb-based gating or a global route rewrite."""

    def __init__(self, path: str, endpoint: Any, **kwargs: Any) -> None:
        normalized = path.removeprefix("/api")
        methods = kwargs.get("methods") or {"GET"}
        covered = any(
            (method, normalized) in CORE_MUTATIONS | COHERENT_READS | INVALIDATION_METADATA for method in methods
        )
        if covered:
            dependencies = list(kwargs.get("dependencies") or [])
            if not any(dependency.dependency is design_scope for dependency in dependencies):
                dependencies.append(Depends(design_scope))
            kwargs["dependencies"] = dependencies
        super().__init__(path, endpoint, **kwargs)

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        original = super().get_route_handler()
        path = self.path.removeprefix("/api")

        async def guarded(request: Request) -> Response:
            key = (request.method, path)
            if key not in CORE_MUTATIONS | COHERENT_READS | INVALIDATION_METADATA:
                return await original(request)
            request.state.design_read = key in COHERENT_READS
            request.state.design_gated = key in CORE_MUTATIONS
            try:
                response = await original(request)
            except DesignStateError as exc:
                return JSONResponse(
                    status_code=exc.status,
                    content={"detail": str(exc), "code": exc.code},
                    headers={"Cache-Control": "no-store"},
                )
            revision = getattr(request.state, "design_committed_revision", None)
            if response.status_code < 400 and revision is not None:
                response.headers[REVISION_HEADER] = revision
                response.headers["Cache-Control"] = "no-store"
            return response

        return guarded
