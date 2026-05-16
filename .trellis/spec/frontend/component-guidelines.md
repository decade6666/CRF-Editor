# Component Guidelines

> How components are built in this project.

---

## Overview

- **Framework**: Vue 3 with Composition API (`<script setup>`)
- **UI Library**: Element Plus for standard components
- **Drag/Drop**: vuedraggable + sortablejs
- **Styling**: Scoped CSS, CSS variables for theming
- **Lazy Loading**: `defineAsyncComponent` for heavy tabs

---

## Component Structure

```vue
<script setup>
// 1. Imports
import { ref, computed, onMounted } from 'vue'
import { useApi } from '@/composables/useApi.js'
import SomeComponent from './SomeComponent.vue'

// 2. Props and emits
const props = defineProps({
  modelValue: { type: String, required: true },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'save'])

// 3. Composables
const { get, post } = useApi()

// 4. Reactive state
const loading = ref(false)
const data = ref([])

// 5. Computed properties
const filteredData = computed(() =>
  data.value.filter(item => !item.deleted)
)

// 6. Methods
async function loadData() {
  loading.value = true
  try {
    data.value = await get('/api/items')
  } finally {
    loading.value = false
  }
}

// 7. Lifecycle hooks
onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="component-root">
    <!-- Template content -->
  </div>
</template>

<style scoped>
/* Scoped styles */
.component-root {
  /* Use CSS variables for theming */
  --primary-color: var(--el-color-primary);
}
</style>
```

---

## Props Conventions

### Prop Definition

```javascript
// Required props
defineProps({
  id: { type: Number, required: true },
  name: { type: String, required: true }
})

// Optional props with defaults
defineProps({
  disabled: { type: Boolean, default: false },
  size: { type: String, default: 'medium' },
  items: { type: Array, default: () => [] }
})
```

### v-model Pattern

```javascript
// Parent: <MyInput v-model="value" />
// Child:
const props = defineProps({
  modelValue: { type: String, required: true }
})

const emit = defineEmits(['update:modelValue'])

function onInput(event) {
  emit('update:modelValue', event.target.value)
}
```

### provide/inject for Deep Prop Drilling

```javascript
// In parent (App.vue)
const refreshKey = ref(0)
provide('refreshKey', refreshKey)

// In child
const refreshKey = inject('refreshKey')
```

---

## Styling Patterns

### Scoped CSS

```vue
<style scoped>
/* Only affects this component */
.container {
  padding: 16px;
}

/* Deep selector for child components */
:deep(.el-input) {
  width: 100%;
}
</style>
```

### CSS Variables for Theming

```css
/* In global styles or App.vue */
:root {
  --el-color-primary: #409eff;
  --border-radius: 4px;
}

/* In component */
<style scoped>
.button {
  background: var(--el-color-primary);
  border-radius: var(--border-radius);
}
</style>
```

### Element Plus Customization

```vue
<template>
  <!-- Use Element Plus props for styling -->
  <el-button type="primary" size="small">
    Save
  </el-button>

  <el-input
    v-model="value"
    :disabled="loading"
    placeholder="Enter value"
  />
</template>
```

---

## Accessibility

### Element Plus Components

Element Plus handles most a11y automatically:
- Focus management
- Keyboard navigation
- ARIA attributes

### Custom Components

```vue
<template>
  <!-- Always use semantic HTML -->
  <button
    @click="handleClick"
    :disabled="loading"
    :aria-label="loading ? 'Saving...' : 'Save'"
  >
    <span v-if="loading" class="sr-only">Loading</span>
    <slot />
  </button>
</template>

<style scoped>
/* Screen reader only */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
```

---

## List Item with Drag Handle Pattern

When building draggable list items (e.g., project list), separate the drag handle from the clickable action button for better semantics and accessibility.

### Pattern

```vue
<template>
  <div class="list-item" :class="{ active: isSelected }">
    <!-- Drag handle: decorative, not interactive -->
    <span class="drag-handle" aria-hidden="true">
      <el-icon><Rank /></el-icon>
    </span>

    <!-- Clickable action: proper button semantics -->
    <button
      class="list-item-select-btn"
      type="button"
      :aria-current="isSelected ? 'true' : undefined"
      @click="onSelect(item)"
    >
      <span class="list-item-main">
        <el-icon aria-hidden="true"><Files /></el-icon>
        <span class="list-item-name">{{ item.name }}</span>
      </span>
    </button>

    <!-- Action buttons: clearly labeled -->
    <div class="list-item-actions">
      <el-button
        link
        aria-label="复制"
        title="复制"
        @click.stop="onCopy(item)"
      >
        <el-icon aria-hidden="true"><DocumentCopy /></el-icon>
      </el-button>
    </div>
  </div>
</template>
```

