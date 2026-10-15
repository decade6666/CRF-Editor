# Execution Plan — Visit Flow Refresh Notification

## Handoff and Authorization

- Task: `.trellis/tasks/10-15-visit-flow-refresh`; status remains `planning`.
- Worktree: `/home/decade/CRF-Editor/.claude/worktrees/visit-flow-refresh-plan`.
- Branch/base: `plan/visit-flow-refresh` / `main`.
- The user requested a plan for later Sonnet execution, not implementation now. Do not start, edit business code, commit, merge, push, or remove this worktree in the planning session.
- A later explicit implementation request authorizes moving into execution after artifact review. Reuse this task/worktree; do not create a duplicate task or work directly on main.
- Read curated JSONL entries → `prd.md` → `design.md` → this file, then load `trellis-before-dev`. There is no separate research report to load; verified source evidence is in `design.md`.

## Expected File Scope

| File | Planned change |
|---|---|
| `frontend/src/components/VisitsTab.vue` | Publish `refreshKey` after the awaited `reloadVisits` load; make copy await that same helper while retaining explicit project cache eviction. |
| `frontend/tests/component/visitFlowRefresh.spec.js` | Proposed new file: real retained list/flow instance regressions. |
| `frontend/tests/apiCacheInvalidation.test.js` | Extend the existing actual-cache tests with project visit PUT → visits + matrix refetch within TTL. |

Do not modify backend, shared `useApi.js`, App navigation, lazy-tab behavior, preview components, dependencies, runners, or package scripts for this repair. If evidence requires that scope, stop and review the plan first.

## Ordered Checklist

### 1. Preflight and Baseline

