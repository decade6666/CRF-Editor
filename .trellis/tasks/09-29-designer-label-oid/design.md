# Technical Design

## Root cause (evidence)

| Step | Location | Behavior |
|---|---|---|
| Type change | `frontend/src/components/FormDesignerTab.vue:2110-2115` → `frontend/src/composables/formDesignerPropertyEditor.js:13-28` | `syncFieldTypeSpecificProps` resets type-specific props but never `variable_name`; a typed OID survives the switch to `标签`. |
| Hidden input | `FormDesignerTab.vue:4964` | The OID input is hidden for `标签` / `日志行`, so a stale OID can be neither seen nor cleared. |
| Persisted save guard | `FormDesignerTab.vue:2286-2291` | Required-OID validation is skipped for `标签`, so `''` reaches the command builder. |
| Command routing | `formDesignerPropertyEditor.js:128-153`, `:90` | `editorState.variable_name !== currentDefinitionOid` selects `create_or_restore`; `buildDefinitionPayload` sends `''`. |
| Draft save | `FormDesignerTab.vue:2637-2694` | No OID validation at all; label drafts send whatever OID the editor held (typed OID or `''`). |
| Backend validation | `backend/src/schemas/field_profile.py:32`, `backend/src/schemas/_common.py:50-57` | `DefinitionPayload.variable_name` uses `required_oid_validator` for both `update_shared` and `create_or_restore`; empty → `OID_ERROR` (the reported 422). |
| Uniqueness | `backend/src/models/field_definition.py:24,34` | `variable_name` is `NOT NULL` with `UniqueConstraint(project_id, variable_name)`, which includes hidden label rows. |
| Conflict | `backend/src/services/field_profile_service.py:106-111` | `create_or_restore` on an existing OID → 409 `FORK_OID_CONFLICT_MSG` ("already in the field library"), even when the holder is a hidden label. |
| Frontend pre-check | `FormDesignerTab.vue:2294-2298`, `:2656-2660` | `findOidConflict` only checks `isVisibleInFieldLibrary` definitions, so label-held OIDs are caught only by the backend. |

Label OIDs carry no user meaning: aCRF/export skip label annotations (`backend/src/services/export_service.py:1057-1061`, `FormDesignerTab.vue:150-154`), labels are hidden from the field library (`frontend/src/composables/fieldDefinitionVisibility.js`), and Word import already assigns `generate_code("FIELD")` to labels (`backend/src/services/docx_import_service.py:1965-1971`).

## Invariant

A `标签` definition's `variable_name` is a system placeholder. User input never reaches it, saving never fails on it, and a type switch never leaks an OID between label and non-label states.

## Frontend

### Pure helpers — `frontend/src/composables/formDesignerPropertyEditor.js`

Import `isValidRequiredOid` from `./oidValidation.js` and add two module constants plus four exported helpers. Keep them free of Vue imports so `node:test` can import them directly.

Why the session seeds from the loaded definition and never from the current editor OID: after a library candidate is picked, the editor OID equals the candidate's OID. Reusing it for a label would make `buildBindingProfileCommand` treat the save as a candidate rebind and convert a shared library definition into a hidden label. Seeding only from the definition the field was loaded with avoids that.

