# Verification Record — template-import-refresh

> Implementation worker: single Sonnet worker, worktree `/home/decade/crf-editor-template-import-refresh`,
> branch `fix/template-import-refresh`, baseline `229afe0`. All commands below were run inside this worktree.
> Status: implementation complete, self-checked; **independent acceptance belongs to the main session.**

## 1. Changed-file inventory (complete)

Production (4):
- `backend/src/services/import_service.py` — `_do_import` summary gains `imported_form_ids: []`, appended `new_form.id` after each flush (creation order).
- `backend/src/schemas/template_import.py` — `ImportExecuteResponse.imported_form_ids: List[int] = Field(default_factory=list)` (additive, fresh per response).
- `frontend/src/App.vue` — `executeImport`: capture `targetProjectId` at request start; after success → `clearAllCache` → `refreshKey++` → guarded `requestFormSelection(imported_form_ids[0])`; distinct 「导入已完成，但展示新表单失败」 for post-write handoff failures.
- `frontend/src/components/FormDesignerTab.vue` — `refreshKey` watcher skips its `loadFormFields()` reload while `hasDraft || savingDraft || designerHistory.busy || isReordering` (uncommitted state lives in `formFields`; guard decisions untouched).

Tests (2 new):
- `backend/tests/test_template_import_selection.py` — 6 tests (see §3).
- `frontend/tests/component/TemplateImportSelection.spec.js` — 10 real-mount tests (see §3).

Docs/index (5):
- `README.md`, `README.en.md` — one sentence each in the import-capability bullet (post-import first-form display; cancel keeps original form + draft).
- `backend/.claude/CLAUDE.md` — template-import execute-response contract bullet.
- `frontend/.claude/CLAUDE.md` — App.vue `executeImport` handoff bullet; designer refresh-watcher draft/reorder guard note.
- `.claude/index.json` — two test-path insertions (JSON re-validated).

Task-local: this `verification.md`, plus one `.context/current/branches/fix/template-import-refresh/session.log` entry (implementation root cause + alternatives + risk). No other files touched; `git status` matches this inventory exactly.

## 2. RED evidence (before production edits)

Backend — `/tmp/run_pytest_tir.sh tests/test_template_import_selection.py -q` (proxy vars unset inside the /tmp runner; hermetic conftest):
- 6/6 failed. Failure reasons (meaningful, not harness): 4× `KeyError: 'imported_form_ids'` (service summary), 1× `AttributeError: 'ImportExecuteResponse' object has no attribute 'imported_form_ids'` (schema), 1× `KeyError: 'imported_form_ids'` on the real TestClient HTTP body (response-model filtering would have silently dropped a service-only field).
- One harness mistake found and fixed before counting RED: the HTTP test's patched config lacked `db_path`, producing a masked 500; after the fix the failure was the missing response key above (harness failures are not counted as reproduction).

Frontend — `npx vitest run tests/component/TemplateImportSelection.spec.js`:
- 5/10 meaningful RED:
  1. 「共享刷新不得抹掉未保存的新增字段草稿」— refreshKey bump alone erased the `__draft__` row (canvas field count 3 → 2). This is the demonstrated refresh/dirty guard interaction.
  2. 「导入后取消切换」— with the draft already wiped, `ElMessageBox.confirm` was never called (guard bypassed by the wipe).
  3. 「空项目导入成功」(real App mount + real import dialog + real bridge) — canvas title stayed `null` after a successful import.
  4. 「已有选中表单的项目」— canvas stayed on the previously selected form after a successful multi-form import.
  5. 「写入成功但展示交接失败」— no distinct message existed; a naive handoff inside the import try/catch would misreport as 「导入失败」.
- 5 pre-green guard cases (absent ids / rejected import / stale project / designer-level selection): correctly green before the fix, kept green after; the stale-project case is RED specifically against a guard-less implementation (the ready bridge would replay the pending id in the other workspace and select its same-id form).

Harness findings resolved during authoring (not counted as RED): project selection must click the inner `.project-select-btn`; el-tree checkboxes need `input.setValue(true)`; the main canvas renders the word preview (title `.wp-form-title` + `.word-page` text), while `.fd-canvas-list` exists only in the fullscreen designer; async designer chunk needs settle rounds plus the spec's static import.

