# Validation environment (planning evidence)

## Checked on 2026-10-26

- Worktree `/home/decade/crf-editor-single-table-guard`, branch `feat/single-table-guard`, based on `2048df2`.
- Trellis CLI `0.6.17`; `trellis channel spawn --help` succeeds; project `.trellis/agents/implement.md` exists.
- Claude CLI `2.1.309` is available.
- Main model A is `gpt-6.1-sol[1M]`; the user explicitly approved it for the relay instead of switching models.
- Model B will use the relay default alias `sonnet`. `ANTHROPIC_DEFAULT_SONNET_MODEL` is unset; do not claim a resolved model until a worker completion event provides it.
- Independent reviewer R defaults to alias `fable`, whose current environment mapping is `claude-opus-5-5[1M]`; confirm the actual model from its completion event if dispatched.
- Node `v24.14.1`, npm `11.11.0`.
- Backend interpreter `/home/decade/.venvs/crf-editor/bin/python`: Python `3.10.21`, pytest `7.4.4`, ruff `0.16.10`.
- After formal implementation/validation approval, A ran `npm ci` successfully in the task worktree; package/lockfile diffs remain empty. Existing audit/engine warnings and their bounded security triage are recorded in `research/dependency-audit.md`; no dependency upgrade or fix was performed.

## Verification command sources

- `frontend/package.json:6-14`: `npm test` runs node:test and vitest; `npm run test:component`, `npm run lint`, and `npm run build` exist. Do not run the whole-project write-format script.
- `backend/pytest.ini:1-3`: no implicit coverage options/gate.
- `backend/tests/conftest.py:15-35,49-60` and `.trellis/spec/backend/quality-guidelines.md` → Test Session Isolation: pytest redirects runtime/config data to a session temp root. Force `CRF_DISABLE_BACKGROUND_JOBS=1` when invoking tests.
- Backend command environment should unset proxy variables only for local test commands. Use an explicit `cd /home/decade/crf-editor-single-table-guard/backend` in every shell invocation; do not assume persistent shell cwd.
- If the worktree command guard rejects inline environment setup, use a task-owned temporary test script outside the repository in the main session; do not bypass unchanged guard preconditions.
- Capture a backend coverage baseline before changing source, then compare the final full-suite result. The project collects coverage statistics without adding a new runner threshold; the change must not lower coverage, and new tested logic targets at least 80%.

## Browser validation boundary

- Browser validation belongs to model A, against the task worktree only. Use a disposable database/upload tree and an unused local port, never the shared live service/database.
- Any generation of temporary authentication credentials needs explicit confirmation through `AskUserQuestion` before it happens. Do not read existing private credential values.
- Verify browser/runtime availability at execution time; cached browser paths are hints, not evidence.
- If login, browser tools, dependency/network permissions, or another environment limitation blocks real-browser checks, report exactly what was not run. Component mounting is not browser E2E evidence.

## Current validation status

A installed only existing locked dependencies after formal approval and captured the pre-change backend baseline: **1384 passed, 86.75566857385039%** (9438 statements/1250 missed). Frontend presentation baseline: **97.78% lines / 90.63% branches / 100% functions**. B later timed out and was stopped after a scope violation; the user formally selected A takeover. B has no final/done evidence, so actual model/cost remain unknown.

A's verified implementation results (2026-10-26):

