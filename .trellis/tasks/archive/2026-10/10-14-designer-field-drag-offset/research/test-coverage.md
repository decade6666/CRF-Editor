# Research: Designer field-drag regression coverage

- **Query**: Inspect ordering/designer/history/draft/copy tests and component infrastructure for actual drag-index and Vue identity/order coverage; identify the smallest behavior-level regression strategy and coverage-reporting boundary. Diagnosis/repair plan only.
- **Scope**: Internal; task-worktree tests/configuration/instructions and narrowly scoped handler/harness feasibility lookup. Existing runtime baselines also ran read-only in the coordinator-confirmed same-baseline main checkout.
- **Date**: 2026-10-14
- **Task / baseline**: `task.py current --source` resolved `.trellis/tasks/10-14-designer-field-drag-offset`; caller-supplied baseline `0bd2ec1`. No task state or git operation was performed.

## Findings

### Files Found / Coverage Classification

| File Path / Anchors | What is actually tested | Boundary |
|---|---|---|
| `frontend/tests/orderingStructure.test.js:1-32,205-251` | Reads source and regex-checks native drag handlers, DataTransfer effects, guards, optimistic reorder persistence, and failure reload wiring. | No executed drag handlers/events, source/target indices, or expected resulting field-ID sequence. |
| `frontend/tests/orderingStructure.test.js:157-187,307-313` | Source assertions for form-list sorting, `Object.assign` preservation of selected form, selection guards, `designerVisibleFields`, and displayed ordinals. | Not reactive object/DOM identity testing; no runtime raw-field-list versus rendered-field-list comparison. |
| `frontend/tests/orderingStructure.test.js:382-395` | Source assertions for `useSortableTable` POST / resequencing / reload. | Not an executed SortableJS index test, and not the designer native field-drop path. |
| `frontend/tests/designerHistory.test.js:7,58-308` | Executes real `useDesignerHistory`: stacks, replay busy state, clear-generation invalidation, failure rollback, ID remapping. | Injected callbacks rather than the designer's actual reorder/load/add/undo chain. |
| `frontend/tests/designerHistory.test.js:318-388,479-508,567-624` | Component context/selection/membership/reorder/UI guards are predominantly source-body assertions. | A→B→A at `:345-366` executes a locally reimplemented model. No actual field-drop undo→redo witness. |
| `frontend/tests/designerNewFieldDraft.test.js:1-15,23-87,188-204,245-251` | Entire file is source-text testing: local draft append, `maxOrder + 1`, save/reload/fallback replacement, selection, draft drop prohibition. | Does not execute new-field save, render the replacement row, or drag it afterward. |
| `frontend/tests/designerFieldCopy.test.js:44-153,223-340` | Mixed source checks and actual extracted `buildCopyDraft` / `copyFormField` execution with supplied dependencies and real history. Checks fractional order `4.5`, insertion metadata `5`, local-only copy, duplicate-click/reorder locks, immediate log-row copy. | `{ value: ... }` holders and mocked reload, not mounted reactive rendering. No `saveDraftField`→drop or drop-index test. |
| `frontend/tests/useDesignerFormSelection.test.js:6-24,27-129` | Real Vue refs/scope/ticks and real readiness bridge: latest request, immediate/queued calls, no remount replay. | `selectFormById` is a fake recorder at `:13-14`; real designer selection, loading, dragging do not run. |
| `frontend/tests/useOrdinalQuickEdit.test.js:6-37,71-141,180-219` | Actual reactive ordering: exact IDs, contiguous metadata, submitted IDs, rendered/hidden-row mapping, failure restore. | Ordinal editing, not native field drop; useful assertion style, not symptom coverage. |
| `frontend/tests/ordinalQuickEditWiring.test.js`, `frontend/tests/fieldsTabOrdinalConsistency.test.js`, `frontend/tests/formDesignerAuxiliaryData.test.js` | Source contracts for ordinal wiring, field-library display/payload isolation, auxiliary-data lifecycle. | No native field-drop execution or load/add/order synchronization test. |
| `frontend/tests/component/DesignerWordPreview.spec.js:302-344` | Real resize-handle pointer events, exact row keys/column boundary indices, original event targets. | Resize callbacks to spies, not field membership reordering; child mounts do not mount the field-list owner. |
| `frontend/tests/component/visitsPreviewIntegration.spec.js:24-28,128-196` | Large-parent mount precedent: unrelated SortableJS mock, API spies, provided refs, real controls, promise/tick flushing. | Visits preview only; harness reference for a future designer-parent mount. |

