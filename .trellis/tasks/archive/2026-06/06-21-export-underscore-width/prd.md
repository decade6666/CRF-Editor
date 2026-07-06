# brainstorm: 导出下划线按列宽自适应且不换行

## Goal

表格字段导出时，填写线（下划线 `_`）的数量应根据所在列的实际宽度自适应计算，
而不是当前的固定长度（16 个），并且保证填写线在单元格内**不换行**。
让窄列不会因为下划线过长而折行，宽列也不会因为下划线过短而留下大片空白。

## What I already know（来自代码勘察）

- 导出端 `backend/src/services/export_service.py` 填写线为硬编码：
  - 文本/标签字段：`"________________"`（16 个下划线）。
  - 空选项占位：`"________________"`。
  - 选项尾部填写线（`trailing_underscore`）：`"_" * 6`。
  - `_add_fill_line_run(paragraph, length=6)` 也是固定长度。
  - 数值带小数字段用 `|__|` 方框，规则不同（不属于纯下划线填写线）。
- 预览端 `frontend/src/composables/useCRFRenderer.js` 同样固定：
  - `renderCtrl` 兜底返回 `'________________'`，选项尾部 `${option.text}______`，单位场景 `'________________' + unit`。
- 列宽已可计算：`backend/src/services/width_planning.py` 与 `useCRFRenderer.js` 共享列宽规划契约
  （`WEIGHT_CHINESE=2 / WEIGHT_ASCII=1 / FILL_LINE_WEIGHT=6 / AVAILABLE_CM=14.66`），
  可得到每列的 cm 宽度 / fraction。
- 严格 parity：`backend/src/services/word_table_parity.py` + `scripts/compare_word_table_parity.py`
  逐字比对预览 JSON 与导出 docx 的单元格文本。**改动下划线数量必须前后端同步，否则 parity 失败。**

## Assumptions (temporary)

- 下划线数量 = floor((列宽 cm - 单元格左右内边距) / 单个下划线字符宽度 cm)，再设下限避免 0 根。
- 单个下划线宽度需按导出字号（10.5pt 宋体）估算；前后端必须用同一估算公式。
- “不换行”通过让计算结果保守地落在列宽内实现（必要时配合 Word 段落不换行属性）。

## Decisions (已确认)

- **Q1 范围**：仅「文本/标签整格填写线」+「空选项占位填写线」。
  排除：选项尾部 `trailing_underscore`（保持固定 6 个）、数值 `|__|` 方框。
- **Q2 parity**：预览与导出下划线根数**必须逐字一致**。前后端共用同一计算公式与同名常量。
- **Q3 不换行**：保守留余量，绝不换行（根数计算留安全边距，宁短勿折行）。

## Requirements

- 文本/标签字段、空选项占位的填写线根数由所在列规划宽度推导，而非固定 16。
- 选项尾部 `trailing_underscore`、数值方框保持现状不变。
- 单元格内填写线绝不换行；根数计算保守取整、预留边距。
- 前后端共用同一根数公式（同名常量 + 同一取整规则），预览/导出逐字一致。

## Acceptance Criteria

- [ ] 窄列下文本/空占位填写线不再折行到第二行。
- [ ] 宽列下填写线明显变长，占满合理宽度（扣除内边距后的可用宽）。
- [ ] 同一字段在预览 JSON 与导出 docx 中下划线根数完全相同（parity 逐字通过）。
- [ ] 选项尾部下划线、数值方框输出与改动前一致（无回归）。
- [ ] `backend/tests/test_width_planning.py`、`frontend/tests/columnWidthPlanning.test.js`、
      parity 相关测试与 `planner_cases.json` fixtures 同步更新并通过。

## Definition of Done

- 前后端下划线计算共用同一契约公式（与列宽契约一致的同名常量/算法）。
- 单元测试覆盖：窄列/宽列/单位/选项尾线/空占位等场景。
- `backend/tests/test_width_planning.py`、`frontend/tests/columnWidthPlanning.test.js`、
  parity 相关测试通过；必要时通过 `frontend/scripts/generatePlannerFixtures.mjs` 重生 fixtures。
