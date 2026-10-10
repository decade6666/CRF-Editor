# Authentication & Authorization Security

> Security patterns for authentication, authorization, and rate limiting.

---

## Overview

- **Authentication**: JWT with `auth_version` for token invalidation
- **Password Hashing**: PBKDF2-SHA256 with salt
- **Rate Limiting**: In-memory rate limiter for production
- **Authorization**: Project ownership and resource isolation

---

## Authentication

### JWT Token Structure

```python
@dataclass(frozen=True)
class TokenIdentity:
    user_id: int
    username: str
    auth_version: int  # For token invalidation
```

**Token Generation**:

```python
def create_access_token(identity: TokenIdentity) -> str:
    payload = {
        "sub": identity.username,
        "user_id": identity.user_id,
        "auth_version": identity.auth_version,
        "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")
```

### Token Invalidation Strategy

**When `auth_version` is incremented**:
1. User password reset by admin
2. User changes their own password
3. All existing tokens for that user become invalid

**Verification Flow**:

```python
async def get_current_user(token: str, db: Session) -> User:
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    user = db.query(User).filter(User.id == payload["user_id"]).first()

    # Token invalidation check
    if user.auth_version != payload["auth_version"]:
        raise HTTPException(401, "Token invalidated")

    return user
```

### Password Requirements

```python
# Production requirements (enforced in auth_service.py)
MIN_PASSWORD_LENGTH = 8
REQUIRE_UPPERCASE = True
REQUIRE_LOWERCASE = True
REQUIRE_DIGIT = True
```

---

## Rate Limiting

### Configuration

```python
# backend/src/rate_limit.py
AUTH_LOGIN_RULE = RateLimitRule(limit=5, window_seconds=60)
AUTH_CHANGE_PASSWORD_RULE = RateLimitRule(limit=3, window_seconds=60)
IMPORT_RULE = RateLimitRule(limit=3, window_seconds=60)
```

### Implementation Pattern

```python
@router.post("/login")
@rate_limit("auth_login")
async def login(credentials: LoginRequest, request: Request):
    # Rate limiter checks before handler execution
    ...
```

### Rate Limit Headers

Response includes rate limit status:

```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1714022400
```

### Production Constraints

> **Warning**: Current rate limiting is in-memory only. Not suitable for multi-instance deployments.

For multi-instance, use Redis-based rate limiting:

```python
# Future: Redis rate limiting
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter

@app.on_event("startup")
async def startup():
    redis = redis.Redis(host='localhost', port=6379, db=0)
    await FastAPILimiter.init(redis)
```

---

## Authorization

### Project Ownership Verification

```python
# backend/src/dependencies.py — actual implementation
def verify_project_owner(project_id: int, current_user: User, session: Session):
    """校验项目存在且属于 current_user，返回 Project；失败抛 404/403。"""
    from src.models.project import Project

    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问此项目")
    return project
```

Contract: 404 `项目不存在` for a missing id, 403 `无权访问此项目` when the owner differs. The check is existence then ownership only — it does **not** filter `deleted_at`, so a soft-deleted project still resolves through this guard (list/visibility endpoints do their own `deleted_at` filtering).

### Resource Isolation Pattern

Subresource ownership helpers resolve the resource by id (404 when missing) and then delegate to `verify_project_owner` with the resource's own `project_id`; nested resources chain through their parent helper:

```python
# backend/src/dependencies.py — actual implementation
def verify_form_owner(form_id: int, current_user: User, session: Session):
    """校验表单存在且属于当前用户。"""
    from src.models.form import Form

    form = session.get(Form, form_id)
    if not form:
        raise HTTPException(status_code=404, detail="表单不存在")
    verify_project_owner(form.project_id, current_user, session)
    return form
```

The same shape covers `verify_field_definition_owner` (404 `字段定义不存在` → project check) and `verify_form_field_owner` (404 `表单字段不存在` → `verify_form_owner(form_field.form_id, ...)`).

### Scenario: Ownership Before Resource Membership Queries

#### 1. Scope / Trigger

- Trigger: any endpoint that resolves a project-scoped resource by id and then reads or writes it — including read-only query endpoints (reference lists, batch lookups, exports).
- Concrete incidents: (a) `GET /projects/{project_id}/codelists/{cl_id}/references` (`backend/src/routers/codelists.py`) skipped `verify_project_owner` and relied only on the dictionary/project membership helper, so a non-owner could read another user's dictionary references. Fixed by running `verify_project_owner(project_id, current_user, session)` BEFORE the existing membership helper. (b) The five codelist option mutations (`add_option`, `update_option`, `delete_option`, `batch_delete_options`, `reorder_options`) lacked the project-owner guard; a non-owner could mutate another project's option rows. Each now verifies project ownership before codelist membership and option lookup. The audit of `units.py`, `fields.py`, and `visits.py` found no additional missing owner guards.

