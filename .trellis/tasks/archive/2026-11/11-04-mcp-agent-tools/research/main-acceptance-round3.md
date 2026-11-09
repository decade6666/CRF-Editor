# Main Acceptance — C12 Extra Repair (Third Total)

Date: 2026-11-06. Main-run evidence, not a transcription of the implementer's completion claim. Both previously known source blockers were resolved, but the subsequent independent review **failed**; final acceptance remains false. See `independent-review-verification.md` for the new statically verified findings and not-run probes. No fourth repair, commit, merge, push, deployment or task archive is authorized.

## Scope and Provenance

- C12 authorizes exactly one extra narrow round after the original two-round limit. Fresh native implementer requested selector `sonnet`; the host does not independently supply its resolved model or cost. The previous native writer was unreachable; no claim of same-context resumption.
- Main inspected the actual nine-file repair diff against `/tmp/crf-mcp-agent-round3-7f09b614/files`.
- Four permitted plain `cmp -s` groups verified all45 other deliverables byte-identical to that backup (17 backend production,9 backend tests,11 adapter,8 context/frontend files). This scope check succeeded; earlier complex hash-comparison refusals remain historical, not a current unverified scope claim.
- Protected preparation dependency hashes are unchanged; the requirements.lock Python3.12.3 header correction had already been separately recorded before this round. No install/upgrade occurred in this repair.
- Base/HEAD remains `73e4dd559fda053bc7033568ff6308f84cc1bf50`; no new commit. All original backups and ignored test evidence remain retained.

## Resolved Blockers

1. `agent_bridge/server.py`: both input/output manifest schemas now pass built-in `Draft202012Validator.check_schema` before registration, in addition to exact unique tool names and local-resolvable references. Permanent tests cover six malformed shapes in both positions plus safe diagnostics. A format-valid recursive schema preserves the separate runtime-error/redaction regression.
2. `AgentAccessDialog.vue`: responsive sizing is passed through Element Plus's width prop as `min(860px, calc(100vw - 24px))`; removed the unmatched scoped descendant rule. Permanent source/mount regressions assert the actual dialog's inline width-variable linkage, not simulated browser geometry.

## Commands Actually Run by Main

All commands ran in this worktree, with task-local temp/cache/coverage outputs and disposable data. Backend wrapper clears child proxy variables, disables background jobs/bytecode, and uses the existing backend venv. Full command variants and acceptance boundaries remain in implement.md §4.

| Command / check | Result | Evidence under `.pytest-tmp/mcp-agent-tools/` |
|---|---|---|
| `bash /tmp/crf-mcp-agent-backend-checks.sh pytest --cov=src --cov=main --cov-report=term-missing:skip-covered --cov-report=json:../.pytest-tmp/mcp-agent-tools/backend-main-round3.json --cov-fail-under=80 -q` | 1621 passed;1263 warnings;97.78s | `backend-main-round3.log/json` |
| Backend A-owned acceptance probes | 27 passed | `backend-probes-main-round3.log` |
| `bash /tmp/crf-mcp-agent-backend-checks.sh ruff format --check .` | 197 files already formatted | Main command result |
| `BACKEND_PY=/home/decade/.venvs/crf-editor/bin/python agent_bridge/.venv/bin/python -m pytest agent_bridge/tests --cov=agent_bridge --cov-report=term-missing --cov-report=json:.pytest-tmp/mcp-agent-tools/adapter-main-round3.json --cov-fail-under=80 -q` with task-local runtime env/cache flags | 57 passed, including real SDK stdio subprocess E2E | `adapter-main-round3.log/json` |
| Adapter A-owned original3 + manifest8 probes | 11 passed | `adapter-probes-main-round3.log` |
| `agent_bridge/.venv/bin/python -m pip check` | Passed | Main command result |
| `/home/decade/.venvs/crf-editor/bin/python -m ruff format --check --config backend/ruff.toml agent_bridge` | 11 files already formatted | Main command result |
| `npm test` from `frontend/` | 1072 node:test +232 Vitest passed,20 component files | `frontend-main-round3.log` |
| `npm run lint` from `frontend/` | Exit0;0 errors /2819 warnings, not warning-free | `frontend-lint-main-round3.log` |
| `npm run build` from `frontend/` | Passed;4.26s | `frontend-build-main-round3.log` |
| Installed Vitest, all-source coverage with `--maxWorkers=1` and unchanged `src/**/*.js` / `src/**/*.vue` includes (implement.md §4) | Passed; all four exact fractions exceed the original same-scope baseline | `frontend-coverage-main-round3.log` |
| Installed Vitest scoped AgentAccessDialog/useAgentAccess coverage with all four80% thresholds | 25 tests passed; all four thresholds passed | `frontend-new-coverage-main-round3.log` |
| A-owned lifecycle checks using `main-review-vitest.config.mjs` | 2 passed | `frontend-probes-main-round3.log` |

The adapter invocation also set `PYTHONDONTWRITEBYTECODE=1`, task-local `TMPDIR`/`XDG_CACHE_HOME`/`COVERAGE_FILE`, and `-o cache_dir=.pytest-tmp/mcp-agent-tools/cache/adapter-main-round3`. No default config, live DB or real credentials were used.

