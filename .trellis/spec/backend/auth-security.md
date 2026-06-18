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
# backend/src/dependencies.py
async def verify_project_owner(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Project:
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == current_user.id,
        Project.deleted_at.is_(None)
    ).first()

    if not project:
        raise HTTPException(404, "Project not found")

    return project
```

### Resource Isolation Pattern

All subresources (visits, forms, fields) must verify parent chain:

```python
async def verify_form_owner(
    form_id: int,
    project: Project = Depends(verify_project_owner),
    db: Session = Depends(get_db)
) -> Form:
    form = db.query(Form).filter(
        Form.id == form_id,
        Form.project_id == project.id
    ).first()

    if not form:
        raise HTTPException(404, "Form not found")

    return form
```

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
project = await verify_project_owner(project_id, current_user, db)
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
| `test_soft_delete_isolation` | Deleted projects not accessible |

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
