# 导入模板预览与设计器预览渲染不一致

## Goal

让「导入模板 - 预览导入效果」对话框（`TemplatePreviewDialog.vue`）左侧的 CRF 预览，与表单设计器实时预览 / Word 预览（`FormDesignerTab.vue` 的 `.word-page` 渲染）在排版上保持一致，消除多列 inline 表格在导入预览里被挤压、文字逐字竖排换行的问题。

## What I already know

- 两张图对比：
  - Image #3（正确）：表单设计器 / Word 预览，生命体征表上半部 normal 双列、下半部多列 inline 表（计划时点/项目/结果/单位/临床意义/未查/异常有临床意义请解释），列宽合理、内容单行不挤压。
  - Image #4（异常）：`TemplatePreviewDialog` 左侧「CRF 预览」，临床意义、异常有临床意义等列被压到极窄，选项「○正常 ○异常无临床意义 ○异常有临床意义」几乎逐字竖排，整体排版破碎。
- **数据/分组/列宽规划路径两者一致**：都走 `buildFormDesignerRenderGroups` + `formDesignerPreviewModel.buildPreviewGroupViewModels` + `useCRFRenderer` 的 `planInlineColumnFractions` / `planNormalColumnFractions` / `planUnifiedColumnFractions`。fractions（相对比例）相同，所以差异不在数据层，而在**渲染容器与 CSS**。
- 差异定位（两处叠加，导致 Image #4 被挤压）：
  1. **容器宽度差异（主因）**：
     - 设计器预览渲染在 `.designer-scaled-word-page { width: 21cm; ... }`（约 793px，A4 固定宽度，viewport `overflow: auto` 可横向滚动），`.word-page padding: 32px 40px`，内容区约 700px+。
     - `TemplatePreviewDialog` 渲染在 `.preview-left`（`flex:1`）内，对话框总宽仅 `width: 960px`，右侧选择面板固定 `width: 320px` + gap 16px + 内边距，左侧 CRF 预览实际可用宽度仅约 560–580px，且 `.preview-left-scroll` 只有 `overflow-y: auto`（无横向滚动）。相同 fractions × 更窄容器 → 每列绝对宽度更小 → 多列 inline 表强制换行。
  2. **CSS 契约分叉**：
     - 设计器复用全局 `.word-page` 契约：`font-size: 10.5pt`、`.word-page .inline-table / .unified-table { table-layout: auto }`（内容可撑开列宽）、`.choice-group` / `.choice-atom` / `.fill-line` 的 flex 自适应样式、`td padding: 5.25pt 6px`。
     - `TemplatePreviewDialog` 用自己的 scoped 样式 `.designer-preview-wrap`：继承对话框默认 ~14px 字号、`.designer-preview-wrap table { table-layout: fixed }`（**对所有表强制 fixed，包括 inline/unified**，colgroup 百分比被严格执行，内容只能在窄列内换行）、`td padding: 6px 10px`，且**不享有** `.word-page` 的 choice-group / fill-line 视觉自适应规则。
- 因此 Image #4 挤压的根因 = 窄容器 + 全表 `table-layout: fixed` + 较大字号 + 未复用 `.word-page` 视觉契约。
- 模板 markup 在 `FormDesignerTab.vue` 与 `TemplatePreviewDialog.vue` 之间是**重复实现**（unified/normal/inline 三种结构各写一遍）；`SimulatedCRFForm.vue` 是更简单的 2 列 normal 渲染，不适配多列 inline，无法直接复用为该对话框预览。

## Requirements

- 导入模板预览左侧 CRF 预览采用与设计器 `.word-page` 一致的视觉契约：相同字号（10.5pt）、inline/unified 表使用 `table-layout: auto`、复用 choice-group / fill-line / cell padding 等全局规则。
- 给左侧预览足够横向空间：要么加宽对话框，要么让左侧预览以 A4 宽度渲染并允许横向滚动（对齐设计器 viewport 的 `overflow: auto`），避免多列 inline 表被强制压缩换行。
- 不改变数据层与列宽规划（`buildFormDesignerRenderGroups` / planner / `formDesignerPreviewModel`）；不破坏右侧勾选联动、`filteredFields` 实时反映勾选、导入执行逻辑。
- 不影响严格 preview/export parity（fill-line 真实下划线根数仍由 `computeFillLineCharCount` 决定，CSS 自适应只改视觉不改 JSON/根数）。

## Acceptance Criteria

- [ ] 同一模板（如生命体征），导入预览左侧排版与设计器预览/Word 预览在列宽分布、是否换行、选项展示上视觉一致（多列 inline 表不再逐字竖排）。
- [ ] 多列 inline 表（≥5 列）在导入预览中列宽随内容合理分配，长列（临床意义 / 异常有临床意义请解释）不被压成极窄列。
- [ ] normal 双列、unified、inline 三种分组在导入预览中均与设计器一致。
- [ ] 右侧勾选/全选/取消、实时联动、导入选中项功能保持不变。
- [ ] 字号、单元格内边距、选项 marker/fill-line 间距与 `.word-page` 一致。
- [ ] 既有前端测试全部通过；若新增/调整视觉契约，补充对应 source-level 断言。

