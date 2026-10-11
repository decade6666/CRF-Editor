# Implement — app-word-import-split

Runbook: `.trellis/tasks/10-08-review-remediation/implement.md` (§0–§8). Binding design: `design.md`; requirements: `prd.md`; verified maps: `research/*.md`. The executor never commits, invokes skills, dispatches agents, or starts a browser. Merge remains separately authorized after the lead reports.

## Execution status

| Phase | Owner | Status / evidence |
|---|---|---|
| P0 | Lead (Opus) | Complete — user approved start, npm ci, and local grouped commits; worktree refactor/app-word-import-split created at base 6090a81. |
| P1 | Executor (`trellis-implement`, Sonnet) | Complete — baseline suites passed: node:test 944, component 5 files / 26 cases, lint 0 errors / 3546 warnings, build passed, backend 1210 passed. Logs under /tmp/app-word-import-split-baseline/. |
| P2 | Browser agent (general-purpose, Sonnet + chrome-devtools) | Blocked — random throwaway credential generation denied; no browser/backend launched, no baseline screenshots. BEFORE dist snapshot preserved at /tmp/app-word-import-split-baseline/dist-6090a81. |
| P3a–c | Executor, then Lead commits conditionally | Code complete — code/test commits 02eff57, f1f7379, 8a486bb, 4be74c1; project docs committed 98bc154, Trellis specs committed separately 47ac218; final evidence-only docs committed fd97dd6. Worktree clean at fd97dd6; source unchanged since the passing P6 gate at 47ac218. Latest suites: node:test 954, component 6 files / 50 cases. |
| P4 | Browser agent | Blocked — blocked on same credential permission; no live E2E or style screenshots captured (not waived). |
| P5 | Lead | Complete — trellis-check, Haiku, review-code, and read-only security reviews complete, accepted findings resolved; local CSS differential proof found no new regression (BEFORE App inline and AFTER extracted both fail App-scope .el-dialog/header matching due to legacy unmatched rules, while moved child form/checkbox selectors match; not live browser/style screenshot verification). External npm audit blocked (no dependency changes). |
| P6 | Executor, then Lead | Complete — actual final gates passed at 47ac218: npm ci (exit 0), node:test 954, component 6 files / 50 cases, lint 0 errors / 3546 warnings, build 4.12s, backend 1210 passed / 893 warnings; postchecks clean. (P2/P4 browser blocked, not waived; main merge/push/archive/cleanup unapproved.) |

## Roles, authorization, and constants

- **Lead (Opus):** performs P0 (`task.py start`, `set-branch`, worktree creation); obtains start approval including `npm ci` authorization; obtains optional up-front local-commit authorization; dispatches browser/review agents; runs review gates; commits only as authorized; reports to the user. Lead alone invokes `trellis-check`, `/review-code`, and Haiku review.
- **Executor (`trellis-implement`, Sonnet; Read/Write/Edit/Bash/Glob/Grep only):** runs `npm ci` under the start approval, baselines, implementation Steps 1–3, targeted/final suites, size checks, and fixes requested by the lead. It never commits, invokes skills, dispatches agents, or uses browser MCP.
- **Browser agent (general-purpose, Sonnet with chrome-devtools MCP):** captures the baseline before code changes, then performs final E2E/style comparison. It starts/stops only its own backend/browser processes and does not edit source.
- If the user grants up-front local-commit authorization, the lead commits groups A, B, and C at their handoffs. Otherwise leave all work uncommitted; because A and B both modify `App.vue` and interactive staging is unavailable, collapse A+B into one later code commit if/when authorized. Docs remain a separate commit. No merge, push, archive, or worktree deletion without separate authorization.

```bash
SLUG=app-word-import-split
BR=refactor/app-word-import-split
WT=/home/decade/CRF-Editor-app-word-import-split
TASK=/home/decade/CRF-Editor/.trellis/tasks/10-08-app-word-import-split
PY="env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY /home/decade/.venvs/crf-editor/bin/python"
```

At every handoff reconcile `git status --short` against the step inventory. Preserve the pre-existing untracked task directories and `backend/backend.log`; never stage or clean them. If `main` moves from `6090a81`, the lead re-verifies design anchors before execution. If `main` moves after execution starts (for example, `designer-split` merges), the lead merges `main` into the branch before P6 (runbook §2), resolves the expected docs/index conflicts, re-counts the inventory, and re-runs the P6 command set. Do not edit `FormDesignerTab.vue`.

## P0 — Lead: task, branch, worktree, approvals

