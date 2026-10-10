# Design — reference-delete-guard

## 1. Boundaries

| Layer | Files | Change |
|---|---|---|
| Backend service (new) | `backend/src/services/field_definition_reference_service.py` | Single shared query builder for codelist / unit field references, both modes |
| Backend routers | `backend/src/routers/codelists.py`, `backend/src/routers/units.py` | 4 reference endpoints delegate to the service; new opt-in `include_unplaced` query flag. The same task branch also closes the audited codelist-option ownership gap (5 child-resource handlers) with owner-first checks. |
| Backend tests (new) | `backend/tests/test_reference_delete_contract.py`; `backend/tests/test_codelist_option_authorization.py` | Feature reference/guard parity + opt-in query semantics; separate standalone regression suite for the 5 option-route owner guards (keeps the security fix independently committable) |
| Frontend composable (new) | `frontend/src/composables/referenceDeleteGuard.js` | Pure partition / message / flow helpers, message box injected |
| Frontend components | `CodelistsTab.vue`, `UnitsTab.vue`, `FieldsTab.vue`, `FormDesignerTab.vue` | Single-delete gate + batch partition wiring only (`delCl`/`batchDelCl`, `del`/`batchDelUnits`, `del`/`batchDelFields`, `delForm`/`batchDelForms`) + one import line each |
| Frontend style | `frontend/src/styles/main.css` | Append one global block for the dialog class (end of file) |
| Frontend tests | new `referenceDeleteGuard.test.js`, new `referenceDeleteWiring.test.js`; update `projectDeleteConfirmation.test.js`, `fieldsTabMultirefThreshold.test.js` | |
| Docs (lead, after code) | spec component-guidelines delete scenario, cross-stack-contracts new §14, root/module `CLAUDE.md`, README zh/en, `.claude/index.json` | |

Unchanged on purpose: backend delete guards (409 + texts), batch-delete endpoints (all-or-nothing), field / form reference endpoints, every edit-impact consumer of the default codelist / unit `references` responses (`updateCl`, `updateOpt`, `saveUnit`, FieldsTab `quickSaveCodelist`, FormDesignerTab `quickSaveCodelist`) — the in-flight `10-08-shared-rule-convergence` task is extracting the two quick-edit dialogs, so those call sites must not be touched.

## 2. Backend contract

### 2.1 Reference sets (source of truth = delete guards, unchanged)

| Entity | Guard (`DELETE` / `batch-delete` → 409) | Delete-check reference endpoint |
|---|---|---|
| Codelist | any `FieldDefinition.codelist_id ∈ ids` | `…/codelists/{id}/references?include_unplaced=true`, `…/codelists/batch-references?include_unplaced=true` |
| Unit | any `FieldDefinition.unit_id ∈ ids` | `/api/units/{id}/references?include_unplaced=true`, `…/units/batch-references?include_unplaced=true` |
| Field definition | any `FormField.field_definition_id ∈ ids` | existing `references` / `batch-references` (already exact) |
| Form | any `VisitForm.form_id ∈ ids` | existing `references` / `batch-references` (already exact) |

Invariant (locked by tests): for each entity, with the delete-check endpoint, `set(batch_references.keys()) == {ids the guard rejects}` for in-project ids, and a single-id `references` list is non-empty iff `DELETE` returns 409.

### 2.2 `include_unplaced` flag

- Signature: `include_unplaced: bool = False` (FastAPI query param) on exactly these 4 endpoints. `?include_unplaced=true` parses as `True`.
- `False` (default): today's statement shape — `FROM form JOIN form_field ON form_field.form_id = form.id JOIN field_definition ON field_definition.id = form_field.field_definition_id` (inner joins, explicit `select_from(Form)`), filtered by `FieldDefinition.<fk>.in_(ids)`. Same row multiset and same JSON keys as today.
- `True`: `FROM field_definition LEFT OUTER JOIN form_field ON form_field.field_definition_id = field_definition.id LEFT OUTER JOIN form ON form.id = form_field.form_id`, same filter. Each placed definition yields one row per `FormField` (no extra null row); an unplaced definition yields exactly one row with `form_name: null, form_code: null`.
- Row shape is unchanged: `{"form_name", "form_code", "field_label", "field_var"}`. Batch response stays `{<id>: [rows]}` (JSON object keys are strings; ids without references are absent).
- Batch endpoints keep resolving `valid_ids` (ids owned by the path project) before querying — cross-project isolation unchanged. Single unit endpoints keep their existing ownership checks. Security follow-up: codelist single references must call `verify_project_owner(project_id, current_user, session)` before `_get_codelist_with_project_check`; the latter checks only dictionary-to-project membership, not user authorization. This fixes a runtime-confirmed pre-existing cross-user disclosure; both default and flagged requests must deny foreign users with 403. Owned-project missing dictionaries still return 404 and mismatched dictionaries still return 403.
- No `ORDER BY` is added (default-mode output must stay as today).

### 2.3 Service API

