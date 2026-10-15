# Implementation Handoff: Pending Codelist Option Confirmation

## Execution Boundary

This is a lightweight frontend task with no architecture or backend change. The requirements are authoritative in `prd.md`; this file supplies execution steps, not extra authorization.

- Planning worktree: `/home/decade/CRF-Editor/.claude/worktrees/codelist-pending-option-plan`
- Branch: `worktree-codelist-pending-option-plan`
- Task: `.trellis/tasks/10-14-codelist-pending-option-confirmation`
- Keep status `planning` during this session. Later execution is intended for Sonnet at the user's request; no implementer has been launched.
- In the future execution session, first confirm plan approval and the authorized write scope, inspect the actual worktree status, then run `task.py start` and load `trellis-before-dev`. Do not commit/push unless explicitly requested; task/spec/journal commits must be separate from project-code commits.

## File Scope

| File | Intended role |
| --- | --- |
| `frontend/src/components/CodelistQuickEditDialog.vue` | The sole business-code change: common final-confirmation gate and minimal operation/context guards. |
| `frontend/tests/component/CodelistQuickEditDialog.spec.js` | Extend existing real-component behavioral tests; use existing mount/input helpers. |
| `frontend/tests/fieldsTabCodelistQuickEdit.test.js` | Run host-wiring regression; change only if a legitimate contract assertion must follow the implementation. |
| `frontend/tests/editModeHiddenIdentifiers.test.js` | Run brief/full-mode regression; no speculative edits. |
| `README.md`, `README.en.md`, `frontend/.claude/CLAUDE.md`, `.claude/index.json` | During implementation, synchronously document the new user-visible behavior. Existing code/test inventory entries already exist; inspect the index and update only accurate affected metadata, without redundant file listings. |
| `.context/current/branches/<branch>/session.log` | Required decisions/root-cause notes only. |

Read the two hosts at the PRD's anchors, but do not duplicate the reminder in FieldsTab/FormDesignerTab or refactor either large component. Do not change CodelistsTab, `useApi`, backend endpoints, build/test configuration, or dependencies. If a durable spec change is needed at finish, keep it narrowly scoped and record it separately.

## Recommended Interaction and Flow

Suggested Chinese copy:

- Title: `未添加选项`
- Message: `有一项标签尚未点击“添加”，是否添加并保存？`
- Confirm: `添加并保存`
- Cancel: `返回编辑`

Use the existing Element Plus message-box mechanism and plain string content. No HTML-rendering option and no new custom dialog component are needed. Preserve the original footer button `确定`.

The common final-confirmation flow should be:

1. Reject re-entry if a reminder/save is already active; capture the current project, mode, codelist, and dialog-open session before awaiting.
2. Preserve current name/row validation and warnings. An invalid draft must never reach a write; avoid needless duplicated validators or normalizers.
3. If `optDecode.trim()` is empty, use the existing add/edit path without a reminder or extra option.
4. Otherwise await the pending-option reminder. Both message-box cancellation outcomes (`cancel` and `close`, including Escape) return normally with no mutation, reference request, write, callback, invalidation, or toast. Handle unexpected errors separately; do not disguise them as cancellation.
5. After acceptance, verify that the captured dialog session/target is still current. An expired decision is inert, including when the same target was closed and reopened. Reuse the existing reset lifecycle; add only the minimal local session marker needed, not an async framework.
6. Call the existing option-row addition logic once, so label trimming, free-form codes, the `C.<n>` fallback, append order, and input clearing stay identical to a manual `添加` click.
7. Continue through existing `confirmAdd()` / `confirmSave()`. The pending-option reminder must precede edit reference lookup/impact confirmation. Accepting it is not permission to bypass the existing impact warning.
8. Release the confirmation guard in a `finally` path, including cancel/dismiss, validation failure, expired context, and request failure. Preserve existing `saving` semantics: simply setting `saving = true` before calling the unchanged guarded save functions would make them return without saving. Use a minimal distinct entry/reminder guard or an explicitly coordinated gate instead.

Keep the guard active through the relevant operation and reflect it in the final-confirmation control. Do not permit a second pending-row append during a deferred reminder. If the user accepts the pending row but later cancels the reference-impact prompt, the row remains in the local option list, as if manually added; retry must not append it again.

## Ordered Checklist

### 1. Preconditions and baseline

- [ ] Obtain approval to implement; do not treat task creation as that approval.
- [ ] Reconcile `git status --short`, `git worktree list`, branch/HEAD, and this task's file inventory; do not overwrite another session's changes.
- [ ] Read curated JSONL context, `prd.md`, this handoff, and applicable project rules.
- [ ] Validate task context and run `task.py start` only after approval; then load `trellis-before-dev`.
- [ ] Check local frontend dependencies. A fresh worktree needs the locked existing dependencies before vitest; use `npm ci` only within the authorized execution scope, never add new packages implicitly.
- [ ] Run the existing targeted component test to record a green baseline.

### 2. RED — reproduce with tests first

Add behavior tests to the existing component spec and run them against unchanged code. At least the reminder/included-payload test must fail for the original omission, not an unrelated setup failure. Spy on `api` / `ElMessageBox.confirm`, not the component's own methods. Use deferred promises for races, not sleeps.

