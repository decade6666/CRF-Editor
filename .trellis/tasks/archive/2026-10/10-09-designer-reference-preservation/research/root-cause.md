# Root-cause evidence (planning turn, read-only)

All anchors are in `/home/decade/CRF-Editor-designer-reference-preservation` at `bfbd00d`. No production code was changed.

## C1: picking a candidate reverts presentation / clears the 标签字号 radio

1. `frontend/src/components/FormDesignerTab.vue:1325-1352` `selectAutocompleteCandidate(item)`: its comment says it discards unsaved edits. It reads the persisted row `ff = getSelectedFormField()`, derives inline/default from `ff.inline_mark` / `ff.default_value` (1333-1339), then calls `hydrateEditorFromCandidate({ editor: editProp, definition, instance: ff, ... })` (1340-1349). Drafts then mirror the editor via `applyEditorToDraft()` (1350).
2. `frontend/src/composables/fieldDefinitionAutocomplete.js:66-94` spreads `...editor` but overrides `bg_color`, `text_color`, `label_bold`, and `label_font_size` from `instance` (89-92); `label_font_size: instance.label_font_size ?? null`.
3. Effects:
   - Unsaved presentation edits on a persisted field revert to stored values (repro: pending `large` / `FFEEDD` / bold `0` became `null` / `null` / `1`). Unsaved default value / inline mark are also replaced (1333-1339).
   - Stored default font size `null` becomes UI model `null`. `selectField` maps `null` to the UI sentinel `'default'` (`FormDesignerTab.vue:2407`), and the radio group only offers `large` / `default` / `small` (`FormDesignerTab.vue:5233-5238`), so nothing is selected and the setting appears cleared. New-field drafts hit this too because `applyEditorToDraft` stores `'default'` as `null` (2532).
   - Saving after the sentinel case still persists `null` (default), because `buildFieldPropSnapshot` maps `'default'` to `null` (2202). Real data loss occurs only for unsaved instance edits.
4. Not the cause: the type watcher (`FormDesignerTab.vue:2081-2086`) uses `syncFieldTypeSpecificProps` (`frontend/src/composables/formDesignerPropertyEditor.js:18-33`), which only touches date format, codelist, unit, checkbox text, and numeric digits.

## C2: persisted save warns and rewrites the shared definition for a pure reference

1. `formDesignerPropertyEditor.js:181-238` `buildBindingProfileCommand`: the candidate-rebind branch (196-215) always emits `update_shared` on the candidate with `buildDefinitionPayload(editorState)`; the keep branch (229-237) always emits `update_shared` on the current definition. There is no definition diff check.
2. `resolveSharedWriteTarget` (306-321) mirrors that and always returns the candidate or current definition id.
3. `saveSelectedFieldProp` (`FormDesignerTab.vue:2293-2301`) passes that id to `confirmFieldReferenceImpact` (2243-2250), which loads `/api/field-definitions/{id}/references` and confirms when `countDistinctForms(refs) > 1`.
4. Result: rebinding to a library field used by 2+ forms, or changing only presentation on a field whose definition is shared by 2+ forms, shows 「修改将影响以下表单」 and rewrites the shared definition with the editor's values.

## C3: draft save can report a phantom definition change

1. `buildFieldProfileCommand` (`formDesignerPropertyEditor.js:245-282`) compares the 9 editable definition keys through `sameDraftDefinitionPayload` (150-155) against the raw candidate snapshot captured at `FormDesignerTab.vue:1332`.
2. The editor is normalized only when the field type changes (watcher), while the raw snapshot is never normalized. Example: a `日期` candidate with `date_format: null` becomes `yyyy-MM-dd` in the editor, so the draft command gains `update_shared` and `saveDraftField` asks for impact confirmation (`FormDesignerTab.vue:2686-2705`).
3. Legacy definitions with type-inconsistent values (for example a stale `unit_id` on a choice field) produce the same phantom diff.

## Related latent defects in the same code path

