# 表单界面新增 eCRF/aCRF 视图切换按钮

> 双模态审查(antigravity 89/100 + codex 53/100)已折入修订，见末尾「审查修订记录」。

## Goal
在表单设计界面新增一个 eCRF / aCRF 视图切换控件（样式参考设置中的「编辑模式」`el-switch` + `inline-prompt`）。切到 aCRF 后，在 CRF 预览中渲染 OID 标注，与 aCRF Word 导出的浮动标注语义对齐。控件仅在「编辑模式 = 完全」时出现，放置于两处：
1. 画布头 `.fd-canvas-header`：「设计表单」按钮与表单名之间。
2. 设计器全屏弹窗「设计：XXX」标题右侧。

## Requirements
1. 新增全局响应式视图状态 `viewMode`（`'eCRF' | 'aCRF'`），默认 `eCRF`，localStorage 持久化（键 `crf_view_mode`，语义=「跨项目/跨表单、仅作用于表单设计器两处预览」的全局偏好；读时校验非法值并回退 `eCRF`）。两处控件绑定同一状态、保持同步。
2. 控件样式：`el-switch` + `inline-prompt`，`active-text="aCRF"` / `inactive-text="eCRF"`，与「编辑模式」一致。
3. 可见性：仅当 `editMode`（完全模式）为真时渲染控件；放置点 1 仍受 `selectedForm` 约束。
4. **aCRF 渲染（按值存在判定，锚点按表格类型对齐导出）**：`viewMode === 'aCRF'` 时在预览渲染浮动 OID 标注：
   - 判定规则：**字段级标注按 `variable_name` 是否有值渲染，而非按字段类型硬排除**（与后端一致——后端只要有 `variable_name` 即标注，测试明确期望 `LEGACY_LABEL` 这类标签字段也被标注）。独立日志行通常无 `field_definition`，自然不渲染。
   - **锚点对齐导出（关键）**：标注锚点须按表格类型镜像导出，避免在多行/多列处重复：
     - 普通行：锚定字段标签/取值单元格（`.wp-ctrl` / `unified-value` / `FormLabel` 段），与导出 `_add_oid_annotation_box(para,...)` 普通分支一致。
     - 行内/横向 inline band 与 unified-inline：锚定**表头单元格** `.wp-inline-header`（导出在合并 label/header 段锚定），**禁止**在每个数据单元格各渲染一次。
   - 表单级标注：文本 `selectedForm.domain`；**`domain` 为空是正常路径，不渲染**（前端新建/编辑表单弹窗当前无 domain 录入入口，手工表单 domain 普遍为空）。
5. 覆盖范围：仅设计器两处预览——画布预览（`.fd-canvas` `renderGroupsView`，~2507）与设计器弹窗预览（`designerRenderGroupsView`，~2941）。**标注 DOM 只在 FormDesignerTab 这两处模板内插入（最多加本组件私有 helper）；不得把 aCRF 标注语义下沉到共享 `useCRFRenderer` / `buildPreviewGroupViewModels`**，否则 TemplatePreviewDialog / VisitsTab 会被动带上，超出 scope。
6. **editMode 交互 + 复位归一化（覆盖初始水合）**：aCRF 标注独立于现有「OID 列」editMode 门控；但控件仅在完全模式出现。复位须覆盖两条路径：
   - 交互态：`watch(editMode)`，转 false 时 `viewMode='eCRF'`。
   - **初始水合态**：组件挂载/初始化时基于「当前 `editMode` + 持久化值」做一次归一化——若 `editMode=false` 则强制 `eCRF`，并对非法持久值回退。避免「启动即简要 + localStorage 残留 aCRF → 控件隐藏却仍标注」的卡死态。
7. 与导出解耦：不改动 `App.vue`「导出eCRF/导出aCRF」下拉与后端导出逻辑（该解耦已有 `appSettingsShell.test.js` source 测试守护，保持不绑定同一状态源）。
8. **浮动标注样式约束（必写实，避免临场判断）**：
   - `pointer-events: none`（对鼠标完全透明），并约束 z-index 与现有 `.row-resizer-handle` 关系，**不得遮挡**双击快编、列宽/行高拖拽手柄。
   - 渲染用 `{{ }}` / `v-text`，**禁用 `v-html`**（防 XSS）。
   - 尺寸优先物理单位 `cm` 对齐 Word 几何（box 高 ≈0.7cm、最大宽 ≈4.6cm、上偏移 ≈0.35cm），溢出截断不换行破坏布局。
