# aCRF 预览几何对齐 — Design（req3）

> 父任务：`07-14-crf-editor-batch-fixes` ｜ 子任务：`07-14-acrf-preview-geometry-parity`
> 跨栈高风险：改动同时影响浏览器预览与 Word 导出，必须保持严格对等（契约 §5/§6）。

## 1. 现状与根因（已核实）

### 共享几何 helper
- `frontend/src/composables/acrfAnnotationGeometry.js`
  - `ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU = -120000`（:12），负值→上移。
  - `resolveAnnotationTopCm(kind, deltaY01cm) = emuToCm(default + delta*3600)`（:111-115）。
  - `buildAnnotationStyle` 产出 CSS 变量 `--acrf-annotation-top` 等，注记 span 用 `position:absolute; top:var(--acrf-annotation-top)` 定位。
- 后端 `backend/src/services/export_service.py`
  - 同名常量 `ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU = -120000`（:178）。
  - `_add_oid_annotation_box`（:1074-1177）：浮动锚 `<wp:anchor>`，`positionV relativeFrom="paragraph"`，`posOffset = DEFAULT_VERTICAL_OFFSET + delta_y_to_emu(delta)`（:1097-1099），`wrapNone`，`bodyPr anchor="ctr"`，box 高 `ACRF_ANNOTATION_HEIGHT_CM`。
  - 单元格已 `vertical_alignment = WD_ALIGN_VERTICAL.CENTER`（:695）+ 精确行高 `_apply_exact_row_height`；行内单行高常量 `SINGLE_LINE_HEIGHT_PT`（:286）。
- **契约**：两处默认偏移常量必须同源同值，`posOffset = default + Δy` 语义前后端一致（前端 CSS 绝对单位按 96px/in，后端 EMU 按 914400/in）。

### 3.1 字段矩形纵向位置：表单界面比设计界面偏上
- 两侧字段注记 `top` 由**同一 helper** 计算，值相同 → 位置差异来自**定位参照系（positioned ancestor）/ 单元格高度差异**，而非 helper。
- 已知差异源：
  - 表单界面 `VisitsTab.vue` 预览用全局 `.word-page`（`main.css:316`，`td{vertical-align:middle; padding:5.25pt 6px}`）。
  - 表单设计界面 `FormDesignerTab.vue` 预览叠加 `form-designer-word-page` + `designer-scaled-word-page`，并有组件 scoped 覆写（标题行 `.wp-form-title-row{min-height:0.7cm; padding-right:4.8cm}` / `.wp-form-title{margin-bottom:0}`），以及行高拖拽 `row-resize-host/anchor` 包装。
  - 注记 span 为 `position:absolute`，其纵向基准取决于最近的 `position:relative` 祖先与该祖先高度；两侧单元格包装/行高链不同→同一 `top` 落在不同基准上→视觉一上一下。
- **本设计不臆断唯一像素级根因**：R1 要求实现期用 chrome-devtools 实测两侧 DOM 的 positioned ancestor 与 box 计算高度，定位真实差异点后**收敛为同一基准**（优先把决定基准的 CSS 收敛到全局 `main.css` / 统一到 helper，禁止只在一侧打补丁）。

### 3.2 设计界面预览更宽、并非都是 A4
- `VisitsTab` 用裸 `.word-page`：`max-width:900px`（landscape 1300px），**无固定宽**，随容器/最大宽收缩——非严格 A4。
- `FormDesignerTab` 非全屏（:2886）与全屏（:3735）预览都用 `.designer-scaled-word-page{width:21cm; max-width:100%}`（:5532）——固定 21cm A4。
- 即两侧「宽度基准不同」：一个 900px 弹性、一个 21cm 固定。用户观感「设计界面更宽/非 A4」实为**二者不统一**。目标：**统一为 A4 21cm/29.7cm 固定几何**（与既有 `wordPageGeometry.test.js`「`.designer-scaled-word-page` 保持 A4」契约一致，且导出就是 A4）。

