# aCRF 预览几何对齐 — Implement（req3）

> 子任务：`07-14-acrf-preview-geometry-parity` ｜ 前置：`design.md` 已定方案
> 约束：改 `FormDesignerTab.vue`，与其它同文件子任务**串行**；建议放批次最后单独验证。

## 执行原则
- 跨栈对等优先：任何默认几何改动，前端 helper + 后端 export **同一提交内原子同改**，以对等测试为守卫。
- TDD：先写/扩展会失败的对等与位置测试，再改实现。
- UI 改动需启动前端 + chrome-devtools 实测；导出改动在 LibreOffice 可用时验证真实 `.docx`。

## 步骤

### 0. 勘察（实测根因，写入 design 结论）
- [ ] 启动前端（`cd frontend && npm run dev`），用 chrome-devtools 打开同一表单的「表单界面预览」（VisitsTab）与「表单设计界面预览」（FormDesignerTab）。
- [ ] 对同一字段矩形，检查其 `position:absolute` 的**定位祖先**、祖先高度、计算后的 `top` 像素值，定位 3.1 的真实基准差异点。
- [ ] 记录两侧预览页实际渲染宽度，确认 3.2 差异（900px 弹性 vs 21cm 固定）。

### 1. 3.2 预览页统一 A4（低耦合，先做）
- [ ] 按 design R2 选定方案：让 VisitsTab 预览页采用固定 A4 几何（或抽共享 A4 页类到 `main.css`）。
- [ ] 扩展 `frontend/tests/wordPageGeometry.test.js`：VisitsTab 预览页 21cm×29.7cm、landscape 翻转。
- [ ] 验证：`cd frontend && node --test tests/wordPageGeometry.test.js`。
- [ ] chrome-devtools 复测两侧预览页等宽且为 A4。

### 2. 3.1 统一字段矩形定位基准
- [ ] 按勘察结论，把决定注记定位基准的 CSS 收敛到全局 `main.css`（统一 `position:relative` 单元格容器 + 高度语义），两侧共用；移除造成漂移的组件 scoped 差异。
- [ ] 新增/扩展前端用例：两侧同字段注记 `top` 语义一致（源码级断言共享定位类，或计算一致）。
- [ ] chrome-devtools 复测：两侧同字段矩形纵向位置一致。

### 3. 3.3 默认居中 + 导出对等（高风险，最后做）
- [ ] 先写失败测试：
  - 前端 `acrfAnnotationGeometry.test.js`：默认（`Δy=0`）`resolveAnnotationTopCm` 表达单元格纵向居中的新常量/公式；EMU↔cm 换算不变。
  - 后端 `export_service` aCRF 几何单测 + Word 对等测试：默认 box 居中于单元格行；`posOffset(default)` 与前端一致。
- [ ] 后端实现：重算 `ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU`（或新增按 `ACRF_ANNOTATION_HEIGHT_CM` / `SINGLE_LINE_HEIGHT_PT` 计算的居中偏移），校准到对等测试通过。
- [ ] 前端实现：`acrfAnnotationGeometry.js` 同步同一常量/公式；确认 `.wp-acrf-annotation` 定位祖先覆盖整个单元格高度以表达居中。
- [ ] 覆盖 landscape / 多行单元格 / inline-header / 表单标题注记的默认居中回归。
- [ ] `Δy` 语义不变：已自定义项相对新默认偏移；**不写迁移脚本**。

### 4. 验证（全量）
- [ ] 后端：`cd backend && python -m pytest`（重点 aCRF 几何 + `word_table_parity` 对等）。
- [ ] 前端：`cd frontend && node --test tests/*.test.js`。
- [ ] LibreOffice 可用时导出 aCRF `.docx`，肉眼核对默认矩形居中且与预览一致。
- [ ] chrome-devtools 终检：两侧预览矩形位置一致、预览页 A4、默认居中。

### 5. 契约与文档同步
- [ ] `.trellis/spec/guides/cross-stack-contracts.md` §5/§6 更新新几何契约与「不迁移、接受平移」的存量策略。
- [ ] README / `frontend/.claude/CLAUDE.md` / `backend/.claude/CLAUDE.md` / `.claude/index.json` 同步。
- [ ] 更新父任务 `07-14-crf-editor-batch-fixes` 的 Change Log 条目（若项目惯例在模块 CLAUDE.md 记录）。

## 复核 Gate
- [ ] 代码写完 → `code-reviewer`（跨栈一致性 + 对等）。
- [ ] `/ccg:verify-change`（文档同步）+ 列宽/几何相关 `/ccg:verify-quality`（若改动较大）。

## 回滚点
- 每一大步（1/2/3）为独立可回滚提交边界；3.3 默认几何改动如对等测试无法校准，单独回退该步而保留 1/2 的对齐成果。

## 验收对齐（见 prd.md Acceptance Criteria）
- 两侧矩形位置一致 / 设计界面 A4 / 默认居中且预览导出对等 / 对等测试绿 / 已自定义项不报错不丢失 / 契约文档同步。
