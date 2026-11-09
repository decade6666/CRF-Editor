# Main Static Acceptance — C15 Two-Test Candidate (Sixth Repair)

Date: 2026-11-06. **Not accepted.** Main inspected both actual diffs and all protected paths. Audit-baseline and complete mutation-sequence corrections are present. The contention test now has the right instrumentation and held-window heartbeat measurement, but it still ignores the event wait's unsuccessful return. That leaves one fail-open test gate; no post-C15 runtime/format/coverage result exists. No seventh batch or main inline fix is authorized.

> **C16 follow-up (2026-11-06):** the user separately authorized main's single assertion. It has now been added at `backend/tests/test_agent_access_concurrency.py:589`, closing the event-success gate in source. No additional worker, production edit or runtime execution occurred. The original C15 findings below are preserved as historical review evidence; see the C16 follow-up section for the current static/verification state. Acceptance still awaits real tests/coverage/final review.

## Scope / Provenance

- Exactly two existing test sources changed: `backend/tests/test_agent_access_concurrency.py` and `agent_bridge/tests/test_stdio_e2e.py`. Main read both entire deltas against `/tmp/crf-mcp-agent-round6-7f09b614/files`.
- Pre/post `git ls-files --modified --others --exclude-standard` inventories are byte-identical. No new B file. All candidate files are regular/link-count1; HEAD stays `73e4dd559fda053bc7033568ff6308f84cc1bf50`, base..HEAD log empty; tracked `git diff --check` passes.
- Explicit plain cmp commands checked **71 unchanged snapshot paths =53 protected deliveries +3 original A probes +14 requirements/evidence files +1 decision log**. The other four paths in the75-file snapshot are the two reviewed test edits and two expected A-owned dispatch records (implement.md/task.json). No production/global-fixture/dependency/other-test/doc/probe change by B was found. This A report and subsequent A status/log updates occur after that comparison and are not B edits.
- Requested worker selector is `sonnet`; independently resolved model/cost remain unavailable. B reports no interpreter/runner use or repeated denied form in C15. Main did not inspect its transcript/progress, run a denied command or treat source reading/line-width rg as Ruff/syntax/test validation.

## Corrections Verified in Source

### A — Audit baseline corrected

`backend/tests/test_agent_access_concurrency.py:490-499,650-655` snapshots sorted `(id, tool_name, result_code, operation_id)` tuples after real issuance commit, verifies credential.issue/issued is present, and compares the same event evidence after the stale request. Existing browser200/agent409, persisted-browser/unchanged-agent-field and zero-operation assertions remain. Production issuance logging is untouched; no audit deletion or brittle total1 substitution. This addresses the user's observed C14 failure in source, not a post-C15 GREEN result.

### C / G2 — Complete mutation sequence recorded

`agent_bridge/tests/test_stdio_e2e.py:441-477,623-632,705-710` records every agent-tool POST's tool name and request_id/change_id before injection/forwarding; it does not record headers/credentials. Local test's final exact list requires precisely the original update and intentional same-identity replay. Preview test's exact list requires the original preview then intended apply with the recovered change_id. Extra hidden POSTs/identities would extend or change those lists; GET result lookups do not. Existing actual backend, authenticated generated closed schemas, output/fingerprint/replay and preserved-preview checks remain. This is still SDK-handler + real HTTP integration, not a new stdio subprocess flow.

### B / G1 — Instrumentation improved, one gate still missing

The file-engine listener observes the production BEGIN IMMEDIATE statement, heartbeat delta is now measured before release, cleanup-period heartbeat credit was removed, and listener/overrides are restored. No production call is mocked or busy timeout increased. The remaining success-check issue below prevents declaring the release gate deterministic on its timeout path.

## Remaining Blocking Test-Proof Gap — Wait Timeout Is Ignored

Anchor: `backend/tests/test_agent_access_concurrency.py:588-597`; same test's correctly checked browser event at:577-578 and final late attempt-count assertion at:624-626.

```python
await asyncio.wait_for(asyncio.to_thread(agent_begin_attempted.wait, 8), timeout=10)
# no assertion of the returned boolean / agent_begin_attempted.is_set()
```

`threading.Event.wait(8)` returns **False normally** when not signaled within8 seconds. It does not raise a timeout exception. That awaitable has therefore completed before the outer10-second asyncio timeout, so the outer wrapper does not turn its False result into a failure. Current code proceeds to measure heartbeats and release the browser anyway. The later begin_attempts==1 only proves an attempt eventually happened, not that it preceded release.

Concrete false-positive schedule: agent dispatch remains pending until after8 seconds; inner wait returns False while both HTTP tasks remain pending. Heartbeats advance in the next50ms, browser releases/commits before its10-second hold deadline, and the delayed agent attempts BEGIN only afterwards. Final browser200/agent409 and one BEGIN attempt can all still hold despite no contended agent BEGIN in the measured interval. This is a source-proven coverage gap, **not an executed failure count or production-concurrency defect claim**.

