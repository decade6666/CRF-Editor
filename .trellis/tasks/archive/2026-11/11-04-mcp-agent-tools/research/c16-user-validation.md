# C16 User Validation — Combined Full Backend Run

Date: 2026-11-06. **Not accepted.** Actual user external-terminal run after the C16 single assertion. Main executed no tests in-session; the runner guard precondition is unchanged.

## Command (suggested by main, run by the user from the worktree root)

```bash
bash /tmp/crf-mcp-agent-backend-checks.sh pytest -c pytest.ini \
  tests ../.pytest-tmp/mcp-agent-tools/test_independent_followup.py \
  --cov=src --cov=main --cov-report=term-missing:skip-covered \
  --cov-report=json:../.pytest-tmp/mcp-agent-tools/backend-c16.json \
  --cov-fail-under=80 -q --tb=short --show-capture=no
```

## Result

- **1649 passed, 2 failed, 1313 warnings, 110.17s.** Coverage gate reached: TOTAL 11366 statements / 1347 missed → 10019/11366 = 88.15%.
- Only failures: `tests/test_test_environment_isolation.py::test_should_resolve_runtime_paths_under_test_root` (:32, `db_path`) and `::test_should_redirect_config_file_under_test_root` (:45, `CONFIG_FILE`). Each reports runtime paths under root `crf-editor-tests-crskhiuw` while the `test_root` fixture is `crf-editor-tests-14ymmi7p`. Both roots are under the task-local TMPDIR `.pytest-tmp/mcp-agent-tools/tmp/`.
- No skipped/deselected count was reported. Every other collected test passed, including the C16-guarded `test_same_event_loop_browser_write_wins_agent_gets_stale_409` and the C15 audit-baseline comparison; no failure was reported for the 13-case follow-up probe.
- Warnings are the previously observed categories only: AnyIO `BlockingPortal` alias deprecation and JWT `InsecureKeyLengthWarning` (27-byte test-process key). Not inspected further and not suppressed.

## Root Cause — Verification Command Composition (Main Error)

- `backend/tests/conftest.py:23` creates `TEST_ROOT` with `tempfile.mkdtemp`; `:30-33` force the database/upload/auth environment; `:57` sets `src.config.CONFIG_FILE`; `:87-89` yield that root as `test_root`. Pytest registers this file as the `conftest` plugin for `tests/` (no `tests/__init__.py`) → root A.
- `test_independent_followup.py:11-13` imports from the A-owned probe `test_main_backend_review`, whose `:16-19` executes the same conftest again under module name `main_review_isolation`. That second execution, during collection, creates root B and repoints the environment and `CONFIG_FILE`; `:22` re-exports root B's fixture to the probes only.
- The guard tests (`test_test_environment_isolation.py:22-47`) receive the plugin's root-A fixture while `load_config()` / `CONFIG_FILE` resolve to root B, so both assertions fail by construction when the permanent suite and that probe share one pytest session.
- The round3 accepted procedure kept them separate: `backend-main-round3.log:199` (1621 passed) and `backend-probes-main-round3.log:24` (27 passed; `test_main_backend_review.py`, `test_main_repair_additional.py`, `test_main_final_boundaries.py`). Main's C16 suggestion merged them. The failures therefore come from that command composition, not from the C16 line, the agent feature, conftest or the guard. No real config/DB/upload path was used.
- No source/test/probe change is needed or authorized. The probes remain temporary artifacts, not deliverables.

## Coverage Caveat

10019/11366 (88.15%) exceeds the round3 fraction 9983/11331 (88.10%), but this session includes probe-executed lines, so it is not the comparable gate number. Agent production modules listed in the report total 1344/1464 (91.80%); `agent_state_service.py` and `schemas/agent_access.py` are absent from the skip-covered listing (complete coverage). Gate numbers come from the separate tests-only run.

## Tests-only Rerun (user external terminal) — Diagnosis Confirmed

- Command: block 1 of main's follow-up message (`... pytest -c pytest.ini tests --cov=src --cov=main --cov-report=term-missing:skip-covered --cov-report=json:../.pytest-tmp/mcp-agent-tools/backend-c16-suite.json --cov-fail-under=80 -q --tb=short --show-capture=no`).
- Result: **1638 passed, 0 failed, 1291 warnings, 102.27s**; no skipped/deselected count. Both isolation guards pass, confirming the composition diagnosis (1638 + 13 probe cases = 1651 = combined 1649 + 2).
- Coverage (main read `backend-c16-suite.json` totals with plain grep): **10019/11366 = 88.1488650%** (excluded 42), above the round3 fraction 9983/11331 = 88.1033% and the original 8401/9623 = 87.30%. Combined-run totals were identical, so the probe added no coverage.
- New agent production scope, all 12 modules (`agent_dependencies`, `models/agent_access`, `routers/agent_access`, `routers/agent_tools`, `schemas/agent_access`, `schemas/agent_tools`, six `services/agent_*`): **1538/1658 = 92.76%**, above round3 1520/1641 = 92.63%; lowest file `services/agent_access_service.py` 101/117 = 86.3%. Modified existing modules: `field_profile_service.py` 210/226, `database_export_service.py` 75/79, `main.py` 182/216.
- Warning categories unchanged (AnyIO alias deprecation; JWT test-key length).