## Coverage — Exact Scope

- Backend total: **9983/11331 =88.10%**, above baseline8401/9623; new agent production **1520/1641 =92.63%**.
- Adapter production (exclude tests/helper code from aggregate): **280/311 =90.03%**. CLI94.34% includes test code and is not the production figure.
- Frontend same all-source component-process coverage (does not combine the separate node:test process):

| Metric | Original baseline | Final |
|---|---|---|
| Statements | 3920/7719 | 4166/7987 |
| Branches | 2861/6102 | 3037/6305 |
| Functions | 1219/2298 | 1308/2392 |
| Lines | 3480/6410 | 3709/6653 |

- New UI statement/branch/function/line coverage: **241/263**, **171/198**, **86/91**, **224/238**, respectively. All exceed80%; the entire legacy frontend was already below80% and must not be described as globally meeting80% now.

## Actual Disposable Browser Acceptance

- Real LoginView inputs/form submission reached the regular-user workbench; opened Agent access through Project info.
- Mobile390×844 light: actual dialog366px, left12/right378, close330..378; inline width variable is the expected responsive expression. One-time read credential issuance was masked; clicking the visible close control cleared the token panel. Reopening did not restore it; keyboard focus returned/entered correctly.
- Tables use bounded internal scrolling. The narrow credential table scrolled to its visible revoke control; actual UI revoke succeeded and disabled the action. Change-table scrolling exposed actual approve/reject controls; this is not proof of a physical touch-drag gesture.
- Initial test proposals expired during the long UI walk. The driver first failed apply, then safe status/code diagnostics confirmed **410 PROPOSAL_EXPIRED**. No TTL/product-source change or automatic mutation retry. Explicitly created fresh disposable previews with new stable identities; UI rejected one and approved the other.
- Agent apply, same-change replay/original fingerprint, persisted readback and rejected-apply409 all passed. A real owner multipart profile update changed `crf_version_date` and the project fingerprint; stale UI approval returned409 with a friendly reason and preserved proposal detail.
- Applied proposal list/detail showed approved + executed, with decision actions disabled. Long digest wrapped within the detail width with no horizontal overflow.
- Real theme toggle: mobile dark also366px with close inside viewport and no restored token panel. Desktop1280×900 retained860px dialog width.
- Browser console contained only the expected stale-approval409 messages; no other warning/error observed. Main captured **and visually read** `browser-round3-mobile-light.png` / `browser-round3-mobile-dark.png`. The light capture was vertically scrolled; it is not evidence of a top-header horizontal defect.
- Main stopped both owned temporary backend/browser controllers. Sensitive disposable state remains in0600 files and was not printed; keep all profiles/screenshots/logs/backups without unapproved deletion.

## Documentation Increment and Remaining Gate

Main-only follow-up is limited to canonical cross-stack §16 / quick reference, root HTTPS/explicit-loopback pointer accuracy and missing agent dependency/adapter inventory. Preserve old scan timestamp/statistics: this is a task-scoped index update, not a new full-repository scan. The root's explicit canonical-contract location takes precedence over the generic Skill placement suggestion; include the Skill's seven executable-contract sections without a duplicate fixture/layer file.

Independent review **subsequently returned FAIL**. Main verified the67-file snapshot and confirmed six blocking code-contract findings statically (including the foreign-linked instance update elevated under explicit isolation acceptance). Final disposition and limitations: [Independent review verification](independent-review-verification.md). The13 new runtime follow-up cases were prepared but guard-blocked before execution; no new passing/failing test count is claimed. Main acceptance stays false. No automatic fourth round or inline source takeover.

Documentation verification subsequently passed: JSON parsing; all14 adapter inventory paths and the new agent-dependency path are regular existing files; exactly one §16 with all seven required sections and its quick-reference row; root context26448 characters (below40,000); `git diff --check`; actual three-file documentation diff review. The canonical contract adds111 lines without removing/reworking earlier contracts. No code tests were rerun for this final documentation-only increment. A combined Python/Git baseline-statistics comparison was refused by the isolation guard and not repackaged; permitted plain `git diff -- .claude/index.json` confirms no timestamp/scan_summary hunk, alongside the previously read values. Do not label the refused automated comparison as passed.

## Not Run / Environment Limitations

- Bandit is unavailable; not installed. Manual security review and targeted isolation/concurrency/rollback regressions ran, not a claimed Bandit pass.
- A standalone adapter py_compile command was guard-blocked; not bypassed. Adapter tests imported/executed the actual modules successfully; backend syntax validation used the approved wrapper.
- Context7 retrieval had failed earlier; SDK-specific conclusions were checked against the pinned installed SDK and real stdio E2E, not fabricated documentation results.
- No production/remote HTTPS deployment, systemd8888 operation, cross-host network run, commit/merge/push or archive. Local disposable HTTP loopback acceptance is not remote deployment verification.
- Latest completed old CLI estimate remains14.76480540000001USD, cumulative for that worker session only; interrupted/native costs and independently resolved native model are unavailable. It is neither total task cost nor provider billing.