## 3. GREEN evidence (final state, after all edits)

Backend (`/tmp/run_pytest_tir.sh …`, Python `~/.venvs/crf-editor` 3.10.21):
- `pytest tests/test_template_import_selection.py` → 6 passed:
  1. multi-form import returns created target ids in creation order; length == count; ids are the target-project rows.
  2. ids resolve to the NEW target rows (name assertion defeats source-id echo); pre-existing rows untouched; target row count == pre-existing + imported.
  3. renamed collision returns the renamed NEW row id, not the existing same-name row; `renamed_forms` non-empty.
  4. zero imports → count 0 and `[]`.
  5. legacy constructor without the new field → `[]`; two instances do not share the default list.
  6. real `POST /api/projects/{pid}/import-template/execute` (TestClient, tmp template `.db`, whitelisted path, owner-authenticated) response carries `imported_form_ids` that resolve to persisted target-project rows.
- Related suites: `test_import_service.py` + `test_import_template_error_mapping.py` + `test_docx_import_contract.py` + new file → 81 passed (post-format re-run), earlier combined run with reorder/history-adjacent suites → 86 passed.
- Full suite + coverage: `pytest --cov=src --cov=main --cov-report=term-missing:skip-covered -q` → **1383 passed, total coverage 87%** (≥80%, no decrease; statistics-only per repo convention).
- `ruff format --check src/services/import_service.py src/schemas/template_import.py tests/test_template_import_selection.py` → all formatted (my test file was reformatted once by pinned `ruff format`, file-scoped only).

Frontend:
- `npx vitest run tests/component/TemplateImportSelection.spec.js` → **10/10 passed** (after the fix; see §2 for the pre-fix 5-RED baseline).
- Full `npm test` (node:test + vitest, run twice — once mid-task, once after every edit): node:test **1007 pass / 0 fail**; vitest **171 passed / 15 files**. This includes `useDesignerFormSelection`, `importRenameFeedback`, `formDesignerAuxiliaryData`, `designerHistory`, `designerNewFieldDraft`, `quickEditBehavior` (busy/undo/reorder/draft contracts stay green) and all real-mount specs (FormDesignerFieldReorder, WordImportDialog, etc.).
- `npx eslint` on the three touched/added frontend files → 0 errors (remaining prettier warnings are the repo-wide pre-existing warning class; my hunks were verified warning-free).
- `npm run build` → ✓ built (twice, final after all edits).

Other: `git diff --check` clean; actual full diff inspected by the worker (self-review only — not independent review).

## 4. Security review (import path, scoped to the diff)

- Response change is additive only: no renamed/reordered/removed fields; `default_factory=list` keeps legacy constructors compatible and existing clients able to ignore the new field; existing request shape, route, `verify_project_owner`, template-path whitelist, read-only `PRAGMA query_only` template session, and transaction all untouched.
- `imported_form_ids` contains only target-project rows created inside this transaction (flush-time ids) — no source-library ids, no cross-project leakage; assertion-locked in tests 1–3 and the HTTP test.
- Frontend adds no new endpoints, no calls outside `useApi`, no storage writes; selection reuses the existing in-app bridge and existing guards; the stale-project guard prevents cross-workspace selection by a late success.
- Checked the AI-guide import/export sync list: `import_docx.py` / `docx_import_service.py` have their own summary/response model (untouched); `TemplatePreviewDialog.vue` consumes only preview endpoints (untouched); `test_rate_limit.py` / `test_ai_review_service.py` mocks patch the Word-import path, not `ImportExecuteResponse` (grep-verified: the only constructor site is `routers/import_template.py:140`).

## 5. Coverage statement

Backend measured: 87% total (1383 passed). Frontend coverage was **not** measured: the repo's vitest setup installs no coverage provider, and the task forbids adding dependencies or changing test scripts; scoped evidence is the 10/10 behavioral mount tests plus the full 171-test component suite and 1007-test node:test suite remaining green. No threshold is claimed for frontend coverage.

## 6. Browser validation — blocker recorded, alternative evidence

