"""配置加载回归测试。"""

from pathlib import Path

from src.config import ServerConfig, load_config


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
