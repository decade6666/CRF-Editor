# Proposal: UI 序号只读化、访视预览下线、简要模式解锁、Word 导出增强、预览列宽可调

## Enhanced Requirement

本次变更是一组面向用户体验的局部打磨，不涉及架构调整或接口契约破坏。共 5 项需求：

1. **R1 — UI 序号只读化**：所有列表中的 `order_index` / `sequence` 序号改为仅显示数值，移除 `el-input-number`（加减按钮 + 内联编辑），保留拖拽排序作为唯一排序入口。
2. **R2 — 访视预览按钮下线**：删除 `VisitsTab.vue` 右侧"访视内表单列表"右上角的"预览"按钮及其 `showVisitPreview` 弹窗与相关状态。
3. **R3 — 简要模式解锁表单界面**：`FormDesignerTab.vue` 中简要模式（`editMode=false`）下，表单列表、字段实例列表、属性编辑、设计备注的操作与完全模式保持一致（可拖动排序、可编辑属性）。App.vue 层的"选项 / 单位 / 字段"一级 Tab 可见性差异维持原样，不在本次变更范围内。
4. **R4 — Word 导出增强**：
   - 4.1 `表单访视分布图` 表格首行设为标题行并启用"标题行跨页重复"（Word `tblHeader` 属性）。
   - 4.2 每个表单内容的末尾追加一行"适用访视：<visit_name_1>、<visit_name_2>、…"，visit 名称直接取自 `Visit.name`（窗口信息已嵌入 name 中，如"筛选期(D-28~D-1)"），多访视使用中文顿号"、"分隔。
5. **R5 — 表单预览列宽可调 + 吸附**：`FormDesignerTab.vue` 右侧"实时预览"区的表格支持鼠标拖动列分隔线调整列宽；仅允许调整列宽，不允许调整行高；提供吸附对齐锚点（常用比例 + 同表格其他列边界）。

### 目标
- UX：降低用户误触风险（序号手动编辑曾引发排序错位）。
- UX：去除不稳定的预览入口，统一由表单设计器承载预览职责。
- UX：让只查看/轻量修改的用户（简要模式）也能完成拖拽和属性微调。
- Word：导出文档在跨页长表中保留访视列语境，并显式标注每张表单的适用访视。
- 设计器：预览更贴近实际 Word 宽度比例，便于调整字段标签/控件列布局。

### 技术约束
- 不新增后端 API、不改数据库 schema、不改 `Visit` 字段；`Visit.window_start/window_end` 不存在，适用访视仅输出 `visit.name`。
- 不改变 `useCRFRenderer.js` 字段渲染契约；列宽仅调整外层 `<colgroup>` / `<col>` 或表格 CSS 宽度变量，不影响字段语义。
- 列宽调整持久化范围（会话级 / 表单级 / 用户级）属于开放问题，默认采用"表单级 + localStorage"的最小实现。
- 简要模式解锁后，App.vue 中 `v-if="editMode"` 控制的 Tab 可见性与快捷按钮不纳入本次变更。
- 所有前端改动需符合 Element Plus 组件语义和 vue-draggable 既有模式。

### 范围边界
**纳入范围**
- `VisitsTab.vue`、`FormDesignerTab.vue`、`FieldsTab.vue`、`UnitsTab.vue`、`CodelistsTab.vue` 的序号显示层改造
- `VisitsTab.vue` 预览按钮、弹窗、`showVisitPreview` 状态与其依赖的 computed / watcher
- `FormDesignerTab.vue` 简要模式守卫（`if (!editMode.value) return` 与 `v-if="editMode"`）在表单设计器内的解除
- `backend/src/services/export_service.py` 的 `_add_visit_flow_diagram` 与 `_add_forms_content`
- `FormDesignerTab.vue` 右侧"实时预览"面板的表格列宽拖拽 + 吸附

**不纳入范围**
- App.vue 一级 Tab（选项/单位/字段）在简要模式下的可见性策略
- 新建/编辑访视对话框中的 `sequence` 输入（表单填写字段，非列表序号）
- 行高调整、拖动重排列顺序、列隐藏
- 导出 PDF 或其他格式

