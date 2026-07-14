# Design — 设计器属性卡改为保存/取消与脏拦截（G3）

> 任务：`07-13-designer-field-prop-save-cancel`｜父任务：`07-13-designer-fields-ux-batch`
> 依赖：父任务 D1/D2（"多表单"判定与影响提醒文案，与 G4 共享）。

## 1. 现状（autosave 架构）

属性编辑器当前是**防抖自动保存**，无显式保存/取消按钮（仅草稿字段有一套独立的 取消/保存 bar，见 `FormDesignerTab.vue:4762-4775`）。核心链路：

- 状态：`editProp` reactive（`1720`）；选中态 `selectedFieldId`（`1737` 区）。
- 输入触发：`watch(currentFieldPropDraftKey)`（`2075-2091`）→ 草稿走 `applyEditorToDraft()` 本地写回；持久字段 `upsertPendingFieldPropSnapshot` + `setTimeout(flushPendingFieldPropSave, 400)`。
- 保存核心：`flushPendingFieldPropSave`（`2011`）→ `saveFieldProp(snapshot, sessionId)`（`2152`）：PUT `field-definitions/{fdId}` + PUT `form-fields/{ffId}`（default_value）+ PATCH `form-fields/{ffId}/colors` + `loadFormFields()`，并在前后状态不同（`snapshotFieldPropState`/`sameFieldPropState`）时 `designerHistory.record('编辑属性')`（`2209-2221`）。
- 离开 flush：`flushFieldPropSaveBeforeReset`（`1958`）→ `resolveFieldPropLeave`（`1999`）→ 失败可 `confirmDiscardFieldPropChanges`（`1902`）。
- 离开触发点：`selectForm`（`1599`）、切项目 watch（`2714`）/`canLeaveProject`（`2739`）、`handleDesignerBeforeClose`（`2743`）。切字段目前在 `selectField`（`2094`）内 `void flushPendingFieldPropSave()` 静默 flush，`onSelectFieldClick`（`2400`）无脏拦截。
- 辅助：`snapshotFieldPropState(ff)`（`539`）与 `sameFieldPropState`（`564`，JSON 比较）已存在——可直接复用为脏态基准比较。
- 重试/队列：`pendingFieldPropSnapshots`、`fieldPropSaveTimer`、`fieldPropSaveSession`、`classifyFieldPropSaveError`（含 retryable/context_changed/missing_codelist）。

## 2. 目标架构

改为**显式保存/取消 + 脏拦截**，同时保留 `saveFieldProp` 的 PUT 序列与历史记录，仅拆掉"自动入队 + 防抖 + 重试"这层。

### 2.1 脏态基准

- 新增 `fieldPropBaseline = ref(null)`：在 `selectField` 完成水合后置为 `snapshotFieldPropState(ff)`（对草稿/无 fd 情况置 null）。
- 新增 `currentEditorPropState()`：将 `editProp` 映射为与 `snapshotFieldPropState` **完全一致的形状**（`is_log_row/label_override/default_value/bg_color/text_color/label_bold/label_font_size/fd{...}`）。注意 `label` 映射：普通字段 → `fd.label`；日志行 → `label_override`（编辑器 `editProp.label` 对日志行代表 override）。
- `isDirty = computed(() => selectedFieldId.value && selectedFieldId.value !== DRAFT_FIELD_ID && fieldPropBaseline.value && !sameFieldPropState(fieldPropBaseline.value, currentEditorPropState()))`。

### 2.2 输入 watcher 改造

- `watch(currentFieldPropDraftKey)`：**草稿分支保留**（`applyEditorToDraft`）；**持久字段分支移除**入队 + 防抖保存，改为无副作用（脏态由 `isDirty` computed 派生，无需在 watcher 里做事）。保留 `isHydratingFieldProp` 抑制水合期误判。

### 2.3 显式保存 `saveSelectedFieldProp()`（供按钮与拦截弹窗复用）

1. 守卫：无选中/草稿/`!isDirty` → 直接 return（视调用方语义返回 true）。
2. 前置校验：`isChoiceField(field_type) && !codelist_id` → 提示 `单选/多选字段必须选择选项字典`，保持编辑态，返回 false。
3. **影响提醒（3.3）**：`GET /field-definitions/{fdId}/references` → 用共享判定 `countDistinctForms(refs) > 1` 时 `ElMessageBox.confirm(formatFieldImpactMessage(refs))`（复用 G4 的 D2 文案/`truncRefs`）。用户取消 → 返回 false（不提交，保持编辑态）。日志行字段无 fd 引用语义 → 跳过影响提醒。
4. 执行保存：复用 `saveFieldProp` 的 PUT/PATCH 序列 + `designerHistory.record`（保留其历史前后态对比逻辑）。建议将 `saveFieldProp` 精简为直接接收"来自编辑器的 snapshot"，去掉 `sessionId`/队列依赖，或保留 `sessionId` 但由显式保存传入当前值。
5. 成功后：`fieldPropBaseline.value = snapshotFieldPropState(最新 ff)`，`isDirty` 自动归零；`ElMessage.success('已保存')`。
6. 失败：沿用错误提示，保持编辑态，返回 false。
7. 返回 boolean 表示"保存是否成功完成"（供拦截弹窗决定是否继续被阻止的动作）。

### 2.4 取消 `cancelSelectedFieldProp()`

