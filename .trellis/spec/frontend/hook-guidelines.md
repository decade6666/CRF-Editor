# Hook Guidelines

> How hooks (composables) are used in this project.

---

## Overview

- **Naming**: Stateful composables start with the `use` prefix; pure stateless helper modules in `composables/` may use domain names such as `searchRanking.js`.
- **Purpose**: Encapsulate and reuse stateful logic
- **Return**: Return reactive refs and functions
- **API Layer**: ALL API calls go through `useApi.js`

---

## Pure Helper Modules in `composables/`

Pure stateless helpers may live in `frontend/src/composables/` when several components need the same behavior and no Vue lifecycle state is required. These modules do not need the `use*` prefix.

### Scenario: Ranked Fuzzy Search

#### 1. Scope / Trigger

- Trigger: any user-facing list search box that filters frontend-held rows and displays a ranked fuzzy result list.
- Current shared helper: `frontend/src/composables/searchRanking.js`.
- Current consumers: `CodelistsTab.vue`, `UnitsTab.vue`, `FieldsTab.vue`, `FormDesignerTab.vue`, and `VisitsTab.vue`.

#### 2. Signatures

```javascript
function normalizeSearchText(value): string
function rankFuzzyMatches(items, keyword, getCandidates): Array
```

- `items`: the already ordered source list; empty keyword returns this list unchanged.
- `keyword`: user-entered search text; normalized with `String(value ?? '').trim().toLowerCase()`.
- `getCandidates(item)`: returns one candidate value or an array of candidate values to match against.

#### 3. Contracts

| Step | Rule | Why |
|---|---|---|
| Caller builds base order first | Sort by existing `order_index` / `id` rules before calling `rankFuzzyMatches` | Empty search and equal-rank ties must preserve the existing UI order. |
| Empty keyword | Return `items` unchanged | Clearing search must restore the exact base list and keep drag-order behavior stable. |
| Exact match | Candidate text equal to keyword ranks before partial-only matches | Users see the strongest semantic match first. |
| Partial match | Sort by shortest matching candidate text length | Among partial-only matches, shorter matched text is more specific. |
| Multi-field item | Use the shortest matching candidate length across all candidate texts | Avoids penalizing an item because another non-primary field is longer. |
| Equal rank and length | Preserve input index order | Keeps sorting stable and predictable. |
| Legacy concatenated search | Preserve previous combined-field candidates where they existed, such as unit `code + symbol` and codelist option `code + decode` | Prevents regressions for searches spanning adjacent displayed fields. |

#### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| Keyword is blank or whitespace | Original `items` reference/order is returned without filtering. |
| One item exactly equals keyword and others contain it | Exact item appears before partial items. |
| Multiple partial matches | Items order by shortest matching candidate text length. |
| Multiple candidate fields match | Item rank uses the shortest matching field text. |
| Candidate value is `null` or `undefined` | Value is ignored and does not throw. |
| Unit query spans `code + symbol` | Unit still matches through the concatenated candidate. |
| Codelist option query spans `code + decode` | Option still matches through the concatenated candidate. |
| Option search is active | Dragging stays disabled and `draggableOptions` must not write filtered order back to `selected.options`. |

#### 5. Good/Base/Bad Cases

- **Good**: `['Alpha Beta', 'Beta', 'Beta Gamma']` searched with `beta` renders `Beta` first, then the two partial matches in stable order when their candidate lengths are equal.
- **Good**: unit `{ code: 'UNIT', symbol: 'kg' }` searched with `unitkg` still matches because the extractor includes `` `${code}${symbol}` ``.
- **Base**: clearing a search box restores the existing backend/order-index list without re-ranking.
- **Bad**: every component reimplements `trim().toLowerCase().includes(...)`; rules drift and exact-first ranking can differ per tab.
- **Bad**: replacing `v-show` option filtering with ranked data but leaving drag writes enabled can persist filtered order back to the backend.

#### 6. Tests Required

