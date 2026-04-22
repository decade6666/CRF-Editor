import random
import re
from contextlib import contextmanager
from datetime import datetime
from unittest.mock import patch

from fastapi.testclient import TestClient
import main as main_module
import pytest
import src.utils as utils
from src.config import AppConfig, AuthConfig, StorageConfig
from src.utils import generate_code, is_safe_path


def test_generate_code_uses_six_char_alnum_suffix() -> None:
    code = generate_code("CL")
    assert re.fullmatch(r"CL_\d{14}_[A-Z0-9]{6}", code)


def test_generate_code_stays_unique_within_fixed_second_batch() -> None:
    """同秒批量生成10000个code，验证无碰撞（回归测试：原3位后缀约1%碰撞率）"""
    state = random.getstate()
    random.seed(0)
    try:
        frozen_now = datetime(2026, 3, 16, 12, 0, 0)
        with patch.object(utils, "datetime") as mock_datetime:
            mock_datetime.now.return_value = frozen_now
            codes = {generate_code("CL") for _ in range(10000)}
    finally:
        random.setstate(state)

    assert len(codes) == 10000


def test_is_safe_path_accepts_resolved_candidate_inside_allowlist(tmp_path) -> None:
    allowed_root = tmp_path / "assets"
    allowed_root.mkdir()
    candidate = (allowed_root / "nested" / ".." / "app.js").resolve()

    safe, err = is_safe_path(str(candidate), allowed_dirs=[str(allowed_root)])

    assert safe is True
    assert err == ""


def test_is_safe_path_rejects_resolved_candidate_outside_allowlist(tmp_path) -> None:
    allowed_root = tmp_path / "assets"
    allowed_root.mkdir()
    outside_file = tmp_path / "secret.txt"
    outside_file.write_text("TOP-SECRET", encoding="utf-8")

    safe, err = is_safe_path(str(outside_file), allowed_dirs=[str(allowed_root)])

    assert safe is False
    assert "路径必须在允许的目录内" in err


def test_is_safe_path_without_allowlist_keeps_basic_traversal_rejection() -> None:
    safe, err = is_safe_path("../../secret.txt")

    assert safe is False
    assert err == "路径不能包含 .."


@contextmanager
def _asset_client(tmp_path, monkeypatch: pytest.MonkeyPatch):
    assets_dir = tmp_path / "assets"
    assets_dir.mkdir()
    uploads_dir = tmp_path / "uploads"
    test_config = AppConfig(
        auth=AuthConfig(secret_key="test-secret-key-for-testing"),
        storage=StorageConfig(upload_path=str(uploads_dir)),
    )

    monkeypatch.setattr(main_module, "_assets_dir", assets_dir)
    monkeypatch.setattr(main_module, "get_config", lambda: test_config)
    monkeypatch.setattr(main_module, "init_db", lambda: None)

    with TestClient(main_module.app, raise_server_exceptions=False) as client:
        yield client, assets_dir


@pytest.mark.parametrize(
    "filepath",
    [
        "..\\..\\secret.txt",
        "%2e%2e/%2e%2e/secret.txt",
        "%252e%252e/%252e%252e/secret.txt",
        r"..\..\secret.txt",
        "C:/Windows/win.ini",
        "//etc/passwd",
    ],
)
def test_serve_asset_rejects_traversal_payloads(tmp_path, monkeypatch: pytest.MonkeyPatch, filepath: str) -> None:
    secret_file = tmp_path / "secret.txt"
    secret_file.write_text("TOP-SECRET", encoding="utf-8")

    with _asset_client(tmp_path, monkeypatch) as (client, _):
        response = client.get(f"/assets/{filepath}")

    assert response.status_code != 200
    assert b"TOP-SECRET" not in response.content


def test_serve_asset_rejects_symlink_escape(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    secret_file = tmp_path / "secret.txt"
    secret_file.write_text("TOP-SECRET", encoding="utf-8")

    with _asset_client(tmp_path, monkeypatch) as (client, assets_dir):
        symlink_path = assets_dir / "link.js"
        symlink_path.symlink_to(secret_file)
        response = client.get("/assets/link.js")

    assert response.status_code == 400
    assert b"TOP-SECRET" not in response.content


def test_serve_asset_allows_in_tree_asset(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    with _asset_client(tmp_path, monkeypatch) as (client, assets_dir):
        asset_file = assets_dir / "app.js"
        asset_file.write_text("console.log('ok')", encoding="utf-8")
        response = client.get("/assets/app.js")

    assert response.status_code == 200
    assert response.text == "console.log('ok')"
    assert response.headers["cache-control"] == "no-cache, must-revalidate"
