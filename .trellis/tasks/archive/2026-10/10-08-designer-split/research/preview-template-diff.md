# Research: preview-template-diff (designer-split R1)

- **Query**: Exact boundaries, normalized diff, identifier/ref/style/spec analysis for extracting the two near-duplicate Word-preview templates of `FormDesignerTab.vue` into one `DesignerWordPreview.vue`.
- **Scope**: internal (read-only)
- **Date**: 2026-10-10
- **Snapshot**: `/tmp/designer-split-analysis/frontend/src/components/FormDesignerTab.vue` (identical to `main` @ c40cb09). All line numbers below refer to this snapshot.
- **Spec docs**: `/tmp/designer-split-analysis/.trellis/spec/`

Anchors verified: `<script setup>` 1–3086, `<template>` 3088–5304, non-scoped `<style>` 5306–5325, `<style scoped>` 5327–5985. Main-canvas preview begins 3197; fullscreen preview page begins 4029.

---

## 1. Block boundaries and surrounding structure

### Block A — main-canvas preview

| Region | Lines |
|---|---|
| `div.fd-canvas` wrapper (sibling of the canvas toolbar) | 3196–3799 |
| **`div.word-preview` (shared component root candidate)** | **3197–3798** |
| **`div.word-page.form-designer-word-page.designer-scaled-word-page`** (the actual page) | **3198–3797** |
| `div.wp-empty` "← 请选择表单" (no form) | 3201 |
| `template v-else` (form body) | 3202–3796 |
| `div.wp-form-title-row` (title + form aCRF annotation) | 3203–3233 |
| `div.wp-empty` "暂无字段" | 3234 |
| `div.wp-body > div.wp-main` (group loop) | 3235–3795 |
| close `</div>` word-page / word-preview | 3797–3798 |

Surrounding (must NOT move into the child):
- 3164–3195 `div.fd-right` + `div.pane-tool-slot.fd-canvas-toolbar`: 设计表单 button, aCRF/eCRF `el-switch` (v-model `viewMode`), title/notes/count header.
- 3196 `<div class="fd-canvas" style="flex:1">`: the flex container that gives `.word-preview` its height.

### Block B — fullscreen-designer preview

| Region | Lines |
|---|---|
| `el-dialog v-model="showDesigner"` fullscreen, class `designer-dialog` | 3802–5125 |
| dialog `#header` slot (form-switch select, aCRF/eCRF switch, template-field-search) | 3809–3855 |
| `div.designer-shell` (3-pane grid, `@click="onDesignerBlankClick"`) | 3857–5124 |
| left `div.designer-fields-panel` (field list) | 3858–4013 |
| `button.pane-v-resizer.designer-left-resizer` | 4014–4019 |
| **`div.designer-preview-pane`** | **4020–4722** |
| `div.designer-section-title` "实时预览" | 4021 |
| **`div.designer-preview-viewport`** (scroll container, `overflow:auto`) | **4022–4721** |
| `div.designer-preview-stage` | 4023–4720 |
| `div.designer-preview-page` | 4024–4719 |
| **`div.word-page.form-designer-word-page.designer-scaled-word-page`** (the actual page) | **4025–4718** |
| `div.wp-empty` "← 请选择表单" | 4033 |
| `template v-else` (form body) | 4034–4717 |
| `div.wp-form-title-row` | 4035–4071 |
| `div.wp-empty` "暂无字段" | 4072 |
| `div.wp-body > div.wp-main` (group loop) | 4073–4716 |
| `button.pane-h-resizer` (right of preview) | 4723–4728 |
| right `div.designer-editor-card` (form/field property editor) | 4729–5121 |

### Natural extraction boundary (recommendation)

**Root = the `div.word-page...` page element.** i.e.:
- Block A child root = line 3198–3797 (inside `div.word-preview`).
- Block B child root = line 4025–4718 (inside `div.designer-preview-page`).

