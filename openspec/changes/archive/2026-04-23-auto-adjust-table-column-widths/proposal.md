# Proposal: 预览/设计器表格列宽内容驱动自动适配

## Enhanced Requirement

将 `FormDesignerTab.vue` 实时预览、`TemplatePreviewDialog.vue` 模板预览、`SimulatedCRFForm.vue` 运行态预览中三类表格（`normal` / `inline` / `unified`）的**初始**列宽从"固定比例默认值"切换为"内容驱动自动适配"，复用已有但未被消费的 `useCRFRenderer.js` 宽度规划工具（与后端 `backend/src/services/width_planning.py` 共享同一语义契约）。用户拖拽覆盖仍可优先。

### 目标
- **一致性**：预览列宽 ≈ Word 导出列宽（两端共用权重权 + 归一化 + 等比缩放回退算法），减少"预览好看导出挤压"或反之的视觉落差。
- **可用性**：新建/新字段集/结构显著变化的表单打开时，不再出现 0.3/0.7 固定比例不合理（例如标签很长、控件很短）或 inline 均分后选项挤在一起的问题。
- **非破坏**：已有用户在 localStorage 中保存的手动拖拽结果继续生效；仅当无有效保存值或列结构发生变化时，才回退到内容驱动初始值。
- **代码复用**：消灭 `FormDesignerTab.vue` / `TemplatePreviewDialog.vue` 中已 import 但未使用的 `planInlineColumnFractions` 死代码，把算法作为唯一真相源。

### 技术约束
- 不新增后端 API、不改数据库 schema、不修改 Word 导出链路（后端 `width_planning.py` 已是生产路径，仅前端消费）。
- 不改变 `useCRFRenderer.js` 的字段渲染契约；`renderCtrl` / `renderCtrlHtml` / `normalizeChoiceOptions` 等保持原样。
- `useColumnResize.js` 对外返回值结构（`colRatios` / `onResizeStart` / `snapGuideX` / `resetToEven`）保持兼容，调用点无需大改（但 `resetToEven` 语义升级为"重置为内容驱动默认值"）。
- 内容权重计算沿用共享常量：`WEIGHT_CHINESE=2`、`WEIGHT_ASCII=1`、`FILL_LINE_WEIGHT=6`；算法的等比缩放回退语义与后端 `plan_width` 一致。
- localStorage 键格式维持 `crf:designer:col-widths:<form_id>:<table_kind>`，读写协议不变。

### 范围边界
**纳入范围**
- `backend/src/services/width_planning.py`：新增 `build_normal_table_demands(fields)` 与 `plan_normal_table_width(fields, available_cm)`；保持与 inline/unified 一致的权重常量、`max(weight, 4)` 最小保护、等比缩放回退语义。
- `backend/src/services/export_service.py`：将 normal 表导出从固定 `7.2cm/7.4cm` 切换为 `plan_normal_table_width` 内容驱动结果；保留对 `available_cm` 的页面预算限制。
- `frontend/src/composables/useColumnResize.js`：接受"初始比例供应器"（函数 / ref / computed / 数组）而非裸 `initialRatios` 数组，使每次 rehydrate / reset 都能重新计算内容驱动默认值；对外函数签名保持向后兼容。
- `frontend/src/composables/useCRFRenderer.js`：
  - 修正 `computeCharWeight` 改用 `codePointAt(0)` 与 Python `ord()` 对齐，支持扩展 B 以上 CJK 字符；
  - 新增 `buildNormalColumnDemands(fields)` / `planNormalColumnFractions(fields)`（复用 `buildInlineColumnDemands` 语义，两列按 `max` 聚合并加 `max(weight, 4)` 保护）；
  - 新增 `planUnifiedColumnFractions(segments, columnCount)`（per-slot-max 聚合，与后端 `plan_unified_table_width` 对等）。
