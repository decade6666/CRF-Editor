# Remove AI Review

## Goal

Remove the CRF Editor's Word-import AI review feature end to end, so imports use deterministic parsing without AI configuration, background review, suggestion acceptance or type overrides. Preserve the existing import/evidence experience and run a fresh, read-only **opus** review after final implementation and A's verification (the user's latest model choice). The completed first fable pass remains historical audit evidence.

User request: `删除AI复核功能，完成后使用fable独立审查一遍`.

## Background and Evidence

File:line anchors below refer to inspected base `5e174865a777d7cc0f14c3a8ed6718233cdbe2db` unless stated otherwise. The task currently uses `/home/decade/CRF-Editor/.claude/worktrees/remove-ai-review`, branch `worktree-remove-ai-review`. Shared main advanced independently to `04df78169fcc1ae2e60a1e0c8dc81a3ab07a6668` during planning; preparation must align to the latest verified main and record the real dispatch base. The new settings layout was reviewed read-only, not implemented by this task.

| ID | Confirmed evidence | Consequence |
| --- | --- | --- |
| E1 | `frontend/src/App.vue:544,1136-1137`; complete settings state/flow at `432-443,491-559,1131-1181` | Settings contain review-only configuration and connectivity testing, adjacent to shared template settings and Agent access. On new main, preserve the settings cards / boolean preferences / admin footer contract (`main:.trellis/spec/frontend/component-guidelines.md:144-157`). |
| E2 | `backend/src/routers/import_docx.py:333,357-374`; old execute DTO at `158-163`; settings DTO at `backend/src/routers/settings.py:68-79` | Preview starts review, status is a dedicated endpoint, and old write parameters require explicit retirement handling. Removing their declarations alone would silently ignore extras (researcher's synthetic Pydantic 2.13.5 probe, consistent with the unconfigured DTOs). |
| E3 | `frontend/src/components/WordImportDialog.vue:95-123`; `frontend/src/components/DocxCompareDialog.vue:31-40`; acceptance helper `frontend/src/composables/docxAiSuggestionOverrides.js` | AI status/acceptance is a cross-component feature, not merely a hidden switch. See `research/frontend-removal-boundary.md` for the verified frontend call graph and retained behavior. |
| E4 | `backend/src/services/ai_review_service.py:21-32,518-534`; override-only helper in `backend/src/services/docx_import_service.py:968-994`, expansion at `1284-1499` | Review state is process-local, not a database table. Remove the whole service and override path; preserve deterministic multiselect splitting, log-row indexing/persistence and retained error-log indices (`1535`). |
| E5 | `backend/src/config.py:224-251,254-272,288-326`; settings-only utility consumers in `backend/src/routers/settings.py:17,116,132,138,165,180,192` and `backend/src/utils.py:25-58,102-117` | Runtime AI config and its exclusive URL/masking helpers can be retired. Raw-YAML updates preserve unknown sections, so old stored `ai:` keys need not be inspected or erased. Keep shared `is_safe_path` / upload helpers and their security behavior. |
| E6 | `backend/scripts/weekly_release.py:615` consumes `httpx` through its independent `RELEASE_AI_*` configuration | Weekly-release AI and its dependencies remain outside this removal. |
| E7 | `.trellis/spec/guides/cross-stack-contracts.md:171-200,249-250,347` and `708,721,733` | Retire AI-only clauses in §4/§8, preserving screenshots, owned temp IDs, non-disclosure, cleanup, streaming/draining and parse-time checkbox synthesis for 「其他」 projects. |

The backend researcher returned without file writes because its runtime prohibited report Markdown. A did not request a bypass and directly checked the critical DTO/config/spec excerpts; the findings are recorded only in A's already-authorized planning artifacts.

## Requirements

- **R1 — Complete removal:** remove review-only UI, settings/connectivity calls, backend endpoint/task/service/DTOs, acceptance helpers and type-override execution. Do not leave a disabled implementation or temporary response/endpoint shim. Retired endpoints return normal 404; new preview/settings responses contain no AI fields.
- **R2 — Preserve import and preview:** retain 10 MiB upload guards, deterministic parsing, project-specific multiselect rules, screenshot evidence and locator behavior, form selection, exact `{temp_id, form_indices}` execute payload, failure semantics, result IDs, cache/refresh updates and the designer handoff. Keep normal rendering, orientation, label/default formatting and shared width planners unchanged. Existing imported field types/data are not rewritten.
- **R3 — Preserve independent capabilities and boundaries:** retain weekly AI release automation/`httpx`, Agent access/MCP, template settings, latest settings layout, authentication/admin/project ownership, export behavior and .db/.docx/sidecar temp cleanup. No database schema migration is needed.
- **R4 — Tests and active documentation:** write removal regressions first, confirm RED, implement minimally, then run the planned unit/integration/component/browser checks. Replace obsolete positive AI tests without weakening shared coverage. Update active README/module/index/spec references, not historical archives. Coverage must remain at least 80% on the assessed scope and not decrease against a measured comparable baseline; report any pre-existing/environmental shortfall rather than claim compliance.
- **R5 — Relay ownership and independent acceptance:** A owns planning, actual-diff/security review, revalidation and acceptance; exactly one B implements the approved allowlist. Final R is fresh/read-only with requested model `opus`, after writers return and A has no blockers (latest user instruction supersedes the initial fable choice; its completed first report is retained). At most two logical fix rounds; changing R does not reset the counter. Requested B `sonnet` / final R `opus` are supported by the native invocation schema, but actual resolution/usage must only be reported when exposed. No implementation before artifact approval and `task.py start`.
- **R6 — Explicit stale-input rejection (user-confirmed):** requests containing retired `ai_overrides` or old settings `ai_*` write parameters return sanitized **422**, tell the caller review was removed and to refresh, and perform no import/config write. Never echo submitted values/credentials. Preserve unrelated unknown-input policy and existing authorization behavior. The user chose this over silently ignoring old parameters through AskUserQuestion.
- **R7 — Non-destructive stored-config compatibility:** remove runtime `AIConfig`/accessors and the tracked example `ai:` block; legacy raw YAML `ai:` data may remain inert, is not read into runtime settings, exposed by APIs, or sent externally. Do not inspect or proactively erase actual config/credential values; preserve atomic unknown-key-retaining `update_config` behavior, auth settings and custom sections.

## Acceptance Criteria

- [x] **AC1 → R1:** No active UI/status polling/background review/suggestion application remains; the two old AI endpoints return 404; preview/settings schemas and outputs have no AI fields; the five listed exclusive source/test files in `implement.md` are removed recoverably.
- [x] **AC2 → R2:** Upload → select → compare/evidence → import → result/designer handoff passes. Parsed text/date/choice/checkbox/log-row behavior, ordering and owner-bound temp cleanup remain covered. No unrelated planner/renderer algorithm changes.
- [x] **AC3 → R3:** Latest settings grouping/boolean preferences/Agent lifecycle and auth/project/template/import/export regressions pass; weekly-release/MCP implementation/config/dependencies remain unchanged.
- [x] **AC4 → R4:** RED evidence exists; affected and full regression commands pass; measured coverage is reported against baseline; active docs/indexes/specs have no obsolete review claims or missing-file references in the approved removal scope. Historical provenance stays intact. The four additional ranges found by first review were user-approved, corrected and checked; final post-round2 evidence and minor residual test/type limits are in `verification.md`.
- [x] **AC5 → R5:** A independently reran planned checks and inspected actual diffs/new files; the final native invocation explicitly requested `opus`, its fresh-context read-only review returned PASS/no blockers, and all 57 scoped records plus five git-state comparisons stayed unchanged. Requested/resolved model distinctions, handles, two repair rounds and unexposed usage are recorded in `final-independent-review.md`. **Actual Opus routing is not certified**: delivered reviewer context advertises `gpt-6.1-sol[1M]`. Technical acceptance is not a verified-Opus claim; two non-blocking test gaps remain disclosed.
- [x] **AC6 → R6:** Stale AI execute/settings requests fail safely with 422 before writes, responses do not include submitted fake credential values, and ordinary requests plus existing 401/403/owned-temp behavior still pass.
- [x] **AC7 → R7:** A synthetic config containing an old `ai:` block loads without runtime AI fields; template-only update leaves that inert raw section and unrelated keys intact; real configuration/secrets/databases are never accessed by planning or validation.

## Out of Scope and Authorization

- No changes to weekly AI release code/workflows/tests/config, MCP/Agent implementation or database schema.
- No live data, actual `config.yaml`/`.env`/credentials, production deployment, service restart, or port 8888 operations. No external AI test calls.
- No dependency expansion, runner/build/release script changes, broad refactor/formatting, provider/model/permission configuration changes, or archive rewriting.
- No commits, task-to-main merge, push, resource interruption, branch/worktree removal or publication without separate applicable authorization. Execution approval may include only the safe pre-implementation fast-forward **from** main into this uncommitted task branch as specified in `implement.md`.
- Authorized through final AskUserQuestion: the reviewed PRD/design/implementation plan; all 33 B allowlist paths and five recoverable deletions; safe main-to-task fast-forward; existing-lockfile `npm ci`; one-time synthetic local test accounts/random passwords and starting/stopping only this task's isolated verification processes. Current environment-reported `gpt-6.1-sol[1M]` remains approved as A, and stale-input rejection is confirmed. Commits, task-to-main merge, push and production deployment are not authorized.
- After the first independent review, the user approved four narrow A-owned active-doc corrections through AskUserQuestion: `frontend/README.md` (retired AI duty), frontend spec `hook-guidelines.md` (removed AI lifecycle example/reference), `component-guidelines.md` (obsolete polling comment), and `quality-guidelines.md` (removed test-case references). Existing B scope stays unchanged; use the remaining second repair round for logging-index/test corrections, revalidate and review. The user's subsequent explicit instruction changes final independent review to `opus`, not A or B and not provider/permission configuration.

## Confirmed Coverage Gate After Baseline

Before any implementation, A measured backend 1658 passed / 88.3143% coverage and frontend 1081 source tests plus 359 component tests passed (full component coverage required a serial rerun after three unchanged parallel timeouts). Lint/build passed; lint has 2814 existing warnings. The existing **Vitest component-only** total is 67.38% lines / 63.14% statements, not a merged measure of all frontend suites and not >=80%. Details/evidence are in `verification.md`.

The user approved the scoped gate through AskUserQuestion: every changed frontend production module must reach >=80% line/statement coverage and retain any higher measured baseline (App 98.70% / 97.52%, WordImportDialog 92.10% / 90.90%, useWordImport 81.27% / 80.93%); the comparable overall component line/statement totals must not decrease. The newly real-mounted comparison/simulated-preview chain must meet >=80%. Backend overall remains >=80% and non-decreasing against 88.3143%. Do not expand into unrelated test remediation or claim frontend overall >=80%.

## Planning Board

- [x] Obtain task creation / relay-A approval; create worktree and planning task.
- [x] Inspect direct frontend/backend dependencies, tests, config/spec boundaries, and upstream settings layout.
- [x] Resolve the remaining stale-input product decision with the user.
- [x] Complete `design.md`, exact-scope `implement.md`, relay state and real implement/check manifests.
- [x] Read this converged PRD top to bottom: no unresolved product questions, duplicate requirement ownership or lost acceptance mappings; manifest/path/whitespace planning checks passed.
- [x] Obtain the user's final artifact review and explicit implementation authorization before `task.py start`.
