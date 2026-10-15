# Codelist quick-edit impact warning: multiple forms only

## Goal

When editing an option dictionary from the form designer, remove the unnecessary warning for a change affecting only one form. Keep an explicit confirmation when the same dictionary affects multiple forms.

## Background

- User report and screenshot (2026-10-15): the “编辑选项字典” save opens “影响提醒” although the listed affected field belongs to the current form only.
- Planning baseline: `e2f19b4`. Evidence is from static source/spec/test inspection, not a live browser reproduction.
- This turn explicitly authorizes creating the task and repair plan for a later Sonnet session. It does not authorize implementation or automatic dispatch.

## Requirements

### R1 — Decide by distinct forms, not reference rows (P2 defect)

`frontend/src/components/CodelistQuickEditDialog.vue:196–199` currently uses `if (refs.length)`, so one affected field is sufficient to trigger the warning. The existing success and cancellation fixtures reinforce that rule with one form (`frontend/tests/component/CodelistQuickEditDialog.spec.js:158–193`, `:217–240`). Correct the predicate and those fixtures together.

Reuse `countDistinctForms` from `frontend/src/composables/fieldReferenceImpact.js:9–36`, whose same-form deduplication is already tested by `frontend/tests/fieldReferenceImpact.test.js:5–36`. The current identity is `(form_name, form_code)`, **not `form_id`**. The current Form model declares per-project unique names and codes (`backend/src/models/form.py:21–30`); the endpoint emits no IDs and its historical four-key row shape is locked by `backend/tests/test_reference_delete_contract.py:341–364`. Reuse this identity contract without an API change; a same-name/different-code component fixture is a synthetic robustness case, not a claim that the normal schema permits duplicate names.

### R2 — Warn only for two or more affected forms

- Zero or one distinct form: no impact confirmation, even with many affected fields/reference rows within that form.
- Two or more distinct forms: keep the existing “影响提醒”, affected-field details, and truncation; wait for confirmation before writing.
- Count forms returned by the existing query; do not synthesize an extra current-form reference or count visit placements as separate forms.

### R3 — Preserve save and shared-data semantics

Keep the references GET, one snapshot PUT, captured operation targets, both cache invalidations, awaited `afterChange`, host refresh/selection, result messages, failure handling, and existing stale-target protections (`CodelistQuickEditDialog.vue:130–143`, `:188–232`; `FormDesignerTab.vue:2877–2889`). Multi-form cancellation must preserve the draft and send no write/cache-invalidation/host-refresh action. Editing still updates the shared dictionary, not a private clone.

### R4 — Fix the existing shared quick-edit entry, without broadening scope

The designer (`FormDesignerTab.vue:2871–2875`, `:4041–4049`) and field-library inline editor (`FieldsTab.vue:372–379`) already use this dialog; both inherit the corrected rule without new props or host-flow rewrites. Keep the references URL in default placed-only mode with no `include_unplaced` flag (`frontend/tests/fieldsTabCodelistQuickEdit.test.js:38–47`; `.trellis/spec/guides/cross-stack-contracts.md:960–966`). Preserve the four-key reference-row contract and all any-reference delete guards.

### R5 — Test first, document narrowly, stop at planning now

The executor must demonstrate RED with a real component regression before applying the minimal predicate change, then run the verification matrix in `implement.md`. Synchronize user-visible behavior documentation through the existing README/module/index convention without adding tooling or restructuring code. This planning turn must leave status `planning`, with no `task.py start`, application/test changes, implementation-agent dispatch, commit, merge, push, or worktree cleanup.

## Acceptance Criteria

| ID | Requirement | Expected result |
| --- | --- | --- |
| AC1 | R1–R2 | One form/one affected field saves without calling the impact confirmation. |
| AC2 | R1–R2 | Multiple fields or repeated reference rows in one form still save without confirmation. Zero references also saves without confirmation. |
| AC3 | R1–R2 | Two different form identities require exactly one confirmation, including duplicated rows in either form and a synthetic equal-name/different-code fixture. No PUT occurs while confirmation is pending. |
| AC4 | R3 | Cancelling a multi-form confirmation preserves edited inputs and the open dialog; no PUT, cache invalidation, or `afterChange`. Confirming performs the existing single snapshot PUT and refresh/close/result flow. |
| AC5 | R5 | Artifacts include verified root-cause anchors, bounded file scope, ordered test-first execution, verification commands, and the explicit later execution gate; no implementation in this turn. |
| AC6 | R3–R4 | Default references URL, cache keys, payload, failure/stale-target behavior, and delete guards remain unchanged; existing relevant regressions stay green after implementation. |
| AC7 | R4–R5 | Designer and field-library inline hosts use the same corrected shared dialog; documentation does not claim unrelated dictionary-page handlers changed. After the adjacent task is integrated, pending-option acceptance still precedes any required multi-form warning, and cancelling impact then retrying does not duplicate the option. |

## Out of Scope

- Standalone dictionary-page metadata/option handlers (`frontend/src/components/CodelistsTab.vue:231–261`), unit editing, field-definition candidate thresholds, or any deletion policy.
- Backend query/filter/authorization changes, reference-row extensions, database migrations, dictionary cloning/sharing changes, new helpers/dependencies, or build/release-process changes.
- Production/clinical data access, credential inspection/generation, dependency installation, app launch, or code-test execution during this planning turn.

## Execution Dependency

`10-14-codelist-pending-option-confirmation` is being implemented by another session in the same shared component/test files (coordination report received 2026-10-15; verified artifacts: that task's `prd.md:22`, `:33–35`, `implement.md:42–48`). Wait for its integration into main and release of file ownership; then safely synchronize and recheck the baseline before implementing this task. Preserve its pending-option reminder before the impact check. Its integration fixtures that need an impact warning must use multiple forms under the corrected rule; accepted pending row + multi-form cancellation/retry must not duplicate options. Details and provenance are in `research/frontend-impact-threshold.md`.

## Evidence and Execution Materials

- `research/frontend-impact-threshold.md`: frontend trace, reuse, incorrect existing fixtures, and test guidance.
- `research/codelist-reference-api.md`: backend reference contract and identity constraints verified by the main session; not an independent review.
- `design.md`: minimal frontend predicate decision and compatibility boundaries.
- `implement.md`: ordered work board, exact commands, browser/coverage preconditions, and future task activation.
- `implement.jsonl` / `check.jsonl`: curated spec/research context for the later executor and reviewer.