- [ ] Confirm implementation authorization and review the task artifacts.
- [ ] Inspect `git status --short --branch` and `git worktree list`; reconcile parallel-session changes and confirm this worktree/branch still exists. Planning files are currently uncommitted and are not on main.
- [ ] Recheck the specific anchors in `design.md` against current source. The confirmed defect is **two retained instances lacking notification**, not a one-instance workspace toggle or missing PUT cache eviction.
- [ ] Ensure existing frontend dependencies are installed (`npm ci` in this worktree's `frontend/` if missing). Do not expand dependencies or scripts.
- [ ] Validate the context manifests, then run `task.py start` only after review and explicit implementation authorization; verify status becomes `in_progress`.
- [ ] Run the focused existing cache/workspace/ordering tests and existing VisitsTab preview integration to identify baseline failures before editing production code.

### 2. Test-First Evidence

- [ ] Add the project-specific cache control to `tests/apiCacheInvalidation.test.js`, retaining real `api.cachedGet` and `api.put` and stubbing only `fetch`. Clear its cache and restore fetch in test cleanup; do not leak global state between cases.
- [ ] Prewarm `/api/projects/{pid}/visits` and `/api/projects/{pid}/visit-form-matrix`; PUT `/api/projects/{pid}/visits/{vid}`; re-read both within the same 30-second TTL. Assert both URLs perform another GET and return the new independent snapshots. Do not advance TTL. This control should be GREEN on the existing implementation.
- [ ] Create `tests/component/visitFlowRefresh.spec.js` using the real Element Plus / Vue-warning setup and `visitsPreviewIntegration.spec.js:128–196` as the mount/click pattern. Mock external SortableJS as existing tests do; do not mock VisitsTab itself or suppress Vue warnings.
- [ ] Mount a real host with separate list and flow VisitsTab children, sharing one provided `refreshKey` and full edit mode. Keep activated children mounted while switching visible tabs; the host may reuse the real `createLazyTabState`. Do not replace this with a single child whose `workspace` prop changes.
- [ ] Make API-boundary spies return a fresh immutable snapshot on every read. The fake server's successful PUT updates its authoritative fixture, not any object already returned to a component.
- [ ] Walk flow activation → select a non-first visit in single view → return to list → edit/save name and OID through the property card → return to retained flow. Assert the matrix name, single-view name/OID and selected title; OID is not a matrix column.
- [ ] Run the new UI test on the unfixed implementation and record the actual RED failure. If it passes, inspect the harness for shared mutable fixtures, accidental remounts, missing warm-flow setup, or pre-existing concurrent fixes before touching production code.

### 3. Minimal Production Repair (GREEN)

- [ ] In `reloadVisits` (`VisitsTab.vue:122–125`), retain `invalidateCache(visits-prefix)` and `await load()`, then increment the injected shared `refreshKey` once.
- [ ] In `copyVisit` (`:234–240`), retain the existing non-project copy endpoint and explicit project-prefix invalidation; replace unawaited `load()` with `await reloadVisits()` before the existing success message.
- [ ] Do not broadcast from `load`, `watch(refreshKey, ...)`, mounting, or matrix/single toggles. Preserve the current shared provider and watcher.
- [ ] Preserve `reloadAndSelectVisit`, ID rebinding, `syncVisitForms`, explicit copy/delete project cache eviction, and `suppressNextVisitRowSelect` with its `try/finally`.
- [ ] Confirm the UI RED cases become GREEN and the actual-cache control remains GREEN without modifying cache implementation.

### 4. Context / Failure / Caller Regressions

Keep cases independent and assert rendered behavior, not merely a signal increment:

- [ ] **AC1:** repeated successful name/OID changes update both already-mounted flow views and the selected title.
- [ ] **AC2:** cancel sends no PUT; failed PUT shows the existing error, does not publish draft metadata or increment the refresh signal, and keeps flow values persisted/unchanged.
- [ ] **AC3:** selected non-first visit ID, form associations and their sequence remain stable after metadata refresh; matrix/single switching does not reload/reset selection.
- [ ] **AC3:** deleting the selected visit (single and batch) leaves the list property card empty after all watcher reloads settle; a later user row click still selects normally. The new bounded self reload must not bypass or permanently retain deletion suppression.
- [ ] **AC5:** save before first flow activation remains correct; this is an existing-green baseline rather than the primary RED witness.
- [ ] **AC6:** add/copy/delete/batch-delete and drag/ordinal visit ordering reach mounted flow consumers. Check copied names/ordering from server snapshots, not guessed client renaming rules.
- [ ] **AC6:** failed reordering still restores authoritative order and shows the existing warning. Recovery hooks already call `reloadVisits`, so a recovery notification is allowed; do not demand zero broadcasts for every kind of failed operation.
- [ ] **AC6:** reads and watcher-driven reloads stop without recursive signal increments. Allow the existing spec's bounded writer self reload rather than asserting exactly one read for all consumers.
- [ ] Copy/metadata refresh errors remain observable; a rejected awaited copy reload must not fire the copy-success toast.
- [ ] Retain existing preview integration and workspace/ordering/identifier visibility guards without weakening their contracts.

### 5. Full Validation and Actual-Diff Review

- [ ] Run focused node:test and vitest commands below, then `npm test`, lint, and build.
- [ ] Inspect the actual diff for the two production changes, any unintended helper semantics, extra writes, destructive selection changes, excessive refresh loops, and unrelated formatting/refactoring.
- [ ] Keep coverage at least 80% and nondecreasing. `package.json` declares no coverage provider; verify installed tooling before measuring. If a provider must be added, ask first; do not install it silently or invent a percentage. Report missing measurement explicitly as a verification gap.
- [ ] Backend tests are not planned for this frontend-only repair. New backend changes require an updated scope, targeted pytest cases and review rather than quietly expanding the fix.

### 6. Real-Browser Acceptance and Delivery

- [ ] Run this worktree's app/build with an isolated backend/database and a regular-user fixture project containing two visits and at least one assigned form. Never mutate production/private data.
- [ ] Before provisioning live test credentials, obtain task-specific approval or user-supplied test values. Prior-task approval is not standing authorization. Do not inspect/reuse production secrets, bypass a denied action, or ask another session to mint blocked credentials.
- [ ] Capture the original warm-flow symptom before the repair where feasible, then verify AC1–AC3 and the first-entry baseline after it. Check companion mutation paths according to their changed helper behavior.
- [ ] Confirm the browser serves this worktree's rebuilt frontend, not a stale main-checkout `dist`. Keep screenshots/request/console evidence task-scoped, secret-free, and outside tracked source or on an ignored evidence path.
- [ ] If startup, login, credentials, or browser access is blocked, report the exact blocker and mark live checks not run; happy-dom rendering is not live DOM verification and the browser criterion is not implicitly waived.
- [ ] Report actual commands/results, UI RED→GREEN evidence, the independent cache control, coverage status, and every failed/not-run/blocked item.
- [ ] Shared documentation updates are needed only if implementation changes a reusable contract or feature/command/test entry point. The selected repair follows an existing contract and existing runners; no README/index churn is planned merely to record the bug narrative.
- [ ] If commits are later requested, keep project code/tests separate from `.trellis/` task/spec/journal commits. Review the diff before each commit; merge/push/removal still follow their applicable authorization gates.

## Commands

All commands below are for the later executing session, not commands already run during this planning turn.

Preflight validation (do not append `start` until the user authorizes implementation):

```bash
cd /home/decade/CRF-Editor/.claude/worktrees/visit-flow-refresh-plan && \
  python3 .trellis/scripts/task.py validate .trellis/tasks/10-15-visit-flow-refresh
```

After review and explicit implementation authorization:

```bash
cd /home/decade/CRF-Editor/.claude/worktrees/visit-flow-refresh-plan && \
  python3 .trellis/scripts/task.py start .trellis/tasks/10-15-visit-flow-refresh
```

Focused existing baseline and real-cache control after adding its test:

```bash
cd /home/decade/CRF-Editor/.claude/worktrees/visit-flow-refresh-plan/frontend && \
  node --test tests/apiCacheInvalidation.test.js tests/visitFlowWorkspace.test.js tests/appTabLazyLoad.test.js tests/orderingStructure.test.js tests/ordinalQuickEditWiring.test.js tests/useOrdinalQuickEdit.test.js tests/visitPreviewSplit.test.js tests/editModeHiddenIdentifiers.test.js && \
  npx vitest run tests/component/visitsPreviewIntegration.spec.js
```

Run the new UI regression alone first to capture RED; rerun after the repair for GREEN:

```bash
cd /home/decade/CRF-Editor/.claude/worktrees/visit-flow-refresh-plan/frontend && \
  npx vitest run tests/component/visitFlowRefresh.spec.js
```

After GREEN and companion cases are complete:

```bash
cd /home/decade/CRF-Editor/.claude/worktrees/visit-flow-refresh-plan/frontend && \
  npx vitest run tests/component/visitFlowRefresh.spec.js tests/component/visitsPreviewIntegration.spec.js && \
  node --test tests/apiCacheInvalidation.test.js tests/visitFlowWorkspace.test.js tests/appTabLazyLoad.test.js tests/orderingStructure.test.js tests/ordinalQuickEditWiring.test.js tests/useOrdinalQuickEdit.test.js tests/visitPreviewSplit.test.js tests/editModeHiddenIdentifiers.test.js && \
  npm test && \
  npm run lint && \
  npm run build
```

`visitFlowRefresh.spec.js` is proposed and does not yet exist. `npm test` already covers node:test and vitest (`frontend/package.json:12–13`), so no script/runner change is required.

## Escalation / Rollback Points

- If source or RED evidence contradicts the retained-instance diagnosis, update the plan before implementing a different layer.
- If the bounded self reload breaks deletion/selection, isolate that behavior in a failing test first; do not introduce speculative skip flags or redesign the refresh mechanism preemptively.
- Keep the production delta independently reviewable/revertible from tests and planning artifacts; no reset, deletion, cleanup, or rollback is authorized by this planning request.
- On the third unresolved validation attempt, switch to isolate → reproduce → instrument rather than repeating the same fix.
