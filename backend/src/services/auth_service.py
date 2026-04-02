"""认证服务：JWT 签发/验证"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt

from src.config import get_config


@dataclass(frozen=True)
class TokenIdentity:
    """JWT 身份载荷。"""

    user_id: int
    username: str


def create_access_token(user_id: int, username: str) -> str:
    config = get_config().auth
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=config.access_token_expire_minutes
    )
    return jwt.encode(
        {"sub": str(user_id), "username": username, "exp": expire},
        config.secret_key,
        algorithm=config.algorithm,
    )


def decode_token(token: str) -> TokenIdentity:
    """解码 JWT，返回稳定主键 + 用户名快照。失败抛出 jwt.PyJWTError。"""
    config = get_config().auth
    payload = jwt.decode(token, config.secret_key, algorithms=[config.algorithm])
    try:
        return TokenIdentity(
            user_id=int(payload["sub"]),
            username=str(payload["username"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise jwt.InvalidTokenError("invalid token payload") from exc
