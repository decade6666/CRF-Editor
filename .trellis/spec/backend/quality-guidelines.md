# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

- **Testing**: pytest with 80%+ coverage requirement
- **Linting**: ruff for fast linting
- **Formatting**: black for code formatting
- **Type Checking**: mypy or pyright for static analysis
- **Code Review**: Required for all changes

---

## Forbidden Patterns

### 1. Hardcoded Secrets

```python
# WRONG - hardcoded secret
SECRET_KEY = "my-secret-key-12345"

# CORRECT - environment variable
import os
SECRET_KEY = os.environ["CRF_AUTH_SECRET_KEY"]
```

### 2. SQL Injection

```python
# WRONG - string concatenation
query = f"SELECT * FROM users WHERE id = {user_id}"

# CORRECT - parameterized query
from sqlalchemy import text
session.execute(text("SELECT * FROM users WHERE id = :id"), {"id": user_id})
```

### 3. Silent Exception Swallowing

```python
# WRONG - silent failure
try:
    do_something()
except:
    pass

# CORRECT - at least log
try:
    do_something()
except Exception as e:
    logger.error(f"Operation failed: {e}")
    raise
```

### 4. Mutable Default Arguments

```python
# WRONG - mutable default
def process(items: list = []):
    items.append("new")
    return items

# CORRECT - None with explicit check
def process(items: list | None = None):
    items = items or []
    items.append("new")
    return items
```

### 5. Business Logic in Routers

```python
# WRONG - logic in router
@router.post("/items")
def create_item(data: ItemCreate, session: Session = Depends(get_session)):
    if not valid_name(data.name):
        raise HTTPException(400, "Invalid name")
    item = Item(name=data.name.upper())
    session.add(item)
    session.commit()
    return item

# CORRECT - delegate to service
@router.post("/items")
def create_item(
    data: ItemCreate,
    session: Session = Depends(get_session)
):
    return item_service.create_item(data, session)
```

---

## Required Patterns

### 1. Pydantic for All API Input/Output

```python
from pydantic import BaseModel

class ItemCreate(BaseModel):
    name: str
    value: int

    model_config = {"extra": "forbid"}  # Reject unknown fields

class ItemResponse(BaseModel):
    id: int
    name: str
    value: int
```

### 2. Dependency Injection

```python
# Correct - use FastAPI dependencies
from fastapi import Depends
from src.dependencies import get_current_user

@router.get("/protected")
def protected_route(user: User = Depends(get_current_user)):
    return {"user_id": user.id}
```

### 3. Resource Ownership Verification

```python
# Correct - use dependency for ownership check
@router.delete("/projects/{project_id}")
def delete_project(
    project: Project = Depends(verify_project_owner)
):
    session.delete(project)
    session.commit()
    return {"status": "deleted"}
```

### 4. Type Annotations

```python
# All functions must have type annotations
def get_user(user_id: int, session: Session) -> User | None:
    return session.get(User, user_id)

async def fetch_data(url: str) -> dict[str, Any]:
    ...
```

### 5. Frozen Dataclasses for Immutable DTOs

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class TokenIdentity:
    user_id: int
    username: str
    is_admin: bool
    auth_version: int
```

### 6. API Response: Additive-Only New Fields

When a frontend feature requires a new field in an existing API response, add it
additively — do **not** rename, remove, or reorder existing fields. This keeps
old clients (or cached responses) working while new clients opt in to the extra
data.

**Real example — `DocxFormResult.form_id`** (PR 9a67590):

```python
# backend/src/routers/import_docx.py
class DocxFormResult(BaseModel):
    name: str
    field_count: int
    form_id: int          # ← added; old clients simply ignore it
