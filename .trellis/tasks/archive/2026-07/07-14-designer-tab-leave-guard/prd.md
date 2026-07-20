# 工作台 Tab 切换脏态守卫

## Goal

从工作台「表单」设计器 Tab 切到其它 Tab（尤其是「字段」）时，复用设计器既有离开守卫链，拦截未保存的字段属性脏改动 / 草稿 / busy 状态，避免静默丢失。

## Background

父任务 `07-13-designer-fields-ux-batch`（已归档）的 PRD Follow-up 明确延后了本项：agy 审查 G3 指出「表单 ↔ 字段」Tab 切换走 `App.vue` 的 `el-tabs`，未经 `resolveFieldPropLeave`，属性卡脏改动可能静默丢失。当时因需求 3.2 只列「切换字段/关闭设计器」且修复需改 `App.vue`（越出子任务单写边界），判定范围外。本任务为该 follow-up 的独立落地。

## Requirements

### R1. Tab 离开守卫

- 当用户从已激活的「表单」Tab（`name="designer"`）切换到任意其它主 Tab 时，必须先经过设计器离开守卫。
- 守卫返回 false 时，Tab 不得切换，`v-model`/`watch(activeTab)` 触发的字段定义缓存刷新不得执行。

### R2. 守卫链语义与项目切换对齐

- 守卫链与现有 `canLeaveProject` 一致：busy/reorder/draft-save 拦截 → 草稿确认 → 注解位置 flush → 设计说明 flush → 属性卡脏态确认（`resolveFieldPropLeave`）。
- 属性卡确认文案使用「切换标签页」（非「切换项目」），避免误导。

### R3. 对外钩子

- `FormDesignerTab` 暴露 `canLeaveTab`；`canLeaveProject` 外部行为与签名保持不变。
- `App.vue` 的 `el-tabs` 通过 `:before-leave` 调用 `canLeaveTab`，仅在 `oldActiveName === 'designer'` 且 designer Tab 已激活时触发。

### R4. 范围边界

- 仅守卫离开「表单」设计器 Tab；其它 Tab 之间互切、进入 designer 不在范围。
- 不引入 `fields` 等其它 Tab 的脏态守卫。
- 不改 `npm run format`，不扩大无关重构。

## Acceptance Criteria

- [x] 设计器属性卡脏态时，从「表单」切到「字段」（或其它 Tab）弹出未保存确认；关闭对话框保留在表单 Tab。
- [x] 确认保存成功后才完成 Tab 切换；取消（丢弃）后完成切换且本地脏改动被丢弃；丢弃后 rehydrate 编辑器，避免懒挂载 Tab 返回时仍显示已丢弃值。
- [x] busy / 草稿 / 注解与设计说明未 flush 成功时，Tab 切换被阻止（与项目切换语义一致）。
- [x] `canLeaveProject` 行为回归不退化；项目切换仍走原钩子。
- [x] 源码级回归：`quickEditBehavior.test.js` / `designerHistory.test.js` 覆盖 `canLeaveTab` 暴露、`resolveDesignerLeave` 守卫链、`App.vue` `:before-leave` 接线。
- [x] 前端相关测试与全量 `tests/*.test.js` 通过（490 passed）；`npm run lint` 0 errors。

## Constraints

- 关键文件限定：`frontend/src/App.vue`、`frontend/src/components/FormDesignerTab.vue`、`frontend/tests/quickEditBehavior.test.js`。
- `FormDesignerTab.vue` 是超大共享文件；改动集中在 `canLeaveProject` / `defineExpose` 邻域。
- 当前工作区可能叠加 `07-14-designer-history-busy-residual` 对同文件的修改，实现时只触碰本任务范围，不回滚他人 diff。

## Notes

- 出处：`.trellis/tasks/archive/2026-07/07-13-designer-fields-ux-batch/prd.md` → Follow-up。
- 轻量级任务：PRD-only；技术细节见已批准实现计划。
