# C1 Design — Existing Domain Editor Wiring

## Scope and Evidence

Implement parent R4 through the existing nullable string in `backend/src/models/form.py:31` and `backend/src/schemas/form.py:93`/`:109`/`:128`. The backend update loop already applies supplied fields; no new schema/migration or annotation geometry is planned.

Current gaps: `frontend/src/composables/formDesignerPropertyEditor.js:113`/`:121` omit domain from property snapshot/equality, and `frontend/src/components/FormDesignerTab.vue:627`/`:666` omit it from the shared dialog/inline save path. Annotation reads already exist at `:168`; Word receives `form.domain` at `backend/src/services/export_service.py:1508`.

## Data Flow

Extend the property-state helper and the component's corresponding model/baseline, create dialog, edit dialog and inline card. Bind the input only in full mode. Carry domain through shared property persistence rather than a second API path. Hydration of existing values is not authoring normalization.

A user-cleared/whitespace-only entry may serialize to null consistently with the existing optional field; preserve nonblank text and case. Do not apply `toUpperAsciiOid`, OID validation, delimiter parsing or lookup. Keep imported values untouched when the user changes another property. The string remains optional and is safely displayed as text.

## Guards and Compatibility

Dirty equality includes domain. Existing save/discard/cancel, form/project/tab leave and selection/session guards apply; a failed save cannot clear domain input or its baseline. Preserve reference-impact prompts and orientation/OID behavior. If a create dialog and inline card share different local models, update all call sites together.

C4 later adds a precondition to this shared save path; C1 must not invent an incompatible version parameter or bypass `useApi.js`. Preview data comes from authoritative saved FormResponse, including the visits preview; no new renderer or CSS policy.

## Planned File Scope

- `frontend/src/composables/formDesignerPropertyEditor.js` and `frontend/src/components/FormDesignerTab.vue`.
- Existing property/source tests and mounted coverage; add narrowly scoped component tests when the existing host harness cannot reach a surface.
- Backend domain CRUD/export regressions as needed to prove existing support; backend implementation changes only if RED evidence contradicts current code.
- User docs/module docs/index update only when the feature actually lands.

## Verification / Rollback

Test mixed case, punctuation/free text, blank/null, unrelated-property save, save error, cancel and mode/leave behavior. Check annotated designer/visits/Word with the same text and unchanged eCRF/table parity. Reverting the UI wiring leaves stored domain supported; never clear data as rollback. Any need for a new domain model/geometry returns to scope review.