**Not performed.** Exact blocker: a live run requires an authenticated session; the only sanctioned isolated backend needs a bootstrapped admin password (a new throwaway credential), which per the 2026-10-15 policy requires formal AskUserQuestion approval that was not given; the existing local-user service (port 8888, main checkout, real `crf_editor.db`) must not be touched or replaced, and its credentials/database must not be inspected. `curl http://127.0.0.1:8888/api/auth/me` → 401 confirms the live service exists but is not usable for this validation.
Alternative validation actually performed (no browser E2E is claimed): real `App.vue` + `FormDesignerTab.vue` mounts under happy-dom driving the genuine dialog → `executeImport` → bridge → canvas path with only network/SortableJS boundaries mocked (§3), plus a real FastAPI TestClient execute-import round trip against a synthetic template database (§3 item 6).

## 7. Known behavior notes (documented, intentional)

- While a form has a draft / in-flight draft save / undo replay / active reorder, a `refreshKey` bump skips that form's field reload; data catches up on the next selection. Template import never mutates existing forms' fields, so the post-import skip cannot show stale imported data.
- `resolveFieldPropLeave`/`isFieldPropDirty` are deliberately NOT part of the watcher guard: the property editor's state lives outside `formFields` and is not clobbered by `loadFormFields`.
- The optional `frontend/tests/templateImportSelection.test.js` source-level guard from `implement.md` was not created: the App→bridge wiring is pinned by real mount tests (stronger than source regexes), and no node:test file was needed.

---

# Correction Round 1 — duplicate unsaved-draft prompts (main-review finding)

> Scope: `FormDesignerTab.vue` (`selectFormById` only), `TemplateImportSelection.spec.js`, this file, session.log.
> Trigger: main-session browser review (`research/browser-duplicate-guard.md`) — one template-import handoff
> rendered **2** real `.el-message-box`「未保存草稿」dialogs; closing one left the other blocking (R3/AC3).

## Root cause

