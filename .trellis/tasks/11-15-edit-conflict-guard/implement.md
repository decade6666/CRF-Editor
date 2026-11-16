# C4 Execution Plan — Authorized 2026-11-15

## Current Board

- [x] Read parent/child manifests and artifacts; supplement original large-spec sections.
- [x] Verify C1 completed (`c4ce7e2`) and present in local main and task/crf-c4.
- [x] Source inventory and user approval of revision/triggers, nineteen strict browser gates, and narrow atomic existing-command undo.
- [x] Activate only C4; record baseline coverage before product edits (1683 passed; 9675/10871 = 88.99825223070555%).
- [x] RED: eight retained real-connection API failures (two stale writes both 200; missing precondition 200; auth SELECT before physical BEGIN; delete-mode definition operation ignored), plus seventeen not-yet-implemented storage cases.
- [x] GREEN: online state, coherent reads/atomic writes, explicit frontend loaded/reviewed state, minimal composite undo (backend 1756 passed, 89.24% total; frontend node:test + vitest green).
- [x] Actual diff, security, full comparable coverage, regression/lint/build and permitted disposable browser acceptance. Browser acceptance found own sequential writes falsely reviewed (notes → field drag, form props → form/field props, field reorder → form props); fixed by the own-write chain (cross-stack §17), with RED component/unit tests first and re-verified in the disposable browser. External changes still review; reviewed drags reload.
- [x] Report evidence and blockers; leave uncommitted/unmerged/unarchived in this worktree (reported 2026-11-16; final frontend node:test 1109/1109, vitest 596/596, serial coverage 79.74/70.89/84.44/84.41 vs baseline 76.87/67.9/82.02/81.41, lint 0 errors, build OK; backend 1756 passed 89.24%).

Open decision (not implemented, outside this fix): invalidation-only own writers (codelist/unit quick-add, whole-form copy) return no pre-write tag, so the next protected save on that page reviews once. Removing it needs a separate contract change (e.g. an additive pre-write revision header or optional If-Match on those endpoints) and user confirmation.

The user separately approved isolated temporary test/browser credentials (no secret output, real data or 8888) and the existing fixtures' cleanup of this run's own temporary test resources via AskUserQuestion. Browser data/evidence, other temporary directories and destructive isolated restore/cleanup remain unapproved. No deployment/Git lifecycle authority is implied.


## Preconditions

C1 integrated; user reviews the proposed revision table/triggers, browser header/status compatibility and minimal atomic replay changes. Start only this child after separate implementation authorization. Reconcile actual main, covered endpoints, existing Agent contracts and active editor/history code first.

## Ordered Checklist

1. RED reproduction: file-backed SQLite, two real connections, competing stale form updates and a browser/Agent supported surface. Retain original-state/no-partial-write assertions.
2. Enumerate concrete read/write endpoints, precondition-gated versus invalidation-only writers, 204/status contracts and history commands. Confirm snapshot/token coherence and all design-table invalidation paths before choosing trigger definitions.
3. RED→GREEN online revision storage/migration/trigger tests, including existing/new projects, option/link cascades, raw imports/copies, no-op writes as documented and private export stripping. Prove synthetic auto/protection/review bookkeeping has no state effect and design replacement does; document the atomic contract C6 will consume. Do not touch Agent fingerprint bytes or bounds.
4. Implement atomic covered writer wrappers and coherent response metadata; add explicit missing/stale/foreign/validation failure tests. Keep one physical transaction per accepted command.
5. Add `useApi` metadata/error support without changing existing callers by default; update protected editor/field-library and history paths to use loaded state tokens, preserving cached payload-token pairs.
6. RED→GREEN conflict UI, cancel, reviewed overwrite, third-write re-conflict, current reference guards, real before-image undo and session/project late-response handling. Make required multi-step history replay atomic with a minimal closed operation, not a broad command framework.
7. Update actual user/module/index docs and new cross-stack contract in a separate spec change at the authorized finish phase. Actual diff/security review, coverage and all affected regressions precede integration into C2.

## Validation Commands — Future Only

```bash
cd backend && <backend-venv-python> -m pytest tests/test_agent_access_concurrency.py tests/test_agent_tools_edit.py tests/test_agent_shared_changes.py tests/test_field_profile.py tests/test_field_restore.py tests/test_inline_table_guard.py tests/test_permission_guards.py tests/test_agent_access_exports.py -q
cd backend && <backend-venv-python> -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered
cd backend && <backend-venv-python> -m ruff format --check .
cd frontend && node --test tests/designerHistory.test.js tests/useApiSessionRace.test.js tests/designerNewFieldDraft.test.js tests/designerFieldCopy.test.js tests/basePathDeployment.test.js
cd frontend && npm run test:component
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
```

Verify interpreter/test isolation first. New revision/concurrency/component test filenames are implementation deliverables, not existing commands; append them after creation. Capture pre-change coverage and verify no decrease/at least 80%; if inherited baseline prevents this, report the blocker rather than waive it. Adapter tests are required if its contract is touched, not assumed from backend tests.

Created C4 suites (append to the commands above): backend `tests/test_design_revision.py`, `tests/test_design_revision_boundary.py`, `tests/test_design_revision_storage.py`; frontend `tests/designRevision.test.js`, `tests/useApiDesignRevision.test.js`, `tests/designAtomicUndo.test.js`, `tests/component/DesignConflictGuard.spec.js`, `tests/component/CoreEditorConflict.spec.js` (scripted server `tests/component/designServerFixture.js`).

## Gates and Rollback

- G1: explicit endpoint/trigger/invalidation matrix; every source/template/exchange path remains safe.
- G2: actual BEGIN IMMEDIATE before auth/token check; real parallel requests cannot both apply stale effects.
- G3: no auto-token refresh/retry, no Agent bypass, no stale before-image undo or partially committed history prefix.
- G4: DevTools proof via C5 with independently established editing states; API tests alone are not browser evidence.
- Rollback: coordinate backend/frontend state enforcement; retain source/db recovery guidance and do not auto-drop revision schema or silently accept old clients. Migration rollback requires separate approval/backup, not an ad hoc destructive command.

## Closeout Authorization — 2026-11-16

The user explicitly requested: create a follow-up task for the remaining issues, then commit, clean up and finish. This supersedes the earlier instruction to leave C4 uncommitted/unmerged/unarchived, but does not authorize implementing the new backlog or touching production/8888. Follow-up: `.trellis/tasks/11-16-edit-conflict-followups/` (planning only; no start). C4's whole-frontend coverage requirement remains unmet (statements/branches below 80%) and the known limitations are carried there, not reported as passed acceptance.

- [x] Reconcile the 86 original C4 paths, current local main and other worktrees; no unrelated edits included.
- [x] Record F1–F6 limitations and verification debt in the new unstarted backlog.
- [x] Product commit `b6c4a8f` contains code/tests/docs only, no `.trellis/` paths; pre-commit gitleaks, whitespace, Python syntax and ruff-format checks passed. Trellis work is a separate commit.
- [ ] Archive only C4 and record journal, then merge/push main and remove only the C4 worktree/branch.
- [ ] Move identified C4 `/tmp` artifacts to trash; existing temporary backend/browser processes are already absent.

Do not rebuild deployed main-checkout assets, restart services, access real configuration/database/uploads or contact port 8888. Preserve other task worktrees.
