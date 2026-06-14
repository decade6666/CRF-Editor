# State Management

> How state is managed in this project.

---

## Overview

- **No Global Store Library**: No Vuex, Pinia, or Redux
- **Local State**: `ref()` and `reactive()` in components
- **Shared State**: `provide/inject` for deep component trees
- **Persistent State**: `localStorage` for token, theme
- **Server State**: Handled by `useApi.js` with in-memory cache

---

## State Categories

### 1. Local State (Component-scoped)

```javascript
// In component
const loading = ref(false)
const formData = reactive({
  name: '',
  description: ''
})

// Only this component can access
```

### 2. Shared State (provide/inject)

```javascript
// In parent (App.vue)
const refreshKey = ref(0)
const editMode = ref(false)

provide('refreshKey', refreshKey)
provide('editMode', editMode)

// In any child component
const refreshKey = inject('refreshKey')
const editMode = inject('editMode')
```

### 3. Persistent State (localStorage)

```javascript
// Token - persisted across sessions
const token = ref(localStorage.getItem('token') || '')

watch(token, (newToken) => {
  if (newToken) {
    localStorage.setItem('token', newToken)
  } else {
    localStorage.removeItem('token')
  }
})

// Theme - persisted
const theme = ref(localStorage.getItem('theme') || 'light')

// Return URL after login
sessionStorage.setItem('returnUrl', '/projects')
```

### 4. Column Width Persistence Contract

**Scope / Trigger**: any change to CRF preview column widths, column-resize persistence, `useColumnResize`, `buildTableInstanceId`, or preview consumers that read `localStorage['crf:designer:col-widths:*']`.

**Files and signatures**:

```javascript
// frontend/src/composables/useColumnResize.js
export function readColumnWidthRatios(formId, tableKind, expectedLength)
export function readColumnWidthRatiosWithFallback(formId, tableKind, expectedLength, legacyTableKind)
export function useColumnResize(formIdRef, tableKindRef, defaultsSource)
```

```javascript
// frontend/src/composables/useRowResize.js
export function buildTableInstanceId(kind, fields)
// Returns: `${kind}:fieldIds=${fields.map(f => f.id).filter(id => id != null).join(',')}`
```

**Storage contract**:

| Producer / Consumer | Path | Key format | Notes |
|---|---|---|---|
| Producer | `frontend/src/components/FormDesignerTab.vue` via `useColumnResize` | `crf:designer:col-widths:<form_id>:<kind>:fieldIds=<ids>` | Current authoritative format. |
| Legacy producer | old designer builds | `crf:designer:col-widths:<form_id>:<groupIndex>-<kind>-<colCount>` | Migrated by `migrateLegacyKeyIfNeeded`; old key is deleted after migration. |
| Consumers | `TemplatePreviewDialog.vue`, `SimulatedCRFForm.vue` | Prefer current format, fallback to legacy format | Use `readColumnWidthRatiosWithFallback`; do not copy local validation logic in components. |
| Export collector | `frontend/src/App.vue` | Scans `crf:designer:col-widths:<form_id>:<table_instance_id>` | Sends `table_instance_id` keys to backend export payload. |

**Validation matrix**:

| Condition | Expected behavior |
|---|---|
| New field-id key exists and legacy key also exists | `readColumnWidthRatiosWithFallback` returns the new field-id key value. |
| New key is absent and legacy key exists | Consumer reads the legacy key as compatibility fallback. |
| Stored value is not an array, has wrong length, ratios are outside `[0.1, 0.9]`, or sum differs from 1 by more than `1e-3` | Consumer returns `null` and falls back to planner defaults. |
| Designer opens a table with only a legacy key | `FormDesignerTab.vue:migrateLegacyKeyIfNeeded` copies it to the new key when the new key is absent, then deletes the legacy key. |
| `fields` changes | Callers must pass a rebuilt fields array; `buildTableInstanceId` may cache by fields reference. Do not mutate field ids in place. |

**Good / Base / Bad cases**:

- Good: designer writes `normal:fieldIds=1,2`; template preview reads the same key and mirrors the adjusted column widths.
- Base: no persisted key exists; previews use `planNormalColumnFractions` / `planInlineColumnFractions` / `planUnifiedColumnFractions` defaults.
- Bad: preview reads only `0-normal-2`; after designer migration deletes the legacy key, saved widths disappear from preview.
- Bad: caller mutates `fields[0].id` in place while reusing the same array reference; cached `buildTableInstanceId` can point at stale field ids.

**Required tests**:

- `frontend/tests/columnWidthPlanning.test.js`
  - `16.1.5e`: new field-id key wins over legacy key.
  - `16.1.5f`: legacy key fallback still works when the new key is absent.
  - `16.1.5g`: preview consumers use `buildTableInstanceId` and `readColumnWidthRatiosWithFallback`.
- `frontend/tests/rowHeightResize.test.js`
  - `buildTableInstanceId documents immutable fields reference cache contract`.

### 5. Server State (API cache)

```javascript
// In useApi.js
const cache = new Map()

// Structure: { data, timestamp }
cache.set('/projects', {
  data: [...],
  timestamp: Date.now()
})

// Auto-invalidated on mutations
```

---

## Scenario: Startup Auth Gate Before Workspace Rendering

### 1. Scope / Trigger

- Trigger: authentication state controls whether `App.vue` renders `LoginView`, `AdminView`, or the normal project workspace.
- This is a cross-layer auth contract because startup rendering depends on `GET /api/auth/me` and the `crf_token` localStorage key.
- The normal editor and admin workspace must not render until a saved token is verified.

### 2. Signatures

```javascript
// frontend/src/App.vue
const isCheckingAuth = ref(!!localStorage.getItem('crf_token'))
const isLoggedIn = ref(false)
const currentUser = ref({ username: '', is_admin: false })

async function loadMe(): Promise<boolean>
async function restoreSession(): Promise<void>
async function onLoginSuccess(): Promise<void>
function resetSessionState(): void
```

```http
GET /api/auth/me
Authorization: Bearer <localStorage.crf_token>
```

### 3. Contracts

| Contract | Field / State | Type | Constraint |
|----------|---------------|------|------------|
| Persistent token | `localStorage.crf_token` | string | Presence means "verify first", not "already logged in". |
| User response | `username` | string | Persist as `crf_last_username` after successful verification. |
| User response | `is_admin` | boolean | `true` renders admin shell; `false` renders normal project workspace. |
| Loading gate | `isCheckingAuth` | `Ref<boolean>` | `true` renders only `.auth-loading` with `aria-live="polite"`. |
| Login flag | `isLoggedIn` | `Ref<boolean>` | Set to `true` only after `loadMe()` succeeds. |
| Project data | `projects` | `Ref<Array>` | Load only for verified non-admin users. |

### 4. Validation & Error Matrix

| Condition | Expected behavior |
|-----------|-------------------|
| No `crf_token` on startup | Set `isLoggedIn=false`, `isCheckingAuth=false`, render `LoginView`, do not call `loadProjects()`. |
| `GET /api/auth/me` returns 200 | Store user in `currentUser`, remember username, set `isLoggedIn=true`. |
| Verified admin user | Clear normal project state and render `AdminView`; do not load projects. |
| Verified ordinary user | Render normal workspace after `loadProjects()` resolves. |
| `GET /api/auth/me` returns 401 | `useApi.js` removes `crf_token`; `restoreSession()` calls `resetSessionState()` and renders `LoginView`. |
| Any `loadMe()` failure | Reset `currentUser` to the empty user and return `false`; callers must not render authenticated workspaces. |

### 5. Good / Base / Bad Cases

- Good: saved valid ordinary-user token -> loading gate -> `/api/auth/me` succeeds -> projects load -> normal workspace renders.
- Base: no saved token -> login screen renders immediately with no auth check request.
- Bad: saved expired token -> token is cleared -> session state resets -> login screen renders before any project request.

### 6. Tests Required

