# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

- **Testing**: node:test with fast-check for property-based testing
- **Linting**: ESLint with Vue plugin
- **Formatting**: Prettier
- **Build**: Vite
- **Code Review**: Required for all changes

---

## Forbidden Patterns

### 1. Direct DOM Manipulation

```javascript
// WRONG - Direct DOM
document.getElementById('myInput').value = 'test'

// CORRECT - Vue reactivity
const inputValue = ref('test')
// In template: v-model="inputValue"
```

### 2. console.log in Production Code

```javascript
// WRONG - Console in production
console.log('Debug info:', data)

// CORRECT - Use dev-only logging
if (import.meta.env.DEV) {
  console.log('Debug info:', data)
}

// Or remove before commit
```

### 3. Not Using Element Plus

```html
<!-- WRONG - Custom input -->
<input type="text" class="my-input" v-model="value">

<!-- CORRECT - Element Plus -->
<el-input v-model="value" />
```

### 4. Synchronous Heavy Operations

```javascript
// WRONG - Blocks UI
function processLargeData(data) {
  return data.map(expensiveOperation)
}

// CORRECT - Use Web Worker or chunk
async function processLargeData(data) {
  const chunks = chunkArray(data, 100)
  const results = []
  for (const chunk of chunks) {
    results.push(...await processChunk(chunk))
    await nextTick() // Let UI update
  }
  return results
}
```

### 5. Magic Numbers

```javascript
// WRONG - Magic number
if (text.length > 100) { ... }

// CORRECT - Named constant
const MAX_TEXT_LENGTH = 100
if (text.length > MAX_TEXT_LENGTH) { ... }
```

---

## Required Patterns

### 1. Composition API with script setup

```vue
<script setup>
// All Vue 3 components use this pattern
import { ref, computed } from 'vue'

const count = ref(0)
const doubled = computed(() => count.value * 2)
</script>
```

### 2. useApi for All API Calls

```javascript
// All API calls go through useApi
import { useApi } from '@/composables/useApi.js'

const { get, post } = useApi()
const projects = await get('/projects')
```

### 3. Element Plus Components

```vue
<!-- Use Element Plus for UI primitives -->
<el-button type="primary">Save</el-button>
<el-input v-model="value" placeholder="Enter value" />
<el-table :data="items">
  <el-table-column prop="name" label="Name" />
</el-table>
```

### 4. Scoped Styles

```vue
<style scoped>
/* Always scoped to prevent leakage */
.container {
  padding: 16px;
}
</style>
```

### 5. Prop Validation

```javascript
// Always define prop types
defineProps({
  id: { type: Number, required: true },
  name: { type: String, default: '' }
})
```

---

## Testing Requirements

### Test Organization

```
frontend/tests/
├── App.test.js              # Root component
├── AdminView.test.js        # Admin page
├── FormDesignerTab.test.js  # Form designer
├── columnWidthPlanning.test.js  # Contract tests with backend
├── formFieldPresentation.test.js
└── ...
```

### Test Framework

```javascript
// Using node:test
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

describe('MyComponent', () => {
  it('should render correctly', () => {
    const result = computeValue(5)
    assert.strictEqual(result, 10)
  })
})
```

### Property-Based Testing with fast-check

```javascript
import fc from 'fast-check'

describe('columnWidthPlanning', () => {
  it('should always sum to 1.0', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          name: fc.string(),
          width: fc.nat()
        })),
        (fields) => {
          const fractions = planColumns(fields)
          const sum = fractions.reduce((a, b) => a + b, 0)
          assert.ok(Math.abs(sum - 1.0) < 0.001)
        }
      )
    )
  })
})
```

### Contract Testing

```javascript
// Same fixture as backend test
import cases from '../backend/tests/fixtures/planner_cases.json'

describe('Column planning contract', () => {
  for (const testCase of cases) {
    it(`case: ${testCase.name}`, () => {
      const result = planColumns(testCase.input)
      assert.deepStrictEqual(result, testCase.expected)
    })
  }
})
```

### Running Tests

```bash
# Run all tests
cd frontend && node --test tests/*.test.js

# Run specific test
node --test tests/columnWidthPlanning.test.js
```

---

## Code Review Checklist

### Before Submitting

- [ ] All tests pass (`node --test tests/`)
- [ ] No lint errors (`npm run lint`)
- [ ] Code formatted (`npm run format`)
- [ ] No console.log in changed files
- [ ] Build succeeds (`npm run build`)

### Reviewer Should Check

- [ ] Uses Element Plus components (not native HTML)
- [ ] API calls via useApi (not direct fetch)
- [ ] Scoped styles (not global)
- [ ] Props have type definitions
- [ ] Computed properties for derived state
- [ ] No prop drilling (use provide/inject)
- [ ] Cross-stack contracts maintained
- [ ] Tests cover new functionality
