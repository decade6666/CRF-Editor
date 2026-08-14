# 全局搜索与五类列表交互统一

## Goal

让所有用户可见的模糊搜索、中文内置文案、列表按钮和表格复选框表现一致：升级共享搜索算法；全局启用 Element Plus 中文 locale；五类维护页面的新增/批量删除/操作列图标化；Element Plus 表格选择列统一水平居中。纯前端改动，后端零变更。

## Requirements

1. **搜索算法升级**（`frontend/src/composables/searchRanking.js`，签名 `rankFuzzyMatches(items, keyword, getCandidates)` 不变）：
   - 空关键词返回原序；候选文本可多个（保留单位 code+symbol、选项 code+decode 拼接兼容）。
   - 层级：完全相等 > 连续包含 > 有序子序列 > 受限编辑距离（近似子串）。
   - 编辑距离：1–2 字符不启用；3–5 字符最多 1 次增删改；6+ 字符最多 2 次且最佳近似片段相似度 ≥ 0.7。
   - 同层按质量排序，完全同分保持源顺序稳定；不截断结果、不加入拼音、不新增依赖。
2. **Element Plus 全局中文化**：`frontend/src/main.js` 注册官方 `zh-cn` locale；MessageBox 用官方「确定/取消」，空表/无匹配/日期等内置文案同步中文化；不额外覆写「确认」。
3. **五类页面图标化**（`CodelistsTab.vue` 字典+选项、`UnitsTab.vue`、`FieldsTab.vue`、`FormDesignerTab.vue` 仅外层表单列表、`VisitsTab.vue` 访视+关联表单）：
   - 工具栏新增 `Plus`（primary 小号方形）、批量删除 `Delete`（danger 小号方形），常显、无选择禁用、不显示数量。
   - 操作列：复制 `DocumentCopy`、编辑 `EditPen`、删除 `Delete`、预览 `View`、移除 `CircleClose`；紧凑 link；删除/移除 danger；列宽按图标数量明确缩窄、保留 fixed-right。
   - 所有图标按钮 `el-tooltip`（具体对象文案）+ `aria-label`，不加原生 `title`；保留 data-test 与现有业务函数/导航。
   - 「批量编辑」「设计表单」等复杂业务动作保留文本按钮；不扩展到管理员旧列表/侧栏/导入弹窗。
4. **selection 复选框居中**：`frontend/src/styles/main.css` 全局规则（header + body 的 `.el-table-column--selection .cell` justify-content: center、左右 padding 0），管理员项目弹窗同步受益；设计器手写复选框不改。

## Acceptance Criteria

- [ ] `searchRanking.test.js` 覆盖四层级、长度边界（1–2/3–5/6+）、相似度下限、多候选、稳定排序、空词原序；`searchRankingWiring.test.js` 既有接线不回退。
- [ ] `tableHeaderStyle.test.js` 锁定全局 selection 居中规则。
- [ ] 五类页面全部按钮图标化断言（icon 类名、tooltip、aria-label、disabled、无数量文本）通过。
- [ ] main.js locale 接线断言通过；浏览器验证 MessageBox 显示「确定/取消」。
- [ ] 前端全量 `node --test tests/*.test.js` 通过；`npm run lint` 0 errors；`npm run build` OK。
- [ ] 后端全量 `python3 -m pytest` 通过（零改动验证）。
- [ ] 浏览器实机（亮/暗主题）：目标页面图标/tooltip/键盘焦点/disabled/居中/中文文案。

## Notes

- `FormDesignerTab.vue` 仅触碰外层表单列表按钮模板（约 30 行），为子任务 2 铺路。
- 不运行 `npm run format`；`frontend/dist` 不提交。
- 详细设计见实现计划 `implement.md`。
