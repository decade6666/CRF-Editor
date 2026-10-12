# Design — visits-preview-split

PRD: `prd.md`. Shared execution runbook: `.trellis/tasks/10-08-review-remediation/implement.md` (§0–§8).
Planning notes: `research/planning-notes-2026-10-11.md` (+ design-time addenda 2026-10-12).
Test impact map (exhaustive, line-verified): `research/test-impact-map.md`.
Sibling precedent for this exact task shape: `.trellis/tasks/archive/2026-10/10-08-designer-split/` (`design.md`
§5.3 policy, `implement.md` execution-status table format).

Baseline: `main` @ `0d111a1` (2026-10-12, = origin/main; `designer-split` merged `e317a2e`, archived `54fd5fa`,
journal `0d111a1` — this task's declared prerequisite). All VisitsTab anchors below were re-verified read-only on
this commit by `research/test-impact-map.md`; `VisitsTab.vue` is 1545 lines.

## 0. Re-baseline

- Inventory @ `0d111a1`: components 20, composables 35, test/support files 84 (73 node:test `.test.js` +
  `testProperty.js` + 10 vitest files under `tests/component/` — 8 `.spec.js` + `setup.js` + `vueWarnGate.js`).
  Root `.claude/CLAUDE.md` and `frontend/.claude/CLAUDE.md` already match these counts (20/35/84).
- New files this task adds: `VisitFormPreviewDialog.vue` (components 20→21), `useVisitPreviewAnnotation.js`
  (composables 35→36, amendment A2), `tests/visitPreviewSplit.test.js` (node:test 73→74),
  `tests/component/VisitFormPreviewDialog.spec.js` and `tests/component/visitsPreviewIntegration.spec.js`
  (`.spec.js` 8→10; total files 84→87). No new dependency, no backend change.
- `VisitsTab.vue` current structure (verified anchors, `research/test-impact-map.md` §搬迁边界):
  viewMode helpers 62–91; annotation text helpers 93–102; preview state 115–135; `load()` preview-refresh block
  202–210; `onBeforeUnmount` 214–216 (single use: `annotationDrag.dispose()`); projectId-watcher preview cleanup
  224–226; viewMode/editMode watchers 232–247; `toRendererField`/`escapePreviewText` 400–420; cell-renderer adapter
  426–433; column/fill helpers 440–459 + 587–623; `mergeFormIntoState`/`getFormStateById` 461–501; annotation
  helpers 503–585; row-height helpers 625–639; render groups / view models / landscape 641–668; `openFormPreview` /
  `resetFormPreviewState` 670–710; preview button 967 (stays); dialog template 988–1451; `<style scoped>` 1454–1545.
- Import ownership (map §2): 30 preview-only identifiers (MOVE), 5 shared (`computed`, `watch`, `inject`,
  `ElMessage`, `api`), 14 stays. `main.js` registers Element Plus only — **no icons**; every component imports the
  icons it uses.
- Latent defect found during design-time research (fix rides with this split, see D7): template line 1005 uses
  `<el-icon class="is-loading"><Loading /></el-icon>` but line 8's icon import is
  `{ CircleClose, Delete, DocumentCopy, Plus, View }` — `Loading` is unresolved, so today the preview spinner never
  renders (and any mount test of this branch would fail the Vue-warning gate).

## 1. Target structure

```text
VisitsTab.vue                                     (1545 → 552 lines; split landed 2026-10-12)
├─ visits list / flow workspace / matrix / visit-form table   unchanged
├─ showFormPreview: ref(false)                    preview visibility (parent-owned)
├─ formPreviewFormId: ref(null)                   which form is previewing
├─ openFormPreview(row)                           form.id → set id, open (2 lines)
│    formPreviewFormId.value = form.id; showFormPreview.value = true
└─ <VisitFormPreviewDialog v-model="showFormPreview"
       :project-id="projectId" :form-id="formPreviewFormId" />   unconditional mount, old dialog position

VisitFormPreviewDialog.vue                        (new, 854 → ≈770 lines after amendment A2)
├─ props: modelValue (Boolean, required) / projectId (Number, required) / formId (Number, default null)
├─ emits: update:modelValue
├─ owns: viewMode (+ storage helpers, verbatim) / resolved form ref / fields / loading / error / request-seq
│        row-resizer cache (useRowResize per table instance) / all preview render helpers (moved verbatim)
│        the whole dialog template + the .wp-form-title-row CSS / the two annotation TEXT helpers
│        (getFieldOidAnnotationText / getFormDomainAnnotationText — kept top-level for compileFunction)
├─ annotation targets / style / drag glue via useVisitPreviewAnnotation.js   (amendment A2)
└─ reuses: DesignerAcrfAnnotation.vue (8 annotation sites; interface frozen, no new props)
```

Why a component and not component+composable: with `DesignerAcrfAnnotation` absorbing ~90 lines of inline
annotation markup + ~85 lines of annotation CSS, the dialog was expected to land inside the 800-line limit.
Measured at step 2: the first implementation reached **854 lines** (script 447 / template 398 / style 7) — the
design's escalation clause applied and the lead authorized amendment A2: the annotation target/style/drag glue
(~83 script lines) moves to `frontend/src/composables/useVisitPreviewAnnotation.js`, a per-invocation factory
wrapping `useAcrfAnnotationDrag`; the two annotation *text* helpers stay in the component (template v-ifs and the
`acrfViewToggle` `compileFunction` extractor read them there). Everything else stays as designed.

## 2. Binding decisions (D1–D9)

### D1 — `VisitFormPreviewDialog.vue` contract

- Props `modelValue` (Boolean, required), `projectId` (Number, required), `formId` (Number, default `null`).
  Emits only `update:modelValue`. No `defineExpose`, no defineProps beyond these three.
- `<el-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" width="90%"
  style="max-width:1200px" top="5vh" :close-on-click-modal="false" @closed="resetPreviewState">`. Do NOT forward
  `@close` (Element Plus 2.13.2 fires `close` in `beforeLeave`, `update:modelValue(false)` in `afterLeave`; the
  current code reacts only to the post-transition path). `@closed` keeps today's reset semantics.
- Mount is unconditional at the old dialog position; therefore `viewMode`'s setup-time init + storage write keep
  today's timing (VisitsTab mount, not first open). The `modelValue` load watcher still uses `{ immediate: true }`
  per `component-guidelines.md` "Lazy-Mounted v-model Dialogs" so a mount-with-open works and the mount spec can
  exercise it.
- Parent API surface stays exactly: `showFormPreview` + `formPreviewFormId` refs and `openFormPreview(row)`.
  `openFormPreview` only sets the id and opens; it does not seed title/notes/orientation (deleted with F1).

### D2 — F1: authoritative form resolution (the RED-first fix)

- On open (`modelValue → true` with a non-null `formId`), the dialog: (1) `await flushPending()` — drain any
  annotation PATCH queued by a just-closed session, so a close→instant-reopen can never read a pre-PATCH cache
  entry; (2) `const forms = await api.cachedGet('/api/projects/${projectId}/forms')` — the byte-identical cache key
  VisitsTab's `load()` uses (PATCH invalidation already covers it); (3) `form = { ...foundForm }` (shallow clone —
  `cachedGet` returns the cached object itself, never mutate it); title derives as `form?.name || '表单预览'`;
  (4) `fields = await api.cachedGet('/api/forms/${formId}/fields')` (unchanged URL), guarded by one request-seq
  counter covering both awaits.
