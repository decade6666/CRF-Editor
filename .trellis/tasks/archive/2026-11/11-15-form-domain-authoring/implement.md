# C1 Execution Plan — Validation Accepted, Work Committed / Task Closeout Authorized

## Preconditions

Review parent and child PRD/design; obtain implementation authorization and start this child in its own task worktree. Recheck main and all form-property call sites before changes. No product work is authorized by this planning file.

## Ordered Checklist

1. RED: extend property-state/equality and create/dialog/inline behavior tests for domain, case/blank and failure/cancel. Confirm the missing wiring fails.
2. GREEN: extend the existing state, full-mode inputs, shared persistence and dirty checks; do not change model/geometry or OID normalization.
3. Verify create/save/reopen/clear and leave paths, visits authoritative reload and Word annotation; fix only demonstrated dependency gaps.
4. Update README zh/en, frontend module notes and `.claude/index.json` for the actual entry; preserve the separate standards task.
5. Inspect actual diff; run required tests/lint/build and targeted export checks, review inherited authorization/parity boundaries, then coordinate DevTools acceptance with C5.

## Validation Commands — Future Execution Only

From the child worktree, with declared dependencies installed:

```bash
cd frontend && node --test tests/formDesignerFormPropertyEditor.test.js tests/formDesignerPropertyEditor.runtime.test.js tests/acrfViewToggle.test.js
cd frontend && npm run test:component
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
cd backend && <backend-venv-python> -m pytest tests/test_form_annotation_positions.py tests/test_export_acrf.py tests/test_export_word_errors.py -q
```

Replace `<backend-venv-python>` only after verifying the actual interpreter and test isolation. Add the new targeted domain test path once created; do not claim it already exists. Use backend pytest-cov and the existing frontend coverage provider to show applicable coverage is at least 80% and does not decrease. DevTools steps: full-mode domain entry → save/reopen → designer and visits aCRF → matching Word; cancel/error/blank and brief-mode entry absence.

## Review / Rollback Gates

R1: all caller models/dirty baselines updated together. R2: save failure/leave guards preserve input. R3: no identifier or renderer behavior drift. Rollback is source revert only; preserve domain values. C4 cannot edit the same save files concurrently. Record run/not-run/failed/blocked accurately; no commit/merge/deploy without separate authorization.

## Execution Evidence — 2026-11-15

- User authorized C1 only in `/home/decade/crf-editor-c1`, branch `task/crf-c1`; no nested worktree. Initial HEAD equaled local main (`cc7e1cd`); C1 has no hard predecessor. Only `task.py start .trellis/tasks/11-15-form-domain-authoring` was called. No commit/merge/push/archive/worktree deletion or next-child start; `task.json` stays `in_progress` because lifecycle/Git closeout remains separately unauthorized.
- RED: property helper suite → 3 failed / 15 passed; new mount suite → 24 failed / 1 passed, proving absent snapshot/equality and inputs before product edits. GREEN extends two existing frontend source files only. Backend production source, model, schema and annotation geometry remain unchanged.
- Added 25 real component cases and 23 backend regressions; updated helper tests, README zh/en, root/module notes, file index and frontend state spec. No dependency, runner, build-script, CI or release-process change.

### Commands Run / Results

Backend commands used `/home/decade/.venvs/crf-editor/bin/python`, unset the six proxy variables for localhost and set `CRF_DISABLE_BACKGROUND_JOBS=1`; conftest isolation was inspected and its guard suite passed. Commands below ran from the corresponding module inside this worktree.

| Command / scope | Result |
| --- | --- |
| `node --test tests/formDesignerFormPropertyEditor.test.js tests/formDesignerPropertyEditor.runtime.test.js tests/acrfViewToggle.test.js` | 54 passed after implementation |
| `vitest run tests/component/FormDomainAuthoring.spec.js --maxWorkers=1` | 25 passed; an initially missing mock URL for a newly created form was corrected without changing product logic |
| `npm test -- --maxWorkers=1` | 1076 node:test + 403 vitest passed |
| `vitest run --maxWorkers=1 --coverage --coverage.reporter=json-summary --coverage.reporter=json --coverage.reporter=text-summary --coverage.reportsDirectory=<temporary-report-dir>` | 403 passed; component-only global lines 68.41% → 69.17%, statements 64.12% → 64.84%, branches 58.31% → 59.25%, functions 67.91% → 68.71% |
| `node --test --experimental-test-coverage --test-coverage-include='src/composables/formDesignerPropertyEditor.js' tests/*.test.js` | 1076 passed; helper lines/functions 100%, branches 86.71% → 86.96% |
| Actual `git diff --unified=0` versus Vitest JSON statement maps | Changed executable statement-start lines: component 9/9, helper 1/1; no coverage exclusions/config changes |
| `python -m pytest --cov=src --cov=main --cov-report=term:skip-covered --cov-report=json:<temporary-report> -q` | Baseline 1660 passed, final 1683 passed; backend full lines 88.989053% → 88.998252% |
| `python -m pytest tests/test_form_domain_authoring.py tests/test_form_annotation_positions.py tests/test_export_acrf.py tests/test_export_word_errors.py tests/test_test_environment_isolation.py -q` | 58 passed; actual DOCX, plain/annotated tables, foreign and unauthenticated rejection |
| `npm run lint` / `npm run build` | Passed; lint 0 errors / 2807 warnings, not suppressed/broadly reformatted; build retains chunk-size warnings |
| `python -m ruff format --check tests/test_form_domain_authoring.py` / `python -m py_compile tests/test_form_domain_authoring.py` | Passed |
| `git diff --check` / `python3 -m json.tool .claude/index.json` | Passed |

