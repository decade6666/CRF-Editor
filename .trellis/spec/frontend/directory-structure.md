# Directory Structure

> How frontend code is organized in this project.

---

## Overview

The frontend follows a feature-based organization with shared composables and components:
- **Components** are Vue SFC files organized by feature/domain
- **Composables** contain reusable logic (hooks)
- **Views** are top-level page components
- No global state management library - uses Vue's reactivity + localStorage

---

## Directory Layout

```
frontend/
├── index.html              # Entry HTML
├── vite.config.js          # Vite configuration
├── package.json            # Dependencies
├── src/
│   ├── main.js             # App entry point
│   ├── App.vue             # Root component (auth, navigation, routing)
│   ├── components/         # Vue components (12 files)
│   │   ├── LoginView.vue           # Login page
│   │   ├── AdminView.vue           # Admin management
│   │   ├── ProjectWorkbench.vue    # Project list & management
│   │   ├── VisitWorkbench.vue      # Visit management
│   │   ├── FormDesignerTab.vue     # Form designer
│   │   ├── FieldInstanceList.vue   # Field list editor
│   │   ├── PreviewTab.vue          # Form preview
│   │   ├── SimulatedCRFForm.vue    # CRF simulation
│   │   ├── TemplatePreviewDialog.vue
│   │   ├── DocxCompareDialog.vue   # Word comparison
│   │   ├── ImportProjectDialog.vue
│   │   └── SettingsTab.vue         # User settings
│   ├── composables/        # Reusable logic (9 files)
│   │   ├── useApi.js               # Unified API wrapper (CRITICAL)
│   │   ├── useCRFRenderer.js       # Field rendering (cross-stack contract)
│   │   ├── formFieldPresentation.js # Field display logic
│   │   ├── useOrderableList.js     # Drag-to-reorder
│   │   ├── useSortableTable.js     # Table sorting
│   │   ├── useDialogState.js       # Dialog state management
│   │   └── ...
│   ├── assets/             # Static assets (images, styles)
│   └── test/               # Test utilities (if any)
├── tests/                  # node:test files (17 files)
│   ├── App.test.js
│   ├── AdminView.test.js
│   ├── FormDesignerTab.test.js
│   ├── columnWidthPlanning.test.js
│   └── ...
└── dist/                   # Build output (served by backend in production)
```

---

## Module Organization

### Component Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| **Views** | Top-level pages | `LoginView.vue`, `AdminView.vue` |
| **Workbenches** | Feature work areas | `ProjectWorkbench.vue`, `VisitWorkbench.vue` |
| **Designers** | Interactive editors | `FormDesignerTab.vue`, `FieldInstanceList.vue` |
| **Dialogs** | Modal overlays | `ImportProjectDialog.vue`, `DocxCompareDialog.vue` |
| **Preview** | Read-only displays | `PreviewTab.vue`, `SimulatedCRFForm.vue` |

### Composable Categories

| Category | Purpose | Examples |
|----------|---------|----------|
| **API** | Data fetching | `useApi.js` |
| **Rendering** | UI logic | `useCRFRenderer.js`, `formFieldPresentation.js` |
| **Interaction** | User actions | `useOrderableList.js`, `useSortableTable.js` |
| **State** | State management | `useDialogState.js` |

### Adding a New Feature

1. Create component in `src/components/`
2. Create composable in `src/composables/` if reusable logic needed
3. Add API calls via `useApi.js`
4. Create tests in `tests/`
5. Register in `App.vue` if it's a main tab

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase + `.vue` | `FormDesignerTab.vue` |
| Composables | camelCase + `use*.js` | `useApi.js`, `useCRFRenderer.js` |
| Views | `*View.vue` | `LoginView.vue` |
| Dialogs | `*Dialog.vue` | `ImportProjectDialog.vue` |
| Tabs | `*Tab.vue` | `PreviewTab.vue`, `SettingsTab.vue` |
| Test files | `*.test.js` | `App.test.js` |

---

## Examples

### Well-organized Composable: useApi.js

```javascript
// Unified API wrapper - ALL API calls go through this
// Memory cache with TTL
// Pending request deduplication
// Auto-invalidation on mutation
// Error parsing for FastAPI/Pydantic errors
// 401 handling via custom event

export function useApi() {
  const cache = new Map()
  const pending = new Map()

  async function get(endpoint, options = {}) {
    // Cache lookup, deduplication, fetch, parse errors
  }

  async function post(endpoint, data, options = {}) {
    // Post, invalidate cache, parse errors
  }

  return { get, post, put, patch, del }
}
```

### Component with Composables

```vue
<script setup>
import { useApi } from '@/composables/useApi.js'
import { useCRFRenderer } from '@/composables/useCRFRenderer.js'

const { get, post } = useApi()
const { renderField } = useCRFRenderer()

// Component logic using composables
</script>

<template>
  <!-- Template -->
</template>

<style scoped>
/* Component styles */
</style>
```
