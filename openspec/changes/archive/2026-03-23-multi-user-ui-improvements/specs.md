# Functional Specifications — multi-user-ui-improvements

## Scope

8 requirements across 4 implementation phases. Phases A and B are pure frontend; Phase C adds one backend endpoint; Phase D is a full multi-user architecture change.

---

## Phase A — Pure Frontend UI Adjustments (Req 2, 3, 4, 7)

### Req 2 — 项目信息布局：试验名称位置调整

**File**: `frontend/src/components/ProjectInfoTab.vue`

**Change**: Move `<el-form-item label="试验名称">` from the `[项目信息]` section to the first row inside the `[封面页信息]` section. No data model or API change.

**Acceptance**:
- [ ] `试验名称` el-form-item appears immediately after the `封面页信息` el-divider
- [ ] No other form items change position
- [ ] Save and data binding still work correctly after move

---

### Req 3 — 选项界面：字典名称过长省略 + tooltip

**File**: `frontend/src/components/CodelistsTab.vue`

**Change**: Wrap `<b>{{ selected.name }}</b>` with `el-tooltip`. Apply truncation style to the inner `<b>` tag.

**Exact Target**:
```html
<el-tooltip :content="selected.name" placement="top" :disabled="!selected || selected.name.length <= 20">
  <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;display:inline-block;vertical-align:bottom">
    {{ selected.name }}
  </b>
</el-tooltip>
```

**Acceptance**:
- [ ] Names longer than `max-width` display `...`
- [ ] Hovering over a truncated name shows full name in tooltip
- [ ] Names that fit within `max-width` do not trigger tooltip

---

### Req 4 — 选项界面：标签列样式与编码值列一致

**File**: `frontend/src/components/CodelistsTab.vue`

**Change**: Align the `标签` column CSS with the `编码值` column. Both columns must share `font-size: 13px` and the same vertical alignment strategy.

**Constraint**: The `标签` column keeps `flex: 1` (elastic width). The `编码值` column keeps `width: 100px; flex-shrink: 0`.

**Acceptance**:
- [ ] Both columns use `font-size: 13px`
- [ ] Both columns are vertically aligned consistently (either both `align-items: center` or both `vertical-align: middle`)
- [ ] No layout breakage

---

### Req 7 — 项目列表：删除按钮改名 + 常显

**File**: `frontend/src/App.vue`

**Change**: Replace `<span class="del-btn" @click.stop="deleteProject(p)">✕</span>` with:
```html
<el-button type="danger" size="small" link @click.stop="deleteProject(p)">删除</el-button>
```
Remove hover-only CSS from `.del-btn` if present.

**Acceptance**:
- [ ] Each project row shows a `删除` text button at all times (no hover required)
- [ ] Click still triggers the existing confirmation dialog before deleting
- [ ] Button does not affect project selection on click (`.stop` propagation maintained)

---

## Phase B — Frontend Sort Logic (Req 5, 6)

### Req 5 — 选项界面：默认按序号倒序排列

**File**: `frontend/src/components/CodelistsTab.vue`

**Change**: When `selected` changes (watcher), sort `selected.options` descending by `order_index` as the initial display order. This is the initial state for the Req 6 sort toggle.

**Constraint**:
- Do NOT use a `computed` property that would break `vuedraggable` two-way binding
- Sort in place on a local reactive copy; the save/reorder API path must not be affected
- Default `sortOrder` ref value = `'desc'` (aligns with Req 6)

**Acceptance**:
- [ ] On opening the codelists tab, options are displayed descending (largest `order_index` first)
- [ ] Switching to a different codelist reflects the same descending default
- [ ] Saving / drag-reordering still persists the correct `order_index` to the backend

---

### Req 6 — 所有含序号列界面：列头切换正倒序

**Files**:
- `frontend/src/components/CodelistsTab.vue` (left dict table + right options draggable)
- `frontend/src/components/UnitsTab.vue`
- `frontend/src/components/FieldsTab.vue`
- `frontend/src/components/VisitsTab.vue`
- `frontend/src/components/FormDesignerTab.vue` (only if `序号` column exists)