Initial frontend baseline could not load Vitest before declared dependencies were installed. `npm ci --ignore-scripts --no-audit --no-fund` installed the existing lockfile only (engine/deprecation warnings; no manifest/lockfile change). Concurrent baseline coverage had 3 existing 5-second timeouts; the single-worker unchanged-source baseline passed all 378 cases. No warning suppression or weakened test assertions.

### Real Browser / Word Evidence

Separate AskUserQuestion consent authorized random disposable credentials plus an isolated backend/browser. Real login and all UI interactions used new private `/tmp` resources, backend 8915 and this worktree's built assets, never real DB/config/secrets/uploads, production service or 8888. Background jobs were disabled; config/DB/upload/DOCX-temp paths were redirected before app import. Credentials/token were handled privately and never printed.

Chrome DevTools verified create/edit/inline save/reopen with case-preserving free text, whitespace clear→null and omitted marker, cancel with unchanged persisted domain, offline failure retaining input/dirty state, Basic-mode input absence, designer/visits saved-domain agreement and eCRF with zero annotations. Captured and visually inspected 1440×960 and 390×844 screenshots: domain input and Save stay inside the viewport. The sole console error was the deliberately emulated offline request.

The real Word endpoint exported the same saved form. XML contains `dM / Vs；自定义 <域>` in aCRF only; eCRF has no annotation boxes. DOM extraction removes annotation nodes and recovers fill-line underscores using the existing 0.5em/character rule. Existing `compare_table_field_forms` passed both target-form comparisons: 1/1 form, 1/1 row, 2/2 cells, zero mismatches. An initial whole-project CLI comparison failed because only one selected form was captured while export also included an unrelated empty second form; retained as failed evidence, not relabeled a full-project pass.

Private evidence directory: `/tmp/crf-c1-validation.jA5odP`. Non-secret evidence includes `domain-desktop.png`, `domain-mobile.png`, `target-form-parity.json`, `word-domain.json`, `coverage-analysis.txt` and test/build/lint logs. Independent-review disposition and resource cleanup are recorded in the final handoff.

### Review / Resource Handoff

- Main session inspected the actual product/test/documentation diff and completed the scoped security review (existing owner guards, Vue text interpolation, Word XML escaping, no new auth/storage/upload paths). Independent read-only reviewer `c1-review` returned no verified defects or mandatory fixes; they did not independently rerun tests/build/browser.
- `gitleaks stdin --config .gitleaks.toml --redact --no-banner` passed for the complete tracked diff and each new test file, with no leaks. Official `task.py validate` passed; oversized cross-stack source sections were located/read directly, not assumed from truncated injection. The newly added domain spec was compressed without removing its seven contract sections to keep the implement-context file within the injection budget.
- Through a second AskUserQuestion, the user chose to stop the two task-owned processes and retain evidence. Both 8915 backend and 9222 browser background jobs were stopped; socket checks confirmed neither listener remained. `/tmp/crf-c1-validation.jA5odP` remains mode 0700 and contains test credentials/DB/profile as well as non-secret evidence. No temporary files were deleted and no production service was touched.

## Relay Extension — Frontend Coverage Only (2026-11-15)

### Authorization / Ownership

The user explicitly invoked `/trellis-relay 使用sonnet执行` and confirmed via AskUserQuestion that the current main model may remain A and that B may expand frontend tests to raise **component-suite global LINE coverage to ≥80%**. Statements/functions/branches must not decrease from the C1 pre-relay baseline (64.84% / 68.71% / 59.25%; lines 69.17%). This supersedes the earlier no-unrelated-coverage-expansion restriction for this bounded test-only slice; it does not authorize product behavior changes or another child.