### 验收标准
- R1：5 个目标组件中所有列表序号 cell 改为纯文本数值；相关 `update*Order` 函数被拖拽 handler 唯一驱动，旧手动修改入口在 UI 上不可达。
- R2：`VisitsTab.vue` 中搜索不到 "预览" 按钮相关代码，`showVisitPreview` 状态及其弹窗被完全移除；访视关联表单列表仅保留添加/删除操作。
- R3：简要模式下打开"表单设计器"，可以：新建/删除/批量操作表单、拖拽重排表单、打开字段库、拖入字段、编辑字段属性、编辑设计备注；所有"简要模式下仅支持预览"的空态提示不再显示。
- R4.1：打开导出 Word，分布图跨页时标题行在每页重复出现。
- R4.2：每张表单末尾出现"适用访视：…"段落，多访视以中文顿号「、」分隔，无访视时段落省略。
- R5：预览表格列分隔线可用鼠标拖动；拖动时有视觉反馈；松开鼠标后列宽持久化到 localStorage；靠近 25% / 33% / 50% 及其他列边界时吸附（±4px）；行高保持不变。

## Research Summary for Planning

### User Confirmations
- 序号显示改造的范围覆盖"所有界面"，默认解释为项目主工作区的 5 个列表组件；新建/编辑对话框中的 `sequence` 输入不在范围内。
- 简要模式解锁目标为 `FormDesignerTab.vue`；App.vue Tab 可见性策略维持原状。
- 适用访视文本来源为 `Visit.name`，例如 "筛选期(D-28~D-1)"。

### Existing Structures
- 序号输入组件：
  - `frontend/src/components/UnitsTab.vue:127`
  - `frontend/src/components/CodelistsTab.vue:266`（字典主列表 order_index）
  - `frontend/src/components/CodelistsTab.vue:322`（字典选项 element.order_index）
  - `frontend/src/components/VisitsTab.vue:376`（访视列表 sequence）
  - `frontend/src/components/VisitsTab.vue:420`（访视内表单 sequence）
  - `frontend/src/components/FormDesignerTab.vue:1162`（表单列表 order_index）
  - `frontend/src/components/FormDesignerTab.vue:1237`（表单字段实例 order_index）
  - `frontend/src/components/FieldsTab.vue:203`（字段定义 order_index）
- 访视预览入口：
  - 按钮：`VisitsTab.vue:396` `<el-button … @click="showVisitPreview = true">预览</el-button>`
  - 状态：`VisitsTab.vue:31` `const showVisitPreview = ref(false)`
  - 弹窗：`VisitsTab.vue:435-446` `<el-dialog v-model="showVisitPreview" …>`
- 简要模式守卫（FormDesignerTab.vue）：
  - JS 守卫：`if (!editMode.value) return` 出现于行 108/119/140/160/166/183/189/212/219/236/251/275/297/621/634/657/966/977
  - 模板守卫：`v-if="editMode"` 在工具栏按钮、表格列、字段列表按钮；`:disabled="!editMode"`、`:draggable="editMode"`
  - 空态提示：`FormDesignerTab.vue:1280, 1372`
- Word 导出：
  - 分布图：`backend/src/services/export_service.py:735-862`（`_add_visit_flow_diagram`）
  - 表单内容：`backend/src/services/export_service.py:865+`（`_add_forms_content`）
  - 行 0 为标题行但未设置 `w:tblHeader`，因此跨页时标题不重复
- 预览表格结构：
  - 两列预览：`SimulatedCRFForm.vue` 固定 `.crf-label-cell { width: 30% }`
  - 复杂预览：`FormDesignerTab.vue:1254-1264`，包含 `unified-table`、`normal`、`inline-table` 三种模板
- 拖拽排序：所有列表已使用 `vue-draggable`，重排后通过 `POST /api/.../reorder` 同步（详见 `useOrderableList.js`）
- 数据模型：
  - `backend/src/models/visit.py`：Visit 只有 `id/name/code/sequence`，无 window 字段
  - 访视"窗口"信息按现网惯例嵌入 `Visit.name`

### Hard Constraints
- 禁止修改数据库 schema 和后端路由契约（本变更纯前端 + 一处导出逻辑）。
- 禁止改变 `useCRFRenderer.js` 或 `formFieldPresentation.js` 的渲染契约；列宽只能通过容器层 `<col>` 或 CSS 变量控制。
- 拖拽排序是所有序号的唯一写入入口；`useOrderableList.handleDragEnd` 已通过 `POST /reorder` 同步，不得绕过。
- 简要模式解锁不应破坏现有数据一致性：拖拽失败要能回滚（`useOrderableList` 已支持快照 + 错误回调）。
- Word 导出的 `w:tblHeader` 必须通过 `python-docx` 的 OxmlElement 注入到 `trPr`，现有表格已复用 `_apply_grid_table_style`，新改动不得覆盖既有样式。
- 适用访视文本中 visit 顺序应与 `sorted(project.visits, key=sequence)` 一致（与分布图保持同序）。
- 列宽吸附阈值需足够大以便操作但又不干扰精细调整：建议 ±4px；锚点由"常用比例（25/33/50%）+ 表格内其他列边界"组成。
- localStorage 键需带 form_id 前缀以防跨表单污染；清理策略：值无效或超出 [0.1, 0.9] 归一化区间时丢弃。