- Focused backend **48 passed**; full backend **1432 passed**, **86.96%** overall (9585 statements/1250 missed), guard **100%**, restore service **98.97%**. Coverage increased; no project coverage gate/config was added.
- Final `npm test -- --maxWorkers=1`: **1046 node:test + 188 mounted tests passed**; new mounted guard suite **17 passed**. Default parallel mode remains intermittent: an earlier full run passed 1043 + 182, while the latest default run (after three coverage-only tests were added) failed 5 cases including 5-second timeouts. Initial parallel/serial failures are also retained, including the initial unhandled rejection. An unchanged `2048df2` frontend temporary source fixture passed its 171 component tests. Timing root cause is not established; no unrelated files, warning gate, timeout configuration or assertions were weakened to conceal failures. Frontend helper coverage increased to **98.11% lines / 92.31% branches / 100% functions**, with **72 tests passed**.
- `npm run lint`: **0 errors / 2720 warnings**, then `npm run build` passed. Changed-file `ruff format --check` and `py_compile` passed after formatting only the four changed/new Python files that needed it.
- Real Chrome acceptance on the isolated `8907` app passed: first/adjacent block; rejected separated/middle toggles with zero writes; native drag and Ctrl+arrow rejection; adjacent copied draft stays one table in both previews; invalid type retains dirty draft text, valid save/undo; legacy 3→2→1 repair with forbidden undo/regrowth; twice-rejected atomic batch undo leaves instance/definition/order readbacks and stacks unchanged. Initial temporary-driver failures were a reload execution-context race and a hidden select-input selector, not accepted feature failures; both were corrected before the full successful walk.
- Logs/JSON/scripts stay under `/tmp/crf-single-table-guard.vOcuj0/`, including `backend-full.log`, `backend-final-coverage.json`, `frontend-final.log`, `components-green.log` and `browser-acceptance.log`. Temporary credentials are private and are never included in task artifacts or logs.
- Dependency audit remains **not clean** (0 Critical / 12 High / 1 Moderate / 1 Low); no dependency changes. See `dependency-audit.md` for bounded triage.
- Independent read-only R review (`fable` alias, configured mapping `claude-opus-5-5[1M]`; `done` event `seq: 302`, `duration_ms: 1691616`, `num_turns: 93`, `total_cost_usd: 7.437165600000001`) returned **PASS** (0 blocking, 6 non-blocking findings) with zero repository writes verified by pre/post SHA256 snapshot. A evaluated all 6 non-blocking items, reproduced and fixed two-phase ID remapping on reused SQLite rowids, existing invalid-OID label restore filtering, `文本 -> 标签 -> 文本` round-trip marker restoration, pre-prompt copy guard, and live-preview cross-field layout checks, added duplicate-ID/append API tests, and re-verified all focused/full suites and live browser flows after the user switched the main session model to `gemini-4-argon[1m]`.
- Disposable local server (`8907`), headless Chrome (`9222`), and background research task have all been stopped cleanly. Product documentation and the directly relevant cross-stack contract are synchronized. No production access, commits, merge, push or cleanup occurred.

## Deployment and final acceptance (2026-10-27)

- The later manual-test 8907 instance was distinct from the stopped disposable acceptance runtime: it served worktree code against the shared development DB. Read-only version checks established that 8888 was still serving the old main build. After explicit user deployment authorization, a backed-up 7-source/28-artifact package updated 8888 through the unchanged systemd unit; no config, database or secret was replaced. The user supplied sudo authentication in their terminal, never in chat.
- Independent `verify.py --postcheck` passed the served index/designer hashes, new restore-batch route, auth 401 and all 7 installed-source hashes. Systemd active/running, PID 106195, start 14:34:03 CST. The user then reported browser tests pass and formally authorized the complete commit/archive/journal/merge/push/cleanup pipeline.
- Closeout full backend: **1432 passed, 986 warnings, 71.02s**, exact total coverage **86.95878977569119%**, guard **100%**, restoration **98.96907216494846%**. Closeout serial frontend: **1046 node + 188 mounted passed**, lint **0 errors / 2720 warnings**, changed Python format checks passed. Logs and coverage JSON retained under `/tmp/crf-8888-single-table-guard.2nWNyD/closeout-*`. Default parallel-test intermittency and unchanged dependency-audit findings above remain disclosed, not silently fixed.
- Main's deployment overlay matches the feature's 7 production paths exactly. A fresh temporary Git probe passed: staging identical deployed files before ff-only merge preserves their content and yields a clean index, avoiding reset/clean/stash removal of running sources.
- `/tmp/crf-flake-base/frontend/node_modules` is a symlink to the task worktree's dependency directory. The user separately authorized a full dependency backup and retarget of that one link before task-worktree removal, preserving the baseline rather than leaving it broken. Other worktrees are out of cleanup scope.
