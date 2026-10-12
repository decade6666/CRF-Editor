# Planning notes — visits-preview-split (2026-10-11, pre-design)

Status: **UNBLOCKED 2026-10-12** — `designer-split` merged into `main` (`e317a2e`, pushed; archive `54fd5fa`,
journal `0d111a1`). Design work proceeds against `main` @ `0d111a1`. Original deferral rationale below kept for
history: write `design.md` / `implement.md` only after that merge, against the merged code. Everything below was
verified on `main` @ `6090a81`, and re-verified on `main` @ `dfb2007` (2026-10-11): `VisitsTab.vue` is
byte-unchanged since `6090a81` (`git diff --stat 6090a81..main -- frontend/src/components/VisitsTab.vue` → empty).
On `0d111a1` the file is still 1545 lines; the archive-line anchors below therefore remain exact.

## User decisions (2026-10-11)

- Order: `app-word-import-split` runs first; this task waits for `designer-split`.
- Fix the latent preview-data defect (F1) as part of the split, RED test first.
- Execution is delegated to Sonnet sub-agents; Opus plans and reviews.

## Re-baseline (main @ 6090a81)

- `frontend/src/components/VisitsTab.vue`: 1545 lines. Preview state 116–127, `writeStoredViewMode` 129,
  notes computeds 132–135, preview refresh inside `load()` 202–210, `onBeforeUnmount → annotationDrag.dispose()`
  214–216, project watcher preview cleanup 224–226, view-mode watchers 232–247, `toRendererField` /
  `escapePreviewText` 400–420, `createPreviewCellRenderers` 426–433, column ratios 442–459,
  **`mergeFormIntoState` 461–490**, `getFormStateById` / annotation helpers 492–585, column / fill / row-resize /
  render-group / landscape helpers 587–668, `openFormPreview` 670–693, `resetFormPreviewState` 695–710.
  Template: dialog 988–1451 (only entry: `openFormPreview(row)` at 967, visit-form table, flow/single view).
  `<style scoped>` 1454–1545 is entirely preview-owned (`.wp-form-title-row` + 11 `.wp-acrf-annotation*` rules).
- View-mode helpers 62–91 (`VIEW_MODE_STORAGE_KEY = 'crf_view_mode'`) and `viewMode` are preview-only.
- The four copies synced by `mergeFormIntoState`: `allForms` (GET `/api/projects/{pid}/forms`, full
  `FormResponse`), `visitForms` (derived from the matrix + `sequence`), `matrixData.forms`, `formPreviewForm`.
  Its only callers are the annotation drag's `applyOptimisticPositions` and `onPersisted`. None of the three
  list copies uses `annotation_positions`; they were synced only so a re-opened preview would see fresh positions.

## F1 — latent defect (confirmed by code trace)

- `GET /api/projects/{pid}/visit-form-matrix` returns `forms: [{id, name}]` only (`backend/src/routers/visits.py`,
  unchanged since the initial commit). `visitForms` rows are therefore `{id, name, sequence}`.
- `openFormPreview(row)` seeds `formPreviewForm = { ...row }`, `design_notes || ''`, `paper_orientation || 'auto'`.
  `getFormStateById` returns that copy first. Result when the preview opens:
  - design-notes aside never shows (`formPreviewDesignNotes` is only refreshed by `load()`);
  - explicit `landscape` / `portrait` orientation is ignored (always `auto`) — diverges from Word export;
  - the aCRF form-domain annotation is not rendered (no `domain`), so it cannot even be dragged;
  - persisted field-annotation offsets are not shown (default positions) until the first drag persists and
    `onPersisted` merges the full `FormResponse`.
- `load()` would refresh the copy from `allForms`, but it only runs on mount / project switch / `refreshKey`,
  which are unreachable while the modal preview is open.
- Fix direction (single source of truth): the dialog receives only `projectId` + `formId` and resolves the form
  from `api.cachedGet('/api/projects/{pid}/forms')` (same cache key as `allForms`; the annotation PATCH already
  invalidates it). `cachedGet` returns the cached object itself — never mutate it; every update builds a new object.

## Design direction (to confirm at design time)

- `VisitFormPreviewDialog.vue` with `v-model` (`modelValue` / `update:modelValue`, spec component-guidelines
  "Dialog v-model" + "Lazy-Mounted v-model Dialogs" — load watcher `immediate: true`), props `projectId`, `formId`.
  The parent keeps only `showFormPreview` + `previewFormId` and sets the id before opening.