## Probes and Adapter (user external terminal)

- Backend probes alone (`test_main_backend_review.py`, `test_main_repair_additional.py`, `test_main_final_boundaries.py`, `test_independent_followup.py`): **40 passed** (27 original + 13 follow-up), 75 warnings, 5.03s; same two warning categories.
- Adapter suite under the SDK venv with `BACKEND_PY`, task-local TMPDIR/cache/coverage and proxies unset: **60 passed, 7.68s**, no skipped count (round3 57; +1 C13 client timeout test, +2 C14 recovery tests). The real stdio ten-tool E2E and both real-backend recovery tests ran.
- Adapter coverage: TOTAL 995/51 → 94.87% including tests. Production modules from the table: `__init__.py` 1/1, `client.py` 106/118, `config.py` 41/43, `server.py` 132/149 → **280/311 = 90.03%**, identical to round3 (adapter production source unchanged since).
- Uncovered test-helper lines are defensive branches only: `test_stdio_e2e.py:417-419` (bad-credential test's unexpected-success path), `:448-449` (non-JSON body fallback), `:474-475` (forward-failure fallback). The forward at `:472` therefore executed: each injected loss followed a real backend commit.
- Adapter probes (`test_main_adapter_review.py`, `test_main_manifest_boundaries.py`): **11 passed**, 0.31s.
- Read-only UI check: `AgentAccessDialog.vue:315,339` render a 派生 tag from each change's `derived` flag set in `agent_shared_change_service.py:208,375`, so C13 derived effects are visible to the approving owner without a frontend change.

## Ruff Check (user) and C17 Formatting Correction (main)

- Backend `ruff format --check .` (user): **failed** — 4 files would be reformatted, 193 already formatted: `src/services/field_profile_service.py:371`, `tests/test_agent_access_concurrency.py:627`, `tests/test_agent_shared_changes.py:720`, `tests/test_agent_tools_edit.py:736/748/796/841` (7 hunks; line breaks and grouping parentheses only). The C16 line at concurrency `:589` was not flagged. The chained adapter check did not run (`&&` short-circuit).
- C17: the user chose `主会话按输出修正（推荐）` via AskUserQuestion. Main backed up the 4 files (regular, link count 1, cmp-identical) to `/tmp/crf-mcp-agent-ruff-format-7f09b614/files`, then applied exactly the 7 displayed hunks.
- Main checks: unified diffs show only those 7 hunks; a whitespace- and parenthesis-stripped byte comparison is identical for all 4 files; no trailing whitespace; `git diff --check` passes; pre/post inventory identical; HEAD unchanged with no commit; the C16 assertion remains at `:589`. Joining or splitting lines does not change statement counts. This is main self-review, not a Ruff run.

## Final Recheck after C17 (user external terminal)

- Backend `ruff format --check .`: **197 files already formatted**.
- Adapter `ruff format --check --config backend/ruff.toml agent_bridge`: **11 files already formatted**.
- Backend tests-only suite on the final bytes (`--cov-report=json:../.pytest-tmp/mcp-agent-tools/backend-c17-suite.json`): **1638 passed, 0 failed, 1291 warnings, 109.02s**. TOTAL 11366/1347 → 10019/11366 = 88.15%, identical to pre-C17. Per-file agent counts are unchanged, so agent scope stays 1538/1658 = 92.76%. `field_profile_service.py` missing lines shifted by the two joined lines (375/397-398/465/476 → 373/395-396/463/474) with 210/226 unchanged.

## Status / Next

- Passed (actual user runs): backend permanent suite + coverage on the final bytes, backend probes, adapter suite/coverage, adapter probes (the last three on pre-C17 bytes; C17 is token-identical formatting), backend and adapter Ruff format checks.
- NOT RUN: final independent review (needs user authorization). Frontend and browser not rerun: frontend sources/tests are byte-identical to the round3-verified state.
- The user stopped both native background agents (writer and independent reviewer) on 2026-11-06. Neither will be resumed; a final independent review needs new user authorization.
- C17 is the eighth bounded correction (formatting only); no ninth. Task remains in_progress, accepted=false.
