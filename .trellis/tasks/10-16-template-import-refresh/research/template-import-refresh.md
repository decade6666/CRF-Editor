# Template import refresh evidence

## Confirmed current behavior

1. `frontend/src/App.vue:649-668`: `executeImport` POSTs the selected template forms, shows success, closes the dialog, calls `api.clearAllCache()`, then increments the provided `refreshKey`.
2. `frontend/src/components/FormDesignerTab.vue:276-295,424-432`: the consumer already watches `refreshKey`, calls `loadForms`, refreshes loaded auxiliary data and selected form fields. `loadForms` only replaces the form list; `reloadForms` additionally reconciles selected-form metadata while preserving identity, but the watcher does not use it.
3. `frontend/src/components/FormDesignerTab.vue:1754-1814,3149-3160,3246-3251`: list selection and the right-hand canvas use an independent `selectedForm` ref. Same-id table echoes and null table events are ignored. Actual selection goes through async dirty/draft/busy leave guards. `selectFormById` is already exposed and must be reused if selection is required.
4. `frontend/src/App.vue:677-683`: Word-import completion already uses the designer selection bridge, but template import does not make any selection request.
5. `backend/src/services/import_service.py:656-663,779-821`: template import creates new forms (renaming collisions), not an overwrite of the selected target form. The response summary exposes counts/rename information, not created form ids.
6. `frontend/src/composables/useApi.js:99-122,156-183`: clear/invalidate removes both cached data and pending dedup entries, and generation-gates cache write-back. A cache redesign is not supported by the present evidence.

## What is not yet proven

- No runtime reproduction has run yet. Do not claim that cache invalidation or the refresh event is missing: both exist in the baseline.
- The report may refer to an unchanged canvas after import (a missing post-import selection handoff), a selected-form metadata synchronization defect, or stale served build artifacts. Tests/browser evidence must distinguish these cases before modifying production code.
- User decisions are now resolved: display the first newly imported form and allow the additive `imported_form_ids` response field. Reuse the existing guarded selection bridge; do not infer ids from names/list differences.
- Follow-up safety evidence: `FormDesignerTab.vue:424-432` reloads fields independently of `selectForm`'s draft guard at lines 1779-1785. Establish a real regression to ensure global refresh does not erase local work before a canceled switch.

## Existing reusable patterns

- Mount real `FormDesignerTab` and spy only on `api` boundaries: `frontend/tests/component/FormDesignerFieldReorder.spec.js:9-117`; mock SortableJS only for happy-dom layout.
- Designer ready bridge: `frontend/src/composables/useDesignerFormSelection.js`, tests `frontend/tests/useDesignerFormSelection.test.js`.
- Import error/source guards: `frontend/tests/importRenameFeedback.test.js`.
- Shared refresh contracts and dirty-leave/session rules: `.trellis/spec/frontend/state-management.md` (refreshKey scenario at line 280; leave guards at line 344; session coordination at line 624).
- Frontend real-mount test conventions: `.trellis/spec/frontend/quality-guidelines.md:233-257`.

## Constraints

- The main session owns planning and final acceptance; one Sonnet worker owns the authorized implementation slice after the task starts. No concurrent writers for the same files.
- No commits/pushes/merges, dependency or build-script edits, real/private databases, credential inspection, deployment, or unrelated fixes.
- Require RED before GREEN, actual diff review, relevant node:test + component tests, lint/build, and feasible browser validation; report failures and skipped/environment-blocked checks faithfully.
