# Research: aCRF annotation layer extraction (R3)

- **Query**: Extract the aCRF annotation layer (rendering + drag wiring) of `FormDesignerTab.vue`'s Word previews into an independent component without changing the geometry/persistence contract.
- **Scope**: internal (stable snapshot `/tmp/designer-split-analysis/frontend/`, identical to `main` @ c40cb09)
- **Date**: 2026-10-10

All line numbers are against `/tmp/designer-split-analysis/frontend/src/components/FormDesignerTab.vue` unless a path is stated.

Snapshot anchors verified:

| Block | Lines |
|---|---|
| `<script setup>` | 1–3086 |
| `<template>` | 3088–5304 |
| `<style>` (non-scoped) | 5306–5325 |
| `<style scoped>` | 5327–5985 |
| Main-canvas preview block (`.fd-canvas` → `.word-preview` → `.word-page`) | 3196–3801 |
| Fullscreen dialog preview block (`designer-preview-pane` → `.word-page`) | 4020–~4722 |

---

## 1. Annotation markup sites

There are **16 annotation sites** in FormDesignerTab.vue: **8 in the main canvas** (3196–3801) and **8 in the fullscreen preview** (4020–4722). Each site is one outer `<span class="wp-acrf-annotation …">` containing a text `<span class="wp-acrf-annotation__text">` and a reset `<button class="wp-acrf-annotation-reset">`.

### Exact attribute set (identical shape at every site)

```html
<span
  v-if="showAcrfAnnotations && <textExpr>"
  :class="[ 'wp-acrf-annotation', '<kindClass>', { 'wp-acrf-annotation--interactive': isAnnotationDraggable(<targetExpr>) } ]"
  :style="getAnnotationStyle(<textExpr>, <KIND_CONST>, <targetExpr>)"
  @pointerdown="(event) => onAnnotationPointerDown(<targetExpr>, event)"
>
  <span class="wp-acrf-annotation__text">{{ <textExpr> }}</span>
  <button
    type="button"
    class="wp-acrf-annotation-reset"
    :disabled="!hasAnnotationOverrideForTarget(<targetExpr>)"
    aria-label="<重置表单 domain 标注位置 | 重置字段标注位置>"
    @pointerdown.stop
    @click.stop="resetAnnotationPosition(<targetExpr>)"
  >R</button>
</span>
```

No `data-test` attribute exists on any annotation element. The only dynamic attributes are `v-if`, `:class`, `:style`, `:disabled`, `aria-label`, `@pointerdown`, `@click`.

### Per-site table (site = line of `'wp-acrf-annotation',`)

| # | Site line | Block | `kind` | extra classes | host element (positioned ancestor) |
|---|---|---|---|---|---|
| 1 | 3208 | canvas | FORM | `--form` | `div.wp-form-title-row` (3203) |
| 2 | 3282 | canvas | FIELD | `--field` | `td.unified-value.row-resize-anchor` (3273) |
| 3 | 3343 | canvas | FIELD | `--field` | `td` (label/multiline/log, 3331) |
| 4 | 3403 | canvas | INLINE_HEADER | `--field --inline-header` | `td.wp-inline-header.row-resize-anchor` (3391) |
| 5 | 3526 | canvas | FIELD | `--field` | `td.wp-structure-label--multiline.row-resize-anchor` (3517) |
| 6 | 3576 | canvas | FIELD | `--field` | `td.row-resize-anchor` (log row, 3567) |
| 7 | 3633 | canvas | FIELD | `--field` | `td.wp-ctrl.row-resize-anchor` (3624) |
| 8 | 3711 | canvas | INLINE_HEADER | `--field --inline-header` | `td.wp-inline-header.row-resize-anchor` (3700) |
| 9 | 4040 | fullscreen | FORM | `--form` | `div.wp-form-title-row` (4035) |
| 10 | 4124 | fullscreen | FIELD | `--field` | `td.unified-value.row-resize-anchor` (4115) |
| 11 | 4195 | fullscreen | FIELD | `--field` | `td` (label/multiline/log, 4182) |
| 12 | 4264 | fullscreen | INLINE_HEADER | `--field --inline-header` | `td.wp-inline-header.row-resize-anchor` (4252) |
| 13 | 4398 | fullscreen | FIELD | `--field` | `td.wp-structure-label--multiline.row-resize-anchor` (4389) |
| 14 | 4452 | fullscreen | FIELD | `--field` | `td.row-resize-anchor` (log row, 4443) |
| 15 | 4518 | fullscreen | FIELD | `--field` | `td.wp-ctrl.row-resize-anchor` (4506) |
| 16 | 4606 | fullscreen | INLINE_HEADER | `--field --inline-header` | `td.wp-inline-header.row-resize-anchor` (4595) |