| Test / Check | Assertion |
|---|---|
| `frontend/tests/searchRanking.test.js` | Normalization, exact-first ranking, shortest partial ranking, shortest multi-field match, stable tie order, and nullish candidate handling. |
| `frontend/tests/searchRankingWiring.test.js` | Search components import `rankFuzzyMatches`, route filtered lists through it, and preserve unit/option concatenated candidates. |
| `frontend/tests/orderingStructure.test.js` | Codelist option drag uses `draggableOptions` and only writes back when search is inactive. |
| `node --test tests/*.test.js` | Full frontend source-level regression suite remains green. |

### Scenario: Field Definition Visibility

#### 1. Scope / Trigger

- Trigger: any UI that renders the reusable field library list (field library page, form designer left panel).
- Current shared helper: `frontend/src/composables/fieldDefinitionVisibility.js`.
- Current consumers: `FieldsTab.vue`, `FormDesignerTab.vue`.

#### 2. Signatures

```javascript
function isVisibleInFieldLibrary(fieldDefinition): boolean
function isLabelFieldDefinition(fieldDefinition): boolean
function buildFieldDefinitionCreatePayload(fieldDefinition): object
```

- `isVisibleInFieldLibrary`: returns `false` for `标签` and `日志行` types, `true` otherwise. Guards against `null`/`undefined`.
- `isLabelFieldDefinition`: returns `true` iff `fieldDefinition?.field_type === '标签'`.
- `buildFieldDefinitionCreatePayload`: extracts a POST-ready payload for creating a field definition from a field instance's local `field_definition` object.

#### 3. Contracts

| Rule | Why |
|---|---|
| Label fields hidden from field library | Labels are structural per-form elements, not reusable assets. |
| Log-row fields hidden from field library | Log rows are auto-generated and managed per-table, not user-editable library items. |
| Null-safe predicates | Prevents runtime errors when field definition is missing or null. |
| Designer can still create labels | `designerFieldTypes` in `FormDesignerTab.vue` keeps `标签` so users can create labels within a form. |

#### 4. Tests Required

| Test / Check | Assertion |
|---|---|
| `frontend/tests/searchRankingWiring.test.js` | Both consumers import and apply `isVisibleInFieldLibrary` to filter field lists. |
| Source-level check | `FieldsTab.vue` `fieldTypes` excludes `标签`; `FormDesignerTab.vue` `designerFieldTypes` includes `标签`. |

### Scenario: Ordinal Quick Edit for Ordered Lists

#### 1. Scope / Trigger

- Trigger: any ordered frontend list that already persists drag reordering through a reorder endpoint and also needs direct target-position input on the ordinal cell.
- Current shared helper: `frontend/src/composables/useOrdinalQuickEdit.js`.
- Current consumers: `CodelistsTab.vue`, `UnitsTab.vue`, `FieldsTab.vue`, `VisitsTab.vue`, and `FormDesignerTab.vue`.

#### 2. Signatures

```javascript
function clampOrdinal(value, min, max): number
function moveItem(items, fromIndex, toIndex): Array
function resequenceItems(items, orderKey = 'order_index'): Array
function useOrdinalQuickEdit(sourceList, reorderUrl, options): {
  editingId,
  editingValue,
  inputRef,
  startEdit,
  commitEdit,
  cancelEdit,
}
```

- `sourceList`: the full writable list that will be resequenced and posted back to the backend.
- `reorderUrl`: the existing reorder endpoint; the helper must keep backend contracts unchanged by posting the reordered id array only.
- `options.renderList`: the visible list order shown to the user; required whenever filtering or hidden rows make the rendered ordinal differ from the source index.
- `options.orderKey`: defaults to `order_index`; pass `sequence` for visits and visit-form relations.
- `options.applyList(nextList)`: writes the optimistic reordered array back to component state; needed when the source is nested or computed-backed.
- `options.reloadFn(oldIndex, newIndex)`: optional refresh hook after save or rollback.