- `frontend/src/components/FormDesignerTab.vue` 的 `getResizer(kind, colCount, groupIndex)`：根据 `kind` 分派默认比例 factory（`normal` → `planNormalColumnFractions`；`inline` → `planInlineColumnFractions`；`unified` → `planUnifiedColumnFractions`），并将 `formId` / `tableKind` 改为 ref/computed 传入使 rehydrate watcher 实际生效；`unified` 表在 `<colgroup>` 上启用 `useColumnResize`（物理列级别拖拽）。
- `frontend/src/components/TemplatePreviewDialog.vue`：消费纯 planner（`planInlineColumnFractions` 已 import，同步接入 `planNormalColumnFractions` / `planUnifiedColumnFractions`）；对已有 `formId` 时，只读查询 `crf:designer:col-widths:<form_id>:<table_kind>` 共享保存值，否则使用内容驱动初始值；无拖拽入口。
- `frontend/src/components/SimulatedCRFForm.vue`：移除 `.crf-label-cell { width: 30% }` 与 `.crf-control-cell` 相关的固定宽度；改为 `<colgroup>` + 内容驱动比例；对有 formId 上下文时同样只读共享 localStorage。
- 前端单元测试（`frontend/tests/`）：新增 `columnWidthPlanning.test.js`（典型 fixture 断言）与 `columnWidthPlanning.pbt.test.js`（fast-check PBT）；更新任何受宽度断言影响的既有测试。
- 后端单元测试（`backend/tests/test_width_planning.py`）：新增 `build_normal_table_demands` / `plan_normal_table_width` 的基线断言；保持 inline/unified 既有用例稳定；新增 codePointAt 对齐的稀有 CJK 字符不变性验证。
- 依赖：`npm i -D fast-check`（前端 devDependency）。

**不纳入范围**
- 后端 `width_planning.py` 的权重常量修改（`WEIGHT_CHINESE=2` / `WEIGHT_ASCII=1` / `FILL_LINE_WEIGHT=6` 保持）。
- Word 导出表格样式 `_apply_grid_table_style` 改动；本次仅替换 normal 表的列宽来源，不触碰边框/字体。
- 拖拽交互、吸附锚点（25/33/50/67/75%）、snap 阈值（±4px）等交互参数变更。
- 行高调整、列顺序调整、列隐藏。
- 首次进入设计器时的自动保存（用户拖拽才落 localStorage；preview/simulated 不写 localStorage）。

### 验收标准
- A1a **inline/unified 一致性**：预览初始比例与 Word 导出（inline/unified）相对差 ≤ 2%。
- A1b **normal 一致性**：`backend/src/services/width_planning.py` 新增 `plan_normal_table_width` 后，前端 `planNormalColumnFractions(fields)` 与后端对等实现结果归一化后相对差 ≤ 1e-6；Word 导出 normal 表的物理列宽与前端预览比例 × 可用宽度相对差 ≤ 2%。
- A2 **localStorage 优先**：在 localStorage 已有合法比例（`[0.1, 0.9]` 区间、和为 1±1e-3、长度匹配）时，打开设计器仍显示该比例而非内容驱动结果。
- A3 **结构变化回退**：当列数从 N 变为 M（如新增 inline 字段）时，旧 localStorage 因长度不匹配自动失效，回落到内容驱动初始比例。
- A4 **退回按钮**：设计器"重置"按钮触发 `resetToEven`（命名保留）后，比例变为内容驱动默认值（而非均分）；再次刷新页面仍为内容驱动（因 localStorage 已移除）。
- A5 **拖拽不变**：拖拽阈值 ±4px、吸附锚点 25%/33%/50%/66%/75% 未变化；拖拽结束落 localStorage 行为未变化。
- A6 **预览面板共享只读**：`TemplatePreviewDialog` 与 `SimulatedCRFForm` 在已知 formId 且 localStorage 存在合法值时，显示与设计器相同的比例；否则显示内容驱动默认值；两者不写入 localStorage。
- A7 **unified 拖拽**：`unified-table` 预览支持物理列拖拽并持久化到 localStorage（新键形如 `crf:designer:col-widths:<form_id>:unified-<N>`）；per-slot-max 聚合语义保持与后端对齐。
- A8 **CJK 扩展 B+ 对齐**：输入 `𠮷` / `𪚥` 等扩展 B 以上字符时，前端 `computeCharWeight` 权重 = 2（与后端 `compute_char_weight` 一致）。
- A9 **回归**：`cd frontend && node --test tests/*.test.js` 与 `cd backend && python -m pytest` 全部通过。
- A10 **死代码清理**：`FormDesignerTab.vue` 与 `TemplatePreviewDialog.vue` 中的 `planInlineColumnFractions` import 不再是死代码（有实际调用点）。
- A11 **PBT**：`fast-check` 覆盖 `planWidth` / `planInlineColumnFractions` / `planNormalColumnFractions` / `planUnifiedColumnFractions` 的不变量（长度保持、归一化、等需求相等比例、单调性、确定性）。

## Research Summary for Planning

### User Confirmations
- 核心目标：预览/设计器初始列宽改为内容驱动（复用后端 width_planning 规则）。
- 覆盖范围：`normal`、`inline`、`unified`、以及 `SimulatedCRFForm` 运行态预览。
- 优先级：localStorage 有合法保存值 → 用保存值；否则内容驱动计算。
- 允许本次先生成 proposal 草案再进入规划（替代 `/ccg:spec-research`）。

