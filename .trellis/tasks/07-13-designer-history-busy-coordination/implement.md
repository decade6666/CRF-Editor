# Implementation Plan — Designer history busy / form-session coordination

## Preconditions

- Task remains in `planning` until this plan is reviewed and explicitly approved.
- Work is frontend-only; do not modify backend files or API contracts.
- Preserve the existing eight history labels and replay payloads.

## 1. RED — Add failing coordination tests

Edit `frontend/tests/designerHistory.test.js` first.

- [ ] Assert a normal valid `record()` returns `true`.
- [ ] Add deferred undo and redo cases proving `record()` is rejected while replay is busy and both stacks settle without the injected record.
- [ ] Add component-source coordination assertions for the single record wrapper, `{formId, sessionId}` capture, A → B → A rejection, all eight record labels, and both reorder callers.
- [ ] Assert busy UI/function guards cover field-library add, draft save, log-row add, copy, persistent delete, batch delete, drag/keyboard sort, and property forms.
- [ ] Run the targeted history test and confirm the new assertions fail for the expected missing behavior:

```bash
cd frontend && node --test tests/designerHistory.test.js
```

Rollback point: test-only diff.

## 2. GREEN — Harden the history composable

Edit `frontend/src/composables/useDesignerHistory.js`.

- [ ] Make `record()` return `false` for replay-busy or invalid entries.
- [ ] Keep the current immutable stack update, 20-entry cap, and redo clearing.
- [ ] Return `true` after a record is accepted.
- [ ] Do not change undo/redo exception or id-snapshot restoration behavior.
- [ ] Run `designerHistory.test.js` and verify the composable runtime cases pass; component wiring cases may remain red until step 3.

Rollback point: composable-only change can be reverted independently.

## 3. GREEN — Add current-session record coordination

Edit `frontend/src/components/FormDesignerTab.vue`.

- [ ] Add `captureDesignerHistoryContext` and `recordDesignerHistory` beside existing history helpers.
- [ ] Require both session equality and selected-form-id equality before recording.
- [ ] Replace all eight business-level direct `designerHistory.record()` calls with the wrapper; only the wrapper may call the composable directly.
- [ ] Capture context before the first relevant async boundary in add, copy, persisted delete, batch delete, property save, draft save, log-row add, and both sort entry paths.
- [ ] Pass context through shared `recordReorderHistory` rather than reading current selection after the reorder request.
- [ ] Keep stale backend side effects unchanged and silently omit only their history entry.

Rollback point: context wrapper and call-site conversion form one atomic component diff.

## 4. GREEN — Gate busy edit entry points

Continue in `frontend/src/components/FormDesignerTab.vue`.

- [ ] Add function-entry busy guards to persistent history-producing commands, including drag and keyboard sorting.
- [ ] Disable the field-library add button and history-producing toolbar/row buttons while busy.
- [ ] OR busy with existing `savingDraft` / `copyingFieldIds` disabled/loading semantics rather than replacing them.
- [ ] Disable both property-editor form branches while busy.
- [ ] Make field rows non-draggable while busy.
- [ ] Ensure selection-only behavior and undo/redo loading behavior remain unchanged.

## 5. Focused regression validation

Run:

```bash
cd frontend && node --test \
  tests/designerHistory.test.js \
  tests/designerFieldCopy.test.js \
  tests/designerNewFieldDraft.test.js \
  tests/orderingStructure.test.js \
  tests/quickEditBehavior.test.js
```

If an existing source-level test expects direct `designerHistory.record()`, update it to assert the new wrapper without weakening the underlying behavior contract.

## 6. Documentation and specification sync

- [ ] Update `frontend/.claude/CLAUDE.md` history notes with busy rejection and form-session isolation.
- [ ] Add the reusable history coordination contract and required tests to `.trellis/spec/frontend/state-management.md`.
- [ ] Do not change README files unless implementation introduces user-visible behavior beyond temporary disabled controls.
- [ ] Append the solution choice and rejected queue/rollback alternatives to `.context/current/branches/draft/session.log` because this is a concurrency design decision and bug fix.

## 7. Full verification

Run and record exact results:

```bash
cd frontend && node --test tests/*.test.js
cd frontend && npm run lint
cd frontend && npm run build
```

UI/browser check when the local app can be started:

- [ ] Open a form with at least one undoable operation.
- [ ] Trigger an undo/redo whose request remains pending long enough to observe the loading state.
- [ ] Confirm history-producing controls and property forms are disabled during that window and recover afterward.
- [ ] If timing cannot be held reliably or the backend cannot start, report browser validation as not run and rely on the deferred-promise/runtime plus source wiring tests; do not claim live verification.

## 8. Review and quality gates

Because the expected code diff exceeds 30 lines:

- [ ] Run the Trellis check pass against PRD/design/implementation scope.
- [ ] Run `/ccg:verify-change` and then `/ccg:verify-quality frontend/src`.
- [ ] Run code review focused on stack invariants, stale A → B → A completion, missed record sites, and regressions in autosave/draft/reorder flows.
- [ ] Fix Critical/High findings and rerun affected verification.

## 9. Completion gate

Before finish/commit:

- [ ] Confirm all acceptance criteria in `prd.md` have evidence.
- [ ] Confirm `git diff` contains no backend, dependency, build-script, or unrelated refactor changes.
- [ ] Update Trellis specs in Phase 3 and review the final diff.
- [ ] Commit only after the required Trellis finish step and explicit workflow authorization; use a Conventional Commit such as `fix(designer): coordinate history with busy session state`.
