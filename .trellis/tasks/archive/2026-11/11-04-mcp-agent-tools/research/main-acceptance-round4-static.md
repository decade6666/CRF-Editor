# Main Static Acceptance — C13 Candidate (Fourth Repair)

Date: 2026-11-06. **Not accepted.** The implementer delivered candidate edits, not post-fix validation. Main read every changed delivery diff against the C13 snapshot. New permanent regression tests contain three definite static defects, and two expressly required integration paths are still not exercised. No fifth repair or inline source fix is authorized.

## Scope / Provenance

- Actual C13 delta: **16 deliverables =6 production Python +6 test Python +4 documentation files**. The worker's report said13 Python/7 tests; those counts are not adopted.
- Relative to `/tmp/crf-mcp-agent-round4-7f09b614`:72 regular-file paths checked;54 unchanged,18 changed. Two changes are main-owned implement.md/task.json records; the other16 are within the exact19-file C13 allowlist. There are39 unchanged delivery files. The three A probes, global fixture, all dependencies/locks, frontend, models, root context/index and canonical spec were unchanged by B. Full modified/untracked inventory showed no new delivery file.
- HEAD remains `73e4dd559fda053bc7033568ff6308f84cc1bf50`, no base..HEAD commit; `git diff --check` passes. No automatic deletion/revert/cleanup or source editing by main.
- Native writer requested `sonnet`; independently resolved model/cost still unavailable. Its runtime RED attribution correctly refers to the **user's external12failed/1passed** result, not a B/A-run command.
- B clarified, without rerunning, that AST parsing used only stdlib ast/io/sys through the backend interpreter:11 backend paths plus2 adapter tests, including the unchanged test_stdio_e2e.py. This is a worker-reported static parse, not main-run syntax/type/style/runtime verification. They separately disclosed `/home/decade/.venvs/crf-editor/bin/python -c "import httpx; print('httpx', httpx.__version__)" 2>&1 | tail -1`: this **did import the third-party httpx package/dependency chain**, so it violated C13's explicit no-import-runner boundary. They report no project-module import, tests or builds. Main did not rerun/read a worker transcript or independently execute this check; do not recast it as metadata-only inspection, retroactive permission or a passing gate. Counts reconciled:13 parsed paths =12 changed Python +1 unchanged, while actual deliveries remain16/12Python/6tests/4docs. The report's opening “all validation completed” remains rejected: post-fix tests/build/coverage/browser were NOT RUN.

## Candidate Production Fixes — Static Review Only

- IR1: `routers/agent_tools.py` wraps freshly loaded stored outcomes through `_wrap`, keeping the fingerprint outside closed `data`; fallback uses `after_fingerprint` only when the stored fingerprint is absent. Preview's stored result remains preserved across apply (checked actual shared-apply tail); no storage-format migration or idempotency rewrite.
- IR2: grouped options now join CodeList and filter `CodeList.project_id == pid`; unrelated active/recycled dictionaries no longer enter that query's cap.
- IR3: bounded body parsing stays async; synchronous `_execute_tool` moves through installed Starlette `run_in_threadpool`. Existing explicit BEGIN/BEGIN IMMEDIATE, auth, validation, result and audit commit/rollback remain inside it. The limiter's existing threading.Lock was checked as a direct new-concurrency dependency.
- IR4: canonical/default date helpers and type-specific codelist/unit/digit/checkbox cleanup are reused for new definitions/shared changes; explicitly inapplicable shared keys are cleared and disclosed as derived, preserving explicit checkbox+codelist422. This follows C13's existing synchronization decision, not an unresolved preference requiring a new product choice. Untouched legacy keys stay out of normalization. The shared patch walks its fixed PATCH_KEYS order (field_type before date_format); it is not an unordered target-type validation loop.
- IR5: schema position minimum1; create-profile ValueError maps to400 within the existing outer rollback.
- IR6: local instance editing rejects foreign bound definitions and checks their codelist/unit links before mutation. No silent repair/rebind.

These checks show intended code paths, not GREEN/coverage/E2E proof. The13-case A probe remains untouched and has not been rerun after the edits.

## Definite Blocking Test Defects — Statically Confirmed, Not Executed