### Existing Structures
- `frontend/src/composables/useColumnResize.js:46-156` — `useColumnResize(formIdRef, tableKindRef, initialRatios)`：`initialRatios` 是裸数组（一次快照），当前缺失"按上下文重算默认值"的能力。
- `frontend/src/composables/useCRFRenderer.js:43-164` — 已导出 `computeTextWeight` / `computeChoiceAtomWeight` / `buildInlineColumnDemands` / `planWidth` / `planInlineColumnFractions`。
- `frontend/src/components/FormDesignerTab.vue:463-474` — `getResizer` 根据 `kind`/`colCount` 构造默认比例 `[0.3, 0.7]`（normal）或均分（inline）。
- `frontend/src/components/FormDesignerTab.vue:8` — 已 import `planInlineColumnFractions` 但**从未调用**（死代码）。
- `frontend/src/components/TemplatePreviewDialog.vue:118` — 同样 import `planInlineColumnFractions`；需审查是否消费。
- `backend/src/services/width_planning.py:93-302` — 后端宽度规划，含 `build_column_demands`、`plan_width`、`plan_inline_table_width`、`plan_unified_table_width`，与前端 `useCRFRenderer` 对等。
- `backend/tests/test_width_planning.py` — 已有后端宽度规划测试覆盖（作为算法参考）。

### Hard Constraints
- 前后端算法不可分叉：权重常量、等比缩放回退、最小保护宽度必须维持一致。
- `useColumnResize` 对外 API 结构不变（保留 `colRatios` / `onResizeStart` / `snapGuideX` / `resetToEven`），避免调用点波及。
- localStorage 键与校验协议不变；合法值范围 `[0.1, 0.9]`、和为 `1±1e-3`、长度匹配列数。
- `unified` 表若启用内容驱动，必须按"per-slot-max"聚合多 block 需求，与后端 `plan_unified_table_width` 同策略。
- `normal` 表用于 label/control 两列；权重来自 `label` 文本与 `control` 渲染产物（优先 `computeChoiceAtomWeight` / `FILL_LINE_WEIGHT`）。
- 改动不得引入 XSS / HTML 注入（计算过程不经 `v-html`）。

### Soft Constraints
- 维持一次性导入、零新 npm 依赖；算法实现在 `useCRFRenderer.js` 内部。
- 日志仅在开发模式下用 `console.debug`；生产代码无 `console.log`。
- 测试用例命名遵循项目既有 `orderingStructure.test.js` 风格；可放于 `frontend/tests/columnWidthPlanning.test.js`。
- `planNormalColumnFractions` 对 label 长度 0 或控件权重 0 的退化情形给出合理下限（MIN_WEIGHT = 4）。

### Dependencies
- 本变更依赖 `useCRFRenderer.js` 现有导出；未触达数据库或路由。
- 纯前端改动 + 一处 composable 扩展；不依赖后端变更。
- 改动集中在 5 个前端文件（`useColumnResize.js` / `useCRFRenderer.js` / `FormDesignerTab.vue` / `TemplatePreviewDialog.vue` / `SimulatedCRFForm.vue`）+ 1 个测试文件。

### Risks
- **R-ALGO**：前端 JS 浮点与后端 Python 浮点小幅误差，可能导致"预览 vs Word"比例相差 < 0.5%，需在验收标准 A1 中留余量（≤2%）。
- **R-REHYDRATE**：当前 `useColumnResize` 的 `rehydrate` 只在 `formIdRef` / `tableKindRef` 变化时触发；若字段数增减而 `tableKindRef` 保持为同一 `inline-N` 字符串（N 变化时 key 也变）理论上 OK，但需确认。
- **R-UNIFIED**：`unified-table` 当前 `<colgroup>` 基于 `computeMergeSpans(g.colCount, seg.fields.length)` 而非 `useColumnResize`；若纳入内容驱动需重新设计其列槽语义。
- **R-SIMULATED**：`SimulatedCRFForm.vue` 目前用固定 CSS 变量 `.crf-label-cell { width: 30% }`，切换为内容驱动需注入内联 style 或切换到 `<colgroup>`。
- **R-DEADIMPORT**：导入存在但未消费已有近一个迭代，移除/启用需确认其他引用。

### Success Criteria
- 功能：三类表格初始列宽显示合理；拖拽与 localStorage 覆盖行为保持。
- 一致性：对同一表单 → 预览比例 vs Word 导出比例相对差 ≤ 2%。
- 质量：`node --test tests/*.test.js`、`python -m pytest` 绿灯；lint 无新增问题。
- 文档：`frontend/.claude/CLAUDE.md` 如涉及列宽约定同步更新；否则仅在变更归档目录留 design.md。

