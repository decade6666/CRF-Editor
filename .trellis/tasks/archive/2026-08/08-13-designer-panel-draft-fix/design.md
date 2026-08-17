# 设计：命令 / 快照 / 历史方案与边界单线

> 目标文件：`frontend/src/composables/formDesignerPropertyEditor.js`、`frontend/src/components/FormDesignerTab.vue`、`frontend/tests/*`（仅测试改动）。后端零改动，依据见 §5。

## 1. 现状关键事实（已源码核验）

| 事实 | 位置 |
| --- | --- |
| 草稿保存交给 `buildFieldProfileCommand`，候选链接分支不发 `definition_operation` | `formDesignerPropertyEditor.js:149-176`；调用点 `FormDesignerTab.vue:2733-2737` |
| 已持久化字段换绑路径发 `update_shared`（语义参照） | `formDesignerPropertyEditor.js:105-123`（`isCandidateRebind` 分支） |
| 点击候选时已捕获候选快照 `candidateBeforeDefinition`（草稿/持久化共用，草稿分支 `applyEditorToDraft`） | `FormDesignerTab.vue:1361-1387` |
| 草稿撤销只删实例 + 条件清理新建定义，不恢复共享定义 | `FormDesignerTab.vue:2755-2783`（`undo` 闭包） |
| 草稿重做固定改写 `create_or_restore` + `preferred_definition_id` | `FormDesignerTab.vue:2767-2782` |
| 后端 `create_or_restore` 命中既有定义（restore 分支）时不应用 definition payload | `field_profile_service.py:106-110` |
| `POST field-profile` 已支持 `update_shared` + `binding: existing`（仅 `create_or_restore` 强制 `operation_result` 绑定） | `schemas/field_profile.py:50-73`；`field_profile_service.py:80-119, 205-252` |
| `PUT binding-profile` 的 `instance=delete` 分支**忽略** `definition_operation` | `field_profile_service.py:266-272` |
| 删实例只清理孤儿「标签」定义，共享候选永不因删实例被误删 | `field_cleanup_service.py:62-73` |
| 三面板各自完整边框 + 6px 透明轨道（宽屏 grid / 窄屏堆叠） | `FormDesignerTab.vue` scoped：`.designer-fields-panel` 5805、`.designer-editor-card` 5823、`.designer-preview-pane` 5967、`.pane-h-resizer` 5720、`.pane-v-resizer` 5836、`.designer-shell` 5697-5748 |
| 影响确认现有实现（仅持久化路径在用） | `FormDesignerTab.vue:2300-2307`、2347-2354 |

## 2. 命令层设计（formDesignerPropertyEditor.js）

### 2.1 `buildFieldProfileCommand` 扩展

新增可选参数 `candidateDefinitionPayload = null`（调用方传入 `candidateBeforeDefinition`）：

```
候选链接成立（selectedDefinitionId != null && (candidateOid == null || variable_name === candidateOid)）时：
  updatePayload = candidateDefinitionPayload == null
      ? null
      : buildDefinitionPayload({ ...candidateDefinitionPayload, ...editorState })
  definitionChanged = updatePayload != null
      && !sameDraftDefinitionPayload(updatePayload, candidateDefinitionPayload)
  command = { binding: { mode: 'existing', target_field_definition_id: selectedDefinitionId },
              instance: { mode: 'upsert', upsert: instance } }
  if (definitionChanged):
      command.definition_operation = {
        operation: 'update_shared',
        update_shared: { target_definition_id: selectedDefinitionId,
                         definition: updatePayload } }
```

- 无差异 → 命令与现状完全一致（`definition_operation` 缺省）；OID 改动 → 走原 `create_or_restore` 分叉分支；不传 `candidateDefinitionPayload`（null）→ 行为与现状一致（向后兼容）。

### 2.2 定义级差异判定（9 键）

新增导出纯函数与常量：`DRAFT_DEFINITION_DIFF_KEYS`（9 键）+ `sameDraftDefinitionPayload(a, b)`（仅比较这 9 键）：

```js
export const DRAFT_DEFINITION_DIFF_KEYS = [
  'variable_name', 'label', 'field_type', 'checkbox_label',
  'integer_digits', 'decimal_digits', 'date_format', 'codelist_id', 'unit_id',
]
```

