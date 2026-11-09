# Runtime Preflight — Main Session

Date: 2026-11-05. PRD C8 formally authorizes these isolated preparations and disposable-test credentials. Task status is `in_progress`. No implementation worker has been dispatched yet; this file is evidence for the handoff, not a claim that MCP business features exist.

## Environments

- Worktree/base: `/home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools`, branch `worktree-mcp-agent-tools`, HEAD `73e4dd559fda053bc7033568ff6308f84cc1bf50`.
- Backend interpreter: `/home/decade/.venvs/crf-editor/bin/python`, Python 3.10.21, pytest 7.4.4, pytest-cov 4.1.0, Ruff 0.16.10. It was not upgraded.
- Isolated adapter interpreter: `agent_bridge/.venv/bin/python`, Python 3.12.3, official mcp 1.30.0, httpx 0.27.2, jsonschema 4.26.0 (within the approved compatible range), Pydantic 2.14.2. `pip check` passed.
- The adapter environment resolves Starlette 1.10.0 and Uvicorn 0.54.0; these are **not** backend upgrades. Do not import the backend application in this environment; spawn the backend with BACKEND_PY instead.
- A temporary SDK import check passed for the documented v1 low-level server/client/stdio classes and a structured CallToolResult. This is an import/API-shape check, not process-level E2E acceptance.
- Node 24.14.1/npm 11.11.0; installed Vitest and @vitest/coverage-v8 are both 5.0.3. The latter is the only new frontend direct dependency.

The npm install warned about existing js-beautify → nopt/abbrev Node engine declarations. `npm explain` identifies the existing @vue/test-utils 2.5.1 chain, not the new coverage provider; no Node/npm/test-utils upgrade was made. Keep the warning visible, without treating it as a failing test or claiming formal engine support.

## A-Owned Changes — B Must Not Modify

- `agent_bridge/requirements.txt`, `requirements-dev.txt`, `requirements.lock`.
- `frontend/package.json`, `frontend/package-lock.json` — only the approved coverage provider plus necessary transitive packages. The Babel parser/type/helper lock updates satisfy the new magicast dependency's >=7.29.7 requirements, rather than an independent toolchain-upgrade task.
- All task/research/context files and temporary validation wrappers.

Preparation hashes (A recorded before dispatch):

| File | SHA-256 |
| --- | --- |
| frontend/package.json | `0f00d42183b505dca93fa1bfee29c198a319f70e7210ce5cb9253ccfdda07492` |
| frontend/package-lock.json | `3b318bcd08fd07d10dcdc42035578340bbb17a548fcc1efd838e820f9eeecc1a` |
| agent_bridge/requirements.txt | `cc610d5256c77e7df1742edea7c64e6c38cf58a55a1f5336e92ba046ec99b996` |
| agent_bridge/requirements-dev.txt | `12eabf096ddf4085bc151a2f03dde71a9ec32a43b45b24519ec2b08aa7a3a93c` |
| agent_bridge/requirements.lock | `68b7e9c4cd3a3e83cfb635918e131037e2bf6b1a6228e99c67b2d7de012a14f0` |

A-only annotation correction during acceptance round2: the adapter is Python3.12.3 (rechecked with `agent_bridge/.venv/bin/python --version`), not the original lock comment's Python3.10. Only that first comment line changed; all dependency entries were compared byte-for-byte unchanged against `/tmp/crf-mcp-agent-round2-7f09b614/files/agent_bridge/requirements.lock`. New approved lock SHA-256: `e262e0233702ceba2e0bd1cbe90835ea7d00ce598f49b8a697766d4a02aa535f`. No install or backend upgrade occurred; B still must not modify any dependency/lock file.

## Measured Existing-Code Baselines

- Backend command: `bash /tmp/crf-mcp-agent-backend-checks.sh pytest --cov=src --cov=main --cov-report=term-missing:skip-covered --cov-report=json:../.pytest-tmp/mcp-agent-tools/backend-baseline.json --cov-fail-under=80 -q`.
- Backend result: **1472 passed**, 1036 existing warnings, 123.45 seconds. Total **9623 statements, 1222 missing, 8401 covered (87.30%)**. Final total coverage must be >= the exact 8401/9623 fraction, not merely a rounded 87% or the 80% floor. Report file: `.pytest-tmp/mcp-agent-tools/backend-baseline.json`.
- `npm --prefix frontend --cache .pytest-tmp/mcp-agent-tools/npm test`: **1056 node:test tests and 207 Vitest tests passed**, 18 component test files. No application source was changed before these baselines.
- Frontend all-source component-coverage baseline: **207 passed, 18 files, maxWorkers=1**, 87.14 seconds. Statements **3920/7719 (50.78%)**, branches **2861/6102 (46.88%)**, functions **1219/2298 (53.04%)**, lines **3480/6410 (54.29%)**. Report: `.pytest-tmp/mcp-agent-tools/frontend-baseline/coverage-summary.json`. Compare the same serial all-source run after implementation; new dialog/composable coverage must separately meet >=80% on all four metrics.
- Retained failure evidence: the first executed parallel coverage run had 206 passed/1 timeout (5000 ms) in SingleInlineTableGuard's repeated batch-delete undo/redo case. That same case passed in isolation with coverage and maxWorkers=1 (one selected test, 16 intentionally filtered tests), followed by the complete passing serial baseline above. This is evidence about execution conditions, not a proven clock/logic fix; no source, tests, timeout or warning gate was changed.

Use the all-source coverage include arguments separately as `--coverage.include='src/**/*.js' --coverage.include='src/**/*.vue'`; brace syntax was refused by the worktree guard before execution. The run's root is frontend, and report paths go under `.pytest-tmp/mcp-agent-tools`. Component-only coverage does not include the separate node:test process and is not a claim of global frontend >=80% coverage.

## Local Validation Boundaries

`/tmp/crf-mcp-agent-backend-checks.sh` is main-owned, read/execute-only for B. It forces background-jobs-off and task-local temp/cache/coverage paths, invokes the existing backend interpreter from this worktree's backend, and clears only its child command's six proxy variables. It is not an installer or permission bypass.

The earlier optional document-structure probe remains blocked/not-run; do not recreate or delegate that blocked command. The context manifests pass the normal task validator. Browser-level validation, new agent tests, real stdio E2E, and independent diff review remain pending actual implementation.
