# 导出 aCRF：在 eCRF 基础上标注字段/表单 OID

## Goal

点击「导出aCRF」时，在现有 eCRF Word 文档基础上叠加 annotated CRF 标注：每个字段标注其 OID（变量名），每张表单标注其表单级 OID。标注需遵循临床行业 aCRF 惯例（醒目、可识别），同时尽量不破坏 eCRF 原有版式与可读性。

## What I already know

* aCRF（annotated CRF / 带注释 CRF）是临床数据管理交付物：在空白 CRF 上叠加数据集/变量名注释，惯例用彩色文字（常见红/紫）就近标注，便于 reviewer 对照 SDTM 映射。
* 导出入口已就绪：前端 `App.vue` 悬停下拉「导出eCRF / 导出aCRF」，`onExportCommand('acrf')` 当前仅 `ElMessage.info('导出aCRF 功能即将上线')` 占位。
* eCRF 渲染管线：`backend/src/services/export_service.py::ExportService.export_project_to_word`；表单标题 `_add_forms_content` → `_add_toc_heading(f"{idx}. {form.name}")`；字段行 `_add_unified_regular_row`（左标签 cell + 右控件 cell）。
* 字段 OID 来源：`FieldDefinition.variable_name`（导出时经 `form_field.field_definition` 取得）。
* 表单模型 `backend/src/models/form.py` 无字面 OID 列；现有列：`name`、`code`（设计器「表单代码」可编辑）、`domain`、`paper_orientation`。
* python-docx 中彩色 run 简单可靠（`_set_run_font(run, color=...)`）；浮动文本框/批注框难以稳定实现。

## Assumptions (temporary)

* 字段 OID = `FieldDefinition.variable_name`（待确认）。
* aCRF 复用 eCRF 全部渲染逻辑，仅追加注释层 —— 通过 `export_project_to_word(..., annotated=True)` 贯通参数，不复制渲染代码。
* MVP 仅服务端生成；前端只需把 `acrf` 命令接到带 `annotated=true` 的导出调用。

## Decision: 呈现形式（已定）

* **浮动彩色矩形（floating text box）**：矩形填充 OID，悬停在字段旁边；表单 OID 矩形悬停在表单标题旁。
* 复用既有 `ExportService._make_picture_float`（export_service.py:3869）的 `wp:anchor` 浮动锚定模式：`positionH relativeFrom="column"` + `positionV relativeFrom="paragraph"` + `wrapNone` + `layoutInCell="1"`，把 picture graphic 换成 DrawingML 文本框（`wps:wsp`/`wps:txbx`）承载彩色矩形 + OID 文字。
* **零回归依据**：`word_table_parity` 仅提取表格 cell 文本（`_extract_table`/`_compare_row_cells`），浮动矩形非 cell，不进入 parity 比对，eCRF 导出 parity 不受影响。
* **风险**：垂直跟随靠 `relativeFrom="paragraph"` 锚定每个字段行；同页字段过密时矩形之间可能竖向相邻/重叠，需按行间距控制偏移；若某 Word 版本浮动渲染异常，回退到行内彩色文字。

## Resolved Decisions

* **矩形落点**：浮于字段上方/右上角（批注气泡式），沿用 `_make_picture_float` 的 `positionV` 负偏移（-288000 EMU 量级）把矩形顶在字段行右上方，压边最少。
* **表单 OID 源**：`Form.domain`（SDTM 域名，如 DM/VS/AE）。`code` 不用。
* **CT 范围**：MVP 仅标 OID（字段 `variable_name` + 表单 `domain`），选项编码值留待后续。
* **颜色（默认，可改）**：CDISC 惯例红色——红字 + 红边框、无填充/浅填充，与 eCRF 黑色正文区分。

## Requirements

