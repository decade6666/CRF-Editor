# Designer library-reference preservation

## Goal

In the form designer, picking a field-library candidate from the OID or 字段标签 autocomplete for a new or existing field must keep the current form-field instance's presentation settings. Save must write a shared field definition, and ask for multi-form impact confirmation, only when that shared definition actually changes. A later Sonnet session executes after conversation compaction.

## Background

- User report (2026-10-09): after typing an OID and picking a library field, 标签字号 and similar settings are cleared; Save then warns that multiple forms will be affected.
- Confirmed root causes (evidence, repro output, and anchors in `research/root-cause.md`):
  - C1: candidate hydration overrides colors, bold, and font size from the persisted instance instead of the active editor, and turns stored default font size `null` into UI model `null` instead of the `'default'` sentinel, so the radio shows nothing selected. Unsaved default value / inline mark are replaced too.
  - C2: persisted saves always emit `update_shared` on the candidate (rebind) or current definition (keep), so pure references and presentation-only edits trigger 「修改将影响以下表单」 and rewrite the shared definition.
  - C3: draft saves compare the editor with an un-normalized candidate snapshot, so type normalization (for example a `日期` candidate with `date_format: null`) produces a phantom shared update and confirmation.
- Related latent defects in the same path: D1 persisted shared updates and history snapshots drop `is_multi_record` / `table_type`; D2 undo/redo always rewrites definitions; D3 a genuine shared edit of a candidate used by exactly one other form is not confirmed.
- The backend already supports `definition_operation: none` with `binding: keep|existing` plus instance upsert. No backend, schema, or API change is needed.
- Planning worktree: `/home/decade/CRF-Editor-designer-reference-preservation`; branch `fix/designer-reference-preservation` at `bfbd00d` with no commits. `main` has since advanced (`0f2ad99`, reference-delete guard). That merge changed only the delete-form region of `FormDesignerTab.vue`; every anchor used by this plan is unchanged on `main`. Fast-forward the branch before implementation (`implement.md` step 0).
- Turn boundary: the user authorized planning only. The implementation session needs the user's go-ahead to run `task.py start`; commit, merge, and push each require a separate explicit request.

## Decisions

- DEC1: A candidate pick replaces only the 9 editable definition keys (`variable_name`, `label`, `field_type`, `checkbox_label`, `integer_digits`, `decimal_digits`, `date_format`, `codelist_id`, `unit_id`). Instance-level values in the active editor, including unsaved colors, bold, font size, default value, and inline mark, are kept. Default value and inline mark are re-normalized for the candidate type with the existing rules. This supersedes the earlier "discard unsaved edits on pick" design (`fieldDefinitionAutocomplete.js:61-65`, `FormDesignerTab.vue:1325`), which the bug report rejects.
- DEC2: A shared definition is written (`update_shared`) only when the 9 editable keys differ after the same type normalization (`syncFieldTypeSpecificProps`) is applied to both sides. Otherwise the command uses `definition_operation: none` with `binding: existing` (rebind) or `keep`, plus the instance upsert. An OID change still forks first, and label-OID transitions are unchanged.
- DEC3: The impact-confirmation target is derived from the same command decision as the request (single source of truth).
- DEC4: Undo/redo replays exactly what the forward save did, including a definition write only if one happened, and preserves the structural keys `is_multi_record` / `table_type`.
- DEC5 (user decision, 2026-10-10): include the D3 fix in this task. When the write target is a candidate, confirm whenever at least one other form references it.
- DEC7 (review round v4, 2026-10-10): `snapshotFieldPropState.fd` is derived from the exported `DEFINITION_PAYLOAD_KEYS` so a future definition key cannot silently drop out of history replay. A proposed switch of the confirmation threshold from distinct-form counting to FormField-row counting was retracted after verification: the `uq_form_field` unique index (database.py:940, guarded by the import schema check) makes a same-form double binding impossible, so row count always equals distinct-form count and the change would add no coverage.
- DEC6 (review round, 2026-10-10, same scope): the impact confirm and the PUT command share one frozen `commandArgs`/`candidateBeforePayload` pair captured before the first await; while a property/draft save is in flight the property editor (including native color swatches) and every conflicting entry (candidate pick, same-row re-click, delete, batch delete, copy, quick edit, inline toggle, reorder drag/keyboard, add-log-row, form switch, designer leave) short-circuits; structural keys come from the target snapshot on every write path (including draft forks and fork-redo with `remapId`); a cleared date-format select normalizes immediately; after commit the editor is rebuilt from the persisted row so `labelOidSession` cannot go stale; `definitionUpdated` fails closed.

## Requirements