#### 2. Contracts

| Rule | Why |
|---|---|
| Run user→project ownership (`verify_project_owner`) FIRST, before any resource-membership or business query | A membership helper answers "does this id belong to this project", not "may this user touch this project" — it can never substitute for the ownership check |
| Codelist option mutations (`add_option`, `update_option`, `delete_option`, `batch_delete_options`, `reorder_options`) must run the project-owner guard before codelist membership checks and option-id lookup | Knowing a project id or option id is not authority; guard order prevents cross-project reads/writes and an option-existence oracle |
| Authenticated ≠ authorized | `get_current_user` only proves identity; every project-scoped surface must additionally prove `project.owner_id == current_user.id` via `verify_project_owner`, which checks existence then ownership only and does NOT filter `deleted_at` (soft-deleted projects still resolve; visibility filtering lives in the listing endpoints) |
| Both query modes of one endpoint enforce the same guard | A query-parameter switch (e.g. `include_unplaced`) selects rows, never a weaker permission path |
| 403 for a foreign project, 404 for a missing own resource | Follows the project-wide convention; assertions must cover both status codes and both flag modes |
| A pre-check whose outcome changes the response (e.g. a batch-delete 409 reference guard) runs only over ids already proven to belong to the path project | Foreign or nonexistent ids must fall through to the project-filtered delete (200 with a smaller `deleted`) — letting them into the pre-check turns the 409-vs-200 difference into a cross-tenant "is it referenced?" oracle |

#### 3. Wrong vs Correct

```python
# WRONG - identity only; membership helper cannot see the caller
def get_codelist_references(project_id, cl_id, session, current_user):
    _get_codelist_with_project_check(session, cl_id, project_id)
    ...

# CORRECT - ownership gate first, then membership/detail checks
def get_codelist_references(project_id, cl_id, include_unplaced=False, session=None, current_user=None):
    verify_project_owner(project_id, current_user, session)
    _get_codelist_with_project_check(session, cl_id, project_id)
    ...
```

**Batch-delete pre-check scope (response-shaping pre-checks)**:

```python
# WRONG - the reference pre-check runs over the raw id list; a foreign id's
# referenced-ness leaks through the 409-vs-200 difference
ref_ids = set(
    session.scalars(select(FieldDefinition.codelist_id).where(FieldDefinition.codelist_id.in_(data.ids))).all()
)
if ref_ids:
    raise HTTPException(409, "部分字典被字段引用，无法删除")

# CORRECT - scope the pre-check to ids already proven to belong to the path
# project; foreign/nonexistent ids fall through to the project-filtered delete
owned_ids = set(
    session.scalars(
        select(CodeList.id).where(CodeList.id.in_(data.ids), CodeList.project_id == project_id)
    ).all()
)
ref_ids = set(
    session.scalars(select(FieldDefinition.codelist_id).where(FieldDefinition.codelist_id.in_(owned_ids))).all()
)
if ref_ids:
    raise HTTPException(409, "部分字典被字段引用，无法删除")
count = BaseRepository(session, CodeList).batch_delete(data.ids, project_id=project_id)
return {"deleted": count}
```

**Why wrong**: with the raw id list, `409` answers "someone's object with this id is referenced" for ids outside the path project — a cross-tenant oracle; the corrected shape answers `200 {"deleted": <own ids only>}` for any mix of foreign/nonexistent ids, byte-identically whether or not a foreign id is referenced (locked by `backend/tests/test_batch_delete_isolation.py`).

**Accepted residual**: the oracle closure holds for the victim-project path only. Via the caller's OWN project path, single-resource membership checks keep their existence distinction — a foreign codelist id still yields 403 `无权操作该字典` while a nonexistent id yields 404 `编码字典不存在`. Narrowing that distinction would change long-standing owner-facing status codes and is not part of the fix.

#### 4. Tests Required

`backend/tests/test_reference_delete_contract.py` locks the codelist reference guard for both `references` flag modes: foreign user → 403 (default and `include_unplaced=true`), valid owner → 200 with correct rows, missing own dictionary → 404, dictionary from another project → 403.

`backend/tests/test_codelist_option_authorization.py` adds 22 parameterized cases for the five option mutation routes (`POST …/options`, `PUT …/options/{opt_id}`, `DELETE …/options/{opt_id}`, `POST …/options/batch-delete`, `POST …/options/reorder`) and verifies: a foreign project owner gets 403 with no option changes or victim data; the actual project owner can still perform each operation; a missing own codelist remains 404; a codelist from another project remains 403 before option lookup; and missing update/delete option ids remain 404 for the owner. The expanded read-only audit of `units.py`, `fields.py`, and `visits.py` found no additional owner-guard gaps. Any new project-scoped query or mutation endpoint adds equivalent ownership-first checks.