- README / 模块 CLAUDE.md / cross-stack 契约文档同步。

## Technical Approach

核心公式（前后端共用，同名常量、同一取整）：

```
text_width_cm = col_cm - CELL_HPAD_CM - SAFETY_MARGIN_CM
count = max(MIN_UNDERSCORE, floor(text_width_cm / UNDERSCORE_CHAR_CM))
```

新增跨栈共享常量（`width_planning.py` + `useCRFRenderer.js` 同名同值）：
- `UNDERSCORE_CHAR_CM`：10.5pt 导出字体下单个 `_` 的步进宽度（估算值，逐字一致只需双端相同）。
- `CELL_HPAD_CM`：单元格左右内边距合计（Word 默认 ≈ 0.38cm，对齐导出实际设置）。
- `SAFETY_MARGIN_CM`：保守留余量，保证绝不换行（Q3）。
- `MIN_UNDERSCORE`：根数下限（避免窄列出现 0 根）。

每列 cm 的获取：
- 后端：已有 `col_widths[i] = fraction × available_cm`，直接用。
- 前端：fraction × `available_cm`，`available_cm` 必须按每表 `paper_orientation`（portrait 14.66 / landscape 值）取，与后端逐表一致——**这是 parity 的关键对齐点**。

不换行加固：导出端可对填写线 run 关闭自动断字 / 设段落不换行属性兜底；但根数本身已保守，断行属性仅作双保险。

适用点（仅文本/标签整格 + 空选项占位）：
- 后端 `export_service.py`：`_render_*` 中的 `"________________"`（文本/标签、空选项占位）、`_add_fill_line_run` 默认长度改为按列宽计算；`trailing_underscore`（`_ * 6`）与数值 `|__|` **不动**。
- 前端 `useCRFRenderer.js`：`renderCtrl` 兜底 `'________________'` 与空占位改为按列宽计算；`${option.text}______` **不动**。

fixtures / 测试：在 `planner_cases.json` 增加每列预期下划线根数，由 `generatePlannerFixtures.mjs` 统一重生，双端共用。

## Decision (ADR-lite)

- **Context**：填写线固定 16/6 根，窄列折行、宽列留白；需按列宽自适应且不换行，同时受严格 preview/export parity 约束。
- **Decision**：引入跨栈共享的下划线根数公式与同名常量，复用既有列宽规划结果，仅替换「文本/标签整格 + 空选项占位」的固定根数；选项尾线与数值方框保持不变；根数保守取整确保不换行。
- **Consequences**：parity 要求双端 `available_cm`（按纸张方向）与公式严格一致；新增 fixtures 维护成本；字宽为估算值，物理填满度非精确但双端一致且不折行。

## Implementation Status (2026-06-21)

已完成（normal 表「文本字段」填写线，端到端逐字一致）：
- 后端 `width_planning.py`：新增 `compute_fill_line_char_count` + 常量
  （`UNDERSCORE_CHAR_CM=0.19 / CELL_HPAD_CM=0.4 / FILL_LINE_SAFETY_CM=0.2 / MIN=6 / MAX=80`）。
- 后端 `export_service.py`：`_render_field_control(field_def, fill_line_chars=None)`；
  `_add_field_row` 按 `widths[1]`（control 列 cm）计算根数传入。inline/unified/空占位维持 16。
- 前端 `useCRFRenderer.js`：新增同名 `computeFillLineCharCount` + 常量；
  `renderCtrl(field, fillLineChars)` / `renderCtrlHtml(field, fillLineChars)` 可选根数（默认 16）。
- 前端 `FormDesignerTab.vue`：`renderCellHtml(ff, fillLineChars)` + `normalFillChars(gi,gv,scope)`，
  main / designer 两处 normal 控件格按 `colRatios[1] × availableCm(方向)` 传入根数。
- 前端 `SimulatedCRFForm.vue`：新增 `availableCm` prop（默认 14.66）+ `controlCellHtml`。
- 测试：`backend/tests/test_fill_line_width.py`（6）、`test_export_service.py` 新增 2 例；
  `frontend/tests/columnWidthPlanning.test.js` 9.3e/9.3e2/9.3f/9.3f2。
