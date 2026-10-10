# Implement — shared-rule-convergence

Execution runbook: `.trellis/tasks/10-08-review-remediation/implement.md` (parent). This file lists
only task-specific steps. Design decisions and the equivalence inventory: `design.md` (binding).
PRD: `prd.md`. Nothing in this task authorizes commit / merge / push / package installs — each waits
for explicit user authorization (parent §0).

## Task board (ordered; TDD — RED before GREEN at every implementation step)

### Execution status (2026-10-09)

Both child plans were explicitly approved through the plan-approval question. This task is
`in_progress` in `/home/decade/CRF-Editor-shared-rule-convergence`, branch
`feat/shared-rule-convergence`, base `f68ebe1`; commit/merge/push remain unauthorized.

| Step | Status | Recorded evidence |
|---|---|---|
| 0 | Complete | Offline node_modules copy; node:test 824/824; vitest 11/11; lint 0 errors / 3615 warnings; build passed; backend 1042 passed / 4 xfailed, TOTAL 84%. Logs: `/tmp/src-baseline-*`. |
| 1–2 | Implemented; lead inspected actual diff; Haiku review passed | New module missing → RED; 12 new tests GREEN; full node:test 836/836, vitest 11/11, lint 0 errors / 3566 warnings, build passed (implementer results). Factory shortened to 47 lines without behavior change; targeted tests and follow-up review passed. |
| 3–4 | Implemented; lead inspected actual diff; fix rounds landed | Dialog + storage slices complete. Review-driven fixes: `normalizeDraftBeforeSubmit` prop restores FD's pre-POST normalized write-back (FD-only binding); option rows updated immutably (spread/filter); `addSuccessMessage` prop restores FieldsTab's original close→toast order (toast fired by the dialog after close; designer silent). Both hosts' original behaviors preserved; spec cases pin both shapes and the call order. |
| 5 | Complete | Lead re-ran new consistency test → 1 passed; mutation -26940 → -26941 caused the expected value mismatch → restored source (`git diff` clean) → 1 passed. |
| 6 | Pending final full-scope check | Trellis check, final coverage, independent review and lead reruns after Steps 3–4. |
| 7 | Environment and authentication ready; functional QA pending | Isolated server at 127.0.0.1:8902 (PID 10390); evidence `/tmp/src-browser-20261009-src/evidence.json`; own isolated browser page2 authenticated as a regular QA user, independently checked by lead. Final-build UI/parity checks have not run. |
| 8 | Pending | Documentation/spec sync and final report; stop before committing. |

Additional peer lease: `feat/reference-delete-guard` edits only delete handlers in FieldsTab and
FormDesignerTab, not quick-edit/preview/storage symbols. SRC keeps the default codelist references
request without `include_unplaced`. Second merger synchronizes main, resolves imports, and reruns
all gates. Spec edits remain separate commits.

### Erratum (2026-10-10, FINAL — full guard landing ratified)

design.md §2.2's claim that host guards ensure "a late response never writes into a switched project"
was over-optimistic — a declared deviation from the §2.2 "carried VERBATIM per host" inventory claim.
The coordinator's terminal acceptance ratified the FULL landing as the permanent final state,
superseding every prior same-day ruling on this race (including the "FieldsTab-only" and
"loop-terminal split" rulings):

- **FieldsTab.load() — reachable late-response race, FIXED in this task.** A `refreshKey`-triggered
  global reload in flight plus a direct project switch A→B (App.vue `selectProject`, click-driven,
  App.vue:211, does NOT unload the workbench) lets the late A response overwrite B's lists;
  FormDesignerTab already carries generation guards while FieldsTab did not. Same defect class as the
  merged session-token guard (late responses must not clobber newer state, cross-stack contract §3
  rules 4–5 precedent). Landed: `load()` captures `pid` and re-checks `props.projectId !== pid` after
  the await before assigning; guarded by a source-level test in `fieldsTabCodelistQuickEdit.test.js`.
