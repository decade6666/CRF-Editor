# Design — designer-split

PRD: `prd.md`. Shared runbook: `.trellis/tasks/10-08-review-remediation/implement.md` (parent).
Evidence (all line numbers refer to `main` @ `c40cb09`, snapshot `/tmp/designer-split-analysis/`):

| File | Covers |
|---|---|
| `research/preview-template-diff.md` | R1: block boundaries, normalized diff, identifier table, DOM coupling, style table, spec rules |
| `research/acrf-annotation-layer.md` | R3: 16 annotation sites, wiring, styles, tests, §6 constraints, boundary options |
| `research/source-reading-tests.md` | R6: 27 source-reading test files, affected assertions, mount infra; R2 status |
| `research/browser-parity-recipe.md` | R7: parity CLI, export API, seed data, screenshot recipe |

## 0. Re-baseline (2026-10-10)

- `frontend/src/components/FormDesignerTab.vue`: 5985 lines. `<script setup>` 1–3086, `<template>` 3088–5304,
  non-scoped `<style>` 5306–5325, `<style scoped>` 5327–5985. `legacy-cleanup`, `shared-rule-convergence`,
  `frontend-mount-tests` and `designer-reference-preservation` are all merged into this base.
- **R2 is already delivered** by `shared-rule-convergence` (`research/source-reading-tests.md` §5):
  `CodelistQuickEditDialog.vue` is the single dialog used by both `FieldsTab.vue` and `FormDesignerTab.vue`.
  Both cache invalidations (`/codelists`, `/field-definitions`) live inside the dialog. The designer's
  `afterCodelistDialogChange` (2856–2869) bumps `refreshKey`, which reloads the field library. No code work remains.
  AC2 is closed with evidence only: the existing specs plus one browser behaviour check (§6.3).
- **PRD background drift**: the "100+ differing lines" between the two preview templates are prettier re-wrapping.
  There are exactly 5 real differences (§3.2).
- Out of scope, unchanged: R4 (property-editor composable, save-flow merge), `VisitsTab.vue`, `App.vue`,
  `frontend/src/styles/main.css`, every composable, and the backend.

## 1. Target structure

```
FormDesignerTab.vue                      state owner; script semantics unchanged (§4)
├─ .fd-canvas > .word-preview
│    └─ <DesignerWordPreview scope="main" …/>
└─ el-dialog(fullscreen) > .designer-shell > .designer-preview-pane > -viewport > -stage > -page
     └─ <DesignerWordPreview scope="designer" …/>

DesignerWordPreview.vue                  presentational; root = div.word-page (one template, rendered twice)
└─ <DesignerAcrfAnnotation …/>           presentational; 8 sites (form ×1, field ×5, inline-header ×2)
```

Expected sizes (estimate; record the actual numbers): FormDesignerTab ≈ 4,550–4,650 lines,
DesignerWordPreview ≈ 600–700, DesignerAcrfAnnotation ≈ 100.

## 2. `DesignerAcrfAnnotation.vue` (R3 — Step 1)

### 2.1 Boundary choice

Option A from `research/acrf-annotation-layer.md` §6: a per-annotation presentational component. The child root
replaces the inline `<span>` one-to-one, so DOM nesting, the positioned ancestor (`td.row-resize-anchor` /
`.wp-form-title-row`) and the `:style` object stay identical.

- Rejected B (an overlay layer). It restructures the DOM and breaks the "zero geometry change" rule of §6.
- Rejected C (wiring only). The drag wiring is already in `useAcrfAnnotationDrag.js`, and the markup is the duplication.

Name: `Designer` prefix. Whether `visits-preview-split` reuses it is that task's decision. The known gaps are the
form-level aria-label text ("重置表单标注位置" there) and VisitsTab's per-collection merge semantics. This task adds
no props for VisitsTab (no speculative API).

### 2.2 Contract

