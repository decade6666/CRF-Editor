"""单机内存限流。"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Deque, Dict, Optional

from fastapi import HTTPException, Request

from src.config import get_runtime_env


@dataclass(frozen=True)
class RateLimitRule:
    limit: int
    window_seconds: int
    retry_message: str = "操作过于频繁，请稍后重试"


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._events: Dict[str, Deque[float]] = defaultdict(deque)

    def reset(self) -> None:
        with self._lock:
            self._events.clear()

    def check(self, bucket: str, rule: RateLimitRule) -> int:
        now = time.time()
        with self._lock:
            queue = self._events[bucket]
            cutoff = now - rule.window_seconds
            while queue and queue[0] <= cutoff:
                queue.popleft()
            if len(queue) >= rule.limit:
                retry_after = max(1, int(queue[0] + rule.window_seconds - now + 0.999))
                raise HTTPException(
                    status_code=429,
                    detail=rule.retry_message,
                    headers={"Retry-After": str(retry_after)},
                )
            queue.append(now)
            return 0


limiter = InMemoryRateLimiter()


def is_rate_limit_enabled() -> bool:
    return get_runtime_env() == "production"


def get_client_ip(request: Request) -> str:
    client = request.client
    return client.host if client and client.host else "unknown"


def enforce_rate_limit(bucket: str, rule: RateLimitRule) -> None:
    if not is_rate_limit_enabled():
        return
    limiter.check(bucket, rule)


AUTH_LOGIN_RULE = RateLimitRule(limit=5, window_seconds=60)
IMPORT_RULE = RateLimitRule(limit=3, window_seconds=60)


def _auth_bucket(scope: str, username: str, client_ip: str) -> str:
    return f"{scope}:{username.strip()}:{client_ip}"


def limit_auth_login(request: Request, username: str) -> None:
    client_ip = get_client_ip(request)
    bucket = _auth_bucket("auth-login", username, client_ip)
    enforce_rate_limit(bucket, AUTH_LOGIN_RULE)


def limit_self_password_change(request: Request, username: str) -> None:
    client_ip = get_client_ip(request)
    bucket = _auth_bucket("self-password-change", username, client_ip)
    enforce_rate_limit(bucket, AUTH_LOGIN_RULE)


def limit_import_action(request: Request, user_id: Optional[int], scope: str) -> None:
    client_ip = get_client_ip(request)
    subject = f"user:{user_id}" if user_id is not None else f"ip:{client_ip}"
    bucket = f"{scope}:{subject}"
    enforce_rate_limit(bucket, IMPORT_RULE)