### Key Rules

1. **Drag handle** → `aria-hidden="true"`, not a button (sortablejs handles keyboard drag)
2. **Select action** → `<button type="button">` with `aria-current` for active state
3. **Icon-only buttons** → must have `aria-label` + `title`
4. **Icons inside buttons** → `aria-hidden="true"` (button label conveys meaning)
5. **`.stop` modifier** → on action buttons to prevent bubbling to parent click

### Don't: Wrap Entire Item in Single Button

```vue
<!-- WRONG: drag handle inside button causes confusion -->
<button class="project-item" @click="selectProject(p)">
  <div class="drag-handle"><el-icon><Rank /></el-icon></div>
  <span>{{ p.name }}</span>
</button>
```

**Why**: The drag handle becomes part of the button's accessible name, and sortablejs may conflict with button click events.

---

## Scenario: Blob URL Lifecycle Management

### 1. Scope / Trigger

- Trigger: any component that fetches binary data (images, PDFs) from an API,
  creates `URL.createObjectURL(blob)`, and displays it via `:src="objectUrl"`.
- This applies to `ProjectInfoTab.vue` (company logo), but the pattern is
  reusable wherever a blob-derived URL is bound to the template.

### 2. Signatures

```javascript
const logoUrl = ref(null)          // object URL string or null
const project = defineProps(...)   // triggers watch on project.id change

async function fetchLogo(projectId) {
  // Always release the previous blob first
  if (logoUrl.value) { URL.revokeObjectURL(logoUrl.value); logoUrl.value = null }
  if (!projectId) return               // guard: no project → stay null
  const r = await fetch(`/api/projects/${projectId}/logo`, { headers: getAuthHeaders() })
  if (r.ok) logoUrl.value = URL.createObjectURL(await r.blob())
  // on error: logoUrl stays null → UI shows "上传Logo" button
}
```

### 3. Contracts

| Step | Action | Why |
|---|---|---|
| `watch(project)` — new project has logo | Call `fetchLogo(p.id)` | Loads the correct blob for the new project. |
| `watch(project)` — new project has NO logo | `URL.revokeObjectURL(logoUrl.value); logoUrl.value = null` | Prevents showing the *previous* project's logo on a newly-created or logo-less project. |
| `onUnmounted` | `URL.revokeObjectURL(logoUrl.value); logoUrl.value = null` | Prevents memory leak if the component is destroyed while a blob URL is still in use (e.g., user navigates away). |
| `fetchLogo` entry | `revoke + null` before `fetch` | Ensures the old blob is freed even if the new fetch fails or the component rapidly re-renders. |

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| Project A (has logo) → Project B (new, no logo) | `logoUrl` becomes `null`; UI shows "上传Logo" only, no stale image from A. |
| Project A (has logo) → Project C (has logo) | Old blob revoked, new blob created; image updates. |
| Component unmounted while blob in use | `onUnmounted` fires, blob revoked; no memory leak. |
| `fetchLogo` called with `projectId = undefined/null` | Early return; `logoUrl` stays `null`. |

### 5. Wrong vs Correct

#### Wrong

```javascript
watch(() => props.project, (p) => {
  Object.assign(form, { name: p.name, ... })
  if (p.company_logo_path) fetchLogo(p.id)
  // BUG: when p has NO logo, logoUrl still points to the previous project's blob
}, { immediate: true })
```

#### Correct

```javascript
watch(() => props.project, (p) => {
  Object.assign(form, { name: p.name, ... })
  if (p.company_logo_path) {
    fetchLogo(p.id)
  } else if (logoUrl.value) {
    URL.revokeObjectURL(logoUrl.value)
    logoUrl.value = null
  }
}, { immediate: true })

onUnmounted(() => {
  if (logoUrl.value) { URL.revokeObjectURL(logoUrl.value); logoUrl.value = null }
})
```

---

## Scenario: Dialog v-model + Per-Object Key Reset

### 1. Scope / Trigger

- Trigger: a reusable dialog component (e.g. `DocxCompareDialog`, preview /
  inspector dialogs) that is opened repeatedly for **different business objects**
  from the same parent.
