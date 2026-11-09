"""适配器主机配置：仅环境变量，缺失只报变量名。"""

from __future__ import annotations

import ipaddress
import os
import sys
from urllib.parse import urlsplit

API_URL_ENV = "CRF_AGENT_API_URL"
TOKEN_ENV = "CRF_AGENT_TOKEN"


class ConfigError(Exception):
    """配置错误：消息只含变量名/原因，绝不包含凭据值。"""


def _is_loopback(hostname: str) -> bool:
    """只接受精确回环：localhost 字面量或可解析的回环 IP 字面量。

    绝不按前缀匹配 DNS 名称（如 127.evil.example 不是回环地址）。
    """
    name = hostname.lower().rstrip(".")
    if name == "localhost":
        return True
    try:
        address = ipaddress.ip_address(name)
    except ValueError:
        return False
    return address.is_loopback


def validate_api_url(url: str) -> str:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise ConfigError(f"{API_URL_ENV} 必须是 http(s) URL")
    if not parts.hostname:
        raise ConfigError(f"{API_URL_ENV} 缺少主机名")
    # 拒绝 URL 内嵌凭据 / 片段 / 查询串
    if parts.username or parts.password:
        raise ConfigError(f"{API_URL_ENV} 不得内嵌凭据")
    if parts.fragment or parts.query:
        raise ConfigError(f"{API_URL_ENV} 不得携带片段或查询串")
    if parts.scheme == "http" and not _is_loopback(parts.hostname):
        raise ConfigError(f"{API_URL_ENV} 非回环地址必须使用 https")
    base = url.rstrip("/")
    if not base.endswith("/api"):
        # 允许显式部署前缀（如 /crf/api）；要求以 /api 结尾以防路由拼接歧义
        raise ConfigError(f"{API_URL_ENV} 必须以 /api 结尾（可含部署前缀）")
    return base


def load_config(env: dict | None = None) -> dict:
    """读取并校验主机环境配置；返回 {api_url, token}。"""
    source = env if env is not None else os.environ
    api_url = source.get(API_URL_ENV, "").strip()
    token = source.get(TOKEN_ENV, "").strip()
    missing = [name for name, value in ((API_URL_ENV, api_url), (TOKEN_ENV, token)) if not value]
    if missing:
        raise ConfigError("缺少必需的环境变量: " + ", ".join(missing))
    return {"api_url": validate_api_url(api_url), "token": token}


def log_to_stderr(message: str) -> None:
    """诊断输出只走 stderr（stdout 专用于 MCP 协议帧）。"""
    print(message, file=sys.stderr, flush=True)
