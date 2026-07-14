# 设计器历史命令与 busy / 表单 session 协调（既有通病，非单一任务引入）

## Goal
消除 `FormDesignerTab.vue` 中「会写入撤销栈的命令」与撤销/重做 `busy` 锁、以及跨表单异步回写 `formSelectionSession` 之间缺乏协调导致的历史栈污染风险。此问题为**全项目既有通病**，由 `07-13-designer-field-copy` 的交叉审查（Codex + Antigravity）顺带发现，非该任务引入。

## Background / 来源
- 发现于任务 `07-13-designer-field-copy` 的实现交叉审查。
- 审查结论经本地复核确认「属实但非本次引入」——现有 `addField`(:632)、`removeField`(:788)、`saveDraftField`(:2159)、`addLogRow`(:2367)、`saveFieldProp`(:592)、reorder(:2307)、`batchDelete`(:823) 等所有 `designerHistory.record(...)` 调用点均存在同类风险；不应在字段复制任务里顺手扩大改动面（违背最小改动原则），故独立记录。

## 问题清单

### P1：record 类命令未与 `designerHistory.busy` 协调（Codex 评 High）
- `useDesignerHistory` 的 `undo()/redo()` 执行期间置 `busy=true`（`useDesignerHistory.js:64/81`），`canUndo/canRedo` 已按 `!busy` 门控，撤销/重做按钮 `:loading="designerHistory.busy.value"`（FormDesignerTab.vue:3568/3582）。
- 但「复制 / 新增字段 / 新增日志行 / 删除 / 批量删除 / 属性保存 / 排序」等会 `record()` 的按钮**未在 busy 期间禁用**。用户在一次 `undo()/redo()` 的 await 窗口内触发这些命令，`record()` 会与正在进行的回放并发：回放内部「读 entry → await → slice/push 栈」与新 `record()`（push undo + 清空 redo）交错，可能产生错误栈状态。
- 依据：`useDesignerHistory.js:45-92`、`FormDesignerTab.vue` 各 record 调用点、按钮模板 :3649 等。

### P2：命令异步完成后 record 未做当前表单一致性校验（Codex 评 Medium）
- 组件已有 `formSelectionSession`（:158/172/1530）用于阻断「切表单后旧异步回写」，但 `record()` 类命令的异步链路（先 await 网络，再 `designerHistory.record(...)`）**未接入该 session 校验**。
- 若用户在命令异步未完成时切换表单：`watch(selectedForm.id)` 会 `clear()` 历史（:289 附近），随后旧命令的 `record()` 又把旧表单操作灌回被清空的历史栈；此后在新表单触发 undo/redo 会回放到错误目标。
- 依据：`FormDesignerTab.vue:289`（切表单清历史）、各 record 调用点、`formSelectionSession` 机制（:1530-1559）。

## 建议方向（设计阶段细化，勿在此拍死）
- 方案 A：所有 record 类按钮在 `designerHistory.busy` 时统一禁用/`:loading`。
- 方案 B：`record()` 前置一次 `formSelectionSession` / `selectedForm.id` 一致性校验，不一致则丢弃本次 record（命令的后端副作用已发生，仅不入栈）。
- 需统一收口，避免逐个命令重复补丁（考虑一个包装器 `recordIfCurrent(...)`）。

## Acceptance Criteria（待 start 时细化）
- [ ] busy 期间无法通过 record 类命令污染撤销/重做栈（自动化行为测试覆盖并发交错）。
- [ ] 命令异步未完成时切表单，旧命令不会把历史灌回新表单（行为测试覆盖跨表单窗口）。
- [ ] 收口为统一机制，覆盖全部现有 record 调用点，`node --test tests/*.test.js` 全绿。

## Notes
- 优先级 P2/P3：为健壮性问题，触发窗口窄（需在 undo/redo 或异步复制窗口内额外操作），非数据损坏高发路径。
- 与 `07-13-designer-field-copy` 独立，可单独规划实现。
