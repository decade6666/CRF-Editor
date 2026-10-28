# A verification evidence: uppercase OID authoring

## Scope and isolation

Executed by A on 2026-10-28 in `/home/decade/crf-editor-uppercase-oids`, base `342d1a39f154ccc402c08d707105095e444931ac`. No commits, merge-to-main, push, deployment, or production data access. The user separately approved random temporary credentials for isolated browser acceptance through AskUserQuestion. Credentials/tokens were not displayed or written to project files.

Browser: task-owned Chrome headless, page 2, own origin `http://127.0.0.1:8912/`; separate temporary SQLite database/upload directory below `/tmp/crf-uppercase-relay.JxXQVJ/`. The existing 8888 service/database was not used. Temporary credential storage is mode 0600 and is not part of Git. No temporary-file deletion was authorized.

## Commands A ran

All frontend commands used an explicit `cd /home/decade/crf-editor-uppercase-oids/frontend`; backend commands used its `backend/` and `/home/decade/.venvs/crf-editor/bin/python`, with proxy variables unset only in the local pytest subprocess.

| Check | Result |
| --- | --- |
| Refreshed baseline backend full pytest + coverage | 1432 passed; 9585 statements, 1250 missed, rounded 87%; 81.03s |
| Refreshed baseline `npm test` | 1046 node:test + 188 mounts / 16 vitest files; exit 0 |
| First review `node --test tests/designerLabelOid.test.js` | Failed as reproduced: 32 passed / 1 failed, obsolete `TEST_copy` vs required `TEST_COPY` at lines 530-531 |
| Targeted backend OID/validation/profile/fields/copy/form-copy/isolation + horizontal guard/restore suites | 251 passed; 14.16s |
| Targeted frontend helper/wiring/autocomplete/length suite | 41 passed |
| Targeted OidUppercase + OidEditSave real mount tests | 30 passed at first review |
| Post-fix full backend `pytest --cov=src --cov=main --cov-report=term-missing:skip-covered` | 1472 passed; 9623 statements, 1222 missed, rounded 87%; 83.73s. Precise coverage improves from 8335/9585 to 8401/9623 (about 86.96% -> 87.30%) |
| Post-fix `npm test` | 1056 node:test + 203 mounts / 17 vitest files, all passed, exit 0 |
| Post-fix `npm run lint` | exit 0, no errors; 2727 warnings = 2720 baseline + 7 newly added formatting warnings (A independently verified the old/current touched sources with no-cache ESLint after R flagged the count) |
| Post-fix `npm run build` | passed, 4.43s |
| `python -m ruff format --check .` | 177 files already formatted |
| `git diff --check` | passed |
| `python -m bandit -r src/` | Could not execute scan: environment has no `bandit` module (command exits 1). No package was installed to hide the blocker |

These full-suite results precede fix round 2. A verified that round changed only the helper docstring (no executable/test change), then reran `pytest -q tests/test_oid_uppercase.py` (**40 passed**, 1.27s), `ruff format --check .` (177 files), and `git diff --check` successfully. No further executable change occurred after the full-suite/browser acceptance.

Dependency setup used the existing lockfile (`npm ci`, exit 0; package files unchanged). npm reported existing advisories: 14 total (12 high, 1 moderate, 1 low, no critical), plus two transitive Node engine warnings. No audit-fix/upgrade was performed. No frontend aggregate coverage percentage was measured because the existing setup has no configured coverage instrumentation; full behavioral/source/mount tests were run without adding dependencies.

## Live browser acceptance

All nine OID controls were exercised through the rendered application and saved through its actual UI. A checked the real DOM value and reread the authoritative API afterwards. Normal input used the browser fill tool; paste-style cases used native `InputEvent` with `insertFromPaste`, not a claim of an operating-system clipboard test.

| Control | Lowercase input | Observed DOM and persisted OID |
| --- | --- | --- |
| Field library | `ab_01.a-b` | `AB_01.A-B` |
| Unit properties | `unit_a` (paste-style) | `UNIT_A` |
| Visit properties | `visit_a` | `VISIT_A` |
| Codelist edit dialog | `cl_edit_a` (paste-style) | `CL_EDIT_A` |
| Codelist create dialog | `cl_new_a` | `CL_NEW_A` |
| Form edit dialog | `form_edit_a` | `FORM_EDIT_A` |
| Form create dialog | `form_new_a` (paste-style) | `FORM_NEW_A` |
| Designer inline form properties | `form_inline_a` (paste-style) | `FORM_INLINE_A` |
| Designer field autocomplete | `designer_fld` | `DESIGNER_FLD` |

