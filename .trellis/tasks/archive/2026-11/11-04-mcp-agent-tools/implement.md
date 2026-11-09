# Execution Plan — Sonnet Relay

Status: user approved implementation and bounded dependency/disposable-test preparation on 2026-11-05 (PRD C8). Model A owns task artifacts, environment provisioning, acceptance, and all Git history; model B implements only after task activation and passing environment/baseline gates.

## Planning Board

| State | Item | Owner |
| --- | --- | --- |
| Done | User-selected ten-tool/stdin-stdout transport scope and proposed design | A |
| Done | Curated context manifests, lossless PRD convergence/manual read-through, task validate and tracked-diff checks | A |
| Blocked | Extra automated ID/anchor/link/shell/whitespace probe refused by worktree isolation guard; not executed or bypassed | A/environment |
| Done | Formal artifact, dependency and disposable-test-credential approval (2026-11-05) | A/user |
| Done | Task activation, isolated dependencies/SDK import check, and backend/frontend regression + serial coverage baselines | A |
| Not accepted | Initial implement turn returned provider-route 503; original worker terminated at its two-hour limit. Partial code is not accepted. | B/environment |
| Reported done | B returned supervisor `done` seq 579 after the C10 retry; this is not main-session acceptance. Requested model `claude-sonnet-5-5`; resolved model was not supplied. | B |
| Done | User authorized only the reported isolated agent-engine fixture adaptation (C9); no broader setup or runtime authority | A/user |
| Done | Main actual-diff/security review and full existing matrix reruns; 21 isolated acceptance probes failed. All 53 deliverables backed up before repair. | A |
| Interrupted | Acceptance fix round 1 of 2 stopped on provider HTTP 502 (seq 780), then idle-timeout SIGTERM (seq 782); no repair done/report/cost. No automatic resume or model change. | B/environment |
| Verified, not accepted | Main read-only interrupted-state checks: original21 probes pass, additional5 behavior probes fail, Ruff fails. Backend1599, adapter37 and quiet frontend1069+228 pass. Current54 deliverables separately backed up. | A |
| Reported complete; verified in part | C11 native writer completed the interrupted first repair. Main inspected the actual delta; backend1610 (9962/11308), adapter37 including real SDK E2E, frontend1069+228, both frontend coverage comparisons, Ruff/lint/build and original26 probes' backend21 passed. Native resolved model/cost are not independently supplied by the host. | B/A |
| Verified; blocking findings remain | Disposable browser: grant issue/revoke, approve/reject/apply/readback/replay, stale approval rejection, dark mode, keyboard close/reopen and token clearing passed. Applied proposal still falsely says not executed; 390px viewport has an 860px dialog. Main also reproduced five missing Project fingerprint columns, missing no-store on owner validation errors, and permissive manifest validation (11 failures across 12 new boundary probes). | A |
| Reported complete, not accepted | Acceptance fix round 2 of 2 finished on the same native writer. Main reran backend1621, adapter43 including real SDK E2E, frontend1072+231, backend27/adapter9/Vue2 acceptance probes, coverage, Ruff/lint/build. Detailed main evidence: `research/main-acceptance-round2.md`. | B/A |
| Historical stop, extended by C12 | Main confirmed two remaining blockers after round2: the rendered390px dialog remains860px because the compiled scoped width rule does not match; malformed inputSchema/outputSchema each pass startup (two new failing probes). The task was stopped until the user's explicit continuation below. | A/user |
| Reported complete | The fresh native Sonnet replacement finished C12's one extra repair (third total). No fourth round or main source takeover is authorized. Native resolved model/cost are not independently supplied. | B |
| Main verified; independent review pending | Main inspected all nine changed files and confirmed the other45 deliverables byte-identical to the round3 backup using plain cmp. Backend1621 (9983/11331; new agent1520/1641), adapter57 including real SDK stdio E2E (production280/311), frontend1072+232, backend27/adapter11/Vue2 probes, both coverage comparisons, Ruff/pip/lint/build passed. Lint has0errors/2819warnings. Full evidence: `research/main-acceptance-round3.md`. | A |
| Main verified | Real disposable browser: narrow light/dark dialog366px with reachable close, desktop860px; issue/revoke, token clear/reopen, keyboard focus, approve/reject/apply/readback/replay and project-date stale rejection passed. Initial proposals expired410 during the long UI walk; explicitly refreshed disposable proposals passed without changing TTL. Owned temporary backend/browser processes stopped; evidence retained. | A |
| Done | A-only cross-stack §16/root HTTPS-loopback pointer/index synchronization. JSON,15 incrementally added paths, seven executable-contract sections, root26448-character size and git diff --check passed; plain index diff confirms historical scan fields unchanged. Combined Python/Git statistics check was guard-refused, not bypassed. No code tests rerun for this documentation-only increment. | A |
| FAIL, stopped | Fresh read-only reviewer requested fable returned five blocking/six non-blocking groups. Main confirmed all67 snapshotted files byte-identical and unchanged Git status/HEAD/history. Source/call-site verification confirms IR1–IR5; the corrupt foreign-definition update (reviewer non-blocking) is IR6 blocking under explicit link-isolation acceptance. Requested fable / self-reported Opus5.5 is not independently resolved; cost unknown. | R/A |
| Not run | Main prepared13 ignored isolated follow-up probe cases; the backend wrapper command was guard-refused twice before execution. No runtime result, alternate runner or peer bypass is claimed. Prior full-suite/browser passes remain valid but do not cover these new findings. | A/environment |
| Historical stop, extended by C13 | Source remained frozen/in_progress after independent FAIL. No unapproved fourth round or history/deployment changes occurred. Findings and limits: `research/independent-review-verification.md`. | A/user |
| Done | User C13 explicitly confirms one IR1–IR6 repair batch (fourth total), exact19-file subset below; existing native Sonnet writer is reachable. No fifth round or settings/history/deployment authority. | A/user |
| Historical blocked gate | Agent and session-shell wrapper commands were refused before execution; none is retrospectively counted as a run. No agent source edit or alternate/peer execution occurred during that stop. | A/environment |
| RED supplied by user | External terminal probe output confirms12 failed/1 passed/23 warnings in3.57s. All six categories now have runtime symptom evidence, with a bounded same-loop lock test rather than a real browser concurrency test. Evidence: `research/round4-user-red.md`. | User/A |
| Candidate delivered, not validated | B returned C13 candidate. Main checked16 changed deliverables (6 production Python +6 test Python +4docs), all within the19-file subset;72-file snapshot:54 unchanged/18 changed including2 A-owned state files. No new delivery file/commit; protected probes, dependencies, global fixture, frontend/models/spec unchanged. B's claimed13 Python/7tests is not the verified count. | B/A |
| Main static FAIL | Three definite new test defects: Chinese request IDs reject422; a second distinct write reuses the stale pre-first-write fingerprint; new SDK test lacks a bound httpx import. Two required paths remain incomplete: actual backend stored outcome/manifest through adapter recovery, and concurrent browser HTTP yield-finalizer commit (the new ASGI test uses only a manual holder callback). No post-fix runtime run. Evidence: `research/main-acceptance-round4-static.md`. | A |
| Historical stop, extended only by C14 | B disclosed stdlib-only AST parsing over13 paths (12 changed Python +1 unchanged), distinct from its prohibited real httpx third-party import check. The import was not metadata-only and violated C13's no-import-runner restriction; no project import/tests/build reported, no rerun or retroactive permission by main. Delivery count remains16/12Python/6tests/4docs. Four batches were spent at this stop. | A/user |
| Candidate delivered; frozen | C14 writer returned exactly five test-file changes, with all runtime checks NOT RUN. Main read every delta and explicitly compared65 protected paths (50 deliveries +3 probes +12 task/evidence) byte-identical; no new B file/commit, five edited files regular/link-count1. Worker disclosed a guard-denied interpreter no-op attempt, not executed validation. | B/A |
| Main review stopped, not accepted | T1–T3 corrected in source; real HTTP/generated-schema SDK-handler recovery and same-loop browser/agent HTTP tests are present. Two proof gaps remain: no deterministic agent-BEGIN overlap / heartbeat count confined to the held-lock interval, and lost_posts counts injected losses rather than all mutation dispatches. At initial review no post-C13/C14 runtime result existed. Evidence: `research/main-acceptance-round5-static.md`. Five used/five authorized batches; no sixth or main inline source fixes. | A/user |
| User external run:85 passed/1 failed | The selected backend/probe command ran externally:85passed/1failed/155warnings,11.01s. Only failure: new same-loop test expects total audit0 but Arrange already commits credential.issue audit1. Main confirmed the test/service source contradiction; no production audit leak is established and no code was changed. Earlier response/persistence/zero-result assertions passed in that test. G1/G2, adapter/full suites/coverage and final review remain pending. Evidence: `research/round5-user-validation.md`. This output alone granted no sixth-round authority. | User/A |
| Candidate delivered; frozen | C15 changes exactly two tests; main read both complete deltas and checked71 protected snapshot paths byte-identical (53 deliveries +3 probes +14 task/evidence +1 log), unchanged pre/post delivery inventory and HEAD/history. Audit baseline and exact mutation sequence are corrected in source; worker reports no interpreter/runner use. No post-C15 runtime result. | B/A |
| Historical C15 stop, extended only by C16 | One G1 gate remained at concurrency.py:588: Event.wait(8) returns False normally on timeout, before outer wait_for(10); that boolean/signal was not checked before heartbeat measurement/browser release. Final BEGIN count did not prove earlier overlap. Report: `research/main-acceptance-round6-static.md`. At that stop six batches were used/authorized and no main inline fix was allowed. | A/user |
| One-line source fix applied; runtime pending | C16 user `确认，继续` authorizes main only; backed up7 current paths at `/tmp/crf-mcp-agent-main-assert-7f09b614/files`, then added the one event-signal assertion at concurrency.py:589. Exact diff has one added source line, adapter test and source-edit inventory unchanged, Git whitespace/history checks pass. No native dispatch or runtime/format/type/coverage run; unchanged guard not retried. Seven used/seven authorized corrections, no eighth. Current record: C16 follow-up in `research/main-acceptance-round6-static.md`. | A |
| Formatting applied; Ruff recheck pending | User external runs passed: backend tests-only 1638 (10019/11366; agent scope 1538/1658), backend probes 40, adapter 60 (production 280/311) + probes 11. Backend Ruff check then reported 4 files / 7 hunks. C17 user choice `主会话按输出修正（推荐）`: main backed up the 4 files at `/tmp/crf-mcp-agent-ruff-format-7f09b614/files` and applied exactly those hunks; diffs, whitespace/parenthesis-stripped comparison, `git diff --check` and inventory checks pass. Eight used/eight authorized, no ninth. Record: `research/c16-user-validation.md`. | A |
| Runtime gates passed; independent review pending | User external rechecks after C17: backend Ruff 197 and adapter Ruff 11 files already formatted; backend tests-only 1638 passed on the final bytes (10019/11366, agent scope 1538/1658). Frontend/browser evidence remains the round3 run (frontend bytes unchanged). Final independent review awaits user authorization; spec sync follows it. | A/user |
| Done | Final independent review (fresh native read-only agent, requested `fable`): PASS with 15 findings; reviewer changed nothing (80 checksums/status/commits unchanged). Main verified all 15; F1 (AC4) and F2 (AC6) are acceptance-relevant. Record: `research/final-independent-review.md`. | R/A |
| Delivered; runtime passed except one coverage sub-gate | C18 user choices `C18 修应改项（推荐）` + `原生 Sonnet 子代理（推荐）`: ninth bounded batch over the exact 19-file subset below; F7–F10/F13 deferred as follow-ups. Native writer `c18-writer` (requested `sonnet`) changed exactly the 19 files (HEAD/inventory unchanged, 63 other snapshot paths byte-identical). Main diff review: no blocking finding; N1–N3 non-blocking. A-owned probe lookup converted to POST (backup `/tmp/crf-mcp-agent-c18-7f09b614/probes/`). After the user chose `退出隔离后我来跑（推荐）`, main ran `ExitWorktree keep` and the validation in-session. Passed: backend 1646, total coverage 10041/11390 = 88.156% (not decreased), probes 40, adapter 62 (production 289/318) + probes 11, both Ruff checks, wiring 16/16, lint 0 errors. Failed sub-gate: agent scope 1560/1682 = 92.747% < 92.762% floor, caused by the lookup handler's uncovered `HTTPException`/500 branches (`routers/agent_tools.py:292-298`). At that gate a test-only fix needed new authority; C19 below resolves the sub-gate. Record: `research/c18-main-review.md`. | B/A |
| Done; verification and spec sync passed | C19 user selection `补 2 个测试（推荐）` + `继续`: tenth bounded correction, main inline, exactly two tests and one import in `backend/tests/test_agent_tools_edit.py`. Targeted2 and backend1648 pass; total10047/11390 = 88.209%, agent1566/1682 = 93.103%, both above C17 floors; Ruff197 already formatted. Main reviewed the actual delta; the 82-path snapshot changed only the authorized test file before record/spec sync. §16 and its Quick Reference are synchronized. No independent review of this delta, no eleventh correction, commit or merge. Record: `research/c19-validation.md`. | A |
| Done; available for user validation | C20 user explicitly requests empty decimal precision → zero display and formula-placement analysis. Main changed exactly two rendering defaults plus existing tests, synchronized §5/docs, and preserved the oversized decision history verbatim. RED reproduced; backend1658, frontend1078+232, exact coverage non-decrease, Ruff/lint/build pass. Resumed only 5174 without reseeding, proved unchanged project fingerprint, inspected real desktop preview and exported aCRF integer-only AGE; Windows HTTP200 verified. Bandit unavailable, no independent review or note-export change. Evidence: `research/c20-decimal-default.md`. | A |
| Blocked at decision-archive whitespace gate; two work commits done | C21 user formally approved the five-batch Git finish and separate one-line adapter formatter inheritance + index/records. Independent C18–C21 static review PASS; no blockers/two LOW follow-ups; original82 hashes/index reconciled. Product `6eefea6` and spec `4964fa6` committed with all real gates passed. Third batch's verbatim historical archive is staged but `git diff --cached --check` exits2 at line229 (original blank EOF). No trimming/bypass, third commit, task archive/journal, merge/push, service stop or cleanup; stop on this new blocker. Preserve `/tmp`, other worktrees and 8888. Evidence: `research/c21-finish.md`. | A/R |
| Accepted; task archived, final integration handoff | C22 user authorized only the external archive boundary and necessary records. Exact original62337-byte prefix/hash/seven LF bytes preserved; third work commit `19905d2` and all real gates passed. Only this task moved via supported `--no-commit` archive; completed2026-11-09 and exact23 regular files verified after correcting an over-strict JSON-LF helper. Archived-state backup, task/journal commits, main integration, normal push, 5174 stop and task-only cleanup follow; no source/test/spec change, `/tmp` deletion or8888 action. Exact evidence/limitations: `research/c21-finish.md`; later integration outcomes live in retained finish evidence and the final user report. | A |

