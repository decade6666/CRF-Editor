<TASK>
You are a front-end execution agent. Implement the following plan end-to-end for a Vue 3 + Element Plus project.

## Context

This is a CRF (Case Report Form) Editor with FastAPI backend + Vue 3 frontend. The project uses useCRFRenderer.js composable for safe HTML rendering of form fields (with XSS prevention via toHtml() escaping).

The VisitsTab.vue has a form preview dialog that currently has critical XSS vulnerabilities, DRY violations (62 lines of duplicated rendering logic), and wrong property names. The fix is to reuse the existing safe useCRFRenderer composable instead of hand-rolling rendering.

## Implementation Plan

### Step 1: Context Verification

Before coding, verify you have sufficient context by reading these files:
1. frontend/src/components/VisitsTab.vue - the main file to fix
2. frontend/src/composables/useCRFRenderer.js - the safe rendering composable to reuse
3. frontend/src/components/FormDesignerTab.vue - reference implementation (lines 300-363) showing correct data adaptation pattern
4. frontend/src/components/FieldsTab.vue - minor fix needed (revert column width)
5. frontend/src/styles/main.css - optional CSS fix

Understand:
- What renderCtrlHtml, renderCtrl, and toHtml do and their signatures
- How FormDesignerTab.vue adapts data for these functions (lines 300-336)
- The current broken implementation in VisitsTab.vue (lines 151-213, 393-427)
- What property names the API actually returns (e.g., inline_mark not is_inline, field_definition not field_type)

### Step 2: Fix VisitsTab.vue - imports and rendering functions

2.1 Add import at top of script (after existing imports around line 4):

import { renderCtrl, renderCtrlHtml, toHtml } from '../composables/useCRFRenderer'

2.2 Rewrite renderCellHtml function (replace current ~lines 152-164) to reuse renderCtrlHtml:

```js
// Reuse useCRFRenderer for safe HTML rendering (aligned with FormDesignerTab)
function renderCellHtml(ff) {
  if (!ff.field_definition) return '<span class="fill-line"></span>'
  const fd = ff.field_definition
  const ft = fd.field_type
  // Choice types: pass object with options directly
  if (ft && ['单选', '多选', '单选（纵向）', '多选（纵向）'].includes(ft)) {
    return renderCtrlHtml({ ...fd, options: fd.codelist?.options || [] })
  }
  // Inline field with default_value: escape and return
  if (ff.inline_mark && ff.default_value) {
    return ff.default_value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
  }
  // Other types: adapt to renderCtrlHtml standard input
  const field = {
    field_type: ft,
    options: fd.codelist?.options || [],
    unit_symbol: fd.unit?.symbol,
    integer_digits: fd.integer_digits,
    decimal_digits: fd.decimal_digits,
    date_format: fd.date_format,
  }
  return renderCtrlHtml(field)
}
```

2.3 Rewrite getInlineRows function (replace current ~lines 166-177) - synchronous version:

```js
function getInlineRows(fields) {
  const cols = fields.map(ff => {
    if (ff.default_value) {
      const lines = ff.default_value.split('\n')
      while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
      return {
        lines: lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')),
        repeat: false
      }
    }
    const ctrl = renderCtrl(ff.field_definition).replace(/_{8,}/, '______')
    return { lines: [toHtml(ctrl)], repeat: true }
  })
  const maxRows = Math.max(1, ...cols.filter(c => !c.repeat).map(c => c.lines.length))
  return Array.from({ length: maxRows }, (_, i) =>
    cols.map(col => col.repeat ? col.lines[0] : (col.lines[i] ?? ''))
  )
}
```

2.4 Rewrite previewRenderGroups computed (replace current ~lines 179-194) - use correct property inline_mark:

```js
const previewRenderGroups = computed(() => {
  const fields = formPreviewFields.value
  if (!fields.length) return []
  const groups = []; let i = 0
  while (i < fields.length) {
    const ff = fields[i]
    if (ff.inline_mark) {
      const g = []
      while (i < fields.length && fields[i].inline_mark) { g.push(fields[i]); i++ }
      groups.push({ type: 'inline', fields: g })
    } else {
      const g = []
      while (i < fields.length && !fields[i].inline_mark) { g.push(fields[i]); i++ }
      groups.push({ type: 'normal', fields: g })
    }
  }
  return groups
})
```

