# Native Field Drag: Root-Cause Evidence

## Scope and Baseline

- Read-only diagnosis of designer field reordering at commit `0bd2ec1`.
- Product source and tests were not edited. Only task artifacts and a repository-external temporary test harness were written.
- Worktree: `/home/decade/crf-editor-designer-field-drag-plan`; branch: `plan/designer-field-drag-offset`.

## Confirmed Product Facts

| Fact | Evidence |
| --- | --- |
| The fullscreen field list uses native HTML drag events, not SortableJS or vuedraggable. | `frontend/src/components/FormDesignerTab.vue:3333-3352`; handlers at `1119-1179`. |
| Every hover indicator is the target row's top border; there is no before/after-half-row calculation. | `FormDesignerTab.vue:1127-1134` and `3342-3351`. |
| The template passes the visible target index directly to `onDrop`. | `FormDesignerTab.vue:3335,3351`. |
| `onDrop` removes the dragged item, then inserts at the unchanged pre-removal target index. | `FormDesignerTab.vue:1169-1178`. |
| `loadFormFields` sorts its response before assigning `formFields`; the visible list independently uses the same `sortFormFieldsByOrder`. | `FormDesignerTab.vue:387-407,1379-1384`. |
| Optimistic persistence sends the exact computed ID permutation; history records that same permutation. | `FormDesignerTab.vue:1139-1161,882-895`. |
| The backend consumes `{ ordered_ids: [...] }`, validates the complete in-scope permutation, and writes `1..n` in that exact order. It does not compute a drop index or add one. | `backend/src/routers/fields.py:390-400`; `backend/src/repositories/form_field_repository.py:56-59`; `backend/src/services/order_service.py:315-348`; `backend/src/schemas/field.py:159-160`. |
| A new field is a local draft; saving normally reloads and re-sorts fields, while the failed/skipped reload fallback preserves the draft row in place. Reorder is rejected while a draft exists. | `FormDesignerTab.vue:2551-2596,2673-2715,1171`. |

## Root Cause: Insertion Boundary vs Final Item Index

A top-border marker identifies the boundary **before** the target row. For `[A, B, C, D]`, dragging `A` to the line above `C` identifies boundary index 2. Removing `A` changes the list to `[B, C, D]`, where that same boundary is now index 1. The current code inserts at 2 and produces `[B, C, A, D]`, one row below the highlighted boundary, rather than `[B, A, C, D]`.

The conversion is directional: `insertIndex = boundaryIndex - (sourceIndex < boundaryIndex ? 1 : 0)`. Upward drags do not require this subtraction. Blindly subtracting one for every drag would introduce an upward-drag regression.

Dropping a row immediately before its next neighbor should be a no-op. The current code instead swaps the two rows and sends a persistence request. This is the adjacent case of the same boundary mismatch, not a separate ordering API defect.

## Executed Runtime Reproduction

Temporary script: `/tmp/crf-designer-field-drag.CtPhyA/repro.test.mjs`.

```bash
cd /home/decade/crf-editor-designer-field-drag-plan
node --test /tmp/crf-designer-field-drag.CtPhyA/repro.test.mjs
```

The script reads and executes the **unchanged original** `sortFormFieldsByOrder`, `loadFormFields`, drag handlers, `normalizeFormFieldOrder`, `persistFieldReorder`, and `designerVisibleFields` computed expression. It uses real Vue refs/computed from the existing main-checkout dependencies. API, messages, and history-recording boundaries are mocked; no real server, database, credentials, or rendered browser is involved. Simulated creation is a fresh response containing an additional field, not execution of the full `saveDraftField` network flow.

Result: exit 1; **7 tests, 3 passed, 4 expected RED failures reproducing the defect**.

| Scenario | Expected IDs | Actual IDs | Result |
| --- | --- | --- | --- |
| First load: A before C | `[2,1,3,4]` | `[2,3,1,4]` | RED |
| After simulated creation/reload: C before E | `[1,2,4,3,5]` | `[1,2,4,5,3]` | RED |
| Subsequent downward drag: B before D | `[3,1,2,4]` | `[3,1,4,2]` | RED |
| A before its next neighbor B | `[1,2,3,4]`, no POST | `[2,1,3,4]` | RED |
| Upward: D before B | `[1,4,2,3]` | Same | PASS |
| First-load source vs rendered IDs, reversed input and gapped order values | Identical sorted IDs | Identical | PASS |
| Current POST/history/cache invalidation and normalized order | Exact frontend-computed permutation | Same | PASS |

## Existing Regression Baseline

Both checkouts remained on the same product baseline `0bd2ec1`. The isolated worktree had no installed node_modules; the existing main-checkout dependencies were reused for read-only baseline execution rather than adding dependencies or writing source files.

```bash
cd /home/decade/CRF-Editor/frontend
node --test tests/orderingStructure.test.js tests/designerHistory.test.js tests/designerNewFieldDraft.test.js tests/designerFieldCopy.test.js
```

Result: exit 0; **91 passed, 0 failed**. Passing existing tests therefore does not rule out the reproduced drop-boundary bug. Detailed coverage evidence is in `test-coverage.md`.

## User-Symptom Qualification

The source-level/runtime bug is **not limited to the first interaction**: the temporary harness reproduces it again after a successful normalized reorder. The user's first-entry/post-add observations are relevant acceptance scenarios, but exclusivity to those phases is not proven. No real-browser mouse drag or user deployment/build identity has been inspected. Do not invent a cache, initialization, timer, order-value-gap, or backend-index explanation for the first-only observation.

Before closing implementation, use a non-production test session to compare downward vs upward drag on first entry, after an actual saved addition, and on subsequent drags; check both mouse release and persisted order after reopening. If upward-only movement or genuinely first-only behavior remains, capture hovered row ID, displayed marker boundary, release-target row ID, and submitted ordered IDs before widening scope. Do not read or change real clinical data for this check.

## Relevant Spec Conflict

`.trellis/spec/guides/cross-stack-contracts.md:114-133` describes the field reorder endpoint with `{ field_id, new_index }` and an updated-list JSON response. This conflicts with the verified frontend POST and backend `ReorderRequest` / route, which use `{ ordered_ids }` and **HTTP 204**. Keep the verified current API unchanged. Record the discrepancy for a narrow standalone Trellis documentation correction in the implementation finish phase; do not "fix" source code to match the stale example.

## Boundaries for the Repair

- Preserve native drag behavior, row-top marker semantics, keyboard accessibility, optimistic persistence, full ID-permutation payloads, cache invalidation, previous/next-order history, and failure restoration.
- Use target field identity instead of assuming a visible index belongs to the backing array, particularly for copied-field fallback paths that can preserve non-canonical backing order.
- Retain the ability to move a field to the absolute end. A before-target-only correction without a terminal insertion boundary would remove that ability.
- Do not change backend ordering, SortableJS table/form-list composables, preview grouping, database schemas, credentials, build scripts, or dependencies.