- `frontend/tests/appSettingsShell.test.js` must assert `isCheckingAuth` initializes from `crf_token` presence.
- Assert template order: auth loading gate -> `LoginView` -> admin shell -> normal workspace.
- Assert `loadMe()` returns `true` only after `/api/auth/me` succeeds and returns `false` on catch.
- Assert `restoreSession()` calls `resetSessionState()` and returns before `loadProjects()` when verification fails.
- Assert admin login clears normal project state and does not render the normal project shell.

### 7. Wrong vs Correct

#### Wrong

```javascript
// Treating token presence as authenticated leaks editor/admin UI before verification.
const isLoggedIn = ref(!!localStorage.getItem('crf_token'))
onMounted(loadProjects)
```

#### Correct

```javascript
const isCheckingAuth = ref(!!localStorage.getItem('crf_token'))
const isLoggedIn = ref(false)

async function restoreSession() {
  if (!localStorage.getItem('crf_token')) {
    isCheckingAuth.value = false
    return
  }
  const authenticated = await loadMe()
  if (!authenticated) return resetSessionState()
  isLoggedIn.value = true
  if (!isAdmin.value) await loadProjects()
  isCheckingAuth.value = false
}
```

---

## When to Use Global State

### Use provide/inject When:

- State shared by many components in a subtree
- Avoiding prop drilling (passing through 3+ levels)
- State is reactive and needs updates

Example:
```javascript
// App.vue - global state
const currentUser = ref(null)
provide('currentUser', currentUser)

// Any child can access
const user = inject('currentUser')
```

### Use localStorage When:

- State must persist across page reloads
- Small data (token, theme preference)

Example:
```javascript
const token = ref(localStorage.getItem('token') || '')

watch(token, (val) => {
  if (val) localStorage.setItem('token', val)
  else localStorage.removeItem('token')
})
```

### Do NOT Create Global State When:

- Data can be fetched from API
- Only 1-2 components need it
- Data is computed from props

---

## Scenario: refreshKey Global Bump for Cross-Tab Synchronization

### 1. Scope / Trigger

- Trigger: a write in one tab (e.g., CodelistsTab renames a dictionary) must
  immediately update data displayed in another tab (FormDesignerTab shows the
  old name in field properties).
- This is a cross-tab data-sync contract because multiple lazy-loaded tabs
  independently fetch their own API data via `cachedGet`, and no global store
  exists to broadcast mutations.

### 2. Signatures

```javascript
// App.vue — provider
const refreshKey = ref(0)
provide('refreshKey', refreshKey)

// Any child component — consumer (injection returns the SAME ref object)
const refreshKey = inject('refreshKey', ref(0))

// Mutating from any consumer triggers all other consumers' watchers:
refreshKey.value++
```

### 3. Contracts

| Field / State | Type | Constraint |
|---|---|---|
| `refreshKey` | `Ref<number>` | Monotonically incrementing integer; the actual value is meaningless — only the change event matters. |
| Provider | `App.vue` | Must be the single `provide()` call; never duplicate in child components. |
| Consumer watch | `watch(refreshKey, ...)` | Must call `load*()` functions to re-fetch API data (which may hit `cachedGet`; cache was already invalidated by `_autoInvalidate` on the write that triggered the bump). |
| Write path | Service/Tab that mutated data | Must call `api.invalidateCache(urlPrefix)` **before** bumping `refreshKey`; otherwise consumers fetch stale cached data on their next `cachedGet`. |

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| Tab writes codelist, does NOT bump `refreshKey` | Other tabs show stale dictionary names until user manually navigates away and back. **Bug.** |
| Tab bumps `refreshKey` but does NOT invalidate cache first | Consumers' watchers fire, but `cachedGet` returns stale data from the still-warm cache. **Bug.** |
| Correct sequence: `invalidateCache → load (own) → refreshKey++` | Other tabs' watchers fire, `cachedGet` misses invalidated entry, fetches fresh data from network. **Correct.** |
| `reload()` bumps `refreshKey` and also calls `load()` | Own watcher fires again → redundant `load()` call. Harmless (single extra network round-trip with warm cache); acceptable to keep code simple. |

### 5. Good / Base / Bad Cases

- **Good**: `CodelistsTab.updateCl` → `api.invalidateCache(/codelists)` →
  `load()` → `refreshKey.value++` → `FormDesignerTab` watcher fires →
  `loadCodelists()` + `loadFormFields()` → new dictionary name visible in
  field property editor.
