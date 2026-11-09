# Controlled MCP Tools for CRF Editing

Status: user-approved on 2026-11-05 for implementation, dependency preparation and isolated testing. Activate the task before implementation writes; dispatch remains gated on prepared environments and passing baselines.

## Goal

Let authorized agents inspect and maintain CRF design metadata without direct database access, while keeping the editor's project isolation, shared-resource semantics, ordering rules and structural protections. Deliver a provider-neutral editing interface, not an LLM-hosting product or participant-data collection system.

## Confirmed Requirements and Decisions

- **C1 — Product intent:** agents should operate on CRF metadata. The requested long-term domain map covers dictionaries/options, units, definitions, form-field instances, forms, visits, visit-form relations, log rows and ordering; C6 bounds this delivery.
- **C2 — Shared changes:** local instance attributes may be edited within the grant; shared-definition changes require impact preview and genuine human confirmation. The user explicitly selected this policy.
- **C3 — Execution boundary:** task creation/planning are authorized. Implementation waits for user review of the completed artifacts and `task.py start` changing status to `in_progress`.
- **C4 — Relay ownership:** the main session plans, reviews, verifies and owns Git history. Sonnet is the requested implementation worker. Task files and brief channel messages are the handoff; no conversation transcript goes to the worker.
- **C5 — Isolation:** all task writes belong in its dedicated worktree, not the main checkout. Planning does not authorize commit/merge/push, deployment, dependency installation or live-data mutation.
- **C6 — First delivery:** the user selected the ten-tool field-editing loop below rather than all resource-domain writes in one release.
- **C7 — Transport:** the user selected a local stdio adapter launched by the agent client. The HTTP backend may be local or remote; there is no network-facing MCP listener in this increment.
- **C8 — Formal implementation authorization (2026-11-05):** the user approved the delivered PRD/design/plan and current-worktree dependency/lock preparation for the proposed isolated MCP environment and matching Vitest coverage provider. They also formally approved runtime-generated disposable test accounts/passwords/tokens/signing keys and isolated tests. Sonnet may implement after task activation and passing baselines; this does not authorize commits, pushes, deployment, real-data operations or weakening isolation.
- **C9 — Narrow fixture scope authorization (2026-11-05):** after an out-of-allowlist six-line conftest change was reported, the user formally approved only binding the new `get_agent_engine` dependency to the existing isolated `client` fixture engine, with necessary imports/type annotations. Database/upload/config/temp/cleanup isolation must not change. This authorizes that bounded adaptation going forward, not unrelated fixture edits, a different worker model or a longer execution window.
- **C10 — Retry authorization (2026-11-05):** after the provider-route error and original supervisor termination were reported, the user explicitly requested retrying Sonnet with a longer wait. Resume the original worker session with the same full requested model ID; use the announced bounded four-hour supervisor/wait window for this retry. Preserve partial code and all existing limits on files, dependencies, credentials and publication; do not change gateway/provider configuration or silently substitute another model.
- **C11 — Native subagent handoff (2026-11-05):** after the first acceptance repair stopped on provider HTTP 502 and the main session reported five reproduced remaining blockers, the user explicitly requested execution by a subagent. Use one fresh native `trellis-implement` subagent in the current task worktree, retaining the previously requested Sonnet choice (native tool model selector `sonnet`; resolved model must be reported honestly). This supersedes C4/implement.md's CLI-only dispatch method, not the approved requirements, exact file allowlist, single-writer ownership, test/credential isolation or publication restrictions. Continue the interrupted first repair rather than consume a second acceptance round or restart the feature. Main owns acceptance/history and does not concurrently implement; the native tool has no CLI supervisor-timeout setting, so do not claim one.
- **C12 — One bounded additional repair (2026-11-06):** after main reported the two remaining blockers and recommended a narrowly scoped additional repair, the user replied `继续`. This authorizes exactly one further repair (third total): validate the format of both manifest schemas before serving tools, make dialog sizing effective in the real rendered DOM, and update only corresponding tests/documentation in implement.md's C12 subset. It does not authorize a fourth round, feature expansion, dependency changes, production access or commits/publication. Retain the approved native Sonnet implementation method and main-owned acceptance; the previous native worker is no longer reachable, so main will use one fresh replacement with file-based context, not claim resumed context. Existing C8 disposable-test authorization and all isolation/secret-handling restrictions remain unchanged.