**为什么是 9 键而非 `buildDefinitionPayload` 全量比较**：草稿的 `field_definition` 不含 `is_multi_record` / `table_type`（`newField` 构造与属性编辑器都不包含），全量比较会把它们默认化为 `0` / `'固定行'`，链接一个 `is_multi_record=1` 的候选时**零编辑也判为有差异**（假阳性），每次保存触发多余的共享写入与影响确认。9 键即属性编辑器实际可编辑的定义级键。

**update_shared 载荷先合并候选快照，再覆盖编辑器 9 键**：`buildDefinitionPayload({ ...candidateDefinitionPayload, ...editorState })` 保留候选未暴露在草稿编辑器中的 `is_multi_record` / `table_type`，同时把用户可编辑键写成草稿最终值。差异判定仍只看 9 键，因此既不会零编辑假阳性，也不会因修改标签等可见属性而意外默认化隐藏 legacy 列。分叉/新建路径没有候选身份，继续使用现有 `buildDefinitionPayload(editorState)`。

## 3. saveDraftField 接线（FormDesignerTab.vue）

### 3.1 影响确认（POST 之前、`savingDraft`/mutation 计数器开启之前）

现有 OID 冲突等校验之后、`savingDraft.value = true` 之前：

```js
const command = buildFieldProfileCommand({
  editorState,
  selectedDefinitionId: selectedDefinitionId.value,
  candidateOid: candidateOid.value,
  candidateDefinitionPayload: candidateBeforeDefinition,
});
const definitionChanged = command.definition_operation?.operation === 'update_shared';
if (definitionChanged) {
  try {
    await confirmFieldReferenceImpact(command.definition_operation.update_shared.target_definition_id);
  } catch (e) {
    if (e === 'cancel' || e === 'close') return false;   // 取消确认：保留草稿，不发请求
    throw e;
  }
}
```

- 确认目标**从已构造命令派生**（单一事实来源；与 `saveSelectedFieldProp` 用 `resolveSharedWriteTarget` 同构，但草稿路径必须叠加「定义级差异」条件，不新增独立判定辅助）。
- 取消/关闭 → `return false`：草稿保留、无请求、mutation 计数器未开启、无任何状态变更；经 `confirmDiscardDraft` 触发的保存被取消时同样返回 false，外层切换流程中止。
- POST 成功后的缓存失效与 `refreshKey` 刷新维持现状（`FormDesignerTab.vue:2743-2744`）。

### 3.2 历史闭包捕获

`recordDesignerHistory` 闭包在 POST 之前捕获：`definitionChanged`（是否执行过 `update_shared`）、`restoreDefinitionPayload = candidateBeforeDefinition`（保存前候选定义快照）。现有捕获 `command` / `editorState` / `definitionCreated` 不变。

## 4. 历史条目（原子动作）设计

### 4.1 条目形态

仍是一条 `label: '新建字段'` 记录，`ids: { ffId, fdId }`（`fdId = result.final_definition_id`，链接路径即候选定义 id），闭包携带 §3.2 捕获值。

### 4.2 undo（两步，恢复先行）

```js
undo: async (ids) => {
  if (definitionChanged) {
    // 先恢复共享定义快照（幂等：同样的载荷再发一次无副作用）
    await api.put(`/api/projects/${projectId}/field-definitions/${ids.fdId}`, restoreDefinitionPayload);
    api.invalidateCache(`/api/projects/${projectId}/field-definitions`);
  }
  const deleteCommand = buildDeleteProfileCommand({
    cleanupDefinitionId: definitionCreated ? ids.fdId : null,   // 共享候选永不删除（现状守卫不变）
  });
  const replayResult = await replayBindingProfile(historyContext, ids.ffId, deleteCommand);
  if (replayResult?.cleanup?.retained_in_use) ElMessage.warning('字段定义已被其他表单引用，已保留定义');
},
```