- 文档：`.trellis/spec/guides/cross-stack-contracts.md` §5 同步。

验证：后端全量 507 passed / 4 xfailed；前端 281 passed；`npm run lint` 0 errors；`npm run build` 通过。

### GPT 审查修复（2026-06-22）
- 【高】跨语言取整不一致：Python `//` 与 JS `Math.floor` 在边界处差 1（`8.77→42 vs 43`）。
  改为两端统一 `floor(usable/UNDERSCORE_CHAR_CM + FILL_LINE_EPSILON)`（后端 `math.floor`，新增 `FILL_LINE_EPSILON=1e-9`）。
  新增回归：后端 `test_float_boundary_matches_frontend_math_floor`、前端 9.3e `computeFillLineCharCount(8.77)===43`。
- 【中】`VisitsTab.vue` 访视预览 normal：接入 `normalFillChars(gv,gi)`（含横/竖向）。
- 【中】`TemplatePreviewDialog.vue` normal：接入 `normalFillChars(gv,gi)`（模板无方向，按竖版 14.66）。
- 【中】`SimulatedCRFForm.vue` 横版偏短：`DocxCompareDialog.vue` 现按 `formData.paper_orientation` 传 `available-cm`。

### GPT 二轮审查处置（2026-06-22）
二轮指出「auto 横版宽度未贯通」。核查后端 `_classify_form_layout` + `_build_form_table` 后确认：
**normal 表 `available_cm` 只在显式 `paper_orientation=='landscape'`（`force_landscape`）时为 23.36；
auto 永远不让 normal 表横版**（auto+宽 inline → unified 路径，无 `_add_field_row`；auto 宽 inline 仅临时横版
inline 表本身，其 fill line 仍 16）。故二轮 finding 的「auto 横版 normal 不一致」前提对 normal 填写线不成立。
据此把所有预览的判据从 auto 收敛为**显式 landscape**，精确镜像后端：
- `FormDesignerTab.vue` `normalFillChars`：`landscapeMode/designerLandscapeMode`（含 auto）→ `selectedFormPaperOrientation==='landscape'`。
- `VisitsTab.vue` `normalFillChars`：`previewLandscapeMode`（含 auto）→ `formPreviewPaperOrientation==='landscape'`。
- `SimulatedCRFForm.vue`：新增 `paperOrientation` prop，按显式方向解析 `availableCm`（保留显式 `availableCm` 覆盖）。
- `DocxCompareDialog.vue`：改传 `:paper-orientation`（formData 无方向→auto→14.66，与后端 normal 一致）。
- `TemplatePreviewDialog.vue`：模板 form-fields API 不含方向，保持竖版 14.66（对 auto/portrait 正确；
  显式 landscape 模板为已知次要缺口，需后端 API 增字段才能消除）。

复测：前端 282 passed；`npm run build` 通过；`npm run lint` 0 errors（1663 既有 prettier 警告）。
后端未改动（normal 路径逻辑未变），上一轮 508 passed 仍有效。

### GPT 三轮审查处置（2026-06-22）
三轮指出我**二轮判断有误**：`_classify_form_layout` 返回的是 `mixed_landscape`（非 `unified_landscape`），其分支对 normal field group **也调用** `_build_form_table(..., LANDSCAPE_CONTENT_WIDTH_CM=23.36)`。即 **auto + 普通字段 + 连续 inline>4** 时 normal 表确实用 23.36，导出填写线更长，而我二轮把判据收敛为「仅显式 landscape」会让预览偏短。三轮正确。

修复（统一抽出共享 helper，同时消除 GPT 次要项①常量重复）：
- 新增 `frontend/src/composables/visitPreviewLandscape.js`：导出 `AVAILABLE_CM_PORTRAIT/LANDSCAPE`、
  `isMixedLandscape(renderGroups, orientation)`、`resolveNormalTableAvailableCm(renderGroups, orientation)`
  （镜像后端 `_classify_form_layout` + `_build_form_table`：显式 landscape 或 mixed_landscape → 23.36）。