**Change per file**:
1. Add `const sortOrder = ref('desc')` (default descending per Req 5; other tabs default `'asc'`)
2. Add sort toggle icon (`↑` when `asc`, `↓` when `desc`) in `序号` column header; clicking toggles between `'asc'` and `'desc'`
3. For `el-table` tabs: modify existing `filteredXxx` computed to apply `sortOrder` on `order_index` after the existing filter logic
4. For draggable (CodelistsTab right panel): use a sorted local ref; bind `:disabled="sortOrder !== null"` on `<draggable>` to disable drag when a sort is active

**Sort state lifecycle**:
- Each tab maintains its own independent `sortOrder` ref
- `sortOrder` resets to default when `selectedProject` changes (watch in App.vue or via prop/inject)
- `sortOrder` is retained when switching between tabs within the same project

**Icon style**: Use Element Plus Icons `ArrowUp` / `ArrowDown`; active icon highlighted with `color: var(--el-color-primary)`; inactive icon in `color: var(--color-text-secondary)`.

**Constraint**: `el-input-number` for `order_index` editing must remain visible and functional at all times.

**Acceptance**:
- [ ] Every targeted tab has a clickable ↑↓ icon in the `序号` column header
- [ ] Clicking the icon immediately re-renders the list in the opposite order
- [ ] Draggable is disabled when `sortOrder` is active in CodelistsTab right panel
- [ ] `el-input-number` still works and saves `order_index` to backend
- [ ] Switching projects resets all sort orders to their per-tab defaults
- [ ] Switching tabs within a project preserves sort state

---

## Phase C — Project Copy (Req 8)

### Req 8 — 项目列表：复制按钮（完整深拷贝）

#### Backend

**File**: `backend/src/routers/projects.py` (new endpoint), `backend/src/services/project_copy_service.py` (new service)

**New endpoint**: `POST /api/projects/{project_id}/copy`
- Auth: logged-in user (Phase D; for Phase C, no auth yet)
- Response `201`: full `ProjectResponse` of the newly created project
- Response `404`: project not found
- Response `500`: unexpected copy failure (transaction rolled back)

**Copy algorithm** (single transaction, ordered flush):
1. Load source project with full tree: `Project` → `CodeList` + `CodeListOption` → `Unit` → `FieldDefinition` → `Form` + `FormField` → `Visit` + `VisitForm`
2. Create new `Project`: name = `"{original_name}(副本)"`, `company_logo_path = null`, all other fields copied, `created_at` = now
3. Copy `CodeList` records, flush → build `codelist_id_map: {old_id: new_id}`
4. Copy `CodeListOption` records (mapped `codelist_id`), flush
5. Copy `Unit` records, flush → build `unit_id_map`
6. Copy `FieldDefinition` records (remap `codelist_id`, `unit_id`), flush → build `field_def_id_map`
7. Copy `Form` records, flush → build `form_id_map`
8. Copy `FormField` records (remap `field_definition_id`; keep `null` if originally `null`)
9. Copy `Visit` records, flush → build `visit_id_map`
10. Copy `VisitForm` records (remap `form_id`)
11. Commit. On any exception: rollback, raise `HTTPException(500)`

**Constraint**: `order_index`, `sequence`, `code`, `weigh`, `sort_order` values are preserved as-is. No unique constraint conflicts because all uniqueness is scoped to project/visit.

#### Frontend

**File**: `frontend/src/App.vue`

**Change**:
- Add `<el-button type="primary" size="small" link :loading="copyingProjectId === p.id" @click.stop="copyProject(p)">复制</el-button>` left of `删除` button
- Add `const copyingProjectId = ref(null)`
- Implement `copyProject(p)`: set `copyingProjectId = p.id`, call `POST /api/projects/{p.id}/copy`, on success refresh project list and select new project, reset `copyingProjectId = null`; on failure show error toast, reset `copyingProjectId`

**Acceptance**:
- [ ] `复制` button appears left of `删除` in every project row
- [ ] Clicking shows loading spinner; button disabled until complete
- [ ] New project name is `"{original}(副本)"`
- [ ] New project contains all data (codelists/units/fields/forms/visits) with correct ID remapping
- [ ] `company_logo_path` is `null` in new project
- [ ] Copy failure shows error message; project list unchanged
- [ ] Transaction rollback on failure (no partial data in DB)

