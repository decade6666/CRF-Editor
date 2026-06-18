from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any
from unittest.mock import patch

import pytest
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as
from main import app
from src.database import attach_perf_sql_listeners, get_session
from src.perf import (
    begin_request_metrics,
    finish_request_metrics,
    is_perf_baseline_enabled,
    perf_span,
    record_counter,
    record_sql_statement,
    sanitize_sql_shape,
)
from src.models.project import Project
from src.models.user import User

router = APIRouter(tags=["perf-test"])


@router.get("/api/test/perf/ping")
def perf_ping(session: Session = Depends(get_session)):
    session.execute(text("SELECT 123, 'PERF_SECRET_TOKEN_20260425', 456")).all()
    with perf_span("db_read"):
        session.execute(text("SELECT 789")).all()
    record_counter("forms_count", 1)
    return JSONResponse({"ok": True})


@router.get("/api/test/perf/scope/{scope_id}")
def perf_scope(scope_id: int, session: Session = Depends(get_session)):
    with perf_span("db_read"):
        session.execute(text(f"SELECT {scope_id}")).all()
    record_counter("scope_size", scope_id)
    return {"scope_id": scope_id}


@pytest.fixture(autouse=True)
def _register_perf_router():
    app.include_router(router)
    yield
    app.router.routes[:] = [route for route in app.router.routes if getattr(route, "path", None) not in {"/api/test/perf/ping", "/api/test/perf/scope/{scope_id}"}]


@pytest.fixture(autouse=True)
def _attach_perf_listeners(engine) -> None:
    attach_perf_sql_listeners(engine)



def test_perf_baseline_disabled_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CRF_PERF_BASELINE", raising=False)
    assert is_perf_baseline_enabled() is False



def test_sanitize_sql_shape_redacts_literals() -> None:
    shape = sanitize_sql_shape("SELECT * FROM user WHERE username = 'alice' AND id = 123 AND score = 4.5")
    assert "alice" not in shape
    assert "123" not in shape
    assert "4.5" not in shape
    assert "?" in shape



def test_perf_request_summary_records_without_sql_parameters(client: TestClient, engine, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CRF_PERF_BASELINE", "1")
    token = login_as(client, "perf-user")
    summaries: list[dict[str, Any]] = []

    with patch("main.logging.getLogger") as get_logger:
        logger = get_logger.return_value
        logger.info.side_effect = lambda _message, summary: summaries.append(summary)
        response = client.get("/api/test/perf/ping", headers=auth_headers(token))

    assert response.status_code == 200, response.text
    assert summaries, "expected perf summary to be logged"
    summary = summaries[-1]
    assert summary["method"] == "GET"
    assert summary["route_template"] == "/api/test/perf/ping"
    assert summary["status_code"] == 200
    assert summary["sql_count"] >= 2
    assert summary["sql_total_ms"] >= 0
    assert summary["sql_max_ms"] >= 0
    assert summary["sqlite_busy_wait_ms"] >= 0
    assert summary["phase_timings_ms"]["db_read_ms"] >= 0
    assert summary["forms_count"] == 1
    assert "PERF_SECRET_TOKEN_20260425" not in str(summary)
    assert all("PERF_SECRET_TOKEN_20260425" not in item["shape"] for item in summary["sql_shapes"])



def test_perf_metrics_do_not_cross_requests(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CRF_PERF_BASELINE", "1")
    token = login_as(client, "perf-concurrency")
    summaries: list[dict[str, Any]] = []

    with patch("main.logging.getLogger") as get_logger:
        logger = get_logger.return_value
        logger.info.side_effect = lambda _message, summary: summaries.append(summary)

        def _request(scope_id: int):
            return client.get(f"/api/test/perf/scope/{scope_id}", headers=auth_headers(token))

        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(_request, [1, 2]))

    assert all(response.status_code == 200 for response in responses)
    assert len(summaries) >= 2
    seen_scope_sizes = sorted(summary.get("scope_size") for summary in summaries if summary.get("route_template") == "/api/test/perf/scope/{scope_id}")
    assert seen_scope_sizes == [1, 2]



def test_finish_request_metrics_returns_empty_without_context() -> None:
    assert finish_request_metrics(200) == {}



def test_record_sql_statement_without_context_is_safe() -> None:
    record_sql_statement("SELECT 1", 1.0)
    with perf_span("db_read"):
        pass
    begin_request_metrics("GET", "/api/test/perf/ping")
    try:
        record_sql_statement("SELECT 1", 0.5)
        summary = finish_request_metrics(200)
    finally:
        pass
    assert summary["sql_count"] == 1
