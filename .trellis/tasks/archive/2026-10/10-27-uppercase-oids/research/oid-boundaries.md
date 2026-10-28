# OID authoring and compatibility boundaries

## Evidence baseline

Initial inspection used `2048df2`, plus the directly relevant restore service in the main checkout (read-only). On 2026-10-27 the peer confirmed completion and A safely fast-forwarded this task worktree to **`342d1a39f154ccc402c08d707105095e444931ac`**. A reread the merged OID contract (§10), horizontal-table/atomic-restore contract (§15), profile operation, and snapshot validators. Requirements and the write allowlist are unchanged; preserve the newly merged guards. No live database or credential values were inspected.

Refreshed affected anchors at `342d1a3`: designer inline form `FormDesignerTab.vue:3750`, field autocomplete `:3785`, create/edit dialogs `:4148,4158`; field-copy endpoint `backend/src/routers/fields.py:458-487`; snapshot equality/operation `field_profile_service.py:100-127`; restore DTO `schemas/field.py:163-179`; template-import note `backend/.claude/CLAUDE.md:99`; cross-stack §10 `:739-764`, §15 `:984-1028`. Original-base anchors below are retained as provenance, not claims that line numbers did not move.

## Input inventory

All paths in this table are under `frontend/src/components/`.

| Surface | State | Baseline anchor |
| --- | --- | --- |
| Field-library property card | `editProp.variable_name` | `FieldsTab.vue:330` |
| Designer field autocomplete | `editProp.variable_name` | `FormDesignerTab.vue:3608-3613` |
| Designer form create dialog | `newFormCode` | `FormDesignerTab.vue:3973` |
| Designer form edit dialog | `editFormCode` | `FormDesignerTab.vue:3983` |
| Designer inline form property card | `editFormProp.code` | `FormDesignerTab.vue:3575` |
| Codelist create/edit dialogs | `clForm.code`, `editClForm.code` | `CodelistsTab.vue:427,452` |
| Unit property card | `unitEditProp.code` | `UnitsTab.vue:264` |
| Visit property card | `visitEditProp.code` | `VisitsTab.vue:406` |

Nine controls total. Option-value inputs at `CodelistsTab.vue:440,465` are misleadingly labeled OID but are explicitly excluded by the user. Shared quick-edit dialog option codes are excluded as well. Search keywords, form domain, labels, symbols, and source-preview cells are not OID-authoring controls.

## Existing validation is also snapshot validation

- `backend/src/schemas/_common.py:17-19,38-58` and `frontend/src/composables/oidValidation.js:43-57` accept mixed-case ASCII with digits and `._-`.
- Existing schema tests intentionally retain lowercase (`backend/tests/test_oid_validation.py:30-40,75-77`) and frontend helper tests accept it (`frontend/tests/oidValidationWiring.test.js:11-26`). Lowercase remains valid for historical snapshots; normalization and charset validation must not be conflated.
- `DefinitionPayload` is shared by new definitions, shared updates, and history replay (`backend/src/schemas/field_profile.py:17-46`).
- The pending `field_restore_service.py:25,52-68,108-142` uses `FieldDefinitionCreate` for exact historical label snapshots. Changing that schema's validator to uppercase unconditionally would also rewrite snapshots or falsely report conflicts with existing lowercase definitions.
- Unit/visit schemas currently have no OID charset validator (`backend/src/schemas/unit.py:6-19`; `backend/src/schemas/visit.py:6-19`). This casing task must not incidentally introduce unrelated charset rejection there.

## Write sites

- Ordinary creates/updates construct local dictionaries and set ORM values in `backend/src/routers/fields.py:110-112,153-156`, `forms.py:95-99` plus `_apply_form_update`, `codelists.py:85-87,169-170`, `units.py:60-65,99-100`, and `visits.py:59-64,102-103`.
- Shared field-profile updates prohibit OID renaming by exact comparison (`backend/src/services/field_profile_service.py:99-108`); ordinary new definitions and history restoration share `create_or_restore` (`:110-126`). Preserve the exact-identity checks and existing history semantics.
- The frontend already routes a manually changed designer field OID into a fork, not an implicit candidate binding (`frontend/src/composables/formDesignerPropertyEditor.js:247-296,304-313`). Normalize typing before that decision, never normalize all loaded definitions/candidates wholesale.
- Per-project OID uniqueness exists for forms/codelists/units/visits (`backend/src/models/form.py:23-24`, `codelist.py:25`, `unit.py:23`, `visit.py:23-25`). A normalization collision must fail through existing transactional conflict behavior, not silently rename, merge, or rebind.

## Generated and copied identifiers

- Fresh generated OIDs already use uppercase prefixes and suffixes: `backend/src/utils.py:13-22`; `frontend/src/composables/useApi.js:232-251`.
- New field-copy OIDs currently append lowercase `_copy`: `backend/src/routers/fields.py:429-459`; `frontend/src/composables/fieldDefinitionAutocomplete.js:94-107`. Normalize the newly minted OID and use `_COPY`, preserving the minimal numeric collision ladder and leaving copied human-readable names unchanged.
- Do not uppercase all entries of the existing-name set: existing case-sensitive identities remain distinct.

## Preserved source and annotation boundaries

- Template import preserves stripped source codes and uses `_IMP` only for collisions (`backend/src/services/import_service.py:496-520`; `backend/.claude/CLAUDE.md:97`).
- Whole-project clone preserves unit/codelist/field/form/visit identifiers and annotations (`backend/src/services/project_clone_service.py:210-305`, especially `:244,267-278`).
- Field OIDs are annotation keys (`.trellis/spec/guides/cross-stack-contracts.md:754`); annotations use exact keys, not uppercase-on-read aliases (`backend/src/schemas/form.py:29-41,53-78`). No key migration or read-time casing is part of this task.
- Codelist option codes are case-preserving free text (`cross-stack-contracts.md:749-762`; `backend/tests/test_oid_validation.py:139-174`); names and unit symbols are also untouched.

## Validation environment

- Available: `/home/decade/.venvs/crf-editor/bin/python` 3.10.21, Node v24.14.1, npm 11.11.0.
- Fresh worktree has no `frontend/node_modules`. A must perform the existing lockfile installation after implementation approval and before dispatch; B must not install dependencies or modify manifests.
- Backend pytest owns isolated temporary resources (`backend/tests/conftest.py:23-30,51-57`); unset proxy variables only for local tests. The applicable spec is `.trellis/spec/backend/quality-guidelines.md:275-314`.
- `ANTHROPIC_DEFAULT_SONNET_MODEL` is unset; B's actual resolved model is not yet verified. `ANTHROPIC_DEFAULT_FABLE_MODEL` is `claude-opus-5-5[1M]`. Do not change provider settings; capture resolved identities from worker metadata.
