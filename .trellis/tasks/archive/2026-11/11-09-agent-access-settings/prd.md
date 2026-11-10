# Agent Access in Settings and Stable Main-Checkout MCP Entry

## Goal

Move Agent authorization from project information into settings, reusing the existing dialog. Configure a project-local Claude Code MCP entry that launches the adapter from the stable main checkout. Preserve provider-neutral MCP compatibility for later Pi Web/other agents and preserve all existing project/owner security boundaries.

## Confirmed Requirements and Decisions

- **C1 — Request**: The user requested the UI move followed by MCP reconfiguration according to main's `agent_bridge/README.md`.
- **C2 — Planning authority**: The user selected `创建任务并规划（推荐）`: create a dedicated task/worktree/branch and plan only. Implementation, dependency provisioning and client-config writes wait for approval of these final artifacts and `task.py start`. No commit, merge, push, deletion or production deployment is authorized now.
- **C3 — Client and scope**: The user selected Claude Code project-level and clarified that Claude Code is the test client; later Pi Web/other agents are compatibility context, not deployment scope. Both client availability and backend grants remain project-scoped. For a private per-project Claude Code entry, use its CLI `local` scope, not user-global or a committed host-specific `.mcp.json`.
- **C4 — UI presentation**: The user selected `移动入口，复用原窗口（推荐）`: settings gets the current-project entry, disabled without a selected project; remove the project-information entry and reuse AgentAccessDialog. Do not embed/split the full management UI or redesign settings.
- **C5 — Disposable test authority**: The user formally selected `独立测试环境（推荐）`: after final implementation approval, create a fresh isolated database and random disposable account/signing key/Agent token for local UI/MCP acceptance. Keep credentials in restricted local files/process environment, never display values. Do not reuse or mutate prior retained acceptance data or connect to8888/real data. This permits those test resources, not starting execution or installing dependencies during planning.

## Verified Background

Task/worktree: `.trellis/tasks/11-09-agent-access-settings`, `/home/decade/CRF-Editor/.claude/worktrees/agent-access-settings`; branch `feat/agent-access-settings`; base/main `b8d0ea5454575167b4c59713d144c8a5d6edb8c3`.

| ID | Verified fact | Evidence |
| --- | --- | --- |
| E1 | Settings is a global560px inline App dialog; ordinary-user and admin controls differ. | `frontend/src/App.vue:499-515`, `frontend/src/App.vue:1068-1172` |
| E2 | ProjectInfoTab owns the current lazy dialog host and project-id forwarding. | `frontend/src/components/ProjectInfoTab.vue:20-27`, `frontend/src/components/ProjectInfoTab.vue:239-249` |
| E3 | AgentAccessDialog requires numeric projectId; its existing close/project watchers and composable clear tokens and invalidate late responses. | `frontend/src/components/AgentAccessDialog.vue:7-33`, `frontend/src/components/AgentAccessDialog.vue:68-93`; cross-stack §16 |
| E4 | Old source and mount tests explicitly pin the old host/lazy lifecycle, so move coverage rather than simply deleting assertions. | `frontend/tests/agentAccessWiring.test.js:39-58`, `frontend/tests/component/ProjectInfoAgentAccess.spec.js:43-92` |
| E5 | Adapter startup is generic stdio with required CRF_AGENT_API_URL/CRF_AGENT_TOKEN; only loopback allows HTTP. | `agent_bridge/README.md:18-46`; cross-stack §16 |
| E6 | Main's agent_bridge/.venv is absent; Python3.12 exists at /usr/bin/python3.12. The existing lock was resolved on Python3.12.3/Linux and is separate from backend dependencies. | Exact-path/command-location checks; `agent_bridge/requirements.lock:1-2`, `agent_bridge/requirements.txt:1-4` |
| E7 | Known Claude Code user/top-level and this project's local scopes have no CRF-named server; root .mcp.json is absent. Other clients or differently named servers were not ruled out. No unrelated server or token values were inspected/displayed. | Metadata-only mcpServers-key projection in ~/.claude.json, ~/.claude/settings.json and root/.claude/settings.local.json |
| E8 | Claude Code2.1.319 accepts local/user/project scopes; local entries live under a project in ~/.claude.json, while project scope means shareable .mcp.json. | Installed `claude --version`, `claude mcp add-json --help`, `claude mcp add --help`; official Claude Code changelog via Context7 |
| E9 | Logout/auth expiry clear settings and selected project; admins have no normal-project context. Preserve those boundaries. | `frontend/src/App.vue:65-92`, `frontend/src/App.vue:124-142`; `frontend/tests/appSettingsShell.test.js` |