#### 3. Contracts

| Rule | Why |
|---|---|
| Double-click ordinal only when not filtered | Keeps behavior aligned with drag sorting, which is disabled during search/filter mode. |
| Inline edit shows a plain numeric text box only | Use `el-input-number` with `:controls="false"` so the quick-jump interaction stays focused on direct target-position input instead of plus/minus stepping. |
| Use `renderList` for the displayed ordinal | Hidden rows or filtered-out items can make `row.order_index` or `row.sequence` differ from what the user sees. |
| Use `sourceList` for the actual move and POST payload | The backend reorder APIs still expect the full persistent order, not only the visible subset. |
| Clamp only for validation, not for implicit reorder | Out-of-range input must cancel without posting a clamped reorder the user did not request. |
| No-op when target ordinal equals the current rendered ordinal | Prevents unnecessary optimistic writes and reorder requests. |
| Roll back optimistic state on save failure | Reuses the existing `排序保存失败，已恢复` UX and keeps frontend state aligned with backend truth. |
| Clear edit state before awaiting `reloadFn` | A refresh failure must not leave the inline input stuck open or turn a handled reorder into an uncaught error. |
| Component-owned nested lists must provide a custom `applyList` | Computed or nested state like codelist options and visit-form relations cannot be assigned directly. |
| Selected row references must be re-linked after array replacement | Components that replace arrays (`selectedVisit`, `selected`, `selectedForm`) must keep their selected object references pointing at the new collection. |

#### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| Filter/search is active | `startEdit()` returns `false`; no input opens. |
| Rendered ordinal differs from persisted source order because of hidden rows | Input opens with the rendered ordinal, and committing the same visible ordinal becomes a no-op. |
| Requested ordinal is `NaN`, `< 1`, or `> renderedItems.length` | Edit cancels without POST. |
| Requested ordinal equals the current rendered ordinal | Edit cancels without POST or reload. |
| Save succeeds and `reloadFn` succeeds | Edit closes, optimistic order remains, and backend truth is refreshed. |
| Save fails | Snapshot is restored, warning toast appears, optional reload realigns local state, and edit state stays cleared. |
| Save succeeds but `reloadFn` fails | Reorder still reports success, edit state stays cleared, and a dedicated reload error message can be shown. |
| Consumer uses `orderKey: 'sequence'` | Re-sequenced items become `1..N` on `sequence`, not `order_index`. |

#### 5. Good/Base/Bad Cases

- **Good**: move visit form 3 to ordinal 1; optimistic UI rewrites `sequence` to `[1, 2, 3]`, posts ids once, then refreshes the matrix-backed list.
- **Good**: in the field library, a visible row with persisted `order_index = 3` but rendered ordinal 2 opens with input value `2`.
- **Base**: typing the current ordinal and pressing Enter closes the editor without network traffic.
- **Bad**: seeding the input from `row.order_index` when hidden rows exist; unchanged input can unexpectedly reorder the row.
- **Bad**: awaiting `reloadFn` before clearing `editingId`; a refresh rejection leaves the inline editor stuck.

#### 6. Tests Required

| Test / Check | Assertion |
|---|---|
| `frontend/tests/useOrdinalQuickEdit.test.js` | Covers clamp/no-op/out-of-range behavior, hidden-row rendered ordinals, rollback on save failure, and success semantics when reload fails. |
| `frontend/tests/ordinalQuickEditWiring.test.js` | Each consumer imports the helper, wires double-click / Enter / Esc / blur handlers to the correct list, and keeps ordinal quick-edit inputs on `:controls="false"`. |
| `frontend/tests/orderingStructure.test.js` | Fields and designer forms keep the expected wiring shape and exclude the canvas field-instance double-click path. |
| `node --test tests/*.test.js` | Full frontend source-level regression suite remains green. |

---

## Custom Hook Patterns

### Basic Composable

