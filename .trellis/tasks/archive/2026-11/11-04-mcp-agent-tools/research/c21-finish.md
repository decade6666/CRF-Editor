# C21 — Authorized Formatter Alignment and Git Finish

Date: 2026-11-09. Owner: main session. This record continues the existing task; it is not a new implementation or repair round.

## Authority and Boundaries

The user said `完成测试，收尾` and formally selected `完整 Git 收尾（推荐）` after reviewing the five-batch plan. This authorizes the listed work commits, this task's archive and journal, local main integration and normal origin/main push, stopping only the isolated 5174 process, and removal of only this task's merged worktree/branch. Retain all task-scoped `/tmp` acceptance data, credentials and backups. Do not build, deploy or restart 8888/systemd; do not access real configuration, databases or uploads. Do not touch other tasks/worktrees or remove Windows port-forward rules.

The real hook-style Ruff check then exposed a configuration-discovery mismatch: the adapter's prior checks explicitly used `backend/ruff.toml`, but the hook invokes `ruff format --check -- <file>` and discovers no adapter config, so its default width required reformatting nine of the ten explicitly listed Python files. No source, index, hook or Git history was changed at that failure. The user formally selected `继承既有格式规则（推荐）`.

That supplemental authorization is exactly:

- Add `agent_bridge/ruff.toml` with `extend = "../backend/ruff.toml"`.
- Add that exact path to the existing `.claude/index.json` inventory, preserving historical scan metadata.
- Update this task's authority/verification/finish records and the branch decision log.
- No Python/business/test rewrites, hook/wrapper changes, dependency expansion, threshold change or edits to the existing backend formatter policy. The alternative of reformatting nine files to default 88 columns was not selected.

## Execution Board

| State | Step |
| --- | --- |
| Done | Reconcile all 82 original candidate hashes, exact dirty-path set, empty index, branch and main state before the supplemental write |
| Done | Add the one-line adapter formatter config; real hook-style check reports ten files already formatted, directory check reports eleven |
| Done | Receive the existing independent bounded final review (PASS, no blockers, two LOW follow-ups); verify original82 hashes/index unchanged, then synchronize inventory and finish records |
| Historical C21 blocker | Product `6eefea6` and spec `4964fa6` committed with all real gates passed. The verbatim decision archive's original trailing blank lines failed staged whitespace checking; no original byte was trimmed and no gate overridden |
| Done — C22 | Original62337-byte prefix/hash and all seven trailing LF bytes verified intact against the raw backup; exact external suffix reviewed. Refreshed staged whitespace/redacted scan and real hook passed; third work commit `19905d2` created |
| Task moved; bookkeeping commit/journal/integration next | Only this task was archived with the supported `--no-commit` mode to preserve the approved Chinese commit grouping; status completed2026-11-09, exact23 files verified. Commit archive, then journal, main integration and normal push follow |
| Pending | Recheck the isolated service identity, stop only 5174, remove only the merged task worktree/branch, verify retained evidence and unaffected worktrees |

## Verification Already Run

- Original 82-file snapshot: SHA-256, regular single-link identity and exact candidate inventory all match `/tmp/crf-mcp-finish-20261109-mWm381/pre-review-files.json`; index empty and task HEAD unchanged.
- Redacted gitleaks scan of the frozen 82-candidate copies: exit 0, no findings. Final additions still need the final scan.
- Adapter suite rerun for finish: `agent_bridge/.venv/bin/python -m pytest agent_bridge/tests --cov=agent_bridge --cov-report=term-missing:skip-covered --cov-report=json:<finish>/reports/adapter-final.json --cov-fail-under=80 -q --tb=short --show-capture=no`, with the existing isolated environment and `BACKEND_PY`: 62 passed, zero skipped, 7.52s. Production modules remain 289/318 = 90.880503%; the CLI's wider test-inclusive total is not the production metric.
- Real default-config command over the ten approved adapter Python paths: initially failed (nine needed reformatting), then passed after the authorized one-line inheritance config: ten files already formatted. No formatter write was run.
- `/home/decade/.venvs/crf-editor/bin/ruff format --check agent_bridge`: eleven files already formatted.
- `git diff --check`: passed.
- Archive destination `.trellis/tasks/archive/2026-11/11-04-mcp-agent-tools` is absent; task children are empty and branch metadata matches this worktree. Current task remains in_progress at this point.
- Current main is clean at `8fb18e9`; task HEAD and observed remote main are `73e4dd5`. Recheck immediately before integration/push.