- Because the resolved object is the full `FormResponse` (`backend/src/schemas/form.py:123–134`: name, code,
  domain, design_notes, annotation_positions, paper_orientation), all four F1 symptoms fix structurally:
  design-notes aside renders, explicit landscape/portrait orientation honored, form-domain annotation renders and
  is draggable, persisted field offsets apply.
- Failure handling: forms-list fetch rejection → `ElMessage.error('加载表单信息失败：' + msg)` + error state; id not
  found in the list → error state `表单不存在` (no toast); fields fetch rejection keeps today's exact message
  (`加载表单字段失败：` + fallback `未知错误`) + toast. A stale response (seq mismatch) writes nothing.
- `onPersisted(updatedForm)` (drag save response): merge into the dialog's own form ref as a new object
  (`form = { ...form, ...updatedForm }`); the composable already invalidates
  `/api/forms/{id}/fields` + `/api/projects/{pid}/forms` on the PATCH. `onError`: keep today's toast + the same two
  invalidations, then **re-resolve the dialog's own form state** (re-run the D2 load for the current id) instead of
  the old `void load()` — VisitsTab's `load()` no longer participates.

### D3 — moved-verbatim script + viewMode ownership

- Move verbatim into the dialog: `VIEW_MODE_STORAGE_KEY`, `normalizeStoredViewMode`, `readStoredViewMode`,
  `writeStoredViewMode`, `resolveInitialViewMode` — kept as **top-level `function` declarations** (the
  `acrfViewToggle` test extracts them by name via `compileFunction`); `viewMode` ref + setup-time
  `writeStoredViewMode(viewMode.value)`; the viewMode/editMode watchers (232–247); `showAcrfAnnotations` computed;
  annotation text helpers (`getFieldOidAnnotationText`, `getFormDomainAnnotationText`); `toRendererField`,
  `escapePreviewText`; the `createPreviewCellRenderers` adapter (same `toRendererField(ff.field_definition)` input,
  `getScopedDefaultValue(ff, false)` cell policy, `renderCtrlTextHtml` fallback, host-groups/paper-orientation
  closures rebased onto the dialog's own refs); column/fill helpers (`resolveInlineColRatios`,
  `resolveNormalColRatios`, `getPreviewColumnFractions`, `normalColumnCm`, `normalFillChars`); row-height helpers
  (`getPreviewRowResizer` cache, `getPreviewRowHeightStyle`); render-group/view-model/landscape computeds
  (`previewRenderGroups`, `previewModelHelpers`, `previewGroupsView`, `previewNeedsLandscape`,
  `resolvePreviewLandscape`, `previewLandscapeMode`); `openFormPreview`/`resetFormPreviewState` become the dialog's
  load/reset internals; the dialog template 988–1451 and the `.wp-form-title-row` style rule.