```

```python
# backend/src/services/docx_import_service.py — return value
return {"name": form_name, "field_count": field_count, "form_id": new_form.id}
#                                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#                                               new field appended, not replacing
```

**Why**: Pydantic strict mode will reject responses missing required fields, so
always add *after* existing fields and set a sensible default if the field might
be absent in legacy code paths.

**Required tests** (at least one):
- Verify `POST /execute` response body contains the new field with expected type.
- If the field references a DB row, verify the referenced row exists and belongs
  to the target project (`test_docx_import_contract.py`).

**Rules**:
- Never reorder existing fields in `BaseModel` responses.
- If the new field can be absent in some code path, make it `Optional[T]` with
  `default=None`; only mark it required if every code path always produces it.
- Always update the corresponding mock data in tests that patch the service
  (e.g., `test_rate_limit.py`).

---

## Testing Requirements

### Test Organization

```
backend/tests/
├── conftest.py              # Shared fixtures
├── test_auth.py             # Authentication tests
├── test_isolation.py        # Project isolation tests
├── test_permission_guards.py
├── test_width_planning.py
├── test_subresource_isolation.py
└── fixtures/
    └── planner_cases.json   # Test data shared with frontend
```

### Required Test Types

1. **Unit Tests** - Services, utilities, pure functions
2. **Integration Tests** - API endpoints with database
3. **Security Tests** - Authentication, authorization, isolation

### Test Patterns

```python
import pytest
from fastapi.testclient import TestClient

def test_create_project_unauthorized(client: TestClient):
    """Should return 401 without token."""
    response = client.post("/api/projects", json={"name": "Test"})
    assert response.status_code == 401

def test_create_project_authorized(client: TestClient, auth_headers: dict):
    """Should create project with valid token."""
    response = client.post(
        "/api/projects",
        json={"name": "Test Project"},
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Project"
```

### Fixtures

```python
# conftest.py
import pytest
from fastapi.testclient import TestClient
from main import app

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def auth_headers(client: TestClient):
    # Create user and get token
    response = client.post("/api/auth/login", json={
        "username": "testuser",
        "password": "testpass123"
    })
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
```

### Running Tests

```bash
# Run all tests
cd backend && python -m pytest

# Run with coverage
python -m pytest --cov=src --cov-report=term-missing

# Run specific test file
python -m pytest tests/test_auth.py -v
```

### Convention: `xfail` Stale Tests with Commit Hash

**What**: When production code paths are replaced (renamed, swapped for an alternative
implementation, or temporarily disabled) but the tests covering the old path are still
useful as future-restore guards, mark them `@pytest.mark.xfail` and cite the commit
hash that introduced the divergence in `reason`.

**Why**: Deleting the tests loses the contract; updating them to pass against the new
path silently rewrites history of what the old code guaranteed. `xfail` keeps the
contract green-on-CI, while the commit reference lets future readers locate exactly
when and why the path diverged — without grepping through years of history.

**Example**:
```python
# tests/test_export_unified.py
import pytest

@pytest.mark.xfail(
    reason=(
        "unified_landscape rendering path replaced by mixed_landscape in 786aaa4 "
        "(tag 0.2.0); restore this test if unified path is reinstated."
    ),
    strict=True,
)
def test_unified_landscape_column_alignment():
    ...
```

**Rules**:
- Always set `strict=True` so an accidental pass becomes a CI failure (signals the path
  is alive again and the test should be re-enabled).
- The `reason` must contain a 7+ char commit hash and a one-line description of the
  replacement, not just "deprecated".
- Do **not** delete the dead production code in the same change as the `xfail`. Keeping
  the path navigable preserves the option to restore.

---

## Code Review Checklist

### Before Submitting

- [ ] All tests pass (`pytest`)
- [ ] No type errors (`mypy src/`)
- [ ] Code formatted (`black .`)
- [ ] No lint errors (`ruff check .`)
- [ ] New code has tests
- [ ] Breaking changes documented

### Reviewer Should Check

- [ ] Follows layering (router → service → repository)
- [ ] Proper error handling with Chinese messages
- [ ] No hardcoded secrets or sensitive data
- [ ] Resource ownership verified
- [ ] Database operations use transactions correctly
- [ ] Type annotations complete
- [ ] Tests cover edge cases