## 1. Gates Before Dispatch — A Only

1. Deliver the converged PRD/design/plan and explain the new backend grants, trusted approval UI, private-export stripping, and dependency boundary. Obtain artifact approval; do not infer it from task creation or the earlier MVP/transport selections.
2. Obtain approval for adapter dependencies (`mcp==1.30.0`, `httpx==0.27.2`, `jsonschema~=4.23`), an isolated adapter environment, and frontend `@vitest/coverage-v8@5.0.3`. Any incompatible resolution or additional dependency requires review, not an unannounced backend-stack upgrade.
3. Use formal AskUserQuestion approval before generating temporary test credentials or running suites that generate them. Limit them to disposable local test state; no live accounts, tokens, config.yaml, database, or systemd service.
4. After gates 1–3, validate manifests, record HEAD/status, then run `python3 ./.trellis/scripts/task.py start .trellis/tasks/11-04-mcp-agent-tools`. Require `in_progress`, the current task pointer, and this task branch/worktree before dependency/project writes. Task activation alone does not authorize B dispatch before gates 5–7 pass.
5. Main provisions `agent_bridge/.venv`, the approved requirements/lock files, and the frontend dev dependency/lockfile. These are A-owned preparation changes, not B's install authority. Validate imports and `pip check`; record actual installed SDK/Python versions. Run frontend installation only after permission; do not use `npx` auto-download prompts.
6. Prepare ignored `<worktree>/.pytest-tmp/mcp-agent-tools/` for temporary databases/cache/reports and a main-owned `/tmp/crf-mcp-agent-backend-checks.sh` wrapper. The wrapper explicitly changes to this worktree's `backend`, clears only HTTP_PROXY/HTTPS_PROXY/ALL_PROXY and lowercase variants for the child command, sets TMPDIR/XDG_CACHE_HOME/COVERAGE_FILE under the ignored test root, disables bytecode writes, and executes `/home/decade/.venvs/crf-editor/bin/python -m "$@"`. It must neither read secret values nor change proxy settings globally.
7. Capture passing backend/frontend regression and coverage baselines before B changes application code; new dependency preparation is not evidence of feature correctness. Baseline failures block dispatch unless explicitly resolved/reviewed. Record the exact A-owned preparation diff separately from B's future changes.
8. Spawn through `trellis channel` with `TRELLIS_HOOKS=0`, requested B model `claude-sonnet-5-5`, and this worktree as `--cwd`; never substitute a native implement agent. Record resolved model from the eventual completion event, not the requested name. No transcript handoff.