- **C13 — Bounded independent-review repair (2026-11-06):** after main reported six statically verified blocking findings, exhausted three repairs and recommended one separately authorized repair batch, the user explicitly replied `确认，继续`. Authorize exactly one additional batch (fourth total) for IR1–IR6 in `research/independent-review-verification.md` and their directly related regressions/documentation, using the existing native Sonnet implementation method. This supersedes C12's no-fourth-round limit only for the exact C13 subset in implement.md. It does not authorize a fifth round, unrelated audit-retention/compression/UI/export-test work, dependencies, runners, permission/auto-mode/provider configuration changes, production access, commits, merge, push, deployment or archive. C8 disposable-test authority remains valid. An execution guard refusal is not overridden by this approval: use the documented explicit worktree path once; if still blocked, stop that execution path rather than disguise/redelegate the command. The user subsequently supplied external-terminal RED evidence (12 failed/1 passed); this permits the already-authorized editing phase, not agent execution of blocked runners. Post-fix runtime validation remains a separate gate.

- **C14 — One test-only completion batch (2026-11-06):** after main reported three invalid regression tests, two missing integration paths and the C13 import-check violation, and recommended one test-only batch without production expansion, the user replied `继续`. Authorize exactly one additional native Sonnet test-edit batch (fifth total), restricted to implement.md's five test files: correct the ASCII request IDs, refresh the second write's fingerprint, bind httpx in the test, and complete actual-backend/schema recovery plus concurrent browser/agent ASGI finalizer coverage. Production code, documentation outside A-owned task/spec records, global fixtures, dependencies, models, scripts/runners, settings/permissions/providers, live data and history/deployment remain unchanged. No sixth round is authorized. C13's prohibited import is not retroactively approved: the writer must not invoke any interpreter, AST/metadata/import probe, test/build/formatter/app/shell-script runner; Read/search/plain read-only Git and scoped test Edit/Write only. Writing imports inside the test source is allowed; executing them is not. C8's local disposable-test authorization remains valid for later explicit user/allowed-path validation, not a delegated runner bypass.

- **C15 — One two-file test repair (2026-11-06):** after the user-run backend result85passed/1failed and main located the audit-baseline assertion error, main recommended one tests-only batch in exactly the concurrency and SDK recovery test files; the user replied `继续`. Authorize exactly one sixth batch: preserve and compare pre-existing issuance audit evidence, prove agent-BEGIN contention and heartbeat progress within the held-lock interval, and record/assert every recovery-harness mutation dispatch/identity. Resume the existing native requested-Sonnet writer after a fresh current-candidate backup. Only `backend/tests/test_agent_access_concurrency.py` and `agent_bridge/tests/test_stdio_e2e.py` may change. All production/other test/fixture/dependency/probe/config/runtime boundaries remain unchanged. No seventh batch, main inline takeover, new files/runners, interpreter/AST/import/availability/metadata/test/build/format/app/script execution by B, permission/provider/history/publication/deployment/archive/deletion authority. Earlier denied/actual interpreter attempts are not retroactively approved; writing imports in source is not execution permission. Main owns acceptance and obtains actual user/allowed-path runtime evidence after diff review.

- **C16 — Main-session one-line test guard (2026-11-06):** after C15 review found the ignored False event-wait result, main recommended one main-session assertion with no further subagent dispatch; the user explicitly replied `确认，继续`. Authorize main, after the already-confirmed native-writer freeze and a recoverable file backup, to add only `assert agent_begin_attempted.is_set(), "agent 未在持锁窗口内尝试 BEGIN IMMEDIATE"` immediately after the existing wait in `backend/tests/test_agent_access_concurrency.py`. This is the seventh bounded correction, not a new native batch or broader takeover. No other source/test/dependency/fixture/probe/config change, eighth correction, new runner, permission/provider/history/publication/deployment/archive/deletion authority. A-owned task/decision records may reflect authorization/results. Existing execution refusals remain in force: no repeat/alternate/delegated runner bypass; obtain real user/allowed-path verification and preserve honest NOT RUN status until then.

