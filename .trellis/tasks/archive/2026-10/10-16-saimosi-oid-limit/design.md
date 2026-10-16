# Technical Design: Saimeisi OID Edit-Time Limits

## Status and Scope

Planning proposal only. Requested later executor: Sonnet. No implementation has been authorized or performed.

This is an editor save-time restriction, not a global storage-width change. Reuse existing project metadata, identifier validators, save flows, and edit-session state. The backend charset, ownership, uniqueness, and field-profile transaction contracts remain unchanged.

## Shared Policy

Extend the existing frontend OID-validation area with one small, pure policy rather than duplicating length checks in components. The exact signature should follow surrounding code; it must receive enough context to distinguish:

- current project `db_type`;
- entity kind: field (`variable_name`) or form (`code`);
- candidate identifier after the existing trim/normalization;
- the stable identifier baseline captured on edit-open or supplied by the system when initializing a new/copy draft, plus existing explicit candidate-selection state when a field is rebound from the library.

A length error exists only when the database type is exactly `赛美斯`, the candidate represents a user change from the appropriate baseline, and its length exceeds the applicable maximum. Limits are 8 for fields and 10 for forms. Existing charset / required-field errors still apply independently. For designer candidate picks, distinguish the binding target's untouched `candidateOid` from a typed fork by reusing the existing command-decision inputs; do not infer a manual edit only from differing from the originally bound field.

Do not identify exemptions solely by matching `FIELD_...` / `FORM_...`: a user can type another long identifier with that prefix. Compare against the actual baseline, and keep system generation explicit at existing generation call sites.

## Edit-Session Lifecycle

1. Capture the baseline at the same time the component initializes its editable model.
2. For a new entry initialized with an automatic OID, the generated value becomes the baseline. If the UI leaves OID blank until save and the existing flow generates it later, validate the user-entered candidate before that automatic fallback; do not misclassify the fallback as a user edit.
3. On Save, retain the current validation ordering and add the length policy before API calls, impact-confirmation requests, fork/binding commands, or undo-history mutation.
4. On validation failure, show a Chinese message, retain the user's draft, and do not issue write requests. Suggested messages: `赛美斯数据库的字段 OID 最多为 8 位` / `赛美斯数据库的表单 OID 最多为 10 位`.
5. Reset the baseline on entity changes, open/create/copy transitions, cancellation, and successful save as appropriate. Do not let a prior entity's baseline leak into the next edit.
6. Define “modified” by the effective value being saved, not merely focus/blur or a sticky “input event happened” flag. Changing and reverting to the baseline is unchanged; surrounding whitespace follows existing normalization.

## Compatibility Boundaries

- An untouched existing/automatic/imported OID does not become invalid when a user edits another property, reopens a dialog, or switches the project to `赛美斯`.
- Keep brief-mode and system-managed `标签` OID generation working without new length failures.
- Selecting/rebinding an existing field definition is not re-authoring its OID. Automatic copy defaults remain exempt until edited.
- Validate explicit user saves, not internal undo/redo snapshot replay, clone/import services, annotation-position saves, or preview/export reads.
- Do not use input `maxlength`, truncate data, shorten generators, rewrite stored identifiers, change uniqueness/fork semantics, or add blanket Pydantic/SQL length constraints.
- No API flags, provenance columns, database migrations, package dependencies, or build-script changes are proposed. If execution identifies a genuine need for a new server-enforced provenance/API contract, stop and obtain approval rather than silently expanding this editor feature.

## Save-Surface Integration Map

| Production file | Save seam | Baseline / constraints |
| --- | --- | --- |
| `frontend/src/composables/oidValidation.js` | Add a separate pure edited-OID length policy. | Keep generic charset helpers unchanged because codelists reuse them. Reuse the existing DB-type constant from `fieldTypeAvailability.js` if appropriate; do not create a second project-type source. |
| `frontend/src/components/FieldsTab.vue` | `save()` covers field-library create and edit. | Capture original/generated OID beside `resetProp` / `openAdd` / `openEdit`; follow `clearSelection`, project reset, and successful reload. Validate before reference-impact queries and POST/PUT. |
| `frontend/src/components/FormDesignerTab.vue` | `addForm()` and shared `persistFormProps()` cover new forms, the edit dialog, and the inline card. | New-form generated code needs a stable baseline; inline `formPropBaseline` already exists. Dialog `editFormTarget` is a live object reference, not an immutable baseline. |
| `frontend/src/components/FormDesignerTab.vue` | `saveSelectedFieldProp()` covers persisted field OID edits. | Use `fieldPropBaseline` / the loaded original plus candidate-selection state. Keep existing field dirty/cancel and frozen submit-snapshot semantics intact. |
| `frontend/src/components/FormDesignerTab.vue` | `saveDraftField()` covers both new and copied regular-field drafts. | Never compare against the live draft definition: `applyEditorToDraft` mutates it. Use a stable creation snapshot plus explicit candidate state; preserve the separate label-session seed and its contracts. |

A small pure support helper in `formDesignerPropertyEditor.js` is acceptable only if required to reuse existing command-decision evidence; avoid changing command structures. Exact source anchors, regression witnesses, and mandatory narrow spec reads are in `research/oid-edit-boundaries.md`.

No OID-authoring path exists in preview quick edit or the instance-only inline toggle; leave those paths alone. The stale `addField` drag-creation mention in the module document is not a current implementation target.

## Validation Strategy

- TDD: failing pure-policy cases first, then minimal implementation and save-surface wiring regressions.
- Cover both boundaries, unchanged overlong values, edited generated values, manual values imitating automatic prefixes, value-revert/trim behavior, `其他`, and stale-baseline resets.
- Add real component save tests where existing mount infrastructure is suitable; source wiring tests alone cannot demonstrate that an invalid Save issues no write request.
- Run browser smoke checks for the critical manual-edit flows after implementation when a safe isolated environment is available; report any unavailable browser/login/environment preconditions honestly.
- Preserve backend OID charset/database-type/profile regressions; no new backend length gate is implied by this plan.

## Rollback

Revert only this task's policy and save-surface wiring if behavior regresses. No data migration or automatic identifier rewrite is involved, so existing records remain intact. Do not rewrite undo history or remove regression tests to hide a failure.