### Admin Privileges

```python
async def verify_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(403, "Admin privileges required")
    return current_user
```

### Reserved Admin Account

- Production requires at least one reserved admin account
- Bootstrap password from config: `admin.bootstrap_password` or `CRF_ADMIN_BOOTSTRAP_PASSWORD`
- Auto-repair on startup if missing

---

## Security Headers

Production mode adds security headers:

```python
# backend/main.py
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)

    if settings.env == "production":
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"

    return response
```

---

## Production Requirements

### Mandatory Environment Variables

| Variable | Purpose |
|----------|---------|
| `CRF_ENV=production` | Enable production mode |
| `CRF_AUTH_SECRET_KEY` | JWT signing key (required) |
| `CRF_ADMIN_BOOTSTRAP_PASSWORD` | Initial admin password |

### Production Constraints

1. **JWT TTL**: Maximum 60 minutes
2. **Docs disabled**: `/docs`, `/redoc`, `/openapi.json` return 404
3. **Rate limiting**: Enabled for auth and import endpoints
4. **HTTPS**: Required for cookie security

---

## Common Mistakes

### 1. Forgetting to Check `auth_version`

```python
# WRONG - Token never invalidated
user = db.query(User).filter(User.id == payload["user_id"]).first()
return user

# CORRECT - Check auth_version
user = db.query(User).filter(User.id == payload["user_id"]).first()
if user.auth_version != payload["auth_version"]:
    raise HTTPException(401, "Token invalidated")
return user
```

### 2. Missing Resource Isolation

```python
# WRONG - Anyone can access any form
form = db.query(Form).filter(Form.id == form_id).first()

# CORRECT - Verify project ownership first
project = verify_project_owner(project_id, current_user, db)
form = db.query(Form).filter(
    Form.id == form_id,
    Form.project_id == project.id
).first()
```

### 3. Not Incrementing `auth_version` on Password Change

```python
# WRONG - Old tokens still valid
user.password_hash = hash_password(new_password)
db.commit()

# CORRECT - Invalidate all tokens
user.password_hash = hash_password(new_password)
user.auth_version += 1
db.commit()
```

### 4. Using In-Memory Rate Limiting in Multi-Instance

```python
# WRONG - Won't work with multiple instances
from .rate_limit import rate_limiter  # In-memory

# CORRECT - Use Redis for distributed rate limiting
from fastapi_limiter.depends import RateLimiter
```

---

## Tests Required

### Authentication Tests

| Test | Assertion |
|------|-----------|
| `test_login_success` | Returns valid JWT token |
| `test_login_wrong_password` | Returns 401 |
| `test_login_rate_limit` | Returns 429 after 5 failures |
| `test_token_expiration` | Returns 401 after TTL |
| `test_auth_version_invalidation` | Token rejected after password change |

### Authorization Tests

| Test | Assertion |
|------|-----------|
| `test_project_isolation` | User cannot access other's project |
| `test_admin_required` | Non-admin gets 403 |
| `test_user_admin.py::test_admin_can_list_active_projects_for_specific_user` | Project listings exclude soft-deleted projects (the `deleted_at.is_(None)` filter lives in `ProjectRepository`, not in `verify_project_owner`); soft-deleted projects surface only in the admin recycle-bin listing (`test_admin_project_ops.py::test_recycle_bin_returns_deleted_projects_with_owner_fields`) |
| `test_reference_delete_contract.py::test_codelist_references_*` | Reference endpoints enforce ownership in both flag modes: foreign user 403, owner 200, missing own dictionary 404, foreign-project dictionary 403 |
| `test_batch_delete_isolation.py` | Batch-delete 409 pre-check scoped to path-project ids: foreign referenced/unreferenced ids → identical 200 `{"deleted": 0}`; mixed own+foreign request deletes only own ids; own referenced ids still 409 |

### Rate Limit Tests

| Test | Assertion |
|------|-----------|
| `test_rate_limit_headers` | Headers present in response |
| `test_rate_limit_reset` | Limit resets after window |

---

## Related Files

| File | Purpose |
|------|---------|
| `backend/src/routers/auth.py` | Login, logout, change password |
| `backend/src/services/auth_service.py` | JWT, password hashing, token invalidation |
| `backend/src/rate_limit.py` | Rate limiting rules and middleware |
| `backend/src/dependencies.py` | Auth dependencies, resource isolation |
| `backend/tests/test_auth.py` | Authentication tests |
| `backend/tests/test_isolation.py` | Project isolation tests |
| `backend/tests/test_permission_guards.py` | Authorization tests |
| `backend/tests/test_reference_delete_contract.py` | Ownership guards on reference endpoints (both `include_unplaced` modes) |
