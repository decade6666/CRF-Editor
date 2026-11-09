"""Agent 端点专用依赖：凭据认证、封闭解析、限流桶与 engine 注入。"""

from __future__ import annotations

import json
from typing import Iterator

from fastapi import HTTPException, Request, Response
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from src.database import get_engine
from src.models.agent_access import AgentCredential
from src.rate_limit import InMemoryRateLimiter, RateLimitRule

# agent 端点专用限流规则（隔离实例，始终启用）
AGENT_IP_RULE = RateLimitRule(limit=600, window_seconds=60)
AGENT_READ_RULE = RateLimitRule(limit=240, window_seconds=60)
AGENT_WRITE_RULE = RateLimitRule(limit=60, window_seconds=60)

# 独立限流实例：与登录/导入限流互不污染
agent_limiter = InMemoryRateLimiter()

MAX_BODY_BYTES = 64 * 1024


class AgentToolError(HTTPException):
    """带稳定领域错误码的 agent 异常（路由层转为 {detail, code} JSON）。"""

    def __init__(self, status_code: int, detail: str, code: str):
        super().__init__(status_code, detail)
        self.domain_code = code


def agent_error_response(exc: HTTPException, fallback_code: str):
    """把 agent/属主异常统一为 {detail, code} JSON 响应（全部 no-store）。"""
    from fastapi.responses import JSONResponse

    from src.schemas.agent_tools import STATUS_DEFAULT_CODES

    code = getattr(exc, "domain_code", None) or STATUS_DEFAULT_CODES.get(exc.status_code, fallback_code)
    headers = dict(getattr(exc, "headers", None) or {})
    headers["Cache-Control"] = "no-store"
    detail = exc.detail if isinstance(exc.detail, str) else "请求被拒绝"
    return JSONResponse(status_code=exc.status_code, content={"detail": detail, "code": code}, headers=headers)


def get_agent_engine() -> Iterator[Engine]:
    """agent 路由 engine 注入点（测试可 override 到隔离引擎）。"""
    yield get_engine()


def agent_client_ip(request: Request) -> str:
    client = request.client
    return client.host if client and client.host else "unknown"


def limit_agent_ip(request: Request) -> None:
    agent_limiter.check(f"agent-ip:{agent_client_ip(request)}", AGENT_IP_RULE)


async def parse_bounded_json_body(request: Request) -> dict:
    """有界流式读取 JSON 请求体（64 KiB 上限，逐块强制，超限立即拒绝）。

    绝不整体缓冲未知大小的请求体：任一块累计超过上限即抛 413，
    不再读取后续块（chunked 请求同样适用）。
    """
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared = int(content_length)
        except ValueError:
            raise HTTPException(400, "content-length 无效")
        if declared < 0:
            raise HTTPException(400, "content-length 无效")
        if declared > MAX_BODY_BYTES:
            raise HTTPException(413, "请求体过大")
    received = bytearray()
    async for chunk in request.stream():
        if not chunk:
            continue
        received.extend(chunk)
        if len(received) > MAX_BODY_BYTES:
            raise HTTPException(413, "请求体过大")
    body = bytes(received)
    if not body:
        return {}
    try:
        data = json.loads(body)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(422, "请求体必须是有效 JSON")
    if not isinstance(data, dict):
        raise HTTPException(422, "请求体必须是 JSON 对象")
    return data


def no_store(response: Response) -> Response:
    """agent/属主访问响应禁缓存。"""
    response.headers["Cache-Control"] = "no-store"
    return response
