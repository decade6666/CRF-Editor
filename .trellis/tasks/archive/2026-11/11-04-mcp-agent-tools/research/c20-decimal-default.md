# C20 — Empty Numeric Precision and Formula-Placement Analysis

Date: 2026-11-09. Executor: main session, inline. This is an independently authorized follow-up, not an automatic extension of C19.

## Authority and Scope

The user explicitly requested changing empty decimal precision from two displayed places to zero, and asked whether a missing age-calculation note was an agent or MCP problem. C20 supersedes C19's no-further-repair limit only for this bounded rendering change and its tests/documentation; it does not authorize deferred findings, new tools, or note-export changes.

- Production scope: only the numeric fallback in `backend/src/services/export_service.py::_render_field_control` and `frontend/src/composables/useCRFRenderer.js::renderCtrl`.
- Tests: existing `backend/tests/test_export_service.py` and `frontend/tests/columnWidthPlanning.test.js`.
- Documentation: the existing preview/export contract §5, the two READMEs, and backend/frontend module pointers; no new API, schema, model, dependency, runner, threshold, or fixture architecture.
- Records: PRD/implementation board, this report, and the branch decision log. Per the existing history rule, the oversized prior decision log is preserved byte-for-byte in `.context/history/archives/mcp-agent-tools-session-pre-c20-20261109.md` before replacement with a short archive pointer and the new decision.
- Do not rewrite stored `decimal_digits`, approve/apply the user's shared proposal, alter `help_text` export, mutate the user's acceptance project, touch 8888/systemd/real configuration/database, commit, merge, push, archive the Trellis task, or clean up retained artifacts.

## Behavior Contract

- An absent/NULL decimal precision displays as zero fractional places in all shared preview paths and both normal/inline Word tables.
- Explicit zero remains integer-only; explicit positive precision and unit suffixes retain their behavior.
- Persisted NULL stays NULL. This is a display-rule change for all numeric fields, not an AGE-specific mutation or a workaround around shared approval.

## Execution Board

| State | Step |
| --- | --- |
| Done | Locate the two defaults, inspect existing tests/specs, back up targets, and inspect only AGE note presence in the authorized isolated database |
| Done | Capture passing pre-change frontend source-suite/renderer coverage baseline; retain C19 backend coverage baseline |
| Done | Add numeric precision regression cases; RED reproduced two NULL export failures and two absent/NULL preview failures before production edits |
| Done | Change exactly the two fallback values; targeted GREEN10/backend1658/frontend1078+232 pass; coverage non-decrease, format/lint/build and actual-diff review pass |
| Done | Synchronize docs/spec; load the new build on 5174 without reseeding, verify unchanged project fingerprint, inspect the actual desktop preview screenshot, export a real aCRF, and verify Windows HTTP |

## Formula Analysis — Verified Facts

- Only the authorized isolated database `/tmp/crf-mcp-lan-20261109-OI9Kln/crf_editor.db` was opened, using SQLite `mode=ro`.
- The bounded query selected project 1, form `DM`, definition OID `AGE`. Instance 4 has non-empty `help_text` (33 characters, containing the age keyword), with `integer_digits=3` and `decimal_digits=NULL`. No formula text, account, password, token, private agent table, or real database was returned or inspected.
- MCP accepts `FormFieldInstancePatch.help_text`; the agent instance update forwards it through `InstanceUpsert`, whose explicitly supplied properties are persisted by `_apply_instance_upsert`.
- The Word exporter contains no `help_text` consumer. Label rows are exported by `_add_label_row` / `_fill_structure_row_cell`, but the `DM` form has zero label rows. Structural-label authoring is outside the ten-tool increment.
- Conclusion: the note was persisted, not lost by MCP transport. The agent selected a non-exported instance property; a complete Word replica additionally requires an exportable representation not writable by the current MCP tool set. This is a placement/capability boundary, not evidence that MCP silently dropped the formula. No note-export change is authorized by this analysis request.

## Evidence and Pending Results