- `FormDesignerTab.vue` / `VisitsTab.vue` / `TemplatePreviewDialog.vue` / `SimulatedCRFForm.vue`：
  `normalFillChars` 改用 `resolveNormalTableAvailableCm(整张表单 renderGroups, orientation)`，删除各自重复常量。
  - Template 无方向 → 传 `'auto'`（mixed 自动识别正确；仅「显式 landscape 且非 mixed」模板仍按竖版，已知缺口）。
  - SimulatedCRFForm 由 `displayFields` 构造 renderGroups，按 `paperOrientation` prop 解析；DocxCompare 传 `:paper-orientation`。
- 测试（GPT 次要项③）：`visitPreviewLandscape.test.js` 新增 10 例覆盖 mixed/显式/portrait 抑制/auto 非 mixed 的宽度选择。

复测：前端 292 passed；`npm run build` 通过；`npm run lint` 0 errors。后端未改动，508 passed 仍有效。

### GPT 四轮审查处置（2026-06-22）
四轮确认主修复成立，仅剩「模板预览显式 landscape 且非 mixed」一条运行时缺口，且**可彻底修**（导入链路已保留方向）。已修：
- 后端 `ImportService.get_template_form_paper_orientation(template_path, form_id)`：只读读取模板表单方向，
  复用 `_has_template_paper_orientation` PRAGMA 探测，旧模板缺列回退 `'auto'`。
- `import_template.py`：`TemplateFormFieldsResponse` 增 `paper_orientation` 字段，`form-fields` 路由返回真实方向。
- 前端 `TemplatePreviewDialog.vue`：存储响应 `paper_orientation`，`normalFillChars` 改传真实方向（不再硬编码 `'auto'`）。
- 修正 `SimulatedCRFForm.vue` prop 注释漂移（次要项②）：注释更新为「mixed_landscape / 显式 landscape → 23.36」。
- 测试：后端 `test_get_template_form_paper_orientation_returns_explicit_landscape` / `_defaults_to_auto`；
  `build_template_db` 增 `paper_orientation` 参数。

复测：后端 import+ordering 59 passed；前端 292 passed；build 通过；lint 0 errors。

### 用户反馈：预览下划线固定（2026-06-22）
通过实时浏览器 DOM 排查确认：用户表单里看到的固定下划线全部是 inline 表里选项尾部 `其他____/请解释____`（trailing_underscore，固定 6），其表单**没有 normal 表、也没有整格文本填写线**，故之前只覆盖 normal 表的改动对其不可见。经确认，用户选择把自适应**扩展到 inline/unified 整格文本填写线**（逐字一致），并接受尾部 `其他____` 维持固定 6（当前表单预览不会有可见变化）。

已实现（inline 整格文本填写线，端到端逐字一致）：
- 后端 `export_service._add_inline_table`：文本/标签整格单元格按 `col_widths[col_idx]` 计算根数；新增 `test_export_inline_text_fill_line_scales_with_column_width`。
- 共享 helper `visitPreviewLandscape.resolveInlineTableAvailableCm(renderGroups, group, orientation)`：
  镜像后端 inline available_cm 的 per-group 解析（portrait→14.66 / landscape→23.36 / mixed→23.36 / 否则 >4列→23.36、≤4→14.66）。
- 前端 `FormDesignerTab/VisitsTab/TemplatePreviewDialog`：`getInlineRows(fields, fillCharsByCol)` + `getInlineFillChars(fields)`，
  经 `formDesignerPreviewModel.buildGroupViewModel` 仅对独立 inline 组注入（unified band 不注入，维持 16）。
- 测试：`visitPreviewLandscape.test.js` 新增 5 例覆盖 inline per-group 宽度解析。

未做（已知限制，记录原因）：
- **unified 表**：后端 `_build_unified_table` 当前不可达（`_classify_form_layout` 只返回 legacy/mixed_landscape，mixed 渲染为独立 inline+normal）；前端 unified 预览仅出现在 mixed 表单，其预览与导出（inline+normal）本就结构性分歧，无法逐字一致，故不接入。
- inline **拖拽覆盖**列宽时，填写线根数用 planner 默认分数（后端用覆盖值），存在轻微 parity 间隙；非拖拽（默认）场景逐字一致。

