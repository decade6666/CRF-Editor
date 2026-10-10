# Design — shared-rule-convergence

> Evidence re-verified against main @ `a4431b0` on 2026-10-09. Line numbers below are current-main values.
> Scope guard: pure-logic extraction + one declared bug fix (R2) + one shared dialog (R3) + storage-key
> centralization (R4) + one cross-stack consistency test (R5) + bounded test conversions (R6).
> No planner constant changes, no aCRF geometry changes, no designer template/state split, no new dependencies.

## 1. Boundaries

| In scope | Out of scope |
|---|---|
| New `frontend/src/composables/previewCellRender.js` (pure preview helpers) | Splitting `FormDesignerTab.vue` template/state (`designer-split` owns that) |
| New `frontend/src/components/CodelistQuickEditDialog.vue` (shared codelist quick add/edit) | Designer units quick-add (`FormDesignerTab.vue:3087-3095`) — codelist only |
| Column-width key build/parse/validate/migrate centralized in `useColumnResize.js` | Width-planning algorithm / shared constants (`WEIGHT_CHINESE` etc.) |
| Backend consistency test parsing `acrfAnnotationGeometry.js` | aCRF geometry behavior, `annotation_positions` storage shape |
| Converting text tests of the affected modules to behavioral tests | Repo-wide text-test cleanup (51 files currently use readFileSync on src/; only affected modules) |
| `useApi.js` refresh-rule usage at the two call sites | `useApi.js` internals (session-token guard is contract §3 — untouched) |
| R8 user-approved horizontal choice spacing (`useCRFRenderer.js` + `.word-page` choice CSS for structured and inline fallback rendering) | Backend export logic (already emits the required two ASCII spaces; no backend production edit) |


**Parallel-wave overlap (Wave C/D, coordinated by message — replaces the earlier "no overlap" claim).**
SRC branches from main at start time (`f68ebe1` at planning time). `legacy-cleanup` (LC) is being
implemented CONCURRENTLY on `refactor/legacy-cleanup` from the same base; `backend-format` (BF,
ruff) and `export-layer-cleanup` (ELC) may land while SRC is open.

- SRC must NOT touch these LC hunks (anchors at `f68ebe1`; LC deletes the perf code — leave it
  exactly as-is): `App.vue` — `usePerfBaseline` import :41, `clearPerfEvents()` :74,
  `markPerfStart/End` :147/:149, the `firstActivation` block in `onMainTabChange` :241-249;
  `FormDesignerTab.vue` — perf import :105, `recordPerfEvent` in `onDrop` :1238-1244 /
  `openQuickEdit` :1928-1934 / `toggleInline` :2011-2017, `eventName` + `markPerfStart/End` around
  the form-switch guard chain :1872/:1873/:1909, the `markPerf` pair in `openDesigner` :3274-3285.
- LC edited `frontend/src/styles/main.css` (dead CSS), now merged to main at `f56a92d`; its deletion hunks must remain intact.
  R8 is an explicit user-approved exception to the original no-global-style constraint: SRC changes
  ONLY the `.word-page .choice-group` and `.word-page .choice-text` rules plus the vertical group's
  explicit `white-space: normal`; horizontal paths use `white-space: pre-wrap` and `word-spacing: normal`
  to preserve the two breakable spaces without extra spacing. Another peer's reference-delete-guard
  branch appends an independent global dialog-class block at EOF; do not remove or rewrite it during
  later main synchronization.
  `frontend/.claude/CLAUDE.md` conflicts are resolved at merge.
- Merge rule: whoever merges second merges main into its branch and resolves conflicts (expect
  import-block conflicts in `App.vue` / `FormDesignerTab.vue`), then re-runs ALL Step 6 gates. The
  coordinator performs merges after user authorization; the executor stays strictly inside the §8
  file list and stops and asks before touching any other file.
- BF/ELC overlap is avoided by construction: the R5 consistency test lives in a NEW standalone file
  `backend/tests/test_acrf_offset_consistency.py` (zero textual overlap with BF-reformatted /
  ELC-rewritten `test_export_acrf.py`).

## 2. Module design

### 2.1 `previewCellRender.js` — shared preview cell helpers (R1, R2)

