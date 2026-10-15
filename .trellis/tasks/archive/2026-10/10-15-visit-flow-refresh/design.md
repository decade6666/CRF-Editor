# Design — Visit Flow Refresh Notification

## Status and Scope

Evidence-backed plan for user review; implementation is not authorized by this planning-only turn. The intended production change is confined to `frontend/src/components/VisitsTab.vue`; associated test changes are listed in `implement.md`.

## Verified Data Flow

The main session directly read the following current sources in the task worktree:

| Boundary | Evidence | Consequence |
|---|---|---|
| Shared refresh source | `frontend/src/App.vue:178–179` provides one `refreshKey` ref. | Both visit instances already have a supported synchronization mechanism. |
| Distinct retained instances | `frontend/src/App.vue:959–968` mounts `workspace="list"` and `workspace="flow"` separately. `frontend/src/composables/useLazyTabs.js:3–19` adds activated tabs to a persistent set until project reset. | Returning to a previously opened flow does not remount it or automatically rerun `onMounted`. |
| Save and local reload | `frontend/src/components/VisitsTab.vue:188–199` calls the project visit POST/PUT, then `reloadAndSelectVisit`; `:122–132` invalidates visits and reloads only that instance. The ref is injected at `:16` and watched at `:115`, but never incremented in this component. | The writer refreshes its local data; the retained flow instance keeps its old values. App's active-tab refresh at `frontend/src/App.vue:211–218` only handles fields/designer. |
| Display consumers | `frontend/src/components/VisitsTab.vue:439` renders matrix visit names from `matrixData.visits`; `:464–476` renders the single-view visit rows and selected heading from `visits` / `selectedVisit`. | Both views can remain stale independently of the now-correct API cache. The matrix intentionally does not render OID. |
| Cache already evicted | `frontend/src/composables/useApi.js:125–135` evicts the project URL prefix; `:199–208` invokes it on successful PUT; `:156–183` implements cached GET with a 30-second TTL. | Project-scoped visit PUT already invalidates visits and matrix. Eviction does not replace references held by mounted components; TTL expiry does not proactively re-read them. |
| Persistence contract | `backend/src/routers/visits.py:79–110` applies the submitted update; `:33–44` reads current visits; `:222–253` queries current visit rows for the matrix. | Source inspection supports a display-sync fix, not an API/schema change. This is not a live-database verification claim. |

**Static reproduction sequence:** open flow and let it load; return to the visit list; save a different name/OID; return to the retained flow. No code currently publishes a signal that makes that flow instance call `load()` again. First flow activation after the save is different: mounting calls `load()` and the normal PUT has already evicted the relevant cache entries.

A bounded read-only subagent supplied source pointers but could not create its standalone research report under its role's write restrictions. No separate `research/visit-flow-refresh.md` was created or routed through another writer. The table above records the main session's independent source verification as part of the originally authorized design deliverable. No application tests or browser reproduction ran during planning.

## Selected Repair

### 1. Publish after the existing visit reload

Extend `reloadVisits` (`frontend/src/components/VisitsTab.vue:122–125`) so its normal successful path remains:

1. Preserve the existing visits-cache invalidation.
2. Await the existing `load()` of authoritative local state.
3. Increment the injected `refreshKey` once.

The other mounted visit instance already watches that exact ref and reloads its visits, matrix, and forms. Follow `.trellis/spec/frontend/state-management.md:280–340` rather than inventing a new event bus or store.

**Do not increment in `load()`, `watch(refreshKey, ...)`, `onMounted`, or a view-switch watcher.** Those are read paths; publishing there creates refresh recursion or unnecessary reload-on-navigation behavior.

### 2. Join copy to the same awaited boundary

`copyVisit` currently does project cache eviction followed by unawaited `load(); ElMessage.success(...)` (`frontend/src/components/VisitsTab.vue:234–240`). Keep the endpoint and explicit project-prefix eviction, then await `reloadVisits()` before the existing success message. Its catch must still display refresh/request failures instead of silently detaching the promise.

Other visit mutations already reach this helper:

- Add/edit: `frontend/src/components/VisitsTab.vue:188–199` through `reloadAndSelectVisit`.
- Single/batch delete: `:202–231`, including selected-row suppression.
- Drag and ordinal visit ordering: `:134–158`, through `reloadFn`.

Do not change the visit–form relationship helper `reloadVisitForms` merely to repair visit metadata freshness.