```javascript
// composables/useDialogState.js
import { ref } from 'vue'

export function useDialogState(initialState = false) {
  const isOpen = ref(initialState)

  function open() {
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  function toggle() {
    isOpen.value = !isOpen.value
  }

  return { isOpen, open, close, toggle }
}
```

### Composable with API

```javascript
// composables/useApi.js
export function useApi() {
  const cache = new Map()
  const pending = new Map()

  async function get(endpoint, options = {}) {
    const { ttl = 60000, skipCache = false } = options

    // Check cache
    if (!skipCache && cache.has(endpoint)) {
      const { data, timestamp } = cache.get(endpoint)
      if (Date.now() - timestamp < ttl) {
        return data
      }
    }

    // Deduplicate pending requests
    if (pending.has(endpoint)) {
      return pending.get(endpoint)
    }

    // Fetch (wrap with apiUrl so the deployment prefix is preserved)
    const promise = fetch(apiUrl(`/api${endpoint}`))
      .then(res => res.json())
      .then(data => {
        cache.set(endpoint, { data, timestamp: Date.now() })
        return data
      })
      .finally(() => pending.delete(endpoint))

    pending.set(endpoint, promise)
    return promise
  }

  async function post(endpoint, body, options = {}) {
    const response = await fetch(apiUrl(`/api${endpoint}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    // Invalidate cache on mutation
    invalidateCache(endpoint)

    return parseResponse(response)
  }

  function invalidateCache(endpoint) {
    // Clear cache for related endpoints
    for (const key of cache.keys()) {
      if (key.startsWith(endpoint.split('/')[1])) {
        cache.delete(key)
      }
    }
  }

  return { get, post, put, patch, del }
}
```

### Composable with Lifecycle

```javascript
// composables/useAutoRefresh.js
import { ref, onMounted, onUnmounted } from 'vue'

export function useAutoRefresh(fetchFn, interval = 30000) {
  const data = ref(null)
  const loading = ref(false)
  let timer = null

  async function refresh() {
    loading.value = true
    try {
      data.value = await fetchFn()
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    refresh()
    timer = setInterval(refresh, interval)
  })

  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  return { data, loading, refresh }
}
```

---

## Data Fetching

### Always Use useApi

```javascript
// WRONG - Direct fetch
const response = await fetch('/api/projects')
const projects = await response.json()

// CORRECT - Use useApi
const { get } = useApi()
const projects = await get('/projects')
```

> **Subpath rule**: if you must bypass `useApi.js` (bare `fetch`, `el-upload :action`, blob downloads), wrap the URL with `apiUrl()` from `useApi.js` — otherwise the request drops the deployment prefix (e.g. `/crf/`) and 404s or crosses into another site under subpath deployment. Example: `await fetch(apiUrl('/api/auth/login'))`. Guarded by `tests/basePathDeployment.test.js`.

### Error Handling

```javascript
// useApi handles 401 globally via custom event
// Components handle business errors

const { get } = useApi()

async function loadData() {
  try {
    const data = await get('/projects')
    return data
  } catch (error) {
    // Error already parsed by useApi
    if (error.status === 404) {
      ElMessage.warning('项目不存在')
    } else {
      ElMessage.error(error.message || '加载失败')
    }
  }
}
```

### Scenario: Session-Scoped Token Handling in `useApi.js`

#### 1. Scope / Trigger

- Trigger: touching `useApi.js` request paths, `_handle401` / `_storeRefreshedToken`, or the `crf:auth-expired` contract; also any new authenticated request path.
- Why: a successful protected response may carry a replacement `X-Refreshed-Token`, and any response can arrive after the session changed (logout, another user, another tab). A late response must not resurrect or clear a newer session.
- Cross-stack contract: `.trellis/spec/guides/cross-stack-contracts.md` §3 rules 4–5.

#### 2. Signatures

```javascript
// frontend/src/composables/useApi.js
function _buildRequestAuth(extraHeaders = {})   // → { sentToken, headers }
function _isCurrentSession(sentToken)           // → boolean
async function _checkStatus(r, sentToken)       // 401 / 429 / !ok / refreshed-token handling
function _handle401()                           // remove token + dispatch crf:auth-expired
function _storeRefreshedToken(r)                // write back x-refreshed-token when present

