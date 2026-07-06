# 右侧访视内表单列表对齐左侧 el-table 风格

## Goal

访视界面右侧「访视内表单列表」当前是手写 `vuedraggable` 列表 + `manual-list-header`,与左侧「访视列表」的 `el-table` 视觉不一致。
目标:右侧改造为与左侧同结构的 `el-table`,实现真正的视觉与代码机制一致(同组件、同拖拽 composable、同序号快编),并清理变为孤儿的样式。

## Requirements

* 右侧表单列表改用 `el-table`(`size=small border highlight-current-row row-key=id`),镜像左侧结构。
* 列设计:
  * 拖拽柄(32px,复用 `.drag-handle`)
  * 序号(100px)—— 复用现有右侧序号快编(`editingVisitFormId / editingVisitFormOrdinal / startVisitFormOrdinalEdit / commitVisitFormOrdinalEdit / cancelVisitFormOrdinalEdit`),双击编辑、`controls=false`、回车提交、Esc/blur 取消
  * 表单名称(`prop="name"`,`show-overflow-tooltip`)
  * 操作(`fixed="right"`):预览、移除;移除保留现有 `confirmDelete` 两步确认
* 拖拽排序从 `useOrderableList` + `<draggable>` 切换为 `useSortableTable(visitFormsTableRef, visitForms, visitFormReorderUrl, { reloadFn })`,与左侧同源。
* 右侧表格挂在 `v-if="selectedVisit"` 下且切换访视会重建,需 `watch(selectedVisit / visitForms, () => nextTick(initSortable))` 重新初始化拖拽。
* 清理孤儿样式:`main.css` 中仅 VisitsTab 引用的 `.manual-list-header`、`.visit-form-order-header`、`.visit-form-name-header`、`.visit-form-action-header`(以及本就无组件引用的 `.manual-list-header-group`)在确认无其他引用后删除。
* 若 `<draggable>` 在 VisitsTab 内不再使用,移除其 `import draggable`(vuedraggable 仍被 App.vue 使用,保留依赖)。

## Acceptance Criteria

* [ ] 右侧表单列表渲染为 `el-table`,表头、行边框、悬停高亮、行高与左侧访视列表观感一致。
* [ ] 拖拽排序在初次选中访视、以及切换不同访视后均生效;排序失败走 `排序保存失败,已恢复` 恢复语义。
* [ ] 双击序号可跳序;越界拒绝、失败恢复行为不变。
* [ ] 添加 / 移除表单功能不变,移除保留两步确认。
* [ ] `manual-list-header` 系列样式删除后,全局无残留引用(grep 校验)。
* [ ] 前端测试通过:`node --test tests/*.test.js`,重点 `ordinalQuickEditWiring`、`orderingStructure`、`tableHeaderStyle`。

## Definition of Done

* 测试更新并通过(右侧 visit-form 接线断言由 draggable 改为 el-table + useSortableTable)。
* lint 通过(`npm run lint`)。
* 浏览器验证两侧一致 + 拖拽/序号/增删均可用。
* 同步更新 `frontend/.claude/CLAUDE.md`、根 `.claude/CLAUDE.md` 中涉及右侧列表机制的描述(如「VisitsTab 右侧手写列表」相关措辞)。

## Decision (ADR-lite)

**Context**: 左侧 el-table、右侧手写 draggable,两套机制导致视觉与代码不一致。
**Decision**: 采用方案 A —— 右侧转 el-table,复用 `useSortableTable` + `useOrdinalQuickEdit`,与左侧同源(用户已确认)。
**Consequences**: 一次性消除重复机制并获得真正一致;代价是需处理右侧表格随 `selectedVisit` 重建时的拖拽重初始化。放弃方案 B(纯 CSS 仿制),因其非真正一致且后续易随 el-table 主题漂移。

## Out of Scope

* 右侧不新增勾选列 / 批量删除(保持单行移除,与现有交互一致)。
* 不改动访视-表单矩阵弹窗、表单预览弹窗。
* 不改动后端 reorder 接口与数据契约。
* 不调整左侧访视列表。

## Technical Notes

* 关键文件:`frontend/src/components/VisitsTab.vue`(右侧模板 610–654、脚本 483–514)、`frontend/src/styles/main.css`(166、381–413)、`frontend/src/composables/useSortableTable.js`、`useOrdinalQuickEdit.js`、`useOrderableList.js`。
* 左侧参考接线:`VisitsTab.vue` 95–126(`useSortableTable` + `useOrdinalQuickEdit` 配置)、模板 550–593。
* `useSortableTable` 通过 `tableRef.$el.querySelector('.el-table__body-wrapper tbody')` 挂载,`handle: '.drag-handle'`,失败时 `ElMessage.warning('排序保存失败,已恢复')` 并 `reloadFn` 恢复。
* 右侧 `reloadFn` 复用现有:重拉 `visit-form-matrix` + `syncVisitForms()`。
* 测试参考:`frontend/tests/ordinalQuickEditWiring.test.js`、`orderingStructure.test.js`、`tableHeaderStyle.test.js`。
* 浏览器验证入口:http://0.0.0.0:8888,DECADE 测试账号。
