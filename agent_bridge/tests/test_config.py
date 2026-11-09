"""config.py 单元测试：环境变量校验、URL 边界与缺失报错。"""

from __future__ import annotations

import pytest

from agent_bridge.config import API_URL_ENV, TOKEN_ENV, ConfigError, load_config, validate_api_url


def test_missing_env_reports_names_only():
    with pytest.raises(ConfigError) as exc:
        load_config(env={})
    assert API_URL_ENV in str(exc.value)
    assert TOKEN_ENV in str(exc.value)


def test_missing_token_only():
    with pytest.raises(ConfigError) as exc:
        load_config(env={API_URL_ENV: "http://127.0.0.1:8000/api"})
    assert TOKEN_ENV in str(exc.value)


def test_valid_loopback_http_url():
    config = load_config(env={API_URL_ENV: "http://localhost:8000/api", TOKEN_ENV: "t"})
    assert config["api_url"] == "http://localhost:8000/api"
    assert config["token"] == "t"


def test_valid_https_with_prefix():
    config = load_config(env={API_URL_ENV: "https://example.org/crf/api/", TOKEN_ENV: "t"})
    assert config["api_url"] == "https://example.org/crf/api"


def test_remote_http_rejected():
    with pytest.raises(ConfigError):
        validate_api_url("http://example.org/api")


def test_embedded_credentials_rejected():
    with pytest.raises(ConfigError):
        validate_api_url("https://user:pass@example.org/api")


def test_fragment_and_query_rejected():
    with pytest.raises(ConfigError):
        validate_api_url("https://example.org/api#x")
    with pytest.raises(ConfigError):
        validate_api_url("https://example.org/api?q=1")


def test_non_api_suffix_rejected():
    with pytest.raises(ConfigError):
        validate_api_url("https://example.org/agent")


def test_127_subdomain_loopback_allowed():
    assert validate_api_url("http://127.0.0.1:9/api")
    with pytest.raises(ConfigError):
        validate_api_url("http://127evil.com/api")


def test_http_127_prefix_hostname_is_not_loopback():
    """127.example.invalid 不是回环地址：明文 HTTP 必须拒绝（精确解析，不前缀匹配）。"""
    from agent_bridge.config import ConfigError, validate_api_url

    with pytest.raises(ConfigError):
        validate_api_url("http://127.example.invalid/api")


def test_http_loopback_literals_still_accepted():
    from agent_bridge.config import validate_api_url

    for host in ("localhost", "127.0.0.1", "127.8.8.8", "[::1]", "[::1]:9000"):
        assert validate_api_url(f"http://{host}/api").endswith("/api")
    with pytest.raises(ConfigError):
        validate_api_url("http://example.test/api")
    with pytest.raises(ConfigError):
        validate_api_url("http://192.168.1.10/api")
