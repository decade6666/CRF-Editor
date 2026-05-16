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

## Scenario: Word Preview ↔ Word Export Strict Table-Field Parity

### 1. Scope / Trigger

- Trigger: any change to Word preview or Word export rendering for table-field
  text, choice options, fill-lines, numeric/date placeholders, inline grouping,
  or form section pagination.
- Affected files:
  - `frontend/src/composables/useCRFRenderer.js` (control text + HTML rendering)
  - `frontend/src/composables/formFieldPresentation.js` (display label and group segmentation)
  - `frontend/src/components/FormDesignerTab.vue` (designer preview and inline rows)
  - `frontend/src/components/VisitsTab.vue` (visit preview and inline rows)
  - `frontend/src/components/TemplatePreviewDialog.vue` (template preview inline rows)
  - `frontend/src/styles/main.css` (`.fill-line`, `.word-page`, title and table rhythm)
  - `backend/src/services/export_service.py` (authoritative `.docx` export)
  - `backend/src/services/width_planning.py` (planner weight contract)
  - `backend/src/services/word_table_parity.py` and `backend/scripts/compare_word_table_parity.py` (strict comparator)
- Mandatory cross-stack contract — see
  `.trellis/spec/guides/cross-stack-contracts.md` → "Word Preview / Export Visual Parity".

### 2. Signatures

```javascript
// frontend/src/composables/useCRFRenderer.js
const FILL_LINE_WEIGHT = 6
function buildFillLineHtml(length = 20): string
function renderCtrl(field): string
function renderCtrlHtml(field): string
function renderChoiceHtml(fieldType, rawOptions): string
function toHtml(text): string
function isDefaultValueSupported(fieldType, inlineMark): boolean
function normalizeDefaultValue(value, singleLine = false): string
```

```javascript
// frontend preview table builders
function buildFormDesignerRenderGroups(fields): Array<Group>
function buildFormDesignerUnifiedSegments(fields): Array<Segment>
function getFormFieldDisplayLabel(formField): string
```

```python
# backend/src/services/export_service.py
WIDTH_OF_TRAILING_UNDERSCORE = 6
WIDTH_OF_EMPTY_TEXT_PLACEHOLDER = 16

def _render_choice_field(paragraph, field_type, options): None: ...
def _get_control_text(field_definition): str: ...
def _group_form_fields(form_fields): list[list[FormField]]: ...
```

```python
# backend/src/services/word_table_parity.py
@dataclass(frozen=True)
class TableFieldForm:
    name: str
    tables: list[list[list[str]]]

def extract_docx_form_table_fields(docx_path: Path): list[TableFieldForm]: ...
def compare_table_field_forms(preview_forms, export_forms, max_mismatches=50): TableFieldParityReport: ...
```

```css
.word-page { font-size: 10.5pt; font-family: 'SimSun', serif; }
.word-page td { padding: 5.25pt 6px; line-height: 1.0; }
.word-page .wp-form-title { font-size: 14pt; font-weight: bold; text-align: left; }
.fill-line { display: inline-block; border-bottom: 1px solid #333; min-width: 3em; }
```

### 3. Contracts

| Aspect | Preview (FE) | Export (BE) | Rule |
|---|---|---|---|
| Choice marker-label spacing | `○有尾线`, `□选项1` | same literal text in DOCX runs | No internal space between marker and label. |
| Choice option separator | horizontal choices join with two ASCII spaces | same | The two spaces separate options, not marker and label. |
| Trailing underscore | `label______` (6 `_`) and `buildFillLineHtml(6)` for HTML | `label + "_" * 6` | No NBSP and no extra separator between label and underscores. |
| Default text fill-line | `________________` (16 `_`) | `"_" * 16` | Character count stays 16. |
| Numeric placeholder | repeated boxes such as `|__||__||__|.|__|` | same | Each digit uses a standalone `|__|` box. |
| Datetime placeholder | date + two ASCII spaces + time | same | Date/time separator is exactly two spaces. |
| Inline default fallback | repeat full `renderCtrl(field)` when no scoped default exists | same exported control text | Do not collapse fallback controls to six underscores. |
| Inline scoped default | multiline defaults expand rows; missing later rows fall back to full control text | same row text model | Empty trailing default rows are trimmed before row expansion. |
| Group ordering | continuous normal/inline segments preserve `order_index` | `_group_form_fields` preserves the same segments | Never aggregate all normal fields before/after inline blocks. |
| Form section pagination | preview form order matches export form order | portrait forms use next-page section breaks | No plain page break should replace a section break between portrait forms. |
| Page font/title/rhythm | SimSun 10.5pt, left title, `5.25pt / 1.0` row rhythm | python-docx `Pt(10.5)`, Heading-1 default left alignment, paragraph spacing `5.25pt / 1.0` | Geometry changes require both style tests and export checks. |
| Column-width weight | `FILL_LINE_WEIGHT = 6` | `FILL_LINE_WEIGHT = 6` | The planner constant tracks demand weight, not HTML visual estimator width. |

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| Choice option has `trailing_underscore=1` | Preview path A, preview path B, inline preview, and export all render marker + label with no internal space and exactly six trailing underscores. |
| Horizontal choice has two options | Output is `○A  ○B` / `□A  □B`; there is no `○ A` or `□ A`. |
| Text field has no default | Preview and export both use 16 underscores as the plain-text placeholder. |
| Numeric field uses `integer_digits=3`, `decimal_digits=1` | Preview and export emit `|__||__||__|.|__|`. |
| Datetime field includes date and time | Preview and export separate date and time placeholders with two ASCII spaces. |
| Inline field lacks a scoped default | Inline preview rows repeat the full control fallback (`renderCtrl`), not a shortened fill-line. |
| Inline field has multiline default | Preview and export produce the same row count and fallback cells for shorter columns. |
| Normal and inline fields are interleaved by `order_index` | Preview and export tables preserve the same segment order. |
| DOCX contains merged heading/log cells | Comparator collapses duplicated `python-docx` merged cells by underlying XML identity before counting. |
| Developer changes `.word-page td`, title alignment, font, or section behavior | Must update geometry/export tests and rerun strict comparator evidence; otherwise preview/export can drift visually or structurally. |