// every request path: api.get / api.cachedGet / api.post / api.put / api.patch / api.del
async get(url) {
  const { sentToken, headers } = _buildRequestAuth();
  const r = await fetch(apiUrl(url), { headers });
  await _checkStatus(r, sentToken);
  return _safeJsonParse(r);
}
```

`_buildRequestAuth` reads the token in the same step that builds the `Authorization` header, so `sentToken` is exactly what the request was sent with; a token-less request captures `null`, compared as an ordinary value.

#### 3. Contracts

| Rule | Why |
|---|---|
| 401 stays the single global auth-expiry signal, but `_handle401()` runs only when `_isCurrentSession(sentToken)` | `App.vue` listens for `crf:auth-expired` and clears shell state; a superseded 401 must not log the new session out |
| `X-Refreshed-Token` is written back only under the same guard | Successful responses may replace the token; a late response must not resurrect or replace a newer one |
| A late response still parses or throws exactly as before — only the session side effects are skipped | Callers keep seeing the real payload / error; the guard is not an error swallow |
| Every request path (`get` / `cachedGet` / `post` / `put` / `patch` / `del`) builds headers via `_buildRequestAuth()` and passes `sentToken` to `_checkStatus()` | A path that reads the token separately desynchronizes the guard |
| The `cachedGet` cache write stays guarded by `_cacheGeneration` only, **not** by the token guard | Successful responses may replace the token, and the first concurrent response to arrive can make the tokens captured by still-in-flight same-session requests unequal — a token guard would skip caching for most concurrent requests. Same-tab session changes already bump the generation via `clearAllCache()`; a dedup hit is governed by the in-flight request's captured token |
| Components keep using `getAuthHeaders()` instead of caching token values locally | `getAuthHeaders()` is built from the same `_buildRequestAuth()` read, so there is one source for the request token |
| Bypass sites — e.g. Word export download, project Logo, screenshot pages, `el-upload` actions — do **not** dispatch the global `crf:auth-expired` event and do **not** process `X-Refreshed-Token` | Accepted gap (list is not exhaustive). Login is deliberately different: `LoginView.vue` handles a failed login itself and stores `access_token` on success |

#### 4. Validation & Error Matrix

| Condition | Expected behavior |
| --- | --- |
| Success, `sentToken` still current | `X-Refreshed-Token` (if present) written back; payload returned |
| 401, `sentToken` still current | Token removed + `crf:auth-expired` dispatched; the request rejects with the 401 error |
| Success, token replaced meanwhile (logout / another user / another tab) | No write-back; the request still resolves with its payload |
| 401, token replaced meanwhile | No token removal, no event; the request still rejects |
| Token-less request (`sentToken === null`), a session appeared later | Untouched — `null` does not equal the newer token |
| Token-less request, no session appeared | The 401 still clears (no-op) and dispatches `crf:auth-expired` |
| `cachedGet` cache write / dedup hit | Cache write keyed by `_cacheGeneration` only; a dedup hit is governed by the in-flight request's captured token |

#### 5. Good / Base / Bad Cases

- **Good**: user A logs out while a slow request is in flight; the late 401 neither clears user B's fresh token nor forces a second logout, and the late success does not resurrect A's session.
- **Base**: same-session success still extends the session; a same-session 401 still logs out exactly once.
- **Bad**: unconditional `localStorage.removeItem('crf_token')` / `window.dispatchEvent` on any 401, or an unguarded `_storeRefreshedToken(r)` — a superseded response then overwrites or clears the current session.

#### 6. Tests Required

| Test / Check | Assertion |
|---|---|
| `frontend/tests/useApiSessionRace.test.js` | Late 401 from a superseded session keeps the newer token and dispatches nothing; late success does not store its refreshed token; late success after logout never resurrects the session; same-session success still stores; same-session 401 still clears + dispatches; a token-less request never touches a session that appeared later; a token-less 401 with no session still dispatches |
| `frontend/tests/appSettingsShell.test.js` | Pins the `_isCurrentSession` / `_checkStatus(r, sentToken)` source shape and both guarded call sites |
| `.trellis/spec/guides/cross-stack-contracts.md` §3 rules 4–5 | Updated in the same change |

#### 7. Wrong vs Correct

**Wrong**

```javascript
// Unconditional: a late response overwrites or clears the newer session
async function _checkStatus(r) {
  if (r.status === 401) { _handle401(); throw _createHttpError('登录已过期，请重新登录', r.status); }
  // ...
  _storeRefreshedToken(r);
}
```

**Correct**

```javascript
async function _checkStatus(r, sentToken) {
  if (r.status === 401) {
    if (_isCurrentSession(sentToken)) _handle401();
    throw _createHttpError('登录已过期，请重新登录', r.status);
  }
  // ...
  if (_isCurrentSession(sentToken)) _storeRefreshedToken(r);
}
```

---

## Naming Conventions

| Pattern | Example | Purpose |
|---------|---------|---------|
| `use<Resource>` | `useApi`, `useDialogState` | Stateful logic |
| `use<Action>` | `useOrderableList` | Action logic |
| `use<Feature>Renderer` | `useCRFRenderer` | Rendering logic |

---

## Cross-Stack Contract Composables

### useCRFRenderer.js

```javascript
/**
 * Cross-stack contract with backend/src/services/width_planning.py
 * Both use same algorithm for CJK character width calculation.
 */