1. [ ] From `/home/decade/CRF-Editor`, run:

   ```bash
   python3 ./.trellis/scripts/task.py start .trellis/tasks/10-08-app-word-import-split
   python3 ./.trellis/scripts/task.py set-branch .trellis/tasks/10-08-app-word-import-split refactor/app-word-import-split
   ls -ld /home/decade/CRF-Editor
   test ! -e /home/decade/CRF-Editor-app-word-import-split
   git -C /home/decade/CRF-Editor worktree add /home/decade/CRF-Editor-app-word-import-split -b refactor/app-word-import-split main
   git -C /home/decade/CRF-Editor-app-word-import-split rev-parse --short HEAD
   ```

   If the target worktree path or branch already exists, inspect and stop; do not overwrite it. Record base SHA and verify it is `6090a81` or re-baseline all anchors.
2. [ ] The user has accepted the planning artifacts. Obtain start approval for `npm ci` (lockfile restore; no new package) and ask separately whether the lead may make local commits per group. No other tool/package install is planned.
3. [ ] Send the executor the absolute `$TASK` path and Step 0/Step 1 instructions. The executor reads task docs by absolute path; task docs remain untracked in the main checkout per runbook.

## P1 — Executor: install and baseline, then stop

1. [ ] Run the identical baseline/final command set. `npm ci` is authorized only by the user's P0 start approval. Save concise logs/counts under `/tmp/app-word-import-split-baseline/`.

   ```bash
   cd "$WT/frontend" && npm ci
   cd "$WT/frontend" && node --test tests/*.test.js
   cd "$WT/frontend" && npm run test:component
   cd "$WT/frontend" && npm run lint
   cd "$WT/frontend" && npm run build
   cd "$WT/backend" && $PY -m pytest -q
   ```

   Backend suite is last; proxy unsets and venv follow runbook §3. Record node:test counts, component-test files/count, lint errors/warnings, build, and backend passed/failed/xfailed. Frontend coverage is not run: package.json has no coverage provider/script and no dependency may be added.
2. [ ] **RED/GREEN:** no task tests yet; this phase is baseline only. Stop and report to lead. Do not fix baseline failures without lead direction.

## P2 — Browser agent: baseline capture, then stop

1. [ ] On the unmodified `$WT` build from `6090a81`, use the memory recipe `/home/decade/.claude/projects/-home-decade-CRF-Editor/memory/browser-e2e-recipe.md`. Check ports first; use throwaway backend port 8901 and an owned headless-shell process/profile on a free debug port. The browser agent starts/stops only its own processes.
2. [ ] Use production-mode throwaway DB/uploads under `/tmp/app-word-import-split-baseline/`, `CRF_DISABLE_BACKGROUND_JOBS=1`, unset proxy variables, and dev-only auth/bootstrap values in a mode-600 file (never print secrets). Create/use the isolated regular user/project; admins cannot access the designer.
3. [ ] Generate the DOCX through `_write_docx_with_forms(Path(...))` in `backend/tests/test_word_table_parity.py:15–33`. Log in as the regular user, select the project, upload, stop at step 2, and capture the dialog and computed styles for `.form-select-*`, `.docx-ai-global-*`, `.docx-form-*`, `.el-dialog`, and `.el-dialog__header`. Record viewport/theme and retain captures; do not overwrite them later.
4. [ ] No code RED/GREEN in this phase. Report capture paths, selected environment, and any browser blocker to the lead; stop.

## P3a — Executor: Commit group A, readiness bridge + test

**Files:** new `frontend/src/composables/useDesignerFormSelection.js`; new `frontend/tests/useDesignerFormSelection.test.js`; modify `frontend/src/App.vue` only for bridge import/instance and `openDesignerForImportedForm`.

1. [ ] Re-verify App async declaration/ref/lazy activation and `FormDesignerTab.vue` `defineExpose` at design §0. Do not edit `FormDesignerTab.vue`.
2. [ ] **RED first:** write node:test cases, then run:

   ```bash
   cd "$WT/frontend" && node --test tests/useDesignerFormSelection.test.js
   ```

   Expected: import-resolution failure for the missing new composable; allowed under runbook §5 step 4 because the test subject is a new function/file. Record exact output.
