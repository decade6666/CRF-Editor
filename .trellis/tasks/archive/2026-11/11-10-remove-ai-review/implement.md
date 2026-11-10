# Implementation Plan — remove-ai-review

## Execution Guard / Relay Policy

- Status at planning delivery: `planning`; do not implement until the user reviews PRD/design/this file and A runs `task.py start`.
- Worktree: `/home/decade/CRF-Editor/.claude/worktrees/remove-ai-review`; branch: `worktree-remove-ai-review`; base branch: `main`.
- A: current environment-reported `gpt-6.1-sol[1M]`, user-approved. A owns task/spec/decision/history/acceptance state.
- B: **one native background `trellis-implement`**, requested model `sonnet`. The actual Agent schema supports this model input and already runs in the background; no invented background flag, Channel/controller/team, fork or `TRELLIS_HOOKS=0`.
- R: final fresh native read-only reviewer, requested `opus` per the user's latest explicit instruction (supported by the schema); the completed first fable pass is retained. Use `claude`/`general-purpose`, never the self-fixing check role. Record actual returned handles and model resolution only when exposed; the model change does not reset the repair counter.
- Expected executor duration: **unknown**. Implementation includes backend/config/UI deletion, fixture rewiring, focused verification and potential fixes; no reliable measured duration exists. Human approval/planning and A-only baseline/browser/review waiting are excluded. Unknown routes to native, not a guessed short Channel run.
- Native continuation capability is the actual `SendMessage` tool. Keep the same named B for at most two logical fix rounds; lost handles/uncertain ownership require investigation and applicable user approval, never an overlapping replacement.
- A writes `relay-state.md` before dispatch (`starting`), then records the real B/R identities, dispatch base/status/snapshot paths, requested/resolved models, lifecycle and rounds. None is launched yet; no fallback is currently required.

## Ownership and Exact Write Scope

### B — source/config slice

Only these source/config files may be edited, with the stated deletion scope:

- `backend/src/routers/import_docx.py`
- `backend/src/routers/settings.py`
- `backend/src/services/docx_import_service.py`
- `backend/src/services/ai_review_service.py` — delete whole file
- `backend/src/config.py`
- `backend/src/utils.py` — remove only review-exclusive `is_safe_url` / `mask_secret` and their unused imports
- `frontend/src/App.vue`
- `frontend/src/components/WordImportDialog.vue`
- `frontend/src/components/DocxCompareDialog.vue`
- `frontend/src/components/SimulatedCRFForm.vue`
- `frontend/src/composables/useWordImport.js`
- `frontend/src/composables/docxAiSuggestionOverrides.js` — delete whole file
- `config.yaml.example` — remove only the runtime review `ai:` block

### B — tests

- `backend/tests/test_ai_review_service.py` — delete exclusive suite
- `backend/tests/test_settings_ai_test.py` — delete exclusive suite
- `backend/tests/test_permission_guards.py`
- `backend/tests/test_docx_import_contract.py`
- `backend/tests/test_docx_temp_isolation.py`
- `backend/tests/test_streaming_docx_upload.py`
- `backend/tests/test_async_heavy_threadpool.py`
- `backend/tests/test_rate_limit.py`
- `backend/tests/test_config.py`
- `frontend/tests/docxAiSuggestionAcceptance.test.js` — delete exclusive suite
- `frontend/tests/docxBimodalPreview.test.js`
- `frontend/tests/component/WordImportDialog.spec.js`
- `frontend/tests/component/AppSettingsBehavior.spec.js`
- `frontend/tests/component/DocxCompareDialog.spec.js` — may create, behavior tests for the real comparison/simulated-preview path

### B — active documentation / inventory

- `README.md`
- `README.en.md`
- `.claude/CLAUDE.md`
- `backend/.claude/CLAUDE.md`
- `frontend/.claude/CLAUDE.md`
- `.claude/index.json`

Update only the feature removal/file inventory; preserve release/MCP chapters, new settings layout wording and archival provenance. Do not create change-log narratives, alter project rules, rewrite archives or edit Trellis specs.

### B — sole task-artifact exception

