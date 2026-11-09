# Main acceptance after repair round 2

Date: 2026-11-06. Task: `mcp-agent-tools`, still `in_progress`, **NOT ACCEPTED**. Main performed the checks below; worker reports are not substituted for main evidence. The two permitted repair rounds are exhausted. The native writer has been told to remain stopped; no further code/test/doc repair is authorized without a user decision.

## Delivered file scope (uncommitted)

- Backend: new `src/agent_dependencies.py`, `src/models/agent_access.py`, `src/schemas/agent_access.py`/`agent_tools.py`, `src/routers/agent_access.py`/`agent_tools.py`, and the six `src/services/agent_*_service.py` modules; narrow model/router registration, shared field-profile helper and private-state export stripping in the existing files listed by implement.md.
- Adapter: `agent_bridge/{__init__,config,client,server}.py`, standalone README, approved main-owned requirements/lock, and its unit/real-process fixtures/tests.
- Frontend: `src/components/AgentAccessDialog.vue`, `src/composables/useAgentAccess.js`, narrow lazy `ProjectInfoTab.vue` entry, and three new source/mount test files.
- Backend regressions: the seven new `test_agent_*.py` files, `agent_access_helpers.py`, narrow C9 conftest override and marker registration. Documentation: README zh/en, root/backend/frontend module notes and `.claude/index.json`.
- Main-owned dependency preparation: approved frontend package/lock coverage provider and adapter requirement files; no second-round dependency installation. Task/research/context updates are main-owned and not feature-source edits.

## Verified remaining blockers

### B1 — Responsive dialog rule does not match the rendered dialog

- Anchor: `frontend/src/components/AgentAccessDialog.vue:365-370`.
- Actual fresh built app at an ephemeral loopback port, viewport390x844, both light and dark: dialog left0/right860/width860; close button left812/right860. The close button and right-side controls are outside the viewport.
- CSSOM confirms the new rule is loaded as `[data-v-e6ce187c] .el-dialog { max-width: calc(-24px + 100vw) }`, but `dialog.matches(selector)` is false and computed `max-width` is `none`. Thus this is a selector/application defect, not an omitted build or an assumed happy-dom measurement.
- Main captured and visually inspected `.pytest-tmp/mcp-agent-tools/browser-round2-mobile-light-failure.png` and `browser-round2-mobile-dark-failure.png`.
- The source/mount layout checks pass but do not establish real browser geometry. Associated README/module claims of successful narrow-screen behavior remain premature and must be synchronized after a real fix.

### B2 — Present but malformed input/output schemas pass startup validation

- Anchors: `agent_bridge/server.py:94-101`, `121-131`.
- Pure-local fixture gives one known tool either `inputSchema={'type':42}` or `outputSchema={'type':42}`. Installed jsonschema independently rejects this via `Draft202012Validator.check_schema`; `build_server` nevertheless returns a server instead of ConfigError.
- Constructing `validator_for(schema)(schema)` does not validate the schema against its own format rules. Checking only dict type and local references is insufficient. Both startup gates need format validation before any tools are served, while retaining no-network reference policy and redacted errors.
- Reproduction: `.pytest-tmp/mcp-agent-tools/test_main_manifest_boundaries.py::test_manifest_rejects_present_but_invalid_schema` (two parameters). Full adapter probe result: **2 failed / 9 passed**; log `adapter-probes-main-round2.log`.
- This verifies a contract/defense failure, not a demonstrated bypass of backend authorization or arbitrary network access. No remote schema fetch, pressure test, production credential or production data was used.

## Main-run commands and results

All relative paths below refer to `/home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools`. The existing main-owned backend wrapper changes into this worktree's backend, clears its child proxy variables, and uses approved hermetic config/database/temp state.

### Backend

```bash
bash /tmp/crf-mcp-agent-backend-checks.sh pytest --cov=src --cov=main --cov-report=term-missing:skip-covered --cov-report=json:../.pytest-tmp/mcp-agent-tools/backend-main-round2.json --cov-fail-under=80 -q
bash /tmp/crf-mcp-agent-backend-checks.sh pytest /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools/.pytest-tmp/mcp-agent-tools/test_main_backend_review.py /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools/.pytest-tmp/mcp-agent-tools/test_main_repair_additional.py /home/decade/CRF-Editor/.claude/worktrees/mcp-agent-tools/.pytest-tmp/mcp-agent-tools/test_main_final_boundaries.py -q --assert=plain --tb=short --show-capture=no
bash /tmp/crf-mcp-agent-backend-checks.sh ruff format --check .
bash /tmp/crf-mcp-agent-backend-checks.sh py_compile main.py src/agent_dependencies.py src/models/agent_access.py src/models/__init__.py src/routers/agent_access.py src/routers/agent_tools.py src/schemas/agent_access.py src/schemas/agent_tools.py src/services/agent_access_service.py src/services/agent_edit_service.py src/services/agent_operation_service.py src/services/agent_read_service.py src/services/agent_shared_change_service.py src/services/agent_state_service.py src/services/database_export_service.py src/services/field_profile_service.py
```

