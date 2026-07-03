"""AI 测试连接路由的回归测试。"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from helpers import auth_headers, login_as
from src.utils import mask_secret


def _install_fake_ai_settings(
    monkeypatch: pytest.MonkeyPatch,
    *,
    stored_api_key: str,
    captured_api_keys: list[str],
) -> None:
    from src.routers import settings as settings_router

    fake_config = SimpleNamespace(
        ai_config=SimpleNamespace(
            enabled=True,
            api_url="https://relay.example.com/v1",
            api_key=stored_api_key,
            model="gpt-5.4",
            api_format="",
            timeout=30,
        )
    )

    async def fake_test_ai_connection(api_url, api_key, model, timeout):
        captured_api_keys.append(api_key)
        return True, 10, "", "openai"

    monkeypatch.setattr(settings_router, "get_config", lambda: fake_config)
    monkeypatch.setattr(settings_router, "test_ai_connection", fake_test_ai_connection)


def test_ai_test_restores_real_key_when_masked_placeholder_sent(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = login_as(client, "admin")
    stored_api_key = "secret-key-1234"
    captured_api_keys: list[str] = []
    _install_fake_ai_settings(
        monkeypatch,
        stored_api_key=stored_api_key,
        captured_api_keys=captured_api_keys,
    )

    resp = client.post(
        "/api/settings/ai/test",
        headers=auth_headers(token),
        json={
            "ai_api_key": mask_secret(stored_api_key),
            "ai_api_url": "https://relay.example.com/v1",
            "ai_model": "gpt-5.4",
        },
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["ok"] is True
    assert captured_api_keys == [stored_api_key]


def test_ai_test_uses_new_key_when_user_types_one(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = login_as(client, "admin")
    stored_api_key = "secret-key-1234"
    new_api_key = "brand-new-key-9999"
    captured_api_keys: list[str] = []
    _install_fake_ai_settings(
        monkeypatch,
        stored_api_key=stored_api_key,
        captured_api_keys=captured_api_keys,
    )

    resp = client.post(
        "/api/settings/ai/test",
        headers=auth_headers(token),
        json={
            "ai_api_key": new_api_key,
            "ai_api_url": "https://relay.example.com/v1",
            "ai_model": "gpt-5.4",
        },
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["ok"] is True
    assert captured_api_keys == [new_api_key]
