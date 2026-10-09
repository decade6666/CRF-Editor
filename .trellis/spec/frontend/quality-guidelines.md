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
# Run both suites (node:test first, then vitest; either failure fails the script)
cd frontend && npm test

# Run only the vitest component mount tests
cd frontend && npm run test:component

# Run only the node:test source-level suite
cd frontend && node --test tests/*.test.js

# Run a specific node:test file
node --test tests/columnWidthPlanning.test.js

# Run vitest in watch mode
cd frontend && npx vitest
```

### Component Mount Tests

Real DOM component tests run on vitest + @vue/test-utils + happy-dom. They are the tool of record for refactoring giant components (form designer / visits preview / App + Word import splits): source-text tests cannot prove behavior survives a split.

| Aspect | Convention |
|---|---|
| Runner / config | Standalone `frontend/vitest.config.js` (`defineConfig` from `vitest/config`). A standalone vitest config does NOT inherit `vite.config.js`, so compile-time plugins must be mirrored there — currently `@vitejs/plugin-vue` only. If `vite.config.js` ever gains a plugin that components need at compile time, add it to `vitest.config.js` too. `vite build` / `vite` never read `vitest.config.js`. |
| Location / naming | `tests/component/**/*.spec.js`. The config's explicit `include` is what keeps vitest from collecting the 68 `tests/*.test.js` files (its default include would). Never name a mount test `*.test.js`, and never put node:test files under `tests/component/`. |
| Global setup | `tests/component/setup.js`: registers `[[ElementPlus, { locale: zhCn }]]` via `config.global.plugins` (same specifiers as `src/main.js`; no Element Plus CSS — vitest turns CSS into empty modules and the DOM environment does no layout), `enableAutoUnmount(afterEach)`, an `afterEach` restoring timers/mocks/localStorage registered BEFORE `enableAutoUnmount` (vitest after-hooks run in reverse registration order, so wrappers unmount before restoration), and a `beforeEach` that spies `ElMessage.success/error/warning/info` to no-ops. Tests assert directly on `ElMessage.success` etc. |
| API boundary | Spy on the real exported `api` object (`import { api } from '@/composables/useApi'`): `vi.spyOn(api, 'put')`. Do not use `vi.mock` module factories for it (`vi.spyOn` on an ESM namespace export fails; spying on a property of the exported object is fine). |
| MessageBox | Not stubbed globally. Tests that need it call `vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm')` themselves. |
| Teleported dialogs | Do NOT stub teleport (`stubs: { teleport: true }` renders an empty `<teleport-stub>` in @vue/test-utils 2.5). Let the real teleport run and query through `new DOMWrapper(document.body)`; assert emits on the mount wrapper. |
| Timers | `vi.useFakeTimers()` + `vi.setSystemTime(...)` per test (setup's `afterEach` restores real timers). `flushPromises` schedules its flush via `setImmediate` (fallback `setTimeout` only where `setImmediate` is missing), and vitest 5's default `toFake` fakes both (it fakes every timer except `nextTick` / `queueMicrotask`), so `flushPromises` stalls under fake timers until they are advanced — prefer real timers for tests that await it, or narrow `toFake` to leave `setImmediate` real and drive time with `vi.advanceTimersByTime`. |
| DOM polyfills | Add none by default. Only when a spec proves an API is missing (e.g. a component touching canvas or layout) add the minimal stub in `setup.js` with a comment naming the component and API. happy-dom 20 natively covers matchMedia / IntersectionObserver / scrollTo / no-op ResizeObserver — el-table / el-select / el-tooltip mount without polyfills (see `elementPlusEnvironment.spec.js`). |
| Versions | Test toolchain deps are exact-pinned in `package.json` (`vitest@5.0.3`, `@vue/test-utils@2.5.1`, `happy-dom@20.14.5`). Upgrades are a deliberate, separately approved change. |

---

## Code Review Checklist

### Before Submitting

- [ ] All tests pass (`npm test` — node:test + vitest mount tests)
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
