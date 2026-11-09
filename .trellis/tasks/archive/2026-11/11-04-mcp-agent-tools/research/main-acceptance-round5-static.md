# Main Static Acceptance — C14 Test-Only Candidate (Fifth Repair)

Date: 2026-11-06. **Not accepted.** Main reviewed all five actual test diffs. The three concrete C13 test defects are corrected in source, and both requested real integration paths have been added. No post-fix runtime, format, coverage or process/browser result exists. Two assertion-strength gaps still prevent treating the new tests as complete proof of the stated concurrency/exactly-once contracts. No sixth batch or inline test fix is authorized.

> **Subsequent user-run evidence (2026-11-06):** the selected backend/probe command later produced85passed/1failed/155warnings in11.01s. The final concurrency audit assertion wrongly counts the already-committed credential.issue baseline. See [round5-user-validation.md](round5-user-validation.md) for the attributed command/root cause. This report below preserves the original static-review state; its NOT RUN ledger describes that earlier point, not a denial of the later user run. G1/G2, full matrix/coverage and acceptance remain open; no sixth batch was authorized.

## Scope / Provenance

- C14 source delta is exactly five existing Python test files: three backend tests and two adapter tests. No production/documentation/dependency/global-fixture/probe edit by B was found. The two extra line rewraps in test_agent_tools_edit.py preserve the existing insertion/corrupt-link assertions.
- Fresh backup: `/tmp/crf-mcp-agent-round5-7f09b614/files`, containing73 regular-file copies of the current pre-C14 candidate/task/probe state. Main read every five-file `diff -u`; expected diff exit1 indicates displayed differences, not a failed test execution.
- A loop-based snapshot comparison was refused before execution because the guard could not screen its bound path. Main followed the requested split into explicit, plain cmp commands; no interpreter/alternate test runner was used. Those commands confirmed **65 unchanged files =50 protected delivery files +3 original A probes +12 task/requirements/evidence files**. The remaining eight snapshot paths are the five reviewed test changes and three expected A-owned records (implement.md, task.json, session.log).
- Full `git ls-files --modified --others --exclude-standard` inventory remained unchanged before this A-owned report. `git diff --check` passes. HEAD remains `73e4dd559fda053bc7033568ff6308f84cc1bf50`, no base..HEAD commit. All five edited sources are ordinary files with link count1.
- Writer requested `sonnet`; independently resolved model/cost remain unavailable. Its report explicitly says runtime checks NOT RUN. It additionally disclosed a denied combined awk + python3 -c no-op attempt, followed by an awk-only scan. The denied interpreter command is an attempted violation of the explicit no-interpreter instruction, **not an executed import/test and not a passing check**. Main did not rerun it or inspect the worker transcript. C13's earlier actually executed third-party import violation remains separately recorded, not retroactively authorized.

## Corrected C13 Defects — Static Source Evidence

1. **T1** — `backend/tests/test_agent_shared_changes.py:681-717`: parametrized ASCII case labels feed `tswitch-{case}`; Chinese display types remain test data, not request identities. Original type-switch checks are retained.
2. **T2** — `backend/tests/test_agent_tools_edit.py:867-923`: the shared base no longer caches a pre-first-write fingerprint. Each distinct text/checkbox add reads a current fingerprint at dispatch, retaining separate request IDs and authoring assertions.
3. **T3** — `agent_bridge/tests/test_client.py:178`: httpx is locally bound; the handler uses that binding for ReadTimeout. This is a source correction, not an executed import or syntax/test pass.

## Added Integration Paths — What They Actually Exercise

- **I1** — `agent_bridge/tests/test_stdio_e2e.py:429-680`: a forwarding httpx transport reaches the real disposable backend, discards the first write response, and allows production BackendClient's fixed lookup. The authenticated backend-generated manifest supplies the closed AgentWriteData output schema. The actual production build_server and official SDK low-level request-handler harness validate recovered local-write and preview outputs; preview approval/apply is followed by an actual lookup asserting the stored preview remains unchanged. These are **in-process SDK-handler + real HTTP backend integration tests**, not two new process-level stdio tests. The original official ClientSession/stdio subprocess flow remains unchanged and was not rerun.
- **I2** — `backend/tests/test_agent_access_concurrency.py:449-619`: two real ASGI HTTP requests share an event loop and a disposable file/WAL engine. The browser service wrapper delegates to real update_binding_profile, then holds its request transaction; a test-engine-backed yield-session dependency uses the real Session.begin commit/finalizer pattern rather than a manual SQL-holder commit. Assertions expect browser200/stale-agent409, browser persistence, no rejected-agent mutation/result/audit and restored overrides. The earlier manual-holder control remains separately named.
- Verified direct contracts by reading the existing profile DTO/router, backend write DTO/dispatch, BackendClient/build_server and `_invoke_call_tool`. Valid helper names and the AgentWriteData schema reference were checked rather than assumed. No backend runtime was imported into the SDK environment by main.