- Full suite **1621 passed**, 1263 warnings, 103.55s. Main JSON: **9983/11331 =88.10%**, above exact baseline8401/9623 and80%. New agent production modules: **1520/1641 =92.63%**.
- All backend acceptance reproductions: **27 passed**.
- Ruff: **197 files already formatted**; explicit changed-backend `py_compile` passed with cache redirected by the approved wrapper.
- Logs: `backend-main-round2.log`, `backend-probes-main-round2.log` under the task's ignored test root.

### Adapter

```bash
PYTHONDONTWRITEBYTECODE=1 TMPDIR="$PWD/.pytest-tmp/mcp-agent-tools/tmp" XDG_CACHE_HOME="$PWD/.pytest-tmp/mcp-agent-tools/cache" COVERAGE_FILE="$PWD/.pytest-tmp/mcp-agent-tools/adapter-main-round2.coverage" BACKEND_PY=/home/decade/.venvs/crf-editor/bin/python agent_bridge/.venv/bin/python -m pytest agent_bridge/tests --cov=agent_bridge --cov-report=term-missing --cov-report=json:.pytest-tmp/mcp-agent-tools/adapter-main-round2.json --cov-fail-under=80 -q -o cache_dir=.pytest-tmp/mcp-agent-tools/cache/adapter-main-round2
PYTHONDONTWRITEBYTECODE=1 agent_bridge/.venv/bin/python -m pytest .pytest-tmp/mcp-agent-tools/test_main_adapter_review.py .pytest-tmp/mcp-agent-tools/test_main_manifest_boundaries.py -q --assert=plain --tb=short --show-capture=no -o cache_dir=.pytest-tmp/mcp-agent-tools/cache/adapter-probes-round2
agent_bridge/.venv/bin/python -m pip check
/home/decade/.venvs/crf-editor/bin/python -m ruff format --check --config backend/ruff.toml agent_bridge
```

- Permanent suite **43 passed**, including real SDK stdio subprocess flows. CLI coverage includes tests and is not the production claim.
- Main JSON production-only aggregate, excluding `/tests/`: **272/303 =89.77%**. Worker-reported counts differ; their attribution of differences to subprocess coverage was not independently established. This report uses main's actual command/JSON and makes no unproved causal claim.
- Acceptance probes: original9 pass; malformed-schema2 fail (B2 above).
- `pip check`: no broken requirements; Ruff: **11 files already formatted**.

### Frontend

From the worktree's `frontend/` directory:

```bash
npm test
npm run lint
npm run build
node_modules/.bin/vitest run --maxWorkers=1 --coverage.enabled --coverage.provider=v8 --coverage.include='src/**/*.js' --coverage.include='src/**/*.vue' --coverage.reporter=json-summary --coverage.reporter=text-summary --coverage.reportsDirectory='../.pytest-tmp/mcp-agent-tools/frontend-main-round2'
node_modules/.bin/vitest run tests/component/AgentAccessDialog.spec.js tests/component/ProjectInfoAgentAccess.spec.js --coverage.enabled --coverage.provider=v8 --coverage.include='src/components/AgentAccessDialog.vue' --coverage.include='src/composables/useAgentAccess.js' --coverage.reporter=json-summary --coverage.reporter=text-summary --coverage.reportsDirectory='../.pytest-tmp/mcp-agent-tools/frontend-new-main-round2' --coverage.thresholds.lines=80 --coverage.thresholds.branches=80 --coverage.thresholds.functions=80 --coverage.thresholds.statements=80
node_modules/.bin/vitest run --config ../.pytest-tmp/mcp-agent-tools/main-review-vitest.config.mjs
```

- `npm test`: **1072 node tests +231 component tests passed**, 20 component files.
- Lint: exit0, **0 errors /2818 warnings** (not warning-free). Build: passed,4.50s.
- Same-include serial all-source component coverage: statements4165/7986=52.15%, branches3037/6305=48.16%, functions1308/2392=54.68%, lines3708/6652=55.74%; every fraction exceeds the original same-process baseline. This excludes the separate node:test process and is not global frontend>=80%.
- New UI scoped aggregate: statements240/262=91.60%, branches171/198=86.36%, functions86/91=94.50%, lines223/237=94.09%; all four>=80%.
- A's two additional real Vue lifecycle reproductions passed.