- **CodelistQuickEditDialog — modal-unreachable today, op-context pinning RETAINED as hardening.**
  Reachability audit (shared-rule-check) confirmed the dialog flow cannot see mid-flight props change
  in the current UI (standard modal overlay + focus trap; App.vue selectProject is click-driven and
  unreachable while a modal is up), and the no-defensive-fallbacks rule argues against new guards for
  unreachable paths. The coordinator nevertheless ratified the landed pinning (`opProjectId`/
  `opCodelistId` captured at submit + `isOperationStale` + both caches invalidated on the ORIGINAL
  project + silent close without afterChange/toast on staleness; confirmAdd catch aligned with
  confirmSave's stale branch) as retained hardening, locked by 3 mount race cases (add mid-switch /
  save mid-switch / save failure while stale). If a future change makes the dialog non-modal or adds a
  programmatic project-switch path, this pinning becomes load-bearing rather than defensive.

Haiku incremental review drove three closing fixes: confirmAdd's catch gained the isOperationStale
branch (matching confirmSave), the two stale cases gained positive assertions that cache invalidation
targets the ORIGINAL project, and a third "edit save fails while stale" case locks the confirmSave
error path (raw error toast, no `已刷新为最新字典数据` phrasing).

Final state: node:test 846/846 (845 + 1 FieldsTab guard), vitest 26/26 (23 + 3 race cases), lint
0 errors, build passed; file list unchanged at 23 files (the gate lives in already-modified
`FieldsTab.vue` / `fieldsTabCodelistQuickEdit.test.js`, the dialog in the new untracked
`CodelistQuickEditDialog.vue` + its spec). Process note (session.log): the interim fix was applied
before arbitration — technical disagreements with a ruling must be argued and arbitrated BEFORE
touching code. Live browser regression remains outstanding (blocked by the security gate).

### Step 0 — Worktree + baseline (no code changes)

- [ ] `git -C /home/decade/CRF-Editor worktree add /home/decade/CRF-Editor-shared-rule-convergence -b feat/shared-rule-convergence main` (parent §2; only after `task.py start`). Record the base commit — `f68ebe1` at planning time. **Parallel Wave D**: `legacy-cleanup` runs concurrently on `refactor/legacy-cleanup` — obey design §1 overlap rules (never touch the listed perf hunks, never edit `main.css`, stay strictly inside the design §8 file list, stop and ask before any other file); merges are coordinator-performed and the second merger re-runs all Step 6 gates.
- [ ] **Dependencies offline strategy** (verified 2026-10-09: main checkout `frontend/node_modules` exists and matches the lockfile; Node v24.14.1 / npm 11.11.0 available): populate the worktree by offline copy — `cp -a /home/decade/CRF-Editor/frontend/node_modules $WT/frontend/node_modules` into the fresh empty target only (no rsync --delete variants), never touching the source or the other worktrees. Sanity-check with one targeted `node --test` run; if the copy proves unusable, STOP and request explicit user authorization for `npm ci` (no network / install / upgrade without it).
- [ ] Frontend baseline: `cd $WT/frontend && node --test tests/*.test.js && npm run test:component && npm run lint && npm run build` — record pass/fail counts.
- [ ] Backend baseline WITH coverage (same command as final — required for the before/after comparison): `cd $WT/backend && env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY /home/decade/.venvs/crf-editor/bin/python -m pytest -q --cov=src --cov=main --cov-report=term-missing:skip-covered` — record TOTAL and per-file rows (coverage is statistics-only, no gate). pytest-cov is already pinned in the venv (requirements-dev).
- [ ] Re-verify every design.md line anchor on the worktree HEAD before editing (parent §5.2); line drift → update the anchors in the task docs only — task docs stay untracked and are never staged into project-code commits (archive happens in a standalone `.trellis/` commit, parent §2).

### Context-loading gate (spec-injection truncation)