### 3.3 默认矩形改单元格纵向居中 + 导出对等
- 当前默认 `-120000 EMU ≈ -0.333cm`，是相对锚段落上移约半个 box 高（box 0.7cm）——并非严格「单元格纵向居中」。
- 目标：默认（`Δy=0`/无覆盖项）时 box 相对单元格纵向居中。后端因 `positionV relativeFrom="paragraph"` 且单元格 `anchor=CENTER`+精确行高，段落已居中于单元格；需重算 `default_offset` 使 box **中心**对齐段落行中心：约 `default_offset_emu = -(BOX_HEIGHT_EMU - SINGLE_LINE_HEIGHT_EMU)/2`（正负向以「box 高于行高、需上移半个差值」为准，实现期以对等测试校准精确值）。
- 前端同步：`resolveAnnotationTopCm` 的默认项改为同一居中语义；`.wp-acrf-annotation` 的定位祖先须为覆盖整个单元格高度的 `position:relative` 容器，使 `top` 能表达「相对单元格居中」。

## 2. 方案

### R1 — 统一字段矩形定位基准（3.1）
- 实测后确定两侧共享的「单元格注记定位容器」：同一 `position:relative` 且高度=单元格内容高度的祖先；把该定位相关 CSS 从组件 scoped 收敛到全局 `main.css`（或统一进 helper 产出的类），两侧共用。
- 保留 `--acrf-annotation-top` 计算不变（helper 单一真源）；只消除参照系差异。

### R2 — 设计界面预览统一 A4（3.2）
- 让 `FormDesignerTab` 与 `VisitsTab` 预览页采用**同一 A4 几何**：纵向 `width:21cm; min-height:29.7cm`，横向 `29.7cm×21cm`。
- 方案取向（实现期二选一，写入结论）：
  - (a) 让 `VisitsTab` 预览页也用 `designer-scaled-word-page` 等价的固定 A4（推荐，导出即 A4，预览所见即所得）；或
  - (b) 抽出共享 A4 页类到 `main.css`，两侧同用。
- 保持 `wordPageGeometry.test.js` A4 契约并按需扩展覆盖 VisitsTab 预览页。

### R3 — 默认居中 + 导出对等（3.3）
- 后端：重算 `ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU`（或引入按 `BOX_HEIGHT`/`SINGLE_LINE_HEIGHT` 计算的居中偏移常量），使默认 box 居中于单元格行。
- 前端：`acrfAnnotationGeometry.js` 同步同一常量/公式，保证 `resolveAnnotationTopCm(kind,0)` 与后端 `posOffset(default)` 表达一致居中。
- `Δy` 语义不变（相对新默认偏移）；无覆盖项用新居中默认。**不迁移** `annotation_positions.y`，接受已自定义项相对新基线整体平移。

### R4 — 契约与文档
- 更新 `.trellis/spec/guides/cross-stack-contracts.md` §5（预览/导出对等）、§6（aCRF 几何与持久化）。
- 同步 README / `frontend/.claude/CLAUDE.md` / `backend/.claude/CLAUDE.md` / `.claude/index.json` 中 aCRF 几何与预览页说明。

## 3. 兼容性 / 风险
- **高风险**：默认偏移改动会移动所有默认位置注记，且影响导出。以「预览 vs 导出对等测试」为主守卫。
- 已自定义 `y` 的注记视觉位置会随基线平移（已确认接受，不迁移）。
- 常量前后端必须原子同改，避免预览与导出漂移；改动需一次性覆盖 helper + export + 两侧 CSS。
- landscape / 多行单元格 / inline-header 注记的居中需一并回归。

## 4. 影响文件
- 前端：`frontend/src/composables/acrfAnnotationGeometry.js`、`frontend/src/styles/main.css`、`frontend/src/components/VisitsTab.vue`、`frontend/src/components/FormDesignerTab.vue`（仅 CSS/模板类，串行）。
- 后端：`backend/src/services/export_service.py`。
- 契约/文档：`cross-stack-contracts.md`、README、模块 CLAUDE.md、`.claude/index.json`。
- 测试：`acrfAnnotationGeometry.test.js`、`acrfViewToggle.test.js`（或新增两侧位置一致用例）、`wordPageGeometry.test.js`；后端 `export_service` aCRF 几何单测 + Word 对等测试。