- A owns planning, review/acceptance, all git history, docs/index/spec/task artifacts and `relay-state.md`; A does not edit B's tests while B is running.
- B is the sole test writer. Exact writable files (all new/unoccupied at dispatch):
  - `frontend/tests/component/AdminViewBehavior.spec.js`
  - `frontend/tests/component/OrganizationManagementBehavior.spec.js`
  - `frontend/tests/component/CodelistsTabBehavior.spec.js`
  - `frontend/tests/component/FieldsTabBehavior.spec.js`
  - `frontend/tests/component/UnitsTabBehavior.spec.js`
  - `frontend/tests/component/FormDesignerManagement.spec.js`
  - `frontend/tests/component/LoginViewBehavior.spec.js`
  - `frontend/tests/component/FormDesignerEditing.spec.js`
- B alone may write `.trellis/tasks/11-15-form-domain-authoring/relay-progress.md`. Every other task artifact is read-only to B. Existing tests and helper/infrastructure files are read-only; no changes to `setup.js`, warning/clock gates, mocks shared by other suites, application code, configs, package/lock files, runners, build/release or CI.
- Worktree/branch: `/home/decade/crf-editor-c1`, `task/crf-c1`; base `cc7e1cd1872f986530b03f659bd5c187ad55683c`. Preserve all pre-existing C1 dirty/untracked changes. No commit/merge/push/archive/deletion/cleanup/next-child start. No real DB/config/keys/uploads, production/8888, browser/service launches or actual credential generation. Tests use isolated synthetic boundary mocks only.

### Backend / Estimate / Resume Policy

Native background, one installed `trellis-implement` using the compatible native `model: sonnet` input, normal hooks, no conversation fork, no nested agent or worktree. Requested B: Sonnet; resolved runtime model is recorded only if exposed. No Channel needed: duration is **unknown**, because no reliable estimate exists for eight new real-component behavior suites and their validation/debugging. R after successful A review: requested `fable`, fresh read-only native agent; actual model/telemetry only as exposed. A model remains the user-approved current `gpt-6.1-sol[1M]` environment identity.

A's durable runtime handle and logical fix-round counter live in `relay-state.md`; B updates only its bounded progress snapshot at stage transitions, before/after long tests and on blockers. At most two logical repair rounds; lifecycle or permission failures are reported, never bypassed/replaced silently.

### Ordered Steps / Evidence

1. Load normal Trellis context, package rules and frontend real-mount conventions. Read existing `tests/component/setup.js`, API-boundary spy patterns and the corresponding target components. Baseline: `/tmp/crf-c1-relay.fMagTU/coverage-baseline.json`; existing C1 tests remain intact.
2. Add real mounted behavior tests at the eight approved paths as needed, prioritizing AdminView / organization CRUD and failure/cancel flows, then list/card/form management and designer gaps. Drive actual controls; assert visible state, requests, payloads and no-write outcomes. Mock only external boundaries. Do not mock tested components or call private setup handlers just to inflate coverage. This slice tests existing behavior; do not fabricate RED or weaken behavior to obtain green. A discovered production bug is an Open Question/blocker, not permission to fix source.
3. Run focused new suites, then full unchanged-configuration coverage. Stop once line coverage is ≥80% and other totals are non-decreasing; do not use include/exclude/reporting tricks, ignore pragmas, skipped tests or warning suppression. If the finite file scope is insufficient, report the actual gap rather than expanding it.
4. Run `npm test -- --maxWorkers=1`, `npm run lint`, `npm run build`, `git diff --check`; write reports only under `/tmp/crf-c1-relay.fMagTU/`. Do not install anything. Verify HEAD unchanged and all writes confined to the assigned files/progress path. Return compact English sections `Files Modified`, `Verification Results`, optional `Open Questions`, ≤25 lines; no diffs/full logs/transcript.
5. A inspects actual deltas against the external snapshot, reruns validation with its own reports, and runs a fresh independent read-only R with a quiescent write set. A synchronizes file inventory/docs if needed. Acceptance only after all required gates pass; no commit or task archival is authorized.

### Exact Validation Commands (from this worktree's frontend/)