### Authorized interrupted-run retry

C10 authorizes one retry after the original provider 503 and two-hour termination. Back up all partial changes, resume the original `implement.session-id` with `--model claude-sonnet-5-5`, and set the retry supervisor and wait timeout to 4h; keep the 30m idle TTL and exactly one writer. This is continuation of the interrupted initial implementation, not a completed acceptance-fix round. The C9 fixture exception is now part of the current allowlist. Do not modify gateway/provider/alias settings, install anything, run auxiliary model calls, or spawn subagents. A new provider-route error stops automatic retries and requires reporting rather than model substitution.

## 2. B Write Allowlist

### Current execution override — C22 (main, archive boundary and approved finish)

Authority: PRD C22 and the user's `继续` after the explicitly proposed minimal archive-boundary solution. Append an external provenance/end marker after the complete original62337-byte payload (same prefix/hash, seven original trailing LF bytes retained), and update only necessary existing task/decision records. Be explicit that the whole archive container now differs while the historical payload remains byte-identical. Refresh the staged archive, verify whitespace/secret gates and continue C21's approved remaining work/archive/journal/main/push/stop/task-only-cleanup sequence. No history trimming, hook/threshold override, product/test/spec/dependency change, deferred repair, production deployment or deletion of retained `/tmp`/other worktrees. Report any new blocker without automatic expansion.

### Historical execution override — C21 (main, authorized finish and formatter config only)

Authority: PRD C21 and the user's formal `完整 Git 收尾（推荐）` / `继承既有格式规则（推荐）` selections. Add only the one-line adapter inheritance config, its existing inventory entry and necessary task/decision records; do not reformat source, change backend policy/hooks/dependencies/thresholds or fix deferred findings. The original code/test/spec/user-doc snapshot remains unchanged apart from the explicitly authorized index item and finish records.

After independent PASS and real gates, execute the approved three work commits, then this task's archive and journal as separate commits, merge locally into main, push normally, stop only the verified isolated 5174 process, and remove only the merged task worktree/branch. Preserve `/tmp` acceptance data/backups and all other worktrees/tasks; do not build/restart/deploy 8888, access real data or remove Windows forwarding rules. New blockers stop the pipeline without automatic business fixes. Board/results: `research/c21-finish.md`.

### Historical execution override — C20 (main, numeric rendering follow-up)

Authority: the user's 2026-11-09 explicit request to display empty decimal precision as zero and analyze the missing formula. This is one newly authorized bounded follow-up, not automatic continuation of C19.

- Main changes only the numeric fallback in `backend/src/services/export_service.py` and `frontend/src/composables/useCRFRenderer.js`, with regressions in existing `backend/tests/test_export_service.py` and `frontend/tests/columnWidthPlanning.test.js`.
- NULL/omitted decimal precision displays as zero; explicit zero/positive values and unit suffixes are preserved. Do not change database values or shared approvals.
- Capture RED first, then the minimal two-default fix, targeted GREEN and full regression/coverage/format/lint/build checks. Keep test/runtime data isolated; no dependency, fixture, runner, schema, model, permission or provider changes.
- Synchronize existing §5, READMEs and module notes; record the plan/results and preserve the oversized prior decision log verbatim before its required archive-pointer compression. No Trellis task archival or Git history actions.
- Analyze `help_text` persistence/export read-only. Do not add exported notes, label-authoring tools, repair the test project, approve/apply proposals, or fix deferred review items.
- The running 5174 test instance may need its worktree build refreshed; preserve the user's test database and credentials, never touch 8888/systemd/real config/database, and disclose any unverified browser/restart scope.
- Board and evidence: `research/c20-decimal-default.md`. No additional repair is authorized.

### Historical execution override — C19 (main, two error-boundary tests only)

Authority: PRD C19 and the user's `补 2 个测试（推荐）` selection, followed by `继续`. This is the tenth bounded correction; no eleventh is authorized.

- Main edits only `backend/tests/test_agent_tools_edit.py`, adding exactly two tests for the result lookup: malformed JSON → 422 `VALIDATION` + no-store; unexpected storage failure → 500 `INTERNAL` + no-store, generic response and server-side exception logging.
- Exercise the real router, body parser and error formatter. Inject the unexpected failure at the database connection boundary using a scoped `monkeypatch`; do not stub the handler under test.
- No production, adapter, frontend, dependency or configuration changes. Main may update the authorization, review and decision records.
- The C18 coverage report already reproduces the gap. This is coverage-only work over implemented behavior, not a production bug fix; report that distinction instead of claiming a nonexistent failing RED test.
- Back up the test file, review the exact delta, run the two tests, then the backend tests-only suite with `backend-c19-suite.json`, compare exact total/agent coverage against C17, and run Ruff. Existing adapter/frontend C18 results remain applicable because their bytes are unchanged.

### Historical execution override — C18 (native Sonnet writer, final-review repair batch)

Authority: PRD C18, the ninth bounded batch. Evidence: `research/final-independent-review.md`.

**Writer rules.** One fresh native `trellis-implement` writer (requested model `sonnet`) edits only the 19 files listed below. It may use Read/Grep/Glob, plain read-only Git (`status`, `diff`, `log`, `show`), Edit and Write. It must not:
- execute any interpreter, test, build, formatter, linter, app, shell script, or import/AST/metadata probe;
- install anything;
- stage, commit, stash, reset, restore, delete, or touch any other path.

Main reviews the actual diff and the user runs validation externally. F7–F10 and F13 stay follow-ups. Main may later apply formatting-only hunks that Ruff reports in these files, token-identically (as in C17).

**Write allowlist (exact, 19 files):**
- Source:
  - `backend/src/routers/agent_tools.py`
  - `backend/src/schemas/agent_tools.py`
  - `backend/src/services/agent_read_service.py`
  - `agent_bridge/client.py`
- Tests:
  - `backend/tests/test_agent_tools_edit.py`
  - `backend/tests/test_agent_shared_changes.py`
  - `backend/tests/test_agent_access.py`
  - `backend/tests/test_agent_tools_read.py`
  - `backend/tests/test_agent_access_exports.py`
  - `agent_bridge/tests/test_client.py`
  - `agent_bridge/tests/test_stdio_e2e.py`
  - `agent_bridge/tests/test_server.py`
  - `agent_bridge/tests/backend_fixture_server.py`
  - `frontend/tests/agentAccessWiring.test.js`
- Docs:
  - `agent_bridge/README.md`
  - `README.md`
  - `README.en.md`
  - `backend/.claude/CLAUDE.md`
  - `frontend/.claude/CLAUDE.md`

**Required outcomes:**