3. [ ] **GREEN:** implement per-instance pending-id state and a watcher on `designerRef`. Call immediately if exposed method is ready; otherwise retain only the latest queued id. Clear before awaiting `selectFormById`; no timer/polling/module state. Initialize in App and preserve exact order: close dialog → `activateTab('designer')` → set `activeTab.value` → `await nextTick()` → `await requestFormSelection(formId)`.
4. [ ] Test: null ref queues/no call, later assignment calls once with id; already-set ref calls immediately; latest queued id wins; consumption followed by null/remount does not replay. Use `effectScope` and dispose watchers.
5. [ ] **GREEN:** `cd "$WT/frontend" && node --test tests/useDesignerFormSelection.test.js`.
6. [ ] Size checks:

   ```bash
   wc -l "$WT/frontend/src/App.vue" "$WT/frontend/src/composables/useDesignerFormSelection.js" "$WT/frontend/tests/useDesignerFormSelection.test.js"
   ```

   New file <800 lines; new functions <50 lines; nesting ≤4. Report function sizes. Stop and report RED→GREEN evidence to lead.

### Lead handoff A

- [ ] Review the actual Step 1 diff and status. If and only if up-front local-commit authorization was granted, the lead commits group A: `App.vue`, `useDesignerFormSelection.js`, and `useDesignerFormSelection.test.js`. Otherwise leave the tree uncommitted and proceed; A will be combined with B later.

## P3b — Executor: Commit group B, Wizard extraction + tests

**Files:** new `frontend/src/components/WordImportDialog.vue`, `frontend/src/composables/useWordImport.js`, `frontend/tests/component/WordImportDialog.spec.js`; modify `frontend/src/App.vue`, `frontend/tests/docxBimodalPreview.test.js`, `frontend/tests/basePathDeployment.test.js`, and `frontend/tests/appSettingsShell.test.js`.

1. [ ] Re-verify App.vue:676–992, 1355–1556, 1578–1584, 1711–1778, 1861–1871, 1902–1912 and imports 1–56. Wizard is inside the regular-user branch but outside the selected-project content gate; the child may receive `projectId=null` while mounted. Confirm import removals by searching all App uses.
2. [ ] **RED first:** create `WordImportDialog.spec.js` and run it; import-resolution failure is allowed by the approved §5 step 4 exception because this is a new component subject. Repoint existing source tests before moving production code, but make missing new owners resolve to empty strings so they fail by assertion rather than `ENOENT`/module error. That empty-string fallback is RED scaffolding only: at GREEN, read every owner with plain `readFileSync` so a missing or renamed owner fails loudly and negative guards can never pass vacuously. Add the App session-reset assertion and run:

   ```bash
   cd "$WT/frontend" && npx vitest run tests/component/WordImportDialog.spec.js
   cd "$WT/frontend" && node --test tests/docxBimodalPreview.test.js tests/basePathDeployment.test.js tests/appSettingsShell.test.js
   ```

   Expected RED: new component import resolution; re-pointed source assertions fail against the missing owner by assertion; the `resetSessionState` assertion fails because App does not yet close the wizard. Record each reason/output.
3. [ ] **GREEN implementation:**
   - `useWordImport.js`: use per-invocation `let disposed=false`; register `onScopeDispose(() => { disposed = true; stopAiReviewPolling(); })`. Bail in `pollAiReview` before request and after resolve/reject before state writes or reschedule; `scheduleAiReviewPoll` also bails. Preserve close/open, 3-second schedule, stale-task checks, 404 text, accepted suggestion reconciliation, 10 MiB limit, error messages, exact `temp_id`/`ai_task_id` separation and execute payload. On success keep `api.clearAllCache()` then `refreshKey.value++`. No raw `fetch`.
   - `WordImportDialog.vue`: required `modelValue`, nullable numeric `projectId`, declared emits, `toRef`/`inject('refreshKey')`; move Wizard dialog/template/styles and keyed async compare mount per design. Explicit `Loading` / `UploadFilled` imports. Forward dialog update/close; footer closes emit false; result action emits `open-designer(row.form_id)`.
   - App: keep visibility Ref and reduced open setter; add `showImportWordDialog.value = false` next to `showSettings.value = false` in `resetSessionState()`; mount child at former position within the regular-user branch, outside selected-project gate, with nullable project prop. Remove moved state/functions/watcher/imports/styles and App timer call; preserve other fetches/shared dialog styles.
   - Source tests: `docxBimodalPreview.test.js` re-points acceptance/payload to composable and template/compare bindings to component, retaining assertion strength; add negative App Wizard/old-loop/no-bare-fetch guards. `basePathDeployment.test.js` moves only the upload-action assertion to WordImportDialog and keeps recursive scan. `appSettingsShell.test.js` preserves entry/order/layout tests and asserts `resetSessionState()` closes the wizard.