`task.py validate` passes, but hook-injected spec excerpts are TRUNCATED for large files
(`cross-stack-contracts.md` ≈70 KiB, `frontend/component-guidelines.md` ≈49 KiB, backend
`database-guidelines.md` >32 KiB). The executor MUST load the sections it relies on via
`Read` with `offset`/`limit` from the real files and must not treat hook-injected text as the
complete contract — for this task that means at minimum cross-stack-contracts §3/§5/§6/§13 and the
component-guidelines "Word Preview / Export Strict Table-Field Parity" scenario. The jsonl
manifests stay unchanged (evidence produced during planning lives in `prd.md` §Evidence and
`design.md` §3, both already in the mandatory read order; no separate research/ files were
created).

### Step 1 — R1/R2 shared preview helpers (`previewCellRender.js`)

1. [ ] **RED**: create `frontend/tests/previewCellRender.test.js` — copy the three components'
       current function bodies verbatim as golden refs (annotate "pre-merge per-symbol snapshot of
       FormDesignerTab getScopedDefaultValue/renderCellHtml/getInlineRows/getInlineColumnCms/
       getInlineFillChars/computeMergeSpans/computeLabelValueSpans · VisitsTab same set ·
       TemplatePreviewDialog same set @ a4431b0"). Assert the not-yet-existing
       `createPreviewCellRenderers` / `computeMergeSpans` / `computeLabelValueSpans` /
       `getScopedDefaultValue` produce element-equal outputs over the fixture matrix, with the CELL
       and INLINE default-value policies asserted as SEPARATE bindings per component (TP hard-false
       cell vs hard-true inline + flat-type fallback; FD/VT inline_mark-aware) and the
       unified-segment value path covered (design.md §3/§7). Include the R2 lock: the
       VisitsTab-bound `renderCellHtml` renders multi-line defaults through `toHtml` (`<br>` present
       — fails while VisitsTab still truncates, until Step 2 wires it).
       Confirm failure reason = missing module (acceptable: targets new functions).
2. [ ] **GREEN**: create `frontend/src/composables/previewCellRender.js` per design.md §2.1
       (imports from `useCRFRenderer.js` / `visitPreviewLandscape.js` only — no copied algorithm).
       Keep functions < 50 lines, no `console.log`.
3. [ ] Run `node --test tests/previewCellRender.test.js` → green. Full frontend suite → no new failures.
- Rollback point: single commit-able unit; `git checkout -- frontend/src/composables/previewCellRender.js frontend/tests/previewCellRender.test.js` discards.

### Step 2 — R1 switch the three components to the shared module

1. [ ] `TemplatePreviewDialog.vue`: delete the local `computeMergeSpans` / `computeLabelValueSpans` /
       `getInlineRows` / `getInlineColumnCms` / `getInlineFillChars` / `renderCellHtml` symbols
       (per-symbol, no line-range deletes); bind `createPreviewCellRenderers({ toRendererField: ff => ff,
       getCellValue: <TP renderCellHtml:295 predicate verbatim>, getInlineValue: <TP getInlineRows:219
       predicate verbatim incl. flat-type fallback>, resolveHostGroups: () => previewRenderGroups.value,
       getPaperOrientation: () => paperOrientation.value, renderFallback: (ff, fillChars) =>
       renderCtrlHtml(ff, fillChars) })`; `previewModelHelpers` shape unchanged.
2. [ ] `FormDesignerTab.vue`: delete the same symbol set (per-symbol). **KEEP** `getPreviewField`,
       `normalColumnCm` / `normalFillChars`, and `resolveInlineHostGroups` (the last becomes the
       `resolveHostGroups` adapter); bind `getCellValue = ff => getScopedDefaultValue(ff, false)`,
       `getInlineValue = ff => getScopedDefaultValue(ff)`.
3. [ ] `VisitsTab.vue`: delete the same symbol set (keep `escapePreviewText` — still used at `:130`
       for design notes); bind `getCellValue = ff => getScopedDefaultValue(ff, false)` — **this
       binding is the R2 fix**; `getInlineValue = ff => getScopedDefaultValue(ff)`.
4. [ ] Convert `columnWidthPlanning.test.js` 16.1.5j per design.md §7 (behavioral choice-field
       `fillLineChars` forwarding + justified narrow wiring guard). Run it → green.
5. [ ] Run full `node --test tests/*.test.js` → no new failures (convert any additional colliding
       text assertion per the §7 policy before moving on).
6. [ ] **R8, user-approved parity delta (RED → GREEN)**: in `formFieldPresentation.test.js`, assert
       `renderCtrlHtml` joins horizontal choice atoms with exactly two breakable ASCII spaces and
       `.word-page .choice-group` uses `word-spacing: normal`; confirm RED first. Then set
       `renderChoiceHtml` separator to two spaces (vertical remains empty), reset the CSS spacing
       rule, and rerun the targeted test. No backend change: export already follows this contract.
- Rollback point: the three component edits revert independently; golden-ref tests guard equivalence.

### Step 3 — R3 shared codelist quick-edit dialog

0. [ ] **Difference inventory (deliverable, recorded in the report)**: verify the design.md §2.2
       inventory table against the worktree HEAD (add titles `新增选项字典` vs `新增选项`; code
       column `v-if="editMode"` vs always-on; input placeholders vs none; option-table behavior;
       validation; post-success steps per host) and re-classify anything that moved: 参数化 via the
       `addTitle` / `showCodeColumn` / `codePlaceholder` / `decodePlaceholder` props is the default;
       any 统一 (unification) must be declared, tested, and browser-verified. Confirm each host's
       `afterChange` carries ALL of its existing post-success steps verbatim (incl. the
       `editProp.codelist_id` binding and the FieldsTab-only `新增成功` toast).
1. [ ] **RED**: new `frontend/tests/component/CodelistQuickEditDialog.spec.js` (vitest; infra per
       `.trellis/spec/frontend/quality-guidelines.md` — components registered through the shared
       `tests/component/setup.js`, ALL required props supplied; on main `f68ebe1` the Vue-warning
       gate (`vueWarnGate.js`) fails the test on ANY Vue warning, so the spec must run
       warning-free). Spy `api` via `vi.spyOn`; ElMessage spies are global. Assert the design.md
       §2.2 flow with the awaitable `afterChange` prop (spy as a `vi.fn` resolving Promise): (a)
       add success = invalidate `/codelists` AND `/field-definitions` → `afterChange('add', …)`
       awaited BEFORE close; dialog shows NO add-success toast (host owns it); (b) add failure =
       error toast, dialog STAYS open with values, no refresh; (c) edit success = references-check
       (spy `ElMessageBox.confirm`) → PUT snapshot → invalidate both caches → `afterChange('save',
       …)` awaited → close + `保存成功`; (d) edit failure = still calls `afterChange('save', …)` +
       closes + `保存失败：…已刷新为最新字典数据…` toast; (e) references-confirm cancel and close
       controls: no API write, no cache invalidation, no `afterChange`; (f) option `code` accepts
       free-form text (no OID rejection — absorbs the runtime.test.js :330-334 asserts); (g) prop
       matrix: `addTitle` / `showCodeColumn` / `codePlaceholder` / `decodePlaceholder` render both
       hosts' current texts.
       Confirm RED = component missing.
2. [ ] **GREEN**: create `frontend/src/components/CodelistQuickEditDialog.vue` per design.md §2.2
       (bodies moved from FieldsTab:203-372; the two cache invalidations inside the dialog;
       `afterChange` awaited on the success AND edit-failure paths, never on add-failure/cancel).
3. [ ] Rewire `FieldsTab.vue` and `FormDesignerTab.vue` to pass their `afterChange` implementations
       (host-owned reload/bind with each host's existing project/generation guards — designer's
       `loadCodelists(projectId)` re-check kept; 'add' also binds `editProp.codelist_id` in BOTH
       hosts — `FieldsTab.vue:275` and `FormDesignerTab.vue:2960`; FieldsTab 'add' keeps its
       `新增成功` toast, designer stays silent). Delete the two
       duplicated script blocks and dialog markups.
4. [ ] Convert `fieldsTabCodelistQuickEdit.test.js` / `quickEditBehavior.test.js` :98-99+241-277 per
       design.md §7 (host wiring guards stay with a one-line justification comment; body asserts move
       into the spec). Run both + the new spec → green.
5. [ ] Reproducible cache-gap check (AC3 evidence): in the spec, assert `api.invalidateCache` called
       with `/api/projects/1/field-definitions` after designer-shaped save (this is the regression
       that locks the 30-second stale-library defect).
- Rollback point: dialog + two host rewires revert as one unit.

### Step 4 — R4 column-width key centralization

1. [ ] **RED**: extend `columnWidthPlanning.test.js`: (a) import-based tests for the four new
       exports (`buildColumnWidthStorageKey`, `parseColumnWidthStorageKey`,
       `isValidColumnWidthOverrideArray`, `migrateLegacyColumnWidthKey`) — RED as missing;
       (b) replace 16.2.6a's inline re-implementation with the imported `collectColumnWidthOverrides`
       from `useColumnResize.js` — RED as missing export; (c) legacy-key compat cases (the LEGACY
       format is `crf:designer:col-widths:<formId>:<groupIndex-kind-colCount>` — `kind:fieldIds=…`
       is the NEW tableInstanceId spelling; see FormDesignerTab.vue:1702-1707): a value under the
       legacy key is copied to the new `kind:fieldIds=` key when the new key is absent; an existing
       new key is never overwritten; the legacy key is removed only when it was read;
       `readColumnWidthRatiosWithFallback` (useColumnResize.js:87-90) still reads its legacy
       table-kind fallback (AC4).
2. [ ] **GREEN**: implement the four exports in `useColumnResize.js` (bodies from
       `buildKey:30-33`, `FormDesignerTab.vue:1704-1719`, `App.vue:308-342`; for the collector see
       the golden-equivalence rule in 3b below).
3. [ ] Rewire call sites: `FormDesignerTab.vue` (`migrateLegacyColumnWidthKey` import),
       `App.vue` (import collector), `VisitsTab.vue` (delete `readPersistedColRatios:477-495`; use
       `readColumnWidthRatios(formId, buildTableInstanceId(kind, fields), length)`; keep caller-side
       length checks).
3b. [ ] **Collector equivalence (16.2.6a golden)**: keep the test's current inline
       re-implementation as the GOLDEN reference — first verify it is verbatim today's
       App.vue:308-342 body; if it diverged, copy the real body as the golden ref. Then assert the
       imported function's output deep-equals the golden output over a dirty-store matrix: valid
       new-format keys, legacy-format keys, malformed JSON, out-of-range values, sum drift,
       unrelated keys, other forms. Keep the existing read-only (no removeItem) assertion.
4. [ ] Full frontend suite → no new failures; document the tolerance unification
       (0.02→1e-3 read gate on the VT path) in the report as a declared change, stating the
       fallback limitation: any historical loose-only array (sum drift in (1e-3, 0.02] or bounds
       outside [0.02, 0.98]) is no longer applied by the visit preview and falls back to planner
       defaults — keys are never deleted or normalized, and no claim of zero historical impact is
       made.
5. [ ] **Key-lifecycle policy tests (locking, from source-verified facts)**: (a) App-side
       `collectColumnWidthOverrides` stays strictly read-only with its EXACT current loose `[0,1]`
       validation semantics moved verbatim — malformed / loose-tolerance / unrelated `localStorage`
       keys are skipped, never removed (assert `localStorage` contents unchanged after a collect run
       over a dirty store; today's code has zero `removeItem` for col-width keys — the only deletion
       path in the whole feature is the designer's `migrateLegacyColumnWidthKey`, which copies first
       and removes only the exact legacy key it read); (b) loose-tolerance legacy arrays are NOT
       normalized or migrated — readers reject them and fall back to planner defaults, keys stay on
       disk (covered by explicit test cases, not by argument).
- Rollback point: `useColumnResize.js` + three call sites revert as one unit.

### Step 5 — R5 backend aCRF consistency test

1. [ ] Add ONE test in the NEW standalone file `backend/tests/test_acrf_offset_consistency.py`
       (NOT `test_export_acrf.py` — BF reformats it and ELC rewrites it; a new file has zero
       textual overlap), per design.md §2.4 (parse `ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU`
       from `acrfAnnotationGeometry.js`, assert equality with
       `export_service.ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU`; parse failure names the
       constant). Write it in the TARGET ruff style (double quotes, ≤120 columns — the base has no
       `backend/ruff.toml` yet); scope is this constant only — no other constants, no MIN/MAX drill.
2. [ ] Run `cd $WT/backend && $PY -m pytest tests/test_acrf_offset_consistency.py -q` → pass.
3. [ ] **Mutation drill (AC5 evidence, run once, record output)**: perturb the frontend
       `ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU` by −1 in the worktree → the new test fails
       showing both values; restore → passes. Paste RED/restore outputs into the final report. Do
       NOT commit the perturbed file.
4. [ ] Full backend suite → counts = baseline + new test passing.

### Step 6 — Full verification (AC8) + review gates (parent §6)

- [ ] Frontend: `node --test tests/*.test.js && npm run test:component && npm run lint && npm run build` — all green vs baseline.
- [ ] Frontend scoped coverage (existing tools only — do NOT install `@vitest/coverage-v8`):
      `node --test --experimental-test-coverage tests/previewCellRender.test.js` (+ the converted
      test files) to report per-function coverage of the new/changed modules; vitest specs stay
      coverage-free.
- [ ] Backend final run: same command as the baseline bullet in Step 0 (with
      `--cov=src --cov=main --cov-report=term-missing:skip-covered`); compare TOTAL and every
      touched file's row against the recorded baseline (no production backend file changes are
      planned — the comparison guards against accidental drift).
