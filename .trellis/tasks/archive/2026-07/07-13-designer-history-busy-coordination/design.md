# Technical Design — Designer history busy / form-session coordination

## 1. Scope and boundaries

This is a frontend-only concurrency hardening change.

Affected production boundaries:

- `frontend/src/composables/useDesignerHistory.js`: owns stack integrity and replay busy state.
- `frontend/src/components/FormDesignerTab.vue`: owns selected-form identity, `formSelectionSession`, async editing commands, and UI entry points.

No backend endpoint, payload, persistent model, or cross-stack rendering contract changes.

## 2. Design invariants

1. `record()` never mutates either stack while an undo/redo replay is busy.
2. A history entry belongs to the exact form-selection session in which its forward command started.
3. Form identity and session identity are both required; form id alone does not reject an A → B → A stale completion.
4. UI disablement improves interaction safety, but stack integrity must not depend on template state.
5. A stale forward command may already have changed the backend. It is intentionally not queued, rolled back, or attached to another form's history.

## 3. History composable contract

Change `useDesignerHistory().record(entry)` from an implicit void operation to a boolean acceptance contract:

```javascript
function record(entry) {
  if (busy.value) return false
  if (!isValidEntry(entry)) return false
  // existing immutable stack update
  return true
}
```

Reasons:

- The composable is the final authority for stack integrity.
- A low-level busy check protects against missed UI/function guards and delayed autosave callbacks.
- Returning a boolean makes rejected records testable without exceptions or user-facing error noise.

`undo()`, `redo()`, `clear()`, `remapId()`, stack limit, and replay-failure restoration stay unchanged.

## 4. Component-level command context

Add one context capture helper and one record wrapper near existing history helpers:

```javascript
function captureDesignerHistoryContext(formId = selectedForm.value?.id ?? null) {
  return formId == null ? null : { formId, sessionId: formSelectionSession }
}

function recordDesignerHistory(context, entry) {
  if (!context) return false
  if (context.sessionId !== formSelectionSession) return false
  if (context.formId !== (selectedForm.value?.id ?? null)) return false
  return designerHistory.record(entry)
}
```

Every forward command captures its context before the first relevant `await` and later passes it to `recordDesignerHistory(...)`:

| Command | Current history label | Context capture point |
| --- | --- | --- |
| `addField` | 新增字段 | before draft confirmation / POST |
| `copyFormField` | 复制字段 | after duplicate-row lock, before draft confirmation / POST |
| `removeField` persisted branch | 删除字段 | before confirmation / DELETE |
| `batchDelete` | 批量删除 | before confirmation / POST |
| `onDrop` | 排序 | before optimistic reorder / POST |
| keyboard `move` | 排序 | before optimistic reorder / POST |
| `saveFieldProp` | 编辑属性 | after synchronous snapshot validation, before first API write |
| `saveDraftField` | 新建字段 | before first definition POST |
| `addLogRow` | 添加log行提示 | before draft confirmation / POST |

The table has nine command entry paths but eight direct record sites because drag and keyboard sorting share `recordReorderHistory`.

`recordReorderHistory` receives the captured context instead of deriving current state after the request.

## 5. Busy entry-point gating

### Template-level feedback

Bind `designerHistory.busy.value` to the relevant controls:

- native field-library add button
- new-field / save-draft / add-log-row / batch-delete buttons
- row copy and persisted-delete buttons
- both field-property `<el-form>` branches
- draggable field row (`draggable=false` while busy)

Existing per-operation states such as `savingDraft` and `copyingFieldIds` are OR-composed with the history busy state; they are not replaced.

### Function-level safety

Before a command begins a new persistent history-producing operation, reject when history replay is busy. Sorting handlers must guard both drag/drop and keyboard paths. This protects programmatic calls and events already queued before Vue updates the DOM.

The low-level `record()` busy check remains the final defense for an operation that began before replay became busy and completed during replay.

## 6. Data flow

### Normal command

1. Capture `{formId, sessionId}`.
2. Run existing confirmation and API flow.
3. Refresh through existing guarded loaders.
4. Wrapper confirms form id + session are still current.
5. `record()` confirms replay is not busy and appends immutably.

### Replay-busy command attempt

1. UI control is disabled or function guard returns before persistent work.
2. If a delayed callback still reaches `record()`, the composable returns `false` and leaves both stacks unchanged.

### Stale form completion

1. Command starts under A/session N.
2. Selection changes, incrementing `formSelectionSession`; the selected-form watcher clears history.
3. Old API request may complete.
4. Wrapper rejects the entry because session and/or form id differ.
5. No rollback, queue, or old-context toast is produced.

## 7. Testing design

### Runtime stack tests (`frontend/tests/designerHistory.test.js`)

- Use a deferred promise inside undo and redo callbacks.
- Assert `busy=true` while the callback is pending.
- Call `record()` during that window; assert it returns `false` and does not alter stacks after replay settles.
- Assert a valid normal record returns `true`.

### Component coordination tests

Extend the existing history test file with source-level and small extracted-helper checks consistent with the project's current frontend test style:

- the wrapper compares both captured session and current form id;
- all history labels route through the wrapper;
- only the wrapper directly calls `designerHistory.record()`;
- both reorder entry paths pass captured context;
- busy gating exists on command functions and UI controls, including property forms and drag/keyboard sorting;
- an A → B → A session change rejects the stale context.

Existing focused suites remain regression evidence for command semantics:

- `designerFieldCopy.test.js`
- `designerNewFieldDraft.test.js`
- `orderingStructure.test.js`
- `quickEditBehavior.test.js`

## 8. Trade-offs and rejected approaches

### Queue records until replay finishes — rejected

The forward side effect and replay may target overlapping resources. Queueing only the history entry cannot reconstruct the correct causal order and can attach an operation to an invalid stack state.

### Compare only selected form id — rejected

It fails when the user leaves A and returns to A before the old request completes. The monotonic session token is required.

### UI disablement only — rejected

Template state cannot protect direct function calls, delayed autosave callbacks, or events already queued before the DOM update.

### Roll back stale backend writes — rejected for this task

Rollback would require command-specific compensation and introduces additional failure states. The requirement is history isolation, not distributed transaction semantics.

### New global command scheduler — rejected

It expands scope substantially and changes latency/ordering behavior for every designer edit. The combined UI, function, record, and session guards solve the confirmed defects with smaller impact.

## 9. Compatibility and rollback

- Compatibility: no data migration, no API change, no persisted-state change.
- Rollback unit: revert the two production files and associated tests/spec updates.
- If a regression appears, the previous behavior is restored by removing the component wrapper/gates and the composable busy rejection; no data rollback is needed.