- `definitionChanged=false` → 与现状一致的单请求删除。
- **恢复先行理由**：若删除先成功而恢复失败，实例已消失、共享定义仍被草稿值覆盖，重试因 ffId 404 永久卡死；恢复先行则删除失败时重试完全幂等（定义已恢复、实例仍在，再撤销一次即可完成）。
- 恢复走字段库既有 `PUT /api/projects/{projectId}/field-definitions/{fdId}`（`FieldDefinitionUpdate` 覆盖全部 11 键，`order_index` 不传保持原值；恢复载荷 OID 与候选一致，不触发唯一约束冲突）。
- 删除走既有 `PUT binding-profile` 的 `instance=delete` 分支；`cleanupDefinitionId` 仍由 `definitionCreated` 守卫 + `field_cleanup_service` 只清孤儿「标签」定义 → 双重保护，**链接路径撤销绝不删除候选定义**。
- 恢复 PUT 成功后立即失效 `/api/projects/${projectId}/field-definitions` 缓存；随后 `replayBindingProfile` 成功路径的 `reloadAfterReplay(formId, { defs: true })` 继续统一重载。若删除失败，字段库也不会短暂继续显示保存后的陈旧定义。

### 4.3 redo（单请求重放）

```js
redo: async (ids, { remapId }) => {
  const redoCommand = definitionCreated
    ? { ...command,                                     // 分叉：现状行为不变
        definition_operation: { operation: 'create_or_restore',
          create_or_restore: { definition: buildDefinitionPayload(editorState),
                                preferred_definition_id: ids.fdId } },
        binding: { mode: 'operation_result' } }
    : { ...command };                                   // 链接路径：原样重放捕获的前向命令
  const redoResult = await api.post(`/api/forms/${formId}/field-profile`, redoCommand);
  remapId(ids.ffId, redoResult.form_field_id ?? redoResult.form_field?.id);
  remapId(ids.fdId, redoResult.final_definition_id ?? ids.fdId);
  await reloadAfterReplay(formId, { defs: true });
},
```

- **链接路径（有无差异都）原样重放前向命令**：有差异 → 重新应用 `update_shared`（AC7 的「不能只处理实例而遗留共享属性变化」）；无差异 → 纯绑定（现状 redo 的 `create_or_restore+preferred` 语义等价但后端 restore 分支不应用载荷，原样重放更简单且与 forward 一致）。
- **分叉**：保持现状（undo 已删新建定义，redo 用 `preferred_definition_id` 重建/复用）。

### 4.4 失败语义（沿用现有机制，无需新代码）

`useDesignerHistory` 回放抛错时命令保栈、ids 快照还原、`runHistory` 提示可重试；undo 的恢复先行保证重试幂等。

### 4.5 为什么两步而非单请求（被否决方案）

`update_binding_profile` 的 delete 分支在 `_resolve_definition_operation` 之前提前返回，`definition_operation` 被忽略（`field_profile_service.py:266-272`）——单请求「删实例 + 恢复定义」需要改后端契约。父任务 PRD 明确「主要工作保持在前端，除非验证发现接口缺口」，且 AC12 的「原子动作」约束的是撤销栈层面（一次 Ctrl+Z 同时撤销两者）。两步请求 + 恢复先行 + 栈内重试已满足该约束，因此不改后端。

## 5. 后端零改动验证依据

| 新前端命令形态 | 既有后端能力 | 依据 |
| --- | --- | --- |
| `POST field-profile` + `update_shared` + `binding: existing` + `instance.upsert` | schema 允许；service 只对 `create_or_restore` 强制 `operation_result`；`update_shared` 校验 OID 不变（422）后整值覆盖 | `schemas/field_profile.py:50-73`；`field_profile_service.py:80-100, 216-222`；既有测试 `test_binding_profile_update_shared_definition`、`test_binding_profile_shared_update_rejects_oid_change`、`test_create_profile_create_or_restore_requires_operation_result_binding` |
| 撤销恢复：`PUT /projects/{pid}/field-definitions/{fdId}` 全键载荷 | 字段库既有更新端点，`FieldDefinitionUpdate` 覆盖全部 11 键，`exclude_unset` 语义，`order_index` 缺省不改 | `routers/fields.py:143-184`；`schemas/field.py:56-77` |
| 撤销删除：`PUT binding-profile` + `instance: delete`（`cleanup_definition_id` 缺省） | 既有删除语义；缺省不清理任何定义；删实例只清孤儿「标签」定义 | `field_profile_service.py:266-272, 168-191`；`field_cleanup_service.py:62-73`；既有测试 `test_binding_profile_delete_instance_and_cleanup_definition`、`test_binding_profile_delete_retains_definition_when_referenced` |
| 影响确认：`GET /field-definitions/{fdId}/references` | 既有端点 | `routers/fields.py:190-208` |

