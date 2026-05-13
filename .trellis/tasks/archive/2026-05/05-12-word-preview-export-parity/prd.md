# brainstorm: Word 预览与导出视觉对齐

## Goal

让 `FormDesignerTab` 的 Word 预览（`.word-page`）在用户最容易感知的两条差异上对齐后端 `.docx` 导出：

1. 表单标题视觉与导出一致（左对齐、Heading-1 等效样式）。
2. inline 表格表头（含“未查”这种 2 字短文本）在预览中不被换行——通过列宽规划契约修复，而不是 CSS 兜底。

## Why（图片证据）

参照 `image/2026-05-13_083328.jpg` 两版对比：

- 上：实际导出的 Word（`9. 生命体征` 左对齐、所有表头单行）。
- 下：CRF 编辑器预览（`生命体征` 居中、`未查` 被拆成两行、行高偏高）。

## Requirements

### R1 — 标题对齐

- `.wp-form-title` 由“居中、独立段落”改为“左对齐、Heading-1 等效字号字重”。
- **不在预览中添加 `idx.` 编号**（避免前端复刻后端 `sorted_forms` 排序逻辑的成本与潜在漂移）。
- 字体族跟随 `.word-page` 默认（SimSun 优先），不引入新的字体回退链。
- 横向 / 纵向 / 设计器缩放（`.designer-scaled-word-page`）三条路径都生效。

### R2 — 表头不换行（列宽契约修复）

- 修改 inline 表头的列宽 demand 计算（前端 `useCRFRenderer.buildInlineColumnDemands` 与后端 `width_planning.py` 对等）：
  - 当前 demand 只取 `label vs control` 的较大者；新规则需要额外把“表头中文短文本”的不可拆宽度纳入下限，确保如“未查”“项目”“单位”这类 ≤ 4 字标题永远拿到单行宽度。
  - 新增的 minimum demand 与现有 `FILL_LINE_WEIGHT` 同语义，前后端常量同步。
- CSS 不接管换行（继续允许 `word-break: break-word`），由列宽算法保证 demand 满足。
- 跨栈 fixture `backend/tests/fixtures/planner_cases.json` 增加“2 字短表头”样本，双端同时回归。

### R3 — 现有契约不退化

- 已有 `wordPageGeometry.test.js`、`columnWidthPlanning.test.js`、`test_width_planning.py`、`test_export_column_width_override.py`、`test_export_paper_orientation.py` 全部继续通过。
- 不动 `backend/src/services/export_service.py` 的 `add_heading` 行为；不改导出端编号。
- 不动 `useColumnResize` 的手动列宽存储 / 读取契约。

## Acceptance Criteria

- [ ] 预览顶部标题与导出 `.docx` 同左对齐；字号 / 字重视觉接近 Word Heading 1。
- [ ] 同一表单在不修改任何手动列宽的前提下，预览中的 `.wp-inline-header` 全部单行显示（含“未查”“项目”“单位”等 2–4 字短表头）。
- [ ] 用户手动把某列拖到极窄（< 短表头自然宽度）时，仍允许换行——这是 expected behavior，不属于本任务范围。
- [ ] `frontend/tests/columnWidthPlanning.test.js` + `wordPageGeometry.test.js` 至少新增 1 个用例锁住：
  - 标题左对齐契约。
  - 含短表头（≤ 4 字）字段的 inline 表格 demand 不低于 short-header 最小权重。
- [ ] `backend/tests/test_width_planning.py` 同步通过新 fixture。

## Definition of Done

- 前端 `cd frontend && node --test tests/*.test.js` 全绿。
- 后端 `cd backend && python -m pytest -q` 全绿（focus: `test_width_planning.py`、`test_export_column_width_override.py`、`test_export_paper_orientation.py`、`test_export_unified.py`）。
- 人工对比同一表单的预览与导出 `.docx`：标题对齐一致、所有 inline 表头单行；剩余差异（占位符字号、行高、cell padding、idx 编号）属于 known-divergence。
- 跨栈契约：根目录 `CLAUDE.md` 的“跨栈契约”小节如新增 short-header demand 常量，需在 fixture / 文档双端同步。

## Known divergence（本轮不修，list 给后续轮次）

1. 表单标题编号：导出仍带 `{idx}.`，预览不带。两边都是“左对齐 + Heading-1 等效字号”，但文字不严格一致。
2. 数值/日期占位符 `|__|` 在浏览器 SimSun 渲染与 Word SimSun 渲染存在细微字距差异。
3. 表格 cell padding（`4px 6px`）与 Word 默认 cell margin 不严格等价；行高累积差异约每行 4–8px。
4. choice 选项纵向列表行间距比 Word 略宽。
5. `VisitsTab` 的只读 Word 预览未在本轮统一（仍按上一轮 `word-preview-export-parity-plan.md` 的 step 3 跟踪）。

## Out of Scope

