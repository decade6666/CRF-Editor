# Implementation Plan

## Ordered checklist

1. Replace the placeholder PRD and keep the approved regular-field/log-row scope explicit.
2. Add `buildCopyVariableName` and pure helper tests for the copy OID collision ladder.
3. Add RED assertions to `designerFieldCopy.test.js` for zero-request regular copy, local draft shape/position, copied values, hidden-definition collisions, and unchanged log-row behavior. Run the targeted test file and confirm the new assertions fail.
4. Update `FormDesignerTab.vue` to build/select a regular-field copy draft locally while retaining the immediate log-row path and all existing guards.
5. Update `saveDraftField` to carry copied order/structural metadata and select the correct history label without changing the new-field path.
6. Add/update frontend source/runtime regressions for draft save, history, and guards; run targeted frontend tests until green.
7. Add the backend `order_index` field-profile route regression without changing backend production code.
8. Run frontend lint and build, targeted backend tests, then the full frontend and backend suites.
9. Review the complete diff, update relevant frontend/root/spec changelog text, and run the final Trellis check.
10. Finish the task artifacts and prepare the feature branch for a PR; do not merge directly to `main`.

## Verification commands

```bash
cd frontend && node --test tests/fieldDefinitionAutocomplete.test.js tests/designerFieldCopy.test.js tests/designerNewFieldDraft.test.js tests/designerHistory.test.js
cd frontend && npm run lint
cd frontend && npm run build
cd backend && python -m pytest tests/test_field_profile.py -q
cd backend && python -m pytest -q
```

Do not run `npm run format`.

## Review gates

- Verify the actual diff after every implementation slice.
- Confirm no regular-field copy request reaches `/api/field-definitions/*/copy`.
- Confirm log-row copy still uses the existing immediate request and history entry.
- Confirm the integer order is the only order value sent to the API.
- Run a code review/check after implementation and before any commit or PR operation.