- [ ] `git -C $WT diff --check main...HEAD` clean.
- [ ] `trellis-check` sub-agent (sonnet) on the full branch diff; fix findings, re-run §6 checks.
- [ ] `code-review` skill on the branch diff.
- [ ] Haiku read-only frontend review (parent §6) — findings triaged by the executor; dispositions recorded.
- [ ] Read the actual diff of every delegated change personally (parent §6 last rule).
- [ ] Reconcile `git status` against this file's explicit surface list (design.md §8) before any
      staging — an unrequested file in the worktree is a stop-and-ask, per memory note
      `shared-worktree-injection-guard`.

### Step 7 — Browser + parity verification (AC7)

Follow the memory recipe `browser-e2e-recipe` (headless shell, throwaway backend under /tmp,
`CRF_ENV=production`, `npm run build` before serving). **Use port 8902 (not 8901)** —
`temp-resource-lifecycle` runs in parallel and the parent runbook example reserves 8901; start and
stop ONLY the server you launched yourself.

- [ ] **Word-service directory isolation (mandatory for the throwaway backend)**: `CRF_STORAGE_UPLOAD_PATH`
      does NOT move the fixed Word dirs — they are class attributes and not env-configurable:
      `DocxScreenshotService.BASE_DIR` (absolute `backend/uploads/docx_temp`) and
      `DocxImportService.TEMP_DIR` (relative `uploads/docx_temp`), plus the hourly
      `purge_expired_uploads` sweep that walks `TEMP_DIR`. Launch the throwaway backend through a
      small wrapper script kept under `/tmp` that, before serving, explicitly monkeypatches BOTH
      class attributes to throwaway `/tmp` dirs (mirroring `backend/tests/conftest.py:105-106`) —
      e.g. import the two service classes, `DocxScreenshotService.BASE_DIR = …; DocxImportService.TEMP_DIR = …`,
      then run the app. Never let cleanup/export verification paths touch the real `backend/uploads/`.

