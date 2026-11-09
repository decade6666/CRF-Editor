# C18 Main Diff Review (static) — 2026-11-06

Writer: one native background `trellis-implement` agent `c18-writer` (requested model `sonnet`), read/edit only, no runners. Its completion report is a claim, not evidence. Main performed this review; it is self-review, not independent review.

## Scope Check — PASS

- HEAD `73e4dd559fda053bc7033568ff6308f84cc1bf50` unchanged; no commits.
- `git status --porcelain --untracked-files=all` equals the pre-dispatch inventory (no new paths).
- `sha256sum -c` over the 82-path pre-dispatch snapshot (`/tmp/crf-mcp-agent-c18-7f09b614/pre-dispatch.sha256`): only the 19 allowlisted files differ; `find -newer` lists only those 19.

## Diff Review (`diff -u` against `/tmp/crf-mcp-agent-c18-7f09b614/files/`)

- **F2 (AC6).**
  - **Router.** `routers/agent_tools.py:266` is the async `POST /agent/operations/{request_id}`, and the old `GET` route is removed. `_load_operation_result` (:301-328) follows the planned order:
    1. authenticate, then `_limit_read` and `credential_scope`;
    2. validate the closed lookup body;
    3. validate the tool DTO;
    4. `_require_granted_project` (403);
    5. check the path `request_id` (422);
    6. `bind_or_reject` (409 `IDENTITY_REUSED`);
    7. return 404 `UNKNOWN_OUTCOME` when no committed result exists, otherwise the re-wrapped stored envelope.
  - **Identity digest.** Dispatch (`agent_edit_service.py:119/239/285`, `agent_shared_change_service.py:159/234`) and lookup both use `canonical_input_payload(dto)` and `agent_operation_service.input_digest`.
  - **Adapter.**
    - `client.py:45` sets `LOOKUP_TOOLS = MUTATING_TOOLS - {APPLY_TOOL}`.
    - `lookup_operation(name, arguments)` POSTs `{tool_name, arguments}`, and a 404 maps to `UNKNOWN_OUTCOME`.
    - `IDENTITY_REUSED` is re-raised.
    - Every other lookup failure becomes `UNKNOWN_OUTCOME` carrying the original `request_id`.
    - Read-tool timeouts return `BACKEND_UNAVAILABLE`.
  - **Tests.** All planned conversions are present, plus three groups of new tests:
    - two identity-mismatch cases (same tool with different input; different tool with valid arguments). Both assert that exactly one op row exists and that the fingerprint is unchanged.
    - body/scope validation (extra top-level key, read tool, apply tool, invalid DTO, path mismatch → 422; foreign project → 403; old `GET` → 405). No SPA catch-all route exists, so `GET` really gets 405.
    - adapter tests: `IDENTITY_REUSED` after one lookup, a read-tool timeout with zero lookups, and the lookup body check.
- **F1 (AC4).**
  - The merge test is renamed `test_reorder_merging_inline_runs_within_baseline_succeeds`; baseline 2 blocks, final 1 block, so `1 <= max(1, 2)`.
  - New reorder tests:
    - duplicate id;
    - an instance id from another form (`表单B`/`F_B` does not collide with the seed `F_A`);
    - a split from 1 block to 2.
  - Each new test gives 400 `VALIDATION`, keeps the order unchanged and records no `AgentOperation` row. The split case also asserts detail `INLINE_TABLE_LIMIT_MSG`.
  - Paths checked: the `ValueError` → `HTTPException(400)` wrapper at `agent_edit_service.py:291-293` and `ensure_inline_block_limit` at :295. The reorder DTO has no uniqueness validator, so a duplicate id reaches the service.
  - The preview date-format test is renamed and now asserts against a snapshot.
- **F3.**
  - `STATUS_DEFAULT_CODES[409] = CODE_CONFLICT` (`schemas/agent_tools.py:69`).
  - The duplicate-definition test asserts `CONFLICT`.
  - New unit test: an `HTTPException(409)` gives `CONFLICT`; an explicit `AgentToolError(409, …, STALE_STATE)` gives `STALE_STATE`; both are no-store.
- **F14.**
  - `_definition_view` (`agent_read_service.py:184`) calls `ensure_no_foreign_links` before the 404 resolvers. That function checks both the codelist and the unit (`agent_state_service.py:305-314`).
  - New form-detail tests cover a foreign codelist and a foreign unit: each gives 422 `FOREIGN_LINK_MSG` and leaks no `外部字典`/`C_EXT`/`U_EXT`.
- **F4/F5/F6/F15 (docs).**
  - **Adapter README.**
    - The command example uses the venv python.
    - The recovery text matches `client.py:126-222`: only a timeout triggers a lookup; connection failures and 5xx return `BACKEND_UNAVAILABLE`.
    - The code lists match the `ERR_*`/`CODE_*` constants.
    - It has the refresh note and the E2E cleanup sentence.
  - **READMEs (zh/en).** Corrected lookup wording plus the refresh bullet.
  - **Backend CLAUDE.md.** Lookup contract, `VALIDATION` wording and the 409 `CONFLICT` default.
  - **Frontend CLAUDE.md.** "seven owner routes", matching the 7 `api` calls in `useAgentAccess.js`.
  - **Wiring test.** New title, and the regex matches `useAgentAccess.js:44`.
- **F11/F12.**
  - The tautology fixes and the dead-line removal are correct. The `codelist_id` assertion holds per `derive_shared_definition_changes` (`field_profile_service.py:391-400`): a seed with no codelist yields no derived entry.
  - The read test now uses a real foreign definition id.
  - The server test now asserts exactly `TOOL_REJECTED` and the `calls` value.
  - The export test injects one row per private table. Insert columns and value counts match the `CREATE TABLE` statements (10/22/9). The digest is computed at runtime, and the rows are asserted present before import.
  - The E2E fixture teardown is now a try/finally: it terminates the process, deletes the handshake file, and removes `tmp_root` only when the directory is named `crf-agent-e2e-*` (`backend_fixture_server.py:30`).