- 后端导出端的任何行为变更（含取消 `idx.` 编号、改变 Heading 1 样式）。
- 引入 docx 真渲染（docx.js / headless LibreOffice）。
- 重写 unified/mixed 表格分支结构。
- `VisitsTab` 只读预览的列宽 / 标题对齐（属下一轮）。
- 字号 / cell padding / 行高的全局重锚（B 方案，留作后续 PR）。

## Technical Approach

### Step 1 — 锁住红灯测试

- `frontend/tests/wordPageGeometry.test.js` 新增断言：`.wp-form-title` 计算样式为 `text-align: left`（不再是 `center`），且没有居中 margin。
- `frontend/tests/columnWidthPlanning.test.js`（或新增 short-header 专用 case）：构造一组字段，其表头为 `计划时点 / 项目 / 结果 / 单位 / 临床意义 / 未查 / 异常有临床意义，请解释`，断言任意 ≤ 4 字表头列分得的 fraction × 可用宽度 ≥ 该表头文字宽度。
- 后端 `backend/tests/test_width_planning.py` 用同一 fixture 跑出同样的最小宽度满足结论。

### Step 2 — 表头 demand 修复

- 前端 `useCRFRenderer.buildInlineColumnDemands`：在原 demand 之上，把 `computeTextWeight(label)` 作为该列的“不可压缩 lower bound”引入。
- 后端 `backend/src/services/width_planning.py` 的对应函数同步加同一 lower bound。
- 抽取一个常量（如 `INLINE_HEADER_FLOOR = max(WEIGHT_CHINESE * 2, FILL_LINE_WEIGHT?)`）以方便双端对齐；具体数值由 fixture 反推。

### Step 3 — 标题样式

- `frontend/src/styles/main.css:200` 把 `.wp-form-title` 改为左对齐；字号保留 14pt（与 Word Heading 1 默认中文标题接近）；段后距 24px 保留或微调。
- `.word-page.landscape` 与 `.designer-scaled-word-page` 路径检查无重写。

### Step 4 — 跨栈契约同步

- 如新增 demand 常量，在根 `CLAUDE.md` 的“跨栈契约 / 列宽规划”条目下增加一行说明。
- 更新 `backend/tests/fixtures/planner_cases.json` 与 `frontend/scripts/generatePlannerFixtures.mjs` 的协同关系（若 fixture 生成器需要扩展）。

## Decision (ADR-lite)

**Context**：用户截图显示预览 vs 导出有标题、表头、行高、padding、占位符等多层差异；用户希望逐步对齐，又不愿改动后端导出契约。

**Decision**：本轮只解 P0 两条（标题左对齐 + 表头不换行），且“表头不换行”走 width-planning 契约修复，而不是 CSS `nowrap` 兜底。标题不复刻 `idx.` 编号。

**Consequences**：
- 前后端 width-planning 契约新增一条 short-header demand floor，需要双端同步 + fixture 同步；后续要为新增字段类型/标签时谨慎。
- 预览与导出在 idx 编号、字号、行高上仍有可见差异，列入 known-divergence，等用户明确推动 B 方案再做。
- 风险：列宽 demand 下限提高可能压缩其它列（如“临床意义”这种长内容列）；需要 fixture 验证压缩后总宽度仍能容纳所有列。

## Implementation Plan（小 PR 拆分）

- **PR1 — 红灯测试 + 跨栈 fixture**：补 frontend/backend 新测试与新 fixture，跑出红灯。
- **PR2 — 核心修复**：列宽规划增加 short-header floor + 标题左对齐 CSS；红灯转绿。
- **PR3 — 文档与跨栈契约同步**：更新根 `CLAUDE.md` 跨栈契约小节、模块级 `.claude/CLAUDE.md` 列宽规划描述，并把 known-divergence 沉淀到 `.trellis/spec/`（如适用）。

## Open Questions

（已收敛，无 Blocking 项。）

## Technical Notes

- 当前差异分析与上下文采集证据见 `.trellis/workspace/decade/word-preview-export-parity-plan.md`（上一轮 codex+gemini 双模型诊断输出）；本 PRD 在其基础上聚焦“截图可感知”的两条 P0。
- 跨栈契约位置：
  - `backend/src/services/width_planning.py` ↔ `frontend/src/composables/useCRFRenderer.js`
  - 共享 fixture: `backend/tests/fixtures/planner_cases.json`
- 关键测试入口：
  - 前端 `node --test tests/wordPageGeometry.test.js tests/columnWidthPlanning.test.js tests/columnWidthPlanning.pbt.test.js`
  - 后端 `python -m pytest tests/test_width_planning.py tests/test_export_column_width_override.py tests/test_export_paper_orientation.py tests/test_export_unified.py -q`
- 关键源码入口：
  - 标题：`frontend/src/components/FormDesignerTab.vue:1749` + `frontend/src/styles/main.css:200`
  - 列宽 demand：`frontend/src/composables/useCRFRenderer.js:90-142` ↔ `backend/src/services/width_planning.py`