Justification:
1. The `div.word-page` element is the ONLY structurally identical top node in both blocks (same tag, same `:class` list, same `wp-empty` / `template v-else` / `wp-form-title-row` / `wp-body>wp-main` subtree). Everything above it differs (A has `word-preview`; B has `designer-preview-pane > viewport > stage > page`) and belongs to the parent's layout.
2. The parent keeps `.word-preview` (A) and `.designer-preview-pane/-viewport/-stage/-page` (B) as the child's mount wrappers, so all layout/scroll/zoom context and the `.designer-preview-pane` blank-click exclusion stay in the parent.
3. `useColumnResize` snapping walks up to the nearest `.wp-main` (useColumnResize.js:257); `.wp-main` is INSIDE the extracted root, so the snap scope is preserved when the child owns the page subtree.
4. Scoped styles: only the child's ROOT element receives the parent's scope attribute. Making `div.word-page` the child root means the shared, class-driven preview rules (`main.css` `.word-page ...` selectors are global, so they reach into the child regardless) keep working, and the block-specific rules (`.designer-scaled-word-page`, `.wp-form-title-row`, `.col-resize-host`, `.resizer-handle`, `.snap-guide`, `.wp-acrf-annotation*`) move into the child's own scoped sheet (see §5).

**Important split-of-responsibility for annotation markup**: the aCRF annotation spans (`wp-acrf-annotation*`) are interleaved at ~7 sites per block (A: 3208, 3282, 3343, 3403, 3526, 3576, 3633, 3711; B: 4040, 4124, 4193, 4262, 4396, 4450, 4516, 4604 — plus the unified `full_row`/`normal 标签`/`normal 日志行` sites). If an earlier step extracts the annotation markup into its own component (as assumed in R1), then those sites become child components inside `DesignerWordPreview.vue`; either way the annotation helpers (`getAnnotationStyle`, `onAnnotationPointerDown`, …) must be forwarded from `FormDesignerTab` (see §3) or imported directly (the pure geometry helpers are exported).

---

## 2. Normalized diff of the two blocks

Method: `/tmp/designer-split-research-a/extract.py` (strip indentation, join wrapped `{{ }}` / tag lines, collapse whitespace) then `diff -u`; a second pass (`token_diff.py`) strips ALL whitespace and commas so prettier re-wrapping vanishes. Raw normalized diff: 48 `-` / 42 `+` lines; after whitespace+comma-squash the REAL difference set is below (every hunk).

### Real (non-formatting) difference hunks

