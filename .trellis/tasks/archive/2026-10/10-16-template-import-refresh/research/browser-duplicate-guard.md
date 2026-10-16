# Main-session browser review: duplicate unsaved-draft prompts

## Verified finding (MEDIUM; blocks R3/AC3 acceptance)

- Anchor: `frontend/src/components/FormDesignerTab.vue:3163-3169` (`selectFormById`), with `onFormsTableCurrentChange` at line 1769.
- Failure scenario: an existing selected form has a local new-field draft; the user completes a template import; App calls the existing ready bridge. `selectFormById` first calls `formsTableRef.setCurrentRow(target)`, which synchronously emits `current-change` and starts `selectForm(target)`, then explicitly calls `selectForm(target)` again. Both enter `confirmDiscardDraft` before selection commits.
- Real browser evidence: exactly **2 visible `.el-message-box` elements**, both titled `未保存草稿`. Closing the top confirmation once leaves **1** blocking confirmation, with the original form/draft still visible. A single canceled selection must not require dismissing two independent prompts.
- Source evidence and rendered evidence agree; this is not a screenshot-only guess. Existing tests only assert that confirm was called, not that it was called once, so their green status did not detect the duplicate.

## Browser verification environment

- Worktree's Vite server only: `http://127.0.0.1:5193/`, bound to loopback; existing port 8888 untouched.
- Task-created headless Chrome, unique isolated context `template-import-refresh-review`, page id 2. Real App + real designer and real Element Plus dialogs, not happy-dom.
- All `/api` requests intercepted in the isolated page and answered with synthetic fixtures; no real backend/config/database/credentials were used and no random or real credential was generated. A static UI-only invalid marker merely enabled mocked auth bootstrap.
- Sequence: choose synthetic project -> 表单 -> existing form -> 导入模板 -> select two synthetic templates -> confirm. The first imported form's title and field render immediately (positive path verified). Then reselect old form -> 设计表单 -> 新建字段 -> close designer (draft retained) -> import -> observe duplicate prompts -> close one -> one remains.
- Positive-path screenshot, actually read visually: `/tmp/crf-tir-browser-evidence.Xf5M3f/import-success-desktop.png` (1600×1000). Field/title/list assertions passed and fixture error list was empty before the duplicate-prompt case.

## Bounded correction requested

- Continue the same approved task, same Sonnet writer; no new feature or API scope.
- Add a RED assertion proving exactly one confirmation for one `selectFormById` / App-import selection and that one cancel fully ends the switch while retaining old selection + draft.
- Prefer a single selection authority: commit guarded selection once before synchronizing table highlight (or equivalently suppress a documented programmatic echo). Preserve existing real-row clicks and cancel/busy behavior. Do not remove dirty guards or suppress all table selection events.
- Only implementation file needed: `frontend/src/components/FormDesignerTab.vue`; extend `frontend/tests/component/TemplateImportSelection.spec.js`. Update task `verification.md` with RED/GREEN evidence; no other production files, dependencies, build scripts, or unrelated edits.
- Re-run relevant/full frontend suites, lint/build, actual diff. The main session will re-check the browser path and the final diff.

## Main-session checks already passed before this correction

- Backend full suite: `pytest --cov=src --cov=main --cov-report=term-missing:skip-covered -q` -> 1383 passed, 87% coverage. Log: `/tmp/crf-tir-main-backend.7IGpM8.log`.
- Frontend full suite: `npm test` -> 1007 node:test + 171 vitest passed. Log: `/tmp/crf-tir-main-frontend.RhC09q.log`.
- Full frontend `npm run lint` -> 0 errors, 2699 warnings; build passed. Log: `/tmp/crf-tir-main-lint-build.VakI5Y.log`. Do not describe this as zero warnings.
- Scoped ruff format check and `git diff --check` passed. Bandit is not installed (no dependencies added).
- Main branch advanced to `f777fec` in a parallel session, but there were no intervening changes to this task's touched production/test paths. Do not merge/rebase/commit; leave the original worktree isolated.

## Resolution

The original Sonnet session was resumed for one bounded correction. Exact-once confirmation assertions were RED (2 calls instead of 1), then GREEN after `selectFormById` was changed to finish the guarded selection before syncing table highlight. Main-session browser re-validation confirmed exactly 1 prompt, 0 prompts after one cancel with the original draft retained, and a successful one-prompt discard switch. This finding is **resolved**, not a remaining blocker. Final evidence and limitations are in task `verification.md`, section `Main-session acceptance`.
