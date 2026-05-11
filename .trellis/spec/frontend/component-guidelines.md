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