| ID | Anchor / corroboration | Failure scenario | Required correction |
|---|---|---|---|
| C13-T1 | `backend/tests/test_agent_shared_changes.py:715`; `backend/src/schemas/agent_tools.py:36,237`; helper forwards payload unchanged | All four parametrized targets are Chinese type strings. `request_id=f"tswitch-{target}-{attribute}"` therefore violates the safe-ASCII pattern. The endpoint rejects422 before any type-switch assertion, while the test requires200. | Use stable valid ASCII identities, not labels/type display text. Preserve strict production request-ID validation. |
| C13-T2 | `backend/tests/test_agent_tools_edit.py:862-919`; unchanged `check_and_bind` at `agent_edit_service.py:319-325` | The test records one fingerprint in `base`, successfully adds the text definition/instance, then reuses that old fingerprint for a distinct checkbox-write request. The new identity must hit the stale-state409 gate, not200 as asserted. | Read a current fingerprint after the first committed write before building the second distinct mutation. Do not weaken fingerprint enforcement or reuse an identity to hide it. |
| C13-T3 | `agent_bridge/tests/test_client.py:174-202`; module imports at:1-12 and local imports at:16,101,126,143,160 | The new test uses `httpx.Client`/MockTransport/Response but never binds `httpx` in its local or module scope. Other functions' local imports and handler's `_httpx` alias do not define it; the context-manager expression raises NameError before recovery runs. | Import httpx in the test or at module scope; do not suppress the error or remove the assertion. |

No new runtime failure count is claimed. These are concrete code/test-input contradictions found by reading, not a fabricated run of the permanent suite.

## Required Coverage Gaps

1. **IR1 real stored response through adapter recovery is not covered** — `agent_bridge/tests/test_client.py:183-200` hand-constructs the success envelope and uses conftest's static manifest. That fixture (`agent_bridge/tests/conftest.py:48-56`) only says `data` is an arbitrary object; it is not the backend-generated closed per-tool data schema. The new test would not exercise a malformed backend result lookup even after its missing import is fixed. The new backend lookup tests correctly validate actual stored responses with Pydantic, but the C13 cross-stack recovery assertion still needs the actual authenticated backend manifest/body rather than a known-correct fake. `test_stdio_e2e.py` was not changed; its existing real-process happy path is not proof of timeout-result recovery.
2. **IR3 actual browser request/finalizer scheduling is not covered** — `test_agent_access_concurrency.py:350-443` makes one real ASGI agent request, while a manually opened SQL connection commits in a loop callback. This improves the isolated liveness proof but never issues a concurrent browser HTTP request or executes its real yield-dependency transaction finalizer. C13 explicitly required that original failure path. Add same-loop concurrent actual browser/agent ASGI requests on disposable file/WAL SQLite, with bounded liveness and transactional assertions; do not label the callback simulation a full browser-concurrency test.

## Other Non-Blocking Notes

- `normalize_date_format_for_type` introduces an unannotated value/return signature despite the Python annotation convention; no type-check result is available. Do not confuse an AST parse with type/style/test success.
- README zh/en now distinguish request_id from apply's change_id and explicitly admit UNKNOWN_OUTCOME; no new identity/retry feature was added.
- Earlier unrelated audit retention, compressed/disconnected transport, stale-detail UI and export-assertion gaps remain outside C13. No claim that these were repaired or that private data leakage was demonstrated.

## Verification Ledger

**Main actually ran**:
- Plain `git status --short`, `git rev-parse HEAD`, `git log <base>..HEAD --oneline`, `git diff --check` → unchanged history/inventory, whitespace pass.
- Plain cmp over all72 paths plus regular-file checks →54 identical /18 changed including2 main-owned records;16 in-scope B deliverables, no protected source/test/dependency change.
- `git ls-files --modified --others --exclude-standard` → no undeclared new delivery file.
- Targeted `diff -u`, Read and rg → all16 delivery deltas inspected, plus directly required validation/normalization/result-storage/limiter/fixture call sites. Diff exit1 means a difference was displayed, not a failed code test. One chained README diff short-circuited on this expected exit; the English diff was then read separately.

**User ran before fixes**:12 failed/1 passed/23warnings,3.57s, as recorded in `round4-user-red.md`.

**NOT RUN after fixes**:13-case probe; new permanent tests; backend/adapter/frontend suites; coverage; Ruff/type/py_compile checks; browser/stdio process validation. The in-session runner guard remains active; no retry, alternative runner or delegated bypass by main. No new pass/fail runtime counts, final independent re-review, spec acceptance, commit/merge/push/deployment/archive.

## Disposition

Keep source frozen, `status=in_progress`, `relay_main_accepted=false`, four used/four authorized repair batches. Do not start a fifth round automatically or silently repair the tests in main. Recommended next authorization, if the user chooses: a tightly bounded regression-test correction/completion batch for C13-T1–T3 and the two already-required integration gaps, preserving candidate production scope and all guards, followed by actual user/allowed-path GREEN/full coverage validation and independent re-review. No new feature or dependency is required by this recommendation.