B alone may create/overwrite `.trellis/tasks/11-10-remove-ai-review/relay-progress.md`. All other task artifacts are read-only to B. Keep a small snapshot at meaningful stages, before/after long validation, on blockers and at handback:

```text
Updated: <ISO-8601 timestamp with timezone>
State: pending | implementing | validating | blocked | ready_for_review | failed | interrupted
Step: <S1-S4 and short description>
Completed: <short confirmed summary>
Verification: <latest command and pass/fail/not-run/running>
Blocker: <none or actionable blocker>
Next: <next safe action>
```

No secrets/raw arguments/transcripts/long logs/percentages. Tests may use their existing isolated fixture/temp/cache outputs; build outputs may use existing ignored `frontend/dist`. This is not permission for extra deliverables or configuration changes.

### A-only writes / preparation

- All `.trellis/tasks/11-10-remove-ai-review/` artifacts except B's progress file.
- `.context/current/branches/worktree-remove-ai-review/session.log`.
- `.trellis/spec/guides/cross-stack-contracts.md` — only obsolete AI clauses in §4/§8, remaining route-count/cleanup wording and resulting input contract.
- `.trellis/spec/frontend/component-guidelines.md` — the settings-cards section's removed AI-setting claim and, after the user's post-review approval, the obsolete AI-polling comment in the dialog-transition example only.
- `.trellis/spec/backend/directory-structure.md` — only obsolete AI router/reference entry.
- Post-review user-approved A-only additions: `frontend/README.md` (obsolete AI duty only), `.trellis/spec/frontend/hook-guidelines.md` (retire the removed Word-AI lifecycle example/reference, preserving the valid general async-disposal rule), and `.trellis/spec/frontend/quality-guidelines.md` (replace obsolete two-case/S2 references with accurate current lifecycle evidence, preserving testing principles).
- Approved temporary verification wrappers, snapshots and synthetic browser data outside the repo. No secrets in logs.
- After execution approval only: fast-forward this uncommitted branch **from** verified main, restore dependencies using existing `npm ci`, and perform approved isolated local validation. No task-to-main merge, commits, push, production service or release activity.

R has **no write scope**, including progress files, caches and git state. A/B writes must be quiescent while R audits.

### Remaining Repair Round (2 of 2)

The user approved completing the four narrow A-owned documentation corrections above and original-scope logging/test repairs after the first R pass. The same B may edit only these seven existing allowlist paths for this round, plus its original progress snapshot:

- `backend/src/services/docx_import_service.py`: pin the real zero-based non-log field failure index, not the stale old variable.
- `backend/tests/test_docx_import_contract.py`: reproduce/pin that index; log non-echo, retired-input auth/project edge coverage and marks on task-introduced tests.
- `backend/tests/test_permission_guards.py`: all five retired setting keys including empty/null, log non-echo and task-test marks.
- `backend/tests/test_config.py`: categorize the task-introduced inert-YAML unit test.
- `frontend/tests/component/DocxCompareDialog.spec.js`: non-tautological real control/options/width/orientation and teleported stale-AI absence assertions.
- `frontend/tests/component/WordImportDialog.spec.js`: remove the stale disposal-hook claim; describe only the no-AI guarantee actually tested.
- `frontend/.claude/CLAUDE.md`: add the real new comparison suite to Testing Focus, without unrelated rewrites.

No new files/helpers/scripts, broader mutation experiments, dependency/runner/timeouts/provider changes or modifications to A's four doc ranges. Same progress path, isolated validation wrapper, real TDD for the logging correction, normal test artifacts and original permissions apply. A owns acceptance and history; final independent review is a new requested-opus read-only context, not another implementation writer. Blocking findings after this round require escalation, not an automatic third round.

## Closed Requirement Decisions

