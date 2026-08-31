# Designer Field Copy as a Local Draft

## Goal

Change the form designer so copying a regular field creates an in-memory draft instead of immediately writing to the database. The copied field is persisted only after the user clicks Save, matching the existing New Field workflow.

## Requirements

- Clicking Copy on a regular field must make zero API requests and add one local draft row immediately below the source row.
- The draft must copy the source field's instance presentation values and full field-definition values, including `checkbox_label`, `is_multi_record`, and `table_type`.
- The copied variable name must be generated locally with the same collision ladder as the backend: `<source>_copy`, then `<source>_copy1`, `<source>_copy2`, and so on. All project field definitions, including definitions hidden from the field library, participate in collision checks.
- The draft must use the existing draft controls and guards: one draft at a time, unsaved-draft confirmation before leaving, local Cancel, and explicit Save.
- Saving a copied draft must use the existing atomic field-profile endpoint, insert the real instance immediately after the source, and record one `复制字段` history entry. Undo/redo after saving must retain the existing history replay behavior without OID drift.
- Copying a log row remains the existing immediate-save operation because log rows do not have field definitions and are not stored in the field library.
- The backend production implementation must remain unchanged; its existing `FieldProfileCommand.order_index` insertion support is the persistence contract.
- Update frontend and backend regression tests and the relevant project/module specifications for the changed user-visible behavior.

## Acceptance Criteria

- [ ] Regular-field Copy creates a visible `__draft__` row, sends no request, and selects the draft.
- [ ] The draft is positioned directly below the source in the local list and saves at the corresponding integer order.
- [ ] Local OID generation follows the backend collision ladder and checks hidden definitions.
- [ ] Cancel, draft guards, duplicate-copy handling, and property editing behave like New Field drafts.
- [ ] Save sends the field-profile request only, preserves copied definition/instance values, and records the `复制字段` history label.
- [ ] Saved-copy undo/redo continues to work; log-row copy remains immediate and undoable.
- [ ] Targeted and full frontend/backend tests, lint, and build pass.

## Constraints

- Keep the change scoped to the frontend behavior and tests; do not change backend production routes or services.
- Keep API calls behind `useApi.js` and preserve existing history/session/membership guards.
- Do not run `npm run format`; it rewrites unrelated frontend files in this repository.
