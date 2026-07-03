import asyncio
import json
import time
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy.orm import Session
from starlette.requests import Request

from src.models.project import Project
from src.models.user import User
from src.routers import import_docx
from src.services import ai_review_service
from src.services.ai_review_service import AIReviewTask, get_ai_task, remove_ai_task, start_ai_review, test_ai_connection

test_ai_connection.__test__ = False


@pytest.fixture(autouse=True)
def cleanup_ai_review_tasks():
    for temp_id in list(ai_review_service._ai_tasks.keys()):
        remove_ai_task(temp_id)
    yield
    for temp_id in list(ai_review_service._ai_tasks.keys()):
        remove_ai_task(temp_id)


def _create_owned_project(engine) -> tuple[int, int]:
    with Session(engine) as session:
        alice = User(username="alice")
        session.add(alice)
        session.flush()
        project = Project(name="AI Review 项目", version="1.0", owner_id=alice.id, order_index=1)
        session.add(project)
        session.commit()
        return alice.id, project.id


def _mock_ai_config():
    return SimpleNamespace(
        ai_config=SimpleNamespace(
            enabled=True,
            api_url="https://relay.example.com",
            api_key="sk-test",
            model="gpt-5.4",
            timeout=5,
            api_format="openai",
            max_concurrency=5,
        )
    )


def test_test_ai_connection_follows_307_redirect_openai(monkeypatch: pytest.MonkeyPatch) -> None:
    real_async_client = ai_review_service.httpx.AsyncClient

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/chat/completions") and "/v1/" not in path:
            return httpx.Response(
                307,
                headers={"Location": "https://relay.example.com/v1/chat/completions"},
                request=request,
            )
        if "/v1/" in path and path.endswith("/chat/completions"):
            return httpx.Response(
                200,
                json={"choices": [{"message": {"content": "ok"}}]},
                request=request,
            )
        raise AssertionError(f"unexpected request path: {path}")

    def patched_async_client(*args, **kwargs):
        kwargs.setdefault("transport", httpx.MockTransport(handler))
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(ai_review_service.httpx, "AsyncClient", patched_async_client)

    ok, _latency_ms, _error, detected_format = asyncio.run(
        test_ai_connection(
            api_url="https://relay.example.com",
            api_key="sk-test",
            model="gpt-5.4",
        )
    )

    assert ok is True
    assert detected_format == "openai"


def test_test_ai_connection_follows_307_redirect_anthropic(monkeypatch: pytest.MonkeyPatch) -> None:
    real_async_client = ai_review_service.httpx.AsyncClient

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/chat/completions"):
            return httpx.Response(401, request=request)
        if path.endswith("/messages") and "/v1/" not in path:
            return httpx.Response(
                307,
                headers={"Location": "https://relay.example.com/v1/messages"},
                request=request,
            )
        if path.endswith("/v1/messages"):
            return httpx.Response(
                200,
                json={"content": [{"text": "ok"}]},
                request=request,
            )
        raise AssertionError(f"unexpected request path: {path}")

    def patched_async_client(*args, **kwargs):
        kwargs.setdefault("transport", httpx.MockTransport(handler))
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(ai_review_service.httpx, "AsyncClient", patched_async_client)

    ok, _latency_ms, _error, detected_format = asyncio.run(
        test_ai_connection(
            api_url="https://relay.example.com",
            api_key="sk-test",
            model="gpt-5.4",
        )
    )

    assert ok is True
    assert detected_format == "anthropic"


def test_local_client_uses_follow_redirects_true(monkeypatch: pytest.MonkeyPatch) -> None:
    real_async_client = ai_review_service.httpx.AsyncClient
    follow_redirects_values: list[bool | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "ok"}}]},
            request=request,
        )

    def patched_async_client(*args, **kwargs):
        follow_redirects_values.append(kwargs.get("follow_redirects"))
        kwargs.setdefault("transport", httpx.MockTransport(handler))
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(ai_review_service.httpx, "AsyncClient", patched_async_client)

    ok, _latency_ms, _error, detected_format = asyncio.run(
        test_ai_connection(
            api_url="https://relay.example.com",
            api_key="sk-test",
            model="gpt-5.4",
        )
    )

    assert ok is True
    assert detected_format == "openai"
    assert follow_redirects_values == [True]