- R1 (C1, DEC1): Picking a candidate keeps the active editor's `bg_color`, `text_color`, `label_bold`, and `label_font_size` (the UI sentinel stays `'default'`, never `null`) plus pending `default_value` / `inline_mark` after type normalization. `required`, `label_override`, and `help_text` keep coming from the instance. The editor is type-normalized right after hydration, as `selectField` already does, and drafts mirror the normalized editor.
- R2 (C2, C3, DEC2, DEC3): Pure rebinds and presentation-only saves, in both the persisted and draft paths, send no definition write and show no impact confirmation (no references request).
- R3 (DEC2, D1): Genuine edits to editable definition keys still produce `update_shared` on the correct target, preceded by impact confirmation. Cancel or close sends no write and keeps the editor or draft state. The payload preserves the target's `is_multi_record` / `table_type`.
- R4 (DEC4, D2): Undo/redo records rebinds as rebinds even without a definition write. A pure rebind replays only binding plus instance; instance-only edits replay only the instance; genuine shared edits restore or reapply full definition snapshots. Fork, draft copy, label-OID, dirty, and cancel behavior is unchanged.
- R5 (D3, DEC5): Candidate-target impact confirmation counts other referencing forms. `>= 1` triggers confirmation; the current-definition threshold of `>= 2` distinct forms is unchanged. (Review v4 suggested counting FormField rows instead to cover an import-created same-form double binding; rejected after verification: `uq_form_field` (form_id, field_definition_id) is created by every migration path — database.py:940 and the import schema check — so one definition can never be bound to two fields of the same form. Distinct-forms counting is sufficient.)
- R6: Sync the module documentation (`frontend/.claude/CLAUDE.md`), the root `.claude/CLAUDE.md` change-log line, and the frontend spec contract table (`.trellis/spec/frontend/component-guidelines.md`).

## Acceptance Criteria

- [x] AC1 (R1, verified 2026-10-10): `fieldDefinitionAutocomplete.test.js` locks editor-wins hydration (pending `large` + colors + bold survive a pick, `'default'` stays `'default'`, pending default value / inline mark normalized for the candidate type). Browser: picking LIB after setting 标签字号 大 keeps 大 and 默认 default-size fields stay 默认; after save + reload the stored font size matches (`fontSize=large` persisted).
- [x] AC2 (R2, verified 2026-10-10): `fieldProfileCommands.test.js` covers persisted pure rebind (`none` + `existing`), presentation-only (`none` + `keep`), `resolveSharedWriteTarget → null` for both, and the normalized-日期 pure draft binding. Browser: neither save shows 影响提醒 (zero fetch), the definition count stays 2 and other forms are unchanged.
- [x] AC3 (R3, verified 2026-10-10): builder tests assert `update_shared` with structural keys from the target snapshot; browser: a genuine 字段标签 edit lists 表单A/表单B, cancel sends no request and keeps the dirty state, confirm propagates the new label to both forms (and undo restores it).
- [x] AC4 (R4, verified 2026-10-10): replay-builder tests cover `shared` ± `definitionUpdated` and `rebind-undo`/`rebind-redo` ±; fork, label-OID, and history suites stay green. Browser: undo/redo after a pure rebind restores the original binding and presentation without rewriting the library definition or duplicating definitions.
- [x] AC5 (R5, verified 2026-10-10): confirmation-threshold tests pass; browser: editing a candidate used by exactly one other form (LIB1 → 表单A) confirms, while a current definition used only by this form does not.
- [x] AC6 (verified 2026-10-10): frontend gates on the merged tree: node:test 922/922 (893 on the pre-merge branch), vitest 11/11, lint 0 errors, build OK. Coverage `fieldDefinitionAutocomplete.js` 100.00 / `formDesignerPropertyEditor.js` 98.09 (baselines 95.20/97.40, not lowered). Backend source unchanged; full backend suite 1098 passed post-merge (`test_field_profile.py` 26 passed as the targeted sanity).
- [x] AC7 (R6, verified 2026-10-10): docs (root + frontend `CLAUDE.md` change-log lines) and the spec contract table are updated; the diff went through a multi-angle review round plus a final read-only Haiku review (all accepted findings fixed in-tree; declined items recorded in Known limitations). Validation results are reported as run / not-run in `verification.md`.
- [x] AC8 (DEC6, verified 2026-10-10): unit/contract suites lock the frozen-args handoff, the save-in-flight mutex matrix, structural-key propagation (shared/fork/draft-fork/fork-redo), the date-clear normalization, the unconditional post-save editor rebuild, and the reload-failure fallback. node:test 893/893 + vitest 11/11, lint 0 errors, build OK, coverage 100% / 98.08% (baselines 95.20/97.40). Browser re-run on the final tree: pick keeps 大, pure rebind saves with no dialog and persists (binding + font size + untouched definition), undo/redo restores binding without duplicating definitions, a genuine shared edit confirms (lists referencing forms) and undo restores the definition.
- Known limitations (documented, out of scope): concurrent same-owner `update_shared` is last-writer-wins (no version column); legacy rows with type-inapplicable stale FKs or non-canonical stored date formats are healed only by a definitional-key edit, not by a presentation-only none-save.

## Out of Scope

- Backend, schema, or API changes; FieldsTab or other tabs' impact confirmation; designer refactors beyond moving `buildFieldPropReplayCommand` into the composable for testability.
- Changing log-row copy, field copy, label-OID fork rules, OID conflict rules, or the draft single-draft guards.
- New dependencies, build or release changes, data migrations, and production data writes.

## Open Questions

None. The only scope question (whether to include D3) was resolved by the user on 2026-10-10 (DEC5).