Minimum proposed correction: require a successful event signal immediately after/before consuming that await result and before entering the held-lock measurement (e.g. `assert agent_begin_attempted.is_set(), ...`, or assert the returned boolean). Do not change timeouts/production behavior. This is a proposed one-line test correction, NOT applied by main or B. No seventh repair/main takeover follows from this report.

API evidence was checked through Context7 against CPython `Doc/library/threading.rst` and `Lib/threading.py` (False on timeout; boolean-return contract since Python3.1) and `Doc/library/asyncio-task.rst` (outer timeout applies to awaitable completion). Context7 returned main-branch references, not a pinned Python3.10 runtime experiment. The thread-event return contract predates the backend's3.10 runtime. No interpreter/test reproduction is claimed.

## Verification Ledger

**Main actually ran**:
- Two complete targeted diff comparisons → inspected all edits; expected diff exit1 denotes differences, not tests failing.
- Explicit cmp groups →26 backend +13 adapter +14 frontend/root +3 A probes +14 task/evidence +1 log paths unchanged (71).
- Pre/post inventory cmp → identical; stat of both edited files → regular/link-count1.
- Plain Git diff --check/HEAD/base..HEAD log → pass/unchanged history; no commit.
- Targeted Read and Context7 API queries → missing event-signal assertion verified without execution. Worker rg results are worker-reported static checks, not main runtime evidence.

**User's latest actual run, BEFORE C15**:85passed/1failed/155warnings,11.01s; failure was the prior zero-total audit assertion. It is not a post-C15 test result.

**NOT RUN after C15**: backend probe/regression/full suites, adapter/SDK/stdio tests, all coverage, Ruff/py_compile/type checks, frontend/build/browser rerun or final independent review. No guard bypass, dependency/permission/provider change, production access, history/publication/deployment/archive/deletion or source/test/probe edit by main.

## Disposition

Keep in_progress/accepted=false, six used/six authorized batches; freeze candidate. Audit/G2 corrections are source-reviewed but runtime-unverified. One event-wait success check still needs separately authorized correction. To avoid another delegated cycle, the next recommendation is an explicitly approved **main-session one-line test fix in this concurrency file only**, followed by actual user/allowed-path verification; current authorization does not permit that takeover. Full matrix/coverage (backend >=9983/11331, new scopes >=80%) and independent review remain required even if a narrow run later passes.

## C16 Follow-up — Main Session Single Assertion

- **Authority / ownership:** user explicitly replied `确认，继续` to the main-session one-line proposal. PRD/implement record C16; the native writer had acknowledged read-only freeze and was not resumed/dispatched. This is the seventh bounded correction; no eighth fix or broader takeover is authorized.
- **Exact source delta:** one line added immediately after the existing await and before held-window heartbeat measurement/browser release: `assert agent_begin_attempted.is_set(), "agent 未在持锁窗口内尝试 BEGIN IMMEDIATE"`. No timeout, production behavior, other test or fixture changed by main. If the inner wait returns False without a signal, the test now fails before treating the contention precondition as met; existing finally cleanup can still release the owned browser task.
- **Recoverability:** before the source Edit, main inspected both test files as ordinary/link-count1 and backed up seven current test/task/decision paths at `/tmp/crf-mcp-agent-main-assert-7f09b614/files` in a new private directory, using explicit plain file copies. All older backups/probes retained.
- **Actual self-review / static checks:** targeted diff shows exactly one added source line; adapter-test cmp succeeds; pre/post source-edit inventory cmp succeeds; plain Git diff --check/HEAD/base..HEAD log pass/unchanged. No new file was introduced by the source edit and no commit occurred. This is main self-review, not independent review or Ruff/type/syntax execution.
- **TDD limitation:** the missed success condition was located in source and checked against CPython API semantics before the edit. The authorized source delta is itself an assertion in the existing regression test; a separate forced-timeout regression file/mode was not authorized. No separate RED/GREEN execution is claimed. Actual affected-test execution remains necessary.
- **Runtime status:** NOT RUN after C16: pytest/probes, SDK/adapter/stdio tests, coverage, Ruff/py_compile/type checks, frontend/build/browser rerun and final independent review. The prior runner refusal precondition is unchanged; main did not retry, switch interpreters/commands or delegate execution. User's85passed/1failed is historical pre-C15 evidence, not current GREEN. The next execution path is the user's external terminal with the existing isolated backend/adapter commands, not an in-session `!` retry or a new runner.
- **Disposition:** no remaining known static blocker from the reviewed audit/G1/G2 corrections; source work is frozen and task remains in_progress/accepted=false pending actual verification. No production access, credential inspection/issuance, dependencies/config/permissions/provider change, history/publication/deployment/archive/deletion, new agent or automatic eighth correction.