```bash
./node_modules/.bin/vitest run tests/component/AdminViewBehavior.spec.js tests/component/OrganizationManagementBehavior.spec.js tests/component/CodelistsTabBehavior.spec.js tests/component/FieldsTabBehavior.spec.js tests/component/UnitsTabBehavior.spec.js tests/component/FormDesignerManagement.spec.js tests/component/LoginViewBehavior.spec.js tests/component/FormDesignerEditing.spec.js --maxWorkers=1
./node_modules/.bin/vitest run --maxWorkers=1 --coverage --coverage.reporter=json-summary --coverage.reporter=json --coverage.reporter=text-summary --coverage.reportsDirectory=/tmp/crf-c1-relay.fMagTU/b-coverage
npm test -- --maxWorkers=1
npm run lint
npm run build
```

If B does not need all eight files, the focused command includes only files actually created; full-suite collection and coverage configuration remain unchanged. Reports must distinguish run/pass/fail/not-run/environment-blocked. Existing browser evidence covers unchanged C1 product code, not unperformed new browser acceptance of every newly covered management flow.

### Pre-Relay Gate / Not Run (Historical Baseline)

At the initial C1 handoff, frontend component-wide global coverage remained below 80%. Changed-code coverage was 100% and all measured totals were non-decreasing, but neither substituted for the overall ≥80% requirement. The subsequent user-authorized Relay Extension above permits the bounded coverage-test expansion; the task remains unarchived until actual acceptance.

Not run: real-data 54-form fixture, Word/WPS GUI side-by-side, `/crf/` browser deployment, production actions, project/system restoration, dependency upgrades, new runner/CI/release changes, commit/merge/push or task/worktree cleanup. Current evidence is not the future C5 integrated regression or C4 conflict protection.

## Relay A Verification — Accepted After Fresh Read-Only Review

- B returned the eight authorized new suites (158 cases); native runtime metadata confirms the implementer is idle. A's initial scope audit found only these files and B's progress record added, with all 111 existing source/test hashes, the tracked pre-dispatch patch, and HEAD unchanged. A subsequently updated only its owned docs/index/operational records; these are accounted separately, not attributed to B.
- A independently ran the exact eight-suite focused command (158 passed), `npm test -- --maxWorkers=1` (1076 node:test + 561 vitest cases across 34 component files, no skipped/cancelled/todo tests), and the full unchanged-configuration coverage command. Reports: `/tmp/crf-c1-relay.fMagTU/a-focused.log`, `a-full.log`, `a-coverage.log`, and `a-coverage/coverage-summary.json`.
- Global component coverage: lines **69.17% → 81.41% (4986/6124)**; statements 64.84% → 76.87% (5683/7393); functions 68.71% → 82.02% (1830/2231); branches 59.25% → 67.90% (3982/5864). A verified identical collected source paths, every per-file and global denominator, zero skipped coverage, and no per-file metric regression. This satisfies the authorized global-line gate; it does not claim four metrics all exceed 80%.
- A ran `npm run lint` (0 errors / 2807 existing warnings), direct ESLint on all eight new files (clean), and `npm run build` (passed). Reports: `a-lint.log`, `a-new-tests-lint.log`, `a-build.log`. Existing Vite HTML-nesting warnings remain visible in component runs; no warning suppression or unrelated reformatting was added.
- A rechecked all 111 pre-existing hashes and protected package/lock/Vite/Vitest/setup/warning/clock files after validation: unchanged. All ten task-added test paths exist and occur once in `.claude/index.json`. An initial auxiliary path probe incorrectly treated the pre-existing documented runtime directory `backend/uploads/docx_temp/` as required source; the corrected probe checks this task's new inventory entries and passed, without creating or reading runtime resources.
- A's `gitleaks stdin --config .gitleaks.toml --redact --no-banner` scan passed for the complete tracked diff, ten new test files and two relay records (no leaks). `git diff --check`, index JSON parsing and official `task.py validate` passed. The existing 132424-byte cross-stack spec still warns about injection truncation; required sections were read directly, and the newly edited frontend state spec remains below 32768 bytes.
- No new backend, browser or Word run was needed for this test-only extension: original A-run C1 results above remain the evidence for unchanged product code. New management tests are real component mounts with mocked external boundaries, not browser-level or backend authorization proof. No service, credential, dependency, release, git-history, task-archive or next-child operation occurred.
- Fresh native read-only R (`c1-relay-review-fable`) returned PASS with no blocking defect. A independently confirmed all 141 pre-review hashes, raw git status, tracked diff and HEAD were unchanged, and runtime metadata showed R idle. Only then did A resume edits to this acceptance record and `relay-state.md`. Review record: `/tmp/crf-c1-relay.fMagTU/r-review.md`.
- Model/cost disclosure: B requested `sonnet`, resolved model not exposed; R requested `fable`, reports system-prompt identity Fable 5.2 / `claude-fable-5-2`, without separate provider-resolution telemetry. Native usage/cost telemetry is not exposed for either; no invented totals, Channel costs or fallback. Logical repair rounds used: 0/2.