### Open Questions — Resolved in /ccg:spec-plan
1. `unified-table` 是否纳入本次 `useColumnResize` 管理？→ **是**（物理列级别接入拖拽 + localStorage；spec 将按 `kind='unified'` 注册拖拽）。
2. `normal` 两列默认算法？→ **复用 `buildInlineColumnDemands` 语义，两列按 `max` 聚合**；同时后端新增 `build_normal_table_demands` 对等实现，前后端严格对齐。
3. `SimulatedCRFForm` / `TemplatePreviewDialog` 是否支持拖拽？→ **否**；两者作为纯展示面，仅调用 planner + 只读共享设计器的 localStorage 保存值（键相同，无写入）。
4. 是否引入 `fast-check` 做 PBT？→ **是**，`npm i -D fast-check`；对 `planWidth` / `planInlineColumnFractions` / `planNormalColumnFractions` / `planUnifiedColumnFractions` 写正规属性测试。
5. localStorage 失效回退后是否立即写回？→ **否**；保持"未持久化"状态，下一次字段结构再变时再重算。
6. A1 验收（预览 vs 导出 ≤ 2%）对 normal 表是否成立？→ **是**；同步扩展后端 `width_planning.py` 新增 `build_normal_table_demands` / `plan_normal_table_width`，并切换 `export_service.py` 的 normal 表导出为内容驱动（原固定 7.2cm/7.4cm 被替换）。
7. 前端非 BMP CJK 字符权重是否修正？→ **是**；`computeCharWeight` 改用 `codePointAt(0)` 配合 `for...of` 迭代，与后端 `ord()` 严格对齐。
8. `resizerCache` 是否在主预览/设计器预览之间隔离？→ **否**，保持现状共享（降低调用方改动面），默认值 factory 由 `getResizer` 调用点按 `groupIndex+kind+colCount` 传入，保证上下文一致。
9. `resetToEven()` 语义？→ **函数名保留，行为改为"清 localStorage + 返回内容驱动默认值"**；不再回到等分。

### Validation Findings (Phase 14 Manual Verification)

#### V1. collectColumnWidthOverrides Key Format Mismatch
**发现**：`App.vue:202-234` 的 `collectColumnWidthOverrides()` 搜索 `crf:designer:col-widths:${formId}:${kind}` 格式的键，但前端实际存储格式为 `crf:designer:col-widths:<form_id>:<groupIndex>-<kind>-<colCount>`（如 `inline-0-3`、`unified-1-4`）。

**影响**：Word 导出时无法读取用户在设计器中保存的列宽覆盖，导出结果总是回退到内容驱动默认值。

**约束**：导出读取列宽覆盖时，必须按**表实例粒度**识别（用户确认），需修正 `collectColumnWidthOverrides` 遍历实际存储的键格式。

#### V2. Canonical table_instance_id Definition
**发现**：当前 `groupIndex` 作为表实例标识符不稳定——字段排序变化会导致 groupIndex 重映射，破坏持久化一致性。

**约束**：定义规范 `table_instance_id = kind:fieldIds=<ordered-field-ids>`，例如：
- `normal:fieldIds=1,2,3`
- `inline:fieldIds=4,5`
- `unified:fieldIds=6,7,8,9`

此标识符对字段顺序变化稳定，且能唯一标识表单内的表实例。

#### V3. Reset Button Missing in UI
**发现**：`resetToEven()` 函数已实现，但 `FormDesignerTab.vue` 工具栏无可见的重置按钮入口。

**约束**：在表单界面工具栏"批量删除"按钮右侧添加"重置列宽"按钮（用户确认位置）。多选表单后点击，将所选表单的列宽全部重置。

#### V4. regular_field Participation in Unified Algorithm
**发现**：当前 `planUnifiedColumnFractions` 仅 `inline_block` 参与 per-slot-max 聚合，`regular_field` 不参与。

**约束**：`regular_field` 也应参与 unified 物理列权重计算（用户确认），贡献其 label/control 两列的权重到对应 slot。

#### V5. Mixed Unified Layout Alignment Strategy
**发现**：unified 布局中 inline_block 与 regular_field 混合时，两部分纵向框线可能不对齐。

**约束**：采用"视觉尽量接近"策略（用户确认）——不强制对齐，但通过权重规划使两部分列宽尽量接近，减少视觉割裂感。

#### V6. Export Override Contract vs localStorage Cache
**发现**：localStorage 是前端私有缓存，POST 请求体是后端契约。当前导出流程未传递列宽覆盖。

**约束**：Word 导出时，前端通过 POST body 传递 `column_width_overrides: {table_instance_id: [fractions...]}`，后端 `export_service.py` 消费此契约覆盖默认规划结果。localStorage 仅作为前端本地缓存，不作为跨栈协议。
