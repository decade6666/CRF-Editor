# Backend reference contract for the codelist impact decision

Baseline: `e2f19b4` (2026-10-15). Completed by the main session through static source/spec/test inspection. The delegated research slice did not deliver its artifact and was explicitly stopped before main took ownership; this is not an independent review. No tests, live API, credentials, or user/production data were used.

## Verified findings

| Question | Evidence and conclusion |
| --- | --- |
| Which endpoint does the dialog use? | `backend/src/routers/codelists.py:229–243`: `GET /api/projects/{project_id}/codelists/{cl_id}/references`, with `include_unplaced=False` by default. It returns the selected codelist's rows or `[]`. |
| What does a row contain? | `backend/src/services/field_definition_reference_service.py:55–74` emits exactly `{form_name, form_code, field_label, field_var}`. There is no `form_id`. `backend/tests/test_reference_delete_contract.py:341–364` explicitly locks the historical key set; cross-stack §14 (`.trellis/spec/guides/cross-stack-contracts.md:960–966`) confirms that this shape must remain unchanged. |
| Is the endpoint already form-deduplicated? | No. The default query inner-joins `Form → FormField → FieldDefinition` and appends a row per joined result (`field_definition_reference_service.py:55–72`); it has no DISTINCT/grouping. Several fields using one codelist in the same form can therefore produce several rows. The frontend must not use raw row count as form count. |
| Does the default lookup include unplaced field-library definitions? | No. The service documents and implements placed-only inner joins by default (`:33–38`, `:55–62`); the flag switches to outer joins (`:47–54`). `test_reference_delete_contract.py:185–196` verifies default empty vs flagged unplaced rows. Edit-impact callers must not opt into the delete-preflight scope. |
| Are multiple forms already represented without an API change? | Yes. `test_reference_delete_contract.py:279–290` covers a codelist placed in two forms, returning two different form name/code identities in both modes. This supports frontend-only distinct-form counting. |
| What identity can the existing helper use? | The frontend helper uses `(form_name, form_code)`. `backend/src/models/form.py:21–30` declares project-scoped uniqueness for both name and code; name is non-null, code is nullable. Thus the current model supports reusing the existing identity pair without adding IDs. Do not promise ID-based counting or claim nullable code alone is a universal identity. No historical-database audit is part of this task. |
| Does visit reuse change the count? | The query joins forms and field instances, not `VisitForm` (`field_definition_reference_service.py:55–62`); the Form model explicitly represents a form independently of visits (`models/form.py:18–19`). Several visit placements of one form are not multiple forms. |
| What permission boundary must remain untouched? | The router checks project ownership before codelist project-membership lookup (`codelists.py:238–239`). Existing relevant tests are named `test_codelist_references_reject_other_user_for_both_modes`, `test_codelist_references_owner_check_precedes_existence`, and `test_codelist_references_owner_still_gets_correct_rows` (`test_reference_delete_contract.py:694–740`). This fix needs no permission changes. |

## Recommendation

Reuse frontend `countDistinctForms(refs) > 1` for the shared quick-edit warning only. Keep the references endpoint, row set, field details, four-key row shape, default flag behavior, project/resource authorization order, and deletion guards unchanged. Do not add `form_id`, backend form filtering, a count endpoint, or `include_unplaced=true` as part of this fix.

A same-name/different-code component fixture is a synthetic counter-robustness test, not a claim that the normal project model permits duplicate form names. The model uniqueness declaration is evidence about current supported schema, not proof that arbitrary imported legacy databases satisfy all constraints.

## Existing verification commands (not run in planning)

These are optional backend contract regressions for a frontend-only change, and become required if a separately authorized implementation alters backend/query/reference/permission code:

```bash
cd backend && python3 -m pytest tests/test_reference_delete_contract.py -q
cd backend && python3 -m pytest tests/test_reference_delete_contract.py -k 'default_mode_rows_keep_exact_historical_shape or codelist_placed_in_two_forms or codelist_unplaced_reference' -q
```

Use the project's existing development environment and hermetic test setup; do not point tests at a real database or inspect stored credentials. No backend application/test edits are proposed.
