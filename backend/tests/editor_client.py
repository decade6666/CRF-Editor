"""Controlled editor actor for existing business tests, not a server bypass.

The first use of each (browser principal, project) deliberately captures a seeded
fixture state. ONLY this actor's acknowledged writes advance it. External/Agent
writes and failed attempts never silently refresh the precondition. C4 protocol,
missing-header and concurrency tests use raw_client instead. No per-write GET or
retry occurs. This keeps older business tests focused on their original guards
while every request still passes the real server precondition/transaction code.
"""

from __future__ import annotations

import re
from typing import Any

from httpx import Headers, Response
from sqlalchemy.orm import Session

from helpers import _override_session
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.unit import Unit
from src.models.visit import Visit
from src.services.design_revision_service import REVISION_HEADER, read_design_revision


class EditorClient:
    def __init__(self, raw_client: Any) -> None:
        self.raw = raw_client
        self.revisions: dict[tuple[str, int], str] = {}

    def __getattr__(self, name: str) -> Any:
        return getattr(self.raw, name)

    def _project_id(self, session: Session, path: str, response: Response | None = None) -> int | None:
        match = re.match(r"/api/(projects|forms|form-fields|field-definitions|units|visits)/(\d+)(?:/|$)", path)
        if match:
            kind, value = match.groups()
            model = {
                "projects": Project,
                "forms": Form,
                "form-fields": FormField,
                "field-definitions": FieldDefinition,
                "units": Unit,
                "visits": Visit,
            }[kind]
            row = session.get(model, int(value))
            if row is None:
                return None
            if kind == "projects":
                return row.id
            if kind == "form-fields":
                return session.get(Form, row.form_id).project_id
            return row.project_id
        if path == "/api/projects" and response is not None and response.status_code in (200, 201):
            data = response.json()
            return data.get("id") if isinstance(data, dict) else None
        return None

    def request(self, method: str, url: Any, **kwargs: Any) -> Response:
        method, path = method.upper(), str(url).split("?", 1)[0]
        if path != "/api/projects" and not re.match(
            r"/api/(projects|forms|form-fields|field-definitions|units|visits)/\d+(?:/|$)", path
        ):
            return self.raw.request(method, url, **kwargs)
        headers = Headers(self.raw.headers)
        headers.update(kwargs.get("headers") or {})
        principal = headers.get("Authorization", "")
        is_write = method not in {"GET", "HEAD", "OPTIONS"} and not path.endswith(("/references", "/batch-references"))
        project_id = None
        with _override_session(self.raw) as session:
            if session is not None:
                project_id = self._project_id(session, path)
                if project_id is not None:
                    key = (principal, project_id)
                    if key not in self.revisions:
                        self.revisions[key] = read_design_revision(session, project_id)
                    if is_write and "If-Match" not in headers:
                        headers["If-Match"] = self.revisions[key]
        kwargs["headers"] = headers
        response = self.raw.request(method, url, **kwargs)
        if (
            response.status_code == 409
            and not path.startswith("/api/agent/")
            and response.json().get("code") == "STALE_STATE"
        ):
            raise AssertionError(
                "业务测试夹具状态已过期：外部种子写入后须显式 client.reload_design(project_id, headers=...)"
            )
        if is_write and response.is_success:
            with _override_session(self.raw) as session:
                if session is not None:
                    project_id = self._project_id(session, path, response) or project_id
                    if project_id is not None and session.get(Project, project_id) is not None:
                        revision = response.headers.get(REVISION_HEADER) or read_design_revision(session, project_id)
                        self.revisions[(principal, project_id)] = revision
        return response

    def reload_design(self, project_id: int, headers: Any = None) -> Response:
        """An explicit editor reload after test-only external seeding, never a retry."""
        auth = Headers(self.raw.headers)
        auth.update(headers or {})
        response = self.raw.get(f"/api/projects/{project_id}/forms", headers=auth)
        assert response.status_code == 200, response.text
        self.revisions[(auth.get("Authorization", ""), project_id)] = response.headers[REVISION_HEADER]
        return response

    def get(self, url: Any, **kwargs: Any) -> Response:
        return self.request("GET", url, **kwargs)

    def post(self, url: Any, **kwargs: Any) -> Response:
        return self.request("POST", url, **kwargs)

    def put(self, url: Any, **kwargs: Any) -> Response:
        return self.request("PUT", url, **kwargs)

    def patch(self, url: Any, **kwargs: Any) -> Response:
        return self.request("PATCH", url, **kwargs)

    def delete(self, url: Any, **kwargs: Any) -> Response:
        return self.request("DELETE", url, **kwargs)