- This applies to `frontend/src/components/DocxCompareDialog.vue` (Word import
  preview), but the pattern is reusable whenever the parent holds a single
  dialog instance yet iterates over a list of items to inspect.

### 2. Signatures

```javascript
// Parent (e.g. App.vue)
const showDialog = ref(false)
const compareFormData = ref(null) // current business object
function openCompare(form) {
  compareFormData.value = form
  showDialog.value = true
}
```

```vue
<!-- Parent template -->
<DialogComponent
  v-if="compareFormData"
  v-model="showDialog"
  :key="compareFormData?.id ?? compareFormData?.index"
  :form-data="compareFormData"
/>
```

```vue
<!-- Child dialog -->
<el-dialog
  :model-value="modelValue"
  @update:model-value="$emit('update:modelValue', $event)"
  @close="$emit('update:modelValue', false)"
/>
```

### 3. Contracts

| Step | Action | Why |
|---|---|---|
| Parent `v-if="businessObject"` | Mount the dialog only when a target exists | Avoids stale state from the previous object lingering in DOM |
| Parent `:key="businessObject.id"` | Force re-creation of dialog instance on target switch | Child `setup()` re-runs, all `ref` / `computed` reset, props see fresh values |
| Child `:model-value` + `@update:model-value` | Forward open/close from parent to el-dialog and emit changes back | Maintains true two-way binding through el-dialog's internal close events |
| Child must NOT wrap `modelValue` in `computed({ get, set: () => {} })` | — | An empty setter swallows el-dialog close events; parent state never updates and the dialog appears stuck |

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| Open dialog for object A → close → open for object B | Child component is destroyed and re-created; B's data fully replaces A's, no leaked refs or computed cache |
| User clicks close button / mask / presses ESC | `@update:model-value(false)` → parent `showDialog = false` → dialog closes cleanly |
| Parent sets `businessObject = null` while open | `v-if` removes dialog from DOM; no orphaned child state |
| Child internal `ref`s (e.g. highlight, scroll position) | Reset on every open, because `:key` change destroys the previous instance |

### 5. Wrong vs Correct

#### Wrong

```vue
<!-- Child: empty setter breaks two-way binding -->
<el-dialog v-model="visible" :destroy-on-close="true" />

<script setup>
const visible = computed({
  get: () => props.modelValue,
  set: () => {},   // BUG: close event is dropped, parent state never flips
})
</script>
```

```vue
<!-- Parent: dialog instance mounts once; switching items does not re-run child setup -->
<DialogComponent v-if="hasOpenedOnce" v-model="show" :form-data="current" />
```

#### Correct

```vue
<!-- Child: explicit emit, no empty setter, no destroy-on-close -->
<el-dialog
  :model-value="modelValue"
  @update:model-value="$emit('update:modelValue', $event)"
  @close="$emit('update:modelValue', false)"
/>
```

```vue
<!-- Parent: per-object key so the child is fully rebuilt on switch -->
<DialogComponent
  v-if="current"
  v-model="show"
  :key="current.id ?? current.index"
  :form-data="current"
/>
```

---

## Scenario: Word Preview ↔ Word Export Visual Parity (Fill-Line / Trailing Underscore)

### 1. Scope / Trigger

- Trigger: any change to how the Word **preview** renders fill-lines (`____`),
  choice options with `trailing_underscore`, table-cell row height, or any
  field control whose output contains runs of `_` characters.
- Affected files:
  - `frontend/src/composables/useCRFRenderer.js` (preview source of truth)
  - `frontend/src/styles/main.css` (`.fill-line`, `.word-page` font size)
  - `backend/src/services/export_service.py` (Word export, authoritative target)
- Mandatory cross-stack contract — see
  `.trellis/spec/guides/cross-stack-contracts.md` → "Word Preview / Export Visual Parity".

### 2. Signatures

```javascript
// frontend/src/composables/useCRFRenderer.js
const FILL_LINE_WEIGHT = 6              // planner weight (cross-stack contract)
function buildFillLineHtml(length = 20) // 0.5em/char to match SimSun 10.5pt
function renderCtrl(field): string      // path A: returns plain text with `_`
function renderCtrlHtml(field): string  // path B: returns sanitized HTML
function renderChoiceHtml(fieldType, rawOptions): string  // called by path B
function toHtml(text): string           // converts `_{4,}` → buildFillLineHtml(n)
```