Additional live checks:

- A metadata-only field save preserved the loaded `legacy_fld` identifier exactly.
- Unit symbol `kg`, visit name `visit_lower`, new codelist/form names with lowercase, and the original codelist option code `opt_a` were unchanged.
- In the Saimeisi project, loaded `LONG_LEGACY_FIELD` and `LONG_LEGACY_FORM` remained untruncated despite maxlength 8/10.
- **Actual browser keyboard typing** of `abcdefghi` into the field OID produced `ABCDEFGH` (8); typing `abcdefghijk` into the form OID produced `ABCDEFGHIJ` (10).
- Canceling preserved the original long form OID in the API.
- One test-harness attempt looked up visit label `名称` rather than the actual `访视名称`; it failed before editing/saving, was corrected, and the visit case then passed. This was a harness selector error, not an application failure.

No browser-level import/export or historical restore walk was run; those unchanged boundaries are covered by the backend regression suite and mounted candidate/history tests rather than claimed as live-browser coverage.

## Review state

- A inspected every production diff, changed existing test/document diff, and all three new test files.
- Worker scope checks passed: no worker commits, no edits to task/context files (checked against pre-dispatch copies), and all implementation paths stayed in the allowlist. A explicitly added the single necessary `designerLabelOid.test.js` expectation dependency before authorizing its fix.
- F1 obsolete test expectations, F2 internal-document language, F3 missing codelist-edit mount coverage, and F4 helper-docstring accuracy are all resolved and independently verified by A. Two bounded fix rounds were used; the final round was comment-only.
- Relay B: alias `sonnet`, runtime prompt reported `claude-sonnet-5-5` (the channel metadata does not independently expose/verify a resolved model ID). Completion costs were cumulative: 3.1032188 -> 4.0886544 -> **4.19881 USD**, not their sum; fix-round increments were 0.9854356 and 0.1101556 USD. These are Claude Code estimates, not a verified provider bill.
- Dedicated input/security review: ASCII-only conversion after existing schema validation; no Unicode expansion, global ORM/response normalizer, case-insensitive identity merge, SQL interpolation of external data, authorization bypass, or secret logging introduced. Owner/project checks, source/snapshot paths, transaction rollback, and the merged horizontal-table guards remain in place.
- Independent R review completed: **PASS, no blocking defects, eight non-blocking advisories**. A verified that all 39 snapshotted file hashes, HEAD and Git status were unchanged by R. Review identity/cost, limitations, advisories, the corrected lint figure and the complete 30-file implementation/spec list are in `final-review.md`. Both workers and the isolated browser/server have been stopped; no source was auto-fixed after the advisory report.

## Follow-up verification (2026-10-28, user-requested cleanup)

Run by the main session (`claude-opus-5-5[1M]` after context compaction) after the comment/spec/format-only follow-up described in `implement.md`. Logs are under `/tmp/crf-uppercase-relay.JxXQVJ/followup-bboq8791/`. The pre-follow-up state of the 41 relevant files was snapshotted to `before/` first. Afterwards a scope check found 15 changed files, all inside that inventory, with HEAD unchanged.

| Check | Result |
| --- | --- |
| `npm run lint` | exit 0; 0 errors, **2720 warnings** (= baseline; the 7 net-new warnings are gone). Touched sources are back to the 1074-warning baseline. |
| Backend full `pytest --cov=src --cov=main --cov-report=term-missing:skip-covered` | **1472 passed**, 1036 warnings, 83.01s; 9623 statements / 1222 missed (~87.30%, unchanged) |
| `python -m ruff format --check .` | 177 files already formatted |
| `git diff --check` | clean |
| `npm test -- --maxWorkers=1` (serial; verification of record) | **1056 node:test pass / 0 fail; 203 mounts / 17 files passed** |
| `npm run build` (worktree) | passed, 4.27s |
| `npm run build` (main, after the overlay) | passed, 3.23s; dist identical to the worktree build; the `_COPY` marker is in 1 asset |