1. Remove review completely, including its dedicated settings/test endpoint, task/status, acceptance/overrides and exclusive utilities. Old endpoints return 404; no inactive route/response compatibility shim.
2. User-confirmed: obsolete `ai_overrides` / settings `ai_*` write parameters yield sanitized 422 before any write and instruct refresh. Even null/empty presence is rejected. Do not echo inputs or apply suggestions, alter unrelated unknown-field semantics, or bypass authorization.
3. Actual old YAML/credentials stay untouched/inert. Tests use only synthetic config and preserve raw unknown keys/atomic update behavior. No schema migration or rewrite of already imported data.
4. Keep deterministic project-type splitting/log rows, screenshots, streaming/cancellation/expiry, settings template path, newest settings cards/preferences/Agent lifecycle, shared renderers/planners and independent weekly-release/MCP behavior.
5. No dependencies, providers, settings/permissions, build/release scripts, unrelated refactors or proactive history operations. Doubts/extra files go to Open Questions, not unilateral decisions.

## Ordered Task Board

### S0 — A: activate, align base, prepare evidence (no B yet)

- [ ] Obtain final artifact/implementation approval, including the five named source/test deletions and optional local verification actions. If local random credentials are needed, obtain formal AskUserQuestion approval explicitly covering them before generation.
- [ ] Run `python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-10-remove-ai-review`, then `task.py start` after approval.
- [ ] Reconcile current status against A's planning inventory. Check `git log`, `git worktree list` and shared main; the known upstream layout tip is `04df78169fcc1ae2e60a1e0c8dc81a3ab07a6668`.
- [ ] Safe preparation: `git merge --ff-only main` into this task branch, only if no task code changes/history divergence or path collisions exist. Never reset/clean/stash/force. Reread changed current instructions/App/tests/settings-cards spec; preserve the latest shared layout. If main materially changes this scope, revise artifacts/reconfirm instead of blindly implementing old anchors.
- [ ] In this worktree's `frontend`, run `npm ci` from the existing lockfile (no dependency declaration/lock changes). Verify installed test/coverage/format tools and the existing browser executable; availability is not permission to use credentials or live data.
- [ ] Create A-owned private scratch and a backend test wrapper outside the tree. It must `cd` to the absolute task `backend`, unset only six proxy variables for localhost tests, set `CRF_DISABLE_BACKGROUND_JOBS=1`, and invoke `/home/decade/.venvs/crf-editor/bin/python -m pytest "$@"`. Never print environment values.
- [ ] Measure unchanged baseline backend coverage and frontend tests/component coverage, preserving compact results and surviving-file comparison data. Report baseline failures/coverage shortfalls before dispatch rather than silently fixing unrelated code.
- [ ] Record actual `git rev-parse HEAD`/`git status --porcelain`, important ignored/untracked A paths and recoverable scope snapshots outside the repo. No existing task code edits/commits are expected. The five deletions must remain recoverable from git/snapshot.
- [ ] Write A's `starting` relay state, launch exactly one native B in this worktree, record its real handle and only exposed model/usage metadata. Normal native Trellis hooks remain enabled.

### S1 — B: load context and confirm RED

- [ ] Prompt starts `Active task: .trellis/tasks/11-10-remove-ai-review`. Reuse the `<!-- trellis-hook-injected -->` context if present; otherwise load `implement.jsonl` -> every listed spec/research -> `prd.md` -> `design.md` -> this file. Confirm cwd/branch before writes.
- [ ] Read affected current code/callers plus required import/export/width context using narrow searches/ranges. Read relevant cross-stack §4/§8 (not just old AI clauses); instructions require checking import/export and width contracts even though their algorithms are not edit targets.
- [ ] Add failing tests first: removed endpoints/response fields/UI, no status polling/override payload; stale-input 422 with no writes/no value echo; template-only settings; inert old YAML; deterministic comparison rendering and preserved import flow. Mark new backend unit/integration tests appropriately.
- [ ] Run focused commands and confirm failures express the removal requirements (RED), not missing dependencies/bad mocks. Record compact failure evidence in progress/final report. Do not delete old source before establishing RED.

### S2 — B: minimal removal / GREEN