- Recoverable pre-edit snapshot: `/tmp/crf-mcp-decimal-20261109-rnPUoh/files/`.
- Prior decision-log SHA-256: `0ac5d882230d79280678d8adb1de0b4b1d237e49d77c21193a2f1f8e8e4b6af7`.
- Backend baseline `.pytest-tmp/mcp-agent-tools/backend-c19-suite.json`: total 10047/11390; export module 1098/1242.
- Frontend baseline command: `TMPDIR=<task-temp>/tmp node --test --experimental-test-coverage --test-coverage-include=src/composables/useCRFRenderer.js --test-reporter=spec --test-reporter-destination=stdout --test-reporter=lcov --test-reporter-destination=<task-temp>/reports/frontend-before.lcov tests/*.test.js`; exit 0. Exact totals are recorded after parsing the completed report.
## Actual Verification Results

Commands were pinned to this worktree's `backend/` or `frontend/`. Backend invocations unset child proxy variables, set task-local TMPDIR/cache/coverage/Hypothesis paths, disable bytecode/background jobs and use `/home/decade/.venvs/crf-editor/bin/python`; existing conftest isolates config/database/uploads/screenshots. No production config or database is accessed.

| Command / check | Actual result |
| --- | --- |
| `python -m pytest -c pytest.ini tests/test_export_service.py::test_export_numeric_precision_defaults_to_zero_without_mutating_definition -q --tb=short --show-capture=no` before fix | RED: 2 failed (NULL normal/inline), 8 passed; extra two-place suffix reproduced |
| `node --test --test-name-pattern='numeric precision' tests/columnWidthPlanning.test.js` before fix | RED: 2 failed (omitted/NULL), 4 passed |
| Same backend selection after the two-default fix | 10 passed, 1 existing warning, 0.90s |
| `node --test tests/columnWidthPlanning.test.js` after fix | 64 passed, 0 failed, 0 skipped |
| `python -m pytest -c pytest.ini tests --cov=src --cov=main --cov-report=term-missing:skip-covered --cov-report=json:<reports>/backend-after.json --cov-fail-under=80 -q --tb=short --show-capture=no` | 1658 passed, 1309 existing warnings, 114.29s; exit 0 |
| Full node:test command above with `frontend-after.lcov` | 1078 passed (baseline 1072), 0 failed/skipped; 2.15s |
| `npm run test:component` | 20 files / 232 tests passed; 29.61s |
| `python -m ruff format --check .` | 197 files already formatted |
| `npm run lint` | Exit 0; 0 errors / 2819 existing warnings, no fixes applied |
| `npm run build -- --outDir /tmp/crf-mcp-decimal-20261109-rnPUoh/frontend-dist` | Pass; 1544 modules, 5.83s. Expected warning: external output directory is not automatically emptied. Existing worktree dist was not overwritten. |
| `git diff --check`, JSON parsing, module-link checks, exact §5 prefix/suffix comparison and archive/backup byte comparison | Pass; other cross-stack contracts unchanged; task stays in_progress |

`<reports>` is `/tmp/crf-mcp-decimal-20261109-rnPUoh/reports`. Logs and JSON/LCOV are preserved there. The production source delta is exactly one numeric fallback literal per renderer; no new helper or abstraction was introduced.

### Exact Coverage Gates

| Scope | Before | After | Gate |
| --- | --- | --- | --- |
| Backend total | 10047/11390 = 88.208955% | 10059/11390 = 88.314311% | PASS |
| Export service | 1098/1242 = 88.405797% | 1110/1242 = 89.371981% | PASS |
| Existing 12 agent modules | 1566/1682 = 93.103448% | 1566/1682 = 93.103448% | PASS |
| Frontend renderer lines | 585/595 = 98.319328% | 585/595 = 98.319328% | PASS |
| Frontend renderer functions | 55/57 = 96.491228% | 55/57 = 96.491228% | PASS |
| Frontend renderer branches | 222/253 = 87.747036% | 225/256 = 87.890625% | PASS |

Ratios are compared with integer cross-products. Frontend metrics are specifically `useCRFRenderer.js`, not a claim about whole-project frontend coverage.

