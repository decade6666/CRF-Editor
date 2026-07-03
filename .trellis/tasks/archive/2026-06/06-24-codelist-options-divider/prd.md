# 选项字典选项列表增加分割线

## Goal

在 CodelistsTab 右侧选项列表区域添加纵向分割线，使其与左侧字典列表（el-table border）的表格风格保持一致，提升列分隔的可读性。

## Requirements

- 右侧选项列表整体改为与左侧字典列表一致的 Element Plus `el-table border` 显示结构
- 表头和内容行不再拆成手写 header + draggable div，而是作为一整张表渲染
- 保留选项搜索、批量选择、编辑、删除、后加下划线展示
- 保留选项拖拽排序能力，搜索过滤状态下隐藏拖拽列并禁用拖拽
- editMode 显示/隐藏 OID 列时列顺序正确：序号 → OID → 标签

## Acceptance Criteria

- [x] 右侧选项列表使用 `el-table border`
- [x] 表头与内容在同一张表中渲染，视觉效果与左侧字典列表一致
- [x] 拖拽排序改为通过 `useSortableTable` 接入选项表格
- [x] 搜索状态下隐藏拖拽列并禁用拖拽
- [x] editMode 显示/隐藏 OID 列时列顺序正确
- [x] 测试通过

## Definition of Done

- [x] Relevant tests pass (331/331)
- [x] Full frontend tests pass
- [x] Lint run with no errors (0 errors, pre-existing warnings only)
- [x] Committed and pushed to draft branch

## Technical Approach

1. 用 `el-table border` 替换右侧旧的 `manual-list-header + draggable` 结构。
2. 移除 `vuedraggable` / `useOrderableList` 的选项列表使用，复用现有 `useSortableTable`：
   - `optionsTableRef` 定位右侧表格 tbody
   - `optionSourceList` 指向当前选中字典的 `options`
   - `visibleOptions` 作为过滤后的 `renderList`
   - `isOptionsFiltered` 控制拖拽禁用和拖拽列隐藏
3. 删除只服务于旧手写选项表头的 CSS class。
4. 更新源代码级测试，断言右侧选项列表已改为 Element Plus border table。

## Out of Scope

- 不改变现有列宽度
- 不改变左侧字典列表样式

## Technical Notes

- 修改文件：`frontend/src/components/CodelistsTab.vue`, `frontend/src/styles/main.css`, `frontend/tests/searchRankingWiring.test.js`, `frontend/tests/orderingStructure.test.js`, `frontend/tests/tableHeaderStyle.test.js`, `frontend/tests/editModeHiddenIdentifiers.test.js`
- 测试更新：所有相关测试已更新为断言 el-table border 结构

## Status

**COMPLETE** — Commit 125156e pushed to draft branch