## Static Checks

- `git diff --check`: exit 0. This covers tracked files only.
- Added lines in all 19 files have no trailing whitespace or tabs.
- Added Python lines wider than 120 occur only in the implicitly concatenated SQL literals in `test_agent_access_exports.py`. Ruff does not split string literals.
- No construct newer than Python 3.10 was introduced in backend code.
- This is not a Ruff, pytest, py_compile or coverage run.

## Non-blocking (not fixed; no tenth correction authorized)

- N1. `schemas/agent_tools.py:248` — `LOOKUP_TOOL_NAMES` is defined but unused. The `Literal` at :265 repeats the four names, while the plan said the `Literal` would be drawn from the tuple. Values are identical, but the two copies can drift.
- N2. `routers/agent_tools.py:267` — the POST handler keeps the name `get_agent_operation_result`.
- N3. `agent_bridge/README.md:60` — the README says backend codes pass through unchanged, but `client.py:143` rewrites 401 to `TOOL_REJECTED`. `GRANT_DENIED` reaches the agent only for 403 responses.

## A-owned Probe Update

- `.pytest-tmp/mcp-agent-tools/test_independent_followup.py` now looks up via POST, sending the original tool name and arguments. Backup: `/tmp/crf-mcp-agent-c18-7f09b614/probes/` (sha256 `89a692ad…77de8`).
- No other probe references the lookup. The all-timeout case in `test_main_adapter_review.py` still yields `UNKNOWN_OUTCOME` containing the `request_id`.

## Runtime Validation (main, in-session after `ExitWorktree keep`, 2026-11-06)

The user asked why main could not run validation, then chose `退出隔离后我来跑（推荐）`. Main left worktree isolation with `keep`. Every command below pinned the worktree with an explicit `cd` or `git -C`.

- **Backend tests-only suite** (`backend-c18-suite.json/.log`): **1646 passed**, 0 failed, 1305 warnings, 103.58s. That is 1638 plus 8 new tests (+5 edit, +1 access, +2 read).
- **Backend coverage.**
  - Total **10041/11390 = 88.1563%**, against the 10019/11366 = 88.1489% floor → **not decreased**.
  - Agent scope (12 modules): **1560/1682 = 92.7467%**, against the 1538/1658 = 92.7624% floor → **below the stated floor by 0.016 pp (FAILED sub-gate)**.
  - Per-file comparison with `backend-c17-suite.json`: only `src/routers/agent_tools.py` lost coverage, going from 21 to 23 missing statements.
  - The new lookup handler's `except HTTPException` branch (:292-293) is uncovered. It is reachable through a malformed JSON body (422) or an oversize body (413) from `parse_bounded_json_body`; the old GET version had the same gap. The new `except Exception` → 500 branch (:294-298) is also uncovered. The `after_fingerprint` fallback (:327) was already uncovered before C18.
  - The `except AgentToolError` branch is now covered.
  - `schemas/agent_tools.py` is 320/323 (missing 3, unchanged); `agent_read_service.py` is 147/164 (missing 17, unchanged).
- **Backend probes** (4 files): **40 passed**, 75 warnings, 5.26s. This includes the POST-converted lookup probe.
- **Adapter suite** (`BACKEND_PY`, proxies unset, task-local TMPDIR/cache/coverage; `adapter-c18.json/.log`): **62 passed**, 6.82s, 0 skipped. That is 60 plus 2 new client tests.
- **Adapter coverage.** The CLI total including tests is 95.22% (gate ≥80%). Production modules: **289/318 = 90.88%**, up from 280/311 = 90.03%. `client.py` 115/125, `config.py` 41/43, `server.py` 132/149, `__init__.py` 1/1.
- **Adapter probes** (2 files): **11 passed**, 0.30s.
- **Ruff:** backend `ruff format --check .` reports 197 files already formatted. The adapter check (`--config backend/ruff.toml agent_bridge`) reports 11 files already formatted. No formatting hunks were needed.
- **Frontend:**
  - `node --test tests/agentAccessWiring.test.js`: 16/16 pass.
  - `npm run lint` (read-only `eslint --ext .js,.vue src`): exit 0, 0 errors / 2819 warnings, identical to the round3 baseline (`src` is untouched by C18).
- **After the runs:**
  - The worktree `git status --porcelain --untracked-files=all` is byte-identical to the post-exit snapshot (75 paths).
  - HEAD `73e4dd5` is unchanged.
  - `main` is `8fb18e9`, clean.
  - The E2E run created no new `crf-agent-e2e-*` roots under the task TMPDIR. The 31 older roots there predate the teardown fix and are retained; removing them needs confirmation.

## C19 Resolution

The user authorized exactly two additional main-written error-boundary tests. Both targeted tests and the backend full suite pass (1648 tests); coverage is now 10047/11390 = 88.208955% total and 1566/1682 = 93.103448% across all 12 agent modules. Both exceed the C17 floors, resolving the C18 sub-gate failure above. Ruff reports 197 files already formatted. No production changes. §16 and its Quick Reference are synchronized; details and commands are in `c19-validation.md`.

## Not Run

- Frontend full `npm test`, vitest coverage, build and browser: frontend `src` and components are unchanged since the round3-verified state. Only the wiring test changed, and it ran.
- Bandit: not installed, not run.
- Independent review of the C18 delta: not performed. This is main self-review only.