## Definition of Done

- 前端 `node --test tests/*.test.js` 全绿；`npm run lint` 无新增错误。
- 视觉对照（生命体征模板）导入预览 ≈ 设计器预览；浏览器实测入口 http://0.0.0.0:8888（DECADE 账号）。若浏览器实测被模板库 schema 不兼容阻塞，需如实标注未实测范围。
- 不引入与 `width_planning.py` 的跨栈契约偏离；planner fixtures 无需变更（仅渲染层调整）。

## Technical Approach

推荐 **Approach A：导入预览复用 `.word-page` 视觉契约 + 给足横向宽度**。

关键改动点（待 GPT 执行）：
1. `TemplatePreviewDialog.vue` 左侧预览容器 markup 套用与设计器一致的类链（`word-page form-designer-word-page designer-scaled-word-page`，或至少 `word-page`），让全局 main.css 的 `.word-page` 规则生效（10.5pt 字号、inline/unified `table-layout: auto`、choice-group/fill-line/cell padding）。
2. 移除/收敛组件内 scoped `.designer-preview-wrap table { table-layout: fixed }` 等会与 `.word-page` 冲突的本地规则，避免覆盖全局 auto 布局；保留必要的预览容器布局样式。
3. 解决横向空间：
   - 方案 A1：左侧预览以 A4 宽度（`designer-scaled-word-page`，`width: 21cm; max-width: 100%`）渲染，并让 `.preview-left-scroll` 支持横向滚动（`overflow: auto`），对齐设计器 viewport。
   - 方案 A2：加宽对话框（如 `width` 由 960px 提升至 ~1200px 或百分比），缩小窄容器对列宽的挤压。
   - 建议 A1+A2 结合：加宽对话框并允许横向滚动，inline 多列表用 auto 布局自然撑开。
4. 保持右侧 320px 勾选面板与联动逻辑不变。

可选 **Approach C（更优长期方案，建议本次不做）**：抽取共享预览子组件 `<CrfWordPreview>`，由 `FormDesignerTab.vue` 与 `TemplatePreviewDialog.vue` 共用，彻底消除模板 markup 重复（unified/normal/inline 各写两遍）。本次范围内仅做样式对齐，避免大重构。

**Approach B（最小改动兜底）**：不整体套用 `.word-page`，仅在对话框 scoped CSS 把 inline/unified 表改为 `table-layout: auto`、字号调到 10.5pt、并加宽对话框 + 允许横向滚动。改动面小但与设计器一致性弱于 A。

## Decision (ADR-lite)

- **Context**: 导入预览与设计器预览数据同源但渲染层分叉，导致多列 inline 表在窄对话框内被强制 fixed 布局挤压换行。
- **Decision**: 采用 Approach A（复用 `.word-page` 契约）+ **宽度策略选定「加宽对话框」（A2）**：把对话框宽度从 960px 提升（~1200px 或百分比），inline/unified 表用 `table-layout: auto` 在更宽容器内自然撑开，不强制走 A4 固定宽度 + 横向滚动。不做共享组件重构（Approach C 记为后续）。
- **Consequences**: 渲染层与设计器收敛、减少视觉漂移，且不引入横向滚动条；模板 markup 仍重复（技术债保留，后续可按 Approach C 收口）。窄屏下若 ~1200px 超出视口，依赖 el-dialog 自身的 `max-width`/响应式兜底。

## Out of Scope

- 不抽取共享预览组件（Approach C 留待后续任务）。
- 不改后端导出 / width_planning / planner fixtures。
- 不改右侧勾选交互、导入执行接口、字段数据结构。
- 不改 `SimulatedCRFForm.vue`（其为 2 列简版，非本对话框预览来源）。

## Technical Notes

- 关键文件：
  - `frontend/src/components/TemplatePreviewDialog.vue`（待改：左侧预览 markup + scoped 样式 + 对话框宽度）
  - `frontend/src/components/FormDesignerTab.vue`（参照：`.word-page` / `designer-scaled-word-page` 渲染与类名，line ~2496/2911 起）
  - `frontend/src/styles/main.css`（全局 `.word-page` 契约，line ~185-260）
  - `frontend/src/composables/useCRFRenderer.js`、`formDesignerPreviewModel.js`、`formFieldPresentation.js`（数据/规划层，**不改**）
- 约束：`.wp-form-title` 必须保持 `text-align: left`（被 `wordPageGeometry.test.js` 锁定）；fill-line 真实根数由 `computeFillLineCharCount` 决定，CSS 自适应不得改变导出 JSON/根数（strict parity）。
- 相关测试：`wordPageGeometry.test.js`、`columnWidthPlanning.test.js`、`formDesignerPreviewModel.test.js`。
- 浏览器实测可能被「模板库 .db schema 与当前版本不兼容」阻塞（历史 session 已记录），需在验收报告区分实测/未实测。
</content>
</invoke>