- **C17 — Main-session Ruff formatting correction (2026-11-06):** after the user's external `ruff format --check .` reported 4 backend files (7 hunks) would be reformatted, main asked via AskUserQuestion and the user selected `主会话按输出修正（推荐）`. Authorize main, after the recoverable backup at `/tmp/crf-mcp-agent-ruff-format-7f09b614/files`, to apply only Ruff's displayed line-break changes in `backend/src/services/field_profile_service.py`, `backend/tests/test_agent_access_concurrency.py`, `backend/tests/test_agent_shared_changes.py` and `backend/tests/test_agent_tools_edit.py`. Formatting only: no token, logic or test-expectation change, no other file, no subagent dispatch. This is the eighth bounded correction; no ninth correction, runner, permission/provider/history/publication/deployment/archive/deletion authority. The adapter format check was short-circuited and its result is unknown; adapter formatting is not covered by this authorization.

- **C18 — Final-review repair batch (2026-11-06):** the fresh read-only final review returned PASS with 15 findings, and main verified all of them (`research/final-independent-review.md`). Via AskUserQuestion the user then selected `C18 修应改项（推荐）` and `原生 Sonnet 子代理（推荐）`. This authorizes exactly one ninth bounded batch, covering only the files in implement.md's C18 subset, and only for these findings:
  - **F2** — bind the result lookup to the original tool and canonical input (AC6).
  - **F1** — agent-level reorder rejection evidence and honest test names (AC4).
  - **F3** — 409 default code `CONFLICT`.
  - **F14** — read-path corrupt links → 422.
  - **F4, F5, F6, F15** — documentation, naming and wording accuracy.
  - **F11, F12** — test tautologies and fixtures.

  Execution: one fresh native `trellis-implement` writer on the requested Sonnet model. It may only read and edit. It must not execute any interpreter, test, build, formatter, app or script. Main reviews the actual diff; the user runs validation externally.

  Main may additionally apply, token-identically as in C17, any formatting-only hunks the user's Ruff check reports in C18-touched files; that counts as part of completing C18.

  F7–F10 and F13 are recorded follow-ups, not authorized. Not authorized either: a tenth batch, dependencies, runners, permission/provider/history/publication/deployment/archive/deletion authority. C8's disposable-test authority is unchanged.
- **C19 — Agent-scope coverage repair, test-only (2026-11-06):** the user asked why validation could not run in-session and chose `退出隔离后我来跑（推荐）`. Main ran `ExitWorktree keep` and then all C18 validation itself.
  - Everything passed except the agent-scope coverage sub-gate: 1560/1682 = 92.747%, against the 1538/1658 = 92.762% floor. Total coverage 88.156% did not decrease.
  - The cause is the lookup handler's uncovered `except HTTPException` and unexpected-exception (500) branches (`backend/src/routers/agent_tools.py:292-298`).
  - The user chose `补 2 个测试（推荐）`: the tenth bounded correction, main inline and test-only. It adds exactly two tests to `backend/tests/test_agent_tools_edit.py`: a malformed JSON lookup body → 422 `VALIDATION`, no-store; an unexpected lookup exception → 500 `INTERNAL`, no-store, no exception detail in the body, logged server-side.
  - Main then reruns the backend suite with coverage and the backend Ruff check.
  - No source change, no other file, no eleventh batch.

## C20 — User-requested Numeric Display Follow-up (2026-11-09)

The user explicitly requested treating empty decimal precision as zero displayed decimal places rather than two, and analyzing whether the missing age formula was an agent/MCP issue. This newly authorizes main inline work on the two shared rendering defaults, their existing regression tests, and directly related docs/records; C19's earlier no-eleventh-batch limit is superseded only for this bounded follow-up. It does not authorize deferred findings, new tools, migrations, stored-data edits, approval bypass, or formula-note export changes. The existing task and worktree remain in use.

Acceptance: absent/NULL decimal precision renders integer-only in shared previews and normal/inline Word export; explicit zero/positive precision and units remain unchanged; persisted NULL is not rewritten. Add failing regressions before changing the two defaults, then verify tests, coverage non-decrease, format/lint/build and actual diff. Formula analysis is read-only against the isolated AGE instance and relevant source; no real data/credentials or source formula text is exposed. Details and the execution board: [research/c20-decimal-default.md](research/c20-decimal-default.md).

