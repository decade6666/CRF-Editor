"""配置加载回归测试。"""

from pathlib import Path

from src.config import AuthConfig, ServerConfig, load_config


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
        "  access_token_expire_minutes: 8640\n",
        encoding="utf-8",
    )

    config = load_config(config_file)

    assert AuthConfig().access_token_expire_minutes == 30
    assert config.auth.access_token_expire_minutes == 8640


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