### Code Patterns / Missing Behavior

The native drag test proves that strings exist (`orderingStructure.test.js:205-210`), not that a drop lands correctly:

```js
const onDragOverBody = extractBlockAfter(formsSource, 'function onDragOver(');
assert.match(onDragOverBody, /e\.preventDefault\(\)/);
assert.match(onDragOverBody, /e\.dataTransfer\.dropEffect = 'move'/);
assert.match(formsSource, /@dragover\.prevent="onDragOver\(\$event, idx\)"/);
```

Searches across current `frontend/tests/**/*.js` found no native drag/drop dispatch, DataTransfer test fixture, or actual `oldIndex/newIndex` / draggable-index assertions. DataTransfer hits are source checks; `onEnd` is a source-test title. Inventory and imports/mount searches found **no existing `FormDesignerTab` parent mount spec**.

Missing: exact native before-target insertion semantics, direction distinction, adjacent-boundary no-op, retained move-to-last capability, and actual reorder undo/redo/failure restore. No durable test exercises first selection/add then drop or compares first and later drops. Existing selected-form identity checks are text assertions, not Vue lifecycle/DOM synchronization tests.

### Coordinator's Additional Reproduction Evidence

This is coordinator-provided evidence, **not a researcher-run test or committed regression**:

- Actual-function temporary harness: **4 RED** — first downward drag, downward drag after simulated addition, continued downward drag, and drop onto the immediately next row's top boundary.
- **3 passing controls** — upward drag; raw/visible field order aligned after load including sparse `order_index`; current POST/history order matched the current frontend result.
- Confirmed diagnosis from that slice: target **upper insertion boundary** is confused with insertion index **after removing the source**. It is not limited to first operations. Raw/visible divergence is **not** the established cause in the verified cases.

The field-list path is native HTML dragging, not SortableJS/vuedraggable. Do not use a SortableJS index event for this regression or treat matching UI/POST/history as proof of the correct landing position.

### Can the Existing Harness Pattern Execute Original Drop + Persistence?

**Yes, with an added behavior test; current tests do not do it.** Existing extraction/execution precedent is `designerFieldCopy.test.js:44-110`; current `onDrop` / `persistFieldReorder` references in `orderingStructure.test.js:241-247` and `designerHistory.test.js:382-388,457-464` are source-body assertions only.

Minimal product lookup confirmed ordinary function entry points in `frontend/src/components/FormDesignerTab.vue`:

- `onDragStart(ff, e)` / `onDragOver(e, idx)` at `:1119-1130` set source ID, hover index, and DataTransfer effects. An event-local double needs `preventDefault` and the touched effect properties; these handlers do not read/write DataTransfer payload methods.
- `normalizeFormFieldOrder(fields)` at `:1135-1136` returns cloned entries with contiguous `order_index`.
- `onDrop(e, targetIdx)` at `:1164-1178` reads refs/guards/context and calls the real persistence helper. Inject the **extracted actual** `persistFieldReorder`, not a spy, for persistence/rollback tests.
- `persistFieldReorder(historyContext, previousFields, normalized)` at `:1139-1161` optimistically replaces fields, POSTs `{ ordered_ids }`, invalidates cache, records history, restores on failure, and clears the busy ref in `finally`. Failure toast is `ElMessage.warning('排序保存失败，已恢复')`; failure reload at `:1156` is **not awaited**, so a test must distinguish immediate restoration from eventual reload settlement.
- `recordReorderHistory(...)` at `:882-895` creates actual undo/redo closures POSTing previous/next IDs then awaiting `reloadAfterReplay`. Capture those real closures or run them through real `useDesignerHistory`; empty replacement callbacks would miss replay behavior.

Refs/guards/context, mocked API/message boundaries, and controlled reload functions can be supplied as the existing copy harness supplies dependencies. This executes original function-body behavior, but does not compile/mount the `.vue` component or prove its template/DOM wiring.

### Smallest Durable Regression Strategy (Proposal Only)