## C21 — Authorized Git Finish and Formatter Discovery Alignment (2026-11-09)

After user acceptance, the user said `完成测试，收尾` and formally approved the five-batch `完整 Git 收尾（推荐）` plan: work commits first, then this task's archive and journal, local main integration, normal origin/main push, stop only 5174, and remove only this task's merged worktree/branch. Preserve all `/tmp` acceptance data/backups, other worktrees/tasks and Windows forwarding rules; do not build/deploy/restart 8888 or access real config/database/uploads.

The real hook-default Ruff preflight initially required nine adapter files to be reformatted because prior checks explicitly used `backend/ruff.toml` whereas no adapter-local config was discovered by the hook. The user formally selected `继承既有格式规则（推荐）`, authorizing only `agent_bridge/ruff.toml` with `extend = "../backend/ruff.toml"`, its existing index entry, and necessary authority/verification records. No source/test rewrites, hook changes, backend policy changes, dependency additions or weaker thresholds. Hook-style checks now pass without formatting writes. The independent final bounded C18–C21 static review is PASS with no blocker; two LOW follow-ups are recorded, not repaired. Exact evidence and finish board: [research/c21-finish.md](research/c21-finish.md).

## C22 — User-authorized Verbatim-Archive Boundary and Finish Continuation (2026-11-09)

After C21's staged whitespace gate rejected the original decision log's blank EOF, main proposed appending an explicit boundary after the complete original payload rather than deleting any historical byte or weakening the hook. The user replied `继续`, authorizing that bounded archive-container change and continuation of the already-approved finish. Preserve the first 62,337 UTF-8 bytes (62,096 Unicode characters), including seven trailing LF bytes, with SHA-256 `0ac5d882230d79280678d8adb1de0b4b1d237e49d77c21193a2f1f8e8e4b6af7`; the added provenance/end marker is outside that payload. The complete container now has a different hash and must not be described as byte-identical to the old log. Only this archive and necessary existing task/decision records change; no product/test/spec/dependency/hook/threshold change or deferred repair. All C21 non-deployment/data-retention/other-worktree boundaries still apply. Results continue in [research/c21-finish.md](research/c21-finish.md).

## Verified Project Baseline

The worktree starts at `origin/main` commit `73e4dd559fda053bc7033568ff6308f84cc1bf50` (release 0.6.0). Local `main` remains at `8fb18e90a72e98a2174ef4ceda90835b3f72f81a`. A scoped diff found no changes between those commits in the inspected instructions/specs, core models/schemas/editing routes, profile/order/auth services, dependency declarations or layout composables. This is not a whole-range audit. Reconcile main again before later integration; it was not moved by planning.

| Evidence | Verified fact | Source |
| --- | --- | --- |
| E1 | Reusable definitions and placements are separate; instances own local presentation attributes. | `backend/src/models/form_field.py:17` |
| E2 | Log rows are structure instances marked `is_log_row`, normally without a definition link. | `backend/src/models/form_field.py:21`, `backend/src/models/form_field.py:31` |
| E3 | Two profile commands combine definition, binding and instance operations in the request transaction. | `backend/src/schemas/field_profile.py:1`, `backend/src/routers/fields.py:352`, `backend/src/routers/fields.py:372` |
| E4 | Profile creation supports insertion position and checks the final inline-block state. | `backend/src/schemas/field_profile.py:106`, `backend/src/services/field_profile_service.py:273` |
| E5 | Reorder is a scoped business operation with structural validation, not arbitrary ordinal writes. | `backend/src/routers/fields.py:407`, `backend/src/services/order_service.py:315` |
| E6 | Legacy instance PUT/color/inline write paths were intentionally removed. | `backend/tests/test_fields_router.py:720` |
| E7 | Shared and instance updates are distinct; designer shared profile updates do not rename OIDs. | `backend/src/schemas/field_profile.py:35`, `backend/src/schemas/field_profile.py:49`, `backend/src/schemas/field_profile.py:74` |
| E8 | Browser JWTs hold identity/version/expiry, not MCP audience/project grants; authentication refreshes the token. | `backend/src/services/auth_service.py:73`, `backend/src/dependencies.py:16`, `backend/tests/test_auth.py:151` |
| E9 | Existing project ownership checks do not exclude recycled projects; this is a static finding, not a reproduced exploit. | `backend/src/dependencies.py:46`, `backend/src/routers/projects.py:231` |
| E10 | The frontend enforces Saimeisi manually edited OID length; equivalent checks were not found in the inspected backend writes. Automatic/legacy exemptions must be preserved. | `frontend/src/composables/oidValidation.js:7`, `backend/src/schemas/field.py:32`, `backend/src/schemas/form.py:90` |
| E11 | Column-width/row-height overrides are browser-local, not existing profile persistence parameters. | `frontend/src/composables/useColumnResize.js:245`, `frontend/src/composables/useRowResize.js:142`, `backend/src/schemas/field_profile.py:74` |

