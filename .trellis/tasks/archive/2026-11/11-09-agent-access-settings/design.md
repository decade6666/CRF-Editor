# Design — Settings Entry and Project-Local MCP Test Setup

## 1. Boundaries and Ownership

Main implements inline only after the PRD/design/plan is approved and the task is in_progress. Feature source changes remain in `feat/agent-access-settings`; the explicitly approved local setup exceptions are main's ignored adapter environment, one Claude Code per-project MCP registration, and a fresh private `/tmp` acceptance root. Do not edit App/source on main, existing user/provider/permission settings, backend code, old acceptance roots, or production8888.

The test client is Claude Code, not the API/backend's identity. Keep the existing ten-tool stdio adapter and two-environment-variable contract byte-identical. Future Pi Web/other agents can reuse that standard interface if supported; a platform-specific client or remote MCP listener is separate work, not implied here.

## 2. Minimal UI Move

- Move the existing `showAgentAccess` / first-open lazy-mount state and open handler from ProjectInfoTab into App's settings-host scope. Remove the old import/button/dialog host from ProjectInfoTab; its metadata/Logo/save logic stays unchanged.
- Add an ordinary-user-only settings action labeled `Agent 授权`, with current-project context and `disabled` when selectedProject is absent. This follows the settings dialog's existing current-project action policy; no global project chooser or admin-owner impersonation.
- Reuse AgentAccessDialog without changing its body, widths, tabs, grant defaults, approval calls or composable. Mount it once on first valid open in the same stable context and forward only modelValue/projectId/update:modelValue, never an additional @close translation.
- Render the dialog as an App-level sibling, not inside the settings el-dialog DOM. Settings can remain behind it so closing Agent access returns to settings without a settings-wide rewrite.
- Gate mounting on a signed-in ordinary user and valid numeric selected project. Close on settings dismissal, project-id change/removal, logout and auth expiry. A surviving lazy instance receives false before/invalidation as appropriate; unmount/reset when the target disappears. No null project id is sent to owner APIs.
- The existing modelValue/projectId watchers and useAgentAccess scope-disposal/ticket guards remain authoritative for clearing the one-time token, selected proposal and stale requests. Prefer host guards, not duplicate token state or new persistence.

## 3. Lifecycle Matrix

| Input/context | Required UI/API behavior |
| --- | --- |
| Settings opens, no Agent action | No Agent request; unrelated settings behave as before |
| Ordinary user, no project | Visible disabled action with a select-project hint; dialog not mounted |
| Ordinary user, valid project | First click mounts and opens exactly one existing dialog with that id |
| Brief/full editing mode | Same owner-entry eligibility as before; changing edit mode does not create a new authorization boundary |
| Close/reopen within same settings/project | Visibility round trip remains usable; no previous raw token reappears |
| Settings close, project switch/delete, logout or401 reset | Close/invalidate; clear token/proposal; no late request revives old context |
| Admin workspace | No project-owner action or grant request; admin global settings unchanged |
| Failed owner list/issue/decision | Existing error semantics; no fake success or new automatic retry |

Use real App/Element Plus mounting for the host integration. API mocks belong at the exported `api` object's methods; do not mock the host under test or suppress Vue warnings. The existing full AgentAccessDialog component tests remain a regression set.

## 4. Stable Local MCP Registration

Verified host facts: Claude Code2.1.319; Python3.12 at `/usr/bin/python3.12`; main adapter environment absent. Its CLI distinguishes local/user/project scopes. For the user's private project-level intent, `--scope local` stores the entry under `/home/decade/CRF-Editor` in `~/.claude.json`; `project` instead creates a potentially shareable `.mcp.json`. Do not create such a shared file or change user-global availability.

After approval:

1. Create only `/home/decade/CRF-Editor/agent_bridge/.venv` with Python3.12 and install the existing unchanged `agent_bridge/requirements.lock`. Keep the backend interpreter `/home/decade/.venvs/crf-editor/bin/python` separate. Do not re-resolve/upgrade packages or edit dependency declarations.
2. Back up the relevant local config privately (0700 parent/0600 file), inspect its identity and current CRF-entry metadata, and refuse unexpected concurrent/alias conflicts rather than overwrite them.
3. Use the standard MCP CLI to add only `crf-editor` in local scope from the main checkout. The intended stdio command is `/home/decade/CRF-Editor/agent_bridge/.venv/bin/python`, argument `/home/decade/CRF-Editor/agent_bridge/server.py`. No old worktree or new feature-worktree path in the persistent registration.
4. Keep `CRF_AGENT_API_URL` and `CRF_AGENT_TOKEN` supplied by the authorized acceptance client's process environment/variable references, not raw argv or a committed file. Only the newly created disposable credential may be read programmatically for this test. Preserve unrelated credentials as opaque data; never dump user configuration or a raw `mcp get` result.
5. Validate actual local-scope variable propagation under a controlled child environment. Documentation explicitly shows expansion for `.mcp.json`; its exact local-scope behavior is not treated as proven. If expansion/inheritance is unsupported, stop for a bounded decision rather than silently persist a token literal, add a custom launcher, change scopes/permissions, or claim connectivity.
6. A running parent Claude Code cannot be assumed to inherit variables created later by a child. Retain a private env handoff for a fresh test-client launch when needed, and report the required `/mcp` reconnect/restart separately from the standard MCP smoke. No paid LLM request is part of this plan.

Official scope evidence: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md (Context7); installed CLI help confirms the exact scope/transport/env options. Direct retrieval of https://code.claude.com/docs/en/mcp failed with ECONNRESET, so no additional undocumented behavior is inferred.

## 5. Isolated Acceptance Service

- New private task root with a fresh database, uploads/Docx/temp paths, config-source redirect, disabled background jobs/AI and fresh signing/user credentials before the first app import. Use the existing tested hermetic patterns; assert every effective path belongs to the new root.
- Serve the feature worktree's independently built frontend via a new loopback-only backend on an available port. No systemd,8888, real config/database, Windows forwarding or old `/tmp` edits.
- Exercise the real settings → Agent action → existing dialog, masking/close/reopen/context cleanup in desktop and narrow light/dark views. Do not screenshot a revealed token or read an existing system clipboard; existing mocked clipboard coverage is retained.
- Create a least-privilege disposable project grant for the runtime MCP read smoke, save it only in0600 private state, and pass it through child environment. Initialize the main-directory adapter, verify exactly ten tools, read the granted project/outline and prove CRF metadata was not changed. Do not approve/apply a retained user proposal or use a real project.
- Retain service, private credentials and evidence for the user's manual test; report the URL and safe credential-file location without values. Later stop/deletion requires its applicable authorization.

## 6. Documentation and Risk Controls

Update only the location and host-lifecycle parts of cross-stack §16 and synchronized README zh/en, adapter README, root/frontend context and file index. Preserve all API/tool/security contract bodies and other sections.

Current risks: App's larger lifetime can outlive a project/session; tests must cover late responses and invalid contexts. Existing width860px and masking behavior must not regress. New environments require explicit setup approval, not dependency expansion. Client-path validity is not evidence of token/backend/current-session readiness. Existing timeout-subtype and E2E-startup-cleanup LOW findings remain outside this task.

No rollback is performed by reset/clean or secret exposure. Keep private backups and stop on gate/scope conflicts; do not silently overwrite another session's client changes. Final reports distinguish code tests, CLI/config checks, protocol smoke, actual browser evidence and any user reconnect step.
