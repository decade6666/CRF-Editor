# Design: designer library-reference preservation

## Boundaries

- Frontend only: `frontend/src/composables/fieldDefinitionAutocomplete.js`, `frontend/src/composables/formDesignerPropertyEditor.js`, `frontend/src/components/FormDesignerTab.vue`, and the tests listed in `implement.md`.
- Backend, schemas, and API stay unchanged. The binding-profile / field-profile commands already accept `definition_operation: none` with `binding: keep|existing` (`research/root-cause.md` → Backend support).
- Do not touch the delete-form region of `FormDesignerTab.vue` (recently changed on `main` by the reference-delete guard).

## Key sets (existing constants in `formDesignerPropertyEditor.js`)

| Set | Keys | Notes |
| --- | --- | --- |
| Editable definition keys (`DRAFT_DEFINITION_DIFF_KEYS`) | `variable_name`, `label`, `field_type`, `checkbox_label`, `integer_digits`, `decimal_digits`, `date_format`, `codelist_id`, `unit_id` | The only keys compared to decide a shared write |
| Structural definition keys | `is_multi_record`, `table_type` | Never compared; always copied from the target snapshot when writing |
| Instance keys (`INSTANCE_KEYS`) | `required`, `label_override`, `help_text`, `default_value`, `inline_mark`, `bg_color`, `text_color`, `label_bold`, `label_font_size` | Never replaced by a candidate pick (DEC1) |

UI sentinel: editor `label_font_size` takes `large` / `default` / `small`; the stored `null` means `default` (`selectField` 2407, `buildFieldPropSnapshot` 2202, `applyEditorToDraft` 2532).

## Composable changes

### `fieldDefinitionAutocomplete.js`

- `hydrateEditorFromCandidate`: stop overriding `bg_color`, `text_color`, `label_bold`, and `label_font_size` from `instance`; they flow through `...editor`, so the `'default'` sentinel and pending values survive. Keep the candidate definition keys, the caller-normalized `default_value` / `inline_mark`, and `required` / `label_override` / `help_text` from `instance`. Rewrite the doc comment to DEC1.

### `formDesignerPropertyEditor.js`

