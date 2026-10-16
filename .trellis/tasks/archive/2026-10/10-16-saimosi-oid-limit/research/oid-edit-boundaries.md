# OID Editing and Save-Boundary Evidence

Research scope: existing database-type metadata and field/form OID write boundaries. Planning only; no application changes or tests were executed.

## Confirmed Backend Facts

| Topic | Evidence | Consequence for this task |
| --- | --- | --- |
| Database type | `backend/src/schemas/project.py:32-57` allows exactly `赛美斯` / `其他`, defaults blank or missing values to `其他`; `backend/tests/test_db_type_field_policy.py:54-99` covers default, round-trip updates, and invalid values. | Use the project's existing `db_type`; do not introduce another selector or infer type from OID text. |
| Identifier mapping | `backend/src/schemas/field.py:32-70` uses `field_definition.variable_name`; `backend/src/schemas/form.py:90-115` uses `form.code`; `.trellis/spec/guides/cross-stack-contracts.md:749-756` specifies their charset boundary. | Only these two identifiers receive the requested edit-time limits. Dictionary / option / unit identifiers are not included. |
| Existing validation | `backend/src/schemas/_common.py:17-19,38-58` validates the shared ASCII character set and trims surrounding whitespace, without a project-specific length rule. Form codes remain optional; field create OIDs remain required. | Preserve charset and optional/required behavior. Do not replace these validators with unconditional 8/10-character caps. |
| Automatic OIDs exceed both proposed caps | `backend/src/utils.py:13-22` generates `PREFIX_YYYYMMDDHHmmss_XXXXXX`; `backend/src/routers/forms.py:93-99` invokes it for a blank form code. | A global schema/storage maximum would reject valid automatic form OIDs and violate the explicit exemption. |
| Ordinary updates | `backend/src/routers/forms.py:121-140` shares one update path for PUT/PATCH; `backend/src/routers/fields.py:127-165` applies only supplied fields. | A save request containing an unchanged OID must not be treated as an OID edit merely because that key appears in the request. |
| Designer field transactions | `backend/src/schemas/field_profile.py:17-46,106-114` carries full definition snapshots. `backend/src/services/field_profile_service.py:99-125` forbids shared-update OID changes and uses create-or-restore for forks. | An OID edit in the designer may create a new definition rather than PATCH the old one. Validation must happen before command creation/execution, without changing transaction/fork/restore semantics. |
| System label identifiers | `.trellis/spec/guides/cross-stack-contracts.md:764-769` reserves `FIELD_...` placeholders for `标签`, including copy/import suffixes. | Keep system-managed label identifiers exempt and do not change their generator, regex, or migration. |
| Import compatibility | `backend/.claude/CLAUDE.md:95` documents source-OID preservation and system collision suffixes on template import; no charset re-validation is added during import. | This editing feature must not turn into an import gate or rewrite imported/legacy identifiers. |

## Recommended Boundary (Not an Implemented Change)

The request describes editor save-time behavior dependent on whether a user changed an identifier. Prefer a shared frontend policy using the current project type, identifier kind, candidate value, and the original/generated baseline available in the edit session. Keep existing backend charset, ownership, transaction, and uniqueness checks unchanged. Do not add provenance columns or client-supplied exemption flags merely to enforce a UI-only editing rule. A future server-enforced provenance/API contract would require a separately reviewed design and authorization.

## Backend Regression Candidates

- `backend/tests/test_oid_validation.py`: charset and create/update boundary behavior.
- `backend/tests/test_db_type_field_policy.py`: existing database-type behavior.
- `backend/tests/test_field_profile.py`: designer definition fork/shared-update/restore behavior; the file is large, locate relevant tests before reading excerpts.
- `backend/tests/test_form_copy.py`: automatic form and field copy behavior, if a frontend change reaches copy flows.

## Confirmed Frontend Facts