- 将编辑器还原到 `fieldPropBaseline`：最稳妥是对当前选中 ff 重新 `selectField(ff)`（重走水合，重置 baseline 与 `isDirty`）。不发任何请求。

### 2.5 统一离开拦截 `resolveFieldPropLeave` 重写（3.2）

新语义（替换 flush-queue 版本）：

```
if (!isDirty) return true
弹 ElMessageBox.confirm('字段属性修改尚未保存', { confirmButtonText:'保存', cancelButtonText:'取消', distinguishCancelAndClose:true })
  确认(保存) → const ok = await saveSelectedFieldProp(); return ok   // 保存失败/影响提醒被取消 → false 留在原地
  取消(丢弃) → cancelSelectedFieldProp(); return true               // 丢弃后继续被阻止的动作
  关闭(X)   → return false                                          // 留在原地
```

- `flushFieldPropSaveBeforeReset` / `flushPendingFieldPropSave` / `confirmDiscardFieldPropChanges` / `classifyFieldPropSaveError` / `pending*` 队列在持久字段路径不再需要；`resetFieldPropAutoSaveState` 精简为"清空编辑器 + baseline + 选中态"（保留 `preserveEditor` 语义供切表单/切项目复用）。
- 所有既有调用点（`selectForm:1599`、切项目 watch/`canLeaveProject`、`handleDesignerBeforeClose`）保持调用 `resolveFieldPropLeave`，语义自然升级为三态弹窗。

### 2.6 切字段拦截（3.2 的"切换到其他字段"）

- `onSelectFieldClick(ff)`（`2400`）：在 `selectField(fresh)` 前插入 `const ok = await resolveFieldPropLeave({actionText:'切换字段'}); if(!ok) return;`。
- 移除 `selectField` 内 `void flushPendingFieldPropSave()`（`2094`）——切换的脏处理上移到调用方。
- 注意点选同一字段 / 草稿分支（`2401`）维持原样，不触发拦截。

### 2.7 模板：常显保存/取消 bar

- 在 `</el-form>`（`4761`）后、草稿 bar（`4762`）**同层**新增持久字段的 bar：`v-if="selectedFieldId && selectedFieldId !== DRAFT_FIELD_ID"`，含"取消"（`@click="cancelSelectedFieldProp"` `:disabled="!isDirty"`）与"保存"（`type=primary` `@click="saveSelectedFieldProp"` `:disabled="!isDirty"` `:loading`），带 `data-test` 便于源码级测试。按需求"常显"，故 bar 常显、按钮以 `disabled` 表达无改动态。

## 3. 与 G4 的共享（D1/D2）

- 新增共享纯helper（建议 `frontend/src/composables/fieldReferenceImpact.js`）：
  - `countDistinctForms(refs)`：按 `form_name + '|' + form_code` 去重计数（当前后端不返回 form_id；见父任务 D1）。
  - `formatFieldImpactMessage(refs, { action })`：复用 `truncRefs` 生成与字段界面一致的文案。
- G4 与本任务都引用该 helper，避免逻辑分叉（父任务 PAC2/PAC3）。**实现顺序建议 G4 先落地 helper，G3 复用**；若并行，需在集成时统一到同一 helper。

## 4. 交互矩阵与边界

| 场景 | 行为 |
| --- | --- |
| 改属性未保存 → 点保存 | 走 2.3；多表单弹影响提醒；成功后 baseline 更新 |
| 改属性未保存 → 点取消 | 还原 baseline，不发请求 |
| 改属性未保存 → 切其他字段 | `onSelectFieldClick` 拦截三态弹窗 |
| 改属性未保存 → 切表单 | `selectForm` 既有 `resolveFieldPropLeave` 升级为三态 |
| 改属性未保存 → 切项目 | 切项目 watch/`canLeaveProject` 既有调用升级 |
| 改属性未保存 → 关设计窗 | `handleDesignerBeforeClose` 既有调用升级 |
| 草稿字段编辑 | 不变（本地写回 + 草稿 bar），`isDirty` 对草稿恒 false |
| 日志行字段 | 只可改 label_override/颜色；保存走 log_row 分支；无影响提醒 |
| 撤销/重做回放中(busy) | 保存按钮在 `designerHistory.busy` 时禁用；不破坏既有 busy 门控 |
| 无实际改动点保存 | 按钮 disabled，不发请求 |

- **历史协调**：与 `07-13-designer-history-busy-coordination` 兼容——属性历史仅在显式保存成功时入栈；保存按钮 busy 时禁用（父任务 D4）。
- **快速编辑弹窗** `saveQuickEdit`（实例级）是独立入口，不改；它保存后 `loadFormFields`，若当前选中同一字段需保证 baseline 与列表一致（保存后若选中态存在，重新对齐 baseline）。

## 5. 风险

- autosave 拆除牵涉多个互相引用的函数，易残留死代码或漏改某条离开路径 → 用交互矩阵逐条回归。
- `currentEditorPropState()` 与 `snapshotFieldPropState` 形状/默认值须逐字段对齐，否则 `isDirty` 误报（水合即脏）→ 加"选中后立即 isDirty=false"的回归断言。
- 影响提醒依赖 G4 helper；若 G4 未先落地，临时内联同逻辑并在集成时收敛（父任务 PAC2）。

## 6. 不改动

- 后端接口/payload、字段存储结构、OID 生成、撤销栈持久化。
- 草稿创建流程、aCRF、列宽/行高、设计备注保存。
