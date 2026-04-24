"""应用构造与安全响应头回归测试。"""

import os
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import main as main_module
from src.config import AppConfig, AuthConfig, StorageConfig


def _make_config(tmp_path: Path, secret_key: str = "yaml-secret") -> AppConfig:
    return AppConfig(
        auth=AuthConfig(secret_key=secret_key),
        storage=StorageConfig(upload_path=str(tmp_path / "uploads")),
    )


def test_validate_app_config_requires_env_secret_in_production(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("CRF_ENV", "production")
    monkeypatch.delenv("CRF_AUTH_SECRET_KEY", raising=False)
    monkeypatch.setattr(main_module, "get_config", lambda: _make_config(tmp_path, secret_key="yaml-secret"))

    with pytest.raises(RuntimeError, match="CRF_AUTH_SECRET_KEY"):
        main_module._validate_app_config()



def test_build_fastapi_kwargs_disables_docs_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CRF_ENV", "production")

    kwargs = main_module._build_fastapi_kwargs()

    assert kwargs == {"docs_url": None, "redoc_url": None, "openapi_url": None}



def test_security_headers_are_added_to_success_error_and_static_responses(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    assets_dir = tmp_path / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    (assets_dir / "app.js").write_text("console.log('ok')", encoding="utf-8")

    monkeypatch.delenv("CRF_ENV", raising=False)
    monkeypatch.setattr(main_module, "get_config", lambda: _make_config(tmp_path))
    monkeypatch.setattr(main_module, "init_db", lambda: None)
    monkeypatch.setattr(main_module, "_assets_dir", assets_dir)

    with TestClient(main_module.app, raise_server_exceptions=False) as client:
        ok_resp = client.get("/favicon.ico")
        unauthorized_resp = client.get("/api/projects")
        static_resp = client.get("/assets/app.js")

        @main_module.app.get("/__test-500")
        def _raise_runtime_error():
            raise RuntimeError("boom")

        error_resp = client.get("/__test-500")
        main_module.app.router.routes.pop()

    for response in (ok_resp, unauthorized_resp, static_resp, error_resp):
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-frame-options"] == "DENY"
        assert response.headers["referrer-policy"] == "no-referrer"
        assert "frame-ancestors 'none'" in response.headers["content-security-policy"]

    assert error_resp.status_code == 500
    assert error_resp.json()["detail"] == "内部服务器错误"
    assert static_resp.status_code == 200
    assert static_resp.text == "console.log('ok')"
    assert static_resp.headers["cache-control"] == "no-cache, must-revalidate"