### Variants (semantic grouping)

Ignoring whitespace and the `(seg.fields[0])` vs `(ff)` argument, the 16 sites collapse into **3 semantic variants**:

| Variant | Kind class(es) | `textExpr` / `targetExpr` | aria-label | Sites | Count |
|---|---|---|---|---|---|
| **V-FORM** | `--form` | `getFormDomainAnnotationText(selectedForm)` / `getFormAnnotationTarget(selectedForm)` | 重置表单 domain 标注位置 | 3208, 4040 | 2 |
| **V-FIELD-SEG** | `--field` | `getFieldOidAnnotationText(seg.fields[0])` / `getFieldAnnotationTarget(seg.fields[0])` | 重置字段标注位置 | 3282, 3343, 4124, 4195 | 4 |
| **V-FIELD-FF** | `--field` | `getFieldOidAnnotationText(ff)` / `getFieldAnnotationTarget(ff)` | 重置字段标注位置 | 3526, 3576, 3633, 4398, 4452, 4518 | 6 |
| **V-INLINE-HEADER** | `--field --inline-header` | `getFieldOidAnnotationText(ff)` / `getFieldAnnotationTarget(ff)` | 重置字段标注位置 | 3403, 3711, 4264, 4606 | 4 |

V-FIELD-SEG and V-FIELD-FF are structurally identical (only the iterated variable differs) → effectively **3 distinct renderings: form / field / inline-header**. The canvas and fullscreen copies of each variant are byte-identical except for indentation and the line-wrapping of the `@pointerdown` handler (2-line arrow in the fullscreen block).

Structural differences between variants: only (a) the presence of `--form` vs `--field`, (b) the extra `--inline-header` class, (c) the `ANNOTATION_KIND_*` constant passed to `getAnnotationStyle`, (d) the form-level aria-label string. The reset button and text span are identical everywhere.

---

## 2. Script wiring

### 2a. `acrfAnnotationGeometry.js` (138 lines) — pure functions/constants

Imported into FormDesignerTab at lines 59–68: `ANNOTATION_FORM_KEY`, `ANNOTATION_KIND_FIELD`, `ANNOTATION_KIND_FORM`, `ANNOTATION_KIND_INLINE_HEADER`, `buildAnnotationStyle`, `hasAnnotationOverride`, `normalizeAnnotationPositions`, `readAnnotationDelta01Cm`.

| Export | Line | Notes |
|---|---|---|
| `ANNOTATION_FORM_KEY='_form'` | 1 | reserved key for form domain |
| `ANNOTATION_KIND_FIELD/INLINE_HEADER/FORM` | 22–24 | `'field' / 'inline-header' / 'form'` |
| `ANNOTATION_POSITION_MIN/MAX_Y = ∓200` | 3–4 | clamp bounds (0.01cm) |
| `buildAnnotationStyle({text,kind,deltaY01cm})` | 127–138 | returns the `--acrf-annotation-*` CSS-var object; the `:style` value at every site |
| `resolveAnnotationTopCm(kind, deltaY01cm)` | 114–118 | `default(kind) + delta*3600` EMU → cm |
| `estimateAnnotationWidthCm(text)` | 120–125 | width from weighted chars, clamped to [0.9, 4.6] |
| `hasAnnotationOverride(positions,key)` | 79–83 | drives `:disabled` |
| `readAnnotationDelta01Cm(positions,key)` | 73–77 | drives `getAnnotationStyle` delta |
| `normalizeAnnotationPositions(value)` | 61–71 | canonicalizes the map |
| `buildNextAnnotationPositions(...)` | 85–96 | used by the drag composable |
| `annotationDeltaPxTo01Cm(px)` | 98–100 | px→0.01cm for drag |
| `ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU=-26940` | 15 | must equal backend constant |

### 2b. `useAcrfAnnotationDrag.js` (199 lines) — API

Factory `useAcrfAnnotationDrag({ apiClient, getCurrentPositions, applyOptimisticPositions, onPersisted, onError, debounceMs=220 })` (19–199). It is **closure state**, no refs exported. Returns:

| Returned fn | Line | Behaviour |
|---|---|---|
| `queueAnnotationPosition({formId,projectId,key,deltaY01cm,basePositions})` | 106–118 | builds next map, skips no-op, commits a snapshot + debounced save |
| `resetAnnotationPosition(target)` | 120–126 | `queueAnnotationPosition({...target, deltaY01cm:0})` (deletes the key) |
| `onAnnotationPointerDown(target, event)` | 159–184 | starts a drag session: `preventDefault`, `setPointerCapture`, binds window `pointermove`/`pointerup`/`pointercancel` |
| `cancelActiveDrag({revert=true})` | 52–61 | reverts optimistic positions to `startPositions` |
| `flushPending({cancelActiveDrag})` | 63–104 | drains `pendingSnapshots` via `apiClient.patch`, returns boolean |
| `dispose()` | 186–189 | `cancelActiveDrag()` + `flushPending()` |

Internal drag session state (all module-local, owned by the composable): `dragState`, `saveTimer`, `pendingSnapshots` (Map keyed `projectId:formId`), `savePromise`. Persistence endpoint is `PATCH /api/forms/{formId}` with body `{ annotation_positions: <map|null> }` (78–87) and cache invalidation of `/api/forms/{id}/fields` and `/api/projects/{projectId}/forms`. There is **no undo/history interaction** — `useDesignerHistory` is never touched by the drag path (grep confirms no `history` reference in the composable or the annotation functions).

### 2c. FormDesignerTab instantiation and helper functions

| Symbol | Definition line | Inputs | Reads FormDesignerTab state? |
|---|---|---|---|
| `getFieldOidAnnotationText(formField)` | 169–173 | a form-field | no (pure; returns `variable_name`, `''` for 标签) |
| `getFormDomainAnnotationText(form)` | 175–178 | a form | no (pure; `form.domain`) |
| `getFormStateById(formId)` | 323–327 | formId | **yes** (`selectedForm`, `forms`) |
| `getFormAnnotationPositions(formId)` | 329–331 | formId | **yes** (via `getFormStateById`) |
| `applyFormAnnotationPositions(formId, positions)` | 333–340 | formId, map | **yes** (writes via `mergeFormIntoState`) |
| `mergeFormIntoState(updatedForm)` | 305–321 | partial form | **yes** (mutates `forms`, `selectedForm`) |
| `showAcrfAnnotations` (computed) | 1492 | — | **yes** (`editMode`, `viewMode`) |
| `annotationDrag` (instance) | 1494–1511 | callbacks | **yes** (wires `getFormAnnotationPositions`, `applyFormAnnotationPositions`, `mergeFormIntoState`, `reloadForms`) |
| `getFieldAnnotationTarget(formField)` | 1513–1521 | field | **yes** (`selectedForm.id`, `props.projectId`) → `{formId, projectId, key}` or `null` |
| `getFormAnnotationTarget(form)` | 1523–1531 | form | **yes** (`props.projectId`) → `{formId, projectId, key:'_form'}` or `null` |
| `isAnnotationDraggable(target)` | 1533–1535 | target | **yes** (`showAcrfAnnotations`) |
| `hasAnnotationOverrideForTarget(target)` | 1537–1539 | target | **yes** (`getFormAnnotationPositions`) |
| `getAnnotationStyle(text, kind, target)` | 1541–1547 | text, kind, target | **yes** (`getFormAnnotationPositions` → `readAnnotationDelta01Cm`) |
| `onAnnotationPointerDown(target, event)` | 1549–1552 | target, event | gates on `isAnnotationDraggable`, delegates to `annotationDrag` |
| `resetAnnotationPosition(target)` | 1554–1557 | target | delegates to `annotationDrag` |
| `flushAnnotationPositionSave(options)` | 1559–1561 | options | delegates to `annotationDrag.flushPending` |

**Every markup helper except the two pure text extractors reads FormDesignerTab state.** This is the crux of the boundary design: the annotation markup cannot be moved without either (a) the parent pre-computing everything into props, or (b) the child receiving raw inputs (text, target, deltaY01cm) and recomputing via the shared composable.

### 2d. Drag-session ownership, positions map, persistence, flush call sites