const CJK_WEIGHT = 1.8  // Must match backend

function calculateTextWidth(text) {
  let width = 0
  for (const char of text) {
    width += isCJK(char) ? CJK_WEIGHT : 1
  }
  return width
}

export function useCRFRenderer() {
  function planInlineColumnFractions(fields, containerWidth) {
    // Same logic as backend width_planning.py
  }

  return {
    calculateTextWidth,
    planInlineColumnFractions
  }
}
```

---

## Clipboard Access (`clipboardCopy.js` Is the Only Entry)

- `frontend/src/composables/clipboardCopy.js` is the **only** file allowed to
  touch `navigator.clipboard` or `document.execCommand('copy')`. Components
  call `copyTextToClipboard(text)` and must not reach for the Clipboard API
  themselves.
- Rationale: `navigator.clipboard.writeText` exists only in secure contexts
  (HTTPS / localhost), while the production nginx example is a plain-HTTP
  deployment — the helper therefore tries `writeText` first and falls back to
  a temporary readonly `<textarea>` + `execCommand('copy')`, returning `false`
  when both paths fail.
- Tests inject the environment (`{ navigator, document, isSecureContext }`)
  instead of stubbing globals — see `frontend/tests/clipboardCopy.test.js`.

---

## Common Mistakes

### 1. Not Returning Reactive Values

```javascript
// WRONG - Returns plain value
export function useCounter() {
  let count = 0
  function increment() { count++ }
  return { count, increment }
}

// CORRECT - Returns ref
export function useCounter() {
  const count = ref(0)
  function increment() { count.value++ }
  return { count, increment }
}
```

### 2. Side Effects in Composable Body

```javascript
// WRONG - Runs on import
export function useData() {
  fetch('/api/data').then(r => r.json())
}

// CORRECT - Runs when used
export function useData() {
  const data = ref(null)
  onMounted(() => {
    fetch('/api/data').then(r => r.json()).then(d => data.value = d)
  })
  return { data }
}
```

### 3. Not Using useApi for API Calls

```javascript
// WRONG - Bypasses caching and error handling
fetch('/api/projects')

// CORRECT - Uses centralized API wrapper
const { get } = useApi()
get('/projects')
```
