import asyncio

import httpx
import pytest

from src.services import ai_review_service
from src.services.ai_review_service import test_ai_connection

test_ai_connection.__test__ = False


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