```js
defineProps({
  text: { type: String, required: true },            // getFieldOidAnnotationText(ff) | getFormDomainAnnotationText(form)
  kind: { type: String, required: true,              // 'form' | 'field' | 'inline-header'
          validator: (v) => ['form', 'field', 'inline-header'].includes(v) },
  interactive: { type: Boolean, default: false },    // isAnnotationDraggable(target) → --interactive class only
  hasOverride: { type: Boolean, default: false },    // hasAnnotationOverrideForTarget(target) → reset :disabled = !hasOverride
  annotationStyle: { type: Object, required: true }, // getAnnotationStyle(text, KIND, target), computed by the parent
});
defineEmits(['pointerdown', 'reset']);               // pointerdown(event) from the root; reset() from the button click
```

Rendering rules (must reproduce the current DOM exactly):

- Root `<span>` class order: `wp-acrf-annotation`, then `wp-acrf-annotation--form` (form) or `wp-acrf-annotation--field`
  (field, inline-header), then `wp-acrf-annotation--inline-header` (inline-header only), then
  `{ 'wp-acrf-annotation--interactive': interactive }`.
- `:style="annotationStyle"` passed through untouched.
- The root `@pointerdown` emits `pointerdown` **unconditionally**. Gating stays in the parent's `onAnnotationPointerDown`,
  which re-checks `isAnnotationDraggable`. Do not add a second gate in the child.
- Text: `<span class="wp-acrf-annotation__text">{{ text }}</span>`.
- Reset: `<button type="button" class="wp-acrf-annotation-reset" :disabled="!hasOverride" :aria-label="…"
  @pointerdown.stop @click.stop="emit('reset')">R</button>`. aria-label is `重置表单 domain 标注位置` for `kind === 'form'`,
  otherwise `重置字段标注位置`.
- The emit is deliberately named `pointerdown`, so each call site keeps its handler text verbatim:
  `@pointerdown="(event) => onAnnotationPointerDown(<target>, event)"` plus `@reset="resetAnnotationPosition(<target>)"`.
  Declared emits are removed from `$attrs`, so there is no double native listener. The mount spec proves this.

Call site shape (the `v-if` stays with the caller, so the child mounts only when there is text):

```html
<DesignerAcrfAnnotation
  v-if="showAcrfAnnotations && getFieldOidAnnotationText(ff)"
  kind="field"
  :text="getFieldOidAnnotationText(ff)"
  :interactive="isAnnotationDraggable(getFieldAnnotationTarget(ff))"
  :has-override="hasAnnotationOverrideForTarget(getFieldAnnotationTarget(ff))"
  :annotation-style="getAnnotationStyle(getFieldOidAnnotationText(ff), ANNOTATION_KIND_FIELD, getFieldAnnotationTarget(ff))"
  @pointerdown="(event) => onAnnotationPointerDown(getFieldAnnotationTarget(ff), event)"
  @reset="resetAnnotationPosition(getFieldAnnotationTarget(ff))"
/>
```

`seg.fields[0]` sites keep `seg.fields[0]`. Form sites use `getFormDomainAnnotationText(selectedForm)`,
`getFormAnnotationTarget(selectedForm)` and `ANNOTATION_KIND_FORM`. Inline-header sites use `ANNOTATION_KIND_INLINE_HEADER`.

### 2.3 Styles

Move the 11 `.wp-acrf-annotation*` rules (scoped 5843–5926, `research/acrf-annotation-layer.md` §3b) verbatim into
the child's `<style scoped>`. A parent scoped rule reaches only the child root, so the descendant rules
(`__text`, `-reset`, the `:hover` / `:focus-within` reveal rules) must move. No `.wp-acrf-annotation*` rule may remain
in the parent. `.wp-form-title-row` and `.wp-form-title-row .wp-form-title` are not annotation-owned; they stay in
the parent in Step 1 and move with the page in Step 2.

### 2.4 Stays in the parent (unchanged)

`showAcrfAnnotations`, `getFieldOidAnnotationText`, `getFormDomainAnnotationText`, `getFormStateById`,
`getFormAnnotationPositions`, `applyFormAnnotationPositions`, `mergeFormIntoState`, `getFieldAnnotationTarget`,
`getFormAnnotationTarget`, `isAnnotationDraggable`, `hasAnnotationOverrideForTarget`, `getAnnotationStyle`,
`onAnnotationPointerDown`, `resetAnnotationPosition`, `flushAnnotationPositionSave`, the `annotationDrag` instance and
its flush call sites (1761, 2976, 2983, 3018). Geometry, the `_form` key, the clamp, EMU math and the
`PATCH /api/forms/{id}` payload (cross-stack-contracts §6) are untouched.