```js
const LABEL_FIELD_TYPE = '标签'
// 系统占位 OID 前缀规则（与 backend/src/database.py::_LABEL_PLACEHOLDER_RE 一致）：
// genFieldVarName / generate_code("FIELD") 生成值及其系统派生后缀（_copy、_IMP 等）
const SYSTEM_FIELD_VARIABLE_NAME_RE = /^FIELD_\d{14}_[A-Z0-9]{6}/

/** 是否为系统生成（或系统派生）的字段 OID。 */
export function isSystemFieldVariableName(value) {
  return SYSTEM_FIELD_VARIABLE_NAME_RE.test(String(value ?? '').trim())
}

/** 标签 OID 保存兜底：合法则原样保留，否则生成系统占位值（标签永不因 OID 阻塞保存）。 */
export function ensureLabelVariableName(variableName, generateVariableName) {
  return isValidRequiredOid(variableName) ? variableName : generateVariableName()
}

/**
 * 选中字段时初始化标签 OID 会话：加载时的定义若是标签，或其 OID 为系统占位值，
 * 则该 OID 可直接作为标签 OID（原地转换，不分叉、不产生孤儿定义）；否则留空，切入标签时再生成。
 */
export function buildLabelOidSession(definition = null) {
  const variableName = definition?.variable_name
  const reusable =
    isValidRequiredOid(variableName) &&
    (definition?.field_type === LABEL_FIELD_TYPE || isSystemFieldVariableName(variableName))
  return { rememberedVariableName: null, labelVariableName: reusable ? variableName : null }
}

/**
 * 用户切换字段类型时的 OID 迁移（纯函数，不修改入参）：
 * 切入标签 → 记住当前 OID，换成会话标签 OID（没有则生成并记入会话）；
 * 切出标签 → 有记忆则恢复并清空记忆，否则保持当前值；其他切换不变。
 */
export function applyLabelOidTransition({ variableName, session, previousType, nextType, generateVariableName }) {
  const wasLabel = previousType === LABEL_FIELD_TYPE
  const isLabel = nextType === LABEL_FIELD_TYPE
  if (!wasLabel && isLabel) {
    const labelVariableName = ensureLabelVariableName(session.labelVariableName, generateVariableName)
    return {
      variableName: labelVariableName,
      session: { rememberedVariableName: variableName ?? '', labelVariableName },
    }
  }
  if (wasLabel && !isLabel && session.rememberedVariableName != null) {
    return {
      variableName: session.rememberedVariableName,
      session: { ...session, rememberedVariableName: null },
    }
  }
  return { variableName, session: { ...session } }
}
```

### Component wiring — `FormDesignerTab.vue`

1. Import `applyLabelOidTransition`, `buildLabelOidSession`, and `ensureLabelVariableName` from `../composables/formDesignerPropertyEditor.js`. `genFieldVarName` is already imported from `useApi`.
2. Add editing-session state next to `let isHydratingFieldProp = false;`:

   ```js
   let labelOidSession = buildLabelOidSession();
   ```

3. Make the only type selector (`FormDesignerTab.vue:5030`) controlled, so the transition runs only on user selection. Hydration (`selectField`), candidate selection (`selectAutocompleteCandidate`), and editor resets assign `editProp` directly and must not run it:

   ```vue
   <el-select
     :model-value="editProp.field_type"
     style="width: 100%"
     @update:model-value="onDesignerFieldTypeChange"
   >
   ```

   ```js
   // 字段类型切换（仅用户选择触发）：标签 OID 由系统托管，切入/切出时迁移 OID
   function onDesignerFieldTypeChange(nextType) {
     const next = applyLabelOidTransition({
       variableName: editProp.variable_name,
       session: labelOidSession,
       previousType: editProp.field_type,
       nextType,
       generateVariableName: genFieldVarName,
     });
     labelOidSession = next.session;
     editProp.variable_name = next.variableName;
     editProp.field_type = nextType;
   }
   ```

   Keep the existing `watch(() => editProp.field_type, …syncFieldTypeSpecificProps…)` unchanged; it still clears type-specific props. For drafts, the existing `currentFieldPropDraftKey` watcher writes the new OID into the draft through `applyEditorToDraft`.
4. Reset the session on every (re)selection. Put one line at the top of `selectField(ff)`, before the log-row branch, so all three branches (log row, missing definition, normal) are covered:

   ```js
   labelOidSession = buildLabelOidSession(ff?.is_log_row ? null : ff?.field_definition);
   ```

   Also set `labelOidSession = buildLabelOidSession();` in `resetFieldPropAutoSaveState`, next to `candidateBeforeDefinition = null;`, unconditionally. `preserveEditor` callers either fully reset or rehydrate through `selectField` afterwards.
5. `saveSelectedFieldProp`: after the existing early returns (`if (!ff) return false;`) and before `const snapshot = buildFieldPropSnapshot();`, add:

   ```js
   // 标签 OID 由系统托管：空/非法（历史数据）时换成占位值，避免 OID 校验阻塞保存
   if (editProp.field_type === '标签') {
     editProp.variable_name = ensureLabelVariableName(editProp.variable_name, genFieldVarName);
   }
   ```

   Normalize `editProp`, not only the snapshot. `syncFieldPropBaselineFromEditor()` rebuilds the baseline from `editProp` after save, and a stale invalid OID would trigger another fork on the next save. Keep the existing non-label guard `!['标签', '日志行'].includes(snapshot.field_type) && !isValidRequiredOid(snapshot.variable_name)` byte-for-byte; `formDesignerPropertyEditor.runtime.test.js` asserts it.