4. [ ] Mount spec: install spies on the real exported `api` before `mount`; use fake timers, injected `refreshKey`, actual Element Plus/teleport, and `DOMWrapper(document.body)`. Use `vi.mock('../../src/components/DocxCompareDialog.vue', …)` to intercept its async dynamic import; the mock declares all props/emits and exposes controls. Assert it receives `temp-id` and `accepted-suggestions`; emit `toggle-suggestion` and `toggle-form` and assert updated accepted state/payload reaches the composable. Do not stub `el-dialog`, teleport, or Element Plus; warning gate remains active.
5. [ ] Mount behaviors: reopen resets to step 1/no stale data; >10 MiB rejected; upload success → step 2; AI URL uses `ai_task_id`, 3-second polling/merge/reconciliation, close/done/failed stop, 404 message; pending status GET → unmount → resolve `running` → advance fake time ≥3 s → no further GET/no warning; execute exact verbatim `temp_id` + selected indices and only non-empty `ai_overrides`; success step 3/cache clear/refreshKey increment; failure stays step 2; open-designer emits id; action uses `apiUrl()` and headers from real `getAuthHeaders()`; compare stub sees exact `temp-id` and accepted suggestions.
6. [ ] **GREEN targeted commands:**

   ```bash
   cd "$WT/frontend" && npx vitest run tests/component/WordImportDialog.spec.js
   cd "$WT/frontend" && node --test tests/docxBimodalPreview.test.js tests/basePathDeployment.test.js tests/appSettingsShell.test.js tests/useDesignerFormSelection.test.js
   cd "$WT/frontend" && node --test tests/*.test.js
   cd "$WT/frontend" && npm run test:component
   cd "$WT/frontend" && npm run lint
   cd "$WT/frontend" && npm run build
   ```

   Preserve baseline counts plus the planned tests; record existing lint warnings separately.
7. [ ] Confirm App retains `showImportWordDialog`, reduced `openImportWordDialog`, settings entry and bridged `openDesignerForImportedForm`, but not moved Wizard symbols or the old loop. Confirm recursive base-path guard scans all new sources; dialog mount remains `v-if="compareFormData"`.
8. [ ] Size checks:

   ```bash
   wc -l "$WT/frontend/src/App.vue" "$WT/frontend/src/components/WordImportDialog.vue" \
     "$WT/frontend/src/composables/useWordImport.js" "$WT/frontend/src/composables/useDesignerFormSelection.js" \
     "$WT/frontend/tests/component/WordImportDialog.spec.js" "$WT/frontend/tests/useDesignerFormSelection.test.js" \
     "$WT/frontend/tests/docxBimodalPreview.test.js" "$WT/frontend/tests/basePathDeployment.test.js" \
     "$WT/frontend/tests/appSettingsShell.test.js"
   ```

   New files <800 lines; every new function <50 lines; nesting ≤4. Record both composables' function sizes. Do not run repository-wide `npm run format`.
9. [ ] Stop and report RED→GREEN evidence, counts, line/function sizes, and actual file list to lead.

### Lead handoff B

- [ ] Review Step 2 actual diff/status. If up-front local-commit authorization exists and group A was committed, the lead commits group B. If no up-front authorization, do not commit; plan one combined A+B code commit later because `App.vue` is shared.

## P3c — Executor: Commit group C, documentation

**Files:** `frontend/.claude/CLAUDE.md`, `.claude/CLAUDE.md`, `.context/history/archives/claudemd-changelog.md`, `.trellis/spec/guides/cross-stack-contracts.md`, `.claude/index.json`; append decision log at `.context/current/branches/refactor/app-word-import-split/session.log`. README pair only if a listed item changes.

1. [ ] Update component/composable/test entries and verified counts: 18 components, 35 composables, 81 test/support files (72 node `.test.js` + `testProperty.js` + 8 component files). Root currently says 16/32/77. In `.claude/index.json`, add WordImportDialog, both composables and both tests, plus existing omitted `CodelistQuickEditDialog.vue`.
2. [ ] Update App's module description and API Base Path bypass owner. State nine call sites accurately: LoginView (1); App (4 pre-move, 3 post-move: Word export, `_blobDownload`, `/import/auto`, and the upload action moving to WordImportDialog); ProjectInfoTab (3: project-logo GET, profile PUT, org-preset logo GET); DocxScreenshotPanel `pageUrl()` (1). Preserve `useApi.js`'s separate six-fetch-boundary statement. Do not rewrite historical changelog entries; append only the new line/full narrative. Keep root file <40k chars. README only if a listed item changes; otherwise state unchanged.
3. [ ] Record the bridge, disposal guard, session reset close, source-test ownership, and bypass-count decision in the branch session log per `.context/prefs/workflow.md`.
4. [ ] Pure-doc ownership oracle: before edits the search below finds stale App-owned upload-action wording; after docs it must return no match:

   ```bash
   rg -n 'App\.vue.*el-upload.*action' "$WT/.claude/CLAUDE.md" "$WT/frontend/.claude/CLAUDE.md" "$WT/.trellis/spec/guides/cross-stack-contracts.md"
   ```

   Record the baseline hit as documentation RED evidence; do not add a fake code test.
