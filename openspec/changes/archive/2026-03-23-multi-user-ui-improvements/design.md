# Technical Design — multi-user-ui-improvements

## Architecture Decisions

### AD-1: itsdangerous Cookie over JWT

**Decision**: Use `itsdangerous.TimestampSigner` signed Cookie for session auth.

**Rationale**:
- Frontend and backend are same-origin; no cross-domain auth needed
- `HttpOnly` Cookie prevents XSS token theft; JWT stored in `localStorage` does not
- No manual `Authorization` header management in frontend composables
- `itsdangerous` is already an indirect FastAPI dependency; no new package required

**Trade-off**: Cookie-based auth does not support mobile apps or third-party API clients, but that is out of scope.

### AD-2: Per-user SQLite Engine Cache

**Decision**: Maintain `_user_engines: dict[str, Engine]` keyed by normalized `username`. Engines are created lazily on first authenticated request.

**Rationale**:
- SQLite does not support a single multi-user connection pool
- Creating engines per request would re-run WAL setup and migrations on every call
- Lazy init avoids startup cost for inactive users

**Concurrency**: WAL mode + `busy_timeout=5000ms` allows concurrent reads; serialized writes per user DB via SQLite's single-writer model. This is sufficient for the target use case (small team, internal network).

### AD-3: Separate users.db

**Decision**: User records are stored in `data/users.db`, separate from per-user business DBs.

**Rationale**:
- Auth depends on `users.db` before knowing which user DB to open
- Eliminates circular dependency between auth layer and per-user DB router
- Admin queries (list all users, count projects) do not need to open every user DB

### AD-4: Soft-delete for Users

**Decision**: `DELETE /api/admin/users/{username}` sets `is_deleted=1`; files are not removed.

**Rationale**:
- Hard-deleting files on Windows while the engine cache may hold open handles is unreliable
- Soft-delete is reversible if admin makes an error
- Files can be manually purged by an operator when disk space is needed

### AD-5: ProjectCopyService as Standalone Service

**Decision**: Extract `ProjectCopyService` from the router layer. Expose two methods:
- `copy_within_db(session, project_id) -> Project`
- `copy_across_db(src_session, dst_session, project_id) -> Project`

**Rationale**:
- Same algorithm for Req 8 (same-user copy) and Req 1 Admin push (cross-user copy)
- Router stays thin; service owns the ordered flush + ID mapping logic
- `copy_across_db` only reads from `src_session`, only writes to `dst_session`, avoiding distributed transaction complexity

### AD-6: Sort State via Component-local ref (not Composable)

**Decision**: Each tab component owns its own `sortOrder = ref('asc'|'desc')`. No shared composable extracted.

**Rationale**:
- Only 5 components need this; a composable would add indirection without benefit
- App.vue can reset sort state by providing a `resetSortKey` prop/inject that watchers observe
- Gemini suggested a `useTableSort` composable — rejected as over-engineering for 5 files

### AD-7: Sort + Draggable Mutual Exclusion

**Decision**: When `sortOrder` is non-default (i.e., user has clicked the toggle), bind `:disabled="true"` on `<draggable>`.

**Rationale**:
- Dragging when display order differs from `order_index` order would save incorrect `order_index` values
- Disabling drag is the safest UX signal; user must reset sort to re-enable drag

---

## Module Layout

### New Backend Files

```
backend/src/
  auth/
    models.py          # User SQLAlchemy model (users.db)
    engine.py          # get_users_engine(), users Session
    service.py         # hash_password(), verify_password(), create_token(), verify_token()
    dependencies.py    # require_user, require_admin FastAPI depends
  routers/
    auth.py            # POST /api/auth/login, /logout, GET /me
    admin.py           # /api/admin/users/* routes
  services/
    project_copy_service.py  # ProjectCopyService
  database.py          # Extended: get_user_engine(username), dispose_user_engine(username)
  config.py            # Extended: get_config(username), update_config(username, ...)
```

### New Frontend Files

```
frontend/src/
  components/
    LoginPage.vue      # Login form (username + password)
    AdminPanel.vue     # Admin user management UI
```

### Modified Backend Files