6. `saveDraftField`: between the multiselect check and the `findOidConflict` check, add the non-label guard and the label placeholder, then use the resolved value for both the conflict check and `editorState`:

   ```js
   if (!['标签', '日志行'].includes(fd.field_type) && !isValidRequiredOid(fd.variable_name)) {
     ElMessage.warning(OID_ERROR);
     return false;
   }
   const draftVariableName =
     fd.field_type === '标签' ? ensureLabelVariableName(fd.variable_name, genFieldVarName) : fd.variable_name;
   ```

   Replace `fd.variable_name` in the `findOidConflict(...)` call and `variable_name: fd.variable_name ?? ''` in `editorState` with `draftVariableName`. The history redo already rebuilds from `editorState`, so it replays the same placeholder.

### Resulting save commands

| Scenario | Before | After |
|---|---|---|
| Persisted label, OID untouched | `update_shared` | unchanged |
| Persisted label → `文本` → clear OID → `标签` | `create_or_restore` with `''` → 422 | OID restored to the label OID → `update_shared` |
| Persisted non-label with a system placeholder OID `FIELD_x` (typical brief mode) → `标签`, with or without a typed `AGE` first | `update_shared` keeping `FIELD_x`, or a fork with `AGE` | OID reverts to `FIELD_x` → `update_shared` converts in place (today's behavior, impact confirmation included); `AGE` is never persisted |
| Persisted non-label with a user OID `AGE` → `标签` | `update_shared` keeps `AGE` on a hidden label | fork `create_or_restore` with a new `FIELD_…` placeholder; the `AGE` definition stays in the library |
| New-field draft (generated `FIELD_d`), typed `AGE` → `标签` | `create_or_restore` with `AGE` | `create_or_restore` with `FIELD_d` |
| Copied draft `AGE_copy` → `标签` | `create_or_restore` with `AGE_copy` | `create_or_restore` with a new placeholder |
| Draft → clear OID → `标签` | `create_or_restore` with `''` → 422 | seeded or generated placeholder |
| Candidate picked (library OID `LIB`) → `标签` | `update_shared` rebinds and converts the shared `LIB` definition into a label | OID is the seeded label OID or a new placeholder ≠ `LIB` → no rebind; `LIB` untouched |
| Non-label draft with empty/invalid OID | 422 from the backend | frontend `OID_ERROR` warning; no request |
| Label with an empty/invalid stored OID, edited | `update_shared` → 422 | placeholder → fork |

A field loaded with a user-defined OID converts through the fork for three reasons. `update_shared` rejects OID changes (`field_profile_service.py:96-97`). Keeping the user OID on a hidden label is the bug itself. Labels are per-form structural elements: the backend already deletes orphan label definitions when their field is deleted (`backend/src/services/field_cleanup_service.py`), so a named library definition must not silently become one.

A field loaded with a system placeholder OID converts in place instead. The placeholder carries no user meaning, and forking would leave an unused definition in the field library for every brief-mode conversion.

History keeps the existing entries. A fork records `OID 分叉`: undo rebinds the original definition and cleans up the new label definition through the existing `fork-undo` `cleanup_definition_id`, and redo re-creates it through `preferred_definition_id`. An in-place conversion records `编辑属性`.

## Backend startup normalization — `backend/src/database.py`

Add `_normalize_label_variable_names(engine) -> None` next to `_normalize_log_row_presentation` and call it in `init_db()` right after `_normalize_log_row_presentation(engine)`.

- Guard: return when the `field_definition` table is missing or lacks any of `id`, `project_id`, `variable_name`, `field_type`.
- Placeholder rule: module-level `_LABEL_PLACEHOLDER_RE = re.compile(r"^FIELD_\d{14}_[A-Z0-9]{6}")`, used as a prefix match (`.match`). It accepts generated codes and system-derived suffixes (`_copy`, `_copy2`, `_IMP`, `_IMP2`). It must stay identical to the frontend `SYSTEM_FIELD_VARIABLE_NAME_RE` (cross-stack contract; document it in `.trellis/spec/guides/cross-stack-contracts.md` §10).
- In one `engine.begin()` transaction: select `id, project_id, variable_name` where `field_type = '标签'`; keep rows whose `variable_name` is `NULL` or fails the rule; load all `variable_name`s of each affected project into a set; for each target, draw `generate_code("FIELD")` (from `src.utils`) until it is not in the project set, `UPDATE` the row by `id`, and add the new name to the set.
- Log `logger.info("已为 %d 条标签字段定义重新生成系统 OID", count)` only when rows changed.
- Idempotent by construction: a second run finds no targets. Non-label rows are never rewritten.

Accepted residual risk: a form's `annotation_positions` may still hold a key equal to a released OID if that field had an aCRF offset before becoming a label. A future field reusing the OID inherits only that vertical offset. No other consumer keys data by label OIDs.

## Compatibility and rollback

- No API, schema, or validator change; the frontend only changes which OID it sends for labels.
- Rollback: revert the branch commit. Label OIDs renamed by the startup step stay renamed, which is harmless because they are placeholders with no user meaning.

## Test design

Frontend (`node:test`; source-level plus pure-helper runtime tests, matching the existing suite style):

- New `frontend/tests/designerLabelOid.test.js`:
  - `isSystemFieldVariableName`: accepts `genFieldVarName()` output, `FIELD_20260101120000_ABC123_copy2`, and `…_IMP`; rejects `AGE`, `FIELD_ABC`, lowercase suffixes (`FIELD_20260101120000_abc123`), `''`, and `null`.
  - `ensureLabelVariableName`: keeps a valid OID; replaces `''`, whitespace, `null`, and invalid charset (for example `标签A`) with the injected generator's value.
  - `buildLabelOidSession`: a label with a valid OID (placeholder or not) seeds `labelVariableName`; a non-label with a system placeholder OID seeds it; a non-label with a user OID (`AGE`), an invalid OID, and `null` seed `null`; `rememberedVariableName` starts `null`.
  - `applyLabelOidTransition`: entering a label with a seeded OID uses it without calling the generator; entering without a seed generates exactly once and stores it; re-entering after leaving reuses the stored placeholder; leaving restores the remembered value, including `''`; leaving without memory keeps the current value; non-label → non-label and label → label are no-ops; inputs are not mutated.
  - Command integration with `buildBindingProfileCommand`:
    - A persisted-label round trip (label → text → clear → label) yields `update_shared` with the original OID.
    - A placeholder text field `FIELD_x` with a typed `AGE` switched to label yields `update_shared` with `FIELD_x` (in place).
    - A user-OID text field `AGE` switched to label yields `create_or_restore` whose `definition.variable_name` is a non-empty placeholder, never `AGE`.
    - After picking candidate `LIB` and switching to label, the command is not a candidate rebind and never targets `LIB`.
  - Source wiring (regex on `FormDesignerTab.vue`, reusing the `functionBody` extraction pattern from `formDesignerPropertyEditor.runtime.test.js`): the type select uses `:model-value="editProp.field_type"` and `@update:model-value="onDesignerFieldTypeChange"`, and `v-model="editProp.field_type"` no longer exists; `onDesignerFieldTypeChange` calls `applyLabelOidTransition` with `generateVariableName: genFieldVarName`; `selectField` assigns `labelOidSession = buildLabelOidSession(`; `resetFieldPropAutoSaveState` resets it; `saveSelectedFieldProp` calls `ensureLabelVariableName` before `buildFieldPropSnapshot()`; `saveDraftField` contains the non-label `isValidRequiredOid(fd.variable_name)` guard with `ElMessage.warning(OID_ERROR)` and uses `ensureLabelVariableName`.
- Keep green without weakening assertions: `formDesignerPropertyEditor.runtime.test.js`, `fieldProfileCommands.test.js`, `designerNewFieldDraft.test.js`, `designerFieldCopy.test.js`, `editModeHiddenIdentifiers.test.js`, `oidValidationWiring.test.js`, `checkboxFieldType.test.js`, `dbTypeFieldTypeWiring.test.js`.

Backend (`pytest`):

- New `backend/tests/test_label_variable_name_migration.py`, modeled on `test_log_row_presentation_migration.py`: a temporary SQLite file with a minimal `field_definition` table (`id`, `project_id`, `variable_name TEXT NOT NULL`, `label`, `field_type`, `UNIQUE(project_id, variable_name)`).
  - Label OIDs typed by users (`AGE`, `标签A`, `''`) become values matching the placeholder rule. Placeholder and derived labels (`FIELD_20260101120000_ABC123`, `…_copy`, `…_IMP2`) stay. Non-label rows of any shape stay.
  - A second run changes nothing.
  - A monkeypatched `src.database.generate_code` whose first value is already used in the project is retried; results stay unique per project.
  - A missing table is a no-op.
  - After normalization, inserting a new row that reuses the released OID in the same project succeeds.