`<finish>` is `/tmp/crf-mcp-finish-20261109-mWm381`. Its retained-evidence directory contains 96 selected report/probe/screenshot files (16,595,356 bytes) with a SHA-256 manifest; credential-bearing runtime files and nested test databases were not copied into that evidence set. The separate isolated acceptance root and C20 backups are retained intact.

## Existing Product Verification and Limitations

C20's real tests and app evidence remain recorded in `c20-decimal-default.md`: backend 1658 passed (10059/11390 = 88.314311%), agent scope 1566/1682 = 93.103448%, frontend node:test 1078 passed plus component 232 passed; renderer line/function coverage unchanged and branch coverage increased. Backend Ruff, frontend lint (zero errors / 2819 existing warnings), isolated external-output build, actual desktop browser preview, real aCRF export and Windows HTTP checks passed. The only supplemental product change in C21 is formatter discovery; no Python, frontend, test or API bytes change.

Bandit was attempted and unavailable (`No module named bandit`), not silently passed or installed. No new PDF/Word GUI comparison or remote-device browser walk is claimed. No main-checkout frontend live build, 8888 smoke/restart or production deployment is authorized. Deferred F7–F10/F13 and N1–N3 remain follow-ups; review alone authorizes no fixes.

## Independent Review and Final Outcomes

The single existing fresh read-only reviewer `finish-final-review` completed the bounded C18–C20 delta and the supplemental one-line C21 config: **PASS, no must-fix finding**. It verified the inheritance target and the absence of local policy overrides. Review was static only; no runtime/coverage/browser/security runner or private data was accessed. Resolved model/cost is unavailable because no verified runtime receipt was supplied.

Main checked the two reported LOW follow-ups against their exact source/document regions; no additional runtime reproduction or source fix was performed:

1. `agent_bridge/client.py:182` catches all `httpx.TimeoutException` subtypes, so eligible mutations can trigger one fixed lookup after ConnectTimeout/PoolTimeout too, despite `agent_bridge/README.md:49-57` describing response-timeout recovery and no query on connection failures. This can conservatively produce UNKNOWN_OUTCOME after an unnecessary query; it never repeats the mutation. Optional follow-up: align exception classification/documentation and add subtype/query-count regressions.
2. `agent_bridge/tests/test_stdio_e2e.py:54-88` starts its finalizer only after setup/readiness. A setup/handshake failure can retain disposable test state. Optional follow-up: put setup and yield under the finalizer and exercise an injected readiness failure. The actual successful finish rerun left no owned crf-agent-e2e roots; this does not prove every failure path cleans up.

Snapshot reconciliation after the final report: all 82 original regular single-link files retained their exact SHA-256, task HEAD was unchanged, index was empty, and the only two additions were the authorized config and this report. Only after that check did main update the authorized index/task/decision records. No Python, frontend, test, spec or user-document bytes changed in C21. Historical F7–F10/F13 and N1–N3 remain deferred as well.

At the C21 checkpoint the finish stopped at the archive-whitespace blocker. C22 below records the user's later bounded authorization; subsequent operations are reported only after actual execution.

## C22 — User-authorized Boundary and Finish Continuation

After the precise blocker report and recommendation to append an explicit archive-end marker without deleting the original text, the user replied `继续`. This newly authorizes only that boundary and existing finish records; all original full-finish scope and prohibitions remain unchanged.

