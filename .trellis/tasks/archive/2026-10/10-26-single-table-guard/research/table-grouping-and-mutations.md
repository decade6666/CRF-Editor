# Horizontal-block editing guard — source evidence

## Confirmed product decisions (2026-10-26)

The PRD owns the requirements: horizontal blocks only; `after <= max(1, before)` for legacy compatibility; editing only, with imports and whole-form/project copy excluded; immediately roll back only the offending local change and preserve unrelated unsaved content.

## Grouping and ordering

- `frontend/src/composables/formFieldPresentation.js:98-134` emits one `normal` or `inline` group per contiguous run; the active branch uses marker truthiness. `backend/src/services/export_service.py:1817-1845` groups by `inline_mark == 1`. For canonical 0/1 markers both produce the same segments. Count horizontal runs, not all segments or the number of marked fields.
- Canonical examples (`N=0`, `I=1`): empty/`NN` → 0 restricted blocks; `II` / `NIN` → 1; `INI` → 2. A marker-0 label/log row separates runs exactly like an ordinary field; grouping itself does not skip structural field types.
- Backend empty-form export uses an empty normal group (`export_service.py:1820-1821`); this is not a horizontal block and is irrelevant to the selected product rule.
- Actual grouping has no active unified-table merge. Do not modify column planners or export rendering for this feature.
- `backend/src/repositories/form_field_repository.py:30-45` orders persisted fields by `(order_index, id)`. `FormDesignerTab.vue:390-410` provides the matching frontend sort.
- Copy drafts already encode the intended insertion point: `FormDesignerTab.vue:801-829` sets `__draftOrderIndex = source + 1` and fractional `order_index = source + 0.5`. The backing array is appended at `:986-989`, but the designer projection sorts it at `:1436-1441`. The main preview currently groups the raw array at `:1421`, so guard/copy-preview checks must not mistake raw append order for the intended persisted insertion order. Reuse the existing sorted projection rather than changing copy insertion semantics.
- Noncanonical marker edge: `schemas/field.py:105-117` and `schemas/field_profile.py:74-85` accept integers without a 0/1 range constraint. The model (`models/form_field.py:43-44`) also has no range check. A new guard must not silently undercount marker `2`/negative values that the existing preview treats as enabled. Prefer counting enabled truthy integer markers consistently in the guard without rewriting legacy values or changing the existing renderer/export/API schemas. Canonical export equivalence tests should explicitly use 0/1 fixtures; document this pre-existing noncanonical preview/export difference instead of claiming complete equivalence for arbitrary integers.

## Relevant edit boundaries and transactions

| Entry point | Source | Required validation boundary |
|---|---|---|
| Direct instance create / log-row create-copy / delete undo | `routers/fields.py:294-332` | Capture count before insertion, then inspect final ordered rows after flush; handle both append and explicit insertion. |
| Draft create-profile | `routers/fields.py:335-352`; `services/field_profile_service.py:211-264` | Capture before definition creation/shared update, then inspect normalized instance + final insertion; rejection must roll back all side effects. |
| Persisted binding-profile | `routers/fields.py:355-377`; `field_profile_service.py:267-311` | Inspect final normalized current instance after binding/type changes. Definition, binding, cleanup, and marker changes share the request transaction. |
| Reorder | `routers/fields.py:390-400`; `repositories/form_field_repository.py:56-59` | Keep complete/duplicate/foreign-id validation and two-phase ordering; compare final ordered rows before transaction exits. |
| Single/batch/profile delete | `routers/fields.py:380-387,403-426`; `field_profile_service.py:280-284` | Deletion cannot increase runs; restoration goes through guarded create/profile routes. No new delete restriction is needed. |
| Shared-definition PUT | `routers/fields.py:127-165` (research finding) | Currently does not normalize all referencing instance markers. Do not introduce cross-reference normalization/validation as an unrelated change. |

`backend/src/database.py:958-963` wraps request sessions in `session.begin()`. Profile helpers flush, not commit. A domain failure before the context exits rolls back the request. `_apply_instance_upsert` at `field_profile_service.py:161-173` always normalizes marker/default value for the final type, even when the instance payload omits `inline_mark`; checking only marker-bearing payloads is insufficient. `field_normalization.py:57-65` forces forbidden structural types/log rows to marker 0.

## Frontend local state, rollback, and history

