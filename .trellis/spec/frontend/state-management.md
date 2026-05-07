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

### 4. Server State (API cache)

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