- The original archive payload is exactly 62,337 UTF-8 bytes / 62,096 Unicode characters, including seven trailing LF bytes, SHA-256 `0ac5d882230d79280678d8adb1de0b4b1d237e49d77c21193a2f1f8e8e4b6af7`.
- The new provenance/end marker is appended after those bytes, outside the historical payload. Validate the prefix against the preserved raw candidate backup, not against a rewritten or normalized reconstruction. The whole container's hash now differs; C20/C21's earlier byte-identical-whole-file checks remain historical facts from before the authorized C22 suffix.
- No product, tests, spec, dependency, formatter/hook/whitespace policy or production state is modified. No new business test is required for this documentation-only boundary; validation is exact bytes/hash, actual diff, JSON/record checks, redacted staged scan and the unmodified real hook.
- Exact prefix verification passed against `<finish>/scan-candidates/.context/history/archives/mcp-agent-tools-session-pre-c20-20261109.md`; the original62337 bytes and seven LF bytes remain unchanged. Whole-container SHA-256 is now `2869d3c875d2b9ddbf69f1c896238b95e3073c7dc7b14c03c048b2426e045c5d`, explicitly distinct from the payload hash.
- Actual diff against the original raw log adds only the three-line external provenance/end marker. `git diff --cached --check` and the redacted staged gitleaks scan passed after refreshing that single staged path. The original real commit hook completed without bypass.
- Third work commit: `19905d271ddd3335b270fb844cc60e112921e9c1` — `docs(context): 归档MCP开发决策记录`. All three work batches are now committed in approved order; no Co-Authored-By or history rewrite.
- `get_context.py --mode record` and the wrap-up sanity check ran after these commits: only the23 owned active-task files remain, no tracked source/spec delta and empty index. The unrelated standard-reference task is planning, not completed; it is untouched and not archived. Current task remains in_progress before its actual archive call.
- Existing C20 report receives only a later finish-handoff postscript: preserve its complete earlier text as a byte prefix, distinguish the historical self-review checkpoint from the later independent static PASS, and point to this current finish record. This necessary record update also makes its original terminal blank line internal; no historical report text is removed.
- Main integration/push/service stop/task-only cleanup are not yet represented as executed. Their actual post-archive outcomes will be retained under `<finish>` and in the final user report; the journal records the integration/cleanup handoff rather than claiming those later actions already happened.
- Actual archive: `python3 ./.trellis/scripts/task.py archive .trellis/tasks/11-04-mcp-agent-tools --no-commit` moved only this task to `.trellis/tasks/archive/2026-11/11-04-mcp-agent-tools`, set completed2026-11-09, and cleared this task's session pointer. No branch-validation skip or automatic English commit was used.
- A main-owned preflight helper first failed an overly strict assertion that task.json must end with LF (not a Git whitespace requirement). An erroneously separate shell line still ran the already-authorized archive command; its move succeeded, but the intended pre-move backup portion did not run. No source/data was lost or reverted. Main then isolated the actual state and verified all23 archived regular single-link files, completed status/date, exact inventory, JSON/JSONL and real trailing-whitespace conditions; all pass. The task/decision backup is therefore taken from the verified archived state before committing, not misreported as a pre-move snapshot. Future dependent operations use explicit short-circuiting or checked subprocess calls.
- No code tests were rerun for C22's record-only edits; byte-prefix/size, links/JSON, actual diff, redacted staged scan and real commit gates are the applicable verification. Existing final product/runtime coverage and the independent static review remain scoped exactly as above.

### Historical C21 Git Results and Blocker (before C22 authorization)

- Final exact inventory: product59 / spec1 / decision_archive1 / task_archive23; no unrecognized file or pre-existing staging. C21 changed only the four authorized original index/task record paths; all Python/frontend/test/spec/user-doc bytes matched the frozen reviewed candidates.
- Final redacted offline candidate scan: exit 0, no findings. Product and spec staged redacted scans: exit 0. The product and spec actual commit hooks both completed, with Ruff present (not skipped), and no bypass or attribution footer.
- `6eefea69140b97a8f03165f80ae668d712c33b44` — `feat(mcp): 新增受控表单编辑工具与属主审批` (59 files).
- `4964fa62c3986c8694cac0a0343062741f8a0685` — `docs(spec): 同步受控编辑与数值显示契约` (one spec file).
- Third batch staged exactly `.context/history/archives/mcp-agent-tools-session-pre-c20-20261109.md`. Its original SHA-256 remains `0ac5d882230d79280678d8adb1de0b4b1d237e49d77c21193a2f1f8e8e4b6af7`; it has seven trailing LF bytes.
- `git diff --cached --check` then exited 2: `.context/history/archives/mcp-agent-tools-session-pre-c20-20261109.md:229: new blank line at EOF.` The subsequent gitleaks/commit chain short-circuited, so there is no third commit or failed commit-hook attempt.
- Earlier plain `git diff --check` did not cover that then-untracked file; the staged check correctly exposed the blocker. Preserve both facts rather than claiming all final gates passed.
- Do not silently trim a byte-preserved historical payload or weaken `core.whitespace`/the hook. No automatic repair is authorized after this new blocker. A possible follow-up is a clearly delimited provenance/end marker after the intact original byte prefix, with exact prefix-hash verification and honest documentation of the archive-container change; this has not been applied.
- Task remains in_progress, original archive remains staged, all 23 task files remain untracked at their active path, and main remains clean at `8fb18e9`. No Trellis archive/journal, merge, push, 5174 stop, worktree/branch removal, real-data access or 8888 action occurred. All `/tmp` acceptance roots/backups/evidence remain retained.

Retained logs: `<finish>/reports/commit-product.log`, `commit-spec.log`, `gitleaks-final.json`, `gitleaks-final.log`, `gitleaks-staged-product.json` and the corresponding staged-scan logs. The failure diagnostic above was returned directly by the staged whitespace command. No extra code tests were run for this record-only blocker analysis.