## Requirements

- **R1 (C4)**: Add a clearly labeled Agent authorization action inside settings for the current project; remove it from project information. Reuse the existing responsive dialog and its credentials/shared-proposals tabs.
- **R2 (C3)**: No global/multi-project grant, admin impersonation, new tool, endpoint or schema. Keep project ownership, read/read_write, expiry/revoke, digest-bound approval and separate apply unchanged.
- **R3**: Open settings alone sends no Agent request. Without a valid selected project the action is disabled; admins get no project-owner action. Closing settings, changing/deleting the project, logout and auth expiry close/invalidate the hosted access state so tokens/details cannot leak or revive from late responses. Preserve lazy first-mount and visibility round trips for a valid context.
- **R4**: Keep existing account/theme/edit-mode/import/export/admin settings behavior. APIs still go through useApi; no new bare fetch or Agent localStorage persistence. Keep the dialog a sibling/root-hosted component rather than rewriting its body or nesting el-dialog internals.
- **R5**: Update host source/mount coverage, settings-shell regression and location docs/module/index/spec pointers together. Do not rewrite unrelated App responsibilities, test infrastructure or existing security logic.
- **R6**: Create only the isolated main-checkout adapter environment from the unchanged pinned lock and one local per-project Claude Code CRF entry. Command/args use stable main paths. Prefer required environment-variable references/process injection, no token in command arguments or Git. Back up client state privately and preserve unrelated MCP/provider/permission settings. Verify actual local-client environment resolution rather than assuming .mcp.json examples prove every scope.
- **R7 (C5)**: New private test root, loopback-only backend, worktree frontend build, isolated config/database/uploads/temp paths before imports, fresh credentials, no old /tmp changes or8888 access. Validate startup/handshake/ten-tool listing and read-only granted-project smoke; retain the acceptance service/evidence for user testing. If Claude Code needs a reconnect/new process to inherit the new environment, report that operator step instead of claiming hot reload.

## Acceptance Criteria

| ID | Observable acceptance | Requirements |
| --- | --- | --- |
| AC1 | Settings action is present; old project-info action is absent. Settings open alone causes no Agent fetch or mutation. | R1,R4 |
| AC2 | Valid project opens the reused dialog with its exact id; no-project/admin/logout/expired/deleted/changed-project contexts close/disable safely, drop stale data and do not issue invalid project requests. | R2,R3 |
| AC3 | Lazy visibility close/reopen, token mask/copy/clear, proposal digest binding and current settings controls remain covered. | R2–R5 |
| AC4 | Targeted RED/GREEN, full relevant frontend tests, lint/build, actual-diff/security review and rendered browser checks pass when feasible; exact coverage scope is recorded, at least80% and non-decreasing without weaker thresholds. Report blockers/not-run checks honestly. | R5 |
| AC5 | One CRF entry exists only in the local project scope, with main-directory interpreter/server paths and required environment names; unrelated config structurally unchanged and private backup retained. No model/provider/permission change. | R6 |
| AC6 | Approved isolated backend/client handshake, manifest of exactly ten tools and read-only scope smoke succeed without exposing secrets or changing CRF metadata. Distinguish CLI/config validation, standard-MCP runtime smoke and actual current-session reconnect evidence. | R7 |

## Exclusions

No new backend/MCP features, deferred findings from the archived task, Pi Web deployment/client implementation, real data or credential inspection, unsolicited rotation, settings-wide redesign, new dependencies/runners, dependency version changes, production build/restart, network forwarding changes, paid LLM calls, commit/publication or artifact deletion. Existing lock/package declarations stay unchanged; installing their already-pinned environments requires final execution approval.

## Artifacts and Execution Gate

- Technical design: [design.md](design.md).
- Exact proposed write scope, test-first order, setup/verification commands and checkpoints: [implement.md](implement.md).
- No blocking product questions remain. Review the complete PRD/design/implementation plan before task.py start. Any unsupported client secret/environment behavior or scope expansion stops for a bounded decision; never fall back to putting a raw token into argv or changing permissions.

## Planning Board

| State | Step |
| --- | --- |
| Done | Obtain task/worktree/planning consent; create dedicated planning task |
| Done | Inspect direct UI/tests, adapter README, relevant specs and redacted config metadata |
| Done | Resolve Claude Code project scope, entry-only UI move and fresh isolated test authority |
| Done | Write/converge design and exact implementation scope; self-review planning artifacts |
| Awaiting user approval | Activate to in_progress, install pinned environments, implement, configure local entry and run acceptance |