## 3. `DesignerWordPreview.vue` (R1 — Step 2)

### 3.1 Extraction boundary

The root is the `div.word-page …` element: block A 3198–3797 and block B 4025–4718 (`research/preview-template-diff.md`
§1). It is the only structurally identical top node. These stay in the parent as mount wrappers:

- A: `.fd-right` toolbar (3164–3195), `.fd-canvas` (3196), `.word-preview` (3197).
- B: `el-dialog`, its `#header` slot, `.designer-shell`, the field-list pane, the resizers,
  `.designer-preview-pane` (with the `实时预览` title) → `-viewport` → `-stage` → `-page`, and the editor card.

Keeping the wrappers in the parent keeps the blank-click exclusion (`DESIGNER_BLANK_EXCLUDE_SELECTOR` 720–736), the
`.designer-preview-pane` responsive/cascade CSS, and the `paneSplit.test.js` assertions in place.

### 3.2 Declared difference set (the complete list)

| # | A (main) | B (fullscreen) | Prop |
|---|---|---|---|
| 1 | `{ landscape: landscapeMode }` (3199) | `{ landscape: designerLandscapeMode }` (4030) | `landscapeMode` |
| 2 | `!formFields.length` (3234) | `!designerPreviewFields.length` (4072) | `noFields` |
| 3 | `renderGroupsView` (3237) | `designerRenderGroupsView` (4075) | `groupsView` |
| 4 | `'main'` resizer scope (25 sites) | `'designer'` (25 sites) | `scope` |
| 5 | `normalFillChars(gi, gv, 'main')` (3627) | `…'designer'` (4511) | `scope` |

There are no aCRF toggle, one-sided handler, `data-test`, aria, class or template-ref differences. Everything else in
the raw diff is prettier re-wrapping. If the implementer finds any other difference, it is a stop-and-report event,
not a silent pick.

### 3.3 Contract

Data props:

```js
selectedForm:        { type: Object,  default: null },
groupsView:          { type: Array,   required: true },
scope:               { type: String,  required: true, validator: (v) => v === 'main' || v === 'designer' },
landscapeMode:       { type: Boolean, required: true },
noFields:            { type: Boolean, required: true },
showAcrfAnnotations: { type: Boolean, required: true },
```

Function props (all `{ type: Function, required: true }`): parent closures that own state or caches, passed by
reference so the child template keeps calling them by their current names:
`getResizer`, `getRowResizer`, `renderCellHtml`, `normalFillChars`, `openQuickEdit`, `getFormDomainAnnotationText`,
`getFieldOidAnnotationText`, `getFormAnnotationTarget`, `getFieldAnnotationTarget`, `isAnnotationDraggable`,
`hasAnnotationOverrideForTarget`, `getAnnotationStyle`, `onAnnotationPointerDown`, `resetAnnotationPosition`.

No emits, no provide/inject, no `defineExpose`.

- Why function props and not emits: the template is moved almost verbatim, with identifiers resolving to props. The
  resizer caches and `rehydrate` stay single-owned in the parent (state-management §4: `openDesigner` /
  `handleDesignerBeforeClose` rehydrate through the same `getResizer` cache). Reactivity is preserved because the
  closures read the parent's reactive state while the child renders.
- Why not provide/inject: R5 limits communication to props/emit.
- Template refs: none in either block. All DOM lookups are class-relative to `event.currentTarget` (`.wp-main`,
  `.col-resize-host`, `.resizer-handle`, `tr`), and all of them are inside the child root.
- The parent builds one object after the last referenced definition:
  `const previewHandlers = { getResizer, getRowResizer, renderCellHtml, … };` (14 entries, plain object, not reactive)
  and binds it with `v-bind="previewHandlers"` on both instances, next to the per-instance data props:

```html
<DesignerWordPreview
  v-bind="previewHandlers"
  scope="main"
  :selected-form="selectedForm"
  :groups-view="renderGroupsView"
  :landscape-mode="landscapeMode"
  :no-fields="!formFields.length"
  :show-acrf-annotations="showAcrfAnnotations"
/>
<!-- fullscreen: scope="designer", designerRenderGroupsView, designerLandscapeMode, !designerPreviewFields.length -->
```

