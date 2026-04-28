# Hook Guidelines

> How hooks (composables) are used in this project.

---

## Overview

- **Naming**: All composables start with `use` prefix
- **Purpose**: Encapsulate and reuse stateful logic
- **Return**: Return reactive refs and functions
- **API Layer**: ALL API calls go through `useApi.js`

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

    // Fetch
    const promise = fetch(`/api${endpoint}`)
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
    const response = await fetch(`/api${endpoint}`, {
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

### 401 Handling (Global)

```javascript
// In App.vue - listen for auth expiration
window.addEventListener('crf:auth-expired', () => {
  localStorage.removeItem('token')
  router.push('/login')
  ElMessage.warning('登录已过期，请重新登录')
})

// In useApi.js - dispatch event on 401
if (response.status === 401) {
  window.dispatchEvent(new CustomEvent('crf:auth-expired'))
  throw { status: 401, message: '认证失败' }
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