- `editMode` stays `inject('editMode', ref(false))` inside the dialog (render context preserved).
- `formId` reaches `useRowResize` as `toRef(props, 'formId')`; the per-table-instance resizer cache Map stays in
  the dialog and is cleared on reset (today's `previewRowResizerCache.clear()`).
- Keep the template call shapes the source guards pin: `renderCellHtml(ff, normalFillChars(gv, gi))`,
  `:class="['word-page', 'word-page--a4', …]"` adjacency, `v-for="(gv, gi) in previewGroupsView"` with
  `seg.mergeSpans[idx]/[ci]` + `labelValueSpans`, and no direct `buildFormDesignerUnifiedSegments` /
  `computeMergeSpans` / `computeLabelValueSpans` / `getInlineRows` calls in the template.

### D4 — annotation layer: reuse `DesignerAcrfAnnotation.vue`

- Replace the 8 inline `<span class="wp-acrf-annotation …">` sites (1 form + 5 field + 2 inline-header; verified
  counts) with `<DesignerAcrfAnnotation>` exactly as `DesignerWordPreview.vue` wires it: `kind="form" | "field" |
  "inline-header"`, `:text`, `:interactive="isAnnotationDraggable(target)"`,
  `:has-override="hasAnnotationOverrideForTarget(target)"`, `:annotation-style="getAnnotationStyle(text, ANNOTATION_KIND_*, target)"`,
  `@pointerdown="(event) => onAnnotationPointerDown(target, event)"`, `@reset="resetAnnotationPosition(target)"`.
- The interface is frozen per the peer session's constraint (props `text`/`kind`/`interactive`/`hasOverride`/
  `annotationStyle`; emits `pointerdown`/`reset`; presentational only). Do not extend it, do not add a target prop.
- Delete VisitsTab's annotation CSS copy (1454–1545 block, minus the kept `.wp-form-title-row` rule) — the rules
  now live in the shared component. Declared user-visible diff: the form-kind reset button's aria-label becomes
  `重置表单 domain 标注位置` (designer wording); the field-kind label `重置字段标注位置` is unchanged. Verified: no
  test on `main` pins the old Visits wording.

### D5 — lifecycle

| Event | Today | After |
|---|---|---|
| Open | seed state synchronously → fields fetch | flushPending → resolve form (D2) → fields fetch, seq-guarded |
| Close (`@closed`) | cancel drag + flush + reset state + clear row cache | identical, inside the dialog |
| Project switch | parent watcher: await flush(cancel), close, reset(skip cleanup) | parent watcher closes the dialog (`showFormPreview=false`, `formPreviewFormId=null`); the dialog watches `projectId` → `flushAnnotationPositionSave({ cancelActiveDrag: true })` (snapshot carries old projectId+formId, so the PATCH still targets the right form) |
| VisitsTab unmount | `annotationDrag.dispose()` | dialog `onBeforeUnmount` → `dispose()` (cancel + flush); `dispose()` semantics unchanged |

