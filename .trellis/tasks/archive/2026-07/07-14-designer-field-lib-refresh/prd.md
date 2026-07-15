# 设计器字段库刷新（req4）

> 父任务：`07-14-crf-editor-batch-fixes`

## Goal

表单设计界面通过属性编辑器保存字段属性（修改字段定义）后，左侧「字段库」（`FieldsTab`，由注入的 `refreshKey` 驱动）应自动刷新，反映最新的字段定义，无需手动刷新。

## Background and confirmed facts

- `FieldsTab` 的字段定义列表通过 `watch(refreshKey, ...)` 响应刷新；`refreshKey` 由 `App.vue` 提供、`FormDesignerTab.vue` `inject('refreshKey')`。
- `FormDesignerTab.vue` 的持久化属性保存路径 `saveFieldProp`（约 2092–2163 行）会 `PUT /api/projects/{projectId}/field-definitions/{id}` 修改字段定义，但**保存成功后未 `refreshKey.value++`**，因此字段库保持陈旧。
- 对照：字段复制 / 相关路径在 2578 / 2591 行保存后会 `refreshKey.value++`，字段库能刷新——说明 bump `refreshKey` 是既有、正确的刷新机制。
- `saveQuickEdit`（实例级 `label_override` / 颜色）只改表单字段实例，不改字段定义，字段库（定义列表）不受影响，**不在本次刷新范围**。

## Requirements

### R1 — 属性保存成功后刷新字段库

- `saveFieldProp` 在**成功更新字段定义**（非日志行分支，即真正 `PUT field-definitions` 的路径）后，`refreshKey.value++`，触发字段库重载。
- 日志行分支只改实例 `label_override`、不改字段定义，可不触发字段库刷新（如触发也无害，但应以「定义是否变更」为准，避免无谓刷新）。
- 刷新仅在保存成功后进行；保存失败（抛错）不 bump，保持现有错误提示与脏态。

### R2 — 不破坏既有语义

- 不改变属性保存的请求顺序、payload、撤销/重做历史记录、`syncSelectedField` 与 `loadFormFields` 逻辑。
- 不引入新的跨组件状态；复用既有 `refreshKey` 注入机制。

### R3 — 测试

- 前端补回归：属性保存成功后 `refreshKey` 自增（或断言 wiring：`saveFieldProp` 成功分支调用了 `refreshKey.value++`）。
- 保存失败分支不 bump。
- 覆盖率不低于基线。

## Acceptance Criteria

- [ ] 在设计器属性编辑器修改字段标签/类型/变量名并保存后，左侧字段库列表无需手动刷新即反映新值。
- [ ] 保存失败时字段库不刷新、脏态与错误提示保持不变。
- [ ] 新增前端回归测试通过，全量前端套件绿。

## Notes

- 轻量任务，PRD 为主；改动集中在 `FormDesignerTab.vue` `saveFieldProp` 尾部一处 `refreshKey.value++`。
- 与其它改 `FormDesignerTab.vue` 的子任务串行；建议作为批次首个执行（低风险、快速见效）。