def test_start_ai_review_creates_background_task(monkeypatch: pytest.MonkeyPatch) -> None:
    forms = [
        {"name": "表单A", "fields": [{"label": "性别", "field_type": "文本"}]},
        {"name": "表单B", "fields": [{"label": "备注", "field_type": "文本"}]},
    ]
    release = asyncio.Event()
    started = asyncio.Event()

    async def fake_call_llm(_api_url, _api_key, _model, user_prompt, _timeout, **_kwargs):
        started.set()
        if "表单名称：表单A" in user_prompt:
            await release.wait()
            return json.dumps([
                {"index": 0, "ok": False, "suggested_type": "单选", "reason": "存在互斥选项"},
            ])
        return "[]"

    async def scenario() -> None:
        monkeypatch.setattr(ai_review_service, "get_config", _mock_ai_config)
        monkeypatch.setattr(ai_review_service, "_call_llm", fake_call_llm)
        task = await start_ai_review("temp-async", forms)
        assert task is not None
        current = get_ai_task("temp-async")
        assert current is not None
        assert current.total == 2
        await asyncio.wait_for(started.wait(), timeout=1)
        assert current.status in {"pending", "running"}
        release.set()
        for _ in range(100):
            if current.status == "done":
                break
            await asyncio.sleep(0)
        assert current.status == "done"
        assert current.completed == 2
        assert current.suggestions == {
            0: [{"index": 0, "ok": False, "suggested_type": "单选", "reason": "存在互斥选项"}],
        }

    asyncio.run(scenario())


def test_ai_review_status_endpoint_returns_progressive_results(engine) -> None:
    user_id, project_id = _create_owned_project(engine)
    temp_id = "progressive-ai-status"
    ai_review_service._ai_tasks[temp_id] = AIReviewTask(
        status="running",
        total=3,
        completed=1,
        suggestions={
            0: [{"index": 0, "suggested_type": "单选", "reason": "存在互斥选项"}],
        },
        created_at=time.time(),
    )

    with Session(engine) as session:
        current_user = session.get(User, user_id)
        assert current_user is not None
        response = asyncio.run(
            import_docx.get_ai_review_status(
                project_id=project_id,
                temp_id=temp_id,
                session=session,
                current_user=current_user,
            )
        )

    assert response.status == "running"
    assert response.progress == {"completed": 1, "total": 3}
    assert response.suggestions[0][0].suggested_type == "单选"
    assert response.suggestions[0][0].reason == "存在互斥选项"
    assert response.error is None


def test_ai_review_cleanup_with_temp_cleanup(engine, monkeypatch: pytest.MonkeyPatch) -> None:
    user_id, project_id = _create_owned_project(engine)
    temp_id = "cleanup-ai-review"
    cleanup_calls: list[tuple[str, str]] = []
    ai_review_service._ai_tasks[temp_id] = AIReviewTask(
        status="done",
        total=1,
        completed=1,
        created_at=time.time(),
    )

    monkeypatch.setattr(
        "src.routers.import_docx.DocxImportService.get_temp_path",
        lambda _temp_id: Path("/tmp/fake.docx"),
    )
    monkeypatch.setattr(
        "src.routers.import_docx.DocxImportService.cleanup_temp",
        lambda _temp_id: cleanup_calls.append(("temp", _temp_id)),
    )
    monkeypatch.setattr(
        "src.routers.import_docx.DocxScreenshotService.cleanup",
        lambda _temp_id: cleanup_calls.append(("screenshot", _temp_id)),
    )
    monkeypatch.setattr(
        "src.routers.import_docx.DocxImportService.import_forms",
        lambda *_args, **_kwargs: {
            "imported_form_count": 1,
            "detail": [{"name": "表单A", "field_count": 1, "form_id": 101}],
        },
    )
    monkeypatch.setattr("src.routers.import_docx.limit_import_action", lambda *_args, **_kwargs: None)

    with Session(engine) as session:
        current_user = session.get(User, user_id)
        assert current_user is not None
        request = Request({"type": "http", "method": "POST", "path": f"/api/projects/{project_id}/import-docx/execute"})
        response = import_docx.execute_docx_import(
            project_id=project_id,
            request=request,
            payload=import_docx.DocxExecuteRequest(temp_id=temp_id, form_indices=[0]),
            session=session,
            current_user=current_user,
        )

    assert response.imported_form_count == 1
    assert ("temp", temp_id) in cleanup_calls
    assert ("screenshot", temp_id) in cleanup_calls
    assert get_ai_task(temp_id) is None
