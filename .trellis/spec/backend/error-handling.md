# Error Handling

> How errors are handled in this project.

---

## Overview

- **Framework**: FastAPI with HTTPException
- **Validation**: Pydantic with field_validator
- **Error Messages**: Chinese detail messages for user-facing errors
- **Logging**: Errors logged with context via standard logging module

---

## Error Types

### HTTPException (FastAPI Standard)

```python
from fastapi import HTTPException

# 401 Unauthorized
raise HTTPException(
    status_code=401,
    detail="认证失败，请重新登录"
)

# 403 Forbidden
raise HTTPException(
    status_code=403,
    detail="无权访问该项目"
)

# 404 Not Found
raise HTTPException(
    status_code=404,
    detail="项目不存在"
)

# 400 Bad Request
raise HTTPException(
    status_code=400,
    detail="密码长度至少为8个字符"
)
```

### Pydantic Validation Errors

```python
from pydantic import BaseModel, field_validator

class LoginRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("用户名不能为空")
        return v.strip()

    model_config = {"extra": "forbid"}  # Reject unknown fields
```

---

## Error Handling Patterns

### Router Layer

Routers catch exceptions and convert to HTTPException:

```python
from fastapi import HTTPException, status

@router.post("/login")
def login(data: LoginRequest, session: Session = Depends(get_session)):
    user = session.scalar(select(User).where(User.username == data.username))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误"
        )

    if not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误"
        )

    return create_token(user)
```

### Service Layer

Services raise ValueError for business logic failures:

```python
# src/services/auth_service.py
def change_password(user: User, old_password: str, new_password: str):
    if not verify_password(old_password, user.password_hash):
        raise ValueError("原密码错误")

    if len(new_password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"密码长度至少为{MIN_PASSWORD_LENGTH}个字符")

    user.password_hash = hash_password(new_password)
    user.auth_version += 1  # Invalidate existing tokens
```

Routers convert ValueError to HTTPException:

```python
@router.post("/change-password")
def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    try:
        auth_service.change_password(current_user, data.old_password, data.new_password)
        session.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

---

## API Error Responses

### Standard Error Format

FastAPI automatically converts HTTPException to JSON:

```json
{
  "detail": "用户名或密码错误"
}
```

### Validation Error Format

Pydantic validation errors return structured response:

```json
{
  "detail": [
    {
      "type": "value_error",
      "loc": ["body", "username"],
      "msg": "用户名不能为空",
      "input": "",
      "ctx": {"error": {}}
    }
  ]
}
```

### Forbidden Extra Fields

With `model_config = {"extra": "forbid"}`, unknown fields return:

```json
{
  "detail": [
    {
      "type": "extra_forbidden",
      "loc": ["body", "unknown_field"],
      "msg": "Extra inputs are not permitted"
    }
  ]
}
```

---

## Resource Isolation Errors

Use dependencies for consistent error handling:

```python
# src/dependencies.py
async def verify_project_owner(
    project_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
) -> Project:
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问该项目")
    return project

# In router
@router.get("/projects/{project_id}")
def get_project(project: Project = Depends(verify_project_owner)):
    return project
```

---

## Common Mistakes

### 1. Exposing Internal Errors

```python
# Wrong - exposes internal details
try:
    result = complex_operation()
except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))

# Correct - generic message, log internally
try:
    result = complex_operation()
except Exception as e:
    logger.error(f"Internal error: {e}")
    raise HTTPException(status_code=500, detail="服务器内部错误")
```

### 2. Silent Failure

```python
# Wrong - silent failure
user = session.get(User, user_id)
if not user:
    return None  # Caller doesn't know why

# Correct - explicit error
user = session.get(User, user_id)
if not user:
    raise HTTPException(status_code=404, detail="用户不存在")
```

### 3. Inconsistent Error Messages

```python
# Wrong - mixed languages, inconsistent phrasing
raise HTTPException(status_code=404, detail="Project not found")
raise HTTPException(status_code=404, detail="该表单不存在")

# Correct - consistent Chinese messages
raise HTTPException(status_code=404, detail="项目不存在")
raise HTTPException(status_code=404, detail="表单不存在")
```

### 4. Missing Status Code Import

```python
# Wrong - magic numbers
raise HTTPException(status_code=401, detail="...")

# Correct - use status constants
from fastapi import status
raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="...")
```