- D1 structural keys: the persisted `update_shared` payload is built from an editor state without `is_multi_record` / `table_type`, so `buildDefinitionPayload` (`formDesignerPropertyEditor.js:158-169`) defaults them to `0` / `固定行`; the backend writes both (`backend/src/services/field_profile_service.py:71-85`). History snapshots also omit them (`FormDesignerTab.vue:841-865`). No current code path writes non-default values (repository grep), so exposure is limited to imported data. The draft path already preserves them (`formDesignerPropertyEditor.js:265`; `frontend/tests/fieldProfileCommands.test.js:151-169`).
- D2 history replay: `buildFieldPropReplayCommand` (`FormDesignerTab.vue:892-953`) routes `shared` entries through `buildBindingProfileCommand`, so undo/redo always rewrites the definition; `isRebind` currently requires `update_shared` (2488).
- D3 impact-confirmation false negative: `confirmFieldReferenceImpact` skips when `countDistinctForms(refs) <= 1` (2246). The references endpoint lists every referencing form (`backend/src/routers/fields.py:168-182`). For a candidate target the current form is never one of them because candidates already on this form are unselectable (`fieldDefinitionAutocomplete.js:36-49`, `FormDesignerTab.vue:1327`), so a genuine shared edit of a library field used by exactly one other form saves without confirmation (persisted rebind path and `saveDraftField` 2702).

## Backend support: no backend or API change needed

- `backend/src/schemas/field_profile.py:49-71`: `definition_operation.operation` defaults to `none`; `binding.mode` supports `keep` / `existing` / `operation_result`.
- `backend/src/services/field_profile_service.py`: `none` performs no definition write (95-97); `existing` validates project ownership and duplicate-in-form (129-158); `update_binding_profile` rebinds and upserts the instance (267-311); `update_shared` rejects OID changes (99-108).
- Contract tests: `backend/tests/test_field_profile.py::test_binding_profile_rebind_existing_definition` (554) sends `binding: existing` with no definition operation and expects 200; `test_binding_profile_instance_only_update` (258).
- Form-field responses include `field_definition.is_multi_record` / `table_type` (`backend/src/schemas/field.py:80-93,139-154`).

## Read-only reproduction

Run with Node 24 against the unmodified composables in `frontend/` (stdin module importing `fieldDefinitionAutocomplete.js`, `formDesignerPropertyEditor.js`, `dateFormatOptions.js`). Observed output:

```json
{
  "unsavedStyleReversion": { "fontBefore": "large", "fontAfter": null, "backgroundBefore": "FFEEDD", "backgroundAfter": null, "boldBefore": 0, "boldAfter": 1 },
  "defaultFontSentinel": { "before": "default", "after": null },
  "pureRebind": { "definitionOperation": "update_shared", "binding": { "mode": "existing", "target_field_definition_id": 20 }, "impactTarget": 20 },
  "presentationOnly": { "definitionOperation": "update_shared", "binding": { "mode": "keep" } },
  "dateDefaultNormalization": { "raw": null, "normalized": "yyyy-MM-dd", "definitionOperation": "update_shared" }
}
```

## Existing tests that encode the current structure

Update these deliberately when the implementation changes the asserted structure. Never weaken behavioral assertions to make them pass.

- `frontend/tests/fieldDefinitionAutocomplete.test.js:123-153`: presentation must come from `instance`. Rewrite to editor-wins semantics plus the `'default'` sentinel.
- `frontend/tests/fieldProfileCommands.test.js:79-93` (rebind → `update_shared` without snapshots), `204-214` (named exports), `224-254` (`resolveSharedWriteTarget` priority without snapshots). These stay valid if the no-snapshot legacy fallback is kept.
- `frontend/tests/formDesignerPropertyEditor.runtime.test.js:254-269` (`await confirmFieldReferenceImpact(sharedWriteTarget)`, `countDistinctForms(refs) <= 1`) and `278-291` (`const command = buildBindingProfileCommand({`, replay `entryType` expressions).
- `frontend/tests/quickEditBehavior.test.js:327-339`: same strings plus `async function confirmFieldReferenceImpact(definitionId) {`.
- `frontend/tests/designerNewFieldDraft.test.js:95-123`: `candidateDefinitionPayload: candidateBeforeDefinition`, `await confirmFieldReferenceImpact(selectedDefinitionId.value)`, the raw restore payload, and redo replay.
- `frontend/tests/designerHistory.test.js:341`: history label expression. Keep the `isFork` / `isRebind` variable names.
- `frontend/tests/designerLabelOid.test.js:416-479` and `534-560`: candidate → `标签` must fork; `selectAutocompleteCandidate` never assigns `labelOidSession`; label OID normalization precedes `buildFieldPropSnapshot()`.
- `frontend/tests/paneSplit.test.js:183-185`: the test name says the pick "discards edits", but it asserts only the `@select` binding. Renaming is optional.
