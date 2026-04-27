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