Default-concurrency vitest (node:test was always 1056/1056):

| Run | Vitest result |
| --- | --- |
| Branch `npm test`, concurrent with the backend suite | 5 failed / 198 passed |
| Branch, rerun of those 5 files only | 1 failed / 75 passed (a different test) |
| Branch `npm test`, idle CPU | 5 failed / 198 passed (a different set) |
| Branch vitest, default | 1 failed / 202 passed (SingleInlineTableGuard) |
| Branch vitest excluding the new `OidUppercase.spec.js` | 1 failed / 187 passed |
| Base main, 4 default runs | 1 of 4 failed (1 / 187 passed, SingleInlineTableGuard); the other 3 passed 188/188 |

Failure types: a 5000ms test timeout, `setValue` on an element not yet rendered, or a request spy not yet called. Failing files varied between runs and included the untouched `CodelistQuickEditDialog.vue`. Load average was 1.31 on 12 cores and run durations were similar (~25s). Conclusion: pre-existing timing flakiness, reproduced on base; not caused by this task. A fix would need test or runner changes, which need separate confirmation, so none was made.

Deployment (main checkout, uncommitted overlay; see `implement.md`): main was clean at `342d1a3` with exactly the 14 runtime files differing. The old `frontend/dist` was backed up to `main-dist-before/` (28 files). The 14 files were copied at 2026-10-28T11:42:19+08:00 and verified byte-identical. A could not restart `crf-editor` itself: `systemctl restart --no-ask-password` returned "Interactive authentication required" and passwordless sudo is unavailable. Initially the service retained MainPID 106195 (started 2026-10-27 14:34:03 CST) and served the rebuilt dist from disk. The user subsequently reported completing the restart; A performed the read-only checks below.

| Post-restart check | Result |
| --- | --- |
| `systemctl show crf-editor -p ActiveState -p SubState -p MainPID -p ActiveEnterTimestamp -p ExecMainStartTimestamp -p NRestarts` | `active/running`, MainPID **409234**, start/active time **2026-10-28 13:08:56 CST**, NRestarts 0; the process is newer than the overlay |
| `ss -ltn 'sport = :8888'` | Port 8888 listening |
| Proxy-free `urllib` GET to `http://127.0.0.1:8888/` | HTTP **200**; returned bytes equal main `frontend/dist/index.html` |
| Python byte/hash comparisons | All **14/14 runtime files** match the task worktree; main/worktree dist hashes match (27 files) |

No login, authenticated API request, credential/config access or production-data write was used for these checks. User testing remains pending. The process-time/source match verifies deployment, not end-to-end OID behavior on the live service.