## Remaining Assertion-Strength Gaps

### C14-G1 — Lock-wait overlap and heartbeat interval are not deterministically asserted

Anchors: `backend/tests/test_agent_access_concurrency.py:553-570,599`; off-loop production dispatch at `backend/src/routers/agent_tools.py:119-123`.

After the browser-held event, the test creates the agent task, waits a fixed150ms and releases the browser. There is no event/assertion proving the agent has actually attempted BEGIN IMMEDIATE while the browser lock is held. If agent dependency/thread dispatch is delayed beyond150ms, browser commit can finish first; the test can still observe browser200/agent409 without exercising a contended agent BEGIN or finalizer unblock. The heartbeat counter also includes the unconditional60ms sleep after requests finish; with a20ms heartbeat, that finalizer interval alone can satisfy `beats >= 2`, so the assertion does not establish scheduling during the lock-wait window. This is a **coverage/proof gap, not a claim that a runtime test failed or the production threadpool fix is wrong**. A deterministic agent-BEGIN-attempt barrier plus before/after heartbeat counts inside the held-lock interval would close it; no such edit is authorized now.

### C14-G2 — Lost-response counter does not assert total mutation dispatches

Anchors: `agent_bridge/tests/test_stdio_e2e.py:439-462,583-605,636-680`; production no-retry branch at `agent_bridge/client.py:164-195`.

`lost_posts` increments only for the first intercepted POST, while later POSTs are forwarded without being counted. Assertions of lost_posts==1/lookups==1 therefore establish one injected loss and one recovery lookup, **not exactly one mutation dispatch**. An extra POST using another request identity but the same idempotent instance value can leave the same content fingerprint; later replay of the original identity can also still succeed. These assertions alone would not detect that prohibited extra dispatch. The new real-schema/stored-body recovery path is genuinely present; its stronger exactly-once/no-extra-identity claim remains incompletely asserted. Recording all mutating requests/identities and asserting the expected sequence would close this gap without production changes, but that would be another edit batch and is not authorized.

## Verification Ledger

**Main actually ran**:
- Five targeted `diff -u` comparisons → all candidate test deltas read; exit1 expected for differences.
- Explicit plain cmp groups →24 protected backend +12 protected adapter +14 protected frontend/root +3 A probes +12 task/evidence files byte-identical (65 total). The earlier loop comparison was guard-refused, not counted as a run.
- `stat -c '%F %h %n' <five test paths>` → all regular files, link count1.
- `git ls-files --modified --others --exclude-standard` → unchanged delivery inventory; no new B file.
- `git diff --check`, `git rev-parse HEAD`, `git log <base>..HEAD --oneline` → whitespace pass and unchanged history.
- Targeted Read/rg → helper/schema/profile/transport/transaction contracts and line anchors checked. These are static review, not syntax/type/format/runtime verification.

**User previously ran, before C13 fixes**: isolated13-case probe12failed/1passed/23warnings,3.57s. That remains historical RED only.

**NOT RUN after C13/C14**: the untouched13-case probe; permanent backend/adapter tests; full suites; coverage; Ruff/py_compile/type checks; new actual HTTP/SDK integration executions; stdio subprocess rerun; browser rerun. No final independent re-review or spec acceptance. No commit/merge/push/deployment/archive/deletion. The worker's denied no-op does not lift any guard.

## Disposition / Next Gate

Keep task in_progress and accepted=false; five used/five authorized repair batches. Freeze the delivered sources. Do not automatically fix G1/G2 in main or B or start a sixth batch. Obtain real post-fix output via the user's external terminal/another genuinely allowed execution path, keeping the A probes unchanged and attributing results correctly. Narrow backend/adapter runs are diagnostic gates, not a substitute for full coverage >=9983/11331 and new-scope >=80% before final acceptance. The new assertion gaps and missing runtime proof must remain visible even if a narrow run is green.