## Real Running-App Verification

- The original temporary PID 5027 had exited when the browser walk began. Its preserved log contains no ERROR/Traceback marker; the exit cause is not established, and no application failure cause is invented.
- Before resuming, made an online SQLite backup of the isolated acceptance database to `/tmp/crf-mcp-decimal-20261109-rnPUoh/files/acceptance-before-restart.db` (0600), plus copies of the existing runtime launcher and public metadata. No database values or credentials were printed.
- Added explicit `--resume` support only to the disposable `/tmp/crf-mcp-lan-20261109-OI9Kln/serve.py`: require the existing database/login file, skip seed creation, keep the original login file, use the isolated new frontend build and the existing isolation configuration, and record a pre-start project fingerprint. The new process runs independently of the launch command (PID 52940); no project runner, systemd or 8888 change.
- Normal startup completes, and read-only comparison verifies project 1's fingerprint is identical before/after restart. AGE still has NULL decimal precision and its 33-character note; no shared proposal was approved/applied and no metadata was rewritten by this display fix. Browser sessions may need to sign in again because the disposable signing key changes on resume.
- WSL HTTP returns 200. Windows `curl.exe --noproxy '*'` requests to `localhost:5174` and the Windows LAN address both return HTTP200 with the application root; no network rules were changed in C20.
- Started the existing cached Linux headless Chrome with an isolated profile and loopback-only CDP. Authenticated only the owned acceptance page through the normal login endpoint, then clicked the test project, Forms tab and demographics form. Temporary login values are read programmatically only for these authorized local smoke checks, never put in tool arguments/output or screenshots.
- At 1600×1100, the real designer preview's AGE cell is exactly `|__||__||__| 岁`. Captured only the Word-preview region (no account/token UI) to `<reports>/age-c20-preview-desktop.png`; main opened and visually inspected the image. The initial default small-browser capture is also retained, not presented as desktop evidence.
- A real authenticated `POST /api/projects/1/export/word` with `annotated=true` returns an aCRF whose AGE cell is exactly `|__||__||__| 岁`. Artifact: `<reports>/age-c20.acrf.docx`. This proves the running backend has loaded the fix rather than relying only on source/unit tests.

## Review, Security and Not Run

- Main reviewed the actual source/test and documentation diffs, null/explicit-value behavior, shared consumers, input immutability and unit preservation. Large pre-existing export/test files remain cohesive; no threshold-driven file splitting or unrelated refactoring.
- Security self-review: no new input, HTML/SQL/HTTP capability, auth change or secret literal in production code. Test resources remain isolated; the actual note text and credential values were not displayed. Historical decisions are preserved byte-for-byte, not silently deleted.
- Bandit was attempted with `python -m bandit -r src/` but could not run: `No module named bandit`. No package was installed.
- Adapter suite and independent review: not repeated/performed for C20; adapter/tool/auth bytes are unchanged. This is main self-review, not an independent review.
- No new PDF/Word GUI rendering or remote-device walk; this round checks the real designer UI and exact exported DOCX cell text, not pixel-level source-document identity. The user's original source document was not opened.
- After verification, cleared only this owned browser's temporary login state and stopped its Chrome process. The 5174 service remains running, and all screenshots/backups are retained. Final scope inventory adds only the four announced tracked source/test paths, this report, and the preserved decision archive; main checkout stays clean.
- No note-export change, approval/application, real-data access, dependency/configuration/threshold change, commit, merge, push, Trellis task archival or artifact deletion. The test service and acceptance data remain available for user validation.

## Later Finish Handoff — C21/C22 (2026-11-09)

The statements above describe the C20 checkpoint. The user subsequently authorized Git finish and the minimal formatter/archive-boundary supplements. A fresh bounded static review now reports PASS with no must-fix issue, the adapter rerun passed62 tests, and the three work commits have passed their real gates. No C20 product/test bytes changed in those finish supplements. Current authority, exact outcomes, LOW follow-ups and still-unexecuted integration/cleanup steps are recorded in `c21-finish.md`. This postscript is outside the original report text, which remains intact above.