`selectFormById` called `formsTableRef.setCurrentRow(target)` **before** `await selectForm(target)`. The
programmatic `setCurrentRow` synchronously emits `current-change`; `onFormsTableCurrentChange` treats it as a
different-row user click and starts `selectForm(target)` (confirm dialog #1); the explicit `await selectForm(target)`
then starts a second guarded pass (confirm dialog #2). Existing tests asserted `toHaveBeenCalled` (≥1), so the
duplicate passed.

## RED (before the fix)

`npx vitest run tests/component/TemplateImportSelection.spec.js` — strengthened assertions
(`ElMessageBox.confirm` **toHaveBeenCalledTimes(1)** on both the cancel-switch and discard-switch real-designer
`selectFormById` paths, which are the exact programmatic entries shared by template/Word import):

- 「导入后取消切换…」 → failed: `expected "Mock" to be called 1 times, but got 2 times`
- 「导入后确认丢弃草稿切换…」 → failed: same, 2 calls
- 8/10 others stayed green (RED is specific to the duplicate-confirm defect, matching the browser evidence).

## Fix (minimal, single selection authority)

`FormDesignerTab.vue` `selectFormById`: run `await selectForm(target)` **first**; only if the selection committed
(`selectedForm.id === target.id`) sync the table highlight afterwards. The post-commit `setCurrentRow` echo is a
same-id event that `onFormsTableCurrentChange` already ignores; cancel/busy branches keep restoring the original
row highlight themselves (unchanged). Real user row clicks (`current-change` → `selectForm`) are untouched; no
guard, no event suppression, no other file changed.

## GREEN + verification

- Scoped: `npx vitest run tests/component/TemplateImportSelection.spec.js` → **10/10 passed** (once-only confirm on both paths; cancel retains old form + draft; discard renders the imported form).
- Full `npm test` → node:test **1007 pass / 0 fail**; vitest **171 passed / 15 files** — including the two other `selectFormById` consumers (`FormDesignerFieldReorder.spec.js`, `OidEditSave.spec.js`).
- Scoped `npx eslint` on the two touched files → **0 errors** (336 warnings, the repo's pre-existing prettier-warning class; my hunks warning-free). Full-repo lint previously reported 0 errors / 2699 warnings (main session) — warnings are not zero and are not introduced by this change.
- `npm run build` → ✓ built; `git diff --check` → clean; actual diff inspected (two `FormDesignerTab.vue` hunks total: the original refresh-guard + this selection-authority reorder).

## Remaining

Browser acceptance for this correction is owned by the main session (it will rerun the exact browser path from
`research/browser-duplicate-guard.md`); no browser claim is made here.

# Main-session acceptance — 2026-10-16

The implementing Sonnet worker completed one bounded correction round. The main session reviewed the actual production diff and both new test files, re-ran the checks below, and verified the corrected real-browser path. No unresolved blocking defect was found in this task's final diff. This is main-session review separate from the implementing worker, not a claim that another review agent was launched.

## Commands actually rerun by the main session

- Backend: `cd /home/decade/crf-editor-template-import-refresh/backend && /home/decade/.venvs/crf-editor/bin/python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered -q` (the six proxy variables unset in that shell only) -> **1383 passed; total coverage 87%**. Log: `/tmp/crf-tir-main-backend.7IGpM8.log`. This ran before the frontend-only duplicate-confirm correction; no backend production/test file changed in that correction.
- Final frontend: `cd /home/decade/crf-editor-template-import-refresh/frontend && npm test && npm run lint && npm run build` -> **1007 node:test + 171 vitest tests passed**, **lint 0 errors / 2699 warnings**, build passed. Log: `/tmp/crf-tir-main-final-frontend.8KOmld.log`.
- Backend formatting: `python -m ruff format --check src/services/import_service.py src/schemas/template_import.py tests/test_template_import_selection.py` -> 3 files already formatted.
- `git diff --check` -> passed. Actual diff reviewed, including the corrected once-only guarded-selection/highlight ordering.

## Real-browser UI verification (performed, synthetic API only)

This supersedes the worker-only "browser not performed" status above, **but does not claim real-backend browser E2E**. The main session started the worktree Vite app on loopback port 5193 and task-owned Chromium, used the unique isolated browser context `template-import-refresh-review`, and intercepted every `/api` call with synthetic fixtures before the normal app entrypoint loaded. No real database/config/credentials were read, no real/random credential was generated, and the existing port-8888 service was not replaced or logged into.

Verified in the actual rendered App/designer and real Element Plus dialogs:

1. **Empty project + two-template import:** list goes from 0 to 2 forms, the first returned form title appears immediately, and its signature field renders. Passed.
2. **Existing form + unsaved local draft + cancel:** one import handoff yields **exactly one** unsaved-draft dialog; closing it once leaves **zero** dialogs, retains the original title and all 3 fields including the draft, and keeps the imported forms in the list. Passed. Before the correction the same browser walk yielded 2 dialogs and one remained after a single cancel.
3. **Discard draft and continue:** exactly one confirmation; one discard switches to the current import's first returned form and renders its field; zero dialogs remain. Passed.

Browser fixture errors: **0**; unexpected writes outside import endpoints: **0**. Console: **no errors**; an Element Plus radio `label`-as-value deprecation warning was observed in the untouched project-information form and was not modified in this task.

Evidence (local temporary files, screenshots actually read visually):
- `/tmp/crf-tir-browser-evidence.Xf5M3f/final-browser-results.json`
- `/tmp/crf-tir-browser-evidence.Xf5M3f/import-empty-success.png`
- `/tmp/crf-tir-browser-evidence.Xf5M3f/draft-cancel-once.png`
- `/tmp/crf-tir-browser-evidence.Xf5M3f/draft-discard-success.png`

## Security and remaining limits

- Scoped main-session import-security review found no new blocking issue: owner checks, request shape, read-only template access, and transaction handling are unchanged; response ids are newly created target rows; frontend still uses `useApi` and the existing dirty/busy guards.
- **Not run:** real-backend browser E2E (isolated credentials still need formal approval); frontend percentage coverage (no installed provider; no dependency expansion); Bandit scan (not installed). Happy-dom and fixture-browser checks are not presented as full backend E2E or measured frontend coverage.
- No commits, merges, pushes, deployments, worktree/branch deletion, or production-service changes were made. Implementation is accepted in the isolated task branch; publishing/merge/wrap-up remains a separate authorization step.
- Task-owned Vite (5193) and Chromium (9222, verified unique `/tmp/crf-tir-browser.PUn56b` profile and no peer pages) were stopped after evidence capture. Temporary test logs/screenshots/profile are retained outside the repository; no deletion was performed without approval.
