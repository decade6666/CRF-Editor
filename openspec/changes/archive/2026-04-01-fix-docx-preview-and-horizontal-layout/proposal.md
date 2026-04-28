# Proposal: fix docx preview and horizontal layout

## Enhanced Requirement

修复 CRF 编辑器中与 Word 预览/导出一致性相关的三个问题，范围同时覆盖：
1. 前端实时 Word 预览（设计器/访视中的 HTML 模拟预览）；
2. 最终导出的 Word 文档（`ExportService` 生成的 `.docx`）。

### 目标
- 修复实时 Word 预览中的文本/表格内容超出页面可视区域的问题。
- 修复横向表格列宽均分导致的可读性差问题，改为按内容做比例分配，并保持总宽度不超页宽。
- 修复导出 Word 中横向表格字段的“选项文本 + 尾部下划线”换行行为，保证两者作为整体不拆行。
- 保持前端预览与导出 Word 的横向布局语义一致，避免“预览正常/导出异常”或“导出正常/预览异常”。

### 技术约束
- 不修改本阶段以外的业务流程；仅研究并形成约束，不实施代码改动。
- 前端预览与导出属于两条不同渲染链路：
  - 前端：`frontend/src/components/FormDesignerTab.vue` + `frontend/src/composables/useCRFRenderer.js`
  - 后端：`backend/src/services/export_service.py` + `backend/src/services/field_rendering.py`
- 后端当前导出采用确定性固定布局（`table.autofit = False` / fixed layout）；若要按内容分配列宽，需要在确定性算法内完成，而不是完全交给 Word 自动布局。
- `trailing_underscore` 是业务语义，不可在修复过程中破坏现有 metadata 保真逻辑。
- `unified_landscape` 与 legacy inline 横表是两条并行横表路径，任何列宽策略都必须同时覆盖。

### 范围边界
**纳入范围**
- 设计器实时 Word 预览溢出问题。
- 导出 Word 中 legacy inline / unified 横向表格的列宽策略。
- 导出 Word 中“选项文本 + 尾部下划线”整体不拆行。
- 为预览与导出建立统一的宽度语义。

**不纳入范围**
- Word 导入后的截图预览链路（`docx_screenshot_service`）。
- 与横向表格无关的普通 2 列表版式改造。
- 新增业务字段类型、导入规则或数据库结构变更。

### 验收标准
- 前端实时 Word 预览中，横向表格/长文本不再超出页面可视区域。
- 导出 `.docx` 中，横向表格列宽不再均分，而是基于内容长度比例分配，同时不超页宽。
- 导出 `.docx` 中，带 `trailing_underscore` 的横向选项满足“选项文本 + 尾部下划线”整体不拆行。
- 前端预览与导出 Word 对同一横向表的列宽分配原则一致。
- 既有结构不变式保持成立：
  - `mixed + max_block_width > 4` 仍走 `unified_landscape`
  - 普通表/非 unified 路径不被误伤
  - `trailing_underscore` 既有语义测试继续成立

## Research Summary for Planning

### User Confirmations
- 预览范围：同时覆盖前端实时预览 + 导出 Word。
- 列宽策略：按内容长度做比例分配，并设置约束避免溢出。
- 下划线换行：保证“选项文本 + 尾部下划线”整体不拆行。

### Existing Structures
- 前端实时预览主入口：`frontend/src/components/FormDesignerTab.vue`，预览渲染复用 `frontend/src/composables/useCRFRenderer.js`。
- 后端导出主入口：`backend/src/routers/export.py` -> `backend/src/services/export_service.py`。
- 后端已存在横表布局抽象：`LayoutDecision`、`Segment`、`_classify_form_layout()`、`_build_unified_segments()`。
- 后端字段行/默认值抽象集中在 `backend/src/services/field_rendering.py`。
- 选择项与尾部下划线语义集中在 `_get_option_data()`、`_render_choice_field()`、`_render_vertical_choices()`、`_add_fill_line_run()`。

### Hard Constraints
- “Word 预览”不是单一路径；前端 HTML 模拟预览与后端导出 docx 是两条链路，必须双边同步，单改一侧无法满足用户目标。
- 后端导出当前使用 fixed table layout；“按内容分配列宽”必须在确定性宽度算法中实现，不能直接完全交给 Word 自动调整。
- 横表有两条路径：legacy inline 与 unified landscape；任一宽度策略都必须同时覆盖，否则仍会行为分叉。
- `unified_landscape` 依赖 merge span（`label_span/value_span`）；内容驱动宽度算法必须与 merge cell 兼容。
- 当前尾线通过字面下划线 run 生成；若要实现“选项文本 + 尾线整体不拆”，大概率需要调整 run/OXML 级实现，而不能只改普通文本。
- `trailing_underscore` 是业务语义，必须保持导入/导出/存储保真。

### Soft Constraints
- 现有项目遵循“路由薄、服务重”的分层，布局规则应继续下沉到 service/composable，而不是散落到 UI 模板。
- 前端字段渲染逻辑应继续复用 `useCRFRenderer.js`，避免在多个组件里复制 HTML 规则。
- 测试现状更偏结构回归，后续实现阶段需要补足视觉/布局相关断言。

### Dependencies
- 后端：`export.py` -> `ExportService.export_project_to_word()` -> `_add_inline_table()` / unified table builders。
- 后端字段模型：`field_rendering.py` 的 `build_inline_table_model()` / `extract_default_lines()`。
- 前端：`FormDesignerTab.vue` 的 `renderGroups` / `buildUnifiedSegments` / `renderCellHtml` / `getInlineRows`。
- 共享业务语义：`CodeListOption.trailing_underscore`。

### Risks
- 只改导出不改前端，会继续出现“预览与导出不一致”。
- 将等宽改为内容驱动后，可能影响 unified merge 规则、section 切换与边框回归。
- no-wrap 实现如果粒度过大，可能把“换行”问题转成“撑宽/裁切”问题。
- 现有测试缺少视觉回归基线，单靠结构测试不足以证明问题已修复。

### Verifiable Success Criteria
- 前端实时预览中，横向表格不再出现超出页面容器的文本或列。
- 导出 Word 中，legacy inline 与 unified 横向表都基于内容比例分配列宽，且总宽度不超页面可用宽度。
- 导出 Word 中，带 `trailing_underscore` 的横向选项满足“文本 + 尾线”整体不拆行。
- 同一表单在前端预览与导出 Word 中的横向列宽趋势一致。