5. [ ] **GREEN docs gates:**

   ```bash
   cd "$WT/frontend" && node --test tests/*.test.js
   python3 -m json.tool "$WT/.claude/index.json" >/dev/null
   git -C "$WT" diff --check
   wc -l "$WT/frontend/.claude/CLAUDE.md" "$WT/.claude/CLAUDE.md" "$WT/.context/history/archives/claudemd-changelog.md" "$WT/.trellis/spec/guides/cross-stack-contracts.md"
   wc -c "$WT/.claude/CLAUDE.md"
   ```

   If either README changes, keep the pair semantically identical. Stop and report docs/test results and changed file list to lead.

### Lead handoff C

- [ ] Review exact docs/index diff and valid JSON. Commit docs as a separate group only if up-front local-commit authorization exists; `.trellis/` archive remains separate.

## P4 — Browser agent: final E2E and style comparison

1. [ ] Use the Step P2 browser recipe and own ports/processes, on the now-updated worktree build. Throwaway backend: port 8901, production mode, DB/uploads under `/tmp/app-word-import-split-e2e/`, `CRF_DISABLE_BACKGROUND_JOBS=1`, proxy variables unset, random dev-only secrets in a mode-600 file; never print secrets. Backend static hosting is request-time, so rebuild does not require restart.
2. [ ] Generate the fixture with `_write_docx_with_forms(Path(...))` in `backend/tests/test_word_table_parity.py:15–33`. Use only the isolated regular user/project; admins cannot access designer.
3. [ ] Flow: regular-user login → choose project → upload → step 2 → open compare and verify screenshot/effect panels → execute → step 3 → “打开设计页” selects the imported form. On a fresh page, do not activate designer before import; this proves first-time async chunk selection. Verify no console errors.
4. [ ] Compare final step-2 screenshot against P2 baseline at identical viewport/theme/content; compare `.form-select-*`, `.docx-ai-global-*`, `.docx-form-*`, and App-owned dialog/header computed styles. Store final captures under `/tmp/app-word-import-split-final/` and report both sets of paths/results. Run AI review only if usable config exists; otherwise report not run. If browser blocked, report the blocker and alternative scope; do not claim live DOM verification.
5. [ ] Stop only browser/backend PIDs created by this browser agent; report E2E and computed-style results to lead.

## P5 — Lead: full review gates

1. [ ] Review the complete branch plus working tree, including untracked files; `git diff --check main...HEAD`, working-tree `git diff --check`, and staged diff check are clean. Do not rely on `main...HEAD` alone before commits.
2. [ ] Dispatch `trellis-check` on Sonnet for the full intended diff and working tree; fix findings through the executor.
3. [ ] Run `/review-code` on the full branch/working-tree diff; resolve or explicitly reject each finding with a reason.
4. [ ] Dispatch read-only Haiku frontend review; it reports only. The lead owns triage. Any code fix returns to executor; any resulting commit is lead-only and requires the same authorization policy.
5. [ ] After fixes, return to executor for P6; rerun applicable gates after each fix. No browser work is delegated to the executor.

## P6 — Executor: final command set, then stop

1. [ ] After all review fixes, run the same command set as P1, in the same order, with logs under `/tmp/app-word-import-split-final/`; backend pytest last:

   ```bash
   cd "$WT/frontend" && npm ci
   cd "$WT/frontend" && node --test tests/*.test.js
   cd "$WT/frontend" && npm run test:component
   cd "$WT/frontend" && npm run lint
   cd "$WT/frontend" && npm run build
   cd "$WT/backend" && $PY -m pytest -q
   ```

   P0 start approval authorizes this lockfile restore. Compare results to P1; no coverage provider is installed, so frontend coverage remains not run.
2. [ ] Send the lead RED→GREEN evidence per new test, baseline/final counts, lint/build/backend outcomes, size/function counts, browser-agent evidence, review findings/disposition, docs touched, and not-run items. Do not commit.
3. [ ] Lead delivers the final report and waits for separate merge authorization. No merge/push/archive/worktree removal until authorized.