```python
# backend/src/services/export_service.py — authoritative target
WIDTH_OF_TRAILING_UNDERSCORE = 6   # "_" * 6 — written into the DOCX run
WIDTH_OF_EMPTY_TEXT_PLACEHOLDER = 16  # "_" * 16 for default text fields
```

```css
/* main.css */
.word-page { font-size: 10.5pt; font-family: 'SimSun', serif; }
.word-page td { padding: 5.25pt 6px; line-height: 1.0; }
/* C-01 red line: .fill-line class / styling logic must not change */
.fill-line { display: inline-block; border-bottom: 1px solid #333; min-width: 3em; }
```

### 3. Contracts

| Aspect | Preview (FE) | Export (BE) | Rule |
|---|---|---|---|
| Trailing-underscore literal | `${text}______` (6 `_`) — `useCRFRenderer.js:458` | `label + " " + "_" * 6` — `export_service.py` `_render_choice_field` | Same character count: **6** |
| Default text fill-line | `'________________'` (16 `_`) — `renderCtrl` ASCII fallback | `"_" * 16` placeholder | Same character count: **16** |
| Fill-line min-width estimator | `safeLength * 0.5em` — `buildFillLineHtml:327` | N/A (real chars) | `0.5em` is calibrated against SimSun 10.5pt `_` glyph |
| Page font size | `.word-page { font-size: 10.5pt }` | Word run `Pt(10.5)` | Must stay aligned; do NOT switch to `px`/`rem` |
| Table-cell vertical rhythm | `.word-page td { padding: 5.25pt 6px; line-height: 1.0 }` | Paragraph spacing `space_before=5.25pt`, `space_after=5.25pt`, `line_spacing=1.0` | Preview row height should track exported Word rows; horizontal padding is not part of this rhythm contract |
| Choice atom non-breaking | preview: `display:inline-flex; white-space:nowrap` | export: NBSP ` ` joins label + line | Both keep label + line as one unbreakable token |
| Column-width weight | `FILL_LINE_WEIGHT = 6` (JS) | `FILL_LINE_WEIGHT = 6` (PY) | **Frontend-only visual changes (e.g. `0.5em` factor) MUST NOT change this constant.** Weight is the planner contract; visual `min-width` is the preview-only estimator. |

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| User toggles `trailing_underscore=1` on an option | Both preview (path A and B) and export render exactly 6 `_` worth of width; tested visually side-by-side with the same form |
| Field is empty text (no default) | Preview shows fill-line ≈8em; export emits 16 `_` characters; visually equivalent |
| Page is exported to DOCX and opened in Word | Choice option width matches the preview rendered in browser at A4 zoom 100% within ~1mm |
| Developer changes `.word-page td` vertical padding or line-height | Must compare against backend paragraph spacing and update `wordPageGeometry.test.js`; otherwise preview row density drifts from exported Word |
| Developer changes `0.5em` factor in `buildFillLineHtml` | Only the **visual** estimator moves; planner contract `FILL_LINE_WEIGHT = 6` stays unchanged; both FE and BE column widths remain identical |
| Developer changes the literal `______` (6) in `renderCtrl` | BOTH `_render_choice_field` (`"_" * 6`) and `_get_option_labels` (`"______"`) must change to the same count, otherwise preview ↔ export diverge |

### 5. Good/Base/Bad Cases

- **Good**: a choice option `本研究疾病相关` with `trailing_underscore=1`. Preview shows `○ 本研究疾病相关` followed by a ~3em fill-line; export shows the same label + NBSP + `______` of comparable on-page width.
- **Base**: a plain text field with no default. Both preview and export render a ~8em fill-line (preview: span; export: 16 `_` chars).
- **Bad**: developer changes `buildFillLineHtml(6)` to `buildFillLineHtml(12)` in `renderChoiceHtml` — fill-line in preview becomes ~6em (double width), no longer matches export.
- **Bad**: developer changes `.word-page td` back to `padding: 4px 6px` or removes `line-height: 1.0` — preview rows become shorter than exported Word rows because Word export uses `space_before/after=5.25pt` with single line spacing.

### 6. Tests Required

