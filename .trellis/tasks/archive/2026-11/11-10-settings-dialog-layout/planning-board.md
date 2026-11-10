# Settings Layout Planning Board

## Status

Implementation approved by the user on 2026-11-10 (「按此方案实施」), followed by an authorized 8888 frontend rebuild for acceptance. The user confirmed browser acceptance with 「没有问题了，收尾」 and explicitly requested 「提交，然后收尾」. Work commits, task archival, journal and the repository's standard main merge/push/task-worktree cleanup pipeline are now authorized; backend/configuration/database changes and unrelated tasks remain out of scope. Status is completed after task.py archive on 2026-11-10; work hashes and acceptance evidence are preserved in the archived task.

| State | Stage | Deliverable / gate |
| --- | --- | --- |
| Done | Scope and evidence | Read settings markup/handlers, four affected test files, project prefs and directly relevant frontend specs. |
| Done | Product decisions | Flat cards; 账号 / 界面 / 项目与数据; logout in user row; 基础 / 完全; light/dark only. |
| Done | Planning convergence | Final PRD and both curated context manifests; planning-file/path validation. |
| Done | Execution gate | User approved 「按此方案实施」 and task.py start set status to in_progress. |
| Done | Baseline and RED | Existing 95 affected mounts passed; six source and 24 mount expectations failed against old presentation as intended. |
| Done | GREEN | Grouped App settings and updated existing tests; original business script proved byte-identical after presentation-only declarations/imports are removed. |
| Done | Validation | 1081 source tests + 359 mount cases passed, affected mounts 107 passed; all App coverage metrics improved; lint/build/diff/gitleaks and real-browser matrix passed. Main diff/security self-review complete; independent read-only review received with no blocking findings in its reviewed snapshot (the final HTML-literal username test was excluded; scope recorded in verification.md). |
| Done | Documentation and report | README zh/en, module/root context/index and concise frontend spec synchronized; exact results and boundaries recorded in verification.md. No automatic commit or deployment. |
| Done | Authorized acceptance rebuild | Confirmed service/static directory; backed up old generated assets under /tmp/crf-settings-deploy-20261110-131733/previous-dist; npm --prefix frontend run build passed. |
| Blocked | Authorized acceptance restart | New assets copied before atomic index replacement; older chunks retained. sudo -n systemctl restart crf-editor.service failed because a password is required; no alternate privilege route attempted. User-side authenticated restart is required. |
| Done | Acceptance availability | Existing service remained active/running at PID 165323 during deployment verification. HTML/new JS/new CSS each returned HTTP 200 and byte-matched the build; full asset checksum comparison reported no missing/different files. |
| Done | User browser acceptance | User confirmed 「没有问题了，收尾」; no additional UI change requested. The sudo-blocked restart remains a recorded limitation, not a successful restart. |
| Done | Work commits | ca9dbb1: product code/tests/docs; 0380184: frontend spec; 55a2d7b: context evidence. All three normal pre-commit checks passed without bypasses. |
| Done | Task archive | Archived only settings-dialog-layout under archive/2026-11; task status is completed and both context manifests point to the archived research file. |
| Next | Journal | Record journal referencing ca9dbb1, 0380184 and 55a2d7b, then complete main delivery. |
| Pending | Main delivery and cleanup | Merge to main, rebuild the served frontend from main, verify served assets, push main and recoverably remove only this task's worktree/branch. |

## Expected Implementation Scope

- `frontend/src/App.vue`: settings template, local styling and only necessary presentation helpers/icon imports; keep business handlers unchanged.
- `frontend/tests/appSettingsShell.test.js`
- `frontend/tests/agentAccessWiring.test.js`: one-line multiline-attribute locator compatibility, with lifecycle assertions unchanged.
- `frontend/tests/component/AppSettingsBehavior.spec.js`
- `frontend/tests/component/AppWorkspaceBehavior.spec.js`
- `frontend/tests/component/AppAgentAccess.spec.js`
- `README.md`, `README.en.md`, `frontend/.claude/CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/index.json`: concise terminology/settings documentation and index synchronization.
- Existing `.context/history/archives/claudemd-changelog.md`: task narrative only if recording final evidence; preserve all historical content.
- Task artifacts and required branch-local decision log. Spec updates, if a reusable contract is learned, remain a separate Trellis change rather than an unrelated rewrite.

Do not touch backend behaviour, dependencies, build scripts, global palette, other task worktrees or private client configuration. The acceptance request permits updating the existing service's ignored frontend/dist artifacts and restarting crf-editor on 8888, with an external static-asset backup; the subsequent explicit commit-and-wrap-up request enables the standard main delivery pipeline for this task only. Do not retry sudo through another privilege route, change database/configuration, or clean up unrelated tasks/worktrees.

## Validation to Run After Approval

All commands run inside this task worktree, with an explicit frontend working directory where applicable.

```bash
cd frontend && node --test tests/appSettingsShell.test.js tests/agentAccessWiring.test.js
cd frontend && npx vitest run tests/component/AppSettingsBehavior.spec.js tests/component/AppWorkspaceBehavior.spec.js tests/component/AppAgentAccess.spec.js
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
git diff --check
```

Measure baseline/final App.vue coverage with the same installed vitest coverage provider, include pattern and suite selection; no config/exclusion weakening. Record exact supported coverage commands and totals at execution time. Review password, logout, import/export and Agent entry bindings against their unchanged handlers and role/project guards.

Browser matrix: ordinary user and admin × light/dark on desktop; 390px and 320px widths; a short viewport and long project name; keyboard selector use, persistence, settings reopen and header × close; Agent entry routing/no-project state without credential issuance. Use only the newly authorized disposable environment and redact credentials. No live-data or 8888 access.