### Real browser

Used only the approved disposable fixture server, built worktree frontend and an owned fresh Chrome profile/context. No systemd/8888/default DB or config was used. The driver reads disposable0600 handshakes/state inside its process without printing credential values.

```bash
bash /tmp/crf-mcp-browser-round2-backend.sh
bash /tmp/crf-mcp-browser-round2-chrome.sh
node .pytest-tmp/mcp-agent-tools/browser-round2-driver.mjs seed
node .pytest-tmp/mcp-agent-tools/browser-round2-driver.mjs apply-and-stale
```

- Real login controls and normal project-info entry worked. Owner UI rejected proposal2 and approved proposal1; pre-apply status correctly showed approved/not executed.
- Actual agent apply and duplicate same-ID replay succeeded; rejected apply409; persisted label readback succeeded.
- Real owner `/projects/{id}/profile` multipart update of `crf_version_date` changed the project fingerprint. Approval of the earlier proposal then returned409 with the friendly stale-baseline message and retained detail, without false success.
- After refresh, both list and detail correctly showed proposal1 as **已批准 / 已执行**, with approve/reject disabled. Main captured and viewed `browser-round2-applied-status.png`.
-390px light/dark still fail B1; basic Escape close and reopening worked, but off-screen pointer/focus reachability was not accepted. Credential issue/revoke/masking/keyboard close-reopen token clearing were exercised in main's first browser walk; they are not falsely claimed as a full second-walk rerun.
- Preserved console had the expected stale-request409 resource error; no additional warning/error was observed.
- Main stopped only its owned backend task `b9v8sa2c4` and Chrome task `bv39wwj5l` after evidence capture. Disposable state/profiles/screenshots/backups are retained, not deleted.

## Scope, pending work and provenance

- Plain `git status --short`, `git ls-files --modified --others --exclude-standard`, branch check, `git log 73e4dd559fda053bc7033568ff6308f84cc1bf50..HEAD`, `git diff --check` and protected-file `sha256sum` checks passed. Actual round2 production diffs were inspected. Branch remains `worktree-mcp-agent-tools`, with no post-base commits, staging, merge, push or deployment.
- A compound Git/hash inventory command and its still-complex standalone Python comparison were refused by the worktree isolation guard. No third repackaging/retry was performed. Plain commands explicitly requested by the guard succeeded; a complete automated before/after snapshot hash comparison is **not claimed**.
- Full54-file pre-round2 snapshot remains `/tmp/crf-mcp-agent-round2-7f09b614`. The only A-owned deliverable delta during B's round is the verified comment-only correction of requirements.lock to Python3.12.3; dependency entries are unchanged. Approved hash: `e262e0233702ceba2e0bd1cbe90835ea7d00ce598f49b8a697766d4a02aa535f`; other four protected hashes match preflight.
- The separate adapter syntax command `PYTHONPYCACHEPREFIX="$PWD/.pytest-tmp/mcp-agent-tools/pycache" agent_bridge/.venv/bin/python -m py_compile agent_bridge/__init__.py agent_bridge/config.py agent_bridge/client.py agent_bridge/server.py` was refused before execution because the worktree guard could not establish the startup behavior under that environment assignment. It is **not run**, not a Python syntax failure; no repackaging/bypass or cache-policy change was attempted. The43 permanent adapter tests actually ran and imported the production modules.
- Final task validator passed both8-entry context manifests; final plain Git whitespace/history checks passed.
- Independent read-only review: **not started**, because main acceptance still has blocking findings. No self-review is represented as independent review.
- Cross-stack spec§16 synchronization/task finish: **pending**, not claimed complete. No task archive/commit or code-history operation is authorized by an agent notification.
- Bandit: **not run**, unavailable and not installed. No external dependency audit/publication was performed. Earlier Context7 fetch failure is not a passing documentation lookup.
- Requested implementer selector: `sonnet`, planned full ID`claude-sonnet-5-5`; native worker self-reported this model but the host supplied no independently resolved identity or cost. Initial CLI supervisor done579 supplies last cumulative CLI estimate **USD14.76480540000001**, not total task cost/provider bill. Later interrupted CLI repair and native implementation costs remain unknown. Exactly **two acceptance repair rounds** have been used.

## Next authorized boundary

Stop implementation and ask for/await a genuine user decision: main takeover, one explicitly extended bounded native repair, or preserve/pause. Recommended future scope is only startup schema-format validation plus effective dialog sizing, associated permanent tests/docs and required revalidation. Do not silently start round3 or announce completion because the permanent suites pass.