| File | Change |
|------|--------|
| `database.py` | Add per-user engine cache, WAL setup, per-user init_db |
| `config.py` | Add username parameter to get_config / update_config |
| `main.py` | Mount auth router, admin router; add startup bootstrap |
| `routers/projects.py` | Add `POST /copy` endpoint; inject require_user |
| `routers/settings.py` | Pass current_user to get_config / update_config |
| `routers/import_template.py` | Pass current_user to config |
| `services/ai_review_service.py` | Accept user-scoped config instead of global |
| `services/export_service.py` | Accept user-scoped config instead of global |
| All other routers | Add `current_user: User = Depends(require_user)` + user-scoped DB session |

### Modified Frontend Files

| File | Change |
|------|--------|
| `App.vue` | Login interception, currentUser state, header logout, 复制/删除 buttons |
| `components/ProjectInfoTab.vue` | Move 试验名称 form-item (Req 2) |
| `components/CodelistsTab.vue` | Tooltip (Req 3), style (Req 4), default sort (Req 5), sort toggle (Req 6) |
| `components/UnitsTab.vue` | Sort toggle (Req 6) |
| `components/FieldsTab.vue` | Sort toggle (Req 6) |
| `components/VisitsTab.vue` | Sort toggle (Req 6) |
| `components/FormDesignerTab.vue` | Sort toggle (Req 6, if 序号 col exists) |

---

## Data Flow

### Login Flow
```
Browser                       FastAPI
  POST /api/auth/login  →     verify bcrypt(password, users.db)
                              create TimestampSigner token
                         ←    Set-Cookie: crf_session=<token>; HttpOnly; SameSite=Lax
  (subsequent requests carry Cookie automatically)
```

### Per-request User Resolution
```
Request (Cookie present)
  → require_user dependency
    → verify_token(cookie) → username
    → load User from users.db (check is_deleted)
    → get_user_engine(username) → engine
    → yield (current_user, user_session)
  → Route handler uses user_session for all DB ops
```

### Project Copy Flow
```
POST /api/projects/{id}/copy
  → require_user → current_user
  → ProjectCopyService.copy_within_db(user_session, project_id)
    1. SELECT full tree (eager load all relations)
    2. INSERT Project (name+副本, logo=null)
    3. flush → get new project.id
    4. INSERT CodeList × N → flush → codelist_id_map
    5. INSERT CodeListOption × N (remap codelist_id) → flush
    6. INSERT Unit × N → flush → unit_id_map
    7. INSERT FieldDefinition × N (remap codelist_id, unit_id) → flush → fd_id_map
    8. INSERT Form × N → flush → form_id_map
    9. INSERT FormField × N (remap field_definition_id; null stays null)
    10. INSERT Visit × N → flush → visit_id_map
    11. INSERT VisitForm × N (remap form_id)
    12. COMMIT → return new Project
  ← 201 ProjectResponse
```

---

## PBT Properties (Property-Based Testing)

| Property | Invariant | Falsification Strategy |
|----------|-----------|----------------------|
| Auth gate | `isLoggedIn=false` → zero project API calls emitted | Intercept all `fetch` calls; assert none target `/api/projects` when `isLoggedIn=false` |
| Sort monotonicity (asc) | `sortOrder='asc'` → `list[i].order_index <= list[i+1].order_index` for all i | Generate random `order_index` values, apply sort, verify each adjacent pair |
| Sort monotonicity (desc) | `sortOrder='desc'` → `list[i].order_index >= list[i+1].order_index` for all i | Same as above, reversed |
| Copy count | After successful copy: `projects.length === before + 1` | Mock API success, assert list length delta |
| Copy isolation | Copied project `id` ≠ source `id`; all FK references point within new project | Query new project's FieldDefinitions; verify `codelist_id` all ∈ new project's CodeList ids |
| Copy rollback | After failed copy: `projects.length === before` | Mock API 500, assert list length unchanged |
| Drag disabled invariant | `sortOrder !== null` → `draggable.disabled === true` | Set sortOrder to 'asc', query draggable component :disabled prop |
| User isolation | User A's session cookie cannot access User B's projects | Attempt `GET /api/projects` with User A cookie while acting as User B; assert 0 intersection |
| Soft-delete auth | Soft-deleted user cannot authenticate | Set `is_deleted=1` for user, attempt login, assert 401 |
