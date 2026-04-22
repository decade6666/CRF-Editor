"""认证服务：JWT 签发/验证"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError

from src.config import get_config

_PASSWORD_CONTEXT = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
_MIN_PASSWORD_LENGTH = 8


@dataclass(frozen=True)
class TokenIdentity:
    """JWT 身份载荷。"""

    user_id: int
    username: str
    auth_version: int


def validate_password_policy(password: str) -> None:
    if len(password) < _MIN_PASSWORD_LENGTH:
        raise ValueError(f"密码长度不能少于 {_MIN_PASSWORD_LENGTH} 个字符")


def hash_password(password: str) -> str:
    validate_password_policy(password)
    return _PASSWORD_CONTEXT.hash(password)


def has_usable_password_hash(hashed: Optional[str]) -> bool:
    if not hashed:
        return False
    return _PASSWORD_CONTEXT.identify(hashed) is not None


def verify_password(password: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return _PASSWORD_CONTEXT.verify(password, hashed)
    except UnknownHashError:
        return False


def create_access_token(user_id: int, username: str, auth_version: int) -> str:
    config = get_config().auth
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=config.access_token_expire_minutes
    )
    return jwt.encode(
        {
            "sub": str(user_id),
            "username": username,
            "ver": auth_version,
            "exp": expire,
        },
        config.secret_key,
        algorithm=config.algorithm,
    )


def decode_token(token: str) -> TokenIdentity:
    """解码 JWT，返回稳定主键、用户名快照与认证版本。失败抛出 jwt.PyJWTError。"""
    config = get_config().auth
    payload = jwt.decode(token, config.secret_key, algorithms=[config.algorithm])
    try:
        return TokenIdentity(
            user_id=int(payload["sub"]),
            username=str(payload["username"]),
            auth_version=int(payload["ver"]),
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise jwt.InvalidTokenError("invalid token payload") from exc
