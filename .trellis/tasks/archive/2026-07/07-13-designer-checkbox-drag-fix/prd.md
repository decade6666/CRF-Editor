# 复选字段拖拽排序 🚫 与卡顿修复（G1 / 需求 1）

> 父任务：`07-13-designer-fields-ux-batch`

## Goal

修复表单设计器左侧字段列表中"复选"类型字段拖拽排序时出现 🚫（no-drop）光标，以及排序完成后偶发的卡顿（新顺序延迟显示）两个体验缺陷。

## Background and confirmed facts

- 字段列表使用原生 HTML5 拖放：行 `:draggable="true"`（`FormDesignerTab.vue:3611-3630`），`onDragStart` 记录 `dragSrcId`，`onDragOver` 调 `e.preventDefault()`，`onDrop` 执行重排（`860-903`）。
- 行内含交互控件：行选择 `<el-checkbox>`（所有非草稿行都有）、`⊞` 横向标记、`复制`、`删除` 按钮。
- `onDrop`（`874-903`）流程：乐观更新 `formFields.value = normalized` → `await api.post(.../reorder)` → `api.invalidateCache` → `await loadFormFields()` 二次拉取覆盖渲染 → `recordReorderHistory`。二次网络拉取 + 覆盖渲染是"排序后卡顿一会才显示"的来源。
- 🚫 根因假设（需实现时以浏览器 DevTools 复现确认）：拖拽起点或经过命中了行内嵌套的原生可拖拽/可交互控件（`el-checkbox` 的 input、按钮），浏览器对这些子元素的默认拖拽行为与行级拖拽冲突，或 dragover 未在该子元素路径上 `preventDefault` 导致 `dropEffect=none` 呈现 🚫。为何用户在"复选类型"上更易观察到，需复现确认（可能与该类型行渲染结构 / 命中区域有关，也可能并非类型独有）。

## Requirements

- R1（🚫 消除）：拖拽复选类型（及其他类型）字段行进行排序时，鼠标不出现 🚫 no-drop 光标，整行范围均为有效放置目标。
- R2（卡顿消除）：排序完成后立即稳定显示拖拽后的顺序，无可感知的"闪回/延迟再刷新"。正常成功路径不做二次全量拉取覆盖；仅在保存失败时回滚本地顺序并重新拉取。
- R3（语义不变）：排序仍持久化到 `POST /api/forms/{id}/fields/reorder`，草稿存在时仍禁止排序（`hasDraft` 守卫保留），键盘排序路径（`handleFieldKeydown` 的 `move`）保持与拖拽一致的行为与失败恢复文案 `排序保存失败，已恢复`。
- R4（历史兼容）：`recordReorderHistory` 仍记录 previousOrder/nextOrder；不得破坏 `07-13-designer-history-busy-coordination` 约定的 busy 门控与 session 校验（撤销/重做回放期间不写栈、过期表单不入栈）。

## Acceptance Criteria

- [ ] AC1：复现步骤下拖拽复选类型字段排序，全程无 🚫 光标；拖拽经过按钮/选择框区域仍可正常放置。
- [ ] AC2：排序成功后新顺序即时显示，无二次覆盖渲染导致的卡顿；网络成功路径不再 `await loadFormFields()` 全量重载（或以更轻方式对齐 order_index）。
- [ ] AC3：保存失败时本地顺序回滚并提示 `排序保存失败，已恢复`。
- [ ] AC4：草稿存在时排序被拦截提示不变；键盘排序行为与拖拽一致。
- [ ] AC5：`node --test tests/*.test.js`（含 `orderingStructure.test.js`、`designerHistory.test.js`）、`npm run lint`、`npm run build` 通过；补充复现该拖拽行为的源码级/结构级回归。
- [ ] AC6：如可用浏览器验证，完成一次拖拽 smoke（🚫 消失 + 无卡顿）；否则说明未跑范围。

## Out of scope

- 将原生 DnD 整体替换为 `useSortableTable` / `vuedraggable`（除非实现时确认这是消除 🚫 的最小必要手段，需在 design 说明）。
- 排序以外的字段实例编辑、复制、删除路径。

## Planning status

轻~中量任务。🚫 精确根因需在实现期用浏览器复现确认；卡顿根因已定位（成功路径二次重载）。若最终选择替换拖拽机制，则补 `design.md`。
