# Implementation Plan — Settings Agent Entry and Local MCP Setup

## Status and Execution Gate

Implementation approved on 2026-11-09 via AskUserQuestion (`批准开始实施（推荐）`); the existing task is now in_progress. Main owns implementation/testing/review inline. C3/C4/C5 authorize only the already-planned local setup and fresh isolated test resources. No commit, merge, push, archive, deletion or production access is authorized.

## 1. Proposed Write Allowlist

### Feature worktree source/tests

- `frontend/src/App.vue`: settings entry, the moved lazy host, valid project/role/session guards and close/reset lifecycle only.
- `frontend/src/components/ProjectInfoTab.vue`: remove only the old Agent import/state/button/dialog host; preserve metadata/Logo/save behavior.
- `frontend/tests/agentAccessWiring.test.js`: transfer host assertions to App; retain dialog/composable/security assertions and old-host absence.
- `frontend/tests/appSettingsShell.test.js`: current-project/ordinary-user entry and settings reset/role regression assertions only.
- `frontend/tests/component/ProjectInfoAgentAccess.spec.js`: prove old entry/dialog is absent without Agent calls; move the prior host behaviors into the new integration suite, not silently delete coverage.
- New `frontend/tests/component/AppAgentAccess.spec.js`: real App/Element Plus host behavior, API boundary mocked, existing dialog behavior preserved.
- **Additional test-only scope approved via AskUserQuestion on 2026-11-09:** add `frontend/tests/component/AppSettingsBehavior.spec.js` and `frontend/tests/component/ProjectInfoMetadata.spec.js` (or expand the listed test files) to cover necessary existing App/ProjectInfoTab branches. The unchanged four-file component baseline was 53.60% lines / 50.80% statements / 51.45% functions / 51.67% branches; retain the same include/runner scope, meet at least 80% and do not weaken metrics. Existing unrelated product implementations remain read-only.
  - As executed (test files only): `AppSettingsBehavior.spec.js` (32), `ProjectInfoMetadata.spec.js` (23), plus `AppWorkspaceBehavior.spec.js` (46; lazy workspace tabs replaced by `vi.mock` stand-ins that still flow through App's `defineAsyncComponent` loaders) and the non-spec helper `tests/component/appTestHarness.js`, which `AppAgentAccess.spec.js` now reuses instead of duplicating helpers. Same include list and reporters; result 866/883 lines (98.07%), 964/1000 statements (96.40%), 340/347 functions (97.98%), 616/666 branches (92.49%).
  - Run note: at the default worker count the unchanged heavy FormDesignerTab mount specs (`FormDesignerFieldReorder`, `TemplateImportSelection`, `SingleInlineTableGuard`, `OidUppercase`) time out at 5 s in this environment even with only the original 21 files (diagnostic CLI `--testTimeout=30000`: all 347 pass, slowest 6.2 s vs ~1.8 s isolated). Final evidence used CLI `--maxWorkers=4` with the default timeout; no config/test-timeout changes.
  - Pre-existing observation (not fixed, out of scope): `ProjectInfoTab.onUnitInput` reads the model before `el-autocomplete` emits `update:modelValue` (it emits `input` first), so the preset-Logo downgrade applies one keystroke late.

AgentAccessDialog.vue and useAgentAccess.js remain read-only unless a newly verified blocker needs separately approved scope; no speculative edit or settings-component extraction. No backend/adapter production/test/dependency/runner changes.

### Synchronized documents/spec

- `README.md`, `README.en.md`, `agent_bridge/README.md`: new settings path, generic MCP env/stdin contract, stable-directory/client reconnect instructions without host-specific secrets.
- `.claude/CLAUDE.md`, `frontend/.claude/CLAUDE.md`, `.claude/index.json`: correct host/entry/test pointers; preserve historical scan metadata.
- `.trellis/spec/guides/cross-stack-contracts.md`: only §16 owner-UI/synchronization/test-host references; preserve API/tool/security bodies and every other section.
- This task's PRD/design/implementation/metadata/research records and branch-only `.context/current/branches/feat/agent-access-settings/session.log` as necessary.

### Explicit local setup exceptions after approval

- Fresh ignored `frontend/node_modules` in this feature worktree from unchanged package-lock via npm ci.
- Fresh ignored `/home/decade/CRF-Editor/agent_bridge/.venv` from the unchanged existing lock, Python3.12 only. Do not install into the backend venv or modify main source/package declarations.
- Only the `crf-editor` entry under the `/home/decade/CRF-Editor` local project in `~/.claude.json`, through the standard CLI from main. No user-global registration, shared .mcp.json, settings.json/settings.local.json, provider/gateway/model or permission writes. Stop on an unexpected existing entry or concurrent conflict.
- One new private `/tmp` acceptance root: fresh isolated backend launcher/config/database/uploads/temp, restricted credential/env files, isolated frontend dist, test/coverage/browser reports and recoverable backups. No old acceptance-root writes or deletion.

## 2. Ordered Steps

1. Reconcile main/worktree/peer ownership, confirm the final artifacts and in_progress status, snapshot exact source/docs and local-config metadata privately. Preserve current config before any allowed write; never dump it.
2. Provision only the existing pinned environments. Check Python/SDK/package consistency and hash package/lock files before/after. If install needs a different version or system package, stop; do not expand dependencies.
3. Capture passing relevant frontend/runtime/coverage baselines using task-private caches/reports. Keep the same coverage scope/options for before/after; no threshold/config exclusions or numerical promises before actual results.
4. **RED first**: add host/absence/security integration assertions, run them before implementation and confirm failures come from the old location/lifecycle. Assert settings-open zero Agent requests, no-project disabled, admin hidden, valid lazy mount/exact id, close/reopen, settings dismissal, project switch/removal, logout/auth expiry and deferred-response/token clearing. Mock only external APIs/unrelated heavyweight children, never App or the changed host logic; do not suppress Vue warnings or change shared test-clock infrastructure.
5. **GREEN**: move the minimal host/entry into App, remove the ProjectInfo seam, reuse the existing dialog with numeric-id guards and update:modelValue only. Verify targeted tests, old metadata behavior and full frontend suites. No new feature abstraction or authorization policy.
6. Synchronize only the stated docs/spec pointers. Review the actual diff and security-sensitive lifecycle. Collect exact after coverage and non-decrease/at-least80% evidence with unchanged metrics; if the allowlist cannot meet a gate, report/stop rather than broadening it or weakening the threshold.
7. Build into the new task-private dist and start a loopback-only isolated backend using the existing backend interpreter. Redirect config/database/uploads/Docx/temp/background-job behavior before app import; assert paths. Seed only fresh disposable data, never query/copy real data or old acceptance credentials.
8. Drive the real settings entry and reused dialog in a browser; inspect desktop/narrow light/dark screenshots and context close/reopen behavior. Do not expose a revealed token in screenshots or access an existing clipboard. Create only a fresh least-privilege project test credential and retain it privately.
9. Prepare a private client env handoff from those newly generated values. Register the main-directory stdio server with local scope and secret-free variable references through CLI, never raw token argv. Verify actual local-scope propagation in a controlled client process. If unsupported, stop for a bounded decision; no custom launcher, scope switch or raw-secret fallback.
10. Run selected-entry CLI/config validation, standard-MCP initialization + exact ten-tool listing and read-only granted-project/outline smoke using the main interpreter/script. Distinguish these from current parent-session reload evidence. Do not run a paid LLM prompt or other MCP servers' health checks. If this parent needs a new process or `/mcp` reconnect, report it and give the safe private-env handoff, without claiming automatic activation.
11. Reconcile all changed paths, ensure main source and unrelated local config remain unchanged, retain acceptance service/evidence for user testing, and report run/failed/not-run checks, exact paths and unresolved LOW follow-ups. Commit/merge/push/archive/deletion remain separate user decisions.

## 3. Setup Commands (Proposed, Not Run)

Use explicit working directories on every command. Availability was checked, not installation.

```bash
# Existing pinned frontend environment, in the feature worktree/frontend:
npm ci

# Existing pinned adapter environment, deliberately separate from backend:
uv venv --python /usr/bin/python3.12 /home/decade/CRF-Editor/agent_bridge/.venv
uv pip install --python /home/decade/CRF-Editor/agent_bridge/.venv/bin/python \
  -r /home/decade/CRF-Editor/agent_bridge/requirements.lock
```

Do not invoke the commands during planning. Check the installed SDK matches the unchanged lock. Keep backend tests/runtime on `/home/decade/.venvs/crf-editor/bin/python`.

## 4. Validation Commands and Observable Gates

From the feature worktree's frontend:

```bash
node --test tests/agentAccessWiring.test.js tests/appSettingsShell.test.js tests/projectInfoMetadata.test.js
npm run test:component -- tests/component/AppAgentAccess.spec.js tests/component/ProjectInfoAgentAccess.spec.js tests/component/AgentAccessDialog.spec.js
npm test
npm run lint
npm run build -- --outDir <new-private-root>/frontend-dist
```

Before and after, capture V8 component coverage for the same App/ProjectInfoTab/AgentAccessDialog/useAgentAccess scope through the existing pinned coverage plugin, with JSON/text reports under the new private root. Final report must give exact counts/scope, not reuse another task's percentages as new evidence. Do not edit vitest config or package/lock files. Any unsupported coverage option is a tooling issue to diagnose, not an excuse to waive the gate.

For the unchanged adapter in its main-directory environment, with explicit BACKEND_PY, proxy/CRF child isolation and task-private caches/reports:

```bash
/home/decade/CRF-Editor/agent_bridge/.venv/bin/python -m pytest \
  agent_bridge/tests --cov=agent_bridge --cov-report=term-missing:skip-covered \
  --cov-report=json:<new-private-root>/adapter-coverage.json --cov-fail-under=80 -q
```

Also run exact-path/metadata/schema checks for the local registration; only output service name, path, scope, env key names and a status enum. No raw CLI configuration/env output. Real browser and MCP protocol smoke are required separate steps, not inferred from unit-test/import success.

Before delivery: `git diff --check`, actual diff/new-file review, redacted secret scan of exact candidate paths, JSON/docs links, relevant coverage non-decrease and local-config preservation checks. No git add/commit/push in this phase.

## 5. Stop and Data-Handling Guards

- No live config/database/account values, old test credentials,8888/systemd, Windows forwarding, or retained old /tmp changes.
- Formal C5 covers fresh disposable credentials only after execution approval. Never print tokens/passwords, put them in command args, source files, screenshots, reports or Git. Secret-bearing files/backups live outside Git with0700/0600 permissions.
- If a tool permission/unchanged guard denies a call, do not evade with another interpreter/agent. Diagnose only permitted facts and stop when the precondition cannot change.
- Installer/backend/client/browser/coverage failures are reported and fixed only within approved scope. On the third unresolved attempt, isolate/reproduce/instrument; no blind retries, threshold change or unrelated repair.
- Existing adapter timeout-subtype and E2E setup-cleanup LOW issues are not part of this entry relocation. Do not claim old independent review covers the new diff.

## Execution Board

| State | Step |
| --- | --- |
| Complete | Planning consent, isolated branch/task, direct-source/spec/CLI evidence and C3/C4/C5 decisions |
| Complete | PRD convergence and proposed design/write scope/verification plan |
| Complete | Formal implementation approval; task.py start; main/worktree reconciliation; private config backup (fresh root `/tmp/crf-agent-settings-20261109-pmu2j8at`) |
| Complete | Pinned frontend/main-adapter environment provisioning and baseline tests/coverage |
| Complete | RED/GREEN, minimal host migration, approved test-only coverage expansion (node:test 1080/1080; vitest 347/347 at `--maxWorkers=4`) |
| Complete | Synchronized docs and actual-diff/security review (self-review only; no independent review) |
| Complete | Isolated browser acceptance (loopback 39577, private root, desktop/390px × light/dark, close/Esc/settings-close/project-switch/logout/admin; read-only credential issued through the real dialog and handed off via a 0600 file) |
| Complete | Project-local `crf-editor` registration (single added config path; `${VAR}` expansion verified Connected / no-env Failed / unknown-token Failed) and standard-MCP smoke (initialize, exact ten tools, granted-project list/outline with stable fingerprint, cross-project `GRANT_DENIED`) |
| Open (report) | Pre-existing fixed 560px settings width hides 修改密码 and the new entry at 390px until horizontal scroll; this session lacks CRF_AGENT_* and needs a new Claude Code process to use the entry |
