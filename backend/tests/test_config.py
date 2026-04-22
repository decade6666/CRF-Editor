"""配置加载回归测试。"""

from pathlib import Path

import pytest

from src.config import AuthConfig, ServerConfig, get_runtime_env, load_config, update_config


def test_yaml_server_port_overrides_model_default(tmp_path: Path) -> None:
    config_file = tmp_path / "config.yaml"
    config_file.write_text(
        "server:\n"
        "  host: 127.0.0.1\n"
        "  port: 9999\n",
        encoding="utf-8",
    )

    config = load_config(config_file)

    assert ServerConfig().port == 8888
    assert config.server.port == 9999


def test_missing_server_port_falls_back_to_server_default(tmp_path: Path) -> None:
    config_file = tmp_path / "config.yaml"
    config_file.write_text(
        "server:\n"
        "  host: 127.0.0.1\n",
        encoding="utf-8",
    )

    config = load_config(config_file)

    assert config.server.port == ServerConfig().port == 8888


def test_yaml_auth_expire_minutes_overrides_model_default(tmp_path: Path) -> None:
    config_file = tmp_path / "config.yaml"
    config_file.write_text(
        "auth:\n"
        "  secret_key: test-secret-key-for-config\n"
        "  access_token_expire_minutes: 60\n",
        encoding="utf-8",
    )

    config = load_config(config_file)

    assert AuthConfig().access_token_expire_minutes == 30
    assert config.auth.access_token_expire_minutes == 60


def test_missing_auth_expire_minutes_falls_back_to_auth_default(tmp_path: Path) -> None:
    config_file = tmp_path / "config.yaml"
    config_file.write_text(
        "auth:\n"
        "  secret_key: test-secret-key-for-config\n",
        encoding="utf-8",
    )

    config = load_config(config_file)

    assert config.auth.secret_key == "test-secret-key-for-config"
    assert config.auth.access_token_expire_minutes == AuthConfig().access_token_expire_minutes
    assert config.auth.access_token_expire_minutes == 30



def test_load_config_applies_explicit_crf_env_overrides(tmp_path: Path, monkeypatch) -> None:
    config_file = tmp_path / "config.yaml"
    config_file.write_text(
        "server:\n"
        "  host: 127.0.0.1\n"
        "  port: 9999\n"
        "template:\n"
        "  template_path: ./yaml-template.db\n"
        "auth:\n"
        "  secret_key: yaml-secret\n"
        "  access_token_expire_minutes: 30\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("CRF_ENV", "production")
    monkeypatch.setenv("CRF_AUTH_SECRET_KEY", "env-secret")
    monkeypatch.setenv("CRF_AUTH_ACCESS_TOKEN_EXPIRE_MINUTES", "45")
    monkeypatch.setenv("CRF_TEMPLATE_PATH", "./env-template.db")
    monkeypatch.setenv("CRF_SERVER_PORT", "7777")

    config = load_config(config_file)

    assert get_runtime_env() == "production"
    assert config.auth.secret_key == "env-secret"
    assert config.auth.access_token_expire_minutes == 45
    assert config.template_path == "./env-template.db"
    assert config.server.port == 7777



def test_load_config_rejects_auth_expire_minutes_above_60(tmp_path: Path) -> None:
    config_file = tmp_path / "config.yaml"
    config_file.write_text(
        "auth:\n"
        "  secret_key: test-secret-key-for-config\n"
        "  access_token_expire_minutes: 61\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="不能超过 60 分钟"):
        load_config(config_file)



def test_env_override_rejects_auth_expire_minutes_above_60(tmp_path: Path, monkeypatch) -> None:
    config_file = tmp_path / "config.yaml"
    config_file.write_text(
        "auth:\n"
        "  secret_key: test-secret-key-for-config\n"
        "  access_token_expire_minutes: 30\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("CRF_AUTH_ACCESS_TOKEN_EXPIRE_MINUTES", "61")

    with pytest.raises(ValueError, match="不能超过 60 分钟"):
        load_config(config_file)



def test_update_config_does_not_persist_env_only_secret(tmp_path: Path, monkeypatch) -> None:
    config_file = tmp_path / "config.yaml"
    config_file.write_text(
        "auth:\n"
        "  access_token_expire_minutes: 30\n"
        "template:\n"
        "  template_path: ./template.db\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("CRF_AUTH_SECRET_KEY", "env-only-secret")

    updated = update_config({"server": {"host": "127.0.0.1"}}, path=config_file)

    content = config_file.read_text(encoding="utf-8")
    assert updated.auth.secret_key == "env-only-secret"
    assert updated.server.host == "127.0.0.1"
    assert "env-only-secret" not in content