**Minimum fix-specific path:** use the coordinator's actual-function harness approach in the planned future node:test file `frontend/tests/designerFieldReorder.test.js`, using the precedent above. No new runner/configuration/dependency. Execute actual handler/normalization/persistence/history bodies; do not reimplement the splice algorithm or add only regex assertions. The temporary script is old-code RED evidence only: future GREEN must assert independent correct behavior, not retain fixed old `@drop idx` wiring or incorrect historical permutations.

| Required behavior | Independent expected result / check |
|---|---|
| Downward before target | `[A,B,C,D]`, `A` before `C` → `[B,A,C,D]`; exact IDs, not just a numeric index. |
| Upward before target | `D` before `B` → `[A,D,B,C]`; retain passing-direction control. |
| Trigger states / repeated operation | First operation on load/add fixture states from the verified trace, plus continued dragging. No warm-up normalization; sparse-order load is a passing control, not the asserted cause. Label simulated lifecycle fixtures honestly. |
| Adjacent boundary / same row | `A` before immediately following `B` keeps `[A,B,C,D]`; no reorder request/new history entry. Same-row drop is also a no-op. |
| Last row versus actual list end | `A` before `D` → `[B,C,A,D]`; separately preserve the final plan's end-of-list operation → `[B,C,D,A]`. Blanket subtraction without append coverage is incomplete; coordinator specifies that boundary/event contract. |
| Success consistency | Correct result, POST IDs, and previous/next history orders match the **independent expected** sequence; no duplicate/missing field; contiguous local metadata. |
| Real undo / redo | Actual recorded closures through real history: correct result → original → correct, exact replay POST IDs, no extra replay recording. |
| Failure rollback | Rejected POST: previous fields restored, warning, controlled reload, no success history entry, busy cleared and next operation permitted. |

**Draft constraint:** `designerNewFieldDraft.test.js:202-204` prohibits unsaved-draft reordering. For new/regular-copy paths, Save/replacement must settle before allowed dragging; do not force `hasDraft=false` to claim an actual lifecycle reproduction. Immediate `addField`/log-row paths differ. Saved copied drafts are additional scope only if the repair affects fractional ordering (`designerFieldCopy.test.js:223-230`).

**Vue identity/event integration boundary:** if the plan needs that assurance, the planned future `frontend/tests/component/FormDesignerFieldReorder.spec.js` must mount the real parent, select identity-labelled rows, dispatch native drag events, and compare rendered order with independently expected POST IDs. Use the existing mount infrastructure below. This is an additional real-rendering witness, not a reason to diagnose a Vue-identity defect. Neither proposed file was created here.

### Coverage Metrics Boundary — Do Not Claim Component Coverage

- `frontend/package.json:12-13,22-33` has no coverage script or declared coverage-provider dependency; `frontend/vitest.config.js:8-12` has no coverage configuration. Narrow search confirmed no coverage declarations in either file. No dependency/provider/runner was added.
- Reading `.vue` text and evaluating extracted bodies via `new Function` / `AsyncFunction` / `vm` is **behavioral source-extraction testing**, not instrumented Vue SFC coverage. Percentages for generated VM code, the harness, test files, or imported composables must not be reported as `FormDesignerTab.vue` coverage.
- Even assigning a synthetic `.vue` filename to evaluated code is not proof that the complete SFC, template, or original source-map locations were instrumented. Native Node coverage would not by itself turn this extraction into a real component coverage measurement.
- Report RED/GREEN counts and precise verified behavior. **No frontend coverage percentage or ≥80% achievement was measured in this slice.** Any later provider/dependency/runner change requires separate authorization; the proposed behavior RED does not require it.

### Component Infrastructure

- `frontend/package.json:12-13,25-32`, `frontend/vitest.config.js:6-12`: node:test plus standalone vitest/Vue compiler/happy-dom; component naming `tests/component/**/*.spec.js`. Pinned vitest `5.0.3`, VTU `2.5.1`, happy-dom `20.14.5`.
- `frontend/tests/component/setup.js:17-20,25-47`, `vueWarnGate.js:17-45`: real Element Plus, automatic unmount, mocks/timers/storage/body restore, message spies, zero-warning gate including teardown. Do not suppress warnings.
- `frontend/tests/component/visitsPreviewIntegration.spec.js:128-196`: pre-mount API spies rejecting unexpected URLs, reactive provides, real controls, flushes. Mock boundaries, not native ordering/persistence under test.
- Minimal mount contract (`frontend/src/components/FormDesignerTab.vue:122-126`): numeric `projectId`; injected `refreshKey`, `editMode`, `projectDbType` default refs. Exposed `selectFormById` at `:3066-3077` exercises real selection; no test-only production export needed.
- No real layout/CSS in happy-dom (`setup.js:17`); synthetic events cannot verify physical browser hit-testing/perceived border location. No app/browser launch is needed for handler/mount tests.