- **Owner of drag-session state**: the `annotationDrag` closure (2b) — NOT FormDesignerTab. FormDesignerTab only owns the `annotation_positions` map, stored on the Form record (`selectedForm` / `forms[i]`) and mirrored by `getFormAnnotationPositions` / `applyFormAnnotationPositions`.
- **Persistence**: `PATCH /api/forms/{formId}` (endpoint in the composable, §2b). On success `onPersisted(updatedForm)` → `mergeFormIntoState` (1498–1500). On error → `ElMessage.error` + cache invalidate + `reloadForms` (1501–1510).
- **Flush call sites** (all must keep working after extraction):
  - 1761 `selectForm` — `flushAnnotationPositionSave({cancelActiveDrag:true})` gate before switching form
  - 2983 `watch(() => props.projectId)` — flush before project switch
  - 3018 `resolveDesignerLeave` — flush before designer close / project leave
  - 2976 `onBeforeUnmount` — `annotationDrag.dispose()`
- **Undo/history**: no interaction. **Dirty-state**: none.

---

## 3. Styles

### 3a. FormDesignerTab.vue `<style>` (non-scoped, 5306–5325)
No annotation rules.

### 3b. FormDesignerTab.vue `<style scoped>` (5327–5985)

| Selector | Lines | Notes |
|---|---|---|
| `.wp-form-title-row` | 5832–5837 | `position: relative; min-height:0.7cm; margin-bottom:24px; padding-right:4.8cm` — **positioned ancestor of the form-level annotation** |
| `.wp-form-title-row .wp-form-title` | 5839–5841 | `margin-bottom:0` |
| `.wp-acrf-annotation` | 5843–5867 | `position:absolute; top:var(--acrf-annotation-top); right:0; …border:var(--acrf-annotation-border-width) solid #c00000; background:#fff2f2; color:#c00000; z-index:3` |
| `.wp-acrf-annotation__text` | 5869–5873 | ellipsis |
| `.wp-acrf-annotation--interactive` | 5875–5877 | `cursor:ns-resize` |
| `.wp-acrf-annotation-reset` | 5879–5901 | absolute `top/right:-8px`, hidden by `opacity:0` |
| `.wp-acrf-annotation:hover .wp-acrf-annotation-reset, .wp-acrf-annotation:focus-within .wp-acrf-annotation-reset` | 5903–5906 | `opacity:1` |
| `.wp-acrf-annotation-reset:hover:not(:disabled), .wp-acrf-annotation-reset:focus-visible:not(:disabled)` | 5908–5913 | filled red |
| `.wp-acrf-annotation-reset:disabled` | 5915–5917 | `cursor:not-allowed` |
| `.wp-acrf-annotation:hover .wp-acrf-annotation-reset:disabled, .wp-acrf-annotation:focus-within .wp-acrf-annotation-reset:disabled` | 5919–5922 | `opacity:0.45` |
| `.wp-acrf-annotation--inline-header` | 5924–5926 | `z-index:4` |

**Ancestor-dependent selectors**: the `.wp-acrf-annotation:hover … .wp-acrf-annotation-reset` / `:focus-within` rules are descendant combinators over the child's own two elements. Because the annotation root becomes a child component root, a **parent** scoped rule reaches only that root, never the descendant `.wp-acrf-annotation-reset` — so all 11 rules must move into the extracted component's own `<style scoped>`. `.wp-form-title-row` (the positioned ancestor) is NOT annotation-owned and stays with the preview template (owned by the `DesignerWordPreview.vue` merge step, not R3).

### 3c. `frontend/src/styles/main.css`
No `.wp-acrf-annotation*` rules exist. Relevant shared/global rules:

- `.word-page` (345–357): `position: relative` (the page is the positioned ancestor for field-level annotations' `td`).
- `.word-page .row-resize-anchor { position: relative }` (418) — **this is the positioned ancestor for all field-level annotations** (every FIELD/INLINE host `td` carries `row-resize-anchor`).
- `.word-page .wp-form-title { … text-align:left }` (363) — the locked parity contract (do not touch).
- `.wp-body` / `.wp-main` (448–450) — layout wrappers around the tables.

The extracted component's styles are self-contained; the only external dependency is the host `td.row-resize-anchor` / `.wp-form-title-row` being `position: relative`, which stays in the preview template/global CSS.

---

## 4. VisitsTab.vue (read-only reference; out of scope)

`frontend/src/components/VisitsTab.vue` (1545 lines) renders **8 annotation sites** (1018, 1068, 1119, 1167, 1239, 1283, 1331, 1387) using the same markup shape:

| Site | Kind | Host |
|---|---|---|
| 1018 | FORM | `div.wp-form-title-row` (1014, title = `formPreviewTitle`) |
| 1068 | FIELD | `td.unified-value.row-resize-anchor` (1063) |
| 1119 | FIELD | `td` (1107) |
| 1167 | INLINE_HEADER | `td` (1156) |
| 1239 | FIELD | `td.wp-structure-label--multiline.row-resize-anchor` (1234) |
| 1283 | FIELD | `td.row-resize-anchor` (1278) |
| 1331 | FIELD | `td.wp-ctrl.row-resize-anchor` (1326) |
| 1387 | INLINE_HEADER | `td` (1377) |

Script wiring (VisitsTab 503–584) mirrors FormDesignerTab: own `getFormAnnotationPositions`/`applyFormAnnotationPositions` (503/507, reading `allForms`/`visitForms`/`matrixData.forms`/`formPreviewForm`), own `annotationDrag = useAcrfAnnotationDrag(...)` (518), `getFieldAnnotationTarget`/`getFormAnnotationTarget` (537/547), `isAnnotationDraggable` (557), `hasAnnotationOverrideForTarget` (561), `getAnnotationStyle` (565), `onAnnotationPointerDown` (573), `resetAnnotationPosition` (578), `flushAnnotationPositionSave` (583). Own `<style scoped>` (1454–1544) with the **same** `.wp-acrf-annotation*` rules plus `.wp-form-title-row` (1455–1459 — note: **no `margin-bottom`/`min-height`**, unlike the designer's copy).

**Reuse gaps for `visits-preview-split`**: an extracted per-annotation component (Option A) is presentational and reusable there, but:
1. Form-level aria-label differs: designer = `重置表单 domain 标注位置`, VisitsTab = `重置表单标注位置` → must become a prop or be reconciled.
2. VisitsTab's preview page class is `word-page word-page--a4` (global) vs the designer's `word-page form-designer-word-page designer-scaled-word-page`; the annotation component must not own page/title-row styles, so this is fine — but the two previews remain distinct containers.
3. VisitsTab's positions map is spread across four collections (`allForms`/`visitForms`/`matrixData.forms`/`formPreviewForm`) and merged per-collection (`{...item, ...updatedForm}`, see `acrfViewToggle.test.js:389`); the component itself doesn't touch this, but the follow-up task must keep the merge semantics.
4. The `.wp-acrf-annotation*` CSS is currently duplicated verbatim in both files; the extraction is the natural moment to share it (component-scoped or a shared stylesheet), but R3 must not change VisitsTab.

---

## 5. Tests asserting on annotation markup / wiring / CSS

Grep of `frontend/tests/**` for annotation tokens found references in **3 node:test files**; **no vitest component spec** references annotations.

### `frontend/tests/acrfViewToggle.test.js` (reads FormDesignerTab + VisitsTab + main.css sources)
Assertions that touch FormDesignerTab **annotation markup / CSS** and will break when markup/styles move:

| Test (line) | Asserted pattern |
|---|---|
| `viewMode helpers … annotation text contracts` (70) | `compileFunction('getFieldOidAnnotationText')`, `compileFunction('getFormDomainAnnotationText')` — pure, stay in parent; **unaffected** |
| `two inline-prompt switches …` (97) | regex on `flushAnnotationPositionSave({ cancelActiveDrag: true })` in `selectForm` — **script stays in parent; unaffected** |
| `aCRF annotations stay inside the two designer word pages …` (194) | `countMatches(formDesignerSource, /'wp-acrf-annotation--form'/g) === 2`; `countMatches(formDesignerSource, /class="wp-form-title-row"/g) === 2`; regexes matching `getAnnotationStyle(…ANNOTATION_KIND_FORM/FIELD/INLINE_HEADER)` **in the FormDesignerTab source** → **BREAKS** (markup moves) |
| `designer field list hides label-field tooltip …` (260) | field-list `ff-var-name` template — not the annotation layer; **unaffected by R3** |
| `aCRF annotation styles stay absolute …` (272) | `extractRuleBody(formDesignerSource, '.wp-acrf-annotation')`, `'--interactive'`, `'.wp-form-title-row'`, `'.wp-acrf-annotation-reset'`; `assert.match(formDesignerSource, /onAnnotationPointerDown/)`, `/resetAnnotationPosition/`, `/class="wp-acrf-annotation-reset"/` → **BREAKS** (CSS + markup + some source strings move) |
| `aCRF reset button stays hidden while disabled …` (340) | loops over both files, `extractRuleBodyByPattern` on `.wp-acrf-annotation-reset:disabled` / reveal rules in FormDesignerTab source → **BREAKS for FormDesignerTab** (CSS moves) |

### `frontend/tests/quickEditBehavior.test.js` (reads FormDesignerTab source)
- `form switch flushes annotation drag and clears stale field state before selecting next form` (446): asserts `selectForm`/`invalidateFormSelectionSession`/`formSelectionSession` script structure. Annotation flush lives in the parent → **unaffected by R3** (name only).

### `frontend/tests/acrfAnnotationGeometry.test.js` (109 lines) and `frontend/tests/acrfAnnotationPersistence.test.js` (225 lines)
Pure composable tests importing `acrfAnnotationGeometry.js` / `useAcrfAnnotationDrag.js` / `useApi.js` directly; they do **not** read `FormDesignerTab.vue`. **Unaffected** by the extraction (and are the regression guard for the geometry/persistence contract).

**Conclusion**: the only test file needing updates for R3 is `acrfViewToggle.test.js`, with **3 breaking tests** (194, 272, 340) — the assertions must be repointed to the new component source (or converted to vitest mount tests). The other 23 files that read `FormDesignerTab.vue` (per PRD) assert unrelated designer features (ordering, drafts, field copy, history, resizers, etc.) and do not touch annotations.

---

## 6. Component boundary options

### Option A (recommended): one presentational per-annotation component `DesignerAcrfAnnotation.vue`
Renders exactly one annotation `<span>` (root) + text + reset button. Used 16× in FormDesignerTab (and later 8× in VisitsTab). The parent keeps every helper and the drag instance; it pre-computes the class/style and passes them down, and re-emits the two events.

**Why it wins**:
- **Zero geometry/persistence change**: the component root replaces the inline `<span>` 1:1 → identical DOM nesting, identical positioned ancestor, identical `:style` object (built by `buildAnnotationStyle` in the parent). No CSS-var, `top`, or clamp logic is touched.
- **Minimal parent coupling**: parent keeps `showAcrfAnnotations`, target builders, `getAnnotationStyle`, `hasAnnotationOverrideForTarget`, `onAnnotationPointerDown`, `resetAnnotationPosition`, and the `annotationDrag` instance. The child only emits `drag-start` / `reset`.
- **Testable with vitest mount tests** (`frontend/tests/component/`): the component is prop-driven with no parent state, so a mount test can assert classes, CSS vars, `disabled`, aria-label, and emitted events without mounting the 6k-line parent. The `.wp-acrf-annotation*` CSS lives in the component → `extractRuleBody` source assertions can repoint to the component file (or become mount tests).
- **Reusable by `visits-preview-split`** (Option A is container-agnostic), modulo the aria-label prop gap (§4).

**Cost**: the parent template keeps 16 call sites but each shrinks from ~30 lines to ~5.

### Option B: overlay-layer component (all annotations in one child layer)
Rejected. It would require restructuring the DOM (wrapping/repositioning annotations relative to a new layer) → risks the `position:absolute` + positioned-ancestor geometry contract, changes the `.wp-form-title-row` / `td.row-resize-anchor` relationship, and is far harder to test. Violates "zero geometry change".

### Option C: keep markup inline, extract only the wiring into a composable
Rejected as an R3 answer: the requirement is to extract the *layer* (rendering + drag wiring); markup is the bulk of the duplication. (Wiring is already extracted into `useAcrfAnnotationDrag.js`.)

### Recommended typed props/emits (Option A)

```js
// DesignerAcrfAnnotation.vue
defineProps({
  text:       { type: String,  required: true },   // annotation display text
  kind:       { type: String,  default: 'field' },  // 'form' | 'field' | 'inline-header'
  target:     { type: Object,  default: null },     // { formId, projectId, key } | null
  draggable:  { type: Boolean, default: false },    // -> --interactive class + pointerdown gate
  overrideActive: { type: Boolean, default: false },// -> reset button :disabled = !overrideActive
  annotationStyle: { type: Object, default: () => ({}) }, // getAnnotationStyle(...) output
})
defineEmits(['drag-start', 'reset'])  // drag-start(event), reset()
```

- `:class` = `['wp-acrf-annotation', kind==='form' ? '--form' : '--field', kind==='inline-header' && '--inline-header', draggable && '--interactive']`.
- aria-label derived in the child: `kind==='form' ? '重置表单 domain 标注位置' : '重置字段标注位置'` (a `ariaLabel` prop would remove the VisitsTab gap — see §4).
- `@pointerdown="draggable && emit('drag-start', $event)"` (parent still gates via `isAnnotationDraggable` before passing `draggable`).
- reset: `@pointerdown.stop @click.stop="emit('reset')"`, `:disabled="!overrideActive"`.

### What stays in FormDesignerTab.vue (parent)
- State: `forms`, `selectedForm`, `props.projectId`, `editMode`, `viewMode`; the `annotation_positions` map (on the Form records).
- Computed/functions: `showAcrfAnnotations`, `getFieldOidAnnotationText`, `getFormDomainAnnotationText`, `getFormStateById`, `getFormAnnotationPositions`, `applyFormAnnotationPositions`, `mergeFormIntoState`, `getFieldAnnotationTarget`, `getFormAnnotationTarget`, `isAnnotationDraggable`, `hasAnnotationOverrideForTarget`, `getAnnotationStyle`, `onAnnotationPointerDown`, `resetAnnotationPosition`, `flushAnnotationPositionSave`, and the `annotationDrag = useAcrfAnnotationDrag({...})` instance.
- The `v-if="showAcrfAnnotations && <textExpr>"` guard (kept in the parent template so the child is only mounted when there is text).
- The `@drag-start="(e) => onAnnotationPointerDown(target, e)"` / `@reset="resetAnnotationPosition(target)"` re-binding at each of the 16 sites.

---

## 7. cross-stack-contracts §6 constraints the extraction must preserve (`.trellis/spec/guides/cross-stack-contracts.md` §6, lines 491–571)

> - `annotation_positions` lives on the **Form** record as JSON / JSON-string content.
> - The reserved key `_form` stores the form `domain` annotation offset.
> - Every field annotation key is the field definition `variable_name`.
> - `offset_y` MUST be a finite integer in **0.01cm** units; backend schema validation and backend export both clamp to `[-200, 200]`; frontend drag conversion must round to the nearest integer `0.01cm` unit before PATCH.
> - `1cm = 360000 EMU; 0.01cm = 3600 EMU; defaultVerticalOffset = -26940 EMU; posOffset = defaultVerticalOffset + deltaY01cm * 3600`; `+deltaY` means moving the annotation downward.
> - The preview-side `top` CSS value MUST derive from the same formula after EMU→cm conversion; frontend drag math uses the CSS identity `96 px = 1in`.
> - Shared visual constants: font size `8pt`, box height `0.7cm`, X padding `22860 EMU`, Y padding `18000 EMU`, border width `12700 EMU`, max width `4.6cm`, default vertical offset `-26940 EMU`.
> - Synchronization checklist: keep `FormDesignerTab.vue` and `VisitsTab.vue` on the same `annotation_positions` storage shape and drag gate rules; run `frontend/tests/acrfAnnotationGeometry.test.js`, `acrfAnnotationPersistence.test.js`, `acrfViewToggle.test.js`.
> - Preview/export parity: export annotations are floating text boxes and must not enter strict table text; any preview JSON extractor used with `compare_word_table_parity.py` MUST ignore `.wp-acrf-annotation` descendants.

All of the above live in `acrfAnnotationGeometry.js` / `useAcrfAnnotationDrag.js` / the CSS-var `:style`, none of which R3 may alter. The extraction only relocates the markup + CSS; the `:style` object, the `PATCH` payload shape, the `_form` key, and the clamp stay byte-identical.

---

## Caveats / Not Found

- No `data-test` attribute exists on any annotation element (unlike `data-test="designer-form-switch"`), so no test keys depend on it.
- The fullscreen preview block's closing line was not pinned to a single number (~4722 for `designer-preview-pane`); the main-canvas preview block ends at 3801. The two-template merge is the other researcher's scope.
- No vitest component spec currently covers annotations; converting the 3 breaking `acrfViewToggle.test.js` source assertions to mount tests is feasible (prop-driven component) but is an implementation decision, not a research finding.
- `useDesignerHistory` (undo/redo) has **no** interaction with annotation drag/reset — verified by grep; annotations persist immediately via the debounced PATCH, independent of the undo stack.