复测：前端 297 passed；后端 export/import/parity 103 passed/3 xfailed + 新 inline 集成测试通过；build 通过；lint 0 errors。

### 浏览器实测根因 + 修复（2026-06-22，表单「超声检查」）
用户反馈预览仍不自适应。登录 http://0.0.0.0:8888（DECADE）实测「超声检查」预览 DOM，定位两个真因：
1. **FormDesignerTab 本地 `renderCtrl(fd)` 包装器丢弃第二参**：`getInlineRows` 调本地 `renderCtrl(fd, fillChars)`，
   但本地包装器签名只有 `fd`、调用 `renderCtrlBase(field)` 未转发 `fillLineChars` → inline 整格文本回退固定 16（8em）。
   normal 走 `renderCtrlHtml`（导入版，会转发）所以已自适应。修复：本地包装器 `renderCtrl(fd, fillLineChars=null)` 转发。
2. **预览 word-page 是流式 px（landscape 仅 609px，非 A4 真实 cm）、字号固定 14px**：按逻辑 cm 算的根数（em min-width）
   必然与被压窄的列宽不匹配 → 填写线**溢出**单元格（normal 40em=560px > 379px；inline 11em=154px > 111px）。
   这是流式预览的缩放特性，靠静态 em 无法修。修复：`main.css` 新增规则——**整格填写线（单元格唯一内容）flex 填满单元格**
   （`.word-page .wp-ctrl/.unified-value > span:has(> .fill-line:only-child)` 设 `display:flex`，子填写线 `flex:1; min-width:0 !important`
   覆盖行内 em min-width）。仅作用于整格填写线；选项尾部 `.choice-atom` 内填写线不受影响（保持 `align-self:flex-end`）。
   导出与预览 JSON 仍按字符根数渲染真实下划线，**严格 parity 不变**（C-01 仅新增上下文规则，未改 `.fill-line` 基础规则）。

实测结果（重建 dist + 强制重载）：整格填写线填满所在列、零溢出（normal 366≈cell379；inline col2 98≈cell111）；
尾部 `○病史____/○其他____` 保持短 6；截图确认。
新增 `wordPageGeometry.test.js` 锁定该 CSS 契约。复测：前端 298 passed；build 通过；lint 0 errors。

残留（均不破坏逐字一致，因两端同为 16）：
- 选项尾部 `其他____`（trailing_underscore）维持固定 6（用户确认排除）。
- unified 表 / 拖拽覆盖 inline，见上「未做/已知限制」。
- 空选项占位：预览 `○是 ○否` vs 导出下划线属既有分歧，未纳入。
- docx 导入 formData 当前不含 `paper_orientation`，DocxCompare 落到 auto；其 normal 表 mixed_landscape 仍按 fields 正确识别，仅「显式 landscape 且非 mixed 的导入对比预览」按竖版（formData 无此字段，属 docx 解析侧限制）。

## Out of Scope (explicit)

- 数值字段 `|__|` 方框规则（除非明确纳入）。
- 列宽规划算法本身的调整（本任务复用既有列宽结果，不改列宽分配）。

## Technical Notes

- 关键文件：
  - 导出：`backend/src/services/export_service.py`（`_render_*`、`_add_fill_line_run`、`_get_option_labels`）
  - 列宽：`backend/src/services/width_planning.py`、`backend/src/services/field_rendering.py`
  - 预览：`frontend/src/composables/useCRFRenderer.js`（`renderCtrl` 及填写线拼接）
  - parity：`backend/src/services/word_table_parity.py`、`backend/scripts/compare_word_table_parity.py`
  - 契约文档：`.trellis/spec/guides/cross-stack-contracts.md` §5
- 难点：Word 渲染期无法直接测量文本宽度，需要按字号估算下划线字符宽度 cm，前后端公式必须一致。