- The dialog owns: one `form` ref (title / notes / orientation / domain / positions derived from it), fields,
  loading / error / request-sequence guard, `viewMode` (helpers moved verbatim; same key, same setup-time
  normalize + write, same `editMode` watcher), `useAcrfAnnotationDrag` (unchanged composable), the row-resizer
  cache (`useRowResize(formIdRef, …)`, same `crf:designer:row-heights:*` keys), all preview render helpers.
- Delete `mergeFormIntoState`, `getFormStateById`'s multi-copy lookup and the preview block of `load()`.
- Lifecycle to preserve: close (`@closed`) → cancel drag + flush pending + reset; project change → flush with
  `cancelActiveDrag: true`, close, reset; unmount → `dispose()`. Drain pending saves (`flushPending()`) at the
  start of each open, before fetching, so a quick close → reopen cannot read a pre-PATCH cache entry.
- `onError` → toast + the same two cache invalidations + reload the dialog's own form state (the parent lists
  hold no annotation data, so the parent `load()` call is no longer needed).
- Reuse `designer-split`'s `DesignerAcrfAnnotation.vue` for the 8 annotation sites (form ×1, field ×5,
  inline-header ×2 — same counts as the designer). Interface is frozen per the `crf-editor-da` peer note
  (2026-10-11, 「当前不扩展接口」): props `text` / `kind` (`form | field | inline-header`) / `interactive` /
  `hasOverride` / `annotationStyle`, emits `pointerdown` / `reset` — exactly what VisitsTab passes inline today.
  Its form-kind reset aria-label is `重置表单 domain 标注位置`; VisitsTab currently says `重置表单标注位置`.
  Verified: no test on `main` pins the old Visits text, so adoption is free — align with the designer (no new
  prop). Without this reuse the dialog is ~950 lines (> 800-line limit).
- `DesignerWordPreview.vue` (created by `designer-split`, 577 lines): decide explicitly whether the visit preview
  can reuse it. Its API is designer-specific (`selectedForm` / `groupsView` / `scope` + ~12 closure props from
  FormDesignerTab). Wait for the peer's markup-owner spec (announced 2026-10-11) before deciding; if not reused,
  state the reason in `design.md`.
- Import `Loading` from `@element-plus/icons-vue` explicitly: `main.js` registers no icons globally, so the
  current `<Loading />` in the preview does not resolve (spinner never renders) and the vitest Vue-warning gate
  would fail a mount test.
- `refreshKey`: `load()` currently refreshes the open preview's metadata on a `refreshKey` bump; decide whether the
  dialog injects `refreshKey` (effectively unreachable while the modal is open).

## Tests

- 18 test files read `VisitsTab.vue`. Six are also edited by `designer-split` (corrected from the branch diff):
  `acrfViewToggle`, `formDesignerPreviewModel`, `formFieldPresentation`, `orderingStructure`, `quickEditBehavior`,
  `rowHeightResize` — re-baseline them after the merge. The branch also adds `designerPreviewSplit.test.js` and
  `component/DesignerAcrfAnnotation.spec.js` / `component/DesignerWordPreview.spec.js`.
- AC2 regression: a mount test that opens the preview from a minimal `{id, name, sequence}` row and proves the
  dialog shows the authoritative form data (RED on the current code for notes / orientation / domain / offsets),
  shows the persisted update after a drag/reset PATCH and after close → reopen, and that the visit-form list's
  `sequence` column is unchanged. Plus source guards: no `mergeFormIntoState` / `formPreview*` /
  `useAcrfAnnotationDrag` left in `VisitsTab.vue`.

## Update — 2026-10-11 (after `app-word-import-split` merged)

- `app-word-import-split` is done: merged `d9056df`, archived `29ed958`, journal `dfb2007`, pushed to origin.
- `refactor/designer-split` now contains all of `main` (`b434ff0` 「同步主线导入向导拆分并复验设计器」) but is
  **still not merged into `main`**; the peer session (`crf-editor-da`) is awaiting merge authorization and will
  send the merge SHA when it lands. Start this task only after that SHA.
- Peer constraints recorded (from `crf-editor-da`, 2026-10-11): keep Visits' form-set merge / persistence
  semantics; `DesignerAcrfAnnotation` interface stays frozen; a `DesignerWordPreview` / `DesignerAcrfAnnotation`
  markup-owner spec will follow before/with the merge — read it at design time and align the reuse decision with
  it. VisitsTab also has no field-kind reset label of its own (`重置字段…`) — both kinds come from the shared
  component after reuse.
- Remaining roadmap after this task: `docs-sync` (last, after all code tasks).

## Design-time addenda — 2026-10-12 (main @ 0d111a1)