Versioned SDK evidence and further SQLite/export/frontend integration anchors are in [research/sdk-and-integration.md](research/sdk-and-integration.md). Research is not an installation or runtime compatibility result.

## Selected First Increment

These are proposed MCP tools, not capabilities already delivered:

| Tool | Responsibility |
| --- | --- |
| `crf_list_projects` | List only the project granted to the caller; no arbitrary admin user selection. |
| `crf_get_project_outline` | Bounded visit/form/relation and dictionary/unit summaries without loading every project field. |
| `crf_get_form_detail` | Form metadata, instance/definition links, effective attributes, structure rows and complete order. |
| `crf_search_field_definitions` | Project-local regular-field candidates with explicit IDs, never an automatic first-match write. |
| `crf_get_reference_impact` | Authorized definition/dictionary/unit/form reference impact, including relevant library-only definitions. |
| `crf_add_form_field` | Reuse or create a definition and place an instance at the requested position through a profile command. |
| `crf_update_form_field_instance` | Instance-only patches, without implicit shared update, rebind or delete. |
| `crf_reorder_form_fields` | Complete in-scope instance-ID permutation, including log rows. |
| `crf_preview_shared_definition_change` | Persist an exact impact proposal without changing CRF metadata. |
| `crf_apply_shared_definition_change` | Apply an approved proposal under backend authorization and transactional preconditions. |

Dictionary/option/unit/form/visit creation or editing, visit-form relation writes and explicit log-row insertion/removal are deferred. Structural rows remain readable/orderable; column-width/row-height authoring is not silently added.

## Safety and Compatibility Requirements

- **R1 — Authorization:** each read/write verifies authenticated identity, granted operation/project, active non-recycled project and all resource/dependency memberships. Model self-report, client names and tool annotations are not security boundaries. Fail closed on cross-project legacy links without exposing foreign details.
- **R2 — Explicit mutation scope:** closed typed commands distinguish instance editing, shared editing and any future fork/rebind. Search returns candidates only. Do not expose a universal table/action/HTTP/SQL tool.
- **R3 — Existing business boundaries:** reuse profile/order/ownership behavior, normalize through existing services and validate every affected form. Preserve omitted versus explicit null, historical OID casing and automatic/legacy exemptions, new-authoring normalization, free-text option codes, reference-delete guards and horizontal-block compatibility. Do not call removed routes or bypass route-resident business rules through repositories.
- **R4 — Genuine shared approval:** bind the proposal to actor/credential/project/definition, exact normalized change, base state and complete affected reference set. A changed reference set invalidates it even if definition values do not change. A model boolean or possession of a plan ID is not approval; only the normal owner-authenticated review path may approve.
- **R5 — Transaction/retry semantics:** recheck preconditions and mutate within one real backend transaction; successful repeat submissions return the original result. Neither multiple HTTP calls nor SQLAlchemy's logical transaction alone prove physical atomicity. The proposed content-fingerprint, SQLite lock, savepoint and idempotency design is specified in design.md, not an already-existing feature.
- **R6 — Credential boundary:** the adapter receives a dedicated credential from its host environment, never model arguments. Backend grants enforce project/permission/expiry/revocation/current identity state. Browser JWTs are not agent credentials. Agent credential/approval/audit state must not become portable through existing database export/import/copy; stripping private state is compatibility work, not a new export tool.
- **R7 — Input/output discipline:** closed schemas, bounded complete operations and structured outputs; labels/notes/options/template content remain untrusted data, not instructions or executable HTML. No tokens, raw database dumps, filesystem paths, arbitrary downstream URLs or remote schema resolution in tool results.
- **R8 — Honest authoring/layout support:** expose only documented persisted properties. Newly supplied OID/type/date/digit choices require backend policy; unchanged legacy values must not be rewritten. Independent layout persistence remains a separate feature.
- **R9 — Validation/handoff:** TDD, isolated test data, unit/integration/security/concurrency/portability checks and a real SDK stdio critical flow. Backend total remains >=80% and does not decrease against the captured baseline; new agent backend/adapter and new UI scope require >=80% coverage with the exact scope disclosed. The main session inspects actual changes, reruns acceptance and performs a disposable browser walk; complex relay work also receives independent read-only review before any user-authorized commit.