```python
# backend/src/services/field_definition_reference_service.py
def collect_field_definition_references(
    session: Session,
    fk_column: InstrumentedAttribute,   # FieldDefinition.codelist_id or FieldDefinition.unit_id
    target_ids: Iterable[int],
    *,
    include_unplaced: bool = False,
) -> dict[int, list[dict]]:
    """{target_id: [{form_name, form_code, field_label, field_var}, ...]}; empty target_ids → {}."""
```

Single endpoints return `collect_…(session, FieldDefinition.unit_id, [unit_id], include_unplaced=…).get(unit_id, [])`; batch endpoints return the dict for `valid_ids`. Routers stay thin (layering rule: heavy logic in services).

## 2.4 Project ownership security correction (authorized same-branch follow-up)

**Audit scope**: reviewer inspected `codelists.py`, `units.py`, `fields.py`, and `visits.py` against baseline `f68ebe1`. All 8 unit, 17 field, and 12 visit/visit-form routes enforce user-level project ownership; no edits are required there. In `codelists.py`, 3/8 child-resource consumers had an owner check (copy, snapshot, references); 5 option endpoints did not.

**Affected endpoints** (all gaps pre-existing at task base; no response-body / owner behavior change for valid owners):

| Operation | Route | Required first check |
|---|---|---|
| Add option | `POST /projects/{project_id}/codelists/{cl_id}/options` | `verify_project_owner(project_id, current_user, session)` before codelist membership lookup |
| Update option | `PUT /projects/{project_id}/codelists/{cl_id}/options/{opt_id}` | same before codelist and option lookup |
| Delete option | `DELETE /projects/{project_id}/codelists/{cl_id}/options/{opt_id}` | same |
| Batch delete options | `POST /projects/{project_id}/codelists/{cl_id}/options/batch-delete` | same |
| Reorder options | `POST /projects/{project_id}/codelists/{cl_id}/options/reorder` | same |

Each route already receives `project_id`, `current_user`, and `session`; the shared import exists. Add one owner check at the handler entry, ahead of any resource lookup/write. For update/delete, check the codelist membership before looking up the option ID to prevent existence-oracle behavior across projects. This must not touch the unscoped option-list or snapshot behavior except the checks explicitly required above. Expected error ordering: missing project → 404; foreign project → 403 before codelist/option existence is queried; owned project + missing codelist → existing 404; owned project + codelist from another project → existing 403; valid owner behavior/status unchanged.

**Regression**: extend `backend/tests/test_reference_delete_contract.py`'s two-user graph. Alice must get 403 for all five endpoints when targeting Bob's project/dictionary, and Bob's option rows must remain unchanged. Bob retains existing success responses (POST 201, PUT 200, DELETE 204, batch-delete 200, reorder 200); owned-project missing codelist remains 404; mismatched codelist remains 403. Run the tests RED before adding checks. No deployment is included; local main merge + production deployment are separate gates, and production deployment is the user's responsibility.

## 3. Frontend contract

### 3.1 `frontend/src/composables/referenceDeleteGuard.js`

Pure module: no `vue` / `element-plus` imports; the message box is injected (same pattern as `projectDeleteConfirmation.js`). Never mutates inputs.

```js
export const REFERENCE_DELETE_BOX_CLASS = 'reference-delete-box'
export const REFERENCE_LIST_MAX = 10     // max blocked lines / deletable names listed in a batch dialog

// Codelist / unit reference row → '表单名(OID)-字段名(变量名)'; no OID → '表单名-字段名(变量名)';
// unplaced (form_name == null) → '字段库-字段名(变量名)'
export function formatFieldReference(ref)

// Order-preserving partition; refsMap keys may be strings; missing / empty / non-array refs → deletable
export function partitionByReferences(items, refsMap) // → { blocked: [{ item, refs }], deletable: [item] }

// Single-delete gate alert
export function showReferenceBlockedAlert(messageBox, message)
//   → messageBox.alert(message, '无法删除', { type: 'warning', confirmButtonText: '知道了', customClass: REFERENCE_DELETE_BOX_CLASS })

// Batch flow → Promise<items to delete>
export async function confirmReferenceAwareBatchDelete(messageBox, { items, refsMap, noun, nameOf, describeRefs })

export function buildPartialDeleteMessage(noun, deletedCount, blockedCount)
//   → `已删除 ${deletedCount} 个${noun}，${blockedCount} 个被引用的${noun}未删除`
```

`confirmReferenceAwareBatchDelete` cases:

| Case | Dialog | Returns |
|---|---|---|
| `items` empty | none | `[]` |
| all blocked | `messageBox.alert(blockedOnlyMessage, '无法删除', { type: 'warning', confirmButtonText: '知道了', customClass })`; only actual dismissals (`'cancel'` / `'close'`) are ignored; unexpected errors propagate | `[]` |
| none blocked | `messageBox.confirm(\`确认删除选中的 ${n} 个${noun}？\`, '批量删除', { type: 'warning' })` (today's text) | all `items` |
| mixed | `messageBox.confirm(mixedMessage, '批量删除', { type: 'warning', confirmButtonText: \`删除 ${d} 个${noun}\`, cancelButtonText: '取消', customClass })` | `deletable` |

Confirm rejection (`'cancel'`) propagates so callers keep `catch (e) { if (e !== 'cancel') … }`.

Message text (lines joined with `\n`; one empty line between sections):

```
以下 {B} 个{noun}已被引用，不能删除（需先解除引用）：      ← mixed header
选中的 {B} 个{noun}均已被引用，不能删除（需先解除引用）：  ← all-blocked header
【{nameOf(item)}】：{describeRefs(refs)}                  ← one line per blocked item, first REFERENCE_LIST_MAX
...等共{B}个{noun}                                        ← only when B > REFERENCE_LIST_MAX

以下 {D} 个{noun}未被引用，确认删除？                      ← mixed only
{name1}、{name2}、…                                        ← first REFERENCE_LIST_MAX names joined by '、', then '、...等共{D}个' when D > max
```

### 3.2 Per-entity wiring

| Component | noun | nameOf | describeRefs (batch, max 3) | Batch refs request | Single-delete blocked text (max 5, `\n`) |
|---|---|---|---|---|---|
| `CodelistsTab.vue` | 字典 | `c.name` | `truncRefs(refs.map(formatFieldReference), 3, '、')` | `codelists/batch-references?include_unplaced=true` | `该字典被以下字段引用，需先解除相关字段的引用：\n${truncRefs(refs.map(formatFieldReference))}` |
| `UnitsTab.vue` | 单位 | `u.symbol` | same as above | `units/batch-references?include_unplaced=true` | `该单位被以下字段引用，需先解除相关字段的引用：\n${truncRefs(refs.map(formatFieldReference))}` |
| `FieldsTab.vue` | 字段 | `f.label` | `formatFieldImpactMessage(refs, { max: 3, sep: '、' })` | `field-definitions/batch-references` | `该字段被以下表单引用，需先从相关表单中移除该字段：\n${formatFieldImpactMessage(refs, { max: 5, sep: '\n' })}` |
| `FormDesignerTab.vue` | 表单 | `f.name` | `truncRefs(refs.map((r) => r.visit_name), 3, '、')` | `forms/batch-references` | `该表单被以下访视引用，需先从相关访视中移除该表单：\n${truncRefs(refs.map((r) => r.visit_name), 5, '\n')}` |

- Single delete: `refs = await api.get(<references>)` (codelist / unit with `?include_unplaced=true`) → `if (refs.length) return await showReferenceBlockedAlert(ElMessageBox, text)` → existing `ElMessageBox.confirm` (codelist / unit texts unchanged; field → `删除字段 "${f.label}"？`; form → `删除表单 "${f.name}"？`) → existing delete call and post-delete handling.
- The blocked condition is `refs.length > 0` for all four (matches the guards exactly; the field-impact `> 1 forms` threshold stays only in `FieldsTab.save`).
- Batch delete: keep existing empty-selection guards → `refsMap = await api.post(<batch-references>, { ids })` → `toDelete = await confirmReferenceAwareBatchDelete(ElMessageBox, {...})` → `if (!toDelete.length) return` → `deleteIds = toDelete.map((x) => x.id)` → `api.post(<batch-delete>, { ids: deleteIds })` → selection handling → reload → when `toDelete.length < items.length` show `ElMessage.success(buildPartialDeleteMessage(...))`.
- Post-delete selection: clear the property-card / current selection only when its id is in `deleteIds` (UnitsTab already does this; CodelistsTab `selected`, FieldsTab `clearSelection()`, FormDesignerTab `invalidateFormSelectionSession(); selectedForm.value = null; formFields.value = []` follow the same rule). Batch selection arrays are still reset to `[]`.
- Snapshot the selected items (`const items = [...selX.value]`) before awaiting, so selection changes during the dialog cannot alter what is deleted.

### 3.3 Style (append to the end of `main.css`; global because message boxes are teleported)

```css
/* 引用拦截 / 批量删除分组弹窗：保留换行，长列表可滚动 */
.el-message-box.reference-delete-box { --el-messagebox-width: 520px; width: var(--el-messagebox-width); max-width: calc(100vw - 32px); }
.el-message-box.reference-delete-box .el-message-box__message { max-height: 50vh; overflow-y: auto; }
.el-message-box.reference-delete-box .el-message-box__message p { white-space: pre-line; overflow-wrap: anywhere; }
```

The doubled class beats Element Plus' own `.el-message-box { --el-messagebox-width: 420px }` regardless of stylesheet order.

## 4. Compatibility / risk

- Default reference responses unchanged → edit-impact prompts and the in-flight quick-edit extraction are unaffected.
- Backend 409 guards stay as the race safety net: if a reference is added between the check and the delete, the batch fails with today's error toast and nothing is deleted.
- Merge risk: `FormDesignerTab.vue` / `main.css` are also modified by `10-08-legacy-cleanup` and `10-08-shared-rule-convergence` in other hunks; this task touches only `delForm` / `batchDelForms`, one import line, and the end of `main.css`.

## 5. Rollback

Single feature branch `feat/reference-delete-guard`; revert the merge commit to roll back. No data migration, no schema change.
