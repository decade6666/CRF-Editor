# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

- **Testing**: pytest with 80%+ coverage requirement
- **Linting**: ruff for fast linting
- **Formatting**: `ruff format` (format-only config in `backend/ruff.toml`; version pinned in `backend/requirements-dev.txt`; no lint rules enabled by this config)
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

### Test Session Isolation (hermetic)

#### 1. Scope / Trigger

Apply to every backend pytest invocation. Tests must not read or write repo-owned runtime resources: the real `config.yaml`, `crf_editor.db`, repo-root `uploads/`, or `backend/uploads/docx_temp`. The session's config *sources* are isolated too: `CONFIG_FILE` points at a nonexistent file under the test root, and `CRF_*` config-override variables from the developer shell never enter the session.

#### 2. Signatures

- `backend/tests/conftest.py`: module-level `TEST_ROOT: Path` and `UPLOAD_DIR = TEST_ROOT / "uploads"` are initialized before `import main`.
- `test_root() -> Iterator[Path]` is a session fixture; `_isolate_docx_dirs() -> Iterator[None]` is an autouse session fixture.
- Coverage command: `python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered`.

#### 3. Contracts

- Before importing `main`, conftest forcibly assigns `CRF_DATABASE_PATH = TEST_ROOT / "crf_editor.db"` and `CRF_STORAGE_UPLOAD_PATH = UPLOAD_DIR`, regardless of inherited values. `CRF_AUTH_SECRET_KEY` is always re-generated randomly per session (a shell value must not leak in); inherited `CRF_ENV` is removed so production mode is enabled only by individual tests.
- After the `sys.path` insert and still before `import main`, conftest pops every `_ENV_OVERRIDE_MAP` variable except the three forced keys (`CRF_DATABASE_PATH`, `CRF_STORAGE_UPLOAD_PATH`, `CRF_AUTH_SECRET_KEY`) and rebinds `src.config.CONFIG_FILE = TEST_ROOT / "config.yaml"` — a path that does not exist at session start, so reads return defaults and unpatched writes land in the temp root. Both changes must precede `import main` because `get_config` caches on first evaluation there.
- The session fixture redirects both `DocxScreenshotService.BASE_DIR` and `DocxImportService.TEMP_DIR` to `TEST_ROOT / "docx_temp"`. `_TEST_CONFIG.storage.upload_path` uses the same `UPLOAD_DIR` constant.
- `test_root` removes `TEST_ROOT` on session teardown; an `atexit` handler is the fallback for normal process exits that never request the fixture (e.g. `--collect-only` or partial selections). A fresh worktree needs no `config.yaml` or seeded database.
- Coverage is statistics-only, with no threshold. Do not add `--cov` to `pytest.ini` `addopts`, so a missing optional plugin cannot break ordinary test runs.

#### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Developer shell points DB/upload paths outside the temp root | conftest overwrites both paths before `main` loads cached config |
| `CRF_AUTH_SECRET_KEY` is set in the shell | conftest overwrites it with a session-random value before import-time app validation |
| Shell exports `CRF_ENV=production` | conftest removes it; production-only tests must opt in with `monkeypatch.setenv` |
| Any guarded runtime path resolves outside `TEST_ROOT` | `tests/test_test_environment_isolation.py` fails with the offending path |
| `CONFIG_FILE` no longer resolves under the test root | the path guard `test_should_redirect_config_file_under_test_root` fails |
| An unforced `_ENV_OVERRIDE_MAP` variable is inherited from the shell | the env guard `test_should_not_inherit_config_override_env` fails, listing variable names only (never values — they may be secrets) |

#### 5. Good / Base / Bad Cases

- **Good**: use the conftest `TEST_ROOT` or pytest `tmp_path` for test files; patch config paths at the actual module boundary when code bypasses the session dependency (e.g. the export permission test).
- **Base**: a test that only reads source fixtures may use their checked-in paths read-only.
- **Bad**: open the repo's real database/config/upload paths, or stat/mtime those files as an isolation guard; a live development server may touch them and make such checks unreliable.

#### 6. Tests Required

Keep `tests/test_test_environment_isolation.py` green. It must assert that resolved `load_config().db_path`, `load_config().upload_path`, `DocxScreenshotService.BASE_DIR`, and `DocxImportService.TEMP_DIR` are all below `test_root`, that inherited `CRF_ENV` is absent, that `CONFIG_FILE` resolves under `test_root`, and that no unforced `_ENV_OVERRIDE_MAP` variable is present in the session environment. Add regressions whenever a new test path can bypass these redirects. Coverage output is recorded for comparison but is not a pass/fail gate.

#### 7. Wrong vs Correct

**Wrong** — a route that reads `get_config().db_path` directly bypasses the injected in-memory session, so relying on the `client` fixture alone may access the repo database:

```python
response = client.get("/api/projects/export/database", headers=headers)
```

**Wrong** — importing `CONFIG_FILE` by name freezes its value at import time, bypassing later redirects and patches:

```python
from src.config import CONFIG_FILE  # never do this in tests
```

**Correct** — patch by string so the module global is read at call time and restored afterwards:

```python
with patch("src.config.CONFIG_FILE", tmp_path / "config.yaml"):
    ...
```

**Correct** — seed a file database under `tmp_path` and patch the config getter at the route module that imported it:

```python
source_path = tmp_path / "export_source.db"
monkeypatch.setattr(
    "src.routers.export.get_config",
    lambda: SimpleNamespace(db_path=str(source_path)),
)
```

### Running Tests

```bash
# Run all tests
cd backend && python -m pytest

# Run with coverage (statistics only, no gate)
python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered

# Run specific test file
python -m pytest tests/test_auth.py -v
```

### Convention: `xfail` Tests for Retained Legacy Paths

**What**: When a production path is intentionally replaced or disabled but remains in source for possible restoration, and its old tests are useful as restore guards, mark those tests `@pytest.mark.xfail` and cite the commit hash that introduced the divergence in `reason`.

**Why**: An xfail preserves a guard for code that is still present but intentionally inactive, while the commit reference lets future readers locate when and why the path diverged. It is not a reason to keep unreachable production code or obsolete tests indefinitely.

**Example**:
```python
# tests/test_legacy_layout.py
import pytest

@pytest.mark.xfail(
    reason="legacy renderer replaced by the active layout in a1b2c3d; restore if the retained legacy path is re-enabled.",
    strict=True,
)
def test_legacy_layout_column_alignment():
    ...
```

**Rules**:
- Use `strict=True` so an accidental pass becomes a test failure and signals that the retained path may be active again.
- The `reason` must contain a 7+ character commit hash and a concise description of the replacement, not just "deprecated".
- Do not delete retained production code in the same change as its xfail guard; keeping the code navigable preserves the option to restore it.
- If a path is proven unreachable or dead and is removed outright, remove its obsolete xfail tests in the same change after converting any still-relevant assertions to live-path tests; record the reachability proof and test disposition in the change log.

---

## Code Review Checklist

### Before Submitting

- [ ] All tests pass (`pytest`)
- [ ] No type errors (`mypy src/`)
- [ ] Code formatted (`ruff format .`)
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