## Acceptance Criteria

All checkboxes are unverified until implementation and actual commands run. Detailed tool contracts, safety limits, defaults and commands are proposed in the linked design/plan and remain subject to artifact review.

- [ ] **AC1 (R1, R6):** missing/invalid/revoked/expired credentials, password-version or owner changes, foreign projects/resources, recycled projects and insufficient permission are denied without unauthorized data or mutations.
- [ ] **AC2 (R2, R3):** an authorized agent inspects an existing form, finds a reusable definition, inserts an instance at the requested position and reads back intended attributes/order.
- [ ] **AC3 (R2, R3):** instance patches do not mutate shared definitions; omissions preserve values and supported explicit nulls clear only intended attributes.
- [ ] **AC4 (R3):** malformed/incomplete/duplicate/cross-scope permutations and invalid horizontal-block changes fail with complete rollback, including log-row ordering semantics.
- [ ] **AC5 (C2, R4):** preview leaves CRF metadata unchanged; only genuine owner approval enables exact, caller-bound, unexpired shared application; forged, rejected or altered proposals fail.
- [ ] **AC6 (R4, R5):** relevant state/reference changes after preview require fresh review; repeated successful request/change identities execute once, and conflicting request-ID reuse or uncertain outcomes are reported distinctly.
- [ ] **AC7 (R6, R7):** an actual official-SDK client/stdio adapter process completes the loop using measured versions, with server-side security and no credential disclosure; private access/approval/audit state is excluded from portable exports/imports/copies without altering the live source or breaking old files.
- [ ] **AC8 (R3, R8):** every exposed authoring/layout behavior has a documented backend contract; frontend-only rules are neither bypassed nor claimed as pre-existing server features, and all affected shared forms retain valid normalized structure.
- [ ] **AC9 (R9):** agreed regression/security/concurrency/E2E/coverage checks and main-session browser verification pass, or actual blockers are explicitly reported without claiming completion; user docs, module notes and entry-point index match implemented scope.

## Artifacts and Proposed Technical Approach

- [design.md](design.md): standalone official-SDK adapter, backend scoped grants, generated ten-tool schemas, coarse project content fingerprints, transactional idempotency, immutable human approval, private-state portability and narrow trusted UI.
- [implement.md](implement.md): planning board, A-owned dependency/test preparation and review gates, exact B file allowlist, ordered TDD checklist, validation commands, repair limits and report format.
- [implement.jsonl](implement.jsonl) / [check.jsonl](check.jsonl): curated real specs/research for implementation and verification, not code-path dumps or a substitute for this PRD.

C8 approves the linked technical approach and bounded preparation, without claiming that dependency resolution or runtime compatibility has passed. Backend dependency upgrades, public HTTP MCP transport and model-provider integrations remain outside the task.

## Exclusions and Remaining Gates

No arbitrary SQL/HTTP/file/system tools, account/admin/settings/org management, production deployment, release/CI changes, agent import/upload/export/purge/batch-delete tools, embedded model hosting or participant data. Necessary private-export compatibility in R6 does not expand the exposed tool surface. Planning performs no commit/merge/push/install, test-credential creation or live-data mutation.

No unresolved product-scope question remains. C8 resolves the artifact/dependency/test-credential authorization gates; task activation, environment compatibility, baseline tests and actual implementation/acceptance remain to be executed. An unavailable approved dependency or a failed baseline blocks worker dispatch rather than authorizing a substitute or scope expansion.