Pure, stateless; follows the `searchRanking.js`-style no-`use`-prefix rule for helper modules
(`.trellis/spec/frontend/hook-guidelines.md` → "Pure Helper Modules"). It **imports** from
`useCRFRenderer.js` (`renderCtrlHtml`, `renderCtrlTextHtml`, `toHtml`, `normalizeDefaultValue`,
`isDefaultValueSupported`, `planInlineColumnFractions`, `computeFillLineCharCount`) and
`visitPreviewLandscape.js` (`resolveInlineTableAvailableCm`) — zero algorithm copies.

```js
// exported API (final names may be adjusted at implementation time, but signatures are fixed)
export function computeMergeSpans(N, M)                 // byte-identical in all 3 copies today
export function computeLabelValueSpans(N)               // byte-identical in all three copies today
export function getScopedDefaultValue(ff, singleLine = false)
  // = today's FormDesignerTab:1381 / VisitsTab:418 body (identical), moved verbatim.
  // ADOPTED BY FD/VT ONLY — TP keeps its own predicates via the two value adapters below
  // (conservative: no unification by reachability arguments).

export function createPreviewCellRenderers(adapters)
// returns { renderCellHtml, getInlineRows, getInlineColumnCms, getInlineFillChars }
// adapters (all plain functions resolved per call, so refs/computed can be read at call time):
//   toRendererField(ff) -> flat renderer field | null   // FD: getPreviewField; VT: toRendererField; TP: ff => ff
//   getCellValue(ff) -> '' | raw default string         // CELL default policy — FD/VT: getScopedDefaultValue(ff, false);
//                                                       //   TP: its renderCellHtml:295 predicate verbatim (type from
//                                                       //   field_definition?.field_type, inlineMark hardcoded false)
//   getInlineValue(ff) -> '' | raw default string       // INLINE default policy — FD/VT: getScopedDefaultValue(ff)
//                                                       //   (inline_mark-aware); TP: its getInlineRows:219 predicate
//                                                       //   verbatim (hardcoded true + `|| ff.field_type` flat fallback)
//   renderFallback(field, fillChars) -> html            // default-branch row fallback: FD/VT: renderCtrlTextHtml; TP: renderCtrlHtml
//   resolveHostGroups(fields) -> groups                 // FD: resolveInlineHostGroups (KEPT in component); VT/TP: () => previewRenderGroups.value
//   getPaperOrientation() -> 'auto' | 'portrait' | 'landscape'
```

`renderCellHtml(ff, fillLineChars)` (bound):

```
if (!ff?.field_definition) return '<span class="fill-line"></span>'   // exact current guard on all three
dv = getCellValue(ff)                  // per-component cell policy
if (dv) return toHtml(dv)              // toHtml escapes + converts \n to <br> + fill-line spans
return renderCtrlHtml(toRendererField(ff), fillLineChars)
```

`getInlineRows(fields, fillCharsByCol)` (bound) keeps the invariant core (escape → trim trailing
empty lines → `repeat`/`fallback`/`maxRows` selection) and delegates the default policy to
`getInlineValue` and the fallback renderer to `renderFallback`.

Component wiring — **per-symbol deletion only** (never line-range):
- `FormDesignerTab.vue`: delete the local `getScopedDefaultValue` / `renderCellHtml` /
  `getInlineRows` / `getInlineColumnCms` / `getInlineFillChars` / `computeMergeSpans` /
  `computeLabelValueSpans` symbols. **KEEP** `getPreviewField`, `normalColumnCm` / `normalFillChars`
  (:1397-1411) and `resolveInlineHostGroups` (:1437-1443) — the latter becomes the
  `resolveHostGroups` adapter. Bind `getCellValue = ff => getScopedDefaultValue(ff, false)`,
  `getInlineValue = ff => getScopedDefaultValue(ff)`.