- [ ] Designer: multi-line default value field → preview shows ALL lines; horizontal choice option spacing matches the exported Word cell (two ASCII spaces); choice-field inline block unchanged; column width drag → reload persists; fullscreen designer open/close rehydrate.
- [ ] Visits page: same form's normal-layout preview now shows ALL default lines (R2, side-by-side
      with designer); visit inline table unchanged; landscape/auto orientation unchanged.
- [ ] Template preview (模板导入预览): inline + normal tables render as before; multi-line defaults
      all lines (unchanged behavior confirmed).
- [ ] Codelist quick edit from the DESIGNER: rename a codelist used by a field → left field-library
      panel shows the new name immediately (was ≤30 s stale — AC3 live evidence).
- [ ] Codelist quick edit from FieldsTab: unchanged behavior (impact confirm, refreshKey sync).
- [ ] Word export: run export from the browser; then (venv python, not system python)
      `cd $WT/backend && $PY scripts/compare_word_table_parity.py <preview.json> <export.docx>` →
      `exact_cell_ratio = 1.0`, `exact_row_ratio = 1.0`, `mismatches = []` (specifically includes
      horizontal-choice cells after the R8 fix; preview extractor preserves two-space text).
- [ ] aCRF annotation view (designer + visits): annotation boxes still positioned correctly
      (geometry untouched — sanity only, no drag persistence change).