### Commands and Verification

**Run in task worktree**; TAP summaries filtered with `rg` under `set -o pipefail`:

```bash
cd /home/decade/crf-editor-designer-field-drag-plan && node --test --test-reporter=tap frontend/tests/orderingStructure.test.js frontend/tests/designerNewFieldDraft.test.js frontend/tests/ordinalQuickEditWiring.test.js frontend/tests/fieldsTabOrdinalConsistency.test.js
# 61 passed, 0 failed, 0 skipped.

cd /home/decade/crf-editor-designer-field-drag-plan && node --test --test-reporter=tap frontend/tests/formDesignerAuxiliaryData.test.js
# 5 passed, 0 failed, 0 skipped.
```

**Run read-only in main using existing dependencies**, after coordinator confirmation of same baseline `0bd2ec1`:

```bash
cd /home/decade/crf-editor-designer-field-drag-plan && (cd /home/decade/CRF-Editor/frontend && node --test --test-reporter=tap tests/designerHistory.test.js tests/designerFieldCopy.test.js tests/useDesignerFormSelection.test.js tests/useOrdinalQuickEdit.test.js)
# 53 passed, 0 failed, 0 skipped.
```

The coordinator's four-file main baseline command is now confirmed:

```bash
cd /home/decade/CRF-Editor/frontend && node --test tests/orderingStructure.test.js tests/designerHistory.test.js tests/designerNewFieldDraft.test.js tests/designerFieldCopy.test.js
# Coordinator-run: 91 passed.
```

The 91-test batch overlaps the researcher's 61/5/53 batches; do not accumulate these counts into a deduplicated total. These existing baseline passes do not prove the native landing position is correct.

Relevant component command, **not run here**:

```bash
cd /home/decade/crf-editor-designer-field-drag-plan/frontend && npm run test:component -- tests/component/DesignerWordPreview.spec.js tests/component/visitsPreviewIntegration.spec.js tests/component/vueWarnGate.spec.js
```

Future regression commands (proposed files do not exist):

```bash
cd /home/decade/crf-editor-designer-field-drag-plan/frontend && node --test tests/designerFieldReorder.test.js
cd /home/decade/crf-editor-designer-field-drag-plan/frontend && npm run test:component -- tests/component/FormDesignerFieldReorder.spec.js
```

### Related Specs / External References

- `.trellis/spec/frontend/quality-guidelines.md:233-249`: component naming, real SFC mounts, pre-mount API spies, teleport, warning gate, no default polyfills, pinned versions.
- `.context/prefs/coding-style.md:46-52`, `.context/prefs/workflow.md:18-25,34-40`: reproduce/RED before fixes and corresponding frontend tests. Worktree prefs read before writing.
- `frontend/.claude/CLAUDE.md:114-130,141-156`: infrastructure/coverage index, corroborated against actual files rather than treated as behavioral proof.
- External references: none; repository-local coverage/harness investigation.

## Caveats / Not Found

- **Not found:** existing executed native field-drop index tests, real designer-parent mount, or product reorder undo/redo/failure regression. Resize-index and ordinal-order tests cover other paths.
- **Researcher-run baseline:** 66 source-contract + 53 existing runtime tests passed; not a drag-bug reproduction. Coordinator's 4 RED / 3 controls / 91 baseline passes are separately attributed evidence.
- **Environment:** no task-worktree `frontend/node_modules`; main dependencies used only for 53 read-only node tests. No installation. Node `v24.14.1`, npm `11.11.0` available.
- **Not run:** component suites, app/browser/E2E, build/lint, backend tests, coverage measurement, new durable RED tests. No source/test/config changes, task start, git operation, DB/credential access.
- **Next step:** coordinator incorporates the directional/boundary/append/history/rollback matrix and honest coverage boundary into the repair plan, retaining its existing 91-pass baseline and the actual-function RED evidence. Implementation/test creation requires separate authorization. This research file is the only deliverable written here.