- Inventory after both prior splits: components 20, composables 35, tests 84 (73 node:test + `testProperty.js`
  + 10 vitest files under `tests/component/`). Component `.vue` count will go 20→21; test files 84→85 if one new
  node:test file + one new spec are added (target shape, confirm at design time).
- `DesignerWordPreview.vue` reuse decision (evidence gathered): its API is designer-bound — `scope` validator
  `main|designer`, 14 closure props owned by FormDesignerTab, and it wires **column** resizers (`getResizer`,
  `normalFillChars`) plus `openQuickEdit` / `snap-guide`. The visit preview dialog on `0d111a1` has **no column
  resizer handles and no dblclick quick-edit** (verified: zero `resizer-handle` / `snap-guide` / `dblclick` /
  `openQuickEdit` hits inside dialog lines 988–1452; only row-resize handles). Reusing it would force stubbing or
  dead props into Visits. Decision: Visits keeps its own dialog-local preview markup (moved verbatim); reuse is
  limited to `DesignerAcrfAnnotation.vue`. Revisit only if the peer's markup-owner spec says otherwise.
- F1 fix design: dialog resolves its own form from `cachedGet('/api/projects/{pid}/forms')` (same cache key as the
  VisitTab `allForms`; PATCH already invalidates it). `cachedGet` returns the cached object — every update must
  build a new object. Dialog PATCH `onPersisted` merges the returned `FormResponse` into the **dialog's own** form
  ref only; delete `mergeFormIntoState` / `getFormStateById` / `applyFormAnnotationPositions` entirely, and remove
  the preview refresh block from `load()` plus the preview cleanup in the projectId watcher / `onBeforeUnmount`.
  Out of scope but recorded: `allForms` will then keep stale `annotation_positions` until the next unrelated
  `load()`; the dialog (single source of truth) is always authoritative for annotation rendering.
- Method note for the executor: after `applyOptimisticPositions`/`onPersisted` the dialog may write only
  `annotation_positions` (and merge the PATCH `FormResponse` on persist) — never mutate the cached `allForms`
  object in place.
- `refreshKey` decision: the dialog mounts permanently (teleported `el-dialog` inside VisitsTab); `refreshKey`
  reload of an open preview is unreachable-ish but cheap to keep — decide at design time and state it.
- `Loading`/`View` icon imports: `main.js` registers no icons globally; `<Loading />` in the preview resolves only
  because `VisitsTab.vue` imports it from `@element-plus/icons-vue` — the new dialog must import every icon it uses
  (the vitest warning gate fails otherwise).
- `.wp-form-title-row` (the only other preview-only Visits style rule) must move with the dialog.
- `onError` path in `useAcrfAnnotationDrag` currently calls `void load()` (VisitsTab-wide reload). After the split
  the dialog has no `load()`; on PATCH failure it should toast + invalidate the two caches + reload its own form
  state. Keep `flushPending()` on close (`@closed`), and `cancelActiveDrag` + flush on project change.
- QA harness from `designer-split` (`research/qa/run_qa.sh`, `seed_qa_db.py`, `qa_driver.mjs`) is reusable in
  principle (currently hardcodes `/home/decade/CRF-Editor-designer-split` and fixed QA labels — needs retarget +
  labels; `/tmp/designer-split-qa/seed.db` + `secrets.env` still exist). Its seed does **not** set design_notes /
  paper_orientation / annotation_positions, so a visit-preview focused QA run needs seed additions or targeted
  probes. Decide at design time whether to build a thin `visits-preview-split` QA wrapper.
- Peer (crf-editor-da) constraints restated: keep Visits' form-set merge / persistence semantics; do not extend
  `DesignerAcrfAnnotation`'s interface; markup-owner spec for the designer components is now available at
  `.trellis/spec/frontend/component-guidelines.md` §"Stateless Word-Preview Extraction" (lines ~778–884) and
  cross-stack §5/§6 owner lists.

## Design correction — 2026-10-12 (supersedes two addendum lines above)

- `<Loading />` **is not** a global registration: `frontend/src/main.js` registers Element Plus only (no icons),
  and the designer-split archive's QA log in fact recorded a dev-only "Failed to resolve component: Loading"
  warning in the pre-split designer source. The planning-notes addendum line claiming "resolves only because
  VisitsTab imports it" and the implement.md line "depends on the full icon set" were both wrong; `design.md`
  D6 (§ the `Loading` defect) is authoritative: the import is genuinely missing, the spinner never rendered, and
  the split fixes it.
- `previewCellRender.test.js` counts: 12 tests, with VisitsTab line-pointer comments at L85 / L100 / L189 / L198 /
  L210 / L233 / L240 / L247 / L255 (the earlier note said "L7/67/189…" — the test-impact map's §11 list is
  authoritative).