| Test group | Acceptance mapping |
| --- | --- |
| Edit screenshot fixture: existing `Y/是`, `N/否`, pending `C.3/其他`, no `添加` click; no request until reminder acceptance; snapshot contains the third row once | AC1, AC2 |
| Add mode plus hidden-code host style; pending label is submitted once, with trim and blank-code fallback behavior | AC2, AC9 |
| Empty label, whitespace-only label, default/edited code only; manual addition before final confirmation | AC3, AC4 |
| Pending reminder rejects with `cancel` or `close`; all inputs/list entries remain and all external effects are absent | AC5 |
| Existing invalid name/row warnings and edit reference-impact prompt still gate writes; impact cancel followed by retry | AC4, AC6 |
| Deferred reminder plus repeated confirm; exactly one message box/row/write; cancel then retry succeeds | AC7 |
| Deferred reminder plus changed project/mode/codelist or same-target close/reopen; old result is inert | AC8 |
| Existing request failure/cache/afterChange/close→toast and consumer-shape regressions | AC6, AC9 |

Where lifecycle behavior is involved, use a small real `v-model` test host and assert its open state, not only emitted events. Keep the global Vue-warning gate enabled. One test should verify one behavior; parameterize mode/configuration cases when that improves clarity.

### 3. GREEN — implement minimally

- [ ] Add the common gate in `CodelistQuickEditDialog.vue`; reuse row addition and both save paths.
- [ ] Keep the reminder's cancel/close handling outside the edit save's error-refresh branch.
- [ ] Add the minimal re-entry/context guard without duplicating the existing request lifecycle.
- [ ] Run the targeted tests after each incremental change; preserve all existing test expectations unless a test is demonstrably wrong.

### 4. Review, documentation, and verification

- [ ] Inspect the actual diff for scope, duplicate normalization, cancellation side effects, request targets, and guard release. Self-review is not independent review; report whether an independent review was performed.
- [ ] Check plain-text reminder rendering, no secrets/token/data logging, and no permission/API changes.
- [ ] Update the user-facing/module/index documentation in the table above during implementation, not during this planning-only session.
- [ ] Run targeted regressions, complete frontend suites, lint, build, and whitespace checks below.
- [ ] Run the real-browser acceptance walk if an authorized local app is available; otherwise report the blocker and exact not-run scope.
- [ ] Report run / failed / not-run / environment-blocked checks separately. Do not claim implementation complete if required checks fail.

## Future Execution Commands — Not Run in Planning

Run frontend commands from this worktree's `frontend/` directory. Every new shell call should explicitly select the intended worktree directory when the environment resets its cwd.

```bash
# From the worktree root, only after plan review and implementation approval:
python3 .trellis/scripts/task.py validate .trellis/tasks/10-14-codelist-pending-option-confirmation
python3 .trellis/scripts/task.py start .trellis/tasks/10-14-codelist-pending-option-confirmation

# From the worktree's frontend/ directory:
npm run test:component -- tests/component/CodelistQuickEditDialog.spec.js
node --test tests/fieldsTabCodelistQuickEdit.test.js tests/editModeHiddenIdentifiers.test.js
npm test
npm run lint
npm run build

# From the worktree root, after implementation:
git diff --check
git diff -- frontend/src/components/CodelistQuickEditDialog.vue frontend/tests/component/CodelistQuickEditDialog.spec.js
```

Coverage must not decrease and the target is at least 80%. `frontend/package.json:22` and `frontend/vitest.config.js:8` currently expose no installed/configured vitest coverage provider or threshold. Record a baseline/current measurement if existing authorized tooling can supply it; if a new provider/dependency is necessary, ask for approval rather than changing the toolchain silently. Passing tests are not proof of measured coverage.

There is no existing browser-level E2E command in the inspected project context. Do not add a runner or fabricate an E2E result. For browser validation, use only an authorized local/test app and non-private fixture data; settle any login/credential requirements explicitly, never generate or read credentials or use production data without authorization.

## Browser Acceptance Walk

1. Open a codelist through the field-library or designer entry; use the two-option screenshot fixture and enter `其他` in the add row without clicking `添加`.
2. Click `确定`; verify the reminder is visible above the original dialog, focused/keyboard-operable, and that no save occurred.
3. Choose `返回编辑`, then repeat using the close icon / Escape; verify content and dialog remain. Repeat, choose `添加并保存`, and verify the saved third option appears exactly once after refresh.
4. Repeat the essential path in add mode and the other host, including a hidden-code configuration and an edit with the existing reference-impact warning. Spot-check both themes; no layout redesign is expected.
5. Record the actual evidence and blockers. Happy-dom mount tests alone are not live-browser/layout verification.

## Rollback and Finish Boundary

A rollback is limited to the task's approved component/tests/documentation diff; no database migration exists. Do not use destructive Git commands or delete artifacts to hide a failure. Request confirmation for irreversible cleanup and retain the isolated worktree until the later execution/commit/merge process is authorized. This planning session must leave all application files unchanged.