Not run in the follow-up: browser verification on 8888 (needs the user's real login; the user tests), independent review, frontend coverage measurement, Bandit (module missing, not reattempted).

## User acceptance and finalization recheck (2026-10-28)

The user reported "测试没有问题，收尾" and selected "完整收尾（推荐）" through AskUserQuestion. The fresh wrap-up gate found a blocker; no commit, archive, merge, push or task-worktree/branch removal has been performed.

| Check | Result |
| --- | --- |
| Final backend full pytest + coverage | **1472 passed**, 1036 warnings, 92.46s; 9623 statements / 1222 missed (~87.30%) |
| Final `ruff format --check .` | 177 files already formatted |
| Final frontend serial, first full run | node:test 1056 passed; mounts **201 passed / 2 failed** (OidEditSave and TemplateImportSelection) |
| Those two mount files isolated | **26 passed** |
| Final frontend serial, second full run with backend finished | node:test 1056 passed; mounts **202 passed / 1 failed** (OidUppercase copy-save request missing) |
| Instrumented copy/save diagnostics | An enabled button delivered a native click without a POST or warning/error in one 12-cycle run; later 12-cycle and 60-cycle runs passed. This is not a diagnosed cause or a fix. |
| Final frontend serial, after temporary diagnostic removal | node:test 1056 passed; mounts **202 passed / 1 failed** (OidEditSave new-draft length warning missing) |
| Independently executed `npm run lint` | exit 0; 0 errors / 2720 warnings |
| Independently executed `npm run build` | passed, 3.49s |
| `git fetch origin main` | succeeded; local/remote main both `342d1a39f154ccc402c08d707105095e444931ac`; no push |

**Correction:** the earlier successful serial run is evidence for that run only, not a determinism guarantee. Serial execution also exhibits intermittent failures. No permanent test, runner/dependency or executable business change was made; do not describe these failures as fixed or fully root-caused. The temporary diagnostic is retained outside the repository and no longer collected. Full evidence and the bounded next-step scope are in `finalization-blocker.md`. Finalization is paused pending a focused test-stability investigation.

After the user's bounded three-file repair approval, an instrumented `npm run test:component -- --maxWorkers=1` run passed all three named specs but failed in a fourth file, `SingleInlineTableGuard.spec.js:451` (**202 passed / 1 failed**); no positive timestamp-filter evidence was captured. All temporary instrumentation was removed; no permanent test/business/runner change remained at that pause. Broader investigation then waited for the user's continuation authorization.

## Shared-clock resolution and final green gate (2026-10-28)

The user said "继续" after the proposal to include the fourth spec and shared test environment. The main session measured one real host wall-clock rollback (**-1039ms**) during a 30-second sample while monotonic time advanced **1.121088ms**. A no-business ElButton test with a controlled1040ms rollback reproduced **0 clicks handled instead of1** (RED). Vue's event-attachment timestamp filter and VTU's `Date.now()+1` stamping explain this concrete mechanism. Details/source evidence are retained in `finalization-blocker.md`.

The minimal fix is limited to `tests/component/setup.js`, new `testClock.js` and `testClock.spec.js`: clamp backward real `Date.now` readings per test, preserve explicit fake timers, and restore through the existing cleanup hook. The four previously failing spec files, application runtime, runner config, package manifests and lockfile are unchanged. No assertion or warning gate was weakened.

| Final check | Result |
| --- | --- |
| Deterministic raw-clock rollback reproduction | **RED confirmed**, expected1 / observed0; log `event-clock-backward-red.log` |
| Clock regression + four affected mount specs | **62 passed /5 files** |
| `npm test -- --maxWorkers=1` | **1056 node:test +207 mounts /18 files passed** |
| `npm test` (default concurrency) | **1056 node:test +207 mounts /18 files passed** |
| `npm run lint` | exit0; **0 errors /2720 baseline warnings** |
| `npm run build` | passed, **5.27s** |
| JSON index / diff checks | valid JSON; `git diff --check` clean |

Logs use `clock-fix-*.log` under `/tmp/crf-uppercase-relay.JxXQVJ/`. The earlier failed commands remain recorded rather than being replaced by green claims. Backend final evidence remains 1472 passed /~87.30%; its source is unchanged since that run. The initial feature's isolated live-browser acceptance and the user's 8888 acceptance still apply; this test-only fix does not require changing/restarting production code. Aggregate frontend coverage, Bandit (module unavailable) and fresh authenticated 8888 browser operations remain not run.

## Final review and work commits

A fresh read-only `general-purpose` review (`mount-race-review`, no model override; resolved model/cost not independently exposed by the tool) found **no confirmed blocking issue** in `setup.js`, `testClock.js` and `testClock.spec.js`. It independently checked the installed fake-Date replacement and the `useRealTimers` → `restoreAllMocks` cleanup order; it did not run suites/build/browser flows or review unrelated Git/bookkeeping steps. Main's36-file hash snapshot was unchanged before committing, and no reviewer-authored edits were found.

One non-blocking hardening suggestion remains: if an earlier test's unmount throws and skips the restore hook, the next per-test Date.now capture could retain its own spy. Capturing the original at module scope and adding fake-clock rollback / restored-function-identity assertions would strengthen recovery, but the failing earlier test is already observable; these are not represented as fixed or blocking the green patch. No automatic extra fix round was started.

| Commit | Scope / gate |
| --- | --- |
| `2b82644` |30 feature/runtime/test/docs paths; full local pre-commit gates passed |
| `41a3a7d` |3 test-only clock files; local gates passed |
| `7ae30c0` |3 standalone spec files; local gates passed |

All subjects follow the Chinese Conventional Commits rule with no attribution trailer and no hook bypass. Archive/journal then precede main merge/build/push/cleanup under the approved pipeline. The journal records verified pre-merge evidence and the remaining sequence; subsequent final Git/service receipts are reported in the final response.