- `VisitsTab.vue`: delete the same symbol set (keep `escapePreviewText` — still used at `:130` for
  design notes); bind `getCellValue = ff => getScopedDefaultValue(ff, false)` — **this binding is
  the R2 fix** (today's cell branch passes `true`); `getInlineValue = ff =>
  getScopedDefaultValue(ff)`.
- `TemplatePreviewDialog.vue`: delete the same symbol set; bind `toRendererField: ff => ff`,
  `getCellValue` / `getInlineValue` as TP's two current predicates verbatim (see adapter table),
  `renderFallback: (ff, fillChars) => renderCtrlHtml(ff, fillChars)`. The `previewModelHelpers`
  object shape is unchanged, so `formDesignerPreviewModel.js` needs no edit.

### 2.2 `CodelistQuickEditDialog.vue` — shared codelist quick add/edit (R3)

One component, two modes — chosen over a bare composable because the two dialog markups
(FieldsTab `:500-560`, FormDesignerTab `:5490-5573`) are themselves near-identical duplicates; a
component removes both the logic and the markup copy.

**Contract — awaitable host hook, NOT emits.** Vue `emit` cannot be awaited, and the host must
reload both after save success AND after save failure (today both hosts do), so reload coordination
uses a plain async function prop (no new framework):

```
props:  modelValue(Boolean), projectId(Number, required), mode('add'|'edit'),
        codelistId(Number|null, edit mode), codelists(Array, edit mode source for hydration),
        addTitle(String, default '新增选项字典'), showCodeColumn(Boolean, default true),
        codePlaceholder(String, default '编码'), decodePlaceholder(String, default '标签'),
        afterChange(kind: 'add' | 'save', result) => Promise<void>   // host-owned reload/bind; REQUIRED
emits:  'update:modelValue'   // open/close only
```

**Dialog difference inventory (Step 3.0 deliverable; source-read at `f68ebe1`, re-verified at
execution; classification per the R1 legend — 参数化 = prop keeps each host's current text/behavior,
统一 = declared + tested + browser-verified):**

| Aspect | FieldsTab | FormDesignerTab | Classification |
|---|---|---|---|
| Add-dialog title | `新增选项字典` (:502) | `新增选项` (:5491) | 参数化 — `addTitle` prop (FT default; FD binds `新增选项`) |
| Edit-dialog title | `编辑选项字典` (:530) | `编辑选项字典` (:5534) | identical — fixed string |
| Dialog attrs | 560px, `:close-on-click-modal="false"`, `:close-on-press-escape="false"` | same | identical |
| Form (名称/描述, label-width 80px, size small, textarea autosize 2–4) | same | same | identical |
| Code column visibility | `v-if="editMode"` (:508/:536) — hidden in brief mode | always shown (:5503/:5546) | 参数化 — `showCodeColumn` (FT binds its `editMode`; FD binds `true`) |
| Add-row input placeholders | 编码 / 标签 (:519-520/:547-548) | none (:5516-5517) | 参数化 — `codePlaceholder` / `decodePlaceholder` (FT defaults; FD binds `''`) |
| Option table structure | plain bordered el-table, code col 120px, 操作 col 80px centered, no sortable/ordinal helpers | same | identical — none to carry |
| Row add / delete controls | bottom input row + 添加 button; delete via `confirmDelete` then removal | same | identical — the NEW component performs both as immutable reassignment (`opts.value = [...opts.value, row]` / `opts.value.filter(...)`, not push/splice) |
| Pre-POST normalized write-back on add | none — inputs stay as-typed if the POST fails | normalized name/options written back to the dialog state BEFORE the POST, so a failed add shows trimmed values | 参数化 — `normalizeDraftBeforeSubmit` (FT default false = as-typed; FD binds true on the add instance only); both shapes spec-tested |
| Footer | 取消 / 确定 with `:loading`+`:disabled` on saving flag | same | identical |
| Post-success add steps | invalidate both caches → `reloadAfterCodelistChange()` body → `editProp.codelist_id = created.id` → close → toast `新增成功` | invalidate both caches → `loadCodelists()` → `editProp.codelist_id = created.id` → close (silent) | host `afterChange('add')` — carried VERBATIM per host (incl. the codelist_id binding and the FT-only toast) |
| Post-success save steps | invalidate both caches → FT reload + `refreshKey.value++` → close → `保存成功` | invalidate both caches → codelists reload + forms-fields invalidate + `loadFormFields()` + reselect-if-clean + `refreshKey.value++` → close → `保存成功` | host `afterChange('save')` — carried VERBATIM per host |
| Post-failure save steps | refresh + close + `保存失败：…已刷新为最新字典数据…` | same shape | dialog-level flow (design §2.2) + host `afterChange` |

Flow inside the dialog (single implementation, moved from FieldsTab:203-372; `afterChange` awaited
where noted):

- **Add success**: `invalidateCache(codelists)` + `invalidateCache(field-definitions)` (the R3 fix)
  → `await afterChange('add', { codelist })` → close → optional `addSuccessMessage` toast
  (FieldsTab binds `新增成功`, toasted after close as today; designer binds nothing — silent;
  original behavior preserved).
- **Add failure**: error toast only; dialog STAYS open with entered values; no refresh (matches both
  hosts today).
- **Edit success**: references-check → `PUT snapshot` → invalidate both caches → `await
  afterChange('save', { codelist })` → close → toast `保存成功`.
- **Edit failure (non-cancel)**: invalidate both caches → `await afterChange('save', { codelist })`
  (host refreshes stale data) → close dialog → toast `保存失败：{message}。已刷新为最新字典数据，请重新检查后再编辑。` (matches both hosts today).
- **References-confirm cancel** (`ElMessageBox` resolves 'cancel'): return — no API write, no
  refresh, dialog stays open.
- **Cancel / close controls**: no API call, no cache write, no refresh.

Host `afterChange` implementations keep their own existing project/generation guards so a late
response never writes into a switched project (designer's `loadCodelists(projectId)` already
re-checks `projectId !== props.projectId`; FieldsTab wraps its existing `load()` +
`refreshKey.value++`):

- `FieldsTab.afterChange`: 'add' → its existing reload + `editProp.codelist_id = codelist.id`
  (the `新增成功` toast itself moves to the dialog's `addSuccessMessage` prop, fired after close —
  same visible order as today's `FieldsTab.vue:274-277` sequence); 'save' → its existing reload +
  `refreshKey.value++` — both carried verbatim per the inventory table above.
- `FormDesignerTab.afterChange`: 'add' → `loadCodelists()` + `editProp.codelist_id = codelist.id`;
  'save' → `loadCodelists()` + `invalidateCache(forms/{selectedForm}/fields)` + `loadFormFields()` +
  reselect-if-clean + `refreshKey.value++` (today's `:3058-3081` sequences, minus the two moved
  cache lines).

Declared behavior change (the only one): designer quick-add/save now also invalidate
`field-definitions` — the R3 fix itself (stale left-panel field-library codelist names, ≤30 s TTL
window). No toast unification. Unit quick-add stays as-is in the designer (out of scope).

Toast ordering is host-original, parameterized: the dialog owns an optional `addSuccessMessage`
prop — FieldsTab binds `新增成功` and the dialog toasts it AFTER `closeDialog()`, restoring
FieldsTab's exact close→toast order; the designer binds nothing and stays silent. The edit paths
keep their exact close→toast order inside the dialog. The save-failure refresh catch keeps both
hosts' pre-existing shape; "distinguish write-succeeded from refresh-failed" is a recorded
follow-up candidate, not this task.

### 2.3 Column-width storage key centralization (R4) — `useColumnResize.js`

New exports (bodies moved from the call sites, not rewritten):

```js
export function buildColumnWidthStorageKey(formId, tableInstanceId)   // from buildKey:30-33
export function parseColumnWidthStorageKey(key)                       // NEW: inverse for App.vue (returns {formId, tableInstanceId} | null)
export function isValidColumnWidthOverrideArray(arr)                  // App.vue:333 semantics — LOOSE ([0,1], no sum check): the export
                                                                      // collector forwards to the backend exporter; deliberately not readRatios' strict gate
export function migrateLegacyColumnWidthKey(formId, newTableInstanceId, legacyMapKey)  // FD:1704-1719 verbatim
```

Call-site changes:

- `VisitsTab.vue:477-495` `readPersistedColRatios` deleted; `resolveInlineColRatios` /
  `resolveNormalColRatios` call the existing exported
  `readColumnWidthRatios(formId, buildTableInstanceId(kind, fields), expectedLength)` (test 9.12
  already proves that path reads `…:fieldIds=…` keys). Length checks stay at the callers
  (`persisted.length === fields.length` / `=== 2`), as today.
  **Declared tolerance unification**: VisitsTab read gate moves from `{sum tol 0.02, bounds (0,1), no length check}` to the module gate `{sum tol 1e-3, bounds [0.02, 0.98], length check}` (designer's
  existing gate — same threshold for every reader). **Real rationale**: today the designer's reader
  already rejects loose-only arrays while the visit preview APPLIES them, so the two previews can
  disagree for the same form; after unification both apply exactly the same arrays. Not claimed
  lossless for all history: a loose-only historical array (sum drift in (1e-3, 0.02], or bounds
  outside [0.02, 0.98]) is no longer applied by the visit preview and falls back to planner
  defaults; such keys are NOT deleted or normalized. Tests cover the fallback and the
  key-preservation; the report states this limitation.
- **Export collector keeps the loose gate, moved verbatim**: `isValidColumnWidthOverrideArray` moves
  the App.vue:333 loose `[0,1]` check (no sum check) unchanged — preview-strict vs export-loose
  width divergence therefore REMAINS. It is pre-existing and out of scope; recorded as a follow-up
  candidate (aligning export to the strict gate would be a separate user-approved change).
- **Key-lifecycle contract (source-verified)**: the App-side export collector is and stays strictly
  read-only — malformed / loose-tolerance / unrelated keys are skipped, never removed (today App.vue
  has zero `removeItem` for col-width keys). Loose-tolerance historical arrays are NOT normalized or
  migrated: readers reject them and fall back to planner defaults; the keys stay on disk. The only
  deletion path in the feature remains `migrateLegacyColumnWidthKey`, which copies the value to the
  new key first and removes only the exact legacy key it successfully read.
- `FormDesignerTab.vue:1704-1719` `migrateLegacyKeyIfNeeded` → import
  `migrateLegacyColumnWidthKey`; `getResizer` call site unchanged.
- `App.vue:308-342` `collectColumnWidthOverrides` **moves** to `useColumnResize.js` (exported;
  same name) and is rewritten to use `parseColumnWidthStorageKey` + `isValidColumnWidthOverrideArray`
  + `buildColumnWidthStorageKey`; `App.vue` imports it. This also un-breaks test 16.2.6a, which
  currently re-implements the function inline (see §7).

### 2.4 aCRF constant consistency test (R5, narrowly scoped, standalone file)

Add ONE test in a NEW standalone file `backend/tests/test_acrf_offset_consistency.py` — NOT in
`test_export_acrf.py`, which BF reformats and ELC rewrites; a new file has zero textual overlap.
Modeled on `test_date_format_migration.py:110-125` (`_read_frontend_date_format_options`): read
`frontend/src/composables/acrfAnnotationGeometry.js` from the repo root, regex-extract
`ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU`, and assert equality with
`export_service.ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU` (backend `:177`). Parse failure =
assert-fail naming the constant. Scope deliberately excludes the other shared constants and
MIN/MAX_Y. Style note: the base does not have `backend/ruff.toml` yet — write the file in the
TARGET style (double quotes, ≤120 columns); if BF has landed by merge time the coordinator runs
venv `ruff format` on it after merging main.

**RED protocol (AC5)** — both sides are currently `-26940`, so the test is green by construction and
must not be faked red. Verification is ONE documented mutation drill: (1) write the test, run →
pass; (2) temporarily change `ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU` in the worktree's
`acrfAnnotationGeometry.js` (e.g. `-26941`), run only this test → must fail showing both values;
(3) restore, re-run → pass. Commands + outputs recorded in the final report; the perturbed file is
never committed.

## 3. Equivalence inventory (merge-before contract, R1)

**Approved behavior change (R8, 2026-10-09)**: exact parity testing found three horizontal-choice cells where
browser text contained one ASCII separator space but Word export contains two. The cross-stack §5
contract already requires two ASCII spaces. `renderChoiceHtml` emits two spaces; the inline fallback
from `renderCtrlTextHtml` wraps horizontal choice text in `.choice-text`. Both `.choice-group` and
`.choice-text` use `white-space: pre-wrap` with `word-spacing: normal`: browser testing showed that
`white-space: normal` collapses the second space even when the DOM text contains both. The vertical
path keeps its newline/`<br>` separators, normal whitespace, and 3pt option gap. Renderer tests cover
both horizontal paths and the vertical fallback; strict browser parity must be 1.0 with zero mismatches.

Legend: 统一 = single shared body, zero reachable behavior change. 参数化 = policy kept per component
via adapter. 变更 = declared behavior change (tested + browser-verified).

| # | Function | FormDesignerTab | VisitsTab | TemplatePreviewDialog | Classification |
|---|---|---|---|---|---|
| 1 | `computeMergeSpans` | :1461 | :644 | :203 | 统一 — three bodies byte-identical modulo semicolon style |
| 2 | `computeLabelValueSpans` | :1468 | :651 | :209 | 统一 — byte-identical |
| 3 | `getScopedDefaultValue` | :1381 | :418 | (own inline checks) | 统一 (FD/VT only) — bodies identical, moved verbatim to the shared export; **TP does NOT adopt it**: TP's cell predicate (`:295`, inlineMark hardcoded false) and inline predicate (`:219`, hardcoded true + `‖ ff.field_type` flat fallback) stay TP-local via `getCellValue`/`getInlineValue` adapters (保守参数化，不按"不可达"论证统一 — `isDefaultValueSupported:421-424` 在 inline=true 放行除复选外全部类型，false 仅文本/数值，两条策略语义不同) |
| 4 | `getInlineRows` default gating | `getScopedDefaultValue(ff)` (inline_mark-aware) | same | `isDefaultValueSupported(type, true)` hardcoded + flat-type fallback | 参数化 — explicit `getInlineValue` adapter: FD/VT pass inline_mark-aware `getScopedDefaultValue(ff)`; TP keeps its predicate verbatim |
| 5 | `getInlineRows` fallback renderer | `renderCtrlTextHtml(adapted)` | same | `renderCtrlHtml(ff)` | 参数化 — differs ONLY for choice fields (structured `.choice-atom` vs plain text). FD/VT bind `renderCtrlTextHtml(toRendererField(ff))`, TP binds `renderCtrlHtml(ff)` |
| 6 | `renderCellHtml` default branch | `getScopedDefaultValue(ff,false)` + `toHtml` (multi-line) | `getScopedDefaultValue(ff,true)` + `escapePreviewText` (**single line — the R2 defect**) | TP cell policy + `toHtml` (multi-line) | 变更 (VT only) — R2: VisitsTab's `getCellValue` switches from `singleLine=true` to `false`; designer/template cell policies untouched |
| 7 | `renderCellHtml` null guard | `!getPreviewField(ff)` | `!ff.field_definition` | `!ff.field_definition` | 统一 — shared guard is literally `!ff?.field_definition` (FD's `getPreviewField` returns null iff the same condition), exact for all three |
| 8 | `getInlineColumnCms` | host groups via `resolveInlineHostGroups(fields)` + `selectedFormPaperOrientation` | `previewRenderGroups` + `formPreviewPaperOrientation` | `previewRenderGroups` + `paperOrientation` | 参数化 — bodies otherwise identical; adapters `resolveHostGroups` + `getPaperOrientation` |
| 9 | `getInlineFillChars` | :1457 | :473 | :246 | 统一 — identical thin composite |
| 10 | field adapter | `getPreviewField` (:1362, returns null) | `toRendererField` (:396, null-safe) | identity (flat rows) | 参数化 — `toRendererField` adapter; renderer input-shape contract (flat only) respected on all paths |

Additional invariants carried into design:
- The three `previewModelHelpers` objects (FD :1478, VT :715, TP :182) keep their exact shape; the
  shared module slots behind the existing `buildPreviewGroupViewModels` injection seam, so
  `formDesignerPreviewModel.js` and its golden-reference test harness stay untouched structurally.
- TP `renderCtrlHtml(ff)` today passes the flat-with-extra row directly; binding `toRendererField: ff => ff`
  preserves the exact renderer input.
- Pure preview helpers compose behavior from `useCRFRenderer`; R8 updates its horizontal choice separator
  to the already-defined Word contract of two breakable ASCII spaces. Structured output uses
  `.choice-group`; `renderCtrlTextHtml` wraps horizontal inline fallbacks in `.choice-text`. Both
  wrappers use `white-space: pre-wrap` and `word-spacing: normal`, while the vertical class explicitly
  keeps normal whitespace, no HTML separator, and the 3pt option gap. This deliberate display-text
  change is separate from the helper-extraction equivalence snapshot; tests and strict DOCX parity lock it.

## 4. Data flow (after the change)

```
component template ──► previewModelHelpers (unchanged shape)
                        ├─ buildSegments = buildFormDesignerUnifiedSegments   (formFieldPresentation, untouched)
                        ├─ getInlineRows / getInlineColumnCms / getInlineFillChars ──┐
                        ├─ computeMergeSpans / computeLabelValueSpans ───────────────┤
                        └─ (FD/VT) renderCellHtml for normal cells ──────────────────┤
                                                                                     ▼
                                             previewCellRender.js ──imports──► useCRFRenderer.js
                                                     │                    visitPreviewLandscape.js
                                             adapters (per component)
```

## 5. Tradeoffs / rejected alternatives

| Decision | Alternative | Why |
|---|---|---|
| Shared dialog **component** for R3 | Composable only | The dialog markup is duplicated too; a component is the single point for validation/toasts/cache rules and is now mount-testable (`frontend-mount-tests` merged). Hosts keep only reload hooks, so per-tab business state stays out (respects the "no shared property-card component" precedent's rationale: that one was about layout-only duplication with divergent business state; here the business state IS the duplicated part) |
| Adapter-parameterized helpers (§3 rows 3–8/10; cell vs inline default policy split) | Force-unify TP onto FD semantics | `isDefaultValueSupported:421-424` makes inline=true and inline=false two different predicates; forcing unification would silently change TP's cell and choice-field fallback rendering and the group-membership source; parameterizing keeps "merge without drift" auditable and keeps R1's "差异已按 R1 归类声明" honest |
| VisitsTab tolerance tightens to module gate | Keep 0.02 as the shared gate | Today the designer's reader already ignores loose-only arrays while the visit preview applies them — the two previews can disagree for the same form. Unification makes both apply exactly the same arrays; the residual preview-strict vs export-loose divergence is pre-existing, out of scope, and recorded as a follow-up candidate |
| Mutation drill for AC5 RED | Fake a stale fixture / skip RED | Both sides are equal today; faking failure would be dishonest. The drill proves test sensitivity with real evidence |
| `collectColumnWidthOverrides` moves into `useColumnResize.js` | Leave in App.vue, only swap key helpers | Test 16.2.6a currently re-implements the whole function inline (a copy-paste test double); moving the function lets the test import the real one (R6) without adding an App.vue import to a unit test |
| R8 uses scoped `white-space: pre-wrap` for horizontal choice text | Keep `white-space: normal` and rely on the two-space DOM string | Browser text contained both ASCII spaces, but normal whitespace collapsed the second visually. Applying pre-wrap only to structured `.choice-group` and inline `.choice-text` preserves breakable spacing without `word-spacing`; vertical choices explicitly retain normal whitespace. |

## 6. Compatibility / rollout / rollback

- localStorage: no key format change, no migration of values. Legacy-key compatibility
  (`readColumnWidthRatiosWithFallback`, `migrateLegacyColumnWidthKey`) is preserved and re-tested.
- Rollback: single task branch; `git revert` of the merge restores all call sites (no data format,
  no API, no DB change). The only persisted-data interaction is read-only.
- Cross-stack contracts: §5 (parity), §6 (aCRF geometry), §13 (date formats), width-planning
  constants — all untouched; `compare_word_table_parity.py` must return exact ratios 1.0.
- **Approved R8 extension (2026-10-09)**: `renderChoiceHtml` and `renderCtrlTextHtml` must both
  preserve the backend's two-ASCII-space horizontal separator in the browser. `.choice-group` and
  `.choice-text` use `white-space: pre-wrap; word-spacing: normal`; vertical options keep their
  newline/`<br>` separators, normal whitespace, and 3pt gap. RED→GREEN behavior tests cover both paths;
  the browser DOCX parity run returns 1.0 with zero mismatches.

## 7. Test plan mapping (R6 conversion targets, current line anchors)

| Test file (current) | What changes | Conversion |
|---|---|---|
| `formDesignerPreviewModel.test.js` | Golden refs are verbatim pre-merge copies (keep as historical snapshots, annotate); absence-guards :224-272 remain valid | Add import-based tests: shared module outputs element-equal to golden refs over a fixture matrix (text/choice/numeric × multi-line default × inline_mark × fillChars × null adapter) |
| `columnWidthPlanning.test.js` :795-806 (16.1.5j) | Asserts VisitsTab source contains `return renderCtrlHtml(field, fillLineChars)` — line leaves the component | Behavioral: shared `renderCellHtml` with a choice field forwards `fillLineChars` (import-based); a narrow wiring guard (component imports + passes `fillLineChars`) may stay, justified as wiring-only |
| `columnWidthPlanning.test.js` :810+ (16.2.6a) | Re-implements `collectColumnWidthOverrides` inline | Keep the inline body as the GOLDEN reference (first verify it is verbatim today's App.vue:308-342; if diverged, copy the real body); import the real exported function and assert output deep-equals the golden output over a dirty-store matrix: valid new-format keys, legacy-format keys, malformed JSON, out-of-range values, sum drift, unrelated keys, other forms. Keep the existing read-only (no removeItem) assertion |
| `fieldsTabCodelistQuickEdit.test.js` | Function-body asserts (`async function quickAddCodelist()` :27, :33, `reloadAfterCodelistChange` :40-43) — bodies move into the dialog | Split: host wiring guards stay (template `@click`/`:disabled` bindings :21-23 are host-side and remain); endpoint/toast/cache-rule asserts become dialog-level tests (node:test on the extracted logic if exported, else the vitest mount spec below) |
| `quickEditBehavior.test.js` :98-99, :241-277 | Template wiring guards valid; `functionBody('quickAddCodelist'/'quickSaveCodelist')` busy-guard asserts break | Wiring guards stay; busy-guard + reference-confirm convert to dialog behavioral tests |
| `formDesignerPropertyEditor.runtime.test.js` :330-334 | `functionBody` negative OID asserts on the moved bodies | Move to dialog behavioral test (option `code` stays free of OID validation) |
| NEW `tests/component/CodelistQuickEditDialog.spec.js` | — | vitest mount spec (infra merged), asserting the §2.2 flow: add success = invalidate both caches → `afterChange('add')` awaited (spy resolves) → closed, dialog does NOT toast add-success; add failure = error toast, dialog stays open; edit success = references-confirm → snapshot PUT → invalidate both → `afterChange('save')` awaited → close + `保存成功`; edit failure = still refreshes via `afterChange` + closes + failure toast; references-cancel and close controls write nothing |
| NEW `previewCellRender.test.js` (node:test) | — | Equivalence matrix vs golden refs, with the cell and inline default policies asserted SEPARATELY per component binding (TP hard-false cell vs hard-true inline; FD/VT inline_mark-aware), the TP flat-type inline fallback, and the unified-segment value path; R2 lock: VisitsTab-bound `renderCellHtml` renders all default lines via `toHtml` (`<br>` present, no single-line truncation) |
| `checkboxFieldType.test.js` / others reading the 3 components | May assert strings that moved | Executor re-runs full node:test and converts any additional colliding assertion with the same policy (behavior-first, wiring-guard-with-justification allowed) |

## 8. Explicit file list (implementation surface)

Production:
- `frontend/src/composables/previewCellRender.js` (new)
- `frontend/src/components/CodelistQuickEditDialog.vue` (new)
- `frontend/src/composables/useColumnResize.js` (add exports; absorb App.vue collector)
- `frontend/src/components/FormDesignerTab.vue` (delete moved symbols per-symbol; bind factory; use shared dialog; import migrate helper)
- `frontend/src/components/VisitsTab.vue` (delete moved blocks; bind factory; shared reader)
- `frontend/src/components/TemplatePreviewDialog.vue` (delete moved blocks; bind factory)
- `frontend/src/components/FieldsTab.vue` (use shared dialog)
- `frontend/src/App.vue` (import collector from useColumnResize)
- **R8 approved addition**: `frontend/src/composables/useCRFRenderer.js` (two-space horizontal choice separator; inline fallback `.choice-text` wrapper) and `frontend/src/styles/main.css` (`.choice-group` / `.choice-text` preserve spaces with `white-space: pre-wrap`, no extra `word-spacing`; vertical group keeps normal whitespace; preserve peer-added dialog CSS during integration).

Tests: `frontend/tests/previewCellRender.test.js` (new), `frontend/tests/component/CodelistQuickEditDialog.spec.js` (new), the five converted files in §7, R8 assertion in `frontend/tests/formFieldPresentation.test.js`, `backend/tests/test_acrf_offset_consistency.py` (new standalone file — deliberately NOT `test_export_acrf.py`, which BF reformats and ELC rewrites).

Docs (this task): `frontend/.claude/CLAUDE.md` (composables + components lists), `.trellis/spec/guides/cross-stack-contracts.md` §6 checklist line naming `backend/tests/test_acrf_offset_consistency.py` — this is a `.trellis/` change and lands in a standalone `docs(spec): …` commit, never mixed with code commits. Root changelog / README / `.claude/index.json`: owned by the main coordinator (standalone `.trellis`/docs flow), out of this task's commits. Merge-order note: see §1 parallel-wave overlap rules (second merger re-runs all gates).