| Topic / save surface | Evidence | Integration consequence |
| --- | --- | --- |
| Existing reactive DB type | `frontend/src/composables/fieldTypeAvailability.js:1-7` defines the existing literals/constants. `frontend/src/App.vue:190-192,235-238` provides the selected project's reactive `projectDbType`; `frontend/src/components/FieldsTab.vue:19-22` and `frontend/src/components/FormDesignerTab.vue:126` already inject it. | No new project fetch, selector, App wiring, or prop plumbing is needed. |
| Shared charset helper / generation | `frontend/src/composables/oidValidation.js:6-20` checks charset only and also serves codelists. `frontend/src/composables/useApi.js:238-251` generates 27-character field / 26-character form identifiers; `frontend/src/composables/fieldDefinitionAutocomplete.js:94-107` generates copy defaults via a `_copy` suffix ladder. | Add a separate edited-OID policy; preserve generic charset functions and automatic generators. Prefix matching is not a valid exemption mechanism. |
| Field library create/edit | `frontend/src/components/FieldsTab.vue:93-134` contains reset/open/clear/shared save; `openAdd` supplies a generated OID and `openEdit` hydrates the row. Edit reference confirmation precedes PUT. `:322` is the full-mode OID input. | Add a local original/generated OID snapshot following initialization, reset, cancel/clear, and successful rehydration. Validate before references/prompts/POST/PUT. There is currently no dedicated OID baseline. |
| Designer persisted field | `frontend/src/components/FormDesignerTab.vue:2035-2073,2283-2348` captures `fieldPropBaseline.fd.variable_name` and whole-editor dirty state. `:2178-2234` is `saveSelectedFieldProp`, and `:2469-2491` writes binding-profile commands. | Whole-editor dirty does not imply an OID edit. Reuse original OID evidence without changing existing save/fork/history semantics. |
| Designer new / copied field drafts | `frontend/src/components/FormDesignerTab.vue:2591-2619` initializes new drafts; `:767-795,952-956` creates copied drafts; `:2624-2704` is `saveDraftField`. `applyEditorToDraft` at `:2517-2541` mirrors edits into the draft definition, and persisted `fieldPropBaseline` is null for drafts (`:2065-2073`). | Do not use the live draft `field_definition.variable_name` as its original value: it would make every edit appear unchanged. Preserve an immutable creation baseline. The existing `__labelOidSeed` is evidence of the original value, but its label-specific lifecycle must not be changed casually. |
| Candidate selection / binding | `frontend/src/components/FormDesignerTab.vue:1258-1328` records `selectedDefinitionId`, `candidateOid`, and `candidateBeforeDefinition`, then programmatically hydrates the editor without resetting `fieldPropBaseline` or the label session. `frontend/src/composables/formDesignerPropertyEditor.js:246-296` distinguishes binding/shared updates/forks. | An explicitly selected candidate's unchanged OID is supplied from the library, not newly authored text. Base the length decision on original/candidate provenance, and do not reset the existing dirty/cancel baseline to suppress errors. Typing a different OID after the pick must still be checked. |
| Form create | `frontend/src/components/FormDesignerTab.vue:3103-3105` pre-fills `genCode('FORM')`; `:448-463` validates and POSTs. There is no dedicated generated-original snapshot. | Add the generated form baseline and the save guard. Preserve optional/blank-code behavior. |
| Form edit dialog / inline properties | `frontend/src/components/FormDesignerTab.vue:531-627` contains `editFormTarget`, inline `formPropBaseline`, synchronization, and the shared `persistFormProps` save path. | Capture immutable original OID evidence rather than trusting a mutable target reference; both update UIs must use the same length policy. |
| Non-authoring paths | Designer quick edit and inline toggle are instance-only (`frontend/src/components/FormDesignerTab.vue:1795-1820,1841-1864,1897-1909`; `frontend/tests/quickEditBehavior.test.js:47-65`). Form/library copy buttons POST empty copy commands (`FormDesignerTab.vue:521-528`; `FieldsTab.vue:175-177`). | Do not attach new validation to instance-only edits, internal replay, or immediate system copies. The subsequent editable regular-copy draft save is in scope. |

## Existing Tests and Mandatory Narrow Spec Reads

- Pure helper / source wiring: `frontend/tests/oidValidationWiring.test.js:11-31`.
- Form-property lifecycle/save guards: `frontend/tests/formDesignerFormPropertyEditor.test.js:107-156`.
- Designer field save guards: `frontend/tests/formDesignerPropertyEditor.runtime.test.js:254-281,394-426` (many assertions are source-level despite the filename).
- Pure bindings and presentation-only updates: `frontend/tests/fieldProfileCommands.test.js:364-409`.
- Label creation seeds and transitions: `frontend/tests/designerLabelOid.test.js:125-202`.
- Draft/history regressions: `frontend/tests/designerNewFieldDraft.test.js`, `frontend/tests/designerFieldCopy.test.js`, `frontend/tests/designerHistory.test.js`.
- Real designer mount harness: `frontend/tests/component/FormDesignerFieldReorder.spec.js:68-117` uses URL-dispatched API spies, injected refs, and a Sortable stub. Add relevant `projectDbType` / `editMode` refs in new feature tests; no existing dedicated FieldsTab mount spec was found.
- Component setup and API/MessageBox/teleport/Vue-warning conventions: `frontend/tests/component/setup.js:17-46`; `.trellis/spec/frontend/quality-guidelines.md:233-255`.
- Existing system-label contracts: `.trellis/spec/frontend/component-guidelines.md:1432-1466`.
- Candidate selection, cancel baselines, shared-write targeting, atomic save/replay contracts: `.trellis/spec/frontend/component-guidelines.md:1468-1508`.
- Shared OID charset/system-label boundary: `.trellis/spec/guides/cross-stack-contracts.md:744-769`.

Read these large spec files by the indicated sections, not in full. The manifest intentionally points at this compact evidence map plus the frontend index rather than injecting whole multi-thousand-line component specs.

## Current-State Documentation Caveat

`frontend/.claude/CLAUDE.md:88` still mentions an `addField` library-drag save path. Focused component research found no current function/call with that name; the implemented library-binding path is autocomplete. Do not invent a task work item for the stale path. This caveat does not authorize unrelated documentation cleanup in the planning session.

## Interpretation for Artifact Review

“Only after modification” is interpreted by the effective identifier being saved: unchanged existing identifiers (including legacy/imported values) remain usable; reverting to the original value is unchanged; an explicit existing-library selection is binding/automatic hydration rather than typing a new identifier. Changing a candidate's OID to another overlong value is checked. These interpretations preserve the existing binding and legacy-compatibility contracts; no persisted manual/generated provenance currently exists in the frontend payloads. They are planning recommendations for the user's later review, not an implementation authorization.
