# 设计器分隔与草稿保存修复

> 父任务：`08-13-admin-editor-interaction-refactor`（R5 交付面，对应父任务 AC10–AC13）
> 串行约束：与 `08-13-toolbar-pane-alignment` 共用超大组件 `frontend/src/components/FormDesignerTab.vue`，必须等其合入后再实施，禁止并行写该文件。

## Goal

1. 三块主工作区（字段列表、实时预览、属性编辑）相邻边界合并为单细线；字段条目视觉与交互不变。
2. 修复草稿数据丢失：草稿链接字段库候选 → 修改属性 → 保存后，定义级修改写回同一共享字段定义；实例级仍只影响当前表单。
3. 该保存的撤销/重做把共享定义快照与新增实例作为一个原子动作。

## Background（根因摘要；证据详见 design.md §1）

- 草稿保存路径 `buildFieldProfileCommand` 候选链接分支只发 `binding: existing` + 实例 upsert，不发 `definition_operation`，草稿态定义级编辑被丢弃（`formDesignerPropertyEditor.js:149-175`；测试 `fieldProfileCommands.test.js:108-115` 锁定旧行为）；已持久化字段换绑路径却走 `update_shared`（`formDesignerPropertyEditor.js:105-123`），语义不一致。
- 撤销只删实例、不恢复共享定义；重做固定改写成 `create_or_restore`，而后端 restore 分支命中既有定义时不应用载荷 → 共享属性修改不重放（`field_profile_service.py:106-110`）。

## Requirements

- **R1 边界单线**：只调三块主工作区相邻边界：每组相邻区域只显示一条 1px 分隔线，由拖拽轨道承载（保留 6px 拖拽热区与 hover 高亮）；外缘边框完整；宽屏与窄屏（≤1100px 堆叠）都满足；字段列表中的独立字段条目（`.ff-item` 卡片、选中、悬停、拖拽、键盘）不动。
- **R2 草稿链接候选且 OID 未改**：定义级属性有差异 → 命令携带 `definition_operation.update_shared`（目标=候选定义），实例级仍 `instance.upsert`（局部）；无差异 → 保持纯绑定+实例，不产生多余定义写入；差异只比较编辑器实际可编辑的 9 键，共享载荷保留候选未暴露的 legacy 结构字段；保存结果与最后一次草稿编辑一致。
- **R3 多表单影响确认**：将执行 `update_shared` 且目标定义被多个表单引用时，保存前弹影响确认（复用现有 `confirmFieldReferenceImpact`）；取消/关闭 → **保留草稿**（不发请求、不改状态）。
- **R4 原子撤销/重做**：一次撤销同时删除新增实例，并在本次确实执行过 `update_shared` 时恢复候选定义保存前快照；一次重做同时重放共享定义修改并恢复实例；任何情况下不得删除共享候选定义；不得留下半撤销状态。
- **R5 OID 身份规则不变**：链接候选后改动 OID 仍分叉新定义（`create_or_restore` + `binding: operation_result`），撤销/重做与现状一致。

## Acceptance Criteria

- [ ] AC1：三组相邻区域（字段列表↔属性编辑、字段列表↔实时预览、属性编辑↔实时预览）各仅一条 1px 分隔线；外缘边框完整；拖拽轨道 hover/拖拽高亮保留。
- [ ] AC2：`.ff-item` 条目卡片、选中边框、悬停、拖拽与键盘交互不退化（源码级回归锁定）。
- [ ] AC3：窄屏（≤1100px）堆叠布局下相邻区域同样单线，外缘边框不丢失。
- [ ] AC4：草稿链接候选 → 改定义级属性 → 保存，OID 未改时结果与最后一次草稿编辑一致（定义级写回候选、实例级局部、隐藏 legacy 结构字段保持原值）；有先红后绿回归。
- [ ] AC5：仅改实例级属性时保存不产生定义级写入、不触发多余影响确认。
- [ ] AC6：多表单引用时保存前弹确认；取消/关闭后草稿完整保留、不发请求。
- [ ] AC7：撤销一次动作同时恢复定义保存前快照并删实例；重做一次动作同时重放定义修改并恢复实例；不删共享候选；回放失败保栈可重试。
- [ ] AC8：改 OID 分叉行为的撤销/重做与现状一致。
- [ ] AC9：相关前端测试、lint、build 通过；浏览器实机验证（明暗主题、宽/窄屏、草稿全流程），未运行项明确说明。

## Constraints

- **后端零改动**（依据见 design.md §5）：不碰 `backend/`；新命令形态全部映射到既有接口既有语义。
- 只改 `frontend/src/composables/formDesignerPropertyEditor.js`、`frontend/src/components/FormDesignerTab.vue` 及对应前端测试；不改 `frontend/dist/` 与其它页面。
- 不引入新依赖、不新增数据模型；权限、项目隔离、字段定义契约不变。
- 影响确认、OID 冲突守卫、字段库刷新（`refreshKey`）、缓存失效沿用现有机制。
- 已持久化字段的候选换绑（`saveFieldProp`）行为不变；多用户并发竞态与现状 rebind 语义一致（点击候选时快照），不在本任务范围。
