"""认证服务：JWT 签发/验证"""
from datetime import datetime, timedelta, timezone

import jwt

from src.config import get_config


def create_access_token(username: str) -> str:
    config = get_config().auth
    expire = datetime.now(timezone.utc) + timedelta(minutes=config.access_token_expire_minutes)
    return jwt.encode({"sub": username, "exp": expire}, config.secret_key, algorithm=config.algorithm)


def decode_token(token: str) -> str:
    """解码 JWT，返回 username（sub 字段）。失败抛出 jwt.PyJWTError。"""
    config = get_config().auth
    payload = jwt.decode(token, config.secret_key, algorithms=[config.algorithm])
    return payload["sub"]