- `on`-prefixed prop risk: `onAnnotationPointerDown` starts with `on` + uppercase. A *declared* prop takes precedence
  over listener normalization, and the mount spec must prove the callback fires. If it does not, rename only that
  prop to `annotationPointerDownHandler` and record the deviation.
- Pure helpers used only by the moved template move into the child: `cumRatio` (1641) and `getRowHeightStyle` (1662)
  are deleted from the parent and defined in the child; the `useRowResize` row-key builders,
  `getFormFieldLabelPreviewStyle`, `getFormFieldPreviewStyle` and the `ANNOTATION_KIND_*` constants are imported by the
  child and removed from the parent's import list (each has no other parent use). `getFormFieldDisplayLabel` is
  still used elsewhere in the parent, so both files import it. A missing identifier only logs a render warning in
  dev mode and fails silently in production. The mount spec's warning gate plus full template-branch coverage is the
  guard (§5.2).

### 3.4 Styles

Move into the child's `<style scoped>` verbatim (scoped 5819–5970): `.designer-scaled-word-page`,
`.designer-scaled-word-page.landscape`, `.wp-form-title-row`, `.wp-form-title-row .wp-form-title`, `.col-resize-host`,
`.col-resize-host > table` (+ `.inline-table`), `.resizer-handle` (+ `::after`, `:hover::after`, `:active::after`),
`.snap-guide`. `.snap-guide` is template-rendered (`v-if` on `getResizer(...).snapGuideX`), so a scoped rule works in
the child.

Stays in the parent: `.designer-preview-pane` / `-viewport` / `-stage` / `-page` (5786–5817), the grouped
`min-height: 0` rule (5625–5629), the narrow-screen media rules (5517–5547, 5980–5984), and the non-scoped
`.designer-dialog .el-dialog__body` (5306–5325).

Deleted (declared change): `.unified-table-host` (5974). Its class appears nowhere in `frontend/src` (verified on the
base); re-verify with `grep -rn unified-table-host frontend/src` before deleting.

`frontend/src/styles/main.css` is not touched. Its `.word-page …` rules are global and reach into the child, including
the parity contract `.word-page .wp-form-title { text-align: left }` (363).

## 4. Behaviour-preservation guard (R5)

The `<script setup>` diff of `FormDesignerTab.vue` may contain only:

1. `import` additions/removals caused by the move (the two new components, plus the imports listed in §3.3);
2. the `previewHandlers` object (Step 2);
3. deletion of `cumRatio` and `getRowHeightStyle` (Step 2).

Everything else in the script is byte-identical. That explicitly includes `saveFieldProp`, `saveDraftField`, the
`useDesignerHistory` wiring and handlers, session-restore / `resolveDesignerLeave` / `resolveFieldPropLeave` /
`resolveFormPropLeave` / `handleDesignerBeforeClose`, `openDesigner`, `refreshPreviewOverrideState`,
`refreshDesignerPreviewOverrides`, `getResizer`, `getRowResizer`, the resizer caches, every annotation helper, and
`createPreviewCellRenderers` binding. Check method: inspect `git diff -U0 <base> -- frontend/src/components/FormDesignerTab.vue`
for hunks at or before the `</script>` line. Any hunk outside the allow-list is a defect.

## 5. Test strategy (R6)

### 5.1 Governing rule

`quality-guidelines.md`: mount tests are the tool of record for giant-component splits, because source-text tests
cannot prove behaviour survives. Mount specs use the shared infra (`tests/component/setup.js`; any Vue warning fails;
`api` spied, never `vi.mock`; no teleport stubs; compiled slots only).

### 5.2 New tests

- `tests/component/DesignerAcrfAnnotation.spec.js` (Step 1, RED first). For each `kind`: class list and order, the
  `--interactive` toggle, the style object reaching the root, text, aria-label, and `disabled` from `hasOverride`.
  Root pointerdown emits `pointerdown` with the event. Reset click emits `reset`. Pointerdown on the reset button
  does not emit `pointerdown` (`.stop`). No native listener duplicate (exactly one emission per event).