9. **表单级标注锚点（分两处处理，解决设计器预览无标题节点问题）**：
   - 统一锚定到 `.word-page` 顶部（给 `.word-page` 建立 `position: relative` 定位上下文），两处预览一致。主画布预览额外可贴近其已有 `.wp-form-title`(2507)；设计器弹窗预览(2941)**无 `.wp-form-title` 节点**，采用页顶 overlay 锚点（不新增标题节点，避免改动其几何）。
10. **`.fd-canvas-header` 退化策略**：该头部当前不换行、标题不截断；插入 switch 后须给出长表单名/备注摘要的截断或换行退化策略，避免挤爆（右侧计数已 `margin-left:auto` 脱流，不受影响）。
11. **设计器弹窗 header 实现写实（撞既有锁定测试，必须同步改测试）**：
    - 用 `el-dialog` `#header` 插槽（Element Plus 已弃用 `title` slot；`#header` 需自维护可访问标题）。
    - 保持单行、头部高度 **≤54px**（`.designer-dialog .el-dialog__body { height: calc(100vh - 54px) }` 被锁定）。
    - 保留 close 按钮并预留其右侧内边距，避免控件与关闭按钮争位。
    - **DoD 必须同步更新** `orderingStructure.test.js:221`（原断言锁死 `:title="'设计：' + (selectedForm?.name || '')"` 源码形态）与相关结构断言。

## Acceptance Criteria
- [ ] 完全模式下：`.fd-canvas-header`「设计表单」与表单名之间出现 eCRF/aCRF 开关；简要模式下不出现。
- [ ] 完全模式下：设计器弹窗「设计：XXX」处出现相同开关（`#header` 实现，头高 ≤54px，不裁剪 body，不与 close 争位）；简要模式下不出现。
- [ ] 两处开关共享同一 `viewMode` 并同步；刷新后保持（localStorage，非法值回退 eCRF）。
- [ ] **初始水合归一化**：启动即「简要 + localStorage 残留 aCRF」时，预览不出现标注，且控件隐藏。
- [ ] `viewMode='aCRF'` 时：有 `variable_name` 的字段（含标签型历史字段）渲染标注，无值不渲染；inline/横向字段标注只出现在表头单元格、**不逐行重复**。
- [ ] 表单 `domain` 有值时两处预览渲染表单级标注；`domain` 为空时不渲染（正常路径）。
- [ ] `viewMode='eCRF'` 时预览无标注，与现状一致。
- [ ] 标注 `pointer-events:none`，不影响双击快编与列宽/行高拖拽；不破坏 `.word-page` A4 几何与列宽规划（`table-layout:fixed` + `colgroup` 契约）。
- [ ] 退出完全模式后 `viewMode` 复位为 `eCRF`。

## Definition of Done
- 前端 `node --test tests/*.test.js` 通过；新增/更新测试：
  - wiring：两处控件存在、`v-if="editMode"`、同步、标签 eCRF/aCRF。
  - 行为：按 `variable_name` 存在渲染、无值不渲染、inline 表头锚点不重复、domain 空不渲染、`pointer-events:none`、初始水合归一化复位、退出完全模式复位。
  - **几何/缓存矩阵**：portrait/landscape × normal/unified/inline × 主预览/设计器双实例 × 切换 eCRF↔aCRF 前后——列宽与 row/col override 缓存键不变（缓存键当前不含 viewMode，实现不得通过加 padding/占位行污染缓存语义）。
  - **更新既有锁定测试**：`orderingStructure.test.js` 的 designer dialog `:title`/header 断言随 `#header` 改动同步；确认 `calc(100vh - 54px)` 仍成立。
- `npm run lint` / `npm run format` 通过。
- 文档同步：`frontend/.claude/CLAUDE.md`、根 `.claude/CLAUDE.md`（如需）、`README*`（如需）、`.claude/index.json` 测试计数。