### 3. Preserve context and error semantics

- Keep ID-based selection rebinding and `syncVisitForms` (`frontend/src/components/VisitsTab.vue:94–100`). Do not clear selection, reset `flowView`, or alter relationship data to refresh a label.
- Preserve `suppressNextVisitRowSelect` and its `try/finally` (`:74–83`); test selected-row deletion against the extra self-watcher reload before accepting the patch.
- A metadata PUT rejection never reaches the reload/broadcast boundary. Cancellation likewise sends no write.
- If the writer's awaited reload fails after a write, retain the visible error; do not claim a completed fresh-flow refresh or show a copy-success toast before that await resolves.
- Ordering helpers also invoke their reload hook to restore authoritative order on failure (`frontend/src/composables/useSortableTable.js:51–57`, `frontend/src/composables/useOrdinalQuickEdit.js:135–152`). A restoration reload may therefore notify consumers even though that reorder failed; do not impose a new success-only ordering contract.

## Trade-offs and Rejected Alternatives

| Choice | Decision |
|---|---|
| Existing global `refreshKey` | Selected: this is already the project's cross-tab contract. Mounted consumers may re-read, including the writer itself. The spec explicitly tolerates one bounded self reload; test for bounded completion and preserved state rather than an unrealistic exact one-read count. |
| Publish from read/watcher callbacks | Rejected: causes recursive broadcasting. Keep the notification at the mutation/recovery reload boundary only. |
| Add matrix invalidation / rewrite `_autoInvalidate` | Rejected for this bug: the real project PUT already clears the relevant cache. Preserve the existing copy/delete explicit project eviction because those URLs are not project-scoped. |
| Add visits/visitflow to App navigation refresh | Not selected: refresh-on-entry is a wider navigation workaround and leaves the mutation's missing notification unfixed. |
| Reload only one displayed string, add a local dirty flag, or treat this as one workspace-changing instance | Rejected: App owns two independent retained instances, not one local state machine. |
| New store/events, force remount, clear all caches, polling/TTL delays | Rejected: unnecessary scope or context loss for a supported shared-signal mechanism. |

## Regression Design

1. **UI RED witness / AC1:** a real host mounts separate retained list/flow VisitsTab children, provides the same ref and full edit mode, switches visibility without remounting, and edits through the actual property card. Serve fresh independent snapshots per API call. The original flow DOM must stay old and fail the new assertion; the fixed implementation must show the saved matrix name and single-view name/OID/heading.
2. **Real-cache control / AC4:** extend `frontend/tests/apiCacheInvalidation.test.js:101–118` with actual `api.cachedGet` / `api.put`, mocking only network fetch. Prewarm visits and matrix, PUT, and assert both GETs refetch new snapshots within the same TTL. This is expected to pass on the original code; an always-fresh cachedGet mock cannot establish this fact.
3. **Context and failures / AC2–AC3:** failed PUT, cancel, non-first selected visit, existing form relationships/order, selected-row delete suppression, and matrix/single switching with no new reload/reset behavior.
4. **Boundary completeness / AC5–AC6:** first entry after save, repeated saves, copy/add/delete/batch-delete, both visit-order mechanisms and their existing recovery behavior. Keep test cases independent; do not mutate a previously returned snapshot to simulate a server change.

Reuse `frontend/tests/component/visitsPreviewIntegration.spec.js:128–196` for real VisitsTab mounting/click patterns and the shared Element Plus/Vue-warning setup. Retain `frontend/tests/visitFlowWorkspace.test.js:23–59`, `:121–137` as wiring/context guards; do not weaken those tests to conceal a regression.

## Compatibility, Operational Checks, and Rollback

No backend, schema, App navigation, cache API, preview component, dependency, or runner change is intended. An implementation needing those changes must stop for scope review.

`frontend/package.json:6–13` already provides all required test/lint/build entry points. No coverage provider is listed in its devDependencies (`:22–32`); do not silently add one or claim a percentage. Follow the measurement/approval gate in `implement.md`.

Live-browser checks require an authorized isolated backend/database, regular-user credentials, and this worktree's frontend build. Do not reuse production secrets/data or assume another task's credential approval applies. Blocked browser checks remain unverified, not implicitly waived.

Keep production edits small and separate from regression tests/planning files so a later authorized rollback can revert the implementation independently. Do not perform rollback, cleanup, commits, merges, or pushes in this planning session.