- `tests/component/DesignerWordPreview.spec.js` (Step 2, RED first). Fixtures built with the existing preview-model
  helpers (`formDesignerPreviewModel.js`, `formFieldPresentation.js`; reuse `previewCellRender.test.js` field
  shapes) so that **every template branch renders at least once with `showAcrfAnnotations: true`**: no form, no
  fields, title row, unified (regular / full-row / inline block), normal (label/value, multiline label, log row,
  标签), and inline groups. Function props are `vi.fn` stubs returning shape-correct values (resizer stubs expose
  `colRatios`, `snapGuideX`, handlers; row resizer exposes `getRowHeightStyle` and `onResizeStart`). Assert:
  - root classes plus the `landscape` toggle;
  - every `getResizer` and `normalFillChars` call receives the `scope` prop (`'main'` and `'designer'` cases);
    `getRowResizer(kind, group)` keeps its original two arguments and shared row-cache ownership (no scope argument);
  - dblclick on a field cell calls `openQuickEdit` with that field;
  - annotation pointerdown calls `onAnnotationPointerDown(target, event)` and reset calls `resetAnnotationPosition(target)`;
  - `renderCellHtml` output lands via `v-html`;
  - no annotations render when `showAcrfAnnotations` is false.
  The Vue-warning gate proves every template identifier resolves.
- New node:test file `tests/designerPreviewSplit.test.js`: parent-wiring guards that replace the meaningless
  "appears twice" assertions:
  - `FormDesignerTab.vue` renders `<DesignerWordPreview` exactly twice, each with its declared prop set (§3.3);
  - `v-bind="previewHandlers"` is on both, and the object lists all 14 handlers;
  - the parent holds no `wp-acrf-annotation` / `class="wp-form-title-row"` / `designer-scaled-word-page` markup and no
    moved CSS selectors;
  - the child holds the moved selectors;
  - `main.css` still has `.word-page .wp-form-title { … text-align: left`.
  The Step 1 subset (annotation-only) lands in Step 1.

### 5.3 Re-pointing existing assertions

The affected set (6 files) follows from `research/source-reading-tests.md` §1a, corrected for the wrappers staying in
the parent. `paneSplit.test.js` is **unaffected**, as are 20 other files.

| File | Step | Moves to | Notes |
|---|---|---|---|
| `acrfViewToggle.test.js` 194/272/340 tests | 1 → 2 | Step 1: CSS + reset markup → `DesignerAcrfAnnotation.vue`; parent call-site shape (`kind="form"` ×2, `ANNOTATION_KIND_*` bindings). Step 2: call sites → `DesignerWordPreview.vue` (`kind="form"` ×1) | Counts `=== 2` become `=== 1` in the child plus the "rendered twice" guard; VisitsTab half unchanged |
| `formDesignerPreviewModel.test.js` 216/217/219–225 | 2 | child (`v-for="(gv, gi) in groupsView"`); parent `:groups-view="renderGroupsView"` / `"designerRenderGroupsView"` | 209/213 stay |
| `formFieldPresentation.test.js` 310/321/398/409/435/449–454/530/531/533 | 2 | child template/CSS | 421/423/428/434/441/442/445 stay (wrappers); `landscape: designerLandscapeMode` → parent binding + child `landscape: landscapeMode` |
| `orderingStructure.test.js` 397–400 | 2 | child `getResizer('normal'…, scope)`; parent `scope="main"` / `scope="designer"` | 317/320/393 stay |
| `quickEditBehavior.test.js` 20/21 | 2 | child | 17/18/75–90 stay |
| `rowHeightResize.test.js` 185/207/208 | 2 | `previewComponents` list: replace `FormDesignerTab.vue` with `DesignerWordPreview.vue` | negative guards stay |

Policy: every assertion that fails after GREEN is either re-pointed to the file that now owns the text, or replaced
by an equivalent guarantee (§5.2). Deletion without a named replacement is not allowed. Weakening a pattern (for
example dropping a capture or a negative guard) is not allowed. The lead reviews this per assertion in the diff.

## 6. Verification design (R7)

### 6.1 QA harness (task-local, never committed with project code)

- Scripts in `research/qa/` of this task dir; run artifacts in `/tmp/designer-split-qa/<label>/`, where `<label>` is
  `baseline | step1 | step2 | final`.