- **F2 — lookup bound to the original identity (AC6).**
  - **Backend route.** Replace `GET /agent/operations/{request_id}` with an async `POST /agent/operations/{request_id}`.
  - **Body.** Read through `parse_bounded_json_body` (64 KiB). It is the closed object `{"tool_name", "arguments"}`, validated by a new non-manifest Pydantic model in `schemas/agent_tools.py`:
    - `extra="forbid"`;
    - `tool_name` is a `Literal` drawn from a `LOOKUP_TOOL_NAMES` tuple: `crf_add_form_field`, `crf_update_form_field_instance`, `crf_reorder_form_fields`, `crf_preview_shared_definition_change`;
    - `arguments` is an object;
    - the model never enters `_TOOL_DEFINITIONS` or the manifest.
  - **Processing order.** The DB work runs in `run_in_threadpool`, as in dispatch.
    1. IP limit.
    2. Bounded body.
    3. Authenticate.
    4. `_limit_read`.
    5. `credential_scope`.
    6. Lookup-body validation → 422 `VALIDATION`.
    7. `_validate_input(registry[tool_name], arguments)` → 422 `VALIDATION`.
    8. `_require_granted_project` → 403 `GRANT_DENIED`.
    9. Path `request_id` must equal `arguments.request_id` → 422 `VALIDATION`.
    10. `bind_or_reject(session, credential, project.id, tool_name, request_id, canonical_input_payload(dto))` → mismatched tool or canonical input gives 409 `IDENTITY_REUSED`.
    11. None, or `status != "done"` → the unchanged 404 `UNKNOWN_OUTCOME` body.
    12. Otherwise → the unchanged stored envelope (`_wrap` plus the `after_fingerprint` fallback).
  - **Response rules.** No writes or audit rows. Every response is `Cache-Control: no-store`. Handled errors go through `agent_error_response`; unexpected exceptions are logged and answered 500, as in dispatch.
  - **Adapter.**
    - `lookup_operation(name, arguments)` POSTs `{"tool_name": name, "arguments": arguments}` to `OPERATION_RESULT_PATH.format(request_id=arguments["request_id"])`. 404 → `UNKNOWN_OUTCOME`, unchanged.
    - `_uncertain_outcome` looks up exactly once, and only for `MUTATING_TOOLS - {APPLY_TOOL}`; other timeouts → `BACKEND_UNAVAILABLE`.
    - An `IDENTITY_REUSED` `AgentClientError` from the lookup is re-raised unchanged (definitive: the call did not run). Any other lookup failure keeps `UNKNOWN_OUTCOME` with the original `request_id`.
    - Add the constant `ERR_IDENTITY_REUSED`.
  - **Tests.**
    - Convert every lookup call to POST with the original tool and arguments: `test_agent_tools_edit.py:476/481/718`, `test_agent_shared_changes.py:749`, `test_agent_access.py:558` (schema-valid `crf_add_form_field` arguments), `agent_bridge/tests/test_client.py` lookup tests, and `test_stdio_e2e.py:477`/`:699` (count POST lookups; `lookup_operation("crf_preview_shared_definition_change", preview_args)`).
    - New backend identity-mismatch test (`test_agent_tools_edit.py`): reuse a committed `request_id` with the same tool but different arguments → 409 `IDENTITY_REUSED`; with another tool and valid arguments → 409 `IDENTITY_REUSED`. Assert no new `AgentOperation` row and an unchanged design fingerprint.
    - New backend body/scope validation test (`test_agent_tools_edit.py`): extra top-level key, read tool, apply tool, DTO-invalid arguments, and path/argument `request_id` mismatch → 422 `VALIDATION`; foreign `project_id` → 403 `GRANT_DENIED`; the old `GET` → 405.
    - New adapter tests: lookup 409 `IDENTITY_REUSED` surfaces that code after exactly one lookup; a read-tool timeout performs zero lookups and returns `BACKEND_UNAVAILABLE`.
    - The timeout-recovery test asserts that the lookup body carries the original tool name and arguments.
- **F1 — AC4 evidence.**
  - Rename `test_agent_tools_edit.py::test_reorder_invalid_inline_growth_rollback` to `test_reorder_merging_inline_runs_within_baseline_succeeds`, with a docstring and comments that say what it proves.
  - Add three reorder tests: duplicate id; an instance id from another form; a reorder that splits a 1-block baseline into 2 inline blocks. Each must give 400 `VALIDATION`; the last also gives detail `INLINE_TABLE_LIMIT_MSG`. Each asserts the unchanged order and no `AgentOperation` row for its `request_id`.
  - Rename `test_agent_shared_changes.py::test_inline_growth_rejected_in_preview` to `test_preview_rejects_invalid_date_format_without_change`, and assert the definition is unchanged against a pre-call snapshot.
- **F3.**
  - Set `STATUS_DEFAULT_CODES[409] = CODE_CONFLICT`. Explicit `STALE_STATE` raises stay as they are.
  - `test_add_form_field_duplicate_definition_in_form` asserts `CONFLICT`.
  - Add a unit test in `test_agent_access.py`: `agent_error_response(HTTPException(409, …))` → `CONFLICT`; an explicit `AgentToolError(409, …, CODE_STALE_STATE)` → `STALE_STATE`; both no-store.
- **F14.**
  - `agent_read_service._definition_view` calls `ensure_no_foreign_links(session, definition.project_id, definition)` before resolving the codelist or unit.
  - Tests in `test_agent_tools_read.py`: form detail with a corrupt foreign codelist link, and separately a corrupt unit link → 422, detail `FOREIGN_LINK_MSG`, and no foreign name or code (`外部字典`, `C_EXT`, `U_EXT`) in the body.
- **F4/F5/F6/F15 — documentation and naming accuracy.**
  - `agent_bridge/README.md`:
    - The client example uses `/path/to/agent_bridge/.venv/bin/python`.
    - The security bullet states the real recovery. Only a response timeout triggers the single POST lookup with the original tool and arguments: found → original envelope; `IDENTITY_REUSED` → the call did not run, use a new `request_id`; absent → `UNKNOWN_OUTCOME` with the same `request_id`, which is safe to retry because the same input only replays. Connection failures and 5xx, including proxy 502/504, → `BACKEND_UNAVAILABLE` without a lookup. Apply keeps its `change_id`.
    - Code list: adapter codes `TOOL_REJECTED` / `BACKEND_UNAVAILABLE` / `UNKNOWN_OUTCOME` / `UNKNOWN_TOOL` / `OUTPUT_INVALID`, plus the backend domain codes passed through.
    - Test commands: the full suite with `BACKEND_PY` (it has the coverage gate), and an optional unit-only run with `--ignore=agent_bridge/tests/test_stdio_e2e.py` and no gate claim.
    - Refresh note: an open workbench needs the top-bar 「刷新数据」 button after MCP edits; there is no push or polling.
    - E2E cleanup sentence.
  - `README.md` / `README.en.md` MCP chapter: corrected lookup wording plus one refresh-disclosure bullet.
  - `backend/.claude/CLAUDE.md`: lookup line, "422 `VALIDATION` (location-prefixed Pydantic messages)" instead of "Chinese", and the 409 default `CONFLICT`.
  - `frontend/.claude/CLAUDE.md`: "seven owner routes", including the change detail.
  - `routers/agent_tools.py::_validate_input`: docstring only.
  - `schemas/agent_tools.py`: remove the duplicate registry heading and constants.
  - `agentAccessWiring.test.js`: title `composable hits every owner endpoint`, plus the fragment `'/agent-access/changes/${changeId}`'`.
- **F11.**
  - `test_agent_tools_edit.py:54`: capture `fp_before`, then assert `new_fp != fp_before` and `new_fp == _fp(...)`.
  - `test_agent_shared_changes.py`: drop the dead `:73` line; `:414` becomes `assert "codelist_id" not in derived_keys`.
  - `test_agent_tools_read.py:396-397`: use a real foreign FieldDefinition id.
  - `agent_bridge/tests/test_server.py:178-184`: correct the comment, assert exactly `TOOL_REJECTED`, and assert `backend.calls == [("crf_get_form_detail", {"project_id": 1})]`.
- **F12.**
  - `test_agent_access_exports.py:199-210`: insert one row per injected agent table, using runtime-built values only (gitleaks); assert the rows exist in the source before import; keep the zero-row assertions after import.
  - The `test_stdio_e2e.py` `backend` fixture deletes the handshake file and the server's `tmp_root` at teardown, the latter only when it is a directory named `crf-agent-e2e-*`. Teardown runs in try/finally.
  - `backend_fixture_server.py`: docstring accuracy.

**Style.** Ruff/black style at line length 120, matching each file's comment and test-name conventions. No new files; no other test, fixture, conftest, model, migration, frontend source, package, spec or task file.

