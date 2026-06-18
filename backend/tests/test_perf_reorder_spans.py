from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import APIRouter, Depends
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as
from main import app
from src.database import get_session
from src.models.form import Form
from src.models.project import Project
from src.models.user import User


@pytest.fixture
def perf_project(client: TestClient, engine) -> tuple[str, int, list[int]]:
    token = login_as(client, "reorder-user")
    with Session(engine) as session:
        owner = session.scalar(select(User).where(User.username == "reorder-user"))
        assert owner is not None
        project = Project(name="重排项目", version="1.0", owner_id=owner.id, order_index=1)
        session.add(project)
        session.flush()
        forms: list[Form] = []
        for index in range(1, 4):
            form = Form(
                project_id=project.id,
                name=f"表单{index}",
                code=f"FORM_{index}",
                order_index=index,
            )
            session.add(form)
            session.flush()
            forms.append(form)
        session.commit()
        return token, project.id, [form.id for form in forms]



def test_reorder_forms_emits_perf_phases(client: TestClient, perf_project, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CRF_PERF_BASELINE", "1")
    token, project_id, form_ids = perf_project
    summaries = []

    with patch("main.logging.getLogger") as get_logger:
        logger = get_logger.return_value
        logger.info.side_effect = lambda _message, summary: summaries.append(summary)
        response = client.post(
            f"/api/projects/{project_id}/forms/reorder",
            json=list(reversed(form_ids)),
            headers=auth_headers(token),
        )

    assert response.status_code == 200, response.text
    assert summaries
    summary = summaries[-1]
    assert summary["route_template"] == "/api/projects/{project_id}/forms/reorder"
    assert summary["scope_size"] == 3
    assert summary["phase_timings_ms"]["order_scope_load_ms"] >= 0
    assert summary["phase_timings_ms"]["order_validate_ms"] >= 0
    assert summary["phase_timings_ms"]["order_safe_offset_update_ms"] >= 0
    assert summary["phase_timings_ms"]["order_final_update_ms"] >= 0
    assert summary["phase_timings_ms"]["flush_ms"] >= 0