- Delete `mergeFormIntoState`, `getFormStateById`, `applyFormAnnotationPositions`, the preview-refresh block in
  `load()` (202–210), the project-watcher preview lines 224–226, VisitsTab's `onBeforeUnmount` (its only use was
  the drag instance), all moved script blocks, the dialog template, the moved CSS, and now-unused imports
  (map §2 MOVE list).
- Visit-form collection semantics are untouched: `syncVisitForms`, `visitForms`, `matrixData`, sequence handling,
  matrix toggling, and the PATCH endpoint/body/debounce are unchanged. Only the annotation write-back into the
  four parent copies disappears (it existed only to freshen a re-opened preview; the dialog now re-reads the
  invalidated cache itself). Accepted residual: parent `allForms` keeps stale `annotation_positions` until the next
  unrelated `load()`; nothing renders them.
- `refreshKey` (D8): the dialog does NOT inject it. While the modal is open, a refreshKey bump cannot originate
  from the same user session (the modal blocks the page); the open-time `cachedGet` + PATCH invalidation chain is
  the freshness mechanism. Record this as a decision, not an omission.

### D6 — `Loading` icon defect (rides with the split)

- The dialog imports every icon it renders: `import { Loading } from '@element-plus/icons-vue'`. Today's
  unresolved `<Loading />` never rendered its spinner; after the move it resolves (and the mount spec's
  loading-branch case proves it under the warning gate). Declared user-visible fix. VisitsTab line 8's import list
  loses nothing (it never imported `Loading`).

### D7 — docs/spec truthfulness note

- `frontend/.claude/CLAUDE.md` claims `main.js` registers "the full icon set" — false. The split's doc step
  corrects this line (and any identical wording elsewhere) while updating the component inventory; no behavior
  change.

### D8 — declared behavior changes (complete list)

1. F1 fixes: preview shows design notes, honors explicit paper orientation, renders/drags the form-domain
   annotation, and shows persisted field-annotation offsets on first open (no longer requiring a drag).
2. Close→instant-reopen can no longer show pre-PATCH stale offsets (flush-before-open ordering).
3. Form-kind annotation reset aria-label becomes the designer's `重置表单 domain 标注位置`.
4. The preview "加载中..." spinner icon actually renders (`Loading` import fix).
Everything else — title fallback text, error messages, view-mode persistence key/behavior, drag geometry,
debounce, PATCH shape, row/column-width storage keys, table geometry, visit/visit-form behavior — is unchanged.
Any additional difference found during verification is a defect, not a declaration.

### D9 — non-goals / explicit exclusions

- No reuse of `DesignerWordPreview.vue`: its markup is designer-specific (`scope` main/designer, scaled-word-page
  classes, column resizers, quick-edit dblclick, `snap-guide`) while the visit preview renders the plain
  `word-page--a4` page without column resizers or quick edit — verified zero `resizer-handle` / `snap-guide` /
  `dblclick` / `openQuickEdit` occurrences inside the dialog block. Reusing it would require dead or stubbed
  props. Revisit only on explicit lead instruction.
- No `FormDesignerTab.vue` change; no new composable; no `main.css` change; no backend, API, schema, or dependency
  change; no `useApi.js` change (no bare fetch sites are added — the dialog uses `api` only).
- `previewCellRender.test.js`'s inline "VisitsTab :line" comments become stale pointers; updating them is allowed
  (comments only) but no assertion there changes.

## 3. Test plan

### 3.1 F1 RED evidence (before any production edit) — executed 2026-10-12, amended per A1