**Validation (user, external terminal, after main's diff review):**
- Backend and adapter `ruff format --check`, run separately.
- Backend tests-only suite with a coverage JSON `backend-c18-suite.json`. Coverage must not fall below 88.149% or the agent scope's 92.76%.
- Backend probes in a separate session, after main updates the one A-owned probe lookup call.
- Adapter suite with `BACKEND_PY`, coverage and the ≥80% gate, then the adapter probes.
- `cd frontend && node --test tests/agentAccessWiring.test.js` and `npm run lint`.

### Historical execution override — C17 (main, Ruff formatting only)

The user selected `主会话按输出修正（推荐）` after the external backend `ruff format --check .` reported 4 files / 7 hunks. Main may apply exactly those displayed line-break changes in `backend/src/services/field_profile_service.py`, `backend/tests/test_agent_access_concurrency.py`, `backend/tests/test_agent_shared_changes.py` and `backend/tests/test_agent_tools_edit.py`, plus the necessary A-owned records. Backup first (`/tmp/crf-mcp-agent-ruff-format-7f09b614/files`), then inspect the exact diff: only whitespace/line breaks/parentheses Ruff added or removed, with identical tokens otherwise. Eighth bounded correction; no ninth, no subagent, no other file, no adapter formatting without new authority. The user reruns both Ruff checks (separately, not short-circuited) and the affected tests in the external terminal.

### Historical execution override — C16 (main, one assertion)

The user's explicit `确认，继续` authorizes main to add only the previously proposed event-signal assertion immediately after the agent wait in `backend/tests/test_agent_access_concurrency.py`. C15's native writer has acknowledged a full read-only freeze; do not dispatch/resume it or concurrently implement. Main owns this single source line plus necessary A-owned authorization/review/decision records; every other source/test/fixture/dependency/probe/config file stays unchanged. Make a recoverable current-file backup first and inspect the exact post-edit diff; no unrelated formatting.

Required source delta: after `await asyncio.wait_for(asyncio.to_thread(agent_begin_attempted.wait, 8), timeout=10)`, add `assert agent_begin_attempted.is_set(), "agent 未在持锁窗口内尝试 BEGIN IMMEDIATE"` before any held-window heartbeat measurement/browser release. This closes the inner-False/outer-timeout gap without changing timeouts, real transactions or production behavior. The existing test itself gains the fail-fast assertion; no separate new regression file or fault-injection mode is authorized. The defect was located in source and its API semantics checked; separate RED/GREEN execution remains unrun under the unchanged guard.

This is the seventh bounded correction, not an indefinite repair budget: no eighth fix, additional worker/CLI/model, runner/interpreter retry, alternate/peer bypass, install, settings/permissions/provider/history/publication/deployment/archive/deletion action. Main reviews the actual one-line delta and retained SDK test before obtaining actual user/allowed-path runtime output. Do not claim tests/format/coverage/acceptance passed from a source check. All original full-suite/coverage/browser/independent-review requirements remain open until genuinely executed; no threshold/exclusion changes.

### Historical dispatch override — C11/C15 (two tests only)

C15 authorizes exactly one sixth repair batch after the user's `继续` to the two-file recommendation in `research/round5-user-validation.md`. Resume the same reachable native `mcp-final-repair`, requested Sonnet. This supersedes C14's stop only for the following two existing test files; historical broader allowlists confer no current write authority:
- `backend/tests/test_agent_access_concurrency.py`
- `agent_bridge/tests/test_stdio_e2e.py`

A owns artifacts, fresh snapshot, review and acceptance and does not concurrently edit these tests. All other files are read-only for B, especially production/services, other tests/global conftest/backend fixture helper, documentation/task/spec records, A probes/backups and dependencies/locks. No new files, runner/entry point, production fault-injection mode, feature, installation, auxiliary agent/model/CLI, settings/permission/provider/history/publication/deployment/archive/deletion change. No seventh batch or inline source takeover.

**Only three closed test requirements**:
1. **Audit baseline**: immediately after the real credential issuance commit, capture the credential's existing audit IDs and stable event metadata and assert its intended credential.issue/issued event exists. After the stale request, assert that same audit set is unchanged, alongside the existing zero-result/no-agent-field-effect assertions. Never remove production issuance logging, delete audits or merely replace total0 with hardcoded1. The user's85passed/1failed result is actual RED for this bad assertion, not evidence of a production audit leak.
2. **G1 contention/liveness proof**: retain two actual same-loop browser/agent ASGI HTTP requests and the browser's real business call plus yield-session commit/finalizer. Instrument the test engine locally (e.g. SQLAlchemy's existing before_cursor_execute hook for the agent BEGIN IMMEDIATE) so release cannot happen until the agent has actually attempted its BEGIN while the browser holds the write lock. Measure heartbeat progress strictly between that attempt and lock release, not during request cleanup; assert requests/lock are still pending in that interval. Bound every wait; release/cancel/join owned tasks as necessary and restore listeners/dependency overrides in finally. No timer-only150ms overlap assumption, unconditional post-request heartbeat credit, manual SQL-holder substitution, mocked business result, production edit or longer SQLite busy timeout.
3. **G2 complete mutation sequence**: the forwarding recovery transport must record every agent-tool mutation request's tool name and request_id/change_id, not just the first lost response. Assert exactly one original local update before the explicit replay, then exactly the intentional same-identity replay (two expected dispatches total, no hidden retry/new identity). For preview, assert exactly the original preview then the intentional approved apply with original change_id; result lookups add no mutation request. Keep real backend commit, authenticated generated manifest, closed output validation and preserved-preview-after-apply assertions. Do not record/log credentials/headers or broaden into unrelated transport cleanup/refactoring.

**Execution boundary**: B uses only Read/search/plain read-only Git plus scoped Edit/Write. No interpreter invocation whatsoever, including -c/stdin/no-op/AST/version/availability/metadata/import checks, even appended to a search command; no test/build/formatter/py_compile/app/script/alternate runner or peer. Source import statements remain allowed, execution does not. Do not retry denied forms or alter guards. Attribute automatic hooks separately. All runtime/format/type/coverage commands are NOT RUN unless later actually executed by the user/an allowed main path; never claim GREEN/E2E from reading. Earlier C13 actual import and C14 denied no-op remain recorded, not retroactive permissions.

Read `research/round5-user-validation.md`, `research/main-acceptance-round5-static.md` G1/G2 and `/tmp/crf-mcp-agent-fix-round-6.txt`. Use the existing pinned API patterns already in this test file/services; no new dependency research/install is needed. Main inspects all current two-file diffs/protected bytes before execution. If a requirement cannot be met within the two sources, stop with Open Questions. Full runtime/coverage/independent-review gates remain unchanged: backend >=9983/11331, new scopes >=80%, no lower gates or exclusions. The earlier user-run85/1 is not post-C15 validation.

### Historical dispatch override — C11/C14 (tests only)

C14 authorizes exactly one fifth repair batch after the user's `继续` to the recommendation for tests-only correction/completion. Resume reachable `mcp-final-repair`, requested Sonnet, with file-based context. This supersedes C13's stop only for the five files below, not its production allowlist. A owns task records, backup, review and acceptance; A does not concurrently edit these tests. No sixth batch, duplicate writer, extra model/CLI call, install, settings/provider/permission change, history action, deployment, archive or deletion.

**Exclusive C14 writer allowlist**:
- `backend/tests/test_agent_shared_changes.py`
- `backend/tests/test_agent_tools_edit.py`
- `backend/tests/test_agent_access_concurrency.py`
- `agent_bridge/tests/test_client.py`
- `agent_bridge/tests/test_stdio_e2e.py`

All other files are read-only for B: especially production source, global conftest/backend fixture helper, other tests, documentation/spec/task records, A probes, dependencies/locks and existing backup/evidence. No new files, runner/entry point, production fault-injection mode or dependency. Test-local monkeypatch/transport/event synchronization belongs inside the existing tests and must restore state; it cannot replace the application operation being verified.

**Five closed requirements** (evidence: `research/main-acceptance-round4-static.md`):
1. **T1**: replace Chinese type text in request identities with stable safe-ASCII case identities. Retain every type-switch assertion and strict production ID validation.
2. **T2**: read a current fingerprint after the first committed new-field write before submitting the second distinct mutation; retain separate valid request IDs and authoring assertions.
3. **T3**: bind httpx in the timeout test's local/module scope. Source import statements are allowed; executing imports/checks is not.
4. **I1**: add actual disposable-backend recovery coverage using its authenticated generated manifest and real committed lookup bodies, not a hand-built envelope/static permissive data schema. Inject one lost response only after the real mutation commits; drive production adapter recovery and its output-schema check, then assert original identity/result/fingerprint, one mutation and at most one fixed lookup. Include local-write and preview results (including preserved preview after apply) within existing fixtures where feasible. Official stdio or the existing official-SDK handler harness may be reused; describe exactly which boundary actually runs rather than call an in-process handler a new stdio run. Never import backend runtime into the SDK environment or change production code for fault injection. Keep temporary auth values process-local and out of logs/assertion dumps.
5. **I2**: exercise two actual concurrent ASGI HTTP requests on the same event loop: browser profile write and agent write against the disposable file/WAL engine, with the browser's real yield-session transaction finalizer releasing its lock. A manual connection committed by a timer alone is insufficient. Use bounded events/cleanup and heartbeat evidence; assert real response states, persisted browser effect, no partial rejected-agent effect/result/audit and restored overrides. A stale agent409 after browser commit is valid and expected when its original fingerprint predates that edit; do not force a200 or weaken concurrency checks. The existing holder test may remain as a separately named lower-level control.

