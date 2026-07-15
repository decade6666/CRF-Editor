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
| Main preview changes widths/heights, then user opens fullscreen designer | `openDesigner()` must rehydrate the fullscreen preview from localStorage before the dialog is used. |
| Fullscreen designer changes widths/heights, then user closes it | `handleDesignerBeforeClose()` must rehydrate the main preview before the dialog closes, so the page-level Word preview shows the latest overrides immediately. |

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
  - `useRowResize rehydrate reads latest persisted row heights`.
- `frontend/tests/quickEditBehavior.test.js`
  - `fullscreen designer preview rehydrates latest width and height overrides when opened`.
  - `closing fullscreen designer rehydrates main preview overrides before returning`.

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

---

## Scenario: Form Designer Leave Guards for Drafts and Field Autosave

### 1. Scope / Trigger

- Trigger: user leaves the active form-design editing context by one of four
  paths:
  1. closing the fullscreen designer dialog
  2. switching to another form inside `FormDesignerTab`
  3. switching to another project while the designer tab has already been activated
  4. leaving the workbench 「表单」Tab (`name="designer"`) via top-level `el-tabs`
- The designer maintains **two independent unsaved-state channels**:
  - local new-field draft state (`__draft__` row, not persisted yet)
  - field-property dirty baseline (`fieldPropBaseline` / `isFieldPropDirty`; explicit save, not autosave)
- Leaving must guard **both** channels; handling only one causes silent data loss
  or close-loop bugs.
- Workbench Tab leave is especially easy to miss: `watch(activeTab)` invalidates
  field-definition cache and bumps `refreshKey` when entering `fields`/`designer`,
  so an unguarded switch can wipe dirty property edits after the tab already changed.

### 2. Signatures

```javascript
// App.vue — project leave
if (isTabActivated('designer') && formDesignerTabRef.value?.canLeaveProject) {
  const canLeave = await formDesignerTabRef.value.canLeaveProject()
  if (!canLeave) return
}

// App.vue — workbench Tab leave (before v-model / activeTab watchers run)
async function onMainTabBeforeLeave(activeName, oldActiveName) {
  if (
    oldActiveName === 'designer' &&
    isTabActivated('designer') &&
    formDesignerTabRef.value?.canLeaveTab
  ) {
    return await formDesignerTabRef.value.canLeaveTab()
  }
  return true
}

// FormDesignerTab.vue
async function resolveDesignerLeave({ actionText }) => Promise<boolean>
async function canLeaveProject() => Promise<boolean>  // resolveDesignerLeave({ actionText: '切换项目' })
async function canLeaveTab() => Promise<boolean>      // resolveDesignerLeave({ actionText: '切换标签页' }) + discard rehydrate
async function resolveFieldPropLeave({ resetOptions, actionText } = {}) => Promise<boolean>
async function handleDesignerBeforeClose(done) => Promise<void>
async function confirmDiscardDraft() => Promise<boolean>
```

### 3. Contracts

| Field / Function | Type | Constraint |
|---|---|---|
| `hasDraft` | `ComputedRef<boolean>` | True when a local `__draft__` field exists; leaving must guard this before clearing form/project state. |
| `confirmDiscardDraft()` | `() => Promise<boolean>` | Three-way guard: save, discard, or abort. Used before switching form, selecting another field, creating another draft, and project/tab leave once the designer tab is activated. |
| `isFieldPropDirty` / `fieldPropBaseline` | computed + baseline snapshot | Explicit property-card dirty state; leave must confirm save/discard/abort via `resolveFieldPropLeave`. |
| `resolveDesignerLeave()` | `({ actionText }) => Promise<boolean>` | Shared leave chain for project/tab: busy/reorder/draft-save block → draft confirm → annotation flush → design-notes flush → `resolveFieldPropLeave({ preserveEditor: true, actionText })`. |
| `canLeaveProject()` | `() => Promise<boolean>` | Project switch entry; delegates to `resolveDesignerLeave({ actionText: '切换项目' })`. |
| `canLeaveTab()` | `() => Promise<boolean>` | Workbench Tab leave entry; delegates to `resolveDesignerLeave({ actionText: '切换标签页' })`. Because lazy tabs keep `FormDesignerTab` mounted, a successful discard with `preserveEditor` must rehydrate the selected field (or clear the editor) so returning to the designer does not show abandoned edits. |
| `resolveFieldPropLeave()` | `({ resetOptions, actionText }) => Promise<boolean>` | Unified property dirty confirm on dialog close / form switch / project switch / tab leave. |
| `missing_codelist` | classified error code | Treated as `discardable`; UI must offer “继续修改 / 放弃并<actionText>”. |
| non-discardable autosave errors | classified error | Must block leave and show a reason; do not silently re-open the dialog after close. |
| `handleDesignerBeforeClose` | Element Plus `before-close` hook | Must guard before actual close; avoid close-then-reopen rollback via `watch(showDesigner)`. |
| `App.vue:selectProject` | project switch entry | Must use `isTabActivated('designer')`, not only `activeTab === 'designer'`, because lazy tabs stay mounted after first activation. |
| `App.vue:onMainTabBeforeLeave` | Element Plus `el-tabs` `:before-leave` | Must run before `v-model`/`watch(activeTab)` cache invalidation. Only guard leave when `oldActiveName === 'designer'` and the designer tab is activated; other tab transitions stay open. Returning `false` (or a Promise that resolves to `false`) blocks the switch. |

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| Draft exists, user switches form | `confirmDiscardDraft()` runs before selection changes. |
| Draft exists, user switches project after designer tab has been activated once | `App.vue` still calls `canLeaveProject()` via `isTabActivated('designer')`; draft cannot be silently dropped. |
| Property card is dirty, user leaves 「表单」Tab | `onMainTabBeforeLeave` → `canLeaveTab` → `resolveFieldPropLeave({ actionText: '切换标签页' })`; close dialog stays on designer; save/discard may proceed. |
| Property discard on Tab leave with lazy-mounted designer | `canLeaveTab` rehydrates selected field (or clears editor) after successful discard so returning does not show abandoned values. |
| Field property leave fails with `missing_codelist` | Leave path shows discard confirmation; user may discard local property edits and continue leaving. |
| Field property leave fails with 5xx / network / 429 / 408 | Leave is blocked; UI shows explicit error message. |
| Dialog close path uses `watch(showDesigner)` rollback | **Bug.** Causes close-flash-reopen UX and hides the true failure reason. |
| Workbench Tab leave only uses `@tab-change` (post-switch) | **Bug.** Cannot veto; `watch(activeTab)` may already invalidate caches and lose dirty property edits. |
| Discarding field-property edits triggers extra reload during leave | Avoid when possible; introduces a new failure point while the user is trying to leave. |