- `FormDesignerTab.vue:1173-1195`: drag/keyboard reorder shares optimistic replacement, exact previous-array rollback, no history on failure, and a fixed generic warning. New business-rule errors must show the specific reason without breaking the existing generic network-failure warning.
- `:1875-1964`: quick edit and inline toggle only update committed lists after request success. Add local prospective checks and preserve the existing context/session guards.
- `:2212-2295,2521-2566`: explicit property save currently retains dirty input on failure; the new rule must revert only the offending marker/type/candidate action, not reset unrelated edits or the whole baseline.
- `:2027-2057,1336-1361`: type changes and explicit candidate selection may normalize marker/default state. Check prospective effective state before accepting the operation; reject/restore its dependent candidate/OID/type state together.
- `:2324-2333,2569-2594`: draft edits mirror into local form rows. `:2626-2674` creates a local draft; `:2676-2857` saves it atomically through field-profile. A layout guard must run before invalid draft/editor state enters either preview, not just on Save.
- `:916-929,933-951`: history reorder and the common replay runner. `useDesignerHistory.js:62-98` already keeps stacks and ID snapshots when replay throws; no broad history-engine rewrite is needed.
- `:1130-1137`: batch-delete undo recreates rows one at a time. Preflight the whole intended restoration against the current layout before the first write; otherwise an ordinary separator may be rejected only after earlier rows were recreated. Apply replay deltas to current fields, not a stale whole-form historical snapshot.
- `:2813-2822`: candidate-shared-definition undo currently uses definition PUT then profile delete; the delete cannot increase block count. This is an existing multi-request flow, not a new atomicity guarantee.
- General multi-request replay network/concurrent-remote failures are not globally transactional today. This task must prevent partial replay caused by a predictable new business-rule rejection, but must not claim to redesign all replay transactions.

## Scope exclusions and stale descriptions

- Research traced imports/copies to `import_service.py:808`, `project_clone_service.py:285`, `docx_import_service.py:1545`, and `routers/forms.py:288`: they preserve or construct markers without this new edit constraint. Leave them unchanged per the PRD.
- No current single-horizontal-block or grandfather policy was found; these are new requirements, not a repair of currently invalid data.
- The current designer has no independent `addField`/field-library drag-in function; reuse goes through autocomplete candidate selection and profile save. Some module notes still mention the removed path. Update only task-relevant wording when synchronizing module docs, not unrelated documentation history.

## Existing regression anchors

- `frontend/tests/designerFieldReorder.test.js:528`: rejected reorder restores old order, warns, skips history, permits retry.
- `frontend/tests/designerHistory.test.js:258`: failing undo retains stack and propagates the error.
- `frontend/tests/component/FormDesignerFieldReorder.spec.js:96-171`: real mounted drag/drop and DOM-order harness.
- `frontend/tests/component/OidEditSave.spec.js:211-493`: real property/candidate/new/copied-draft save harness.
- `frontend/tests/formFieldPresentation.test.js:211,224`; `formDesignerPreviewModel.test.js:193`; `quickEditBehavior.test.js:213` (research anchors).
- `backend/tests/test_field_profile.py:653-704`: definition/instance rollback checks. Add cases that actually reach mutation then fail the new final-layout check, not merely schema-validation failures.
- `backend/tests/test_phase0_ordering_contracts.py:935-958`: incomplete reorder ID list remains HTTP 400 with unchanged order.
- `backend/tests/test_phase0_ordering_contracts.py:961-1009`: quick edit of the middle ordinary field to inline currently succeeds; its `NIN` outcome remains allowed under the chosen horizontal-only policy.
- `backend/tests/test_export_unified.py:255,301` (research anchors): legacy filename does not mean the active renderer merges all tables.

## Verification provenance

The read-only research agent reported 12 canonical grouping samples per side and this existing-baseline command: `cd frontend && node --test --test-reporter=tap tests/formFieldPresentation.test.js tests/formDesignerPreviewModel.test.js tests/quickEditBehavior.test.js` → 77 passed, 0 failed, 0 skipped. These are old-behavior tests, not RED/GREEN evidence for the new guard; model A has not rerun them in planning. The agent reported no file writes, dependency installation, backend pytest, component/browser checks, or real DOCX export. Main-session source review confirmed the key grouping, transaction, normalization, copy-order, editor, and history anchors above.