- If any step is blocked, record the blocker and the substitute evidence; never claim unverified
  browser results (parent §4).

### Step 8 — Docs sync (task-scoped) + report + stop

- [ ] `frontend/.claude/CLAUDE.md`: add the two new modules to Key Entry Points / Core Directories;
      update the three component blurbs (VisitsTab multi-line fix; codelist quick-edit now shared
      dialog; `useColumnResize` now owns key storage/parse/migrate).
- [ ] `.trellis/spec/guides/cross-stack-contracts.md` §6 synchronization checklist: add the new
      consistency test naming `backend/tests/test_acrf_offset_consistency.py`. This is a `.trellis/`
      change — it lands in a standalone `docs(spec): …` commit, NEVER mixed with project-code
      commits (parent §2).
- [ ] Root `.claude/CLAUDE.md` Change Log / README / `.claude/index.json`: **owned by the main
      coordinator** — do not touch (boundary set to avoid conflicts with sibling tasks).
- [ ] Append decision-log entries (`.context/current/branches/<branch>/session.log`) for: adapter
      parameterization choice, dialog-over-composable choice, tolerance unification direction.
- [ ] Report per parent §8 (Chinese), including: RED→GREEN evidence per test, baseline vs final
      counts, mutation-drill outputs, review findings + dispositions, browser/parity evidence,
      **not-run** items, and the authorization asks (commit / merge / push). STOP — no git actions.