- Dedicated ports: backend **8911**, chrome-headless-shell **9311**, own profile dir. Never touch 8888 (dev server),
  8902, 9222, or any process the harness did not start. Record own PIDs and stop only those.
- The backend runs from the task worktree, so it serves the worktree's `frontend/dist` (request-time static hosting:
  `npm run build` needs no restart). Env: `CRF_ENV=production`, DB/upload under `/tmp/designer-split-qa/`, random
  `CRF_AUTH_SECRET_KEY` and `CRF_ADMIN_BOOTSTRAP_PASSWORD` kept in a mode-600 file and never printed,
  `CRF_SERVER_PORT=8911`, `CRF_DISABLE_BACKGROUND_JOBS=1`, proxy variables unset.
- Seed: `seed_qa_db.py` builds a pristine `seed.db` once. It runs `init_db()`, then the seeding functions of
  `.trellis/tasks/archive/2026-10/10-08-export-layer-cleanup/research/export_golden_harness.py` (portrait, forced and
  mixed landscape, inline-only, log rows, labels, checkbox, choices, units, `_form` and field annotation offsets,
  visits), and creates a regular user that owns the project. Admins cannot reach the designer. Every run copies
  `seed.db` to a fresh run DB and restarts the backend, so runs are deterministic.
- Driver `qa_driver.mjs`: Node 24, zero dependencies, CDP over the built-in `WebSocket`. It opens its own page
  target, fixes the viewport (1600×1000, DPR 1), logs in through the API, sets the token in `localStorage`, and
  drives the real UI.

### 6.2 Captures per form (eCRF and aCRF, main canvas and fullscreen dialog)

- PNG screenshot clipped to the `.word-page` element. Comparison: byte equality first; if bytes differ, a pixel diff
  in the headless browser (canvas `getImageData`), reporting the differing-pixel count and bounding box.
- DOM fingerprint of the `.word-page` subtree: tag, class string, own text, rect rounded to 0.5px, and a fixed list
  of computed styles. Ignore `data-v-*`.
- Pseudo-state probes via `CSS.forcePseudoState`: annotation `:hover` → reset opacity (enabled 1 / disabled 0.45);
  `.resizer-handle::after` normal / `:hover` / `:active`; the `--interactive` cursor.
- Preview JSON `{forms:[{name,tables:[[[cell]]]}]}`. Annotation descendants (`.wp-acrf-annotation`) are excluded from
  cell text (cross-stack §6).
- Browser console errors and exceptions.

### 6.3 Behaviour checks (aCRF, complete edit mode; both previews unless noted)

1. Annotation drag: drag a field annotation and the form annotation by a fixed offset; the PATCH completes; after
   reload the offset is persisted with the expected `0.01cm` delta; reset restores it.
2. Dblclick on a field cell opens the quick-edit dialog.
3. Column resize: drag a handle; the `crf:designer:col-widths:…` key changes; the width round-trips main →
   fullscreen → main (state-management §4 rows 6–7).
4. Row resize: drag a row handle; the height style changes.
5. (baseline and final only) Codelist quick-add from the designer property editor: the new codelist is selectable
   immediately, without a reload (AC2).

### 6.4 Parity

Export via page-context `fetch('POST /api/projects/{id}/export/word', {annotated:false})`. Then run
`backend/scripts/compare_word_table_parity.py` with the venv, cwd `$WT/backend`. Required: `exact_cell_ratio == 1.0`
and `form_order_matches`. Order the preview JSON forms the way the export orders them. If that is impossible, report
per-form ratios; never use `--allow-mismatch` to hide a cell mismatch.

### 6.5 Acceptance per step

Baseline erratum (2026-10-11): the real-browser baseline is reproducible (24/24 screenshots byte-identical on two runs), but strict export parity is **73/79 cells = 0.9240506329**, with form order matching. Six pre-existing mismatches are outside this refactor: dropdown direction (1), empty-choice fallback (1, already noted in cross-stack §5), adaptive fill-line rounding (2), and the empty-form table (2). The user was told this limitation and asked to continue. Do not modify renderer/planner rules or use `--allow-mismatch` to make the baseline look green. Keep the complete comparator output, including its original non-zero exact-parity result, and require it to remain unchanged; the original 1.0 target is not achieved and must be reported explicitly.