* aCRF 导出产出与 eCRF 同版式 Word，叠加浮动彩色矩形：每个字段标 `variable_name`，每张表单标 `domain`。
* 矩形为浮动层（`wp:anchor` 文本框），浮于字段右上方/表单标题旁，不挤动表格、不改列宽。
* 复用现有导出管线，`annotated` 开关贯通；禁止复制渲染逻辑。
* 覆盖所有承载字段的渲染路径，确保每个字段都获得矩形（不只普通行）。

## Technical Approach

* **服务层**：`export_project_to_word(..., annotated: bool = False)` 贯通至 `_add_forms_content` 与各行构建器。新增 `_add_oid_annotation_box(anchor_paragraph, text, *, color)`，复用 `_make_picture_float` 的 `wp:anchor` 脚手架，把 picture graphic 换成 DrawingML 文本框（`wps:wsp`/`wps:txbx`）。
* **覆盖面（关键风险点）**：字段经多条路径渲染，需逐一接入注释——`_add_unified_regular_row`、`_add_unified_full_row`、`_add_unified_inline_band`、`_add_log_row`、纵向选项、横向 `_build_form_table`/`_add_inline_table`；标签行/日志行按需取舍。
* **表单级**：`_add_forms_content` 各分支的 `_add_toc_heading(f"{idx}. {form.name}")` 处追加 `domain` 浮动矩形（domain 为空则跳过）。
* **路由**：`export.py::export_word` 请求体新增 `annotated` 布尔；文件名 `_aCRF.docx` 对 `_CRF.docx`。
* **前端**：`App.vue::onExportCommand('acrf')` 改为调用导出并传 `annotated: true`，下载名走 aCRF。

## Acceptance Criteria

* [ ] 「导出aCRF」生成真实 Word（非占位 toast），文件名含 aCRF。
* [ ] 每个字段右上方有红色 `variable_name` 浮动矩形；每张有 `domain` 的表单标题旁有 `domain` 矩形。
* [ ] 矩形为浮动层，未挤动表格版式；同页相邻字段矩形不互相重叠到不可读。
* [ ] `annotated=False`（导出eCRF）行为零回归：现有 parity / 列宽 / 版式测试全过。
* [ ] 新增后端测试：验证 aCRF 文档含 OID 文本且 domain 矩形存在；验证 eCRF 不含这些浮动注释。

## Definition of Done

* 后端单测覆盖注释渲染；eCRF parity 测试不回归。
* lint / pytest / 前端 node:test 通过。
* README / 模块 CLAUDE.md 同步导出能力描述。

## Out of Scope (explicit)

* 不新增表单 OID 数据库列（除非确认 `code`/`domain` 都不合适）。
* 不实现 CDISC Define.xml 导出。
* 不做浏览器内 aCRF 预览（仅 Word 导出）。

## Technical Notes

* 关键文件：`backend/src/services/export_service.py`、`backend/src/routers/export.py`、`frontend/src/App.vue`。
* parity 约束：`backend/src/services/word_table_parity.py` 比对预览 JSON 与导出 docx；注释层若进入正文文本需评估是否影响 parity 比对。
* 颜色经 `RGBColor.from_string`；可复用 `_set_run_font(run, color=...)`。

## Research Notes

### 相似工具/行业惯例（aCRF）
* CDISC aCRF 惯例：字段旁彩色变量名注释 + 表单顶部数据集/域名注释；颜色用于区分注释与 CRF 原文。
* 落地到 python-docx 的现实约束：浮动彩色框难做；行内彩色 run、独立列、注释行三类可稳定实现。

### Feasible approaches here
* **A 行内彩色文字（Recommended）**：字段标签后/下追加彩色 `[variable_name]`；表单标题后追加彩色表单 OID。版式扰动最小，最贴近 aCRF 观感。
* **B 独立注释列**：每张表右侧加一列放 OID。结构清晰但挤占列宽、影响既有列宽规划与 parity。
* **C 字段下注释行**：每个字段下插入细彩色行。零挤压横向宽度，但增加行高/页数。
* **D Word 批注/脚注**：零版式扰动，但打印态看不出「注释 CRF」，不符合交付惯例。