## Validation commands (quick reference)

```bash
# frontend (in $WT/frontend)
node --test tests/*.test.js              # node:test suite
npm run test:component                   # vitest mount tests
npm run lint && npm run build

# backend (in $WT/backend)
PY="env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY /home/decade/.venvs/crf-editor/bin/python"
$PY -m pytest tests/test_export_acrf.py -q        # Step 5 targeted
$PY -m pytest -q                                   # full suite

# parity (after browser export; venv python, never system python)
cd $WT/backend && $PY scripts/compare_word_table_parity.py preview.json export.docx
```

## AC → step map

| AC | Steps | Evidence |
|---|---|---|
| AC1 | 1–2 | golden-ref equivalence tests + `grep -rn "function computeMergeSpans\|function getInlineRows\|function renderCellHtml" frontend/src` shows only `previewCellRender.js` (+ renderer internals) |
| AC2 | 1–2, 7 | previewCellRender R2 lock test + browser side-by-side |
| AC3 | 3, 7 | dialog spec cache assertions + live designer stale-library check |
| AC4 | 4 | new exports tests + legacy-key compat case |
| AC5 | 5 | consistency test + mutation drill outputs |
| AC6 | 2–4 | converted test files pass; removed text asserts listed in report |
| AC7 | 6–7 | Haiku review + browser/parity evidence |
| AC8 | 6 | baseline vs final counts (backend pytest + frontend `node --test tests/*.test.js` AND `npm run test:component`) |
| AC9 | 8 | frontend module docs diff |
| AC10 | 2, 6–7 | renderer behavior test + browser strict parity including horizontal choice cells |
