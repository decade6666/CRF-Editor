# Design: multi-form-only codelist quick-edit confirmation

## Scope and Decision

Use the existing frontend form-reference counter in `CodelistQuickEditDialog.vue`; change the warning predicate only. Keep one shared rule for the designer and the field-library inline codelist editor, which already render this component. Do not add a designer-specific prop, a second counter, backend filtering, or a new endpoint.

This is an execution proposal, not implemented code. Task activation and implementation require a subsequent user request.

## Existing Data Flow

1. The host selects a codelist and opens the shared dialog in edit mode.
2. `confirmSave()` validates the draft and captures project/codelist IDs.
3. It fetches `GET /api/projects/{projectId}/codelists/{codelistId}/references` with no query flag.
4. It currently warns on any non-empty row array (the defect).
5. On approval, or when no warning is needed, it saves once through `PUT …/snapshot`, invalidates both caches, awaits the host callback, closes, and shows the existing result message.

Exact source anchors and the old test expectations are recorded in `research/frontend-impact-threshold.md`; backend response semantics are recorded in `research/codelist-reference-api.md`.

## Proposed Predicate and Identity Contract

Import `countDistinctForms` from `../composables/fieldReferenceImpact` and replace the non-empty-list condition with:

```javascript
if (countDistinctForms(refs) > 1) {
  // Keep the existing field-reference message and confirmation unchanged.
}
```

The current helper deduplicates the endpoint's `(form_name, form_code)` identity pairs and skips rows without form identity. It does **not** count `form_id`. The API has a historically fixed four-key reference-row contract; adding IDs or changing that contract is not part of this proposal. The current Form model enforces project-scoped unique names/codes (`backend/src/models/form.py:21–30`), so no extra identifier is needed for the supported schema. Same-name/different-code synthetic fixtures still guard against a future name-only counter; they are not a normal-schema data claim. The execution handoff must not replace this with `refs.length > 1`: one codelist can affect several fields in the same form.

| Distinct affected forms | Result |
| --- | --- |
| 0 | Save without impact confirmation. |
| 1, with one or many reference rows | Save without impact confirmation. |
| 2 or more | Show the existing “影响提醒” and wait for confirmation before any write. |

This aligns the quick-edit predicate with the established field-library edit-impact rule without modifying that separate flow. Count only the forms actually returned by the codelist references query: do not add the current designer form synthetically or apply the field-definition candidate-specific zero threshold. A form reused by several visits is still one form, not several forms.

## Compatibility Boundaries

- Keep references GET before PUT; do not skip the lookup or interpret lookup failures as an empty list.
- Do not pass `include_unplaced=true`: that opt-in scope belongs to delete guards, not edit-impact notices.
- Preserve message text, field details, truncation, option IDs/codes/order, and the atomic snapshot request.
- Preserve `cancel` behavior, draft retention, saving-state release, stale-target protections, cache invalidation, callbacks, refresh/selection, and existing error reporting.
- Editing still changes the shared dictionary; suppressing a single-form warning must not clone or fork it.
- No schema migration, authentication/authorization change, dependency, script-runner, or build/release-process change.
- The standalone dictionary-page handlers (`CodelistsTab.vue`) and unit/delete/field-definition confirmation flows are outside this designer quick-edit fix. The existing inline field-library codelist entry inherits the shared fix; do not fork the component just to prevent that.

## Regression Design

Use real component mounts and real `countDistinctForms`, spying only at the `api` and `ElMessageBox` boundaries. First add single-form regressions and demonstrate RED against the unchanged component. Then apply the predicate change and demonstrate GREEN.

The old success and cancellation tests intentionally expect warnings for one form. Update their fixtures to contain two real identity pairs, preserving all their save/cache/refresh/error assertions; do not delete the confirmation tests or simply remove their warning assertions. Add a deferred multi-form confirmation check so an early PUT cannot pass the suite.

## Adjacent Pending-Option Task

Execution follows integration of `10-14-codelist-pending-option-confirmation`, which currently owns the same component/test files in another worktree. Preserve the integrated entry guard/lifecycle behavior and the prompt order: pending option → multi-form impact confirmation when applicable → save. Adjust only impact-test fixtures that formerly assumed a single-form warning. A pending-option acceptance must not bypass a required multi-form confirmation, and cancelling impact then retrying must not append the accepted option twice. See the directly checked task-artifact anchors in `research/frontend-impact-threshold.md`.

## Operational and Rollback Notes

The change affects when confirmation is requested, not the data mutation contract. If live verification is performed, use an isolated throwaway project/database, authorized non-production credentials, and both single-form and multi-form cases; never edit clinical/production data. Keep the generated frontend build consistent with the checked source when validating a hosted bundle. Rollback is limited to the dialog predicate/import and its accompanying tests/docs, subject to normal explicit Git/removal authorization; no data migration is involved.
