"""限流回归测试。"""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as
from src.models.project import Project
from src.models.user import User
from src.rate_limit import InMemoryRateLimiter, RateLimitRule, limiter


@pytest.fixture(autouse=True)
def reset_rate_limiter(monkeypatch: pytest.MonkeyPatch):
    limiter.reset()
    monkeypatch.delenv("CRF_ENV", raising=False)
    yield
    limiter.reset()


def test_in_memory_rate_limiter_recovers_after_window() -> None:
    local_limiter = InMemoryRateLimiter()
    rule = RateLimitRule(limit=2, window_seconds=60)

    with patch("src.rate_limit.time.time", side_effect=[0.0, 1.0, 2.0, 61.1]):
        local_limiter.check("bucket", rule)
        local_limiter.check("bucket", rule)
        with pytest.raises(Exception):
            local_limiter.check("bucket", rule)
        local_limiter.check("bucket", rule)


def test_auth_enter_rate_limit_returns_429_with_retry_after_in_production(client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CRF_ENV", "production")

    for _ in range(5):
        resp = client.post("/api/auth/enter", json={"username": "alice"})
        assert resp.status_code == 200, resp.text

    blocked = client.post("/api/auth/enter", json={"username": "alice"})
    assert blocked.status_code == 429, blocked.text
    assert blocked.json()["detail"] == "操作过于频繁，请稍后重试"
    assert int(blocked.headers["retry-after"]) >= 1


def test_auth_enter_rate_limit_is_disabled_outside_production(client) -> None:
    for _ in range(6):
        resp = client.post("/api/auth/enter", json={"username": "bob"})
        assert resp.status_code == 200, resp.text


def _fake_import_report(project_id: int = 1, project_name: str = "项目A"):
    return SimpleNamespace(imported=[SimpleNamespace(project_id=project_id, project_name=project_name)], renamed=[])


@pytest.mark.parametrize(
    ("endpoint", "patch_target"),
    [
        ("/api/projects/import/project-db", "src.routers.projects.ProjectDbImportService.import_single_project"),
        ("/api/projects/import/database-merge", "src.routers.projects.DatabaseMergeService.merge"),
        ("/api/projects/import/auto", "src.routers.projects.DatabaseMergeService.merge"),
    ],
)
def test_database_import_rate_limits_return_429_in_production(client, monkeypatch: pytest.MonkeyPatch, endpoint: str, patch_target: str) -> None:
    monkeypatch.setenv("CRF_ENV", "production")
    token = login_as(client, "alice")

    if patch_target.endswith("import_single_project"):
        monkeypatch.setattr(patch_target, lambda *_args, **_kwargs: SimpleNamespace(project_id=1, project_name="项目A"))
    else:
        monkeypatch.setattr(patch_target, lambda *_args, **_kwargs: _fake_import_report())

    payload = b"SQLite format 3\x00fake-db"
    for _ in range(3):
        resp = client.post(
            endpoint,
            files={"file": ("test.db", payload, "application/octet-stream")},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200, (endpoint, resp.text)

    blocked = client.post(
        endpoint,
        files={"file": ("test.db", payload, "application/octet-stream")},
        headers=auth_headers(token),
    )
    assert blocked.status_code == 429, (endpoint, blocked.text)
    assert blocked.json()["detail"] == "操作过于频繁，请稍后重试"
    assert int(blocked.headers["retry-after"]) >= 1


def _create_owned_project(engine) -> int:
    with Session(engine) as session:
        alice = session.scalar(select(User).where(User.username == "alice"))
        assert alice is not None
        project = Project(name="Docx 项目", version="1.0", owner_id=alice.id, order_index=1)
        session.add(project)
        session.commit()
        return project.id


@pytest.mark.parametrize(
    ("path_suffix", "prepare_patches"),
    [
        (
            "import-docx/preview",
            lambda monkeypatch: (
                monkeypatch.setattr("src.routers.import_docx.DocxImportService.save_temp_file", lambda content, filename: ("temp-1", Path("/tmp/fake.docx"))),
                monkeypatch.setattr("src.routers.import_docx.DocxImportService.parse_full", lambda _path: [{"name": "表单A", "fields": [{"label": "字段1", "field_type": "文本"}]}]),
                monkeypatch.setattr("src.routers.import_docx.DocxScreenshotService.start", lambda **_kwargs: None),
                monkeypatch.setattr("src.routers.import_docx.review_forms", _review_forms),
            ),
        ),
        (
            "import-docx/execute",
            lambda monkeypatch: (
                monkeypatch.setattr("src.routers.import_docx.DocxImportService.get_temp_path", lambda _temp_id: Path("/tmp/fake.docx")),
                monkeypatch.setattr("src.routers.import_docx.DocxImportService.cleanup_temp", lambda _temp_id: None),
                monkeypatch.setattr("src.routers.import_docx.DocxImportService.import_forms", lambda *_args, **_kwargs: {"imported_form_count": 1, "detail": [{"name": "表单A", "field_count": 1}]}),
            ),
        ),
    ],
)
def test_docx_import_rate_limits_return_429_in_production(client, engine, monkeypatch: pytest.MonkeyPatch, path_suffix: str, prepare_patches) -> None:
    monkeypatch.setenv("CRF_ENV", "production")
    token = login_as(client, "alice")
    project_id = _create_owned_project(engine)
    prepare_patches(monkeypatch)

    if path_suffix.endswith("preview"):
        for _ in range(3):
            resp = client.post(
                f"/api/projects/{project_id}/{path_suffix}",
                files={"file": ("test.docx", b"fake-docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
                headers=auth_headers(token),
            )
            assert resp.status_code == 200, resp.text

        blocked = client.post(
            f"/api/projects/{project_id}/{path_suffix}",
            files={"file": ("test.docx", b"fake-docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            headers=auth_headers(token),
        )
    else:
        payload = {"temp_id": "temp-1", "form_indices": [0]}
        for _ in range(3):
            resp = client.post(
                f"/api/projects/{project_id}/{path_suffix}",
                json=payload,
                headers=auth_headers(token),
            )
            assert resp.status_code == 200, resp.text

        blocked = client.post(
            f"/api/projects/{project_id}/{path_suffix}",
            json=payload,
            headers=auth_headers(token),
        )

    assert blocked.status_code == 429, blocked.text
    assert blocked.json()["detail"] == "操作过于频繁，请稍后重试"
    assert int(blocked.headers["retry-after"]) >= 1


async def _review_forms(_forms):
    return {}, None