| # | Class | A (line) | B (line) | A text | B text | Proposal |
|---|---|---|---|---|---|---|
| 1 | (b) scaling/zoom | 3199 | 4030 | `{ landscape: landscapeMode }` | `{ landscape: designerLandscapeMode }` | prop `landscapeMode: Boolean` |
| 2 | (a) mode-specific data | 3234 | 4072 | `!formFields.length` | `!designerPreviewFields.length` | prop `isEmpty: Boolean` (parent computes) |
| 3 | (a) mode-specific data | 3237 | 4075 | `renderGroupsView` | `designerRenderGroupsView` | prop `groupsView: Array` |
| 4 | (a) resizer scope | 25 sites (3240,3242,3480…3789) | 25 sites (4078,4080,4344…4709) | `'main'` | `'designer'` | prop `scope: String` |
| 5 | (a) fill chars | 3627 | 4511 | `normalFillChars(gi, gv, 'main')` | `normalFillChars(gi, gv, 'designer')` | same `scope` prop (covered by #4) |
| 6 | (f) template ref / event target | none | — | — | — | none (no `ref=` in either block; see §4) |

**No other real differences exist.** Everything else in the raw diff is prettier re-wrapping:
- `isAnnotationDraggable(getFieldAnnotationTarget(x))` vs `isAnnotationDraggable(getFieldAnnotationTarget(x),)` (trailing comma added by B's prettier pass) — class (g) formatting.
- `<template v-else-if="seg.type === 'inline_block'">` newline vs `<template ...><tr` same-line — class (g).
- `</td>\n</tr>\n</template>` vs `</td></tr></template>` — class (g).
- `:style="{ left: ... + 'px' }"` vs `+ 'px',` — class (g).
- All `getRowResizer(...).onResizeStart(k, e)` vs `onResizeStart(k, e,)` trailing commas — class (g).

### Classes with ZERO hunks (explicitly verified, must stay unified)

| Class | Result |
|---|---|
| (c) aCRF annotation toggles | identical in both blocks — `v-if="showAcrfAnnotations && getFieldOidAnnotationText(...)"`, same `--form` / `--field` / `--inline-header` kinds, same reset button. No difference. |
| (d) event handlers on one side only | none. Both blocks have exactly `@pointerdown`, `@pointerdown.stop`, `@click.stop`, `@dblclick="openQuickEdit(...)"`; no handler exists on one side only. |
| (e) `data-test` / `aria` / `class` differences | none. `data-test` count = 0 in both; `aria-label` = 7×"重置字段标注位置" + 1×"重置表单 domain 标注位置" in BOTH; class lists identical. |
| (f) template refs | none. No `ref=` / `:ref=` / function-ref appears in either block (the only refs in the file are `formsTableRef` 3102, `formOrdinalInputRef` 3123, `fieldItemRefs` 3929 — all outside the preview). |

### Unification rule for class (g)

Since #1–#5 are the ONLY real differences, the shared template is obtained by parameterizing `landscapeMode`, `isEmpty`, `groupsView`, and `scope`. No slot is needed: nothing in the shared subtree is overridden per mode. (A slot would only be needed if a mode wanted to inject extra markup; the analysis shows it does not.)

---

## 3. Script identifiers referenced inside each block

Identifiers are the union of `{{ }}` interpolations, `:attr` / `@event` / `v-*` expressions. "A-only" = referenced only in the main-canvas block; "B-only" = only in the fullscreen block; the rest are shared.

### 3a. A-only identifiers

| Identifier | Definition | Kind |
|---|---|---|
| `landscapeMode` | 1575 `computed` | (i) parent state → prop |
| `renderGroupsView` | 1388 `computed` | (i) parent state → prop |
| `formFields` | 197 `ref` | (i) parent state → prop (used only via `.length`) |

### 3b. B-only identifiers

| Identifier | Definition | Kind |
|---|---|---|
| `designerLandscapeMode` | 1576 `computed` | (i) parent state → prop |
| `designerRenderGroupsView` | 1489 `computed` | (i) parent state → prop |
| `designerPreviewFields` | 1482 `computed` | (i) parent state → prop (used only via `.length`) |

### 3c. Shared identifiers

| Identifier | Definition line | Kind | Child treatment |
|---|---|---|---|
| `selectedForm` | 195 `ref` | (i) parent state | prop `selectedForm` |
| `showAcrfAnnotations` | 1492 `computed` | (i) parent state | prop `showAcrfAnnotations` |
| `getFormDomainAnnotationText` | 174 (module-scope `function`) | (ii) pure | import directly OR prop (it is a plain function in this module; simplest is a prop to avoid duplicating it) |
| `getFieldOidAnnotationText` | 168 (module-scope `function`) | (ii) pure | same |
| `getFormAnnotationTarget` | 1522 | (iii) closure over `selectedForm` + `props.projectId` | prop / parent-provided fn |
| `getFieldAnnotationTarget` | 1512 | (iii) closure over `selectedForm` + `props.projectId` | prop / parent-provided fn |
| `isAnnotationDraggable` | 1532 | (iii) closure over `showAcrfAnnotations` | prop / parent-provided fn |
| `hasAnnotationOverrideForTarget` | 1536 | (iii) closure over `getFormAnnotationPositions` (parent state) | prop / parent-provided fn |
| `getAnnotationStyle` | 1540 | (iii) closure over `getFormAnnotationPositions` | prop / parent-provided fn |
| `onAnnotationPointerDown` | 1548 | (iii) closure over `annotationDrag` (parent composable) | prop / parent-provided fn (emit alternative) |
| `resetAnnotationPosition` | 1554 | (iii) closure over `annotationDrag` | prop / parent-provided fn |
| `ANNOTATION_KIND_FORM` / `_FIELD` / `_INLINE_HEADER` | imports 59–68 from `../composables/acrfAnnotationGeometry.js` | (ii) pure constant | import directly |
| `getFormFieldDisplayLabel` | import 113 from `../composables/formFieldPresentation` | (ii) pure | import directly |
| `getFormFieldLabelPreviewStyle` | import 113 same module | (ii) pure | import directly |
| `getFormFieldPreviewStyle` | import 113 same module | (ii) pure | import directly |
| `renderCellHtml` | 1366 (from `createPreviewCellRenderers`, previewCellRender.js:73) | (iii) closure over adapters (`getPreviewField`, `getScopedDefaultValue`, `renderCtrlTextHtml`, `resolveInlineHostGroups`, `selectedFormPaperOrientation`) | parent-provided fn (adapters reach `renderGroups`/`designerRenderGroups`, `selectedForm`, `selectedFormPaperOrientation`) |
| `normalFillChars` | 1350 | (iii) closure over `getResizer`, `normalColumnCm`, `renderGroups`/`designerRenderGroups`, `selectedFormPaperOrientation` | parent-provided fn; also depends on `scope` |
| `openQuickEdit` | 1803 | (iii) closure over `quickEditField`, `quickEditProp`, `showQuickEdit`, `isSavingFieldProp`, `savingDraft`, `isDraftField` | prop / parent-provided fn |
| `getResizer` | 1626 | (iii) closure over `selectedForm`, `resizerCache` (module Map), `formIdRef`, planners | parent-provided fn (the cache must stay single-owned in the parent) |
| `getRowResizer` | 1646 | (iii) closure over `selectedForm`, `rowResizerCache` | parent-provided fn |
| `getRowHeightStyle` | 1661 | (ii) pure (delegates to `rowResizer.getRowHeightStyle`) | import directly OR prop |
| `getNormalRowKey` / `getInlineHeaderRowKey` / `getInlineDataRowKey` / `getUnifiedRegularRowKey` / `getUnifiedFullRowKey` / `getUnifiedInlineHeaderRowKey` / `getUnifiedInlineDataRowKey` | imports 48–58 from `../composables/useRowResize` | (ii) pure | import directly |
| `cumRatio` | 1641 | (ii) pure | import directly (currently local; move/export) |

Data shapes read inside the blocks (not identifiers but required props): `gv.type`, `gv.colCount`, `gv.segments`, `gv.fields`, `gv.inlineRows`, `gv.mergeSpans`, `gv.labelValueSpans`, `seg.type`, `seg.fields`, `seg.mergeSpans`, `seg.inlineRows`, `ff.field_definition.field_type`, `ff.is_log_row`. These come from `groupsView` (see #3 prop).

### 3d. Proposed `defineProps` / `defineEmits`

```js
// DesignerWordPreview.vue
const props = defineProps({
  groupsView:            { type: Array,   required: true },   // renderGroupsView | designerRenderGroupsView
  scope:                 { type: String,  required: true },   // 'main' | 'designer'
  selectedForm:          { type: Object,  default: null },
  landscapeMode:         { type: Boolean, default: false },
  isEmpty:               { type: Boolean, default: false },   // replaces formFields.length / designerPreviewFields.length
  showAcrfAnnotations:   { type: Boolean, default: false },

  // parent-provided closures (bind with :fn="fn"; closures capture parent state)
  getResizer:            { type: Function, required: true },
  getRowResizer:         { type: Function, required: true },
  renderCellHtml:        { type: Function, required: true },
  normalFillChars:       { type: Function, required: true },
  openQuickEdit:         { type: Function, required: true },
  getFormDomainAnnotationText: { type: Function, required: true },
  getFieldOidAnnotationText:   { type: Function, required: true },
  getFormAnnotationTarget:     { type: Function, required: true },
  getFieldAnnotationTarget:    { type: Function, required: true },
  isAnnotationDraggable:       { type: Function, required: true },
  hasAnnotationOverrideForTarget: { type: Function, required: true },
  getAnnotationStyle:          { type: Function, required: true },
  onAnnotationPointerDown:     { type: Function, required: true },
  resetAnnotationPosition:     { type: Function, required: true },
});

const emit = defineEmits([]); // none required; see caveat below
```

Caveat on emits: because `getResizer`/`getRowResizer`/`renderCellHtml`/annotation handlers are passed as bound closures, no events are strictly required. If the design prefers events over function props, the minimum emit set is `['quick-edit', 'annotation-pointer-down', 'annotation-reset', 'resize-start', 'row-resize-start']`; this is a design choice for the lead architect, not forced by the code.

Pure helpers that the child can IMPORT directly (no prop needed): the `useRowResize` key builders (imports 48–58), `ANNOTATION_KIND_*` (acrfAnnotationGeometry), `getFormFieldDisplayLabel`/`getFormFieldLabelPreviewStyle`/`getFormFieldPreviewStyle` (formFieldPresentation), `buildFormDesignerRenderGroups`/`buildFormDesignerUnifiedSegments` (formFieldPresentation, if the child computes groups itself — but the recommendation is to keep `groupsView` as a prop so the parent's `refreshPreviewOverrideState` still sees the same group objects).

---

## 4. Template refs and DOM coupling

### Template refs

- **None** inside either preview block. There is no `ref=`, `:ref=`, or function ref on any preview element (verified: only `formsTableRef` 3102, `formOrdinalInputRef` 3123, `fieldItemRefs` 3929 exist, all outside the blocks). Therefore **moving the markup into a child does NOT break any template ref**.

### DOM coupling via composables (the real risk)

| Coupling | Where | What it needs | Breaks on move? | Fix |
|---|---|---|---|---|
| Column resize | `useColumnResize.js:254-258` | `event.currentTarget.closest('.col-resize-host')` then `host.closest('.wp-main')` as snap scope | No — both are inside the extracted root | none (keep `.col-resize-host` / `.wp-main` classes inside the child) |
| Column snap guide | `useColumnResize.js:109` `scopeRoot.querySelectorAll('.resizer-handle')` | `.resizer-handle` siblings inside `.wp-main` | No — all inside child | none |
| Row resize | `useRowResize.js:152-158` | `event.currentTarget.closest('tr')` + `getBoundingClientRect()` | No — handler is bound via inline `@pointerdown` inside the child | none |
| Annotation drag | `useAcrfAnnotationDrag.js:172-182` | `event.currentTarget.setPointerCapture` + `window` listeners | No — the handler fn is passed down; `currentTarget` is the annotation element (inside child) | pass `onAnnotationPointerDown`/`resetAnnotationPosition` as props (already in §3d) |
| Blank-click exclusion | `FormDesignerTab.vue:720-736` `DESIGNER_BLANK_EXCLUDE_SELECTOR` includes `.designer-preview-pane` | event target `.closest(...)` from `onDesignerBlankClick` on `designer-shell` | No — `.designer-preview-pane` stays in the PARENT (outside extracted root) | none |
| Preview override rehydrate | `refreshPreviewOverrideState` 1676, `refreshDesignerPreviewOverrides` 1688, `openDesigner` 3062, `handleDesignerBeforeClose` 3052 | iterates `renderGroupsView` / `designerRenderGroupsView` and calls `getResizer(...).rehydrate()` | No — if `groupsView` is the SAME object array passed as prop, parent still holds it | keep the resizer caches (`resizerCache` 1600, `rowResizerCache` 1601) and `getResizer`/`getRowResizer` in the PARENT; pass as props |
| Keyboard undo/redo | `handleHistoryKeydown` 2954 (`window` keydown, gated by `showDesigner`) | global listener in parent | No | none (parent keeps listener) |
| `nextTick` focus | 1227, 2971 | field-list focus / sortable init — OUTSIDE preview blocks | No | none |

**Verdict**: no `defineExpose` and no callback-ref prop are required for the preview move, because there are no template refs and all DOM lookups are class-based (`.wp-main`, `.col-resize-host`, `.resizer-handle`, `tr`) resolved relative to `event.currentTarget` inside the child. The only requirement is that the parent's `getResizer`/`getRowResizer` (which own the caches and `rehydrate`) are passed down as props, and that the child keeps the `.wp-main` / `.col-resize-host` / `.resizer-handle` class names intact.

---

## 5. Styles

### 5a. Rules in `<style scoped>` (5327–5985) that match elements INSIDE the preview blocks

| Selector | Line | Matches | Verdict |
|---|---|---|---|
| `.designer-scaled-word-page` | 5819 | child root (both blocks) | move to child scoped |
| `.designer-scaled-word-page.landscape` | 5827 | child root | move to child scoped |
| `.wp-form-title-row` | 5832 | 3203 / 4035 | move to child scoped |
| `.wp-form-title-row .wp-form-title` | 5839 | title row | move to child scoped |
| `.wp-acrf-annotation` (+ `--interactive`, `--inline-header`) | 5843, 5875, 5924 | annotation spans (annotation-component territory) | move with annotation component / child scoped |
| `.wp-acrf-annotation__text` | 5869 | annotation text | same |
| `.wp-acrf-annotation-reset` (+ `:hover`, `:focus-visible`, `:disabled`, `:focus-within`) | 5879, 5903–5922 | reset button | same |
| `.col-resize-host` | 5929 | 3238/3687/… | move to child scoped |
| `.col-resize-host > table`, `> table.inline-table` | 5934 | tables | move to child scoped |
| `.resizer-handle` (+ `::after`, `:hover::after`, `:active::after`) | 5940, 5950, 5961 | resizer handles | move to child scoped |
| `.snap-guide` | 5965 | snap guide | move to child scoped |
| `.unified-table-host` | 5974 | (dead — markup uses `unified-host`, see §7 risk R4) | leave/remove in parent |

`:deep()`: **none** in the preview-related rules. `:deep()` appears only at 5327+101/104 (`.choice-codelist-actions :deep(...)`) and 5327+260–273 (`.designer-form-switch :deep(...)`), all outside the preview.

### 5b. Rules that ALSO match elements outside the preview blocks (shared — cannot simply move)

| Selector | Line | Outside usage |
|---|---|---|
| `.wp-form-title-row` | 5832 | also used by `VisitsTab.vue:1013` (which has its OWN copy at VisitsTab.vue:1455) — so moving FormDesignerTab's copy to the child is safe for FormDesignerTab; VisitsTab is independent. |

No FormDesignerTab scoped rule matches both a preview element and a non-preview element within this file (verified: the 17 preview classes above appear only inside the two blocks in this component). `.designer-preview-pane` (5787, 5800 for viewport, 5807 stage, 5812 page) are the PARENT wrappers and must stay in the parent.

### 5c. Rules depending on ancestor classes defined OUTSIDE the block (cross the component boundary)

| Rule | Line | Ancestor dependency | Impact when child owns `.word-page` |
|---|---|---|---|
| `.designer-scaled-word-page { width:21cm; ... }` | 5819 | none (applies to root itself) | child root still gets parent's scope attr → parent scoped rule WOULD still apply to root; but per plan move it to child to be self-contained. |
| `.designer-preview-page` / `.designer-preview-stage` / `.designer-preview-viewport` | 5807–5817 | parents of `.word-page` in block B | stay in parent (they wrap the child) |
| `.designer-preview-pane` responsive rules | 5535, 5544, 5981 | `@media (max-width:1100px)` | stay in parent |
| `.designer-shell` grid (`grid-area: preview`) | 5490–5547 | parent | stay in parent |

**Critical boundary fact**: with `<style scoped>`, a parent's scoped selector only reaches a child's **root element** (the compiled attribute is added to the child root but not to its descendants). So every rule in §5a that targets a descendant (title row, annotation, resizer, snap-guide, col-resize-host) MUST move into the child's own `<style scoped>` (or a shared non-scoped sheet). The two root-targeting rules (`.designer-scaled-word-page`, `.landscape`) would keep working via the parent's scope on the child root, but should move anyway for coherence.

### 5d. Global rules in `frontend/src/styles/main.css` (no move needed — global, reach into child)

| Rule | Line |
|---|---|
| `.word-preview` | 331 |
| `.word-page` (+ `.landscape`) | 345, 358 |
| `.word-page--a4` (+ `.landscape`) | 361, 362 |
| **`.word-page .wp-form-title { text-align: left }`** (parity contract — MUST NOT change) | 363 |
| `.word-page table` / `td` / `.wp-label` / `.wp-ctrl` / `.wp-inline-header` | 364–368 |
| `.word-page .inline-table` / `.unified-table` / `.unified-label` / `.unified-value` | 370–379 |
| `.form-designer-word-page .wp-label` / `.wp-inline-header` / `.unified-label` | 376–378 |
| `.word-page .wp-structure-label--multiline` / `.wp-empty` | 380, 381 |
| `.word-page .choice-*` | 384–397 |
| `.word-page .wp-ctrl > span:has(...)` fill-line rules | 401–415 |
| `.word-page .row-resize-host` / `.row-resize-anchor` / `.row-resizer-handle` (+ `::after`, hover) | 417–446 |
| `.wp-body` / `.wp-main` / `.wp-body--with-notes .wp-main` | 448–450 |

These are global (unscoped) in `main.css`, so they reach into the child's subtree regardless of the component boundary — no action needed. The `.word-page .wp-form-title { text-align: left }` at line 363 is the preview/export parity contract and must not be touched.

---

## 6. Spec conventions that bind this extraction

Source: `/tmp/designer-split-analysis/.trellis/spec/frontend/component-guidelines.md`, `state-management.md`.

| Rule | Spec location | Binding effect on R1 |
|---|---|---|
| Component structure: imports → props/emits → composables → state → computed → methods → lifecycle | component-guidelines.md §Component Structure (lines 20–72) | `DesignerWordPreview.vue` must follow this ordering. |
| Props conventions (typed, `required`, defaults for optional) | component-guidelines.md §Props Conventions (79–115) | `defineProps` must declare types; arrays default via factory. |
| Lazy-mounted dialogs must consume initial `modelValue` during setup with `immediate: true` | component-guidelines.md §Lazy-Mounted v-model Dialogs (127–141) | The fullscreen `el-dialog` is NOT lazily mounted (no `v-if` on it); the preview child is mounted inline. Not directly binding, but if the child is ever `v-if`-gated, add an immediate watcher. |
| Scoped CSS + `:deep()` for child components | component-guidelines.md §Scoped CSS (215–227) | Preview rules move to child `<style scoped>`; no `:deep()` is currently used for preview rules. |
| Teleported dialog root: keep root-box rules in non-scoped `<style>`, reserve scoped for dialog-body content | component-guidelines.md §Teleported Dialog Root Styling (229–264) | The fullscreen dialog is `fullscreen` (NOT `append-to-body` per markup 3802–3808). Its root-box rule `.designer-dialog .el-dialog__body` already lives in the non-scoped `<style>` 5306–5325 — leave it there. |
| **Do not create a shared property-card component** (layouts share only visual structure; business state differs per tab) | component-guidelines.md §Right-Side Property Card Pattern (198–213) | This is about the Units/Visits/Fields property card, NOT the preview. It is NOT a prohibition on the preview extraction, but signals the project's stance: extract only when markup is truly shared. Here the two preview blocks ARE near-identical (only 5 real diffs), so extraction is justified; document the 5 differences as the "declared + verified" set per R1. |
| Column Width Persistence Contract: `useColumnResize` producer key `crf:designer:col-widths:<form_id>:<kind>:fieldIds=<ids>`; `openDesigner()` must rehydrate the fullscreen preview; `handleDesignerBeforeClose()` must rehydrate the main preview | state-management.md §4 (68–127) | The resizer caches + `rehydrate` calls (1676/1688/3052/3062) MUST stay in `FormDesignerTab`; the child only calls the passed-in `getResizer`. `scope` prop preserves the `'main'`/`'designer'` distinction that the storage contract relies on. |
| `refreshKey` provide/inject: single `provide()` in App.vue; consumers `watch` and re-fetch | state-management.md §Scenario: refreshKey (280–342) | Not affected by R1 (preview is presentational). |
| Designer leave guards for drafts / field autosave | state-management.md §Scenario: Form Designer Leave Guards (344–473) | R1 must not change save/undo/leave logic; the preview move must not touch `resolveDesignerLeave`, `resolveFieldPropLeave`, `resolveFormPropLeave`, `handleDesignerBeforeClose`. |
| No global store; local state stays in the component | state-management.md §Overview / §State Categories (7–45) | Confirms R1's "state stays in FormDesignerTab"; child is props/emits only. |
| Strict preview/export parity: `.word-page .wp-form-title { text-align: left }` must stay; changes to `.word-page td`/title/font require geometry + strict comparator reruns | component-guidelines.md lines 592–707 (Word preview/export scenario) | R1 must produce a byte-identical preview DOM; the strict comparator (`backend/scripts/compare_word_table_parity.py`) must return `exact_cell_ratio = 1.0` after the move. |
| `FormDesignerTab.vue` is a named consumer for Word preview rendering | component-guidelines.md 598 | Update this consumer reference if the preview moves to a new file (docs sync). |

No spec section explicitly forbids component extraction; the only "do not extract" rule is scoped to the property-card pattern (component-guidelines.md 198–213), not to the preview.

---

## 7. Risks and recommended sub-step sequence

### Top risks

- **R1 — Scoped-style loss (highest)**: parent scoped rules do not reach child descendants. Every rule in §5a must move to the child's `<style scoped>`. If any is missed, resizer handles, snap guide, annotation box, or the A4 page sizing silently lose styling (visual-only, no test failure unless a source-level test asserts the rule). Mitigation: a source-level test asserting the moved selectors exist in `DesignerWordPreview.vue`, plus the existing `columnWidthPlanning.test.js` / designer source tests.
- **R2 — Resizer cache ownership**: `resizerCache`/`rowResizerCache` (1600–1601) and `getResizer`/`getRowResizer` (1626/1646) must stay in the parent (they key on `selectedForm` + `formIdRef` + planners and back `refreshPreviewOverrideState`). Passing them as props keeps the cache single-owned. If the composable call moves into the child, the rehydrate contract (state-management §4) breaks and persisted widths desync between main and fullscreen preview.
- **R3 — `renderCellHtml` adapter closure**: `createPreviewCellRenderers` adapters (1361–1367) close over `renderGroups`/`designerRenderGroups`, `selectedForm`, `selectedFormPaperOrientation`; `normalFillChars` (1350) closes over the same plus `getResizer`. These must be provided by the parent (function props) or the parity of cell text can drift. Strict comparator must be re-run.
- **R4 — Dead class `unified-table-host`**: the scoped rule `.unified-table-host` (5974) matches no element (markup uses `unified-host`). Do not "move" it as if live; decide explicitly (keep in parent / drop) so R1's "declared differences" note is accurate.
- **R5 — Annotation extraction ordering**: R1 assumes the aCRF annotation markup may already be its own component. If it is NOT, the annotation spans (8 sites/block, interleaved) must be handled by `DesignerWordPreview` directly with the 8 annotation helper props; if it IS, `DesignerWordPreview` renders the annotation child and only forwards the helper props. Either way the 8 annotation helpers (1522/1512/1532/1536/1540/1548/1554 + 168/174) must be reachable from the child.
- **R6 — Parity/regression**: the extracted DOM must be byte-identical. Verify via `frontend/tests/columnWidthPlanning.test.js`, the designer source-level tests, vitest mount tests, and `backend/scripts/compare_word_table_parity.py` (`exact_cell_ratio = 1.0`).

### Recommended sub-step sequence for R1

1. **Baseline capture**: record the rendered preview DOM (or preview JSON) for a fixture form in both modes; run the strict comparator and note `exact_cell_ratio`. This is the acceptance oracle.
2. **Declare the diff set**: encode §2's five real differences (`landscapeMode`, `isEmpty`, `groupsView`, `scope` ×2 sites) as the component's prop contract. Any other difference discovered later is a regression.
3. **Create `DesignerWordPreview.vue`** with the shared `div.word-page` markup (from A: 3198–3797), typed props from §3d, and the moved scoped rules from §5a.
4. **Wire the main canvas (A)**: replace 3198–3797 with `<DesignerWordPreview :groups-view="renderGroupsView" scope="main" :selected-form="selectedForm" :landscape-mode="landscapeMode" :is-empty="!formFields.length" :show-acrf-annotations="showAcrfAnnotations" ...closures />`. Re-run comparator; assert exact parity.
5. **Wire the fullscreen preview (B)**: replace 4025–4718 with the same component using `designerRenderGroupsView` / `scope="designer"` / `designerLandscapeMode` / `!designerPreviewFields.length`. Re-run comparator.
6. **Verify resizer persistence**: main→fullscreen and fullscreen→main width/height round-trip (state-management §4 validation matrix rows 6–7) via the existing tests.
7. **Verify annotation drag** in both instances (annotation helpers passed correctly).
8. **Add a source-level test** asserting the moved selectors live in `DesignerWordPreview.vue` and that `main.css` line 363 is unchanged.
9. **Docs sync**: update the module `CLAUDE.md` / `.claude/index.json` consumer reference for `FormDesignerTab.vue` preview rendering (component-guidelines.md 598).

---

## Caveats / Not Found

- "Non-formatting difference hunk count": exactly **5** logical differences (some spanning 25 repeated call sites for the `scope` parameter). Everything else in the raw `diff -u` (48/42 lines) is prettier re-wrapping (trailing commas, newline-vs-inline template tags).
- The `<style>` blocks contain two dead/possibly-dead selectors relevant to the preview: `.unified-table-host` (5974, no matching element) and `.unified-host` (class used at 3238/4076 but no scoped rule targets it). Neither is a "difference between the blocks".
- Line 5306–5325 non-scoped `<style>` holds `.designer-dialog .el-dialog__body` (dialog body sizing) and `.fd-notes-tooltip`; the dialog is `fullscreen` (not `append-to-body`), so the body rule stays valid in the parent and must not move.
- `useAcrfAnnotationDrag` and `useColumnResize`/`useRowResize` were inspected only for their DOM-coupling surface (lines cited above); full behavioral analysis of the annotation markup is covered by the other researcher.
