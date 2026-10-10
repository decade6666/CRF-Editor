"""异步端点重活线程池契约测试（design.md D4 / AC3）。

锁定机制本身：六个端点的重活必须经 ``fastapi.concurrency.run_in_threadpool``
执行。spy 装在路由模块命名空间上并委托真身——端点若内联执行（RED 现状）或
改用被禁止的 ``asyncio.to_thread``，spy 都不会命中。
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.concurrency import run_in_threadpool as _real_run_in_threadpool

from helpers import auth_headers, login_as, seed_user
from src.services.await_drain import await_with_drain as _real_await_with_drain
from src.services.docx_import_service import DocxImportService
from src.services.docx_screenshot_service import DocxScreenshotService

_PROJECT_CASES = ("project-db", "database-merge", "auto")
_ALL_CASES = (*_PROJECT_CASES, "docx-preview", "docx-screenshots-start", "cleanup-screenshots")

_MAGIC_STUB = b"SQLite format 3\x00stub"


def _install_spy(monkeypatch, namespace: str) -> list:
    calls: list = []

    async def _spy(fn, *args, **kwargs):
        calls.append(fn)
        return await _real_run_in_threadpool(fn, *args, **kwargs)

    monkeypatch.setattr(f"{namespace}.run_in_threadpool", _spy, raising=False)
    return calls


def _install_drain_spy(monkeypatch) -> list:
    calls: list = []

    async def _spy(awaitable):
        calls.append(awaitable)
        return await _real_await_with_drain(awaitable)

    monkeypatch.setattr("src.routers.projects.await_with_drain", _spy)
    return calls


def _create_project(client, token: str, name: str) -> int:
    resp = client.post("/api/projects", json={"name": name, "version": "1.0"}, headers=auth_headers(token))
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


def _fake_import_report() -> SimpleNamespace:
    return SimpleNamespace(imported=[SimpleNamespace(project_id=1, project_name="项目A")], renamed=[])


def _prepare_project_db(client, monkeypatch):
    def _fake_import(*_args, **_kwargs):
        return SimpleNamespace(project_id=1, project_name="项目A")

    monkeypatch.setattr("src.routers.projects.ProjectDbImportService.import_single_project", _fake_import)
    token = login_as(client, "alice")

    def invoke():
        return client.post(
            "/api/projects/import/project-db",
            files={"file": ("test.db", _MAGIC_STUB, "application/octet-stream")},
            headers=auth_headers(token),
        )

    def passthrough(resp):
        assert resp.json() == {"project_id": 1, "project_name": "项目A"}, resp.text

    return [_fake_import], invoke, passthrough


def _prepare_database_merge(client, monkeypatch):
    def _fake_merge(*_args, **_kwargs):
        return _fake_import_report()

    monkeypatch.setattr("src.routers.projects.DatabaseMergeService.merge", _fake_merge)
    token = login_as(client, "alice")

    def invoke():
        return client.post(
            "/api/projects/import/database-merge",
            files={"file": ("test.db", _MAGIC_STUB, "application/octet-stream")},
            headers=auth_headers(token),
        )

    def passthrough(resp):
        assert resp.json() == {"imported": [{"id": 1, "name": "项目A"}], "renamed": []}, resp.text

    return [_fake_merge], invoke, passthrough


def _prepare_auto(client, monkeypatch):
    def _fake_merge(*_args, **_kwargs):
        return _fake_import_report()

    monkeypatch.setattr("src.routers.projects.DatabaseMergeService.merge", _fake_merge)
    token = login_as(client, "alice")

    def invoke():
        return client.post(
            "/api/projects/import/auto",
            files={"file": ("test.db", _MAGIC_STUB, "application/octet-stream")},
            headers=auth_headers(token),
        )

    def passthrough(resp):
        assert resp.json() == {
            "imported": [{"id": 1, "name": "项目A"}],
            "renamed": [],
            "count": 1,
        }, resp.text

    return [_fake_merge], invoke, passthrough


def _patch_docx_heavy_fns(monkeypatch) -> list:
    def _fake_parse_full(_path, **_kw):
        return [{"name": "表单A", "fields": [{"label": "字段1", "field_type": "文本"}]}]

    async def _fake_start_ai_review(*_args, **_kwargs):
        return None

    def _fake_start(*_args, **_kwargs):
        return SimpleNamespace(status="running")

    monkeypatch.setattr("src.routers.import_docx.DocxImportService.parse_full", _fake_parse_full)
    monkeypatch.setattr("src.routers.import_docx.start_ai_review", _fake_start_ai_review)
    monkeypatch.setattr("src.routers.import_docx.DocxScreenshotService.start", _fake_start)
    return [_fake_parse_full, _fake_start]


def _prepare_docx_preview(client, monkeypatch):
    expected = _patch_docx_heavy_fns(monkeypatch)

    # 预览的上传落盘经 stream_upload_to_file；打桩绕开磁盘写入，本用例只看重活线程池归属。
    async def _fake_stream(reader, dest_path, **_kwargs):
        return 0

    monkeypatch.setattr("src.routers.import_docx.stream_upload_to_file", _fake_stream, raising=False)
    token = login_as(client, "alice")
    project_id = _create_project(client, token, "预览项目")

    def invoke():
        return client.post(
            f"/api/projects/{project_id}/import-docx/preview",
            files={"file": ("样本.docx", b"PK\x03\x04 placeholder docx", "application/octet-stream")},
            headers=auth_headers(token),
        )

    def passthrough(resp):
        body = resp.json()
        assert re.fullmatch(r"[0-9a-f]{32}", body["temp_id"]), body
        assert body["forms"], body

    return expected, invoke, passthrough


def _prepare_docx_screenshots_start(client, monkeypatch):
    expected = _patch_docx_heavy_fns(monkeypatch)
    token = login_as(client, "alice")
    user_id = seed_user(client, "alice")
    project_id = _create_project(client, token, "截图项目")
    temp_id = uuid.uuid4().hex
    temp_dir = Path(DocxImportService.TEMP_DIR)
    temp_dir.mkdir(parents=True, exist_ok=True)
    (temp_dir / f"{temp_id}_u{user_id}_p{project_id}_样本.docx").write_bytes(b"PK\x03\x04 placeholder docx")

    def invoke():
        return client.post(
            f"/api/projects/{project_id}/import-docx/{temp_id}/screenshots/start",
            json={"form_names": ["表单A"]},
            headers=auth_headers(token),
        )

    def passthrough(resp):
        assert resp.json() == {"status": "running"}, resp.text

    return expected, invoke, passthrough


def _prepare_cleanup_screenshots(client, monkeypatch):
    token = login_as(client, "admin")

    def invoke():
        return client.post("/api/admin/cleanup-screenshots?days=7", headers=auth_headers(token))

    def passthrough(resp):
        assert set(resp.json()) == {"deleted_count", "freed_bytes", "freed_mb"}, resp.text

    return [DocxScreenshotService.cleanup_old_caches], invoke, passthrough


_PREPARE = {
    "project-db": _prepare_project_db,
    "database-merge": _prepare_database_merge,
    "auto": _prepare_auto,
    "docx-preview": _prepare_docx_preview,
    "docx-screenshots-start": _prepare_docx_screenshots_start,
    "cleanup-screenshots": _prepare_cleanup_screenshots,
}


@pytest.mark.parametrize("case", _ALL_CASES)
def test_heavy_service_calls_run_in_threadpool(client, monkeypatch, case):
    namespace = "src.routers.projects" if case in _PROJECT_CASES else "src.routers.import_docx"
    calls = _install_spy(monkeypatch, namespace)
    drain_calls = _install_drain_spy(monkeypatch) if case in _PROJECT_CASES else []
    expected, invoke, passthrough = _PREPARE[case](client, monkeypatch)

    response = invoke()

    assert response.status_code == 200, response.text
    passthrough(response)
    for fn in expected:
        assert fn in calls, (
            f"端点 {case} 的重活必须经 fastapi.concurrency.run_in_threadpool 执行"
            "（内联执行或 asyncio.to_thread 都无法命中 spy，后者违反 design.md D4）"
        )
    if case in _PROJECT_CASES:
        assert len(drain_calls) == 1, f"端点 {case} 必须在会话承载的线程池调用外使用 await_with_drain"
