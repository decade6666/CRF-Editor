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
| Location / naming | `tests/component/**/*.spec.js`. The config's explicit `include` is what keeps vitest from collecting the 69 `tests/*.test.js` files (its default include would). Never name a mount test `*.test.js`, and never put node:test files under `tests/component/`. Helper modules in `tests/component/` without the `.spec.js` suffix (`setup.js`, `vueWarnGate.js`) are never collected. |
| Global setup | `tests/component/setup.js`: registers `[[ElementPlus, { locale: zhCn }]]` via `config.global.plugins` (same specifiers as `src/main.js`; no Element Plus CSS — vitest turns CSS into empty modules and the DOM environment does no layout) and installs the app-level Vue `warnHandler` through `config.global.config.warnHandler` (VTU copies `global.config` keys onto each app's `app.config`; see the Vue warnings row). Then three `afterEach` registrations, in this order: (1) the warning gate `afterEach(assertNoVueWarnings)`, (2) a restore hook (real timers / `restoreAllMocks` / `localStorage.clear`, plus a `document.body` reset of `innerHTML` / `class` / `style`), (3) `enableAutoUnmount(afterEach)`. Vitest 5 runs afterEach hooks serially in reverse registration order and a throwing hook skips the remaining ones (see `callSuiteHook` / `getSuiteHooks` in `vitest/dist/chunks/run.*.js`), so the effective execution order is unmount → restore → gate: the gate runs last so warnings emitted during unmount are still collected and a failing gate never skips cleanup. A `beforeEach` first clears leftover warnings (they exist only when the previous test's afterEach chain was cut short by a throw, and that test has already failed), then installs the console-warning spy and the `ElMessage.success/error/warning/info` no-op spies; tests assert directly on `ElMessage.success` etc. |
| API boundary | Spy on the real exported `api` object (`import { api } from '../../src/composables/useApi.js'` — neither `vite.config.js` nor `vitest.config.js` defines an `@` alias): `vi.spyOn(api, 'put')`. Do not use `vi.mock` module factories for it (`vi.spyOn` on an ESM namespace export fails; spying on a property of the exported object is fine). Install spies BEFORE `mount()`: composables can capture `api.*` at setup time — `src/composables/useSessionTimer.js` binds `apiGet = api.get` as a default parameter, so `vi.spyOn(api, 'get')` must already exist when the component mounts. |
| MessageBox | Not stubbed globally. Tests that need it call `vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm')` themselves. |
| Teleported dialogs | Do NOT stub teleport (`stubs: { teleport: true }` renders an empty `<teleport-stub>` in @vue/test-utils 2.5). Let the real teleport run and query through `new DOMWrapper(document.body)`; assert emits on the mount wrapper. setup resets `document.body` (`innerHTML` / `class` / `style`) after every test, so teleported leftovers cannot leak into the next spec. |
| Timers | `vi.useFakeTimers()` + `vi.setSystemTime(...)` per test (setup's restore hook brings real timers back). `flushPromises` works under fake timers: @vue/test-utils captures the real `setImmediate` at module load (`const scheduler = typeof setImmediate === 'function' ? setImmediate : setTimeout`), before any test installs fake timers (probe-verified 2026-10-09 with vitest 5.0.3 / VTU 2.5.1). Drive time with `vi.advanceTimersByTime(...)`, then `await nextTick()` before asserting the DOM. |
| Vue warnings | Any Vue warning during a mount test — including during unmount — fails that test. `tests/component/vueWarnGate.js` collects warnings through two channels: (a) an app-level `warnHandler` installed via `config.global.config.warnHandler` — required because Element Plus 2.13's el-select swaps `app.config.warnHandler` for its own wrapper while mounted, and the wrapper only forwards to the handler that existed first (otherwise it `console.warn`s the raw message without the `[Vue warn]` prefix); (b) a `console.warn` spy collecting `[Vue warn]`-prefixed messages with no component instance (e.g. @vue/reactivity's `Set operation on key … failed: target is readonly`). When the gate fires, fix the root cause — never mock `console.warn` or replace `warnHandler` in a spec to hide a warning. Prefer template-compiled slots (`template` strings or SFCs) over `h()` render-function slots for components like el-select: el-select reads its default slot outside render, which emits `Slot "default" invoked outside of the render function` for a non-compiled `h()` slot on every run. `vueWarnGate.spec.js` self-tests both channels. |
| Console output | In AI-agent shells (std-env `isAgent`, e.g. `AI_AGENT` / `CLAUDECODE` set) vitest 5 defaults to the `minimal` reporter, which hides passing tests' console output (`silent: 'passed-only'`); vitest's own default is `silent: false`. Use `npx vitest run --silent=false` to see console output when investigating warnings or failures. |
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