### Soft Constraints
- 优先复用 `useOrderableList.js` 与 `useSortableTable.js`，不新增排序 composable。
- 拖动列分隔线的交互遵循"鼠标按下 → 视觉反馈（cursor: col-resize + 吸附辅助线）→ 松开持久化"的常见模式。
- "适用访视" 段落字体和缩进遵循现有 `_set_run_font` 约定，段落样式可沿用 `VisitFlow` 或新建轻量样式。
- 文案："适用访视：<name>[, <name>…]"；多访视分隔符建议中文全角顿号"、"以贴合图片示例；可作为轻量 tie-break 用英文逗号。
- 简要模式解锁后，所有"简要模式下仅支持预览，开启完整模式后可编辑..."空态提示文案需要整体清理或弱化。

### Dependencies
- R1 依赖 R3：两者共同影响 `FormDesignerTab.vue` 的 `order_index` 列与 `editMode` 守卫；建议一次性改动避免冲突。
- R5 依赖 R3：简要模式解锁后，预览的列宽调整应在简要/完全两种模式下都可用（列宽是展示属性，非编辑行为）。
- R4.2 依赖现有 `visit_form_map` 构建逻辑，可在 `_add_forms_content` 中复用或重新计算 form→visits 反向索引。
- R2 独立，不依赖其他需求。

### Risks
- **R3 守卫清除不完全**：遗漏 18 处 `if (!editMode.value) return` 中任何一处，都会导致简要模式与完全模式行为不一致。建议通过一次性 Grep 清点并逐一处理。
- **R5 吸附抖动**：吸附阈值太大会在多锚点情况下出现"磁吸跳跃"；太小则用户感知不到吸附。需要在真实预览表格上做人工微调。
- **R5 复杂预览结构**：`designerRenderGroups` 有 `unified`、`normal`、`inline` 三种表格类型；列宽调整只在"可控列数"的 `normal` / `inline` 上生效，`unified-table` 内部使用 colspan 动态布局，需在设计阶段决定是否覆盖。
- **R4.1 兼容性**：`tblHeader` 在 Word / WPS / LibreOffice 表现略有差异，但属于标准 OOXML 属性，风险低。
- **R2 耦合检查**：删除弹窗后需确认 `previewRenderGroups` / `previewNeedsLandscape` 等 computed 是否仅服务该弹窗，如被其他地方依赖需保留。

### Success Criteria
- UX 行为可手动验证（通过清单对照 5 个 R 的验收标准）。
- Word 导出文档可开在 MS Word 与 WPS 验证标题行重复与"适用访视"文本位置。
- 前端回归测试（`frontend/tests/`）全部通过，且 `backend/tests/test_export_service.py` 新增"适用访视"断言与"tblHeader"断言（由 /ccg:spec-plan 阶段细化）。

### Open Questions — Resolved in /ccg:spec-plan
1. 序号只读化后是否需要"拖拽排序"提示？→ **不加**（保持现有 UI，拖拽把手已存在）。
2. 列宽持久化采用 localStorage 还是写入后端 `Form`？→ **localStorage**（键 `crf:designer:col-widths:<form_id>:<table_kind>`）。
3. R5 是否覆盖 `unified-table` 的动态列？→ **不覆盖**（仅 `normal` / `inline-table`；spec 已明确）。
4. "适用访视"分隔符用英文逗号还是中文顿号？→ **中文顿号「、」**（与 spec 一致，proposal 已同步）。
5. 简要模式解锁后是否需要 UI 提示当前是简要模式？→ **不加**（行为一致即可）。
6. CodelistsTab 的"字典选项"嵌套列表序号是否一并改只读？→ **一并改只读**（与 R1 精神一致，所有拖拽列表序号均为只读）。
7. "适用访视"排序 tie-break？→ **按 (Visit.sequence, Visit.id) ASC**（确保与分布图表头同序；对脏数据稳定）。
8. 多表单体（legacy 路径含 normal + inline 两张表）下 footer 插入位置？→ **最后一张主体表之后、分页符之前**。
9. 空 visit.name 是否过滤？→ **verbatim 保留**（与 spec 一致；未来如需过滤单独提 change）。
