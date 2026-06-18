# Type Safety

> Type safety patterns in this project.

---

## Overview

- **Type System**: JSDoc with TypeScript-style annotations (no TS compiler)
- **Validation**: Pydantic on backend, minimal frontend validation
- **API Contract**: Backend schemas define the contract
- **Testing**: fast-check for property-based contract testing

---

## Type Organization

### JSDoc Annotations

```javascript
/**
 * @typedef {Object} Project
 * @property {number} id
 * @property {string} name
 * @property {string} description
 * @property {number} user_id
 * @property {string} created_at
 */

/**
 * @typedef {Object} Field
 * @property {number} id
 * @property {number} form_id
 * @property {string} field_name
 * @property {string} field_type
 * @property {number} order_index
 */

/**
 * @param {number} projectId
 * @returns {Promise<Project>}
 */
async function getProject(projectId) {
  const { get } = useApi()
  return get(`/projects/${projectId}`)
}
```

### Shared Type Definitions

```javascript
// In a types.js or at top of composable

/**
 * @typedef {'text'|'number'|'date'|'select'|'radio'|'checkbox'} FieldType
 */

/**
 * @typedef {Object} FieldRenderConfig
 * @property {FieldType} type
 * @property {string} label
 * @property {boolean} required
 * @property {string} [placeholder]
 * @property {string[]} [options]
 */
```

---

## Validation

### Backend Validation (Primary)

Pydantic handles all input validation:

```python
# backend/src/schemas/project.py
class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None

    model_config = {"extra": "forbid"}
```

### Frontend Validation (Secondary)

```javascript
// Minimal - rely on backend
const form = reactive({
  name: '',
  description: ''
})

async function submit() {
  try {
    await post('/projects', form)
  } catch (error) {
    // Parse Pydantic validation errors
    if (error.errors) {
      for (const err of error.errors) {
        ElMessage.error(`${err.loc.join('.')} ${err.msg}`)
      }
    }
  }
}
```

### Local UI Validation

```javascript
// Only for UX, not security
const password = ref('')
const passwordError = computed(() => {
  if (password.value && password.value.length < 8) {
    return '密码长度至少8个字符'
  }
  return ''
})
```

---

## Common Patterns

### Type Guards

```javascript
/**
 * @param {any} value
 * @returns {value is Project}
 */
function isProject(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.id === 'number' &&
    typeof value.name === 'string'
  )
}

// Usage
const data = await get('/projects/1')
if (isProject(data)) {
  // TypeScript-like narrowing
  console.log(data.name)
}
```

### Generic-like Functions

```javascript
/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => boolean} predicate
 * @returns {T[]}
 */
function filterItems(items, predicate) {
  return items.filter(predicate)
}
```

### Async Return Types

```javascript
/**
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
async function deleteProject(id) {
  try {
    await del(`/projects/${id}`)
    return { success: true }
  } catch (error) {
    return { success: false, message: error.message }
  }
}
```

---

## Forbidden Patterns

### 1. No @ts-ignore or @ts-nocheck

```javascript
// WRONG - Suppresses type checking
// @ts-ignore
someUntypedFunction()

// CORRECT - Add proper JSDoc
/** @type {any} */
const result = someUntypedFunction()
```

### 2. Avoid any (use unknown instead)

```javascript
// WRONG - any loses all type safety
/** @param {any} data */
function process(data) {
  return data.name  // No error even if name doesn't exist
}

// CORRECT - unknown requires check
/** @param {unknown} data */
function process(data) {
  if (typeof data === 'object' && data !== null && 'name' in data) {
    return /** @type {{ name: string }} */ (data).name
  }
}
```

### 3. No Type Assertions Without Checks

```javascript
// WRONG - Unsafe assertion
const project = /** @type {Project} */ (data)

// CORRECT - Validate first
if (isProject(data)) {
  const project = data  // Properly narrowed
}
```

---

## Contract Testing

### Cross-Stack Type Contract

```javascript
// frontend/tests/columnWidthPlanning.test.js
// Uses same fixture as backend test

import cases from '../backend/tests/fixtures/planner_cases.json'

describe('Column planning matches backend', () => {
  for (const testCase of cases) {
    it(`case: ${testCase.name}`, () => {
      const result = planColumns(testCase.input)
      assert.deepStrictEqual(result, testCase.expected)
    })
  }
})
```

### Property-Based Testing

```javascript
import fc from 'fast-check'

describe('Field types', () => {
  it('should only accept valid field types', () => {
    const validTypes = ['text', 'number', 'date', 'select', 'radio', 'checkbox']

    fc.assert(
      fc.property(fc.string(), (type) => {
        const isValid = validTypes.includes(type)
        // isValid should be false for random strings
        if (!validTypes.includes(type)) {
          assert.strictEqual(isValid, false)
        }
      })
    )
  })
})
```
