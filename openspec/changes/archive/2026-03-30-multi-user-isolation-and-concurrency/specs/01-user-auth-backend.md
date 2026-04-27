# Spec 01: 用户认证后端

## 1. 依赖包

在 `backend/requirements.txt` 中新增：

```
PyJWT>=2.8.0
passlib[bcrypt]>=1.7.4
python-multipart>=0.0.9
```

> `python-multipart` 是 FastAPI 处理 `OAuth2PasswordRequestForm`（`application/x-www-form-urlencoded`）的必需依赖。

---

## 2. AuthConfig（backend/src/config.py）

### 2.1 新增类

```python
class AuthConfig(BaseModel):
    secret_key: str = ""                       # JWT 签名密钥，必须非空
    algorithm: str = "HS256"                   # 签名算法，固定值
    access_token_expire_minutes: int = 30      # Token 有效期（分钟）
    admin_initial_password: str = ""           # 首次部署创建 admin 账号用
```

### 2.2 AppConfig 新增字段

```python
class AppConfig(BaseModel):
    database: DatabaseConfig = DatabaseConfig()
    storage: StorageConfig = StorageConfig()
    server: ServerConfig = ServerConfig()
    template: TemplateConfig = TemplateConfig()
    ai: AIConfig = AIConfig()
    auth: AuthConfig = AuthConfig()            # 新增
```

### 2.3 启动时校验

在 `backend/main.py` 的应用启动阶段（FastAPI lifespan 或模块顶层）添加：

```python
config = get_config()
if not config.auth.secret_key:
    raise RuntimeError("config.yaml 缺少 auth.secret_key，应用无法启动")
```

---

## 3. User 模型（backend/src/models/user.py）

```python
"""User 模型"""
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from . import Base

if TYPE_CHECKING:
    from .project import Project


class User(Base):
    """用户模型"""
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    projects: Mapped[list["Project"]] = relationship(
        back_populates="owner",
        cascade="all, delete-orphan"
    )
```

### 3.1 models/__init__.py 更新

确保在 `backend/src/models/__init__.py` 中导入 `User`（`Base.metadata.create_all` 依赖所有模型已被 import）：

```python
from .user import User  # 新增
```

---

## 4. AuthService（backend/src/services/auth_service.py）

```python
"""认证服务：密码哈希、JWT 签发与验证"""
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from src.config import get_config

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def create_access_token(username: str) -> str:
    config = get_config()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=config.auth.access_token_expire_minutes
    )
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, config.auth.secret_key, algorithm=config.auth.algorithm)


def decode_token(token: str) -> str:
    """解码 token，返回 username。失败抛出 jwt.PyJWTError。"""
    config = get_config()
    payload = jwt.decode(
        token,
        config.auth.secret_key,
        algorithms=[config.auth.algorithm]
    )
    username: str | None = payload.get("sub")
    if not username:
        raise jwt.InvalidTokenError("token 缺少 sub 字段")
    return username
```

---

## 5. 共享依赖（backend/src/dependencies.py）

新建文件 `backend/src/dependencies.py`：

```python
"""共享 FastAPI 依赖函数"""
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

import jwt

from src.database import get_read_session
from src.models.user import User
from src.services.auth_service import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_read_session),
) -> User:
    try:
        username = decode_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="未授权")
    user = session.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="未授权")
    return user


def verify_project_owner(project_id: int, current_user: User, session: Session):
    """校验 project_id 属于 current_user。项目不存在 → 404，非 owner → 403。

    Returns: Project 对象（校验通过时）
    """
    from src.repositories.project_repository import ProjectRepository
    project = ProjectRepository(session).get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问此项目")
    return project
```

---

## 6. Auth 路由（backend/src/routers/auth.py）

```python
"""认证路由：注册与登录"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.database import get_session
from src.models.user import User
from src.services.auth_service import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(data: RegisterRequest, session: Session = Depends(get_session)):
    existing = session.query(User).filter(User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="用户名已存在")
    user = User(username=data.username, hashed_password=hash_password(data.password))
    session.add(user)
    session.flush()
    return TokenResponse(access_token=create_access_token(data.username))


@router.post("/login", response_model=TokenResponse)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
):
    user = session.query(User).filter(User.username == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    return TokenResponse(access_token=create_access_token(user.username))
```

### 6.1 main.py 路由注册

```python
from src.routers.auth import router as auth_router

app.include_router(auth_router, prefix="/api")
```

---

## 7. 响应格式

### 成功响应

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### 错误响应（遵循现有 `{"detail": "..."}` 格式）

| 情形 | HTTP 状态 | detail |
|------|-----------|--------|
| 用户名已存在 | 400 | `"用户名已存在"` |
| 密码错误 | 401 | `"用户名或密码错误"` |
| token 无效/过期 | 401 | `"未授权"` |