**Read pointers**: `/tmp/crf-mcp-agent-fix-round-5.txt`; actual browser route `backend/src/routers/fields.py` (`PUT /api/form-fields/{ff_id}/binding-profile`), `backend/src/database.py::get_session`, `backend/src/dependencies.py::get_current_user`, current file/WAL fixture; adapter's existing `test_stdio_e2e.py` backend/session fixtures, `server.py::run` and `test_server.py::_invoke_call_tool`. Avoid existing E2E seed-ID/order assumptions because its ten-tool flow mutates the seeded form field.

**Execution boundary strengthened after C13 violation**: B may only Read/search/plain read-only Git and Edit/Write the five test sources. Do not invoke any interpreter (including `-c`, stdin, AST, version/availability/metadata/import checks), tests, build, formatter, py_compile, app, shell script, other runner or peer. Do not use an alternate command/agent to evade the unchanged guard. Automatic hook activity, if any, must be attributed separately and never reported as manually run validation. Report every runtime/format/type/coverage command NOT RUN. No claimed GREEN without actual evidence; C13's prohibited import stays recorded, not retroactively approved.

**Acceptance gate**: A compares all files with the fresh pre-C14 snapshot and reviews every test delta before actual user/allowed-path execution. Preserve original probes and all production bytes. User-run pre-C13 RED remains12failed/1passed; none of C13/C14 has post-fix runtime proof yet. Required probe/permanent integration/full-suite/coverage checks remain pending; backend fraction must not fall below9983/11331, new backend/adapter/UI scopes >=80%, frontend comparison unchanged. Stop if anything needs production/scope expansion or another batch.

### Historical dispatch override — C11/C13

C13 authorizes one bounded extra repair batch (fourth total) after the user's explicit `确认，继续`. Repair only IR1–IR6 and directly related tests/docs. Retain the native `trellis-implement`/Sonnet method and single-writer ownership. Main owns task/spec/context/dependency preparation, acceptance and history; no concurrent main feature-source edits. No fifth round, additional worker, CLI/model/provider/config/permission changes or installation. Current `mcp-final-repair` is reachable; resume it by a short file-based handoff, not a new duplicate writer or transcript.

**C13 exact writer allowlist** (other broader/historical lists below do not grant current authority):
- `backend/src/routers/agent_tools.py`
- `backend/src/schemas/agent_tools.py`
- `backend/src/services/agent_operation_service.py`
- `backend/src/services/agent_read_service.py`
- `backend/src/services/agent_edit_service.py`
- `backend/src/services/agent_shared_change_service.py`
- `backend/src/services/agent_state_service.py`
- `backend/src/services/field_profile_service.py`
- `backend/tests/test_agent_tools_edit.py`
- `backend/tests/test_agent_tools_read.py`
- `backend/tests/test_agent_shared_changes.py`
- `backend/tests/test_agent_access_concurrency.py`
- `backend/tests/test_agent_authoring_contract.py`
- `agent_bridge/tests/test_client.py`
- `agent_bridge/tests/test_stdio_e2e.py`
- `README.md`
- `README.en.md`
- `backend/.claude/CLAUDE.md`
- `agent_bridge/README.md`

No new deliverable file, dependency, build/test runner, route/tool, model/table/migration or frontend source change. `backend/tests/conftest.py`, adapter production source, owner router, all dependency/lock files, task/spec/root-context/index and A's ignored probes are read-only for B. Ordinary ignored per-task runtime reports/caches retain existing exceptions. Existing temporary probe expectations are acceptance evidence, not editable tests to make green.

**Closed repair requirements**:
1. **IR1**: real local-write and preview result lookups must have the same closed success envelope/fingerprint as original dispatch. Preserve existing stored identities/replays and preview-vs-applied evidence; do not casually change serialized storage or equate missing outcome with failure. Test actual committed lookup bodies against generated output schemas and adapter recovery; do not substitute a fake underspecified lookup success body.
2. **IR2**: outline option count/limit is scoped to the granted project's codelists. Add other-owner active/recycled501-option cases; no foreign content, global cap coupling or silent truncation.
3. **IR3**: keep async bounded body reading, but run the existing synchronous DB transaction off the request event loop using the installed FastAPI/Starlette threadpool facility. Keep real BEGIN/BEGIN IMMEDIATE, current-state authorization, precommit limits and atomic rollback/replay; no async ORM/architecture/dependency migration. Test real concurrent browser-style ASGI requests on the same loop with a disposable file/WAL engine, plus loop liveness. In this same concurrency test file, replace the tautological lock assertion and restore the modified issue-rate rule through scoped monkeypatch as necessary for reliable regression isolation; do not broaden to export/audit tests or suppress warnings.
4. **IR4**: agent new-definition authoring and explicitly authored/type-switched shared properties follow `syncFieldTypeSpecificProps`/`normalizeDateFormat` plus the canonical date options: non-choice codelist cleanup, non-text/numeric unit cleanup, target-type date defaults/normalization, digit/checkbox applicability, canonical stored date values. Preserve explicit-null rules, omitted untouched legacy values, original browser/profile/import/restore semantics and all-reference savepoint/impact/final-inline validation. Preview must disclose the exact derived changes that apply performs. Reuse a narrow helper in existing allowed modules rather than duplicate or globally normalize unrelated existing writes.
5. **IR5**: position is1-based in schema and behavior; invalid insertion range returns400/422 with zero effects, never500. Preserve existing OrderService/profile semantics; the order service itself is read-only.
6. **IR6**: local instance updates validate bound definition and its codelist/unit project links before any mutation. Corrupt forward links fail closed without exposing foreign details; do not silently rebind/repair them.

**Dispatch/validation gates**: the user subsequently ran the isolated13-case probe in their external terminal and supplied actual **12 failed/1 passed/23 warnings,3.57s** output (`research/round4-user-red.md`). This satisfies the reproduce-first/RED gate for IR1–IR6; it is not main/B-run validation and does not lift the in-session runner guard. Main may now snapshot and dispatch scoped editing. B writes permanent regression tests first, then minimal fixes against that known RED baseline; separate execution of those new permanent tests is NOT RUN. B must not execute test/build/app/import/formatter/shell-script runners, invoke an alternative interpreter/peer to bypass the refusal, or alter permissions. Use only Read/search/plain read-only Git and scoped Edit/Write. Report all runtime checks NOT RUN. Main inspects actual diff/scope and obtains post-fix test/coverage/browser evidence through an allowed path or explicit user-run output; editing alone cannot pass final acceptance. Preserve backend total coverage at least9983/11331 (the pre-C13 score), new agent/adapter/UI >=80%, and unchanged frontend baseline comparison; report exact fractions and never lower gates/exclusions.

Before dispatch read `research/independent-review-verification.md` and `/tmp/crf-mcp-agent-fix-round-4.txt`. All C12 schema/UI fixes and earlier repairs remain preserved. Main updates canonical §16 only after the writer stops. Further blockers after this batch stop acceptance; approval is not an indefinite loop.

### Historical dispatch override — C11/C12


C12 explicitly extends the exhausted two-round limit by exactly one focused repair (third total). The user said `继续` after the main report/recommendation naming both residual blockers. Use a single fresh native `trellis-implement` with requested selector `sonnet`; the prior `mcp-native-repair` is not reachable in the current session, so do not claim its context was resumed. Main owns planning, environment, acceptance and history and will not modify feature source concurrently. C11's native dispatch override remains in force; do not start/resume the CLI, spawn additional agents, make auxiliary model calls or change provider settings. No fourth round or main source takeover is authorized.

Read `research/main-acceptance-round2.md` and `/tmp/crf-mcp-agent-fix-round-3.txt`. Backups, A probes, task/context/spec/dependency files remain read/execute-only for B. All54 deliverables were preserved at `/tmp/crf-mcp-agent-round3-7f09b614/files` before this extension.

**C12 narrows B's current write authority to these exact files only** (the broader lists below remain a historical upper bound, not current permission):
- `agent_bridge/server.py`
- `agent_bridge/tests/test_server.py`
- `frontend/src/components/AgentAccessDialog.vue`
- `frontend/tests/component/AgentAccessDialog.spec.js`
- `frontend/tests/agentAccessWiring.test.js`
- `agent_bridge/README.md`
- `README.md`
- `README.en.md`
- `frontend/.claude/CLAUDE.md`

Change only schema-format validation and effective dialog sizing plus their direct regressions/docs. No new file, dependency, runner, API/tool/schema-registry change, backend source change, cleanup, rename or unrelated refactor. Ordinary ignored test/build/cache outputs retain the existing bounded runtime exceptions. Preserve all first/second-round fixes.


