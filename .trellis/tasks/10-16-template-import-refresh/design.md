# Technical design: template import selection handoff

## Boundary and data flow

This is a small cross-stack bug fix, not a cache redesign:

1. `ImportService._do_import` initializes a fresh `imported_form_ids` list, appends each `new_form.id` after the existing flush, and preserves all existing creation/naming/ordering logic. `import_forms` retains its existing transaction/error handling.
2. `ImportExecuteResponse` appends a typed list field with `Field(default_factory=list)` after existing fields. The router already builds this response from the service result, so no new route, request argument, database column, or authorization path is needed.
3. `App.vue:executeImport` captures the target project, executes the same POST, invalidates caches, coordinates shared refresh, and requests the first returned target id through the existing designer-ready bridge. Use the real created ids rather than deriving them from source ids/names/list differences.
4. The existing `selectFormById` / `selectForm` flow performs selection and lets the selected-form watcher fetch fields for the right-hand preview. It continues to own dirty/draft/busy checks.

## Local-work safety and refresh ordering

The current global watcher independently calls `loadFormFields`, so merely adding selection after `refreshKey++` can remove a local draft before `selectForm` sees it. The worker must first prove this interaction with a real designer test, then apply the smallest direct fix. Either sequence the handoff safely or narrowly guard refresh writes to local editing state; do not duplicate the save/discard/cancel implementation or change its decisions.

Acceptance is behavioral: a canceled post-import switch leaves the original draft/dirty editor intact, while the newly imported forms still appear in the list. Preserve same-form object-identity/history/reorder contracts; do not replace the selected-form ref just to force a render. Avoid generic refresh/sortable/history refactors.

## Project/session and failure boundaries

- Import completion belongs to the captured target project. Invalidate successful writes even if the user has left; do not select or navigate a different current workspace.
- No selection for zero imports or missing/empty ids in a legacy response; ordinary refresh remains available.
- POST errors retain the existing import-error behavior. A subsequent selection/fields-refresh error must be described as an already-imported-but-not-opened UI failure, not as a failed write that invites duplicate imports.
- Existing save/discard/cancel and busy gates may keep the original form. Never force selection around them.

## Compatibility and security

- Only an additive response field changes the public contract; existing fields and request shape remain identical. Its values are target-project row ids only.
- Keep `verify_project_owner`, template-path whitelisting, read-only template sessions, error mapping, and the existing transaction intact.
- No source-template writes, sensitive configuration reads, new secrets, new API calls outside `useApi`, new dependencies, database migration, or release changes.
- Check directly relevant import/export consumers required by the project AI guide for sync impact; absence of a dependency is a reason not to modify them.

## Ownership and file scope

One Sonnet implementation worker owns production/test/docs edits after activation:

- `backend/src/services/import_service.py`
- `backend/src/schemas/template_import.py`
- `frontend/src/App.vue`
- `frontend/src/components/FormDesignerTab.vue` only if required for demonstrated refresh/dirty/draft safety
- Direct regression files: `backend/tests/test_template_import_selection.py` (new preferred), minimal extensions to existing import tests if necessary; `frontend/tests/component/TemplateImportSelection.spec.js` (new preferred), `frontend/tests/templateImportSelection.test.js` (optional source/runtime guard)
- `README.md`, `README.en.md`, `backend/.claude/CLAUDE.md`, `frontend/.claude/CLAUDE.md`, `.claude/index.json`
- Task-local `verification.md` and task-branch `.context/.../session.log` entries for actual root-cause decisions

The main session owns `prd.md`, `design.md`, `implement.md`, the context manifests, research notes, and `worker-brief.md`. It does not edit the implementation slice concurrently. Anything outside the scope above requires a concrete dependency explanation before broadening.

## Alternatives rejected

- Add a missing refresh event: an event and cache clearing already exist; it would not select the imported form.
- Infer new forms by name/source id/list subtraction: ambiguous under renamed collisions and concurrent writes.
- Full-page reload, forced component remount, timeout/polling: risks losing unsaved state and ignores the existing ready bridge.
- New store/cache framework or migration: unnecessary for an import-to-selection handoff.

## Rollback

No data migration is involved. Revert only this task's response-field/UI/tests/docs changes if necessary; existing import behavior and old clients remain compatible. The worktree and branch stay recoverable until explicit commit/merge/cleanup authorization.