### Non-Blocking Review Items Retained

No non-blocking-only repair round was opened; B's test slice and C1 product code remain unchanged after review.

| Location | Finding / disposition |
| --- | --- |
| `frontend/src/components/FormDesignerTab.vue:677` | Live-target domain comparison can replay an untouched stale domain after another writer's value is merged through an annotation response. C4 owns atomic stale-write protection (parent R5/R11; child `design.md:19`); C1 does not claim concurrent-edit safety. Future C4 work must consider hydration-baseline omission together with its approved precondition, not silently expand C1. |
| `frontend/tests/component/CodelistsTabBehavior.spec.js:158` | Shared ids in both project fixtures allow row-key reselection, so the test does not prove distinct-project selection clearing; the index-identity comment is inaccurate. Lines 336–343 also install a dead overwritten mock. |
| `frontend/tests/component/FieldsTabBehavior.spec.js:302` | A no-confirm spy installed after the action weakens the negative assertion; install before action when this suite is next improved. |
| `frontend/tests/component/FormDesignerManagement.spec.js:317` | List length/name do not establish retained selection; assert selected-form observable state. |
| `frontend/tests/component/FormDesignerEditing.spec.js:203`; `OrganizationManagementBehavior.spec.js:253` | Persistent dialog DOM existence does not prove the dialog remained open; assert visibility/modelValue. Editing-suite header also conflicts with its fullscreen setup. |
| `LoginViewBehavior.spec.js:116`; `AdminViewBehavior.spec.js:130,615`; `UnitsTabBehavior.spec.js:142`; `frontend/tests/formDesignerFormPropertyEditor.test.js:152` | Align titles/comments and assertions: generic-error fallback, empty-table claim, cleanup-policy PUT, retained-vs-cleared selection, and stale three-fields wording. |

### Final Acceptance / Limits

C1 implementation and the authorized global-line coverage extension are accepted within the approved single-session scope. All required A-run gates and fresh independent review passed; retained findings above are non-blocking, not silently fixed. At acceptance, `task.json` stayed `in_progress` because Git/lifecycle closeout was not yet authorized. The user's subsequent explicit request, “提交然后收尾”, authorizes the scoped commits, C1 archive and journal described below. No other child was started.

R did not independently rerun commands or inspect private browser evidence. The post-expansion default-parallel `npm test` was not run; the approved `--maxWorkers=1` command passed. Management-flow evidence is happy-dom component mounting, not new browser E2E or backend authorization proof. Original A backend/browser/Word checks remain accurately scoped above, including the failed initial whole-project parity capture and passing target-form comparisons. Real-data fixture, Word/WPS GUI, subpath browser deployment, C4/C5 integrated acceptance and production/restoration operations remain not run. Evidence and task-owned stopped-service artifacts are retained outside the repository; no secrets are included in this handoff.

## Authorized Commit / Task Closeout — 2026-11-15

- The user explicitly requested “提交然后收尾”. Commit and close only C1 on `task/crf-c1`; do not merge/push main, remove a branch/worktree/evidence, start C4 or fix the retained non-blocking review items.
- Fresh pre-commit audit confirmed the accepted product/test/doc files were unchanged, the index was empty, the write set was exactly 19 project + 6 Trellis files, no parallel writer was active, and the C1 archive destination was free. Recovery snapshot and execution board: `/tmp/crf-c1-relay.fMagTU/closeout-before/`, `closeout-board.md`.
- Project commit: `c4ce7e22dc27670edc5c78f1ea47efea2b7741c1` — `feat(form): 补齐表单域编辑并完善组件回归覆盖` (19 project source/test/doc files, no `.trellis/` paths). Pre-commit gitleaks, whitespace and Python syntax gates passed. Ruff was absent from hook PATH, so A separately ran `/home/decade/.venvs/crf-editor/bin/python -m ruff format --check backend/tests/test_form_domain_authoring.py`; it passed.
- Commit the six Trellis spec/task acceptance paths separately before archive. Use the installed scripts' existing `--no-commit` options for archive and journal, followed by explicit scoped Chinese `chore(task)` / `chore(journal)` commits: their default English subjects conflict with the repository's Chinese-description convention. Do not edit scripts/config or bypass hooks.
- `task.py archive` records completed status/date and clears C1 session pointers without merging branches. Archive only this child; preserve the parent's child link. `add_session.py` references the work/spec commits, not the archive commit, with a C1-specific idempotency key; no new implementation starts. Final hashes, archived path, journal and remaining boundaries are verified/reported at closeout.
