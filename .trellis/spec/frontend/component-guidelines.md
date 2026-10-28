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

### Lazy-Mounted v-model Dialogs

When a dialog is mounted lazily with `v-if` or `defineAsyncComponent` and its initial load depends on an already-open `modelValue`, the child component must consume the initial prop value during setup.

```javascript
watch(() => props.modelValue, (visible) => {
  if (visible && props.formId) loadFields()
}, { immediate: true })
```

Contracts:

- Parent code must set required context props such as `formId` before enabling the lazy-mount flag and opening `modelValue`.
- Child watchers that trigger initial data loading from `modelValue` must use `immediate: true` or an equivalent setup-time initialization path.
- Tests should prefer behavior-level lazy-mount coverage: mount with `modelValue: true` already set, then assert the expected load/API call happens.
- Avoid source-string tests that only assert the watcher contains an option; they do not prove the lazy-mount behavior.

---

### Shared Toolbar / Top-Slot Contract

`main.css` provides two semantic classes for list toolbars and pane title rows:

```css
.list-toolbar,
.pane-tool-slot {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  margin-bottom: 12px;
  flex-shrink: 0;
}
```

Contracts:

- `.list-toolbar` is for action toolbars (add / batch-delete / search / import); `.pane-tool-slot` is for title rows or structural placeholders on the non-action side of two-pane pages.
- Slot height math: no-border toolbar = 24px + 12px = 36px; a title row with a 1px bottom border may total 37px. Browser acceptance tolerance is 0–1px; use `size="small"` controls (24px) inside slots — a default 32px `el-switch` re-grows the slot to ~44px and breaks two-pane top alignment.
- Consumers: CodelistsTab (both panes), UnitsTab, FieldsTab (left toolbar + right pane header), FormDesignerTab form list and `.fd-canvas-header`, VisitsTab (default list / flow header / single-visit rows). The template-import entry lives in the form list toolbar only (`新建 → 搜索 → 导入模板 → 批量删除`) and `FormDesignerTab` emits `import-template` to `App.vue`.
- Forbidden: page-local negative margins, duplicated `gap` / `margin-bottom` patches; a positive `margin-left:auto` spacer is allowed to push a trailing action (e.g. 访视流程) to the right.

### Admin Workspace Width Constraint

The admin workspace root in `App.vue` uses `.admin-shell` to constrain the whole content block (title + actions + table) to the shared wide shell and center it:

```css
.admin-shell {
  width: 100%;
  max-width: 1200px;
  margin-inline: auto;
  padding-inline: 20px;
  box-sizing: border-box;
}
```

Contracts:

- Keep the entire admin content block centered as one unit; do not constrain only the table while leaving the header full-width.
- Do not add page-scoped body-cell alignment overrides (`td`, `.cell`) under `.admin-shell`; global `tableHeaderStyle.test.js` locks the Element Plus table-header fill/centering contract, while ordinary body cells keep the Element Plus default left alignment. The shared selection-column exception is owned by `main.css`: Element Plus renders its `.cell` as shrink-wrapped `inline-flex`, so the global rule must use `display: flex` + `justify-content: center` + zero horizontal padding to center both header and body checkboxes.
- Dialogs in `AdminView.vue` use `append-to-body` and stay visually independent of the shell.
- Both admin pages (`AdminView` users page and `OrganizationManagementView` orgs page) share the single `.admin-shell` and are wrapped in ONE `<KeepAlive>` in `App.vue`; switching pages must not re-mount/re-fetch/re-download logos, and blob URLs are released only on real unmount (admin logout).
- Org page is a full-width preset table plus an add/edit `el-dialog` (there is no persistent right editor pane and no "click left list to edit" placeholder); logo thumbnails use `el-image` built-in preview (`preview-src-list` + `preview-teleported` + programmatic `showPreview` for keyboard + `hide-on-click-modal` backdrop close), read the logo via `/api/organization-presets/{id}/logo`, and revoke every created object URL on save-refresh / delete / unmount.
- Project-list batch operations are a two-step dialog (select projects → choose copy/move target user with 上一步 back); the target-user select always excludes the source user for BOTH copy and move.
- Project ordinary/batch soft deletes are recoverable through the admin recycle bin, so their confirmation copy says 「删除后如需恢复，请联系管理员。」; only recycle-bin hard delete keeps 「此操作不可恢复」.

### Right-Side Property Card Pattern (Units / Visits / Fields)

UnitsTab, VisitsTab (list workspace) and FieldsTab share the same two-pane property-card structure:

```
outer row: display:flex; gap:12px; align-items:stretch; height:calc(100vh - 160px)
left:  flex:1; min-width:0; display:flex; flex-direction:column  (+ .list-toolbar + el-table height:100%)
right: width:320px; display:flex; flex-direction:column; flex-shrink:0
  ├ .pane-tool-slot（title, OUTSIDE the card）→ card top = table top = 36px slot
  └ inner: flex:1; min-height:0; border:1px solid var(--color-border); border-radius:4px; overflow:hidden
```

Contracts:

- Row click selects and hydrates the card (edit mode); the toolbar Plus opens the same card in create mode; Cancel/清空 returns to the empty-state placeholder.
- Row action columns keep only copy/delete (no EditPen); deleting the active row must clear the card selection.
- VisitsTab list card edits OID + name only; `sequence` is never part of the card or the PUT payload — drag + ordinal quick edit are the only ordering interfaces.
- After deleting the selected visit, el-table re-render fires a `current-change` that would land on another row; suppress that passive re-select (`suppressVisitRowSelect`) so the card stays empty.
- Do not create a shared property-card component: the layouts share only visual structure; business state and impact confirmation differ per tab (the current per-tab inline implementation is intentional).

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

### Teleported Dialog Root Styling

When an Element Plus dialog uses `append-to-body` (teleported under `<body>`), do **not** rely on scoped selectors for the dialog root box sizing. The teleported root is no longer under the component's scoped style ancestor, so rules such as `:deep(.my-dialog)` can miss the actual `.el-dialog` root.

```vue
<template>
  <el-dialog
    v-model="visible"
    class="import-preview-dialog"
    append-to-body
  />
</template>

<style>
.import-preview-dialog {
  height: 95vh;
  max-height: 95vh;
  display: flex;
  flex-direction: column;
}

.import-preview-dialog .el-dialog__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
```

Contracts:

- Use a unique root `class` on the dialog itself when the teleported root needs sizing or layout rules.
- Keep teleported root-box rules in a non-scoped `<style>` block, or another global stylesheet path that can reach `<body>` descendants.
- Reserve scoped styles for content inside the dialog body that still renders under the component subtree.
- Prefer `class` over deprecated `custom-class` on Element Plus dialog roots.

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
  const r = await fetch(apiUrl(`/api/projects/${projectId}/logo`), { headers: getAuthHeaders() })
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
| Child does NOT translate `@close` into `update:modelValue(false)`; it forwards only `@update:model-value`. `@close` is for unrelated housekeeping (e.g. `AdminView.vue`'s `@close="resetProjectListState"`) | — | Element Plus 2.13.2 (`use-dialog.mjs`) emits `close` in `beforeLeave` but `update:modelValue(false)` in `afterLeave`. When the parent's close branch has side effects (stop polling, clear compare state), the `@close` translation moves that cleanup to the start of the leave transition — an undeclared timing change. See `WordImportDialog.vue`; `DocxCompareDialog.vue` / `TemplatePreviewDialog.vue` keep the translation only because their parents' close branches are side-effect free |

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| Open dialog for object A → close → open for object B | Child component is destroyed and re-created; B's data fully replaces A's, no leaked refs or computed cache |
| User clicks close button / mask / presses ESC | `@update:model-value(false)` → parent `showDialog = false` → dialog closes cleanly |
| Parent sets `businessObject = null` while open | `v-if` removes dialog from DOM; no orphaned child state |
| Child internal `ref`s (e.g. highlight, scroll position) | Reset on every open, because `:key` change destroys the previous instance |
| Child translates `@close` into `update:modelValue(false)` while the parent's close branch stops a timer or clears state | Cleanup runs in `beforeLeave` (leave-transition start) instead of `afterLeave`; keep the translation only for side-effect-free parents |

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

```vue
<!-- Child: translating @close into update:modelValue(false) when the parent cleans up on close
     (WordImportDialog.vue's parent stops AI-review polling and clears compare state when
     modelValue goes false — that cleanup would fire in beforeLeave, at leave-transition start). -->
<el-dialog
  :model-value="modelValue"
  @update:model-value="emit('update:modelValue', $event)"
  @close="emit('update:modelValue', false)"
/>
```

#### Correct

```vue
<!-- Child: explicit emit, no empty setter, no destroy-on-close, no @close translation -->
<el-dialog
  :model-value="modelValue"
  @update:model-value="$emit('update:modelValue', $event)"
/>
<!-- Footer buttons may still emit false directly:
     @click="$emit('update:modelValue', false)" -->
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

`@close` is still the right hook for housekeeping unrelated to `modelValue` — e.g. `AdminView.vue` uses `@close="resetProjectListState"`. `DocxCompareDialog.vue` and `TemplatePreviewDialog.vue` keep the `@close` → `update:modelValue(false)` translation because their parents' close branches are side-effect free.

---

## Scenario: Word Preview ↔ Word Export Strict Table-Field Parity

### 1. Scope / Trigger

- Trigger: any change to Word preview or Word export rendering for table-field
  text, choice options, fill-lines, numeric/date placeholders, inline grouping,
  or form section pagination.
- Affected files:
  - `frontend/src/composables/useCRFRenderer.js` (control text + HTML rendering)
  - `frontend/src/composables/formFieldPresentation.js` (display label and group segmentation)
  - `frontend/src/components/FormDesignerTab.vue` (designer state/cache/persistence owner: render-group view models, resizer caches, annotation map, save/undo/session)
  - `frontend/src/components/DesignerWordPreview.vue` (shared `word-page` preview markup, rendered twice by `FormDesignerTab` with `scope="main"` / `scope="designer"`)
  - `frontend/src/components/DesignerAcrfAnnotation.vue` (per-marker annotation span + reset button markup and their styles)
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
| Choice marker-label spacing | `○其他`, `□选项1` | same literal text in DOCX runs | No internal space between marker and label. |
| Choice option separator | horizontal choices join with two ASCII spaces | same | The two spaces separate options, not marker and label. |
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

- **Good**: an interleaved form `normal A → inline B/C → normal D` appears in the same order in designer preview, visit preview, template preview, and exported DOCX.
- **Base**: a plain text field with no default renders `________________` on both sides when no column-width context is provided.
- **Base**: an empty default-control inline cell repeats its full field-specific placeholder on every generated inline row.
- **Bad**: using `label + " " + underscores` in export or `○ label` in preview creates strict cell-text mismatches.
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
atom_text = "○ " + label
```

```javascript
// useCRFRenderer.js
return options.map(option => `○ ${option.text}`).join('  ')
```

This renders `○ 其他` in preview and export, while the strict table-text contract
expects `○其他` with no space between marker and label.

#### Correct: keep only the option separator spaces

```python
# export_service.py
atom_text = "○" + label
```

```javascript
// useCRFRenderer.js
return options.map(option => '○' + option.text).join('  ')
```

#### Wrong: collapse inline fallback controls

```javascript
return { lines: ['______'], repeat: true, fallback: '______' }
```

A fixed six-underscore fallback is far shorter than the whole-cell text fill-line
(16) and breaks empty text, numeric, date, datetime, and default choice controls.

#### Correct: preserve the full renderer fallback

```javascript
const ctrl = toHtml(renderCtrl(formField.field_definition))
return { lines: [ctrl], repeat: true, fallback: ctrl }
```

`renderCtrl` remains the single preview source for field-specific placeholder text,
and strict comparator evidence must confirm the generated preview JSON and exported
DOCX are structurally identical.

---

## Scenario: Stateless Word-Preview Extraction (`DesignerWordPreview`)

### 1. Scope / Trigger

- Trigger: extracting the duplicated `word-page` markup out of `FormDesignerTab.vue` into a presentational child the
  same parent renders twice — `scope="main"` / `scope="designer"` — including the per-marker annotation spans (task
  `designer-split`, 2026-10-11). Cache keys/rehydrate stay in `state-management.md` §4; annotation spec in §6.

### 2. Signatures

```javascript
// frontend/src/components/DesignerWordPreview.vue
defineProps({
  selectedForm: { type: Object, default: null }, groupsView: { type: Array, required: true },
  scope: { type: String, required: true, validator: (v) => v === 'main' || v === 'designer' },
  landscapeMode: { type: Boolean, required: true }, noFields: { type: Boolean, required: true },
  showAcrfAnnotations: { type: Boolean, required: true },
  showFormOid: { type: Boolean, required: true },
  // 14 required { type: Function, required: true } props bound via v-bind="previewHandlers":
  // getResizer, getRowResizer, renderCellHtml, normalFillChars, openQuickEdit, getFormDomainAnnotationText,
  // getFieldOidAnnotationText, getFormAnnotationTarget, getFieldAnnotationTarget, isAnnotationDraggable,
  // hasAnnotationOverrideForTarget, getAnnotationStyle, onAnnotationPointerDown, resetAnnotationPosition
})
// no emits, no provide/inject, no defineExpose

// frontend/src/components/DesignerAcrfAnnotation.vue
defineProps({ text: { type: String, required: true },
  kind: { type: String, required: true, validator: (v) => ['form', 'field', 'inline-header'].includes(v) },
  interactive: { type: Boolean, default: false }, hasOverride: { type: Boolean, default: false },
  annotationStyle: { type: Object, required: true } });
defineEmits(['pointerdown', 'reset']); // pointerdown($event) unconditional; reset() from the reset button
```

### 3. Contracts

| Rule | Why |
|---|---|
| `state-management.md` §4 (Column Width Persistence Contract) stays the single source for storage keys, rehydrate rules, and the export collector | Duplicating key formats or algorithms here would drift from the cache contract |
| Child holds no `ref` state and no cache instance. The 7 explicit data props carry the view models (`showFormOid` added 2026-10-13, task `word-preview-form-oid`: full-mode paper-title form-OID gate rendered through the shared `FormPreviewOid.vue`, independent of `showAcrfAnnotations`); the 14 function props (one `previewHandlers` object, `v-bind` on both instances) only grant access to the parent's state/caches | Resizer caches and `rehydrate` must stay single-owned — a child-owned cache would read the same keys but desync the parent's rehydrate flow |
| Both instances get `v-bind="previewHandlers"` plus their own data props: `scope` (`'main'` / `'designer'`), `groupsView` (`renderGroupsView` / `designerRenderGroupsView`), `landscapeMode` (`landscapeMode` / `designerLandscapeMode`), `noFields` | Declared difference set = exactly the per-instance data props |
| Child root replaces the original `div.word-page` 1:1; parent keeps `.fd-canvas` / `.word-preview` (main) and `.designer-preview-pane` / `-viewport` / `-stage` / `-page` (fullscreen) wrappers | Keeps blank-click exclusion, responsive CSS and `paneSplit` assertions in place |
| Scoped CSS: only rules matching **inside** the moved subtree move to the child's `<style scoped>`. A parent scoped rule reaches only the child root, so descendant rules (`__text`, `-reset`, the `:hover` / `:focus-within` reveal) must move or they silently stop applying | The gotcha that breaks previews invisibly; global `main.css` `.word-page …` rules still reach the child (e.g. `.word-page .wp-form-title { text-align: left }`) |
| Parent signatures keep `scope` threaded through: `getResizer(kind, colCount, groupIndex, group, scope)` (24 template sites per block) and `normalFillChars(groupIndex, group, scope)` (1 site per block). The **shared row cache** stays two-arg: `getRowResizer(kind, group)` | Guarding the row cache with a scope argument changes persisted row heights |
| Emits are declared (`defineEmits`), not native fallthrough; the annotation reset button uses `@pointerdown.stop` | A declared emit is removed from `$attrs`, so one DOM event fires the parent handler exactly once, not twice |
| Parent keeps annotation drag gate (`isAnnotationDraggable`) and persistence; children stay presentational | Preserves cross-stack §6 geometry/clamp/PATCH contract |
| The child is pure markup + the two view-only helpers (`cumRatio`, `getRowHeightStyle`); algorithms and storage keys do NOT move | The extraction must not change the rendered semantics — see §8 |

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| Typed prop validation fails in dev (wrong type / missing required prop) | Vue emits a warning; the mount-test warning gate fails the suite — do not silence it; fix the call site or the fixture |
| A template identifier is missing from the child's imports | Depends on the expression: a Vue render/dev-mode warning, or a runtime render failure / invalid output — never assume a graceful production fallback. Mount every template branch under the warning gate so the identifier is exercised |
| Regression test asserts rendered content | Descendant text is still readable via `textContent`, but it cannot prove markup structure, escaping, or classes; for `v-html` cells and class-carrying rows assert `innerHTML` / element selectors **alongside** text |
| Source-level guard written across both instances | Each instance's props must be checked **inside its own tag** (segment bounded by `scope="main"` vs `scope="designer"`); a file-wide regex matches either tag and hides a real deletion |
| Per-instance counts asserted (`renders twice`) | Meaningless if both tags can be the same instance; assert the two distinct `scope` values and each instance's declared prop set instead |

### 5. Good/Base/Bad Cases

- **Good**: the same `<DesignerWordPreview>` markup serves both scopes; changing the page changes both previews; the mount spec renders every template branch (no form, no fields, normal / inline / unified groups) with `showAcrfAnnotations: true` so every annotation call site is exercised.
- **Base**: `showAcrfAnnotations: false` renders zero annotation spans, including form and inline-header sites.
- **Bad**: a parent-only CSS rule such as `.wp-acrf-annotation-reset { … }` left in place after the markup moved — the reset button loses its styling with no error.
- **Bad**: a guard asserting "`DesignerWordPreview` appears in the file" or "rendered twice" — it passes even if the second instance lost its `scope`.

### 6. Tests Required

| Test / Check | Assertion |
|---|---|
| `frontend/tests/component/DesignerWordPreview.spec.js` | Every template branch renders with real fixtures (`formDesignerPreviewModel.js` / `formFieldPresentation.js` / `previewCellRender.test.js` shapes); `getResizer` / `normalFillChars` receive `scope`; `getRowResizer(kind, group)` stays two-arg; dblclick carries the exact clicked column's field; pointerdown carries the exact row-key / boundary index and the same event; `snapGuideX` toggles; annotation target / event / reset values point at the exact field |
| `frontend/tests/component/DesignerAcrfAnnotation.spec.js` | Class order per `kind`, `--interactive` toggle, style passthrough, aria-label per kind, `disabled` from `hasOverride`, root pointerdown exactly-once, reset-button pointerdown does not bubble |
| `frontend/tests/designerPreviewSplit.test.js` | Each parent instance checked inside its own tag; `previewHandlers` has all 14 closures and `v-bind` is on both instances; the parent holds no moved markup/CSS; the child holds the moved selectors; `main.css` keeps the parity title rule |
| `frontend/tests/component/vueWarnGate.js` (shared gate) | Any Vue warning during mount **or unmount** fails the case — this turns "every template identifier resolves" into a real assertion |
| Mutation check (evidence, not a committed test) | Disable one protected item (a handler in `previewHandlers`, a second column's field argument) and confirm the guard fails; a green suite alone does not prove the guard bites |

### 7. Wrong vs Correct

```javascript
// DesignerWordPreview.vue (wrong): a second owner of the same storage keys
const resizer = useColumnResize(props.selectedForm?.id, ...)
// FormDesignerTab.vue (correct): parent keeps the cache, passes closures
const previewHandlers = { getResizer, getRowResizer, renderCellHtml, normalFillChars, openQuickEdit, ... }
// <DesignerWordPreview v-bind="previewHandlers" scope="main" … />
```

```css
/* FormDesignerTab.vue <style scoped> (wrong) — never reaches the child's inner span */
.wp-acrf-annotation__text { … }
/* DesignerAcrfAnnotation.vue (correct) — the rule moves with the DOM it matches */
.wp-acrf-annotation__text { … }
```

### 8. Equivalence evidence required for the extraction

The split ships only with evidence that both instances render the **same semantics** as the pre-split component —
Vue scope IDs and child component boundaries legitimately differ; "byte-identical literal DOM" is not the bar.
Reference method (task `designer-split`, reusable for any giant-component split):

- **AST equivalence**: parse the pre-split `FormDesignerTab.vue` (`git show <pre-split-commit>:…`) and the post-split
  parent + child with `@vue/compiler-sfc`; compare render functions after normalizing only compiler bookkeeping
  (scope IDs, import ownership, component-tag hops) plus the declared mode substitutions (`scope`, `groupsView`,
  `landscapeMode`, `noFields`). The semantic diff of the moved block must be empty.
- **Compiled-render equivalence**: compare compiled render output for the moved subtree: same element / attribute /
  text / event semantic nodes in the same order; no node added, removed, or reordered. The normalizer must never
  strip meaningful HTML whitespace (text content is significant to the parity contract).
- Run both proofs against the SFC sources, not a hand-maintained copy; on mismatch, exit non-zero with the diff.
- Visual evidence stays the QA harness screenshot comparison (task `designer-split` `research/qa/`), not a textual
  DOM diff.

---

## Scenario: Dialog Extraction from a Tab into a Presentational Child (VisitsTab → VisitFormPreviewDialog)

### 1. Scope / Trigger

- Trigger: a tab component holding a large modal (its own state + template + scoped CSS + open-time API flow) must
  drop below the 800-line file limit, so the modal moves out as a self-contained child (task
  `visits-preview-split`, 2026-10-12).
- This is the **sibling** of `Stateless Word-Preview Extraction (DesignerWordPreview)` above, not the same shape:
  `DesignerWordPreview` is stateless markup the parent renders **twice** and stays presentational; this child is a
  **self-contained dialog mounted once** that owns its data, its API calls and its reset lifecycle. Pick the shape
  from the trigger, not by analogy: shared markup rendered N times → presentational child + function props; a modal
  with its own load/reset cycle → data-owning child + a thin parent bridge.
- Annotation geometry/persistence stays in `cross-stack-contracts.md` §6; column-width/row-height storage keys stay
  in `state-management.md` §4 (`useRowResize` is reused unchanged with `toRef(props, 'formId')`).

### 2. Signatures

```javascript
// frontend/src/components/VisitFormPreviewDialog.vue
defineProps({
  modelValue: { type: Boolean, required: true },
  projectId: { type: Number, required: true },
  formId: { type: Number, default: null },
});
const emit = defineEmits(['update:modelValue']); // the ONLY emit; no defineExpose
// <el-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)"
//   width="90%" top="5vh" :close-on-click-modal="false" @closed="resetPreviewState">  — @close is NOT forwarded
```

```javascript
// frontend/src/components/VisitsTab.vue — bridge only (552 lines after the split)
const showFormPreview = ref(false);
const formPreviewFormId = ref(null);
function openFormPreview(form) { formPreviewFormId.value = form.id; showFormPreview.value = true; }
// unconditional mount at the former dialog position:
// <VisitFormPreviewDialog v-model="showFormPreview" :project-id="projectId" :form-id="formPreviewFormId" />
```

```javascript
// frontend/src/composables/useVisitPreviewAnnotation.js — per-invocation factory (one call = one dialog)
useVisitPreviewAnnotation({ apiClient, projectId, formId, formState, isEnabled, onError })
// returned: getFieldAnnotationTarget / getFormAnnotationTarget / isAnnotationDraggable /
// hasAnnotationOverrideForTarget / getAnnotationStyle / onAnnotationPointerDown / resetAnnotationPosition /
// flushAnnotationPositionSave / cancelActiveDrag / dispose
```

### 3. Contracts

| Rule | Why |
|---|---|
| The **unconditional** mount is what keeps `viewMode`'s setup-time init + storage write at today's timing (tab mount, not first open). `modelValue` load watchers still use `{ immediate: true }` per "Lazy-Mounted v-model Dialogs" so mount-with-open works and the mount spec can drive it | Moving the tab to lazy `v-if` mounting would silently change when `crf_view_mode` is first written |
| On open, resolve the authoritative model before rendering: `await flushAnnotationPositionSave()` → `api.cachedGet('/api/projects/{pid}/forms')` → shallow-clone the found entry `{ ...foundForm }` → `api.cachedGet('/api/forms/{id}/fields')`, all under **one** request-sequence counter | The parent's matrix row is only `{id,name}` — design notes / `paper_orientation` / `domain` / `annotation_positions` live on the `FormResponse`; the flush guarantees a close→instant-reopen never reads a pre-PATCH cache entry |
| Never mutate a `cachedGet` return value: read through a shallow clone, and merge writes into the dialog's own ref as a **new object** (`formState.value = { ...form, ...updatedForm }`) | `cachedGet` hands back the cache entry itself; in-place writes corrupt every other consumer of the same entry |
| Do **not** forward `@close`: Element Plus 2.13.2 fires `close` in the `beforeLeave` phase but `update:modelValue(false)` in `afterLeave`, so forwarding would reset state at the start of the leave transition (and double-reset when combined with `@closed`). `@closed="resetPreviewState"` keeps the post-transition reset semantics | `resetPreviewState` cancels the active drag, flushes the PATCH queue, bumps the request seq, clears state and the resizer cache — running that while the dialog is still animating out is a timing change, not a rename |
| Annotation glue goes into a per-invocation factory (`useVisitPreviewAnnotation`): no module-level mutable state, one call = one dialog = one `useAcrfAnnotationDrag` instance | Module-level state would leak between dialog instances and pin one drag instance for the whole app |
| Props consumed by such a factory must stay **refs** (`toRef(props, 'projectId')` / `toRef(props, 'formId')`), read per call via `currentProjectId()` / `currentFormId()` | `App.vue` keeps the tab mounted across programmatic `selectedProject.value = p` reassignment; value-capturing a primitive prop at setup permanently stamps the pre-switch id into every annotation target and the PATCH cache invalidation hits the old project |
| Drag is the dialog's own: `useAcrfAnnotationDrag` is instantiated **inside** the factory (not in the tab), `onBeforeUnmount` calls `dispose()`; the dialog also `watch`es `projectId` and flushes with `{ cancelActiveDrag: true }` | A queued debounced PATCH must survive unmount / a project switch; the snapshot carries the old `projectId` + `formId`, so the PATCH still targets the pre-switch form |
| The child reuses `DesignerAcrfAnnotation.vue` for all annotation markers (8 sites: form ×1 / field ×5 / inline-header ×2) and holds **zero** annotation CSS; only rules matching markup that genuinely moved (`.wp-form-title-row`) follow into the child's `<style scoped>` | The shared component is the single owner of the annotation marker CSS; a second copy silently drifts (the same scoped-CSS trap as in the `DesignerWordPreview` scenario) |
| The dialog never writes parent collections (`visitForms` / `allForms` / `matrixData`) and the tab keeps no preview state; freshness on reopen comes from the open-time `cachedGet` + PATCH invalidation chain, so the dialog does not inject `refreshKey` | Removing the four hand-synced copies + `mergeFormIntoState` is the point of the split; a refresh-key path here would resurrect the manual-sync shape |

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| Forms-list request rejects | `formPreviewError = '加载表单信息失败：' + (e.message || '未知错误')` **and** `ElMessage.error` of the same string |
| `formId` not present in the forms list | `formPreviewError = '表单不存在'`, no toast |
| Fields request rejects | `formPreviewError = '加载表单字段失败：' + (e.message || '未知错误')` **and** `ElMessage.error` of the same string (fallback `未知错误` preserved) |
| A response arrives whose sequence no longer matches the current request | It writes **nothing** (state, loading and error are all seq-guarded) — a stale response can never overwrite a newer open |
| Dialog closed via the header × / ESC (`:close-on-click-modal="false"` — a mask click deliberately does not close) | `update:modelValue(false)` → parent flips the bridge ref → after the leave transition `@closed` runs `resetPreviewState` (`cancelActiveDrag` + flush + seq bump + state/cache clear) |
| Tab unmounts while a debounced PATCH is queued | `onBeforeUnmount` → `dispose()` still sends it |
| Parent swaps `projectId` (in-place `selectedProject` reassignment, tab stays mounted) | The `projectId` watcher flushes the queued PATCH with the pre-switch snapshot before it fires; newly stamped targets use the new project id |
| The forms list itself is already cached | The open path is `flush → cachedGet(forms) → cachedGet(fields)`; cache hits still honour the sequence guard |

### 5. Good/Base/Bad Cases

- **Good**: the tab holds three symbols (`showFormPreview`, `formPreviewFormId`, `openFormPreview(row)` — id first, open second) and one unconditional `<VisitFormPreviewDialog v-model :project-id :form-id />`; every preview concern (state, template, title-row CSS, annotation glue, reset lifecycle) lives in the child.
- **Base**: opening the dialog resolves the form from the forms cache, then fields; closing and reopening re-reads both (`cachedGet` count increases) instead of relying on state left behind by the previous open.
- **Bad**: seeding the dialog from the matrix row object (`{id, name}`) — design notes, explicit paper orientation, the form-domain annotation and persisted field offsets all silently disappear.
- **Bad**: `projectId: props.projectId` captured by value inside a per-invocation factory — after a programmatic project switch the tab is still mounted, so the captured primitive is stale and invalidation hits the previous project's cache.
- **Bad**: forwarding `@close` to `resetPreviewState` in addition to `@closed` — state is torn down twice, the first at the start of the leave transition.
- **Bad**: a second copy of the `.wp-acrf-annotation*` rules in the dialog's scoped style block — the shared component owns them, and the copy drifts.
- **Bad**: mutating the object `cachedGet` returned (or the array it came from) to store a drag result — the cache entry is shared with every other consumer.

### 6. Tests Required

| Test / Check | Assertion |
|---|---|
| `frontend/tests/visitPreviewSplit.test.js` (source guards, 9 cases) | Parent renders **exactly one** dialog instance and both id props plus `v-model="showFormPreview"` are checked **inside its own tag**. A negative symbol list pins what the tab must no longer contain: `mergeFormIntoState`, `getFormStateById`, `applyFormAnnotationPositions`, `formPreviewForm`, `formPreviewTitle`, `viewMode`, `VIEW_MODE_STORAGE_KEY`, `useAcrfAnnotationDrag`, `resetFormPreviewState` — plus the plain-text absences `wp-acrf-annotation`, `设计备注`, `word-page` (word-boundary matching, so `formPreviewFormId` does not read as `formPreviewForm`). Dialog side: owns `.wp-form-title-row`, imports `Loading` and `DesignerAcrfAnnotation`, exactly 8 annotation call sites with the pinned prop/emit shapes, pinned template call shapes (`renderCellHtml(ff, normalFillChars(gv, gi))`, `'word-page', 'word-page--a4'` adjacency), and **no** annotation CSS. No new source or test file may bypass `useApi` with a bare `fetch(` |
| `frontend/tests/component/VisitFormPreviewDialog.spec.js` (vitest mount, 22 cases) | Open-time resolution from the exact `cachedGet('/api/projects/{pid}/forms')` URL, the loading branch rendering `Loading`, the F1 matrix (notes aside, landscape/portrait/auto), aCRF annotations and the persisted offset in the style, debounced drag → PATCH payload + both cache invalidations + immutable merge, save-failure re-resolve, close→reopen freshness including the flush-before-open ordering, all three error paths, and the two lifecycle guards (project switch flushes the queued PATCH; unmount flushes it) |
| `frontend/tests/component/visitsPreviewIntegration.spec.js` (4 cases) | The retained RED→GREEN witness: a real `VisitsTab` mount walking flow → single → visit row → 预览 (`sortablejs` mocked), pinning the four symptoms against the authoritative `FormResponse`. It was red on the pre-split tree; **it must never be deleted** |
| Mutation checks (evidence, not committed tests) | Each guard must bite when its subject is disabled: deleting the pre-open flush (`a`), resolving from row data instead of the forms cache (`b`), dropping one `DesignerAcrfAnnotation` site (`c`), removing the `Loading` import (`d`), and aliasing + writing in place into the cached object (`e`) must each fail at least one case. The single-point aliasing variants (`e′`) are a declared, recorded residual — no assertion pretends to cover them |

### 7. Wrong vs Correct

```javascript
// VisitFormPreviewDialog.vue (wrong): seeds from the matrix row the parent happens to hold
function openFormPreview(form) { formPreviewForm.value = form; formPreviewFields.value = [] }
// → design_notes / paper_orientation / domain / annotation_positions are all missing (the live F1 defect):
//   no notes aside, landscape form renders portrait, no form-domain annotation, offsets only appear after a drag.
```

```javascript
// VisitFormPreviewDialog.vue (correct): resolve the authoritative FormResponse, under one seq counter
const seq = ++formPreviewRequestSeq;
await flushAnnotationPositionSave();                       // drain the previous session's queued PATCH
const forms = await api.cachedGet('/api/projects/' + props.projectId + '/forms');
if (seq !== formPreviewRequestSeq) return;
const foundForm = forms.find((item) => item.id === props.formId);
formPreviewForm.value = { ...foundForm };                  // shallow clone: never hold the cache entry
const data = await api.cachedGet('/api/forms/' + props.formId + '/fields');
if (seq !== formPreviewRequestSeq) return;
formPreviewFields.value = data;
```

```javascript
// useVisitPreviewAnnotation.js (wrong): captures a primitive prop for the lifetime of the dialog
useVisitPreviewAnnotation({ projectId: props.projectId, formId: toRef(props, 'formId') });
// → after App.vue swaps projects while the tab stays mounted, targets carry the OLD project id and the PATCH
//   invalidation runs against /api/projects/{old id}/forms.
```

```javascript
// VisitFormPreviewDialog.vue (correct): hand the factory refs, read them per call
useVisitPreviewAnnotation({ projectId: toRef(props, 'projectId'), formId: toRef(props, 'formId') });
// useVisitPreviewAnnotation.js: const currentProjectId = () => projectId?.value ?? null;
```

```vue
<!-- VisitFormPreviewDialog.vue (wrong): stop the ref sync, then re-introduce manual copies in the tab -->
<VisitFormPreviewDialog v-model="showFormPreview" :project-id="projectId" :form-id="formPreviewFormId"
  @refresh="mergeFormIntoState" />
```

```vue
<!-- VisitsTab.vue (correct): the bridge carries no data, the dialog re-reads on every open -->
<VisitFormPreviewDialog v-model="showFormPreview" :project-id="projectId" :form-id="formPreviewFormId" />
```

---

## Scenario: Delete Confirmation Dialogs and Reference-Aware Delete Gating

### 1. Scope / Trigger

- Trigger: any user-initiated delete, batch-delete, or destructive removal action in the frontend.
- Applies to all list/tab components that expose delete buttons or batch-delete operations.
- Reference-gated entities: 字典 (`CodelistsTab.vue` `delCl` / `batchDelCl`), 单位 (`UnitsTab.vue` `del` / `batchDelUnits`), 字段定义 (`FieldsTab.vue` `del` / `batchDelFields`), 表单 (`FormDesignerTab.vue` `delForm` / `batchDelForms`). All eight handlers share `frontend/src/composables/referenceDeleteGuard.js`.
- Goal: an object with any reference can never reach the delete API from the UI; a mixed batch deletes only the unreferenced part after one grouped confirmation; delete paths without references keep exactly one confirmation.

### 2. Signatures

```javascript
// Shared pure helper (no vue / element-plus imports; the message box is injected,
// same pattern as projectDeleteConfirmation.js)
import {
  REFERENCE_DELETE_BOX_CLASS,        // 'reference-delete-box'
  REFERENCE_LIST_MAX,                // 10 — max blocked lines / deletable names in a batch dialog
  formatFieldReference,              // codelist/unit ref row → '表单名(OID)-字段名(变量名)';
                                     // no OID → '表单名-字段名(变量名)'; form_name == null (unplaced
                                     // library-only definition) → '字段库-字段名(变量名)'
  partitionByReferences,             // (items, refsMap) → { blocked: [{item, refs}], deletable: [item] }
  showReferenceBlockedAlert,         // (messageBox, message) → alert '无法删除' / '知道了' / customClass
  confirmReferenceAwareBatchDelete,  // (messageBox, { items, refsMap, noun, nameOf, describeRefs })
                                     //   → Promise<items to delete>
  buildPartialDeleteMessage,         // (noun, deletedCount, blockedCount) → '已删除 N 个X，M 个被引用的X未删除'
} from '@/composables/referenceDeleteGuard.js'

// Single delete (all four entities): gate BEFORE confirm, confirm BEFORE api.del
const refs = await api.get(`<references>`)            // codelist/unit append ?include_unplaced=true
if (refs.length) return await showReferenceBlockedAlert(ElMessageBox, blockedText(refs))
await ElMessageBox.confirm(`删除...？`, '确认', { type: 'warning' })
await api.del(`<delete>`)

// Batch delete: snapshot → references → grouped confirm → delete only the approved ids
const items = [...selX.value]                         // snapshot before awaiting dialogs
const refsMap = await api.post(`<batch-references>`, { ids })
const toDelete = await confirmReferenceAwareBatchDelete(ElMessageBox, { items, refsMap, noun, nameOf, describeRefs })
if (!toDelete.length) return
const deleteIds = toDelete.map((x) => x.id)
const { deleted } = await api.post(`<batch-delete>`, { ids: deleteIds })  // N = backend's actual removal count
```

Dialog style (global `main.css` block, because message boxes teleport to `<body>`):

```css
.el-message-box.reference-delete-box { --el-messagebox-width: 520px; width: var(--el-messagebox-width); max-width: calc(100vw - 32px); }
.el-message-box.reference-delete-box .el-message-box__message { max-height: 50vh; overflow-y: auto; }
.el-message-box.reference-delete-box .el-message-box__message p { white-space: pre-line; overflow-wrap: anywhere; }
```

### 3. Contracts

| Delete Path | Confirmation Level | Pattern |
|-------------|-------------------|---------|
| **Project delete** (normal/batch/hard) | Double | First: context warning → Second: `confirmFinalProjectDelete` |
| **Reference-gated single delete** (codelist/unit/field/form) | Gate, then Single | Reference check → blocked alert (no confirm, no API call) → one `ElMessageBox.confirm` only when clear |
| **Reference-gated batch delete** (codelist/unit/field/form) | One grouped dialog | `confirmReferenceAwareBatchDelete` partitions; only unreferenced ids go to the batch-delete API |
| **Local/removal paths** (option row, visit-form relation, draft field, designer field-instance removal, visit delete) | Single | Existing `ElMessageBox.confirm` / `confirmDelete` stays unchanged |
| **Edit-impact prompts** (update dictionary/option/unit, field-library and designer quick-edit codelist) | Notice only | Default (placed-only) `references` response; NOT part of the delete gate |

Contracts:

- Reference parity: the frontend gate condition is `refs.length > 0` and must stay exactly as strict as the backend 409 delete guards — codelist/unit = any `FieldDefinition.codelist_id/unit_id` (including library-only unplaced definitions), field = any `FormField`, form = any `VisitForm`. Codelist/unit delete-check calls therefore append `?include_unplaced=true`; the default (placed-only) response is reserved for edit-impact notices.
- Backend batch-delete endpoints stay all-or-nothing 409 as the concurrency net: a reference added between the check and the delete fails the whole batch with today's error toast and nothing is deleted.
- Batch selection is snapshotted (`const items = [...selX.value]`) before any dialog await, so selection changes while the dialog is open cannot change what gets deleted.
- After a batch: selection arrays reset to `[]`; the property card / designer canvas selection clears only when its id is actually in `deleteIds`. A partial batch shows one success toast via `buildPartialDeleteMessage` instead of the plain message. The toast's deleted count (N) is the backend's `{deleted}` response field — what was actually removed — not the requested count; the blocked count (M) stays the preflight `items.length - toDelete.length` and must never be computed as `items.length - deleted`, which would misreport concurrently vanished ids as referenced.
- Cancellation semantics: alert dismissal (`'cancel'` / `'close'`) is a normal end and is swallowed inside `showReferenceBlockedAlert`; batch confirm `'cancel'` propagates so callers keep `catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }`; unexpected errors from the blocked alert propagate (single callers write `return await showReferenceBlockedAlert(...)` inside the same try) and reach the error toast.
- The four single callers keep `return await` on the blocked alert; only cancel/close is ignored — an unexpected alert failure must surface as an error toast, not silence.
- Do not grow this helper's responsibilities: message-box injection keeps it unit-testable; per-entity nouns/names/ref-formatters stay at the call sites.

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|-----------|-------------------|
| User clicks delete on project | Two dialogs: first shows project name warning, second is `confirmFinalProjectDelete` |
| Codelist/unit referenced only by an unplaced library field, single delete | Blocked alert lists `字段库-字段名(变量名)` — no confirm, no delete API call |
| Codelist/unit with references, single delete | Alert `该字典/单位被以下字段引用，需先解除相关字段的引用：` + reference list — no delete API call |
| Codelist/unit without references, single delete | Single confirm: `确认删除字典 "xxx"？` / `确认删除单位 "xxx"？` |
| Field referenced by any form, single delete | Alert `该字段被以下表单引用，需先从相关表单中移除该字段：` — no delete API call |
| Form referenced by any visit, single delete | Alert `该表单被以下访视引用，需先从相关访视中移除该表单：` — no delete API call |
| Batch: mixed selection | ONE plain-text dialog: blocked objects + references on top (notice only), deletable names below, confirm button `删除 N 个X`; only unreferenced ids are posted to batch-delete; success toast `已删除 N 个X，M 个被引用的X未删除` |
| Batch: all blocked | Alert only (button `知道了`), no confirm dialog, no write request |
| Batch: none blocked | Original plain confirm `确认删除选中的 N 个X？`, then all selected ids posted |
| User cancels batch confirm | `catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }` — no error toast, no API call |
| User dismisses blocked alert (cancel / X / ESC) | Treated as a normal end — no error toast, no API call |
| Blocked alert fails unexpectedly | Error propagates to the caller's catch → error toast (never silent) |
| Reference appears between check and delete (race) | Backend batch-delete answers 409, nothing deleted; single delete answers 409 |
| Property card / designer canvas had the selected object in a partial batch | Card/canvas clears only if that id is in `deleteIds`; otherwise stays on the surviving row |

### 5. Good/Base/Bad Cases

- **Good**: A mixed batch shows one dialog with both sections and posts only the unreferenced ids; the user sees how many were kept.
- **Good**: A codelist referenced only by an unplaced library field is blocked in the UI, matching what the backend guard would have answered.
- **Base**: A field with no references keeps its single `删除字段 "xxx"？` confirm.
- **Base**: An inline option row delete keeps `confirmDelete` with the option label.
- **Bad**: Re-introducing a "将同时删除/移除" confirmation for referenced fields/forms — referenced means blocked, not cascading.
- **Bad**: Partitioning a batch with the default (placed-only) codelist/unit references response — unplaced-only references land in the deletable group and the whole batch 409s.
- **Bad**: Skipping confirmation on persistent delete paths (like `delOpt`) creates click-to-delete risk.

### 6. Tests Required

| Test | Assertion |
|------|-----------|
| `referenceDeleteGuard.test.js` | Pure helper behavior: `formatFieldReference` (OID / no OID / unplaced), partition order + string keys + missing/empty/non-array refs + no input mutation, all four batch dialog cases (dialog shape, button text, customClass, return value), truncation at `REFERENCE_LIST_MAX`, alert dismissal swallowed vs real errors propagated, partial message text; runtime: mixed-path confirm dismissal (`'cancel'` / `'close'`) propagates unchanged and nothing is returned |
| `referenceDeleteWiring.test.js` | Source-level wiring per component: single handlers fetch references (codelist/unit with `include_unplaced=true`) and call `showReferenceBlockedAlert` before confirm and `api.del`; batch handlers call `confirmReferenceAwareBatchDelete` before batch-delete and post `ids: deleteIds` (not the raw selection); edit-impact callers (`updateCl` / `updateOpt` / `saveUnit` / FieldsTab `quickSaveCodelist`) do NOT pass `include_unplaced`; selection clears only on actually-deleted ids; `main.css` carries the `.reference-delete-box` rules |
| `referenceDeleteWiring.test.js` | Actual-function runtime: a failing blocked alert surfaces one error toast and no delete; cancel/close dismissal stays silent; an unreferenced single delete confirms once then deletes (cancel deletes nothing); a batch-delete 409 shows one error toast and keeps the selections; the surviving card/canvas selection is retained after a partial delete; no partial toast fires when nothing was blocked; the partial toast's deleted count is the backend `{deleted}` value; an all-blocked batch alerts once, shows no confirm, and posts only `batch-references` (no `batch-delete`, no toast, selections untouched); a cancelled mixed confirm posts only `batch-references` and stays silent with selections untouched |
| `fieldsTabCodelistQuickEdit.test.js` | FieldsTab `quickSaveCodelist` keeps its edit-impact `references` call on the default response (no `include_unplaced`) |
| `projectDeleteConfirmation.test.js` | Batch handlers' confirmation call is `confirmReferenceAwareBatchDelete` and precedes the batch-delete call; single handlers still confirm before `api.del` |
| `fieldsTabMultirefThreshold.test.js` | `del` / `batchDelFields` follow the new gate contract; the `save` multi-form impact threshold stays byte-identical |

### 7. Wrong vs Correct

#### Wrong: gate fields/forms with the old multi-form threshold

```javascript
// Only warns when 2+ forms reference the field, then cascades anyway
if (countDistinctForms(refs) > 1) {
  await ElMessageBox.confirm(`删除字段 "${f.label}" 将同时删除以下表单中的该字段：…确认删除？`, '确认')
}
await api.del(`/api/field-definitions/${f.id}`)  // single-form reference deletes silently; 0-confirm path
```

**Why wrong**: The backend guard rejects ANY `FormField` row; gating on `> 1` lets a referenced field through to a guaranteed 409 and hides the reference list.

#### Correct: any reference blocks, list the references

```javascript
const refs = await api.get(`/api/field-definitions/${f.id}/references`)
if (refs.length) {
  const msg = formatFieldImpactMessage(refs, { max: 5, sep: '\n' })
  return await showReferenceBlockedAlert(ElMessageBox, `该字段被以下表单引用，需先从相关表单中移除该字段：\n${msg}`)
}
await ElMessageBox.confirm(`删除字段 "${f.label}"？`, '确认', { type: 'warning' })
await api.del(`/api/field-definitions/${f.id}`)
```

#### Wrong: post the raw selection after a mixed batch dialog

```javascript
const toDelete = await confirmReferenceAwareBatchDelete(ElMessageBox, { items, refsMap, ... })
await api.post(`<batch-delete>`, { ids: selX.value.map(x => x.id) })  // full selection!
```

**Why wrong**: Blocked ids reach the all-or-nothing batch endpoint → 409 → nothing is deleted, and the dialog's promise is ignored.

#### Correct: delete only the approved subset

```javascript
const deleteIds = toDelete.map((x) => x.id)
if (!deleteIds.length) return
const { deleted } = await api.post(`<batch-delete>`, { ids: deleteIds })
if (deleteIds.includes(selected.value?.id)) selected.value = null   // clear card only when actually deleted
if (toDelete.length < items.length) ElMessage.success(buildPartialDeleteMessage('字典', deleted, items.length - toDelete.length))
```

#### Wrong: trust the requested count as the deleted count

```javascript
await api.post(`<batch-delete>`, { ids: deleteIds })
if (toDelete.length < items.length) ElMessage.success(buildPartialDeleteMessage('字典', toDelete.length, items.length - toDelete.length))
```

**Why wrong**: `toDelete.length` is what the frontend asked to delete, not what the backend removed — a concurrently vanished id makes the toast over-report (fixed in 729fc74). Deriving the blocked count from the response instead (`items.length - deleted`) fails the other way: concurrently vanished ids were never referenced yet would be announced as 被引用.

#### Correct: deleted count from the backend, blocked count from the preflight partition

```javascript
const { deleted } = await api.post(`<batch-delete>`, { ids: deleteIds })
if (toDelete.length < items.length) ElMessage.success(buildPartialDeleteMessage('字典', deleted, items.length - toDelete.length))
```

N comes from the backend `{deleted}` response; M stays the pre-dialog partition result `items.length - toDelete.length` — the only count that means "blocked as referenced".

#### Wrong: teleported message box styled with the CSS variable only

```css
/* Scoped style or variable-only override */
:deep(.reference-delete-box) { --el-messagebox-width: 520px; }
```

**Why wrong**: Message boxes teleport to `<body>` so scoped selectors miss the root, and Element Plus' own width comes from `.el-message-box { --el-messagebox-width: 420px }` combined with a 100%-width box — setting the variable alone still stretches the dialog edge-to-edge on narrow viewports.

#### Correct: global block that sets variable AND explicit width

```css
/* Appended to the end of main.css (global, after Element Plus styles) */
.el-message-box.reference-delete-box { --el-messagebox-width: 520px; width: var(--el-messagebox-width); max-width: calc(100vw - 32px); }
.el-message-box.reference-delete-box .el-message-box__message { max-height: 50vh; overflow-y: auto; }
.el-message-box.reference-delete-box .el-message-box__message p { white-space: pre-line; overflow-wrap: anywhere; }
```

The doubled class beats Element Plus' default regardless of stylesheet order, `width: var(--el-messagebox-width)` prevents the 100% stretch, and `white-space: pre-line` keeps the `\n`-joined reference lines readable.

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

### 6. Retry Loop for an Async Child's Exposed Method

```javascript
// WRONG - blind retry loop: silently drops the action when the chunk is slow
async function openDesignerForImportedForm(formId) {
  for (let tries = 0; tries < 20; tries += 1) {
    if (designerRef.value?.selectFormById) {
      return designerRef.value.selectFormById(formId)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
```

```javascript
// CORRECT - watch the template ref; the resolved inner component's ref (with its
// defineExpose) is forwarded once defineAsyncComponent resolves. With Vue 3.5 an
// unresolved wrapper leaves the ref null, so one watch covers both cases.
watch(designerRef, (designer) => {
  if (!hasPendingFormId || typeof designer?.selectFormById !== 'function') return
  return consumePendingFormId(designer) // clears the pending id BEFORE awaiting
})
```

Contracts:

- Keep **at most** one pending request per invocation (latest wins).
- Clear the pending id **before** invoking the designer — that is what prevents a later remount from replaying the selection. A queued request merely resolving early proves nothing on its own.
- No timers, no polling, no module-level mutable state.

Reference implementation: `frontend/src/composables/useDesignerFormSelection.js` (`requestFormSelection`); readiness tests: `frontend/tests/useDesignerFormSelection.test.js`.

---

## Scenario: FormDesignerTab Log-Row Readonly Property Pane

### 1. Scope / Trigger

- Trigger: changing the persisted-field property editor in
  `frontend/src/components/FormDesignerTab.vue` — adding a new field-type
  branch, moving the 取消/保存 buttons, or adjusting the property pane layout.
- The right property card has two top-level branches:
  `v-if="!selectedFieldId"` (form props) and `v-else` (shared field-editor
  scroll area). Inside the shared field-editor branch, log rows render a
  readonly hint **only** (`v-if="editProp.field_type === '日志行'"`,
  `data-test="designer-log-property-readonly"`); the normal-field form
  (`data-test="designer-field-property-form"`), the draft actions, and the
  persisted-field actions all live inside one `<template v-else>`.

### 2. Contracts

| Rule | Why |
|---|---|
| Log rows render no property form and no 取消/保存 buttons — only the readonly hint | 「以下为log行」是固定样式的结构提示行；`fieldPropBaseline` 置 null 使 log 行永不 dirty，保存/取消路径对 log 行不可达 |
| `openQuickEdit` early-returns for log rows (`ff?.is_log_row \|\| ff?.field_definition?.field_type === '日志行'`) | 预览区双击快编对 log 行关闭；三处模板 `@dblclick` 不分散删，单点收口 |
| The persisted-field 取消/保存 bar appears **exactly once** inside the shared field-editor scroll section (`data-test="designer-property-actions"`, `v-else`, class `designer-draft-actions`) | 持久化字段分支共享同一组显式保存/取消与脏态、busy 门控；不允许按分支复制按钮栏 |
| The bar sits **inside the scroll flow**, after the field-property form and after the draft-action branch | 视觉位置与草稿字段编辑器一致：按钮直接跟在最后一个属性项下方 |
| Shared nodes stay in one scroll container; branch switching uses `v-if` + `<template v-else>` | 避免整支重排；log 行提示与字段表单互斥且只渲染其一 |

### 3. Wrong vs Correct

```vue
<!-- WRONG - log row renders an editable form or duplicated action bars -->
<div v-else class="designer-editor-scroll">
  <el-form v-if="editProp.field_type === '日志行'" data-test="designer-log-property-form">...</el-form>
  <div v-if="selectedFieldId === DRAFT_FIELD_ID" class="designer-draft-actions">...</div>
  <div v-else class="designer-draft-actions" data-test="designer-property-actions">...</div>
</div>

<!-- WRONG - fixed footer bar drifts from the draft-field presentation -->
<div v-else class="designer-editor-scroll">...field forms + draft actions...</div>
<div class="designer-draft-actions designer-editor-actions">...persisted-field actions...</div>

<!-- CORRECT - log row hint + v-else template for everything editable -->
<div v-if="!selectedFieldId" class="designer-editor-scroll">...form props + its own actions...</div>
<div v-else class="designer-editor-scroll">
  <div v-if="editProp.field_type === '日志行'" class="designer-readonly-hint"
       data-test="designer-log-property-readonly">
    「以下为log行」为固定样式的结构提示行，不支持编辑属性。
  </div>
  <template v-else>
    <el-form data-test="designer-field-property-form">...</el-form>
    <div v-if="selectedFieldId === DRAFT_FIELD_ID" class="designer-draft-actions">...draft actions...</div>
    <div v-else class="designer-draft-actions" data-test="designer-property-actions">
      <el-button ...>取消</el-button>
      <el-button ...>保存</el-button>
    </div>
  </template>
</div>
```

### 4. Validation

- `frontend/tests/formDesignerPropertyEditor.runtime.test.js` locks:
  `designer-property-actions` appears exactly once; `designer-editor-actions`
  no longer exists; `designer-log-property-form` appears zero times;
  `designer-log-property-readonly` sits in the log-row branch; the
  normal-field form lives inside the `<template v-else>`; and the buttons keep
  their exact `:disabled` / `:loading` / `@click` bindings.
- `frontend/tests/quickEditBehavior.test.js` locks: `openQuickEdit` early-
  returns for log rows; `saveFieldProp` has no `is_log_row` branch.
- `frontend/tests/designerNewFieldDraft.test.js` locks: the draft action bar
  keeps the exact `v-if="selectedFieldId === DRAFT_FIELD_ID"` condition.

## Scenario: FormDesignerTab Regular-Field Copy Draft

### 1. Scope / Trigger

- Trigger: changing the regular-field copy action in
  `frontend/src/components/FormDesignerTab.vue` or the shared OID helper in
  `frontend/src/composables/fieldDefinitionAutocomplete.js`.
- A regular field has both a form-field instance and a field-library definition;
  copying it must not persist either resource until the draft Save action.
- A log row has no field definition and is intentionally excluded from this
  draft path; copying a log row remains an immediate form-field save.

### 2. Contracts

| Rule | Why |
|---|---|
| Regular Copy creates an `id='__draft__'`, `__draft:true` local row and sends no request | Users must be able to review/edit the copy before it changes the project |
| The local copy keeps the full definition and instance presentation state, but replaces the definition OID with the ASCII-uppercased source plus `_COPY`, `_COPY1`, ... (`buildCopyVariableName`, the same ladder as the backend field-copy endpoint — cross-stack §10); existing names are matched exactly and never case-folded or rewritten | Preview and Save must start from the same copied values while preserving project-level uniqueness |
| OID collision checks include every `fieldDefs` entry, including hidden `标签` / `日志行` definitions | The backend uniqueness constraint is project-wide, not limited to visible autocomplete candidates |
| The draft stores an integer `__draftOrderIndex` for Save and a fractional local `order_index` only for display | The UI can place the draft after its source without sending a non-integer persistence order |
| Save labels the history entry `复制字段`; Cancel/discard paths remain local | Copy is one persisted history action only after explicit user confirmation |
| Log-row Copy keeps the existing immediate POST, cache invalidation, and undo/redo path | Log rows are structural hints, not field-library definitions |

### 3. Validation

- `frontend/tests/designerFieldCopy.test.js` locks the regular local branch,
  copied state, OID ladder, hidden-definition collisions, draft guards, and
  the unchanged immediate log-row path.
- `frontend/tests/fieldDefinitionAutocomplete.test.js` locks the pure
  `buildCopyVariableName` suffix ladder.
- `frontend/tests/designerNewFieldDraft.test.js` locks copied draft metadata,
  integer order propagation, structural-key preservation, and the history-label
  branch.
- `backend/tests/test_field_profile.py` locks insertion at a requested
  `order_index`; backend production code remains unchanged.
- For mounted Copy/Save checks, verify the actual rendered control and emitted
  field-profile command. `nextTick` / `flushPromises` and one passing
  `--maxWorkers=1` run are not a determinism guarantee. If no request appears,
  inspect enabled state, native click delivery and save guards; keep both full
  and isolated failure evidence. Do not weaken assertions, patch production
  logic, or change runner/timeouts merely to hide a timing-sensitive failure.

## Scenario: FormDesignerTab Label OID Is System-Managed

### 1. Scope / Trigger

- Trigger: changing label (`标签`) field handling in
  `frontend/src/components/FormDesignerTab.vue` or the label OID helpers in
  `frontend/src/composables/formDesignerPropertyEditor.js`.
- A label's `variable_name` is a system placeholder, never user input: labels
  are hidden from the field library, yet `FieldDefinition` enforces a
  project-wide unique `variable_name`, so a user OID kept on a label blocks
  that OID invisibly.

### 2. Contracts

| Rule | Why |
|---|---|
| The designer type selector is controlled (`:model-value` + `@update:model-value="onDesignerFieldTypeChange"`); the OID transition runs only in that handler | Hydration (`selectField`), candidate picks, and editor resets assign `editProp` directly and must never run the label transition |
| `selectField` and `resetFieldPropAutoSaveState` rebuild `labelOidSession = buildLabelOidSession(...)` on every (re)selection; `selectField` seeds via `resolveLabelOidSeedDefinition(ff)`; `selectAutocompleteCandidate` never assigns the session | The seed comes only from the definition the field was loaded with (a label, or a system-placeholder OID), never from the live editor OID — otherwise a picked library candidate would be re-bound and silently converted into a hidden label |
| Drafts carry a creation-time `__labelOidSeed` (`{ variable_name, field_type }`): `newField` wraps its draft in `withLabelOidSeed`, `buildCopyDraft` builds the same object inline (its test harness evaluates it with a fixed set of injected identifiers); only `__draft === true` rows use the seed | `applyEditorToDraft` mirrors the editor (including a picked candidate's OID) into the draft's `field_definition`, so re-selecting a draft must not seed from it |
| Entering `标签` remembers the current OID and swaps in the session label OID (generating one on first use); leaving restores the remembered value (including `''`) | `文本 → 标签 → 文本` round-trips the typed OID; user OIDs never reach a label payload |
| `saveSelectedFieldProp` and `saveDraftField` run `ensureLabelVariableName` for labels before building the request; non-label drafts fail fast with `OID_ERROR` | Historical empty/invalid label OIDs must not block saving; non-label OID validation stays client-side |
| A loaded user-OID field switched to `标签` forks via `create_or_restore`; a loaded placeholder-OID field converts in place via `update_shared` | A named library definition must not silently become a hidden label; forking placeholder conversions would litter the library with orphan definitions |

### 3. Validation

- `frontend/tests/designerLabelOid.test.js` locks the pure helpers, the
  `buildBindingProfileCommand` routing (round trip / in-place / fork /
  no-candidate-rebind), and the component wiring (controlled select, session
  resets, save guards), plus the draft seed snapshot (`withLabelOidSeed`,
  `resolveLabelOidSeedDefinition`, the `newField` / `buildCopyDraft` seeds),
  the draft re-selection flow after a candidate pick, and the guard that
  `selectAutocompleteCandidate` never assigns `labelOidSession`.
- The placeholder prefix `^FIELD_\d{14}_[A-Z0-9]{6}` is a cross-stack contract
  with `backend/src/database.py::_LABEL_PLACEHOLDER_RE`; see
  `.trellis/spec/guides/cross-stack-contracts.md` §10.

## Scenario: FormDesignerTab Field-Library Autocomplete Candidates

### 1. Scope / Trigger

- Trigger: changing the OID / 字段标签 `el-autocomplete` pair in
  `frontend/src/components/FormDesignerTab.vue`,
  `buildAutocompleteCandidates` / `hydrateEditorFromCandidate` in
  `frontend/src/composables/fieldDefinitionAutocomplete.js`, or the
  binding-profile builders (`buildBindingProfileCommand`,
  `resolveSharedWriteTarget`, `buildFieldPropReplayCommand`,
  `normalizeDefinitionPayload`) in
  `frontend/src/composables/formDesignerPropertyEditor.js`.
- Both inputs share one candidate list; Element Plus writes
  `item[valueKey]` (default `value`) back into `v-model` and emits `input`
  before it emits `select`, so the item shape decides what a pick does to the
  input text.

### 2. Contracts

| Rule | Why |
|---|---|
| Every candidate carries `value` equal to the raw (untrimmed) keyword string | `el-autocomplete` writes `item[valueKey]` into `v-model` before `select`; echoing the typed text keeps a rejected 「已添加」 pick from emptying the input, and a string value satisfies the emit validators (`undefined` triggers "Invalid event arguments" warnings) |
| Neither designer `el-autocomplete` sets `value-key` | The default `valueKey='value'` is what the echo relies on; an override would reintroduce `undefined` writes |
| Every `CANDIDATE_STATE_*` identifier referenced in `FormDesignerTab.vue` is imported from `fieldDefinitionAutocomplete` | An unimported constant makes the 「当前字段」/「已添加」 badge silently not render (Vue only logs a render warning) |
| 「已添加」 candidates keep `selectable: false` and `selectAutocompleteCandidate` returns early for them | The definition is already on this form; the pick must leave input text and editor state untouched |
| Selectable candidates rehydrate the editor (`hydrateEditorFromCandidate`), overwriting the echoed text | Picking a definition means binding it, not keeping what was typed |
| `hydrateEditorFromCandidate` replaces only the 9 editable definition keys; `bg_color` / `text_color` / `label_bold` / `label_font_size` flow through from the active editor (including the `'default'` sentinel) and are never overridden by the persisted instance | A pick must not discard unsaved presentation edits, and a stored default font size (`null`) must not clear the 「默认」 radio (DEC1) |
| `selectAutocompleteCandidate` derives pending inline mark / default value from `editProp` (not the persisted field) and type-normalizes `editProp` right after hydration, but never assigns `labelOidSession` or `fieldPropBaseline` | Normalization keeps the type watcher idempotent; leaving the baseline untouched keeps 「取消」 able to fully restore the original binding and properties |
| Persisted saves build the confirm target and the PUT command from the same `buildSelectedFieldCommandArgs(ff, editorState)` (`resolveSharedWriteTarget` is derived from `buildBindingProfileCommand`) | The 「影响提醒」 decision and the actual write can never disagree (DEC3) |
| `buildBindingProfileCommand` emits `definition_operation: none` only when a normalized snapshot (`normalizeDefinitionPayload`) is passed and matches the editor on the 9 editable keys; omitted snapshots keep the legacy always-`update_shared` behavior | Pure references and presentation-only saves must not rewrite the shared definition or warn; `null` snapshot must never compare as "equal" (DEC2) |
| Candidate-target impact confirmation uses `confirmFieldReferenceImpact(target, { includesCurrentForm: false })` (threshold ≥1 other form); current-definition targets keep the default ≥2-distinct-forms threshold; fork targets confirm nothing | A genuine shared edit of a candidate used by exactly one other form must still be confirmed (R5) |
| History entries set `isRebind = command.binding.mode === 'existing'` and pass `definitionUpdated = command.definition_operation.operation === 'update_shared'` to both `buildFieldPropReplayCommand` calls; `snapshotFieldPropState.fd` carries `is_multi_record` / `table_type` | Undo/redo replays exactly what the forward save did — a pure rebind replays binding + instance only — and shared-write replays keep the structural keys (DEC4) |
| `saveDraftField` compares against `comparableDefinitionPayload(candidateBeforeDefinition)` (normalized) but restores the definition from the raw `candidateBeforeDefinition` | Type normalization (e.g. a 日期 candidate with `date_format: null`) must not create a phantom shared update, while undo restores the content as it was on disk |
| `saveSelectedFieldProp` freezes `const commandArgs = buildSelectedFieldCommandArgs(ff, snapshot)` and `candidateBeforePayload` before `confirmFieldReferenceImpact`, and `saveFieldProp` rebuilds the command from `{ ...commandArgs, editorState }` | The confirm dialog and the PUT can never disagree about the write target, even if shared candidate refs change while the dialog is open (DEC3) |
| While a property save or draft save is in flight, the property form is disabled (`designerHistory.busy \|\| savingDraft \|\| isSavingFieldProp`), native color swatches bind `propEditorBusy`, and candidate pick / same-row re-click / delete / batch delete / copy / quick edit / inline toggle / reorder (drag + keyboard) / add-log-row / form switch / designer leave all short-circuit | Native `<button>` ignores el-form `:disabled`; every editor-mutating entry must be locked while a request can still rewrite the list |
| Definition payloads take `is_multi_record` / `table_type` from the target snapshot (`buildDefinitionPayloadFromTarget`), `DRAFT_DEFINITION_DIFF_KEYS` is derived from the payload keys, and history snapshots carry `help_text` plus the structural keys; fork-redo remaps the definition id via `remapId` | Structural keys must survive shared updates, OID forks, draft forks and their redo; a fork-redo that recreates under a new id must not leave the undo stack pointing at a stale definition |
| A cleared date-format select is normalized to the type default by a `watch(() => editProp.date_format)` immediately, and `buildFieldPropReplayCommand` defaults `definitionUpdated` to `false` (fail-closed) | An editor snapshot must never carry `undefined` into the 9-key diff (phantom `update_shared`), and an omitted flag must never authorize a shared write |
| After a committed save, the editor is unconditionally rebuilt from the persisted row (`selectField(fresh, { fromSave: true })`); if the post-PUT list reload fails or is skipped, the row is replaced in place from the endpoint's `form_field` | A rebind must not leave `labelOidSession` on the original definition (later label switches would fork instead of updating in place), and a committed write must not vanish from the UI because a GET failed |
| Empty and whitespace-only keywords return `[]` | No candidates on empty input (matching uses the trimmed query, the echo uses the raw keyword) |

### 3. Validation

- `frontend/tests/fieldDefinitionAutocomplete.test.js` locks the `value` echo
  across the current / added / plain states, the empty and whitespace-only
  keyword behavior, editor-wins presentation hydration (pending `large`,
  colors, bold, and the `'default'` sentinel survive a pick), and (source
  guard) that every `CANDIDATE_STATE_*` referenced in `FormDesignerTab.vue` is
  imported from the composable, that neither designer `el-autocomplete` sets
  `value-key`, and that `selectAutocompleteCandidate` reads pending
  inline/default from `editProp` and never assigns `labelOidSession` /
  `fieldPropBaseline`.
- `frontend/tests/fieldProfileCommands.test.js` locks `normalizeDefinitionPayload`,
  the `none` vs `update_shared` snapshot diff (pure rebind / presentation-only /
  genuine rebind + keep / fork precedence), the derived
  `resolveSharedWriteTarget`, the normalized-日期 pure draft binding, and the
  replay builder across `shared` / `rebind-undo` / `rebind-redo` / fork types
  with and without `definitionUpdated`.

## Scenario: Saimeisi Manual-OID Length Limits (Save Gate + Entry maxlength)

### 1. Scope / Trigger

- Trigger: touching `editedOidLengthError` / `oidMaxLength` in
  `frontend/src/composables/oidValidation.js`, any of the five OID entry
  controls (FieldsTab panel input; add-form dialog, edit-form dialog, inline
  form-property card, designer field-OID autocomplete in
  `FormDesignerTab.vue`), or the baseline arguments wired into
  `FieldsTab.save` / `persistFormProps` / `saveSelectedFieldProp` /
  `saveDraftField`.

### 2. Contracts

| Rule | Why |
|---|---|
| Limits apply only when the project `db_type` is exactly 赛美斯; `oidMaxLength` returns `undefined` otherwise so no maxlength attribute renders | 其他 / absent types keep their historical behavior; the DB-type constant comes from `fieldTypeAvailability.js` (single source) |
| Save-gate baseline: FieldsTab captures it in `resetProp` (the single initialization seam: 新增 generated / 编辑 row / post-save rehydration); the designer uses `candidateOid` when `selectedDefinitionId` is set (same judgment as `buildBindingProfileCommand`'s `isCandidateRebind`), else `fieldPropBaseline.fd.variable_name` / draft `__labelOidSeed.variable_name` | Untouched system values (27/26-char generated defaults, copy-ladder names, legacy/imported OIDs, untouched rebinds) stay exempt; the length judgment and the fork/rebind classifier can never disagree |
| 标签 / 日志行 are skipped in both designer save paths (OID inputs hidden there; `ensureLabelVariableName` may rewrite label OIDs), while the fields library gates 日志行 edits normally | Designer log/label OIDs are system-managed; the library's log-row OID input is user-editable, so a manual change is still a manual change |
| Entry-level enforcement is a conditional native `maxlength` (8 fields / 10 forms) bound via `oidMaxLength`; no keydown interception, no truncation watchers | Native maxlength blocks the overlimit keystroke and truncates paste with zero custom code; it does NOT constrain programmatic `value` assignment, so generated defaults and candidate hydration prefill untouched (exemption preserved); el-autocomplete passes maxlength through to the inner input |
| The save-time gate stays wired even though capped inputs make it unreachable via pure typing in 赛美斯 projects | Defense in depth for programmatic paths and for any future surface that forgets the maxlength binding; `persistFormProps` fails closed when `baselineCode` is omitted (empty baseline ⇒ changed value) |

### 3. Validation

- `frontend/tests/oidEditLengthPolicy.test.js` locks the policy matrix
  (8/9 and 10/11 boundaries, 其他/blank types, unchanged automatic/copy
  values, generated-looking edits, revert/trim equality, missing baseline,
  empty candidate, unknown kind, and the `oidMaxLength` mapping).
- `frontend/tests/component/OidEditSave.spec.js` witnesses every save surface
  with real mounts (zero write/reference requests on rejection, input
  retention, dialog/inline form routes, candidate pick → pure rebind PUT then
  typed fork rejected) and the maxlength wiring on all five entry controls
  (programmatic 27-char prefill unaffected).

## Scenario: Non-Modal Penetrable Dialog (`TemplateFieldSearchDialog`)

### 1. Scope / Trigger

- Trigger: adding or changing a dialog that must let the user keep working in
  the page behind it instead of blocking with a modal backdrop — the
  「模板字段查询」 pattern in
  `frontend/src/components/TemplateFieldSearchDialog.vue`, mounted once from
  `App.vue` (`v-if="hasOpenedTemplateFieldSearch"`, session-persistent
  keyword/results).

### 2. Contracts

| Rule | Why |
|---|---|
| `el-dialog` carries `:modal="false"` + `modal-penetrable` + `draggable` + `append-to-body` (plus `:close-on-click-modal="false"` and a unique class for width since scoped styles cannot reach the teleported root) | Removes the blocking backdrop so pointer events pass through, keeps the window repositionable via its header, and keeps it visible above the page |
| Re-raising above freshly opened content goes through close → `await nextTick()` → reopen (`App.vue::openTemplateFieldSearch`) | Element Plus does not bump the z-index of an already-open non-modal dialog; toggling `update:modelValue` forces a re-append so the panel returns above a newly opened fullscreen designer |
| When the dialog is lazy-mounted, its `modelValue` watcher needs `{ immediate: true }` | The lazy mount happens with `modelValue` already `true`, so without `immediate` the first open never triggers the initial data load (existing lazy-dialog rule) |
| Pure behavior (search candidate texts, the four-bucket field/form ranking, column/toast text, pagination) lives in `composables/templateFieldSearch.js`, clipboard access in `composables/clipboardCopy.js` | Keeps the component a thin view layer that stays testable under `node:test` without stubbing a browser |
| The 来源 column renders inline read-only multi-line sources (`formatTemplateFieldSource`: `form_code form_name（显示为：xx）` / name-only / `仅字段库`) with wrapping and no truncation or click-to-expand; it is never a copy target and has no popover | Sources must be identifiable at a glance without another click, while copy targets stay limited to the single-value cells |

### 3. Validation

- `frontend/tests/templateFieldSearch.test.js` locks the pure-helper behavior
  (candidate texts, format/source/copy-toast text, `TEMPLATE_FIELD_PAGE_SIZE`),
  the dialog attribute contract, and the entry gating (complete edit mode,
  regular users; brief mode closes the dialog).