- **Base**: Only `CodelistsTab.reload()` runs without bump → dictionary name
  updates only inside CodelistsTab; FormDesignerTab shows stale name until
  user switches tabs.
- **Bad**: Bump `refreshKey` without `invalidateCache` → watcher fires but
  `cachedGet` returns 30s-cached stale data; user sees no change.

### 6. Tests Required

- `frontend/tests/` must verify that `CodelistsTab` exposes a watchable
  `refreshKey` (injected from `App.vue`).
- Source-level assertion: after `updateCl` resolves, `refreshKey.value`
  has incremented by at least 1.

### 7. Wrong vs Correct

#### Wrong

```javascript
// CodelistsTab — bump without invalidating cache
async function updateCl() {
  await api.put(`/api/projects/${pid}/codelists/${id}`, data)
  refreshKey.value++   // other tabs fire but cachedGet returns stale data
}
```

#### Correct

```javascript
// CodelistsTab — invalidate first, then bump
async function reload() {
  api.invalidateCache(`/api/projects/${pid}/codelists`)
  await load()          // own tab gets fresh data
  refreshKey.value++    // other tabs' watchers fire → fresh fetch
}
```

---

## Server State

### API Cache Strategy

```javascript
// In useApi.js
const cache = new Map()
const DEFAULT_TTL = 60000 // 1 minute

async function get(endpoint, options = {}) {
  const { ttl = DEFAULT_TTL, skipCache = false } = options

  // 1. Check cache
  if (!skipCache && cache.has(endpoint)) {
    const { data, timestamp } = cache.get(endpoint)
    if (Date.now() - timestamp < ttl) {
      return data
    }
  }

  // 2. Fetch and cache
  const data = await fetchAndParse(endpoint)
  cache.set(endpoint, { data, timestamp: Date.now() })
  return data
}
```

### Cache Invalidation

```javascript
// On POST/PUT/DELETE
async function post(endpoint, body) {
  const result = await fetchAndParse(endpoint, { method: 'POST', body })

  // Invalidate related cache
  const resource = endpoint.split('/')[1]
  for (const key of cache.keys()) {
    if (key.startsWith(`/${resource}`)) {
      cache.delete(key)
    }
  }

  return result
}
```

### Manual Refresh

```javascript
// Skip cache for fresh data
const freshData = await get('/projects', { skipCache: true })

// Or clear cache
cache.clear()
```

---

## Derived State

### Computed Properties

```javascript
// Derived from reactive source
const projects = ref([])

const activeProjects = computed(() =>
  projects.value.filter(p => !p.archived)
)

const projectCount = computed(() => projects.value.length)
```

### Computed with Dependencies

```javascript
const searchQuery = ref('')
const projects = ref([])

const filteredProjects = computed(() => {
  if (!searchQuery.value) return projects.value
  return projects.value.filter(p =>
    p.name.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
})
```

---

## Common Mistakes

### 1. Creating Unnecessary Global State

```javascript
// WRONG - Global store for data that can be fetched
const globalProjects = ref([])  // in some store.js

// CORRECT - Fetch when needed, cache in useApi
const { get } = useApi()
const projects = await get('/projects')
```

### 2. Not Using localStorage for Persistence

```javascript
// WRONG - Lost on refresh
const token = ref('')

// CORRECT - Persisted
const token = ref(localStorage.getItem('token') || '')
```

### 3. Prop Drilling Instead of provide/inject

```javascript
// WRONG - Pass through 5 components
<GrandParent :user="user">
  <Parent :user="user">
    <Child :user="user">
      <GrandChild :user="user" />

// CORRECT - Use provide/inject
// In GrandParent
provide('user', user)

// In GrandChild
const user = inject('user')
```

### 4. Not Clearing State on Logout

```javascript
// WRONG - Stale data remains
function logout() {
  token.value = ''
  router.push('/login')
}

// CORRECT - Clear all state
function logout() {
  token.value = ''
  currentUser.value = null
  cache.clear()
  router.push('/login')
}
```
