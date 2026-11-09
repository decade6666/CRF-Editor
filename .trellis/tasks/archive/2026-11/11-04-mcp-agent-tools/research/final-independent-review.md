# Final Independent Review — Main Verification

Date: 2026-11-06. Reviewer: fresh native read-only agent `mcp-final-review`, requested model `fable`; verdict **PASS, 15 non-blocking findings**. The resolved model and cost are not exposed for native agents, so none is claimed. Main is not accepting yet: two findings touch acceptance criteria. No fix is authorized. C17 remains the eighth and last authorized correction.

## Reviewer Side-effect Check

- `/tmp/crf-mcp-agent-review-snapshot-7f09b614/pre-review.sha256` (80 files) still matches after the review, `git status` is unchanged, and no commits were made. The reviewer made no changes.

## Findings (all statically verified by main; file:line evidence)

### Acceptance-relevant (should fix before acceptance)

- **F2 (AC6, design.md:46) — the result lookup ignores tool and input identity.**
  - `routers/agent_tools.py:260-290` → `find_operation` (`agent_operation_service.py`) filters only on credential plus `request_id`. It returns the stored envelope for any `status == "done"` row.
  - `bind_or_reject:71` does compare `input_digest` and `tool_name`, and `record_success` stores both, but the lookup never uses them.
  - Failure scenario: an agent reuses `request_id` R for a different call. The backend rejects that call with 409 `IDENTITY_REUSED`, but the transport times out first. The adapter (`client.py` `_uncertain_outcome` → `lookup_operation`) then returns the *earlier* operation's success envelope as if it were the new call's result.
  - design.md:46 requires that reusing an ID for different input returns 409.
- **F1 (AC4) — no agent-level evidence for reorder rejection.**
  - `test_agent_tools_edit.py:401` is named as a rejection test but asserts 200.
  - `test_agent_shared_changes.py:241` is named as a reorder test but checks `date_format`.
  - No agent-tool test covers duplicate IDs, foreign IDs, or a horizontal-block violation through `crf_reorder_form_fields`.
  - The production guards exist (`order_service.py:322/325/328`; `ensure_inline_block_limit` in `agent_edit_service.py:275-302`), so only tests are missing.

### Contract / documentation accuracy

- **F3 — wrong default code for conflicts.** `schemas/agent_tools.py:49-75` `STATUS_DEFAULT_CODES` maps every 409 to `STALE_STATE`. OID conflicts and duplicate placement therefore tell the agent to re-read, although spec §16 (`cross-stack-contracts.md:1149`) reserves `STALE_STATE` for fingerprint changes. `CODE_CONFLICT` exists but is unused there.
- **F14 — 404 where the spec says 422.** `agent_read_service.py:178-190` `_definition_view` (called at `:231`) resolves the codelist and unit through `resolve_project_codelist/unit` (404), without `ensure_no_foreign_links`. A corrupt foreign link therefore reads as 404, while spec §16 (`cross-stack-contracts.md:1147`) says linked data → 422. No foreign data leaks.
- **F4 — README overclaims recovery.** `agent_bridge/README.md:49` says 5xx and network failures are handled as uncertain outcomes. `client.py` looks up only on `httpx.TimeoutException`; ConnectError, other HTTPError and 5xx map to `BACKEND_UNAVAILABLE`.
- **F5 — README commands are incomplete.** `agent_bridge/README.md` uses bare `python`, omits the `OUTPUT_INVALID` error code, and documents a unit-test command that fails without `BACKEND_PY`.
- **F6 — missing refresh disclosure.** design.md:103 requires telling users that, after MCP edits, workbench data may need the existing global refresh. Neither the dialog nor the README says so.
- **F15 — documentation, naming and wording inaccuracies.**
  - `routers/agent_tools.py:236-247` `_validate_input` says "中文摘要" (Chinese summary), but it joins Pydantic's English `msg` strings; `backend/.claude/CLAUDE.md` repeats the "422 Chinese" claim.
  - `schemas/agent_tools.py:477-486` defines the `静态清单注册表` heading and `TOOL_READ/WRITE_PERMISSION` twice.
  - `frontend/.claude/CLAUDE.md` and `agentAccessWiring.test.js:116` say "five owner endpoints", while the router has 7 routes (`routers/agent_access.py:159-352`) and the composable uses all 7, including the change-detail GET.

### Quality / UX (non-blocking)

- **F7 — the approval view hides which definition changes.** `AgentAccessDialog.vue:51-53,296-345` shows the patch JSON, form-level impact, the semantic diff and the digest, but not the target definition's id, OID or label. The detail response has `definition_id` (`routers/agent_access.py:319`) and it is never rendered.
- **F8 — unused DTOs and an unvalidated response.** `schemas/agent_access.py:40-66` `AgentChangeImpactItem` and `AgentChangeProposalDetail` are unused (their keys match `_build_impact` at `agent_shared_change_service.py:422-427`). The detail route at `routers/agent_access.py:317-334` returns an unvalidated dict.
- **F9 — adapter robustness.** `agent_bridge/server.py` `run()` catches only `AgentClientError` around `fetch_manifest`, so a startup timeout prints a traceback. The async `call_tool` also calls the synchronous HTTP client.
- **F10 — adapter leftovers.**
  - `client.py:31` `MUTATING_TOOLS` is unused.
  - `__init__.py:8` says `__version__ = "1.0.0"` while `server.py:36` says `ADAPTER_VERSION = "1.1.0"`.
  - The lookup path formats `request_id` without URL quoting. Low risk under the safe-ASCII request_id rule.
- **F11 — tautological or dead assertions.**
  - `test_agent_tools_edit.py:54` (`... or True`)
  - `test_agent_shared_changes.py:73` (`... if False else None`, dead code)
  - `:414` (true whenever `semantic_diff` is non-empty)
  - `test_agent_tools_read.py:396-397` passes a foreign *form* id as a definition id
  - `agent_bridge/tests/test_server.py:178-184` (stale comment; also accepts `UNKNOWN_TOOL`)
- **F12 — weak test fixtures and leftover temp data.**
  - `test_agent_access_exports.py:199-210` "injects private rows" but only creates empty agent tables.
  - `agent_bridge/tests/backend_fixture_server.py:6,29` claims cleanup, but neither it nor `test_stdio_e2e.py` removes its `mkdtemp` root, which holds a throwaway DB. The handshake, which holds a disposable password, sits in pytest tmp. Under the user's task-local TMPDIR this stays inside the approved ignored root (implement.md:218); otherwise it lands in the system temp dir.
- **F13 — misleading code on a repeated decision.** `agent_access_service.py:232-233` answers any non-pending decision, including a second approve, with 409 `APPROVAL_REJECTED`. The message itself ("该提案已被处理", "this proposal was already handled") is accurate.

## Status

- Runtime gates already passed (see `c16-user-validation.md`). The final review is done: PASS with 15 verified findings, of which F1 and F2 are acceptance-relevant.
- Next: the user decides between a separately authorized ninth bounded correction (C18) and acceptance with recorded follow-ups. Spec sync, commit, merge and finish-work stay pending; the task remains in_progress, accepted=false.