| Test | Assertion |
|---|---|
| `frontend/tests/columnWidthPlanning.test.js` | Inline choice with `trailing_underscore` adds `FILL_LINE_WEIGHT = 6` to the column demand (existing case 9.3) |
| `frontend/tests/columnWidthPlanning.pbt.test.js` | Property: changing the visual `min-width` estimator never changes planner fractions |
| `frontend/tests/wordPageGeometry.test.js` | `.word-page td` keeps `padding: 5.25pt 6px` and `line-height: 1.0` to mirror Word paragraph rhythm |
| `backend/tests/test_width_planning.py` | `FILL_LINE_WEIGHT = 6` and the cross-stack `planner_cases.json` round-trip |
| Manual A4-zoom side-by-side | Open the preview at A4 zoom 100% in Chromium, export the same form to DOCX, open in Word at 100% zoom — fill-line widths overlap within ~1mm |

### 7. Wrong vs Correct

#### Wrong: forgot the second render path

```javascript
// useCRFRenderer.js — only renderChoiceHtml fixed
function renderChoiceHtml(fieldType, rawOptions) {
  // ...
  const suffixHtml = option.trailingUnderscore ? buildFillLineHtml(6) : ''  // ✓ aligned
  // ...
}

export function renderCtrl(field) {
  // BUG: this path feeds VisitsTab.getInlineRows and FormDesignerTab.getInlineRows
  // via `renderCtrl(field) → toHtml()`. If left at 20 `_`, the inline-table
  // rows still render a too-wide fill-line.
  const opts = normalizeChoiceOptions(field.options).map(option => (
    option.trailingUnderscore ? `${option.text}____________________` : option.text  // ✗ 20 `_`
  ))
  // ...
}
```

Symptom: the designer top preview and `SimulatedCRFForm` look correct, but the
**`访视` (Visits) tab inline table** and the **designer's own `getInlineRows`** still
show the wide fill-line. User reports "preview not changing" after the fix.

#### Correct: fix BOTH paths and the visual estimator together

```javascript
// useCRFRenderer.js

// 1) renderChoiceHtml — path B (renderCtrlHtml)
const suffixHtml = option.trailingUnderscore ? buildFillLineHtml(6) : ''

// 2) renderCtrl — path A (renderCtrl + toHtml, used by getInlineRows)
const opts = normalizeChoiceOptions(field.options).map(option => (
  option.trailingUnderscore ? `${option.text}______` : option.text  // 6 `_`, matches export
))

// 3) buildFillLineHtml — visual estimator calibrated to SimSun 10.5pt
function buildFillLineHtml(length = 20) {
  const safeLength = Math.max(4, Number(length) || 20)
  const minWidth = (safeLength * 0.5).toFixed(1)   // 0.5em/char, not 0.55
  return `<span class="fill-line" style="min-width:${minWidth}em"></span>`
}
```

> **Why three changes**: the preview has **two independent render pipelines**
> that both reach the DOM (`renderCtrlHtml → renderChoiceHtml` vs `renderCtrl →
> toHtml`), and the visual width is governed by a separate em-estimator.
> Touching only one of the three leaves the other paths visibly inconsistent
> with the Word export.

---

## Common Mistakes

### 1. Not Using `<script setup>`

```vue
<!-- WRONG - Options API -->
<script>
export default {
  data() {
    return { count: 0 }
  }
}
</script>

<!-- CORRECT - Composition API -->
<script setup>
const count = ref(0)
</script>
```

### 2. Prop Drilling Too Deep

```vue
<!-- WRONG - Pass through 5 levels -->
<Parent :data="data" />
  <Child :data="data" />
    <Grandchild :data="data" />
      <GreatGrandchild :data="data" />

<!-- CORRECT - Use provide/inject -->
<!-- In Parent -->
provide('sharedData', data)

<!-- In GreatGrandchild -->
const data = inject('sharedData')
```

### 3. Not Using Element Plus

```vue
<!-- WRONG - Custom button -->
<button class="my-btn">Save</button>

<!-- CORRECT - Element Plus button -->
<el-button type="primary" @click="save">Save</el-button>
```

### 4. Eager Loading Heavy Components

```vue
<!-- WRONG - Imported synchronously -->
import FormDesigner from './FormDesignerTab.vue'

<!-- CORRECT - Lazy loaded -->
const FormDesigner = defineAsyncComponent(() =>
  import('./FormDesignerTab.vue')
)
```

### 5. Inline Event Handlers for Complex Logic

```vue
<!-- WRONG - Complex inline -->
<el-button @click="items.filter(i => !i.deleted).forEach(i => remove(i))">

<!-- CORRECT - Named method -->
<el-button @click="removeDeletedItems">
```
