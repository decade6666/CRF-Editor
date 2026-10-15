# Frontend findings: codelist edit impact threshold

Baseline: `e2f19b4` (2026-10-15). Static investigation only; application, tests, and coverage have not been run in this planning session.

## Verified call chain and defect

| Evidence | Finding |
| --- | --- |
| `frontend/src/components/FormDesignerTab.vue:2871–2875`, `:4041–4049` | The designer resolves the selected codelist and opens the shared dialog in `edit` mode. |
| `frontend/src/components/CodelistQuickEditDialog.vue:188–209` | `confirmSave()` performs the default references GET, warns under `if (refs.length)`, then sends one snapshot PUT. A single reference is sufficient to reproduce the incorrect decision statically. |
| `frontend/tests/component/CodelistQuickEditDialog.spec.js:158–193` | The existing success test supplies one affected form and explicitly expects the warning. This test preserves the unwanted rule, so its warning fixture must become genuinely multi-form when the regression is corrected. |
| `frontend/tests/component/CodelistQuickEditDialog.spec.js:217–240` | The cancellation test also uses one form. Its fixture must become multi-form so it continues to test cancellation rather than accidentally bypassing confirmation under the corrected rule. |

## Existing reuse and compatibility evidence

- `frontend/src/composables/fieldReferenceImpact.js:9–36` counts distinct `(form_name, form_code)` pairs, skips rows without form identity, and never uses `form_id`. Do not claim it counts IDs.
- `frontend/tests/fieldReferenceImpact.test.js:5–36` already verifies identity-pair deduplication, repeated references within one form, and absent identities. Reuse these unit regressions rather than inventing another counter.
- `frontend/src/components/FieldsTab.vue:123–126` already uses `countDistinctForms(refs) > 1` for field-definition edit impact. `frontend/src/components/FormDesignerTab.vue:2166–2175` reuses the same counter for a different field-definition flow (including a candidate-specific threshold); do not change that separate behavior.
- The shared codelist dialog is also mounted by `FieldsTab.vue:372–379`; one fix will cover this existing inline entry as well as the designer. No host API/prop change is needed.
- `frontend/tests/fieldsTabCodelistQuickEdit.test.js:38–47` explicitly locks the default references URL with NO `include_unplaced` flag. `.trellis/spec/guides/cross-stack-contracts.md:960–966` preserves the historical four-key row shape and distinguishes edit impact from delete guards.

## Invariants to keep

- `CodelistQuickEditDialog.vue:130–143`, `:201–232`: preserve captured project/codelist targets, one snapshot PUT, both cache invalidations, awaitable `afterChange`, close/toast order, error handling, and cancellation with no writes.
- `FormDesignerTab.vue:2877–2889`: the host refreshes codelists, current form fields, selection when clean, and the global refresh key after edit. Do not relocate this flow into a new helper or rewrite it.
- Keep warning text and truncation unchanged (`CodelistQuickEditDialog.vue:198–199`); only the decision to show it changes.

## Scope boundary

`frontend/src/components/CodelistsTab.vue:231–261` contains separate dictionary-page metadata/option edit confirmations. These do not call the shared quick-edit dialog. The user's report is the designer quick-edit flow; do not expand to those independent handlers or unit/deletion flows without a separate scope decision.

## Adjacent task: execution ordering

The live peer session `crf-editor-40` reported on 2026-10-15 that it has begun the user-approved `10-14-codelist-pending-option-confirmation` implementation. Its exclusive code/test scope overlaps this task's two primary files. The main session checked that task's artifacts directly in `.claude/worktrees/codelist-pending-option-plan/.trellis/tasks/10-14-codelist-pending-option-confirmation/`:

- `prd.md:22`, `:33–35`: preserve impact confirmation; accepting a pending row must not bypass it, and cancelling impact must not append the row twice on retry.
- `implement.md:42–48`: handle pending-option cancel/close without writes, show the pending-option reminder before reference lookup/impact warning, and retain accepted pending rows locally if impact is cancelled.

Execution prerequisite: wait until that task's implementation is integrated into main and the shared files are no longer concurrently owned. Then safely synchronize/review the execution baseline under the repository's Git rules, retaining this task's uncommitted planning artifacts, before activation/implementation. The peer report is coordination evidence, not authorization to commit or merge from this session.

Preserve the reminder order: pending option → (only if multiple forms) impact confirmation → snapshot save. Review any new pending-option integration tests against this threshold: give impact-confirmation/cancellation fixtures TWO distinct forms instead of deleting their protection or reverting the pending-row reminder. In addition to the baseline cases below, verify accepted pending row + single-form save, accepted pending row + multi-form impact cancellation, and retry without duplicate row insertion once the adjacent implementation exists.

## Required focused spec reads

Before coding/checking, use Read on `.trellis/spec/guides/cross-stack-contracts.md` at the `Reference-Aware Delete Guard` section (baseline lines 946–985) to verify default edit-impact query scope, the four-key response shape, and independent any-reference deletion gates. If line numbers drift, locate that heading first. Follow `.trellis/spec/frontend/quality-guidelines.md:233–256` for real mounts/spies/warning isolation. Full component/cross-stack specs exceed the 32 KiB injection limit; they are intentionally not registered wholesale in JSONL, so this targeted read must not be replaced by assuming the truncated injected prefix contained the relevant contract.

## Execution test guidance (not run here)

Use the existing real component mount infrastructure, with spies on the exported `api` object and `ElMessageBox.confirm`; do not mock the component or the form-count helper. Add behavior cases for zero refs, one ref, repeated refs within one form, distinct forms, same-name/different-code forms, and multi-form cancellation retaining edited inputs. Include one deferred confirmation assertion proving PUT waits for confirmation. Retain error/cache/refresh and stale-target regressions.

```bash
cd frontend && npm run test:component -- tests/component/CodelistQuickEditDialog.spec.js
cd frontend && node --test tests/fieldReferenceImpact.test.js tests/fieldsTabCodelistQuickEdit.test.js tests/formDesignerPropertyEditor.runtime.test.js tests/referenceDeleteGuard.test.js tests/referenceDeleteWiring.test.js
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
```

Commands and suite separation are verified by `frontend/package.json:6–13`, `frontend/vitest.config.js:8–12`, and `.trellis/spec/frontend/quality-guidelines.md:233–256`. No frontend coverage provider is declared in `frontend/package.json:22–33`; do not promise a measured percentage or install new tooling as part of this fix without approval.