## Technical Approach
- **状态**：`viewMode` 作为 `FormDesignerTab.vue` 内单一 `ref`（两处控件均在该组件内，无需 provide/inject）；持久化 + 初始化归一化封装在组件内小 helper。`editMode` 已通过 inject 在该组件可用，用于 `v-if`、`watch` 与初始归一化。
- **控件**：放置点 1 在 `设计表单` 按钮后、表单名 span 前插入 `el-switch`（`v-if="editMode"`）。放置点 2 用 `el-dialog #header`（保留标题文本与可访问性 + switch + close 间距，单行 ≤54px）。
- **标注渲染**：在两处 `.word-page` 模板按 `editMode && viewMode==='aCRF'` 条件、按表格类型在对应锚点单元格（普通=值/标签格，inline=`.wp-inline-header`）插入绝对定位浮动标签；`.word-page` 设 `position: relative` 作表单级 overlay 锚点；标签 `pointer-events:none`、`cm` 单位、`{{ }}` 渲染。具体注入点以 `renderGroupsView`/`designerRenderGroupsView` 视图模型输出与 word-page 模板(~2499/~2930)为准，仅在 FormDesignerTab 内实现。
- **复位**：`watch(editMode→false)` + 初始化归一化双覆盖。

## Decision (ADR-lite)
- Context：用户希望预览像 aCRF 导出一样直观显示 OID 标注，作为完全模式高级能力；双模态审查暴露 5 处「计划假设与现状代码不符」。
- Decision：
  1. 表单级标注统一锚定 `.word-page` 顶部 overlay（不依赖 `.wp-form-title`，解决设计器弹窗预览无标题节点）。
  2. 字段级标注按 `variable_name` 是否有值判定、锚点按表格类型镜像导出（inline→表头格，不逐行重复）。
  3. 设计器弹窗用 `#header` 实现、保 ≤54px 头高、同步更新被锁定的结构测试。
  4. 复位双覆盖（watch + 初始水合归一化）。
- Consequences：标注实现须限制在 FormDesignerTab 内、绝对定位 + `pointer-events:none` 不入列宽几何；需新增几何/缓存测试矩阵并改一处既有结构测试。

## Out of Scope
- 后端导出/标注逻辑改动（aCRF 浮动 OID 导出已完成）。
- TemplatePreviewDialog / SimulatedCRFForm / VisitsTab 访视预览的标注（无开关入口，暂不覆盖）。
- 选项级（codelist option）OID 标注。
- 为表单弹窗新增 `domain` 录入入口（独立需求）。

## Technical Notes
- 样式锚点：`App.vue:1286`「编辑模式」`el-switch inline-prompt`。
- 放置锚点：`FormDesignerTab.vue` `.fd-canvas-header`（~2482）、设计器弹窗 `:title`（~2803，将改 `#header`）。
- 预览 DOM：主画布预览含 `.wp-form-title`(2507)；设计器弹窗预览(2941) 无标题节点。`.wp-inline-header`(2579)/`.wp-ctrl`(2600) 为 inline 表头/取值格；`.row-resizer-handle` 为拖拽手柄。
- 锁定测试：`orderingStructure.test.js:221`(designer `:title`)、`:238`(`calc(100vh - 54px)`)；`wordPageGeometry.test.js`(A4 几何 + fixed/colgroup)；`appSettingsShell.test.js`(导出解耦)。
- 数据：`FormResponse` 含 `domain`（list 端点返回）；字段 `variable_name` 已在前端。
- 导出标注语义参考：`export_service.py` 表单级=`form.domain`(~971)、字段级=`variable_name`(~2411/2484/2518/2578/2829/2866/2981/3113)，box 高 0.7cm/最大宽 4.6cm/上偏移。

## 审查修订记录（双模态）
- 已折入 5 Critical：inline 表头锚点(避免重复)、设计器预览无标题→`.word-page` overlay 锚点、`pointer-events:none`+z-index、初始水合复位归一化、`#header` 实现+保 54px+改锁定测试。
- 已折入关键 Warning：按 `variable_name` 判定(非字段类型)、domain 空为正常路径、几何/缓存测试矩阵、不下沉共享 renderer、header 超长退化、XSS 用 `{{ }}`、键命名语义说明。
- 已折入 Info：`cm` 物理单位对齐、`.word-page` 相对定位锚点、导出解耦保持。
- 未采纳/降级：antigravity 提的 `.wp-form-title{position:relative}` 被「统一锚定 `.word-page`」取代（更稳，覆盖两处预览）。