The probe was written and run on `0d111a1`: `frontend/tests/component/visitsPreviewF1Probe.spec.js` (245 lines),
full output captured in `research/f1-red-evidence-2026-10-12.txt` (4 failed / 4, all four F1 symptoms, exit 1).
Probe mount path (deviation from this design's first draft, verified against the code): the 预览 button only
exists in `workspace="flow"` → 列表 (single) view, so the probe mounts `VisitsTab` with `workspace: 'flow'`,
toggles the flow switch to single, clicks the visit row, then the `aria-label="预览"` button. `sortablejs` is
mocked as `{ default: { create: () => ({ destroy() {} }) } }` (that is the actual call shape). The run also
captured the D6 `Loading` warnings ("Failed to resolve component: Loading" ×5) — confirming the import defect.

**Amendment A1 (2026-10-12):** the probe is RETAINED as a permanent integration spec,
`frontend/tests/component/visitsPreviewIntegration.spec.js` (rename + header comment rewrite only; assertions
stay). Rationale: it is the repository's first and only VisitsTab mount test, it pins the whole user path
(flow→single→row→preview) that F1 broke in production, and it is a genuine RED→GREEN acceptance test for this
split (the same four assertions must pass after the fix). The earlier "delete before commit" instruction is
superseded. The dialog spec (`§3.2`) keeps its own focused cases mounted at dialog level; the integration spec
adds parent-wiring coverage, not a duplicate.

Bounded fallback (no longer needed) and mutation checks live in `design.md` §3.4; the probe's four assertions
are the integration spec's four cases, so mutation (b) (row data instead of authoritative form) kills them.

### 3.2 New tests

`frontend/tests/component/visitsPreviewIntegration.spec.js` (per A1 — the retained F1 probe: real `VisitsTab`,
flow→single→row→preview path, four F1 acceptance assertions, `sortablejs` mocked). This file is the RED→GREEN
witness for D8.1; it must not be deleted.

`frontend/tests/component/VisitFormPreviewDialog.spec.js` (vitest, dialog-level focused cases; spy on the real
`api` object before mount):
1. Mounted already open (`modelValue: true`, `formId` set): resolves the form from
   `cachedGet('/api/projects/{pid}/forms')` (spy — assert the exact URL), fetches fields, renders the title from
   the resolved name; loading branch renders `<Loading>` (warning gate proves resolution).
2. F1 matrix (RED-re-homed): full-authority form object → notes aside visible with content; `landscape` →
   `.word-page` landscape class, `portrait` → none, `auto` → planner-driven; aCRF mode (editMode true +
   viewMode aCRF) renders the form-domain annotation text and field OID annotations; a preset
   `annotation_positions` offset is applied to the annotation style (differs from default; equals the expected
   EMU-derived top).
3. Drag → PATCH: pointerdown/pointermove/pointerup on a field annotation (fake timers past the 220ms debounce)
   asserts `api.patch('/api/forms/{id}', { annotation_positions })` and both cache invalidations through
   `useAcrfAnnotationDrag`; PATCH rejection → toast + both invalidations + dialog re-resolves its own form state
   (cachedGet called again) and shows the persisted value.
4. Close → reopen: after close (`update:modelValue` emitted / `@closed` reset), re-open with the forms list now
   returning updated positions → the new offset renders (no stale state).
5. Close→instant-reopen ordering: a queued drag PATCH is flushed before the reopen's forms fetch
   (`invocationCallOrder` or deferred-promise staging), so the pre-PATCH entry is never read.
6. eCRF / editMode-false renders zero annotation spans; `update:modelValue` emitted once on close path.
7. Resolution failure and not-found paths show the specified error states; fields-failure keeps the exact
   `加载表单字段失败：` message + toast.
8. `@closed` reset: row-resizer cache cleared, state reset — reopen after close re-fetches (cachedGet count).

`frontend/tests/visitPreviewSplit.test.js` (node:test source guards, designer-split style):
parent/child wiring inside their own tags (`<VisitFormPreviewDialog` with `v-model="showFormPreview"` +
`:project-id` + `:form-id`, exactly one instance); VisitsTab negative list (no `wp-acrf-annotation`,
`annotationDrag`, `mergeFormIntoState`, `getFormStateById`, `formPreviewForm`, `formPreviewTitle`, `viewMode`,
`VIEW_MODE_STORAGE_KEY`, `useAcrfAnnotationDrag`, `resetFormPreviewState`, `word-page`, `设计备注`); dialog owns
the moved selectors (`.wp-form-title-row`) and imports `Loading` + `DesignerAcrfAnnotation` (8 call sites);
dialog template keeps the pinned call shapes (`renderCellHtml(ff, normalFillChars(gv, gi))`,
`'word-page', 'word-page--a4'` adjacency, `v-for="(gv, gi) in previewGroupsView"`, no template-level segment
rebuilds); neither new file contains a bare `fetch(`.

### 3.3 Re-pointing existing assertions (per `research/test-impact-map.md` §1)

17 MOVE blocks across 8 files + 1 DELETE/REPLACE block. Policy (designer-split §5.3): every failing assertion is
either re-pointed to the file that now owns the text/behavior or replaced by an equivalent guarantee; deleting
without a named replacement, or weakening a pattern, is forbidden. Highlights:

| File | Action |
|---|---|
| `acrfViewToggle.test.js` 138 test | re-point to dialog source (four helpers stay top-level `function`s; `compileFunction` keeps working); 193–199 switch/template assertions → dialog |
| `acrfViewToggle.test.js` 242 / 329 tests | re-point annotation markup/CSS assertions per site; the 357–381 loop's VisitsTab arm is **deleted** — replacement: its DesignerAcrfAnnotation arm already asserts the same rule bodies, plus the new negative guard that the dialog holds no annotation CSS |
| `acrfViewToggle.test.js` 405 test | **DELETE/REPLACE**: replacement = dialog-spec case 3 (PATCH response merge + both invalidations, behavior) and the new negative guard (no `mergeFormIntoState`; the dialog never writes parent collections) |
| `checkboxFieldType.test.js` 118–121 | `toRendererField` assertions → dialog |
| `columnWidthPlanning.test.js` 227/229, 803–807, 811–815, 848–852, 1098–1102 | → dialog source (do not reduce to import-only assertions) |
| `formDesignerPreviewModel.test.js` 262 (rename) | whole test → dialog; keep the four negative guards |
| `formFieldPresentation.test.js` 328/331, 405–410, 443 | → dialog |
| `rowHeightResize.test.js` entry 187 | replace the VisitsTab entry with `['VisitFormPreviewDialog', '../src/components/VisitFormPreviewDialog.vue']` once the file exists (never both) |
| `visitFlowWorkspace.test.js` 139 test | rewrite: parent renders `<VisitFormPreviewDialog v-model="showFormPreview" …>`; `openFormPreview` stays; `annotationDrag` assertion moves to the dialog source guard |
| `wordPageGeometry.test.js` 165–169 | source match → dialog |

Pure STAYS (do not touch): `appTabLazyLoad`, `editModeHiddenIdentifiers`, `listActionsIconify`,
`orderingStructure`, `ordinalQuickEditWiring`, `previewCellRender` (comments only), `projectDeleteConfirmation`,
`searchRankingWiring`, `tableHeaderStyle`, `toolbarPaneAlignment`.

### 3.4 Mutation checks (evidence, recorded in verification.md)

Prove the new guards bite: (a) remove `flushPending` from the open path → case 5 fails; (b) swap the resolved
`{ ...foundForm }` for the raw row data → F1 matrix fails; (c) drop one `DesignerAcrfAnnotation` site → the 8-site
guard fails; (d) remove the `Loading` import → warning-gate case 1 fails; (e) make the dialog write
`annotation_positions` back into a cached object → ordering/immutability case fails (mutating the spy's return
value must be detectable via the unchanged underlying fixture).

**Amendment A3 (2026-10-12, review round 2):** independent review found that `useVisitPreviewAnnotation` captured
`props.projectId` by value while `formId` was a ref; after an in-place project switch (App.vue reassigns
`selectedProject` without remounting VisitsTab) targets carried the old project id and the drag PATCH invalidated
the wrong project's forms cache — a regression against the pre-split code, which read `props.projectId` per call.
Fixed: the dialog now passes `projectId: toRef(props, 'projectId')` and the glue resolves `currentProjectId()` at
target-construction time (both target builders). Two lifecycle guards were added to the dialog spec (project-switch
flush of a queued PATCH; unmount → queued PATCH still sent) per the same review. Declared residual (recorded, not
fixed): single-point cache aliasing (dropping the `{ ...foundForm }` clone alone, or rewriting `onPersisted` in
place alone) has no observable difference today; only the combination is reachable and mutation (e) catches it.

## 4. Verification design

- Suites on the task branch: `node --test tests/*.test.js`, `npx vitest run`, `npm run lint` (0 errors, warning
  count ≤ baseline), `npm run build`, and one backend `pytest -q` sanity run at final (frontend-only diff;
  baseline 1210 passed). New files must pass `npx prettier --check`; existing files are hand-edited, never
  reformatted (`npm run format` forbidden — the designer-split formatting rule).
- Browser QA (task-local harness under `research/qa-visits/`, modeled on the archived designer-split harness;
  reuse `/tmp/designer-split-qa/secrets.env` + `seed.db` if present — do NOT mint new credentials without asking
  the user; chrome-headless-shell path as recorded there): seed adds a visit containing seeded forms, plus
  `design_notes`, `paper_orientation='landscape'` on one form, and preset `annotation_positions`.
  Runs: **baseline** (main build) and **final** (branch build) with the same seed: visit page → select visit →
  open preview in eCRF and aCRF, toggle switch, drag a field annotation and reopen, open the landscape form and
  the notes form. Acceptance: every pixel difference between baseline and final maps to a declared D8 change
  (F1 surfaces differ as expected; unaffected surfaces byte-identical); zero console errors; eCRF/aCRF and
  annotation PATCH observed in the network log.
- Not-run scope (record, don't hide): frontend coverage (no provider installed), backend changes (none), and any
  browser step blocked by environment limits.

## 5. Steps and commits (each commit needs separate user authorization)

| Step | Content | Commit message |
|---|---|---|
| 0 | `task.py start` + `set-branch`, worktree `git worktree add /home/decade/CRF-Editor-visits-preview-split -b refactor/visits-preview-split main`; `npm ci` if needed; baseline suites + QA baseline run | — |
| 1 | F1 probe RED evidence (temporary spec, run + record, delete) | — |
| 2 | `VisitFormPreviewDialog.vue` + VisitsTab extraction + `DesignerAcrfAnnotation` reuse + D6/D7 fixes + all test moves | `refactor(frontend): 访视表单预览弹窗拆分并修复预览数据来源` |
| 3 | New tests green + re-points + mutation checks + QA final run | (fold into step 2 unless the lead splits it) |
| 4 | Docs sync (README pair if affected, module/root CLAUDE.md counts, `.claude/index.json`, changelog archive) | `docs(frontend): 同步访视预览拆分文档` |
| 5 | Spec sync (`component-guidelines.md` new scenario, `cross-stack-contracts.md` §5/§6 file lists) | `docs(spec): …` (standalone `.trellis/` commit) |
| — | Merge to `main`, push, archive + journal | each separately authorized; archive is its own `.trellis/` commit |

## 6. File scope

- New: `frontend/src/components/VisitFormPreviewDialog.vue`,
  `frontend/src/composables/useVisitPreviewAnnotation.js` (A2), `frontend/tests/visitPreviewSplit.test.js`,
  `frontend/tests/component/VisitFormPreviewDialog.spec.js`, and
  `frontend/tests/component/visitsPreviewIntegration.spec.js` (the retained F1 probe, renamed).
- Modified: `frontend/src/components/VisitsTab.vue`, the 8 test files of §3.3, the docs/spec files of §5.
- Forbidden without lead approval (stop and ask): any other `src/` file (`FormDesignerTab.vue`,
  `DesignerWordPreview.vue`, `DesignerAcrfAnnotation.vue`, `main.css`, composables, `App.vue`, `useApi.js`),
  `package.json` / lockfile, test infra (`vitest.config.js`, `tests/component/setup.js`, `vueWarnGate.js`), the
  backend.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Cached-object mutation (`cachedGet` returns the cache entry itself) | D2 shallow clone; mutation check 3.4(e) |
| Mounting VisitsTab in the F1 probe is infeasible (SortableJS/happy-dom) | Bounded fallback in §3.1 with mandatory lead escalation + recorded limitation |
| Scoped-CSS loss (annotation rules moved to the shared component) | `acrfViewToggle` 357–381 arm + new negative guard; QA pixel comparison |
| Row-resize cache identity across opens | Keep the Map + `useRowResize(formIdRef, …)` verbatim; case 8 asserts re-fetch after close |
| Project-switch flush timing changes | Dialog-side `projectId` watcher replicates today's cancel+flush order; snapshot keying keeps the PATCH target correct |
| Test re-points weaken guards (drop captures / negative branches) | §3.3 policy; lead reviews each re-point in the diff; mutation checks |
| Peer-session edits in the shared worktree | Reconcile `git status` against the step inventory before each commit (memory `shared-worktree-injection-guard`) |

## 8. Rollback

Two commits on the task branch (step 1 deletes its own probe; step 2 is the extraction + fixes). Revert per
commit; before a commit, discard with `git checkout -- <modified files>` and delete the new files. QA artifacts
live outside the repo.
