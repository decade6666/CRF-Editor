# Execution handoff: codelist-impact-multiform

## Authorization and Workspace

- Current task status: `planning`; the user requested a plan only. Do not implement until they approve or explicitly request execution in the follow-up session.
- Worktree: `/home/decade/CRF-Editor/.claude/worktrees/codelist-impact-multiform-plan`.
- Branch: `plan/codelist-impact-multiform`; source baseline: `e2f19b4`.
- Read `implement.jsonl`/`check.jsonl` context, then `prd.md`, `design.md`, and this file. Follow `trellis-before-dev` before coding.
- Recheck `git status`, `git worktree list`, and main's latest commit before resuming: parallel sessions may advance main. Do not overwrite unrelated work or automatically rebase/merge. Planning artifacts are uncommitted unless the user separately authorizes a commit.
- **Shared-file execution prerequisite:** `10-14-codelist-pending-option-confirmation` is currently being implemented in the same component/spec by `crf-editor-40`. Wait for that code to be integrated into main and exclusive file ownership to end. Safely synchronize/review the latest baseline before activation; preserve this task's uncommitted artifacts. Do not implement against the old files concurrently or overwrite the pending-option work.
- Once execution is authorized, that prerequisite is satisfied, and the artifacts have been reviewed, activate this existing task (do not create a duplicate):

```bash
cd /home/decade/CRF-Editor/.claude/worktrees/codelist-impact-multiform-plan && python3 ./.trellis/scripts/task.py start .trellis/tasks/10-15-codelist-impact-multiform
```

## Ordered Work Board

- [ ] **Preflight:** confirm the source anchors still match, inspect this worktree's current diff, and load the relevant project/frontend specs. If `frontend/node_modules` is absent, install the existing lockfile dependencies with `npm ci`; do not change package versions or add coverage tooling.
- [ ] **RED:** extend `frontend/tests/component/CodelistQuickEditDialog.spec.js` with zero-reference, one-reference, and repeated-reference/same-form no-warning cases. Run the focused component command and record that the non-empty single-form cases fail with the old `if (refs.length)` implementation.
- [ ] **Keep positive protection:** change the existing save-success and warning-cancellation fixtures to two distinct forms. Add same-name/different-code, duplicated rows across two forms, and deferred-confirmation cases. Retain the current save/cache/refresh/failure/stale-target assertions. After the adjacent pending-option task is integrated, keep its tests and update only impact-specific fixtures to multiple forms; verify pending-option acceptance → single-form save without impact warning and acceptance → multi-form impact cancellation/retry without duplicate rows.
- [ ] **GREEN:** import the existing `countDistinctForms` into `frontend/src/components/CodelistQuickEditDialog.vue`; change only the impact-warning predicate to `countDistinctForms(refs) > 1`. Keep the message, references URL, snapshot PUT, and all surrounding flows intact.
- [ ] **Regression:** run the focused mount test, relevant node:test suites, full frontend tests, lint, and build. Fix incrementally; do not weaken behavior tests to fit the old bug.
- [ ] **Documentation:** minimally describe the shared quick-edit threshold in `README.md`, `README.en.md`, and `frontend/.claude/CLAUDE.md`, keeping each document's audience/language convention. Inspect `.claude/index.json` and update its existing frontend summary only where needed; no new module/test entry point is required. If a reusable rule needs a spec update, add a narrowly scoped frontend rule without changing the cross-stack reference-row contract.
- [ ] **Browser acceptance:** when authorized development credentials and an isolated backend/project are available, exercise the designer edit flow for single-form, repeated same-form, multi-form-confirm, and multi-form-cancel cases. Check the field-library inline entry as the other existing shared-dialog consumer. Capture UI/network evidence without secrets or user data. If blocked, state the exact blocker and that live browser verification was not performed.
- [ ] **Review and report:** inspect the actual code/docs diff, check scope and security invariants, list commands/results and unrun coverage/browser checks. A self-review is not an independent review. Do not commit/push/delete worktrees or branches without the required separate authorization; keep Trellis housekeeping commits separate from application changes.

## Expected File Scope

| Role | Paths |
| --- | --- |
| Production fix | `frontend/src/components/CodelistQuickEditDialog.vue` |
| Behavior tests | `frontend/tests/component/CodelistQuickEditDialog.spec.js` |
| Existing reuse, normally no edits | `frontend/src/composables/fieldReferenceImpact.js`, `frontend/tests/fieldReferenceImpact.test.js` |
| Host verification, normally no edits | `frontend/src/components/FormDesignerTab.vue`, `frontend/src/components/FieldsTab.vue`, `frontend/tests/fieldsTabCodelistQuickEdit.test.js` |
| Documentation sync | `README.md`, `README.en.md`, `frontend/.claude/CLAUDE.md`, `.claude/index.json`; targeted frontend spec only if useful |
| Planning/decision records | This task directory; `.context/current/branches/plan/codelist-impact-multiform/session.log` |

No backend edits, shared-counter refactor, new frontend helper, API fields, migrations, unit/deletion-rule changes, standalone `CodelistsTab.vue` handler changes, or dependency/build-script changes are planned. If source evidence invalidates the bounded solution, stop and revise the plan rather than silently expanding scope.

## Validation Commands (Execution Phase Only)

Run each from the task worktree; commands below have **not** been run during planning.

```bash
cd frontend && npm run test:component -- tests/component/CodelistQuickEditDialog.spec.js
cd frontend && node --test tests/fieldReferenceImpact.test.js tests/fieldsTabCodelistQuickEdit.test.js tests/formDesignerPropertyEditor.runtime.test.js tests/referenceDeleteGuard.test.js tests/referenceDeleteWiring.test.js
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
git diff --check
```

The relative `cd frontend` lines are separate commands starting at the worktree root, not one cumulative shell script. Prefer an explicit absolute working directory in the executor's shell calls.

- Preserve current unit coverage and target at least 80% as required by project rules. No frontend coverage provider is installed by declaration; tests passing alone do not prove a measured percentage. If coverage instrumentation requires a new dependency/configuration, ask before changing tooling and report the missing measurement rather than inventing a value.
- No backend suite is required for the proposed frontend-only predicate change. If implementation expands into backend/query/authorization/reference contracts, obtain scope confirmation and add the relevant backend tests from `research/codelist-reference-api.md`.
- Browser smoke testing is an execution acceptance item, not a claim based on happy-dom mounts. Do not generate or inspect credentials to bypass a live-test blocker.

## Planning Validation Board

- [x] Task created in isolated worktree; frontend call chain and reusable counter inspected.
- [x] Backend contract research completed/accepted by the main session; no independent review claimed.
- [x] PRD convergence pass completed and final PRD read end to end.
- [x] Both JSONL manifests contain real spec/research paths and `task.py validate` passes (5 implement + 4 check entries, with no truncation warnings).
- [x] Artifact path/size/scope checks and planning-only diff review pass (8 task files; application/test code unchanged).
- [ ] User reviews/approves execution later; no `task.py start` in this planning session.