### Step 3: Fix VisitsTab.vue - error handling

3.1 Rewrite openFormPreview function (replace current ~lines 200-212) to show error message instead of silently swallowing:

```js
async function openFormPreview(form) {
  formPreviewTitle.value = form.name || '表单预览'
  formPreviewLoading.value = true
  showFormPreview.value = true
  try {
    const data = await api.cachedGet('/api/forms/' + form.id + '/fields')
    formPreviewFields.value = data
  } catch (e) {
    formPreviewFields.value = []
    ElMessage.error('加载表单字段失败：' + (e.message || '未知错误'))
  } finally {
    formPreviewLoading.value = false
  }
}
```

### Step 4: Fix VisitsTab.vue - template alignment

4.1 Change the preview dialog width from hardcoded width="800" to responsive:

```html
<el-dialog v-model="showFormPreview" :title="formPreviewTitle" width="90%" style="max-width:800px" top="5vh">
```

4.2 Rewrite the preview table template to align with FormDesignerTab pattern. Key changes:
- Labels: use ff.label_override || ff.field_definition?.label instead of ff.label
- Add special rendering for label-type fields (bold header row) and log rows (gray background row)
- Inline table cells use v-html for safe HTML from getInlineRows
- Inline headers also use label_override || field_definition?.label

The template for the preview content area should be:

```html
<div v-else class="word-preview">
  <div class="word-page" :class="{ landscape: previewNeedsLandscape }">
    <div class="wp-form-title">{{ formPreviewTitle }}</div>
    <template v-for="(group, gi) in previewRenderGroups" :key="gi">
      <table v-if="group.type === 'normal'" style="width:100%;border-collapse:collapse">
        <template v-for="ff in group.fields" :key="ff.id">
          <tr v-if="ff.field_definition?.field_type === '标签'">
            <td colspan="2" style="font-weight:bold">{{ ff.label_override || ff.field_definition?.label }}</td>
          </tr>
          <tr v-else-if="ff.is_log_row || ff.field_definition?.field_type === '日志行'">
            <td colspan="2" style="background:#d9d9d9">{{ ff.label_override || ff.field_definition?.label || '以下为log行' }}</td>
          </tr>
          <tr v-else>
            <td class="wp-label">{{ ff.label_override || ff.field_definition?.label }}</td>
            <td class="wp-ctrl" v-html="renderCellHtml(ff)"></td>
          </tr>
        </template>
      </table>
      <table v-else class="inline-table" style="width:100%;border-collapse:collapse">
        <tr>
          <td v-for="ff in group.fields" :key="ff.id" class="wp-inline-header">
            {{ ff.label_override || ff.field_definition?.label }}
          </td>
        </tr>
        <tr v-for="(row, ri) in getInlineRows(group.fields)" :key="ri">
          <td v-for="(cell, ci) in row" :key="ci" class="wp-ctrl" v-html="cell"></td>
        </tr>
      </table>
    </template>
  </div>
</div>
```

### Step 5: Fix FieldsTab.vue - revert unrelated change

5.1 In FieldsTab.vue, find the column width that was changed from 200 to 140 (around line 183), and revert it back to width="200".

### Step 6: Optional CSS fix in main.css

6.1 In main.css (around lines 228-235), try to replace !important on .header-icon-btn with higher specificity selector .header .header-icon-btn. But if Element Plus styles still override, keep !important as fallback.

## Constraints
- Follow existing code conventions in this project (Vue 3 Composition API, Element Plus)
- Handle edge cases: null field_definition, missing codelist, missing options
- Keep changes minimal and focused on the plan
- Do NOT modify backend files
- Do NOT modify files outside the plan scope
- Make sure ElMessage is already imported (check existing imports)

## Output Format
Respond with a structured report:

### CONTEXT_GATHERED
What information was searched/found, key findings

### CHANGES_MADE
For each file changed:
- File path
- What was changed and why
- Lines added/removed

### VERIFICATION_RESULTS
- Any checks performed
- Manual verification notes

### REMAINING_ISSUES
Any unresolved issues, edge cases, or suggestions
</TASK>