### 5. Good/Base/Bad Cases

- **Good**: `单选` option `有尾线` with `trailing_underscore=1` renders as `○有尾线______` in exported table text and as marker + label + a 6-character fill-line in preview HTML.
- **Good**: an interleaved form `normal A → inline B/C → normal D` appears in the same order in designer preview, visit preview, template preview, and exported DOCX.
- **Base**: a plain text field with no default renders `________________` on both sides.
- **Base**: an empty default-control inline cell repeats its full field-specific placeholder on every generated inline row.
- **Bad**: using `label + " " + "_" * 6` in export or `○ label` in preview creates strict cell-text mismatches.
- **Bad**: shortening inline fallback controls to `______` makes preview cells differ from exported default placeholders such as `________________`.
- **Bad**: replacing portrait section breaks with `doc.add_page_break()` keeps visual pages apart but loses section parity and can change downstream page geometry.

### 6. Tests Required

| Test / Check | Assertion |
|---|---|
| `backend/tests/test_export_unified.py` | Choice marker runs use SimSun and marker-label text has no internal space or NBSP. |
| `backend/tests/test_export_service.py` | Portrait forms use next-page section breaks; mixed normal/inline groups preserve order. |
| `backend/tests/test_width_planning.py` | Choice atom demand excludes marker-label internal space and keeps `FILL_LINE_WEIGHT = 6`. |
| `backend/tests/test_word_table_parity.py` | Comparator counts rows/cells exactly and collapses merged cells. |
| `frontend/tests/columnWidthPlanning.test.js` | Choice literals, numeric boxes, datetime spacing, and width demands match backend. |
| `frontend/tests/wordPageGeometry.test.js` | Word page font, title alignment, table fixed layout, and row rhythm stay aligned. |
| `backend/scripts/compare_word_table_parity.py` | Real preview JSON vs exported DOCX returns `exact_cell_ratio = 1.0`, `exact_row_ratio = 1.0`, and `mismatches = []`. |
| Manual A4-zoom side-by-side | Browser preview at A4 100% and Word/WPS at 100% have matching table text and expected geometry. |

### 7. Wrong vs Correct

#### Wrong: keep NBSP and marker-label spaces

```python
# export_service.py
atom_text = label + " " + "_" * 6
```

```javascript
// useCRFRenderer.js
return options.map(option => `○ ${option.text}`).join('  ')
```

This renders `○ 有尾线` in preview and joins label/underscores with NBSP in export,
while the strict table-text contract expects `○有尾线______`.

#### Correct: keep only the option separator spaces

```python
# export_service.py
atom_text = label + "_" * WIDTH_OF_TRAILING_UNDERSCORE
```

```javascript
// useCRFRenderer.js
return options.map(option => '○' + option.text).join('  ')
```

#### Wrong: collapse inline fallback controls

```javascript
return { lines: ['______'], repeat: true, fallback: '______' }
```

The six-underscore fallback only fits trailing choice options. It breaks empty text,
numeric, date, datetime, and default choice controls.

#### Correct: preserve the full renderer fallback

```javascript
const ctrl = toHtml(renderCtrl(formField.field_definition))
return { lines: [ctrl], repeat: true, fallback: ctrl }
```

`renderCtrl` remains the single preview source for field-specific placeholder text,
and strict comparator evidence must confirm the generated preview JSON and exported
DOCX are structurally identical.

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