Worktree: `/home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools`.

Only the following deliverable files may be created/modified. This list is an upper bound, not a requirement to create empty modules. No wildcard directory authority, renaming/deleting existing files, or scope expansion is granted.

### Existing code — narrow changes only

- `backend/main.py` — import/register the two new routers only; keep middleware, startup, static hosting, and existing error handlers intact.
- `backend/src/models/__init__.py` — register/export the new model classes.
- `backend/pytest.ini` — register unit/integration/E2E markers only; preserve warning filters and do not add coverage addopts or change test discovery.
- `backend/tests/conftest.py` — C9 permits only overriding `get_agent_engine` with the existing isolated client fixture engine, plus necessary imports/type annotations; preserve all database/upload/config/temp/cleanup isolation and other fixtures. This narrow exception supersedes the otherwise read-only global setup rule below.
- `backend/src/services/field_profile_service.py` — extract a reusable public shared-definition helper without changing existing profile behavior/callers' transaction semantics.
- `backend/src/services/database_export_service.py` — strip the three private agent tables from exported copies and vacuum, preserving old-schema compatibility and live-source state.
- `frontend/src/components/ProjectInfoTab.vue` — small lazy dialog entry and visibility wiring; do not reorganize metadata/logo behavior.

### New backend modules

- `backend/src/models/agent_access.py` — credential, operation/proposal, audit models and constraints/FKs.
- `backend/src/schemas/agent_access.py` — closed owner-management DTOs, metadata-only credential responses and proposal details.
- `backend/src/schemas/agent_tools.py` — ten closed input/output DTOs, static descriptions/annotations and manifest registry.
- `backend/src/agent_dependencies.py` — dedicated authentication, bounded request parsing, real read/write transactions, isolated limiter buckets.
- `backend/src/routers/agent_access.py` — browser-authenticated owner grant/approval endpoints.
- `backend/src/routers/agent_tools.py` — agent manifest, fixed typed dispatch, scoped request-result lookup.
- `backend/src/services/agent_access_service.py` — issue/revoke/list grants, authenticate and revalidate actors, owner approval management.
- `backend/src/services/agent_state_service.py` — canonical project fingerprints and strict in-project resource/link resolution.
- `backend/src/services/agent_operation_service.py` — canonical request identities, replay/result records and compact transactional audit helpers.
- `backend/src/services/agent_read_service.py` — bounded authorized projections/search/reference impact.
- `backend/src/services/agent_edit_service.py` — local profile edits and complete reorder with idempotency/guards.
- `backend/src/services/agent_shared_change_service.py` — savepoint preview, immutable proposals, all-reference normalization/validation and approved apply.

### New backend tests/helpers

- `backend/tests/agent_access_helpers.py`
- `backend/tests/test_agent_access.py`
- `backend/tests/test_agent_tools_read.py`
- `backend/tests/test_agent_tools_edit.py`
- `backend/tests/test_agent_shared_changes.py`
- `backend/tests/test_agent_access_concurrency.py`
- `backend/tests/test_agent_access_exports.py`
- `backend/tests/test_agent_authoring_contract.py`

Use the existing isolated conftest/session/client helpers; new agent dependencies must be overrideable by tests. Do not edit global test setup to point at production, suppress warnings, or bypass authentication. New fixture-owned temporary files live under the approved ignored test root and may be cleaned up by the fixtures that created them, never by broad repository cleanup.

### Adapter and tests

- `agent_bridge/__init__.py`
- `agent_bridge/config.py`
- `agent_bridge/client.py`
- `agent_bridge/server.py`
- `agent_bridge/tests/conftest.py`
- `agent_bridge/tests/backend_fixture_server.py`
- `agent_bridge/tests/test_config.py`
- `agent_bridge/tests/test_client.py`
- `agent_bridge/tests/test_server.py`
- `agent_bridge/tests/test_stdio_e2e.py`
- `agent_bridge/README.md` — Chinese standalone setup/security/usage/test guide, no real credentials or client-settings writes.

The E2E backend helper runs with the existing backend interpreter, not the SDK environment. Before importing the app, force temporary database/uploads/auth state, background-jobs-off, a nonexistent temporary CONFIG_FILE, and scrub other backend config overrides as in the existing conftest. It must not load the main checkout or seed persistent accounts.

### Frontend and documentation

- `frontend/src/components/AgentAccessDialog.vue`
- `frontend/src/composables/useAgentAccess.js` — per-dialog async lifecycle/API coordination; no global mutable grant state.
- `frontend/tests/agentAccessWiring.test.js`
- `frontend/tests/component/AgentAccessDialog.spec.js`
- `frontend/tests/component/ProjectInfoAgentAccess.spec.js`
- `README.md`, `README.en.md` — narrow corresponding MCP sections, preserve each document's existing audience/language.
- `.claude/CLAUDE.md`, `backend/.claude/CLAUDE.md`, `frontend/.claude/CLAUDE.md` — concise current capability/entry/test notes only, no narrative history rewrite.
- `.claude/index.json` — truthful new entry/model/schema/service/component/test paths; do not claim refreshed whole-repository scan/coverage statistics.

### Runtime artifact exceptions and explicit exclusions

B may produce ordinary ignored build output in `frontend/dist`, cache/log artifacts under `frontend/node_modules/.cache`, adapter bytecode under its ignored cache, and its fixture/test/coverage output under `.pytest-tmp/mcp-agent-tools`. These are not deliverables or install authority. Main prepares directories; use `PYTHONDONTWRITEBYTECODE=1` and task-local TMPDIR/cache settings so tests do not write outside the worktree. The main-owned `/tmp` validation wrapper is read/execute-only for B.

Everything else is read-only for B, including this task directory, `.context`, `.trellis` specs/workflow/workspace, all dependency and lock files, `frontend/package.json`, Vite/Vitest config, `.gitignore`, existing auth/dependencies/database/rate-limit/order/render/import/copy services, production config, and deployment/release files. Main alone may prepare `agent_bridge/requirements.txt`, `requirements-dev.txt`, `requirements.lock`, and the approved frontend package/lock change before dispatch. If a portability/lifecycle test proves another production file must change, stop and report an Open Question rather than silently enlarging this list.

No commits, staging, merge/rebase/reset/stash, push, dependency installation, external publication, service restart, or production mutation. Do not run the app against 8888 or default data. Reading directly relevant existing call sites/specs remains allowed; do not inspect secret/private-data values.

## 3. Ordered TDD Work

1. **RED — schemas and grants:** add failing tests for the ten-tool allowlist, strict/extra-key/ID validation, no credential fallback, scoped grants, owner-only management, expiry/revocation/password-version/ownership/recycle denial, limiter isolation and credential metadata redaction. Confirm feature failure, not just a missing test dependency.
2. **GREEN — foundation:** implement registered models, owner DTOs, dedicated transaction/auth/rate boundaries, bounded parsing, typed manifest and scoped result lookup. Keep routers thin. Use unit/integration markers and AAA; do not mock the code under test.
3. **RED/GREEN — reads and local writes:** cover resolved field attributes/options/log rows, deterministic project-local literal search, unplaced references, existing/new definition insertion, instance-only null/omission behavior, complete permutations, rollback and original-result replay. Reuse profile/normalization/order services; reject hidden cross-project links.
4. **RED/GREEN — shared approvals/concurrency:** implement preview savepoint rollback, immutable digest-bound human review, exact caller/grant/project binding, expiry/version/state/reference checks, normalization and inline guards across every affected form, atomic audit/apply and replay. Test two independent SQLite connections with barriers/events, including a concurrent browser-style writer; do not claim concurrency from a single mocked session.
5. **RED/GREEN — compatibility:** validate authored OID/type/date/digit rules against existing frontend contracts, preserve untouched legacy values/checkbox/option codes, strip all private agent state from every export variant, and prove project copy/template/project import/database merge do not inherit it. Test old files without new tables and deletion/purge lifecycle behavior. Do not add agent tables to imported schema requirements.
6. **RED/GREEN — adapter:** implement host-only configuration, fixed same-origin routes and allowlist, generated-schema input/output validation with no remote reference resolution, bounded streaming responses, timeout/unknown-outcome handling, stderr-only diagnostics and official SDK stdio server. HTTP mocks are appropriate for client unit tests, not the critical process test.
7. **RED/GREEN — UI:** real Element Plus mounts for credential controls and immutable proposal detail/approve/reject. Prove parent v-model open/close/reopen, initial-open load, one-time masked token/copy/clear, loading/errors, same-project late responses, project switch/unmount invalidation, no raw HTML injection, no permission/approval escalation and no storage leaks. Spy on the exported `api` object and reuse the warning/clock gates.
8. **Critical-flow E2E:** start a throwaway HTTP backend and actual adapter subprocess; use official SDK `ClientSession.initialize`, list exactly ten tools, inspect/add/update/reorder/read-back, preview shared change, reject unapproved apply, approve through owner HTTP UI boundary, apply exactly once and reject a stale/new-reference proposal. Never mock MCP itself, use production credentials, or change an external client config.
9. **IMPROVE/docs/self-check:** inspect the actual diff, remove only task-introduced debug/dead code, synchronize allowed docs/index, then run the validation matrix. Unresolved requirement choices, missing dependencies or unsafe fixture setup are Open Questions, not permission to invent another design or weaken tests.