- [ ] Retire backend runtime config/review service and both endpoints/DTOs; implement sanitized stale-input rejection at true request boundaries.
- [ ] Remove AI override helper/signatures/application and all callers together. Preserve real field-index logging, deterministic parsing/type policy, normal response detail IDs and cleanup/threadpool/ownership behavior.
- [ ] Remove settings-only dead URL/masking helpers, not shared path/upload security functions.
- [ ] Remove frontend AI controls/state/timers/helper/rendering branches; retain ordinary wizard/comparison/width/default behavior and all upstream settings/Agent contracts.
- [ ] Remove only the five explicitly named exclusive source/test files, after inspecting their type/content and relying on A's recoverable snapshot. Replace mixed positive AI tests without weakening retained assertions.
- [ ] Update the tracked example and active docs/inventory within B's allowlist. No private config access or historical/spec rewrites.
- [ ] Run focused verification until GREEN. On the third unresolved failure attempt, switch to isolate/reproduce/instrument and report a blocker; do not repeatedly weaken tests or increase waits.

### S3 — B: self-review and handback

- [ ] Inspect actual source diff and new files, confirm changes are within the allowlist and `git log <dispatch-base>..HEAD` is empty.
- [ ] Run focused backend/frontend validation, full frontend test command, backend format check, frontend lint/build. Use the A-prepared backend wrapper; no package installation or configuration changes by B.
- [ ] Set progress to `ready_for_review` only when handing back; it is a claim until native runtime completion. Stop source writes and return in the report format below. Do not commit/start review agents/fix out-of-scope files.

### S4 — A: acceptance and independent opus final review

- [ ] After real native completion, compare status with pre-dispatch inventory, check no B history or out-of-scope writes, read actual diff and every new in-scope file. A-owned operational files are accounted for separately. Any violation is blocking; never silently revert it.
- [ ] Update only A-owned settled spec/decision paths above; review those actual diffs too. Apply the `trellis-check` checklist without its auto-fixing behavior and run the security-review pass required for import/config/credential boundaries.
- [ ] Rerun **all** planned validation commands below, including full backend coverage, frontend coverage, lint/build and retained permission/phase-0/width/release regressions. Compare measured coverage to baseline; no fabricated 80% compliance.
- [ ] Perform approved real-browser acceptance on a unique local backend/page using a throwaway DB/uploads and synthetic DOCX. Check admin settings absence; regular settings/new cards/Agent entry; upload/select/real comparison/evidence/import/designer; no AI status/test requests or override payload. Preserve screenshot unsupported-runtime error semantics. Do not access production, peer browser pages or port 8888; capture no secrets. Report any not-run/environment block honestly.
- [ ] Resolve A blockers through the same B, at most two total logical rounds across A and R findings, snapshotting new files before each round. No A inline implementation takeover or replacement worker without applicable approval/ownership proof.
- [ ] Freeze writers, snapshot all in-scope/task/progress/git contents outside repo, launch fresh read-only R requested `opus` with `check.jsonl`, PRD/design/plan, dispatch base and snapshot/status evidence. Use native completion notifications, not polling/Channel waits.
- [ ] After R returns, verify file/git contents unchanged before recording its verdict. Blocking findings consume any remaining B rounds and require A revalidation/R follow-up; otherwise report/escalate. Review runtime success alone is not acceptance.
- [ ] Only after required checks/no unresolved blockers, record A acceptance in `relay-state.md`. No automatic commit/merge/push/deployment/resource deletion; report requested/resolved models, backend, handles, unknown estimate/basis, rounds, findings, A-run commands and exposed usage.

## Validation Commands

All commands refer to this worktree, never the main checkout. A's wrapper supplies the exact backend cwd/proxy isolation; B must use the actual wrapper path recorded in relay state rather than invent one. These pytest commands are the semantic equivalents:

```bash
cd /home/decade/CRF-Editor/.claude/worktrees/remove-ai-review/backend && /home/decade/.venvs/crf-editor/bin/python -m pytest -q tests/test_config.py tests/test_permission_guards.py tests/test_docx_import_contract.py tests/test_docx_temp_isolation.py tests/test_streaming_docx_upload.py tests/test_async_heavy_threadpool.py tests/test_rate_limit.py tests/test_db_type_field_policy.py tests/test_docx_import_rules.py tests/test_docx_import_synthetic_tables.py tests/test_docx_screenshot_service.py tests/test_streaming_db_upload.py tests/test_temp_dir_single_source.py tests/test_test_environment_isolation.py tests/test_phase0_ordering_contracts.py tests/test_width_planning.py tests/test_word_table_parity.py tests/test_import_service.py
cd /home/decade/CRF-Editor/.claude/worktrees/remove-ai-review/backend && /home/decade/.venvs/crf-editor/bin/python -m pytest -q tests/test_weekly_release.py tests/test_weekly_release_git.py tests/test_weekly_release_workflow.py
cd /home/decade/CRF-Editor/.claude/worktrees/remove-ai-review/backend && /home/decade/.venvs/crf-editor/bin/python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered
cd /home/decade/CRF-Editor/.claude/worktrees/remove-ai-review/backend && /home/decade/.venvs/crf-editor/bin/python -m ruff format --check .
cd /home/decade/CRF-Editor/.claude/worktrees/remove-ai-review/frontend && node --test tests/docxBimodalPreview.test.js tests/agentAccessWiring.test.js tests/appSettingsShell.test.js tests/basePathDeployment.test.js tests/checkboxFieldType.test.js tests/columnWidthPlanning.test.js tests/useDesignerFormSelection.test.js
cd /home/decade/CRF-Editor/.claude/worktrees/remove-ai-review/frontend && npm run test:component -- tests/component/WordImportDialog.spec.js tests/component/DocxCompareDialog.spec.js tests/component/AppSettingsBehavior.spec.js tests/component/AppAgentAccess.spec.js tests/component/AppWorkspaceBehavior.spec.js
cd /home/decade/CRF-Editor/.claude/worktrees/remove-ai-review/frontend && npm test
cd /home/decade/CRF-Editor/.claude/worktrees/remove-ai-review/frontend && npm run test:component -- --coverage
cd /home/decade/CRF-Editor/.claude/worktrees/remove-ai-review/frontend && npm run lint
cd /home/decade/CRF-Editor/.claude/worktrees/remove-ai-review/frontend && npm run build
```

Baseline runs use the same applicable existing suites; the new comparison spec does not exist until S1. Save full logs/coverage outputs only to approved ignored/private scratch locations, surface compact summaries/errors, and distinguish run/not-run/failed/environment-blocked checks. No real outbound AI calls, new browser framework, build script or test runner is authorized. The unchanged adapter's own SDK E2E and production deployment are outside this validation scope; do not imply they ran.

## Confirmed Measured Coverage Gate

User-approved after baseline: every changed frontend production module must have >=80% lines/statements, retaining any higher baseline: App 98.70%/97.52%; WordImportDialog 92.10%/90.90%; useWordImport 81.27%/80.93%. DocxCompareDialog and SimulatedCRFForm were absent from baseline and must reach >=80% through the new real mount suite. Overall comparable component lines/statements must not decrease from 67.38%/63.14%. Backend overall must not decrease from 88.31431079894645% and stays >=80%. Full unchanged baseline passed under `--maxWorkers=1`; retain the original three parallel coverage timeouts as evidence and use serial coverage comparison without source/config/deadline changes. A's baseline lint/build passed (0 lint errors, 2814 existing warnings). No broad unrelated test remediation is authorized.

All coverage reports go outside the tree: use `--coverage.reportsDirectory=/tmp/crf-remove-ai-review.VVZ78F/<stage>-coverage` with text/json-summary/json reporters; `frontend/coverage` is NOT ignored. A's prepared backend wrapper is `/tmp/crf-remove-ai-review.VVZ78F/run-backend-tests.sh`. Recoverable source snapshot is `/tmp/crf-remove-ai-review.VVZ78F/pre-dispatch-project.tar`; only A writes snapshots/log records outside the worktree. B may invoke the wrapper and test/build tools (their normal temp artifacts are allowed), not create unrelated scratch deliverables or install packages.

## Required B Report (English, <=25 lines)

```text
## Files Modified
- <path(s)> - <one-line change; group related paths only if needed for the line limit>
## Verification Results
- <command> -> pass|fail|not-run - <one-line evidence, including RED then GREEN>
## Open Questions
- <omit this section if none>
```

No diffs/full logs or secrets. B lists unresolved requirements/extra-file needs as Open Questions instead of choosing or expanding scope. Its report/progress is not A's verification or acceptance.
