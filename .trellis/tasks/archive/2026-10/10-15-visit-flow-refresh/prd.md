# Visit Metadata Freshness Across the Visit Tabs

## Goal

After visit metadata is successfully saved, the already-open visit flow tab must show the latest persisted values without a browser refresh, project reopen, or cache-expiry wait.

## Background and Authorization

- User report (2026-10-15): "修改访视的信息，然后切换到访视流程界面，界面上访视的信息没有更新".
- The user requested task creation and a repair plan for later Sonnet execution. This session authorizes planning artifacts only; the task remains `planning`, pending artifact review and a later implementation request.
- The existing visit-list and matrix / single-visit capabilities are described in `frontend/.claude/CLAUDE.md:51`. This is a synchronization repair, not a new editing or flow-design feature.

## Requirements

### R1 — Notify already-mounted visit consumers (P2)

The confirmed static defect is missing cross-instance refresh after a visit mutation: App mounts separate list/flow instances (`frontend/src/App.vue:959–968`) and keeps activated tabs alive through the activation set (`frontend/src/composables/useLazyTabs.js:3–19`), but `saveVisit` only reloads its own instance (`frontend/src/components/VisitsTab.vue:188–199`, `:122–132`). A completed visit reload must also notify the other mounted instance. The reliable reproduction setup includes visiting the flow tab before editing; first entry after saving is a separate baseline, not the same confirmed failure.

### R2 — Preserve the existing user context

- Refresh the matrix's visit-name headers and the single-view name/OID rows and selected title wherever those values already render (`frontend/src/components/VisitsTab.vue:439`, `:464–476`). OID visibility remains full-mode only; do not add an OID column to the matrix.
- Retain selection by ID and rebuild references from refreshed data, preserving the existing behavior at `frontend/src/components/VisitsTab.vue:94–100`.
- Preserve visit/form ordering, visit–form assignments, and the selected-visit deletion suppression at `frontend/src/components/VisitsTab.vue:74–83`. Matrix/single-view toggling must not start reloading or resetting selection (`frontend/tests/visitFlowWorkspace.test.js:132–137`).
- Failed or cancelled metadata saves must not be presented as persisted changes. Keep observable request errors and explicit save/cancel semantics.

### R3 — Reuse the existing small synchronization boundary

- Reuse the shared `refreshKey` provider (`frontend/src/App.vue:178–179`) and existing consumer watcher (`frontend/src/components/VisitsTab.vue:16`, `:115`) under `.trellis/spec/frontend/state-management.md:280–340`.
- Preferred repair: publish the signal after `reloadVisits` completes its authoritative local reload; route `copyVisit` through the same awaited helper instead of its unawaited `load()` (`frontend/src/components/VisitsTab.vue:234–240`). Add/edit/delete/batch-delete and visit ordering already use this boundary. Do not publish from `load()` or the refresh watcher, which would cause a loop.
- Preserve existing invalidation, including the explicit project-prefix invalidation for non-project copy/delete URLs. The normal project-scoped PUT already invalidates both visit and matrix cache entries (`frontend/src/composables/useApi.js:125–135`, `:199–208`); changing global cache code is not the proposed fix.
- No new dependencies, runners, package scripts, API/schema changes, polling, forced remounts, or unrelated refactoring.

### R4 — Prove the UI defect separately from the cache control

- First add a failing component behavior regression with two real retained VisitsTab instances sharing one refresh signal. A single flow instance or a workspace-prop swap cannot reproduce the missing cross-instance notification.
- Each mocked read must return an independent server snapshot, not a shared mutable object that makes the flow update accidentally. Assert rendered DOM, selection, and relationships rather than only private state or source spelling.
- Add a real-cache control using actual `api.cachedGet` and `api.put`, mocking only `fetch`; warm visits and matrix, PUT, then read within the same TTL. This control is expected to pass before the UI fix, while the cross-instance UI regression must fail.
- Existing test patterns: `frontend/tests/component/visitsPreviewIntegration.spec.js:128–196`, `frontend/tests/apiCacheInvalidation.test.js:101–118`. Planned commands and environment prerequisites live in `implement.md`.

## Acceptance Criteria

| ID | Requirements | Observable result |
|---|---|---|
| AC1 | R1, R2, R4 | Previously loaded flow → list edit/save → flow: matrix shows the new name; single view shows the new name/OID and selected heading, without manual refresh or TTL advancement. |
| AC2 | R2, R4 | Cancel sends no write; a rejected PUT reports an error and leaves flow values persisted/unchanged rather than publishing the draft. |
| AC3 | R2, R3 | The same selected visit ID, form assignments, and saved ordering survive metadata refresh; deleting the selected visit still empties the property card, and matrix/single switching retains context. |
| AC4 | R3, R4 | The UI regression demonstrates RED→GREEN; the real-cache control remains GREEN; relevant node:test and vitest suites, lint, build, and feasible real-browser checks pass, with unavailable/failed checks and coverage measurement reported explicitly. |
| AC5 | R1, R3 | Saving before the first flow activation also displays current data; no remount workaround or new navigation behavior is introduced. |
| AC6 | R1, R3, R4 | Existing add/copy/delete/batch-delete and successful visit-order changes reach mounted flow consumers through the shared boundary; reorder failure retains existing restoration behavior. Reads and signal-driven reloads do not recursively broadcast. |

## Out of Scope

- Implementing the fix, starting implementation, committing, merging, pushing, or removing the worktree during this planning-only session.
- New visit fields, autosaving unsaved drafts, visit-flow redesign, new selection policy, global state-library adoption, and backend migrations.
- Cross-user real-time synchronization, general request-race hardening, and unrelated designer / form-preview changes.
- Rewriting App navigation, lazy-tab retention, or the shared API cache to hide a missing mutation notification.

## Planning Verification Status

Main-session source inspection supports the defect attribution and proposed minimal repair; no application tests, RED reproduction, lint, build, browser run, or coverage measurement have been performed in this planning-only session. `design.md` contains the verified data-flow evidence and trade-offs; `implement.md` is the ordered execution checklist. Implementation must wait for the user's subsequent approval/request.