Compared with `baseline`:

- 0 differing pixels in every screenshot;
- identical fingerprints, probes and preview JSON;
- parity report field-identical to the frozen baseline (no regression, **not** an exact-parity pass);
- identical behaviour-check outcomes;
- no new console errors.

The only declared non-visual change is `.unified-table-host`, which matches nothing. Any difference is a defect to
fix, not a baseline to update. Evidence retention: lossless PNGs stay under `/tmp`. JPEG copies of 8 representative
views (main/fullscreen × eCRF/aCRF × baseline/final) go to `research/qa/evidence/` (small, archived with the task).

### 6.6 Inventory errata (2026-10-12)

The initial annotation research miscounted the stylesheet as 11 rules. The measured source contains **9 rule blocks / 12 selectors**, including three two-selector blocks; all rule bodies and selectors migrate unchanged. The final annotation component is **133 lines** (138 was its first implementation before review corrections). Each old preview block has **25 scope substitutions in total: 24 `getResizer` calls and 1 `normalFillChars` call**. The two-argument `getRowResizer(kind, group)` callback remains unchanged and shares the parent-owned row cache. These counts supersede older planning counts; no new behavior or scope is authorized by this correction.

## 7. Steps and commits

| Step | Content | Commit (needs authorization) |
|---|---|---|
| 0 | Worktree, deps, baseline suites, QA harness, baseline evidence | — |
| 1 | R3 `DesignerAcrfAnnotation.vue` (16 sites), tests | `refactor(designer): 抽出 aCRF 注释标记组件` |
| 2 | R1 `DesignerWordPreview.vue` (2 sites), styles, tests | `refactor(designer): 两套 Word 预览模板合并为 DesignerWordPreview` |
| 3 | Docs sync (README pair if affected, module/root CLAUDE.md, index.json, changelog archive) | `docs(frontend): 同步设计器拆分文档` |
| 4 | Spec sync (`component-guidelines.md`, `cross-stack-contracts.md` §5/§6 file lists) | `docs(spec): …` (standalone `.trellis/` commit) |
| — | Merge to `main`, push, archive | each separately authorized; archive is its own `.trellis/` commit |

## 8. File scope

- New: `frontend/src/components/DesignerAcrfAnnotation.vue`, `frontend/src/components/DesignerWordPreview.vue`,
  `frontend/tests/component/DesignerAcrfAnnotation.spec.js`, `frontend/tests/component/DesignerWordPreview.spec.js`,
  `frontend/tests/designerPreviewSplit.test.js`.
- Modified: `frontend/src/components/FormDesignerTab.vue`, the 5 test files of §5.3 (Step 1 touches only
  `acrfViewToggle.test.js`), and the docs/spec files of §7.
- Forbidden without lead approval (stop and ask): any other `src/` file, `main.css`, composables, `VisitsTab.vue`,
  `App.vue`, `package.json` / lockfile, test infra (`vitest.config.js`, `tests/component/setup.js`), the backend.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Scoped-style loss (parent rules reach only the child root) | Move every rule in §2.3/§3.4; source guard; pixel + probe comparison |
| Template identifier missing in the child (silent in production) | Mount spec with full branch coverage under the warning gate; console capture in QA |
| Resizer cache ownership / rehydrate contract | Caches and `getResizer`/`getRowResizer` stay in the parent (function props); behaviour check 3 |
| `on`-prefixed function prop treated as a listener | Mount spec proves the call; fallback rename (§3.3) |
| CSS order between parent and child sheets changes the cascade | Moved rules keep specificity; pixel/probe diff catches order effects |
| Parity drift through `renderCellHtml` / `normalFillChars` adapters | Same closures by reference; parity 1.0 and preview-JSON identity |
| Unattributed edits from other sessions in the worktree | Reconcile `git status` against the step inventory before each commit (memory note `shared-worktree-injection-guard`) |

## 10. Rollback

Each step is one commit on `refactor/designer-split`; revert per commit. Before a commit, discard with
`git checkout -- <modified files>` and delete the step's new files. The QA harness and `/tmp` artifacts are outside
the repo.
