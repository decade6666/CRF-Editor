# aCRF 预览几何对齐（req3）

> 父任务：`07-14-crf-editor-batch-fixes`

## Goal

消除「表单界面」（`VisitsTab.vue` 预览对话框）与「表单设计界面」（`FormDesignerTab.vue` 预览）在 Word 预览 aCRF 红色矩形上的几何差异，并把红色矩形默认纵向位置改为单元格纵向居中，同时保持浏览器预览与 Word 导出（`export_service.py`）严格对等。

## Background and confirmed facts

- 两侧共用注记几何 helper：`frontend/src/composables/acrfAnnotationGeometry.js`（`buildAnnotationStyle` / `resolveAnnotationTopCm` / `estimateAnnotationWidthCm`），以及 CSS 变量 `--acrf-annotation-top` 等。
- 默认纵向偏移常量 `ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU = -120000`（负值 → 上移），在 `acrfAnnotationGeometry.js:12` 与后端 `export_service.py` 各有一份，**必须保持同源**（跨栈契约 §6 / 预览导出对等 §5）。
- 预览容器不一致：
  - `VisitsTab.vue` 用全局 `.word-page`（`main.css`，含 `td { vertical-align: middle }`，`.word-page.landscape { max-width: 1300px }`）。
  - `FormDesignerTab.vue` 用自有 `.designer-scaled-word-page`（`width: 21cm`）与 `.designer-preview-page`（`width: 100%`），并在**组件 scoped** 覆写 `.wp-form-title-row { min-height:0.7cm; padding-right:4.8cm }` 与 `.wp-form-title { margin-bottom:0 }`，而 VisitsTab 继承 `main.css` 的 `margin-bottom:24px`。这套「相对定位父容器高度 + 标题 margin」差异导致红色矩形的绝对定位基准漂移。
- 用户观察：3.1 表格字段红色矩形，表单界面比设计界面**偏上**；3.2 设计界面比表单界面**更宽、并非都是 A4**。
- 已确认决策：3.3 改居中默认后**接受基线平移、不迁移** `annotation_positions.y`。

## Requirements

### R1 — 3.1 字段矩形纵向位置对齐

- 统一两侧「表格字段」红色矩形相对单元格的纵向定位基准，使 `VisitsTab` 与 `FormDesignerTab` 预览中同一字段矩形位置一致。
- 优先做法：把决定矩形定位基准的共享 CSS（标题行 / 单元格锚点相关）收敛到全局 `main.css` 或统一 helper，消除组件 scoped 覆写造成的漂移；不得只在一侧打补丁而让另一侧继续偏移。
- 需在实现期定位「字段单元格矩形」（区别于表单标题矩形）的确切锚点：`.word-page td { vertical-align: middle }` 与注记 `top: var(--acrf-annotation-top)` 的叠加关系。

### R2 — 3.2 设计界面预览统一为 A4

- 表单设计界面预览页宽度必须与表单界面（`VisitsTab` `.word-page`）一致的 A4 几何：纵向 21cm、横向 29.7cm，不得随容器 `width:100%` 拉伸。
- 排查 `.designer-preview-page{width:100%}` 与 `.designer-scaled-word-page{width:21cm}` / 非全屏 `.wp-page{width:21cm}` 的实际生效链路，确保非全屏与全屏设计器预览都锁定 A4。
- 保持既有 `wordPageGeometry.test.js` 契约（`.designer-scaled-word-page` 保持 A4 而非 100% 宽），并按需扩展。

### R3 — 3.3 默认矩形纵向居中 + 导出对等

- 修改默认纵向偏移，使红色矩形默认与单元格纵向居中对齐（替换/重算 `ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU` 或引入按单元格高度居中的计算）。
- **前端 `acrfAnnotationGeometry.js` 与后端 `export_service.py` 必须同步改为同一居中语义**，保证浏览器预览与导出 `.docx` 的矩形默认位置一致（对等测试通过）。
- 用户自定义拖拽 `Δy` 语义不变（仍相对默认基线偏移）；未自定义项采用新居中默认。**不写迁移脚本**，接受已自定义项相对新基线的整体平移。

### R4 — 契约与测试同步

- 更新跨栈契约文档：`.trellis/spec/guides/cross-stack-contracts.md` §5（预览/导出对等）、§6（aCRF 几何与持久化），以及 README / 前后端模块 CLAUDE.md / `.claude/index.json`。
- 前端补/扩展：`acrfAnnotationGeometry.test.js`（居中默认常量/换算）、`acrfViewToggle.test.js` 或新增用例（两侧矩形位置一致、设计器 A4）、`wordPageGeometry.test.js`（A4 契约）。
- 后端补/扩展：`export_service` aCRF 几何单测与 Word 对等测试（`word_table_parity` 相关）确认居中默认。

## Acceptance Criteria

- [ ] 同一表单同一字段，`VisitsTab` 预览与 `FormDesignerTab` 预览的红色矩形纵向位置一致（不再一上一下）。
- [ ] 表单设计界面预览页固定为 A4（21cm/29.7cm），不随窗口/容器变宽。
- [ ] 未自定义位置的红色矩形，浏览器预览与导出 `.docx` 中都相对单元格纵向居中。
- [ ] 预览/导出严格对等测试通过；aCRF 几何常量前后端同源。
- [ ] 已自定义 `y` 的注记不报错、不丢失（接受相对新基线平移）。
- [ ] 契约文档与模块文档同步更新。

## Notes

- 本子任务为跨栈高风险项，需 `design.md`（几何基准方案 + 居中算法 + 对等策略）与 `implement.md`（前端 CSS/helper → 后端 export → 双栈测试顺序）后再 `task.py start`。
- 实现阶段与其它改 `FormDesignerTab.vue` 的子任务严格串行，建议放在批次最后单独验证。
- UI 改动建议启动前端并用 chrome-devtools 截图对比两侧预览与导出后 `.docx`（若 LibreOffice 可用）。