验证方式：新增前端用例覆盖命令形态与 undo/redo 闭包接线；后端不新增测试，仅跑全量 pytest 回归。

## 6. 边界单线 CSS 设计（FormDesignerTab.vue scoped）

### 6.1 原则

三面板均 `border: 1px solid var(--color-border)` + 圆角 + 阴影，面板间 6px 透明轨道 → 视觉双线。方案：**分隔线由轨道绘制，面板只保留外缘边框**。

### 6.2 宽屏（默认 grid）

- `.designer-fields-panel`（内缘=右、下）：`border-right: none; border-bottom: none;`
- `.designer-editor-card`（内缘=右、上）：`border-right: none; border-top: none;`
- `.designer-preview-pane`（内缘=左）：`border-left: none;`
- `.pane-h-resizer`：`position: relative;` + `::before { position:absolute; left:2.5px; top:0; bottom:0; width:1px; background:var(--color-border); }`（6px 轨道中居中一条竖线）
- `.pane-v-resizer`：`position: relative;` + `::before { position:absolute; top:2.5px; left:0; right:0; height:1px; background:var(--color-border); }`

效果：hresizer grid 区域跨三行连续贯通，字段列表/属性编辑与实时预览间整条边界仅一条居中竖线；字段列表与属性编辑间一条居中横线；外缘（字段列表左/上、属性编辑左/下、预览右/上/下）完整。保留：面板圆角/阴影、轨道 hover 高亮（`--color-primary-subtle`）、6px 拖拽热区；不引入负 margin。

### 6.3 窄屏堆叠（≤1100px）

堆叠顺序 fields / lresizer / editor / preview。外缘恢复 + 无轨道相邻处补线：

- `.designer-fields-panel { border-right: 1px solid var(--color-border); }`、`.designer-editor-card { border-right: 1px solid var(--color-border); }`、`.designer-preview-pane { border-left: 1px solid var(--color-border); }`（hresizer 隐藏后 fields/editor 的右侧与 preview 左侧均成为页面外缘）
- fields↔editor 仍由 lresizer 横线分隔（fields `border-bottom: none`、editor `border-top: none` 保持）
- editor↔preview 无轨道直接相邻：`.designer-editor-card { border-bottom: 1px solid var(--color-border); }`、`.designer-preview-pane { border-top: none; }`（只保留一条线）
- `.pane-h-resizer { display: none }` 现状保留，竖线随之消失

**级联顺序陷阱**：现有 `@media (max-width: 1100px)` 块（5745-5748）位于面板规则（5805/5823/5967）之前，在其中追加面板选择器会被后续规则覆盖 → 必须在 `.designer-preview-pane` 规则**之后**新增堆叠模式媒体块。

### 6.4 字段条目不动

`.ff-item`（卡片、`.ff-selected` 选中边框、悬停、拖拽反馈）与 `.fd-item`（字段库）零改动；源码级守卫测试锁定关键规则仍存在。

## 7. 边界情况（显式取舍）

- **多用户并发**：撤销恢复点击候选时的快照，期间他处改写会被覆盖——与现有 rebind 撤销语义一致，不在本任务范围。
- **撤销恢复 404**：恢复在删实例之前，实例仍绑定定义，外键约束下定义不可能已删，404 实际不可达；即使发生也按通用回放失败语义处理（保栈可重试）。
- **redo 前候选被外部删除**：链接路径按原前向命令重放时会得到 404，现有 history 机制保留命令与 id 快照供重试；不在 redo 中静默创建一个语义可能不同的新共享定义。
- **隐藏 legacy 列**：9 键只负责差异判断；共享更新载荷从候选快照合并，保留 `is_multi_record`/`table_type`（§2.2）。
- **`candidateBeforeDefinition` 为空防御**：与 `selectedDefinitionId` 在 `selectAutocompleteCandidate` 同时赋值，正常非空；builder 对 null payload 按无差异处理，回退现状。