## 4. Validation Commands

All snippets are future implementation checks, not a record that they already ran. Each shell starts in the explicit worktree. A prepares the wrapper/environments in Gate 1; B must stop if absent. Use only task-local temp/cache/report paths. Run targeted RED tests before their corresponding implementation, then the same targets GREEN and full checks below. A reruns these independently.

### Backend

```bash
cd /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools && bash /tmp/crf-mcp-agent-backend-checks.sh pytest tests/test_agent_access.py tests/test_agent_tools_read.py tests/test_agent_tools_edit.py tests/test_agent_shared_changes.py tests/test_agent_access_concurrency.py tests/test_agent_access_exports.py tests/test_agent_authoring_contract.py -q
cd /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools && bash /tmp/crf-mcp-agent-backend-checks.sh pytest tests/test_field_profile.py tests/test_inline_table_guard.py tests/test_order_service.py tests/test_isolation.py tests/test_subresource_isolation.py tests/test_permission_guards.py tests/test_codelist_option_authorization.py tests/test_auth.py tests/test_user_admin.py tests/test_project_copy.py tests/test_project_import.py tests/test_export_service.py tests/test_test_environment_isolation.py -q
cd /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools && bash /tmp/crf-mcp-agent-backend-checks.sh pytest --cov=src --cov=main --cov-report=term-missing:skip-covered --cov-report=json:../.pytest-tmp/mcp-agent-tools/backend-final.json --cov-fail-under=80 -q
cd /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools && bash /tmp/crf-mcp-agent-backend-checks.sh ruff format --check .
```

A captures the same coverage invocation before code changes with `backend-baseline.json` instead of `backend-final.json`. Compare exact covered/total statements, not rounded percentages: total >=80% and final >= baseline; also aggregate all new `agent_*.py` production modules for >=80%. Do not silently exclude low-covered new files or replace the old denominator with agent-only coverage. Backend Ruff config is format-only; do not introduce a new blanket lint policy. Run minimum `py_compile` for changed Python files with its cache redirected to the task root if configured type tooling is absent. Security review also runs the prescribed Bandit check if available; absent tooling must be reported, not installed by B or hidden with `|| true`.

### Adapter

Main exports BACKEND_PY and task-local TMPDIR/cache/COVERAGE_FILE for these child commands, and ensures no live CRF configuration reaches the E2E server. The new adapter fixture configures the SDK client's subprocess environment explicitly and closes only its own processes/files.

```bash
cd /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools && BACKEND_PY=/home/decade/.venvs/crf-editor/bin/python agent_bridge/.venv/bin/python -m pytest agent_bridge/tests --cov=agent_bridge --cov-report=term-missing --cov-report=json:.pytest-tmp/mcp-agent-tools/adapter-final.json --cov-fail-under=80 -q
cd /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools && agent_bridge/.venv/bin/python -m pip check
cd /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools && /home/decade/.venvs/crf-editor/bin/python -m ruff format --check --config backend/ruff.toml agent_bridge
```

Coverage excludes test/helper code from its asserted production-module aggregate; report that aggregate separately if the CLI source discovery includes the tests directory. Do not mark E2E skipped as a passing process-level verification.

### Frontend

Main sets npm_config_cache to the worktree's `frontend/node_modules/.cache/npm` for B. Use the installed Vitest binary; no `npx` download fallback.

```bash
cd /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools/frontend && npm test
cd /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools && frontend/node_modules/.bin/vitest run --root frontend --maxWorkers=1 --coverage.enabled --coverage.provider=v8 --coverage.include='src/**/*.js' --coverage.include='src/**/*.vue' --coverage.reporter=json-summary --coverage.reporter=text-summary --coverage.reportsDirectory='../.pytest-tmp/mcp-agent-tools/frontend-final'
cd /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools/frontend && node_modules/.bin/vitest run tests/component/AgentAccessDialog.spec.js tests/component/ProjectInfoAgentAccess.spec.js --coverage.enabled --coverage.provider=v8 --coverage.include='src/components/AgentAccessDialog.vue' --coverage.include='src/composables/useAgentAccess.js' --coverage.reportsDirectory='../.pytest-tmp/mcp-agent-tools/frontend-coverage' --coverage.thresholds.lines=80 --coverage.thresholds.branches=80 --coverage.thresholds.functions=80 --coverage.thresholds.statements=80
cd /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools/frontend && npm run lint
cd /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools/frontend && npm run build
```

Capture an existing-suite coverage baseline before edits and repeat the same include set after edits when comparing existing code. The scoped new-dialog/composable >=80% report is not a claim that the whole legacy frontend has >=80% coverage. Keep all existing tests passing; do not alter suite includes, warning gates or test scripts.

### Main-only acceptance

- Check `git status --porcelain`, new-file inventory, actual diff and `git log <pre-dispatch-base>..HEAD`: B changed only allowed files and made no commit; A-owned dependency changes match the recorded preparation diff.
- Browser walk using the built worktree frontend, throwaway backend/data and approved temporary regular-user credentials: launch dialog, create/revoke a grant without capturing its raw token, inspect complete shared-change impact, approve/reject/stale handling, close/reopen, narrow screen/dark mode and keyboard access. Use ephemeral ports, never systemd 8888. If browser/login/runtime blocks this, report exact not-run/alternative scope.
- Security pass against the loaded security-review checklist: credential separation, all-reference isolation, transaction/race rollback, nonportable private state, schema/ref and same-origin limits, no secret output/XSS, rate/body/result bounds and redacted errors. No unnecessary cookie/auth migration or unrelated security refactor.
- `git diff --check`; parse `.claude/index.json`, verify newly added paths and documentation commands against the actual tree. Do not stage/commit to run checks.
- Independent read-only relay review after A has no blocking findings. Snapshot in-scope files before review and verify unchanged afterward. Use the relay's default reviewer selection unless the user overrides it; reviewer findings do not authorize writes.

## 5. Stop/Repair Boundaries and Report

If validation fails, report it and apply only incremental in-scope fixes. On the third unresolved attempt, isolate/reproduce/instrument and escalate; do not repeat a speculative fix. Relay's original two A-requested fix rounds are exhausted; C12 authorized the third, C13 the fourth IR1–IR6 batch, C14 the fifth tests-only batch, C15 the sixth two-test batch, and C16 exactly one main-session assertion as the seventh bounded correction. C17 authorizes only Ruff's reported formatting in four backend files as the eighth. C18 authorizes the final-review repair batch (F1/F2/F3/F14/F4/F5/F6/F15/F11/F12, exact 19-file subset, one native Sonnet writer) as the ninth. C19 authorizes exactly two main-written lookup error-boundary tests in `backend/tests/test_agent_tools_edit.py` as the tenth, with no production changes. No eleventh correction, broader main takeover, production expansion or indefinite retry loop is authorized. No rollback by destructive Git commands or deletion without authorization; A retains planning artifacts/channel logs. Additive database tables are not a complete downgrade plan: stopping the adapter is reversible, but reverting source does not revoke existing tokens; rollback/revocation remains an explicit operator action.

B's final message is English, at most 25 lines, and contains only the following headings, grouped paths, command results and actual blockers. No diffs, full logs, tokens or progress transcript. A's user report is Chinese and separately states requested/resolved worker model, rounds, cumulative CLI-estimated cost, verified findings, commands/results, and not-run checks. No worker/model/cost result exists until a real supervisor completion event arrives.

```text
## Files Modified
- <path or compact related paths> - <one line>
## Verification Results
- <command> -> pass|fail|not-run - <one line and reason if not run>
## Open Questions
- <omit this section if none>
```