### 5. Good / Base / Bad Cases

- **Good**: user changes a field to `单选` without selecting a dictionary → clicks close → designer shows discard confirmation → choosing discard closes the dialog without flash-reopen.
- **Good**: user dirties a property card on 「表单」 → clicks 「字段」 → unsaved confirm appears → closing the dialog keeps the designer tab active; cache refresh does not run.
- **Base**: property save succeeds → dialog closes / form switches / project switches / tab leaves with no extra prompts.
- **Bad**: project switch only checks `activeTab === 'designer'` → user activated designer earlier, moved to another tab, then switched project → mounted designer component loses local draft silently.
- **Bad**: close path first sets `showDesigner = false`, then watcher reopens it on failure → user sees “点 X 又弹回来” with no actionable exit.
- **Bad**: workbench Tab leave has no `:before-leave` → dirty property edits disappear when switching to 「字段」 and `refreshKey` reloads field definitions.

### 6. Tests Required

- `frontend/tests/quickEditBehavior.test.js`
  - assert `resolveFieldPropLeave`, `handleDesignerBeforeClose`, discardable `missing_codelist`, and no close-reopen watcher rollback.
  - assert `resolveDesignerLeave` / `canLeaveProject` / `canLeaveTab` wiring and `App.vue` `:before-leave="onMainTabBeforeLeave"`.
- `frontend/tests/designerHistory.test.js`
  - assert leave guards still block while busy/reorder/draft-save and that `canLeaveTab` rehydrates after discard.
- `frontend/tests/designerNewFieldDraft.test.js`
  - assert project switching uses `isTabActivated('designer') && formDesignerTabRef.value?.canLeaveProject`.
- Assertion points:
  - `missing_codelist` → `discardable: true`
  - `selectForm()` uses `resolveFieldPropLeave({ actionText: '切换表单' })`
  - `canLeaveProject()` delegates to `resolveDesignerLeave({ actionText: '切换项目' })`
  - `canLeaveTab()` delegates to `resolveDesignerLeave({ actionText: '切换标签页' })` and rehydrates after discard
  - main dialog uses `:before-close="handleDesignerBeforeClose"`
  - workbench tabs use `:before-leave="onMainTabBeforeLeave"`

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

---

## Designer History Busy / Session Residual Coordination

**Scope / Trigger**: `FormDesignerTab` in-memory undo/redo, form selection switching, field membership mutations (add/copy/remove/batch/save-draft/log-row), optimistic field reorder, and project leave.

**Contracts** (task `07-14-designer-history-busy-residual`):

1. **History generation** (`useDesignerHistory.js`): `clear()` advances a monotonic generation; successful undo/redo migrates stacks only when generation is unchanged; failures always restore id snapshots and rethrow.
2. **Committed session vs attempt**:
   - `formSelectionSession` advances only when a form selection is truly committed or the selected form disappears.
   - `formSelectionAttempt` supersedes pending switches (same-form reselect, busy leave, project leave cancel pending form switch) without invalidating still-current form history context.
3. **Same-form `reloadForms` identity**: if selected form still exists, `Object.assign` metadata onto the same object and map list entries back to that reference; do **not** invalidate session (avoids `watch(selectedForm)` reloading fields and wiping optimistic order).
4. **Stale backend success**: after write success, `invalidateCache` first, then `isCurrentDesignerHistoryContext` before UI reload / history record.
5. **Membership ↔ reorder mutual exclusion**:
   - `fieldMembershipMutationCount` / `begin` / `end` / `isFieldMembershipBusy` on six write paths only (`addField`, `copyFormField`, `removeField`, `batchDelete`, `saveDraftField`, `addLogRow`).
   - `newField` is **not** a membership counter path; it only rejects when history busy or reordering.
   - Reorder drag/keyboard/`persistFieldReorder` reject when membership busy; membership skips list reload when reorder is active after invalidate.
6. **Leave / draft-aware history**: history replay, reorder, or draft-save busy blocks form switch and project leave; undo/redo with a local draft confirms save/discard/cancel first and rechecks context.
7. **Property / quick / inline during reorder**: do not `loadFormFields` over optimistic order (`saveFieldProp` / `saveQuickEdit` / `toggleInline`); preserve concurrent `refreshKey.value++` on definition updates.

**Naming**: keep main helper name `isCurrentDesignerHistoryContext` (do not rename solely to match isolation trees).

**Forbidden**: whole-file overwrite of `FormDesignerTab.vue`, applying isolation full patches, `npm run format`, backend contract changes, or converting optimistic reorder success back into list reload.