1. New export `normalizeDefinitionPayload(definition, dateFormatOptions, defaultDateFormats)`: returns `null` for `null`; otherwise returns `syncFieldTypeSpecificProps(buildDefinitionPayload(definition), <its field_type>, dateFormatOptions, defaultDateFormats)`. Structural keys pass through unchanged.
2. Keep `sameDraftDefinitionPayload` (exported name asserted by tests) as the single 9-key comparator for both paths.
3. `buildBindingProfileCommand` gains the optional `currentDefinitionPayload` and `candidateDefinitionPayload` (already normalized). Branch order stays rebind → fork → keep:
   - Rebind (`selectedDefinitionId != current`, editor OID equals candidate OID): `binding: { mode: 'existing', target_field_definition_id: selected }`. If the snapshot is present and equal, use `definition_operation: { operation: 'none' }`; otherwise use `update_shared` on the selected id with `buildDefinitionPayload({ ...candidateDefinitionPayload, ...editorState })`.
   - Fork (editor OID differs from the current definition's OID): unchanged.
   - Keep: `binding: { mode: 'keep' }`. If the current snapshot is present and equal, use `none`; otherwise use `update_shared` on the current id with `buildDefinitionPayload({ ...currentDefinitionPayload, ...editorState })`.
   - Snapshot omitted: legacy behavior (always `update_shared` with `buildDefinitionPayload(editorState)`), so existing callers and tests are unchanged.
4. `resolveSharedWriteTarget(args)` is derived from `buildBindingProfileCommand(args)`: it returns the `update_shared` target id, or `null` for `none` and fork. This is the single decision source for DEC3.
5. `buildFieldProfileCommand` (drafts): logic unchanged; the caller passes the normalized candidate snapshot. The write base `{ ...candidateDefinitionPayload, ...editorState }` still preserves structural keys.
6. Move `buildFieldPropReplayCommand` out of `FormDesignerTab.vue` (892-953) into this module unchanged in signature, plus `definitionUpdated = true`:
   - `shared`: `definition_operation` is `update_shared(writtenDefinitionId, buildDefinitionPayload(snapshot.fd))` when `definitionUpdated`, else `none`; `binding: keep`; instance upsert from `buildEditorStateFromSnapshot(snapshot)`. Do not route through `buildBindingProfileCommand`, so replay never re-diffs.
   - `rebind-undo`: `update_shared(writtenDefinitionId, candidateBeforePayload)` when `definitionUpdated`, else `none`; `binding: existing(originalDefinitionId)`; instance upsert.
   - `rebind-redo`: `update_shared(writtenDefinitionId, buildDefinitionPayload(snapshot.fd))` when `definitionUpdated`, else `none`; `binding: existing(writtenDefinitionId)`; instance upsert.
   - `fork-undo` / `fork-redo` / unknown type: unchanged.

## Component changes (`FormDesignerTab.vue`)

1. Imports: add `normalizeDefinitionPayload` and `buildFieldPropReplayCommand` from the composable, and delete the local `buildFieldPropReplayCommand`.
2. `selectAutocompleteCandidate` (1325-1352): derive `currentInlineMark` and the default value from `editProp` (pending), not `ff`; keep `canToggleInline({ ...ff, field_definition: definition })`. After hydration, run `Object.assign(editProp, syncFieldTypeSpecificProps(editProp, editProp.field_type, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS))`, mirroring `selectField` 2411; then mirror drafts. Keep the raw `candidateBeforeDefinition = buildDefinitionPayload(definition)`. Never assign `labelOidSession` or `fieldPropBaseline`. Update the comment.
3. New local helpers:
   - `comparableDefinitionPayload(definition)` returns `normalizeDefinitionPayload(definition, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS)`.
   - `buildSelectedFieldCommandArgs(ff, editorState)` returns `{ currentDefinitionId: ff.field_definition_id, currentDefinitionOid: ff.field_definition?.variable_name ?? null, currentDefinitionPayload: comparableDefinitionPayload(ff.field_definition), editorState, selectedDefinitionId: selectedDefinitionId.value, candidateOid: candidateOid.value, candidateDefinitionPayload: comparableDefinitionPayload(candidateBeforeDefinition) }`.
4. `saveSelectedFieldProp`: `const sharedWriteTarget = resolveSharedWriteTarget(buildSelectedFieldCommandArgs(ff, snapshot))`, then `await confirmFieldReferenceImpact(sharedWriteTarget, { includesCurrentForm: sharedWriteTarget === ff.field_definition_id })` (R5).
5. `saveFieldProp`: `const command = buildBindingProfileCommand(buildSelectedFieldCommandArgs(ff, editorState))`, read before the first `await`, so it sees the same candidate state as step 4. History flags: `isFork` as today, `isRebind = command.binding.mode === 'existing'`, `definitionUpdated = command.definition_operation.operation === 'update_shared'`; pass `definitionUpdated` to both replay builds. Keep the label expression `isFork ? 'OID 分叉' : isRebind ? '换绑字段' : '编辑属性'`.
6. `snapshotFieldPropState` (841-865): add `is_multi_record: fd.is_multi_record ?? null` and `table_type: fd.table_type ?? null` to `fd`. `buildDefinitionPayload` supplies the defaults.
7. `saveDraftField`: pass `candidateDefinitionPayload: comparableDefinitionPayload(candidateBeforeDefinition)`; keep `restoreDefinitionPayload` as the raw `candidateBeforeDefinition`; confirm with `{ includesCurrentForm: false }` (R5).
8. `confirmFieldReferenceImpact(definitionId, { includesCurrentForm = true } = {})` (R5): use threshold `includesCurrentForm ? 1 : 0` and return early when `countDistinctForms(refs) <= threshold`; the message and dialog are unchanged.

## Persisted save flow (after)

```text
pick candidate -> editProp: candidate's definition keys + editor's instance keys -> type-normalize -> (draft) mirror
Save -> buildFieldPropSnapshot -> buildSelectedFieldCommandArgs(ff, snapshot)
     -> resolveSharedWriteTarget -> target? confirmFieldReferenceImpact(target, opts) : skip
     -> saveFieldProp -> buildBindingProfileCommand(same args) -> PUT /api/form-fields/{id}/binding-profile
     -> reload -> history {isFork, isRebind, definitionUpdated}
```

## Edge cases

- The pick is the field's own definition (badge 「当前字段」): keep branch, compared with the current snapshot.
- Pick, then edit the OID: fork. Pick, then switch type to `标签`: label-OID transition, then fork; the candidate is untouched (`designerLabelOid.test.js:416-479`).
- `日期` candidate with `date_format: null`: the editor shows the default, the save is a pure binding, and the stored candidate is untouched.
- Choice candidate without a codelist (legacy): the existing validation blocks the save.
- Definition edited elsewhere after load: a presentation-only save no longer overwrites it; genuine edits still write the editor values (as today).
- Confirm cancel or close: return `false`; no write; dirty state or draft kept.
- History busy/session guards and the membership/reorder exclusion are unchanged.

## Compatibility, trade-offs, rollback

- No API change. Builders keep legacy semantics when snapshots are omitted.
- Intentional behavior changes: fewer confirmations and writes for pure references or presentation-only edits; pending instance edits survive picks; one extra confirmation for a genuine shared edit of a candidate used by exactly one other form (R5, user-approved).
- Comparing normalized values on both sides prevents phantom writes; a stored type-inconsistent definition stays as stored after a pure reference (no unrequested shared write).
- Moving the replay builder enables behavioral unit tests without mounting the 5,000+ line component.
- Rollback: revert the frontend-only task commit(s). No data migration is involved.
