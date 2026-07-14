# 技术设计 — 表单设计器字段复制（稳健档）

## 范围
- 改动仅 `frontend/src/components/FormDesignerTab.vue`：新增 `copyFormField(ff)` + 新增 `copyingFieldIds` ref + 一处模板按钮。
- 新增前端测试 `frontend/tests/designerFieldCopy.test.js`。
- 零后端改动、零新增 composable。

## 核心数据流

```
copyFormField(ff):
  if isDraftField(ff): return                     // 草稿行不可复制（按钮已 v-if 隐藏，函数再兜底）
  if hasDraft: await confirmDiscardDraft() 否则 return   // C2 防冲掉他草稿
  if copyingFieldIds.has(ff.id): return           // C3 行级防抖
  copyingFieldIds = new Set([...copyingFieldIds, ff.id])
  const formId = selectedForm.value.id
  const isLog = !!ff.is_log_row && ff.field_definition_id == null
  const instancePayload = { ...buildFormFieldCreatePayload(ff), order_index: (ff.order_index ?? 0) + 1 }
  try:
    let newFd = null
    if (!isLog):                                   // 分支 A
      newFd = await api.post(`/api/field-definitions/${ff.field_definition_id}/copy`, {})
      instancePayload.field_definition_id = newFd.id
      try:
        var newFf = await api.post(`/api/forms/${formId}/fields`, instancePayload)
      catch e:
        try: await api.del(`/api/field-definitions/${newFd.id}`)  // C4 清理孤儿
        catch {}
        throw e
    else:                                          // 分支 B（日志行）
      instancePayload.field_definition_id = null
      var newFf = await api.post(`/api/forms/${formId}/fields`, instancePayload)

    await reloadAfterReplay(formId, { defs: !isLog })
    const created = formFields.value.find(f => f.id === newFf.id)
    if (created) selectField(created)

    // 稳健档快照：新定义完整属性（含 checkbox_label），order_index 归位为 null 交后端分配
    const defSnapshot = newFd ? buildDefinitionSnapshotFromResponse(newFd) : null
    designerHistory.record({ ...见下 })
  catch e:
    ElMessage.error(e.message)
  finally:
    copyingFieldIds = new Set(copyingFieldIds 去掉 ff.id)
```

### `buildDefinitionSnapshotFromResponse(newFd)`（新增内联辅助，避免用残缺的 buildFieldDefinitionCreatePayload）
从 `/copy` 返回的完整 `FieldDefinitionResponse` 取全部可写列，**显式包含 `checkbox_label`**，`order_index: null`（交后端追加，不重放字段库顺序）。字段清单以后端 `FieldDefinitionCreate` schema 为准（variable_name/label/field_type/integer_digits/decimal_digits/date_format/checkbox_label/codelist_id/unit_id/is_multi_record/table_type）。

## 撤销 / 重做（稳健档）

```
record = {
  label: '复制字段',
  ids: { ffId: newFf.id, fdId: newFd?.id ?? null },
  undo: async (ids) => {
    await api.del(`/api/form-fields/${ids.ffId}`)         // 删实例（分支A标签字段会触发后端孤儿标签定义自动清理）
    if (ids.fdId != null) {
      try { await api.del(`/api/field-definitions/${ids.fdId}`) }
      catch (err) {
        const s = Number(err?.status ?? err?.response?.status)
        if (s === 409) ElMessage.warning('字段定义已被其他表单引用，已保留定义')
        else if (s === 404) { /* 标签字段已被后端自动清理，可接受 */ }
        else throw err
      }
    }
    await reloadAfterReplay(formId, { defs: ids.fdId != null })
  },
  redo: async (ids, { remapId }) => {
    let fdId = ids.fdId
    if (fdId != null && defSnapshot) {
      // 优先按同名快照重建；若 409（undo 因引用被保留、定义仍在）→ 复用原 fdId
      try {
        const rebuilt = await api.post(`/api/projects/${projectId}/field-definitions`, defSnapshot)
        remapId(ids.fdId, rebuilt.id); fdId = rebuilt.id
      } catch (err) {
        if (Number(err?.status ?? err?.response?.status) !== 409) throw err
        // 409：同名定义仍存在，复用 ids.fdId
      }
    }
    const payload = { ...instancePayload, field_definition_id: fdId }
    const recreated = await api.post(`/api/forms/${formId}/fields`, payload)
    remapId(ids.ffId, recreated.id)
    await reloadAfterReplay(formId, { defs: ids.fdId != null })
  },
}
```

> 关键点：redo **不再 `/copy`**，改为"复用 fdId 或按快照同名重建"，保证 OID 恒定，反复 undo/redo 不堆叠 `_copyN`。日志行分支 `fdId=null`，redo 仅重建实例。

## 模板改动（仅 :3530 一处）
在「删除」按钮左侧插入：
```html
<el-button
  v-if="!isDraftField(ff)"
  size="small" link
  :disabled="copyingFieldIds.has(ff.id)"
  :aria-label="'复制 ' + getFormFieldDisplayLabel(ff)"
  @click.stop="copyFormField(ff)"
>复制</el-button>
```

## 复用点（DRY）
| 复用 | 来源 |
|---|---|
| `/field-definitions/{id}/copy` | 后端 fields.py:486（整行复制 + OID `_copy`） |
| `buildFormFieldCreatePayload(ff)` | :472（实例全属性） |
| `reloadAfterReplay` | :557 |
| `hasDraft`/`isDraftField`/`confirmDiscardDraft` | 既有草稿守卫 |
| `designerHistory.record` / `remapId` | useDesignerHistory |
| 行级锁 `copyingFieldIds` 范式 | 仿 `deletingFieldIds`(:659) / `savingDraft`(:2162) |

## 取舍
- 不抽新 composable（YAGNI，仅本组件用）。
- 前向复制用后端 `/copy` 而非前端手搓定义 payload —— 后者（`buildFieldDefinitionCreatePayload`）漏 `checkbox_label` 且带旧 `order_index`。
- redo 快照独立构造（`buildDefinitionSnapshotFromResponse`），不复用残缺的 `buildFieldDefinitionCreatePayload`。

## 风险
- redo「409 复用原 fdId」依赖后端唯一约束按 `variable_name` 报 409；需在实现时确认冲突码（若非 409 需按实际码调整）。
- 标签(`标签`)字段作为分支 A 特例：后端删实例会自动清理孤儿标签定义，undo 显式删定义须容忍 404。
