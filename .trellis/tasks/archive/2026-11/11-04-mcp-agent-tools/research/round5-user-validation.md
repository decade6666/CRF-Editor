# C14 User External Validation — Audit Baseline Assertion Failure

Date: 2026-11-06. **Not accepted; no sixth repair authorized.** The user supplied an actual external-terminal post-fix run. Main did not execute or redelegate its command, change sources, query a database or inspect credential/configuration values.

## Attributed Command / Result

The user's command:

```bash
cd /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools && \
bash /tmp/crf-mcp-agent-backend-checks.sh pytest -c pytest.ini \
  ../.pytest-tmp/mcp-agent-tools/test_independent_followup.py \
  tests/test_agent_tools_edit.py \
  tests/test_agent_shared_changes.py \
  tests/test_agent_access_concurrency.py \
  -q --tb=short --show-capture=no
```

Observed aggregate: **85 passed, 1 failed, 155 warnings in11.01s**. The only listed failure is `test_same_event_loop_browser_write_wins_agent_gets_stale_409` at `backend/tests/test_agent_access_concurrency.py:615`: `assert audits == 0`, actual1. This is user-run narrow backend evidence, not a main/worker-run result, full-suite pass, coverage result or adapter/stdio test. The unchanged follow-up probe file has no failure in this run's complete failure list; do not invent separately timed per-file counts.

Warnings: the pasted output contains one Starlette/AnyIO BlockingPortal deprecation plus JWT encode/decode short-HMAC warnings (27-byte test-process key). Main did not inspect any key value or production configuration. These warnings are unmodified, not suppressed, and not evidence of the production secret's state.

## Root Cause — Test Counts Pre-Existing Issuance Audit

1. `backend/tests/test_agent_access_concurrency.py:478-481` calls the real credential-issuance service during Arrange and commits it **before** starting either concurrent request.
2. `backend/src/services/agent_access_service.py:98-106` unconditionally adds `AgentAuditEvent(credential_id=credential.id, tool_name="credential.issue", result_code="issued", ...)` as part of that issuance. It is an intentional lifecycle audit, not an agent edit result.
3. `backend/tests/test_agent_access_concurrency.py:614-615` filters only by credential_id, counts **all** lifecycle/tool audit events, then incorrectly expects zero. It never captures/subtracts the already-committed issuance baseline or scopes the assertion to newly added events.
4. The observed count1 is exactly consistent with the guaranteed issuance audit. Main has not independently read the row's contents; the source contradiction alone proves this zero-total assertion is invalid even when the rejected agent write is correct. Do not label this output proof of a stale write creating an audit or remove production issuance logging to make the test green.

The failure occurs after the same test's browser200, agent409/STALE_STATE, browser label persistence, absent agent help_text and zero matching AgentOperation assertions. Those earlier assertions therefore passed in this user run. Existing production dispatch checks the fingerprint before mutation and rolls back exceptions (`routers/agent_tools.py:180-187,204-209`), corroborating the intended boundary but not replacing runtime verification of the audit delta.

## Correct Assertion Direction — Proposal Only, Not Applied

Capture the existing credential-scoped audit IDs/event metadata immediately after credential setup/commit, assert the expected issuance audit exists, then after the rejected request assert the audit set is unchanged. Retain the existing zero-result/unchanged-agent-field assertions. This checks **no new audit** without deleting/ignoring legitimate history or hardcoding a brittle total of1.

The two earlier C14 proof gaps also remain: deterministic agent-BEGIN overlap with heartbeats measured only in the held-lock interval, and counting every mutation dispatch/identity rather than only injected lost responses. See `main-acceptance-round5-static.md` G1/G2. This narrow run does not close those gaps.

If separately authorized, a single tests-only repair can remain within two existing files: `backend/tests/test_agent_access_concurrency.py` (audit baseline + G1) and `agent_bridge/tests/test_stdio_e2e.py` (G2). No production, dependency, fixture, runner or permission change is needed or authorized by this recommendation. Merely supplying test output does not authorize a sixth batch.

## Verification / Disposition

Main ran only targeted Read/rg and plain Git status/HEAD checks to locate the test/service/model/rollback contracts; HEAD remains `73e4dd559fda053bc7033568ff6308f84cc1bf50`, inventory unchanged. No test/import/formatter/build runner or alternative execution path was used by main, no delegated implementation or source/test/probe edit occurred. A-owned task evidence/state/decision records are updated with this attributed result only.

Still NOT RUN: post-fix adapter tests and real stdio loop, full backend/adapter/frontend matrices, coverage, Ruff/py_compile/type checks, browser rerun and final independent review. Keep task in_progress/accepted=false, five used/five authorized batches. Preserve all snapshots/A probes. No commit, merge, push, deploy, archive, deletion or automatic sixth repair.
