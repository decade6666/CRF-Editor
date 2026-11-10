# A Review — Before Fix Round 1

## Independently Run Verification

Base remains `04df78169fcc1ae2e60a1e0c8dc81a3ab07a6668`; no task commits. A ran the approved commands through its own wrappers, not B's transcript/tool stream:

| Check | A result |
| --- | --- |
| Focused backend import/config/permission/temp/streaming/threadpool/rate/type-policy/phase0/width/parity/import suites | 394 passed (`a-backend-focused.log`) |
| Retained weekly-release three-file regression | 167 passed (`a-release-regression.log`) |
| Full backend coverage suite | 1648 passed; 9670/10870 = 88.9604415823367% (report shows 89%), above 88.31431079894645% baseline (`a-backend-full.log`, `a-backend-coverage.json`) |
| `ruff format --check .` | 194 files already formatted (`a-backend-format.log`) |
| Focused frontend source contracts | 134 passed (`a-frontend-focused-node.log`) |
| Five focused real component suites | 145 passed (`a-frontend-focused-component.log`) |
| Frontend `npm test` | 1075 node tests + 373 component tests / 25 files passed (`a-frontend-full.log`) |
| Serial full component coverage | 373 passed; overall lines/statements 68.32/64.03 vs 67.38/63.14 baseline; App 98.63/97.38 below strict 98.70/97.52 baseline (`a-frontend-coverage/`) |
| Frontend lint/build | 0 lint errors / 2803 warnings (baseline 2814); build passed 4.39s (`a-frontend-lint.log`, `a-frontend-build.log`) |
| Static Python security scanner availability | Environment-blocked: `/home/decade/.venvs/crf-editor/bin/python -m bandit --version` reported `No module named bandit`; no package installed. Manual scoped security pass and real permission/input/isolation tests were performed; do not imply a Bandit pass. |

Only A's output files in `/tmp/crf-remove-ai-review.VVZ78F/` are independent evidence above. B's RED summary (backend10, frontend source3/component5 failures before implementation) is reported as B evidence; A did not independently recreate pre-change RED.

## Actual Diff and Security Pass

A inspected source/config diffs, new comparison mount suite, mixed backend/frontend test changes, active README/module/index diffs, signature call sites and scoped retained import/export/renderer/width boundaries. No task history change; 33 B paths plus progress, with the separately reported/moved two helper scripts accounted for. Staged five deletions are recoverable from the original tar; do not discard unrelated state.

Verified on surviving flow: admin/template path guards, ownership and temp non-disclosure/cleanup, no outbound review path, no runtime AI config, inert raw YAML preservation, fixed 422 before import/settings writes with no submitted sentinel echo, deterministic field/log-row/choice persistence, shared escaped renderer/planner and newest settings/Agent contracts. No Critical security issue was found by this pass; it is A self-review, not independent fable review.

## Verified Blocking Findings Sent to Same B

1. App.vue percentage gate not met. The raw uncovered statement ranges are 141–143,379,515–516,626,635,640,642,644,720,790,792; unchanged uncovered count is not a user-approved waiver. Add meaningful retained-handler/guard tests within allowed AppSettingsBehavior; no unrelated dead-code removal/coverage exclusions.
2. Root `.claude/CLAUDE.md:56` still claims AI configuration testing; new comparison spec absent from authoritative `.claude/index.json`; frontend module notes incorrectly deny the wizard's surviving upward events.
3. Include non-blocking new-function type annotation omissions in this blocking round (validators and new helper only).

Fix round **1 of 2** sent via SendMessage to original `remove-ai-review-implement`. Snapshot before fixes includes new/untracked comparison spec: `before-fix-round1.tar`, `.patch`, `-status.txt`; full findings at `fix-round1-findings.txt`. No replacement or concurrent source writer.

## Live Browser Acceptance — Pre-Fix Source

A ran a real isolated backend at loopback port 8907 using only synthetic DB/config/uploads and formally approved one-time credentials. Config/path overrides happened before importing app; no production file/8888 access. Headless shell on task-owned port 9222; private CDP login script filled actual LoginView inputs/submit without printing secrets. Other actions used chrome-devtools MCP, with DOM `.click()` fallback when the a11y checkbox tool could not interact; no Vue state or application function was patched to fake results.

- Admin login -> settings: actual sections `账号 / 界面 / 全局设置`, template input and Close/Save, no AI card/key/test. Screenshot `browser-admin-settings.png` captured and read/visually inspected.
- Logout -> synthetic regular login -> select synthetic project -> settings: latest cards/boolean preferences and enabled Agent entry retained. No credential issuance was performed.
- Actual Word file input upload of synthetic DOCX (two required scaffold tables, three sample fields) -> select -> open real compare: screenshot/effect panels visible, original image complete with nonzero natural width, labels `受试者描述 / 收缩压 / 是否吸烟`, no AI controls. Screenshot `browser-word-compare.png` captured and visually inspected. Actual LibreOffice was available and produced an image; no renderer block for this flow.
- Click field -> close compare -> confirm import: one form / three fields imported -> click `打开设计页`: form tab and canvas show selected imported form/three fields. Synthetic fixture was labeled `未命名表单_2` by current parser (heading naming is not this task's requirement).
- Sanitized request-name/key instrumentation (no headers/credentials/values read) found one preview upload, one POST execute with exactly `form_indices,temp_id`, three screenshot requests and **zero AI status/connection-test requests**. Console error/warn list empty.
- Close settings via actual header × confirmed hidden. No claim of full narrow/dark/keyboard UX audit; this was the changed critical flow.
- Closed only task page 2, checked exact process identities 272515 (temporary launcher) and 272607 (task profile headless shell), then sent SIGTERM to those PIDs under the granted task-process lifecycle authorization. No broad port/pkill or peer process operation; scratch audit/screenshots retained.

## A-Owned Spec Sync

Only approved three paths changed: cross-stack §4/§8 retires AI-only requirements and records the seven-part deterministic/stale-input contract; frontend settings-cards phrase now template-only; backend obsolete `ai_config.py` diagram entry removed. Existing screenshot ownership/expiry/streaming/draining, deterministic multiselect and latest Agent/settings contracts preserved. Actual spec diff reviewed for unrelated edits; `git diff --check` passed. Recheck after B returns.

## Remaining Gates

- Receive B round-1 completion, inspect delta vs snapshot and rerun relevant/full verification + coverage thresholds. Escalate rather than silently waive if coverage cannot be met.
- Fresh read-only fable review after A has no blockers; snapshot/unchanged audit mandatory. No commit/merge/push/deployment authorization.
