# Designer Label Fields Must Not Occupy or Require User OIDs

## Problem

In the form designer (`frontend/src/components/FormDesignerTab.vue`), field type `标签` (label) mishandles the field-definition OID (`variable_name`):

1. **Occupied OID.** A user types an OID, switches the type to `标签`, and saves. The label definition keeps that OID. Labels are hidden from the field library and their OID input is hidden, but `FieldDefinition` enforces a project-wide unique `variable_name`, so the name stays occupied invisibly. A later field using it fails with 409 `该OID已在字段库中存在，请从候选中选择或修改OID`, and nothing in the field library explains why.
2. **Save error.** A user switches a field to a non-label type, clears the OID, switches back to `标签`, and saves. The request fails with 422 `body → definition_operation → create_or_restore → definition → variable_name: Value error, OID 只允许由字母、数字、“-”、“_”和“.”组成`.

## Goal

A label's `variable_name` is system-managed: it never comes from user input, it is always a valid generated placeholder, and it never blocks saving. OIDs already occupied by labels are released once on backend startup.

## Requirements

- R1 — Choosing `标签` in the designer type selector (persisted field or new/copied draft) replaces the editor OID with a system-managed label OID. It is the valid OID of the definition the field was loaded with, when that definition is a label or its OID is a system placeholder. A system placeholder matches the prefix `FIELD_<14 digits>_<6 [A-Z0-9]>`: generated codes plus system suffixes such as `_copy` or `_IMP`. Otherwise a fresh `FIELD_<yyyyMMddHHmmss>_<6 chars>` placeholder is generated and reused for the rest of the same editing session. An OID typed for another type is never sent while the type is `标签`.
- R2 — Switching away from `标签` in the same editing session restores the OID the editor held before entering `标签` (including an empty value). A field loaded as a label keeps showing its current OID when switched away (existing behavior).
- R3 — Saving a `标签` field (persisted or draft) never fails on OID validation: an empty or invalid label OID is replaced by a generated placeholder before the request is built.
- R4 — Converting a persisted non-label field into `标签`:
  - If its loaded OID is a system placeholder (typical in brief mode), the definition is converted in place (existing `update_shared` behavior, including the multi-form impact confirmation). No extra definition is created.
  - If its loaded OID is user-defined, only this form field is bound to a new label definition through the existing `create_or_restore` fork. The original definition, its OID, and other forms referencing it stay unchanged in the field library.
  - Undo/redo keeps the existing semantics of the chosen path.
- R5 — Saving a non-label draft validates its OID with the shared rule (`isValidRequiredOid`) and shows `OID_ERROR` as a frontend warning instead of sending an invalid payload (parity with the persisted-field save path).
- R6 — On backend startup, every `field_definition` row with `field_type = '标签'` whose `variable_name` does not start with the system placeholder prefix `FIELD_<14 digits>_<6 [A-Z0-9]>` receives a new project-unique placeholder from `generate_code("FIELD")`. The step is idempotent, skips a missing table, logs the changed count, and never rewrites non-label rows.
- R7 — No backend API, schema, or validator change; no change to the field library (`FieldsTab.vue`) or log-row behavior.
- R8 — Tests, module documentation, and specs are updated for the new behavior.

## Acceptance Criteria

- [ ] Persisted or draft field → type `AGE` → switch to `标签` → Save: the label is stored with a `FIELD_…` OID, and another field can then use `AGE`.
- [ ] Persisted label → `文本` → clear OID → `标签` → Save succeeds, keeps the label's original OID, and sends `update_shared` (no fork, no 422).
- [ ] Label drafts never send an empty or user-typed OID, and saving them succeeds.
- [ ] `文本` with OID `AGE` → `标签` → `文本` in one editing session shows `AGE` again.
- [ ] A label whose stored OID is empty or invalid saves successfully with a generated placeholder.
- [ ] A non-label draft with an empty or invalid OID shows `OID_ERROR` and sends no request.
- [ ] Converting a text field whose OID is user-defined (for example `AGE`) to `标签` on one form leaves the `AGE` library definition and the other forms unchanged; undo restores the original binding.
- [ ] Converting a persisted field whose OID is a system placeholder to `标签` converts it in place and creates no extra definition, even if the user typed another OID before switching.
- [ ] Frontend and backend use the same system-placeholder prefix rule.
- [ ] Startup normalization re-mints only non-placeholder label OIDs, keeps per-project uniqueness, is idempotent, and is a no-op without the table.
- [ ] Targeted and full frontend tests, frontend lint, frontend build, and targeted and full backend tests pass.
- [ ] Both reported flows are verified in a browser when the environment allows it; otherwise the blocker is reported.

## Out of Scope

- Making `variable_name` nullable for labels (requires a SQLite table rebuild and wide consumer changes).
- Cleaning up label definitions already orphaned by earlier forks.
- The field library (`FieldsTab.vue`), which cannot create or show labels.
- `日志行` definitions.
- Changing the copy OID ladder; derived names such as `FIELD_…_copy` already satisfy the placeholder prefix rule.
- Normalizing label OIDs inside template, project `.db`, or clone import paths. Labels imported from an older source keep the source OIDs until the next backend restart runs the startup normalization.
