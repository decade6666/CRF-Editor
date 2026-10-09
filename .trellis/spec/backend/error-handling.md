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

## Scenario: Coded Domain Errors Must Reach the Client (Word export `ExportError`)

### 1. Scope / Trigger

- Trigger: a service raises a domain exception that carries a stable error code, and the route + app-level handler must return it to the client unchanged.
- Reference implementation: `ExportError` in `backend/src/services/export_service.py`, raised for incompatible export data (`EXPORT_DATA_INCOMPATIBLE`, e.g. invalid aCRF `annotation_positions`) and incompatible schema (`EXPORT_SCHEMA_INCOMPATIBLE`); handled by `export_error_handler` in `backend/main.py`.
- Historically these errors were swallowed twice (service catch-all → `return False`, then a route catch-all → generic 500), so the app-level handler was unreachable and the frontend only ever saw 「导出失败」.

### 2. Signatures

```python
# backend/src/services/export_service.py
class ExportError(Exception):
    def __init__(self, message: str, code: str, status_code: int = 400):
        self.message = message   # user-facing Chinese detail
        self.code = code         # stable machine code, e.g. EXPORT_DATA_INCOMPATIBLE
        self.status_code = status_code

_EXPORT_ERROR_CODES = {
    "SCHEMA_INCOMPATIBLE": "EXPORT_SCHEMA_INCOMPATIBLE",
    "DATA_INCOMPATIBLE": "EXPORT_DATA_INCOMPATIBLE",
}

# backend/main.py — app-level handler
@app.exception_handler(ExportError)
async def export_error_handler(request: Request, exc: ExportError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message, "code": exc.code},
    )

# backend/src/routers/export.py
def _remove_temp_file(path: str) -> None: ...   # best-effort unlink: logs a warning on failure, never raises
```

### 3. Contracts

- `ExportService.export_project_to_word` must keep `except ExportError: raise` **immediately before** its catch-all (`except Exception: logger.exception(...); return False`). Without it the coded error becomes `False` and the route degrades it to a generic 500.
- The route cleans up and re-raises: `except ExportError as exc: logger.warning("导出Word文档失败：%s", exc.message); _remove_temp_file(tmp_path); raise`.
- `except HTTPException: raise` stays first — project/permission errors keep their own status codes.
- Response shape is `{"detail": <具体原因>, "code": <稳定错误码>}` with `exc.status_code` (400 for data incompatibility), the same shape as `ProjectImportError`. The frontend shows `err.detail` (`App.vue` exportWord: `'导出失败: ' + (err.detail || '未知错误')`). A new failure kind adds an `_EXPORT_ERROR_CODES` entry, not a new route branch.
- Every failure path removes the temp `.docx`: `if not ok` (unlink → 500 「导出失败，请检查项目数据是否完整」), output validation failure (unlink → 500 「导出失败: <reason>」), `ExportError` (`_remove_temp_file` → re-raise), unknown exception (`_remove_temp_file` → 500 「导出失败，请稍后重试或联系管理员」). Success returns a `FileResponse` whose `BackgroundTask(os.unlink, tmp_path)` removes it after streaming.

### 4. Validation & Error Matrix

| Condition | Expected behavior |
| --- | --- |
| Service raises `ExportError` (e.g. invalid `annotation_positions`) | 400, body `{"detail": "<具体原因>", "code": "EXPORT_DATA_INCOMPATIBLE"}`, temp file removed |
| Other failures still return `False` from the service | 500 「导出失败，请检查项目数据是否完整」, temp file removed |
| Output validation fails | 500 「导出失败: <reason>」, temp file removed |
| Route raises `HTTPException` (401/404/…) | Passed through unchanged |
| Any other exception | 500 「导出失败，请稍后重试或联系管理员」, stack logged once by the route, temp file removed |
| Successful export | `FileResponse`; temp file removed by the response `BackgroundTask` |

### 5. Good / Base / Bad Cases

- **Good**: an aCRF export over corrupt `annotation_positions` returns 400 with `EXPORT_DATA_INCOMPATIBLE` and the specific reason; the frontend surfaces it instead of a generic failure.
- **Base**: an unexpected rendering error still returns the generic 500 and is logged with a full traceback.
- **Bad**: a service catch-all turning coded errors into `False`, or a route catch-all re-mapping them to a generic message. The test that asserted `ok is False` was locking in that bug; it was rewritten to expect the exception.

### 6. Tests Required

- `backend/tests/test_export_acrf.py::test_acrf_export_rejects_invalid_annotation_positions` — `pytest.raises(ExportError)` and `exc.code == "EXPORT_DATA_INCOMPATIBLE"`.
- `backend/tests/test_export_word_errors.py::test_export_word_returns_specific_error_and_removes_temp_file` — HTTP 400, body carries the specific `detail` + `code`, and the temp `.docx` created by the route is deleted (spy on `NamedTemporaryFile`).

**Assertion points**: the error code matches the raised kind; `detail` is the specific reason, not the generic message; no temp `.docx` survives any failure path.

### 7. Wrong vs Correct

**Wrong**

```python
# Service: the catch-all swallows the coded error into a bool
try:
    ...
    return True
except Exception:
    logger.exception("导出失败 project_id=%s", project_id)
    return False

# Route: the catch-all degrades it to a generic 500
except Exception:
    raise HTTPException(500, "导出失败，请稍后重试或联系管理员")
```

**Correct**

```python
# Service: let the coded error through before the catch-all
except ExportError:
    raise
except Exception:
    logger.exception("导出失败 project_id=%s", project_id)
    return False

# Route: clean up the temp file, then re-raise; main.py formats {detail, code}
except ExportError as exc:
    logger.warning("导出Word文档失败：%s", exc.message)
    _remove_temp_file(tmp_path)
    raise
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

A coded domain error is the same failure with a name: catching it into `False` or a generic message is silent failure too — see "Scenario: Coded Domain Errors Must Reach the Client" above.

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

### 5. `await` on Synchronous Helper (Masked by Middleware)

**Symptom**: Endpoint returns generic 500 in tests, no stack trace in response body. Real
`TypeError: object str can't be used in 'await' expression` is hidden because
`security_headers_middleware` wraps `call_next` in `try/except Exception` and converts
unhandled errors into a 500.

**Cause**: `_save_bytes_to_temp` (and similar helpers in `routers/projects.py`) are plain
`def`, not `async def`. Awaiting their return value raises `TypeError` *after* response
serialization begins, so the framework hands it to the middleware tier, which masks the
true error.

**Wrong**:
```python
# routers/projects.py — _save_bytes_to_temp is sync, returns str
temp_path = await _save_bytes_to_temp(payload)  # TypeError -> 500
```

**Correct**:
```python
temp_path = _save_bytes_to_temp(payload)  # str
```

**Prevention**:
- Before adding `await`, confirm the callee signature begins with `async def`. `def`
  helpers that return non-awaitables must be called synchronously.
- When debugging an opaque 500 from a route, run the handler logic with
  `TestClient(raise_server_exceptions=True)` (the default) and inspect the captured
  exception, **or** temporarily bypass `security_headers_middleware` to surface the real
  trace. A long-lived 500 in tests is almost always a middleware-masked exception.
- Treat any `try/except Exception` in middleware as a debugging hazard: log the original
  exception with `exc_info=True` even when normalizing to 500.