---

## Phase D — Multi-user Auth & Data Isolation (Req 1)

### Req 1 — 多用户认证与数据隔离

#### Authentication

**Method**: itsdangerous `TimestampSigner` signed Cookie
- Cookie name: `crf_session`
- Attributes: `HttpOnly=true`, `SameSite=Lax`, `Path=/`
- Payload: `{username, is_admin}`
- TTL: 86400s (24h)

**Password storage**: `passlib[bcrypt]`, cost factor 12

**Username constraints**: 3–32 chars, pattern `^[a-z0-9_-]+$` (lowercase, digits, underscore, hyphen)

#### User Storage

**File**: `data/users.db` (new, separate from per-user business DBs)

**Schema**:
```sql
CREATE TABLE user (
  username     TEXT PRIMARY KEY,
  hashed_password TEXT NOT NULL,
  is_admin     INTEGER NOT NULL DEFAULT 0,
  is_deleted   INTEGER NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### Admin Bootstrap

On startup, if `users` table has zero non-deleted rows:
1. Read `ADMIN_PASSWORD` from environment
2. If unset: generate a 16-char random password, print to console:
   ```
   [CRF-Editor] Admin account created. Username: admin  Password: <generated>
   ```
3. Create `admin` user with `is_admin=1`

#### Per-user Database

- Path: `data/{username}.db`
- Engine created on first access, cached in `_user_engines: dict[str, Engine]`
- On creation: `PRAGMA journal_mode=WAL`, `PRAGMA foreign_keys=ON`, `PRAGMA busy_timeout=5000`, `PRAGMA synchronous=NORMAL`
- All existing business tables created via `Base.metadata.create_all(engine)` + migration functions
- Engine disposed before deleting user files

#### Per-user Config

- Path: `data/{username}/config.yaml`
- Created with defaults if not present
- `get_config(username)` replaces global `get_config()`
- `update_config(username, ...)` replaces global `update_config()`

#### Data Migration

**Policy**: No automatic migration. Existing `crf.db` is not touched. New multi-user mode starts fresh.

#### User Deletion

**Policy**: Soft-delete only. Set `is_deleted=1` in `users` table. Files (`data/{username}.db`, `data/{username}/config.yaml`) are retained on disk. Engine cache entry is disposed and removed.

#### New Backend Routes

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/login` | public |
| POST | `/api/auth/logout` | logged-in |
| GET | `/api/auth/me` | logged-in |
| GET | `/api/admin/users` | admin |
| POST | `/api/admin/users` | admin |
| POST | `/api/admin/users/{username}/reset-password` | admin |
| DELETE | `/api/admin/users/{username}` | admin (soft-delete) |
| GET | `/api/admin/users/{username}/projects` | admin |
| POST | `/api/admin/users/{src_username}/projects/{project_id}/push` | admin |

All existing business routes require `require_user` dependency; admin-only routes require `require_admin`.

#### Frontend

**File**: `frontend/src/App.vue`

- Add `const isLoggedIn = ref(false)` and `const currentUser = ref(null)`
- On mount: call `GET /api/auth/me`; on 200 set `isLoggedIn=true, currentUser=data`; on 401 set `isLoggedIn=false`
- Wrap entire app body in `<template v-if="isLoggedIn">` with `<LoginPage v-else>`
- Header: show `currentUser.username` + `注销` button (calls logout API, sets `isLoggedIn=false`)
- New `LoginPage.vue` component: username + password inputs, submit calls `POST /api/auth/login`
- New `AdminPanel.vue` component (accessible to admin users): user list, create/reset/delete users, view user projects, push project to user

**Acceptance**:
- [ ] Unauthenticated access to `/` shows login page; no project API calls made
- [ ] User A's projects are not visible to User B
- [ ] Admin user can access `/admin` panel
- [ ] Logout clears session; subsequent navigation shows login page
- [ ] Concurrent POST requests from multiple users do not produce DB lock errors
- [ ] Admin can push project from one user to another
- [ ] Soft-deleted users cannot log in
