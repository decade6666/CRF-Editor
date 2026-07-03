# aCRF 标注矩形：竖直位置可拖动、持久化、样式与导出统一（经双模型评审修订）

## Goal
aCRF 视图下 OID/domain 标注矩形当前遮盖字段标签、不可调整、预览（黑框白底黑字）与导出（红色系）不一致。目标：默认不遮挡、可拖动竖直调整并持久化到后端、导出 aCRF 按调整位置渲染、预览与导出样式一致（红色系）。**经 antigravity + codex 交叉评审后收窄范围并加固契约。**

## Requirements（修订版）
1. **默认不遮挡**：字段 OID 标注保持右对齐，默认竖直偏移调到清晰避开字段标签/取值区；按 normal field / inline header / form-domain **三类分别设默认 anchor**（避免 inline 4.6cm box 跨列压相邻 header）。
2. **可拖动（仅竖直）+ 持久化**：字段 OID 与表单 domain 标注可**上下拖动**（Phase 1 不做水平），位置持久化到后端。生效范围 = FormDesignerTab（画布 + 全屏）**和 VisitsTab word-page 预览**。
3. **导出跟随**：导出 aCRF 浮动矩形按持久化竖直偏移渲染，预览 Δy 与导出 `posOffset` 换算一致（同源）。
4. **样式统一**：预览对齐导出红色系，并把 **font-size / height / padding / border-width / box-width 估算**纳入前后端共享常量（避免"同色不同形"）。
5. **重置**：单个标注可重置回默认位置。

## Decisions（经评审确认）
- **存储**：`Form` 表新增单列 `annotation_positions`（Text/JSON，nullable）。结构 `{ "_form": {"y": Δ}, "<variable_name>": {"y": Δ}, ... }`，字段以 `variable_name` 为 key、表单 domain 以 `_form` 为 key。**绕过 `form_field` canonical rebuild 陷阱、clone/import 的 ID 重映射、legacy 多列 DDL**（评审 C3/C4/I2）。
- **坐标**：Phase 1 只持久化 `offset_y`，**固定右对齐**（不做水平 posOffset / box_width / 列宽换算）。竖直锚定到**字段段落顶（paragraph 级），与行高 override 解耦**；导出 `positionV posOffset = 默认 + Δy`（符号方向按 codex/antigravity 修正，contract 固定）。
- **单位与 clamp**：`offset_y` 存 `0.01cm` 整数（避免 float 抖动）；API 层与导出层**双重 clamp**（如 `[-2.0cm, +2.0cm]`），非有限值拒绝。
- **只读预览范围**：真正持久化的只读预览是 **VisitsTab 的 word-page**；**SimulatedCRFForm 维持只读、不参与拖动**（它只用于 DocxCompareDialog 的 Word 导入对比，输入为无 DB 目标的扁平临时数据）。TemplatePreviewDialog 不参与。
- **交互模式**：新增独立 `annotationMode`，**不复用** SimulatedCRFForm 的 `direct/ai` viewMode；VisitsTab 预览需接入 aCRF 标注显示。
- **契约变更声明**：本次**主动推翻** `.wp-acrf-annotation` 的 `pointer-events:none` non-interactive 契约，`acrfViewToggle.test.js` 与模块文档同步更新（评审 I1）。

## Acceptance Criteria
- [ ] aCRF 视图下 normal / inline / form-domain 三类标注默认均不遮盖字段标签/取值区。
- [ ] 字段 OID 与 domain 标注可上下拖动，松手后持久化（刷新/重开/重进项目仍在）。
- [ ] FormDesignerTab 与 VisitsTab 两处拖动写入同一 `Form.annotation_positions`，互相一致。
- [ ] 导出 aCRF 浮动矩形竖直位置 = 预览竖直位置（Δy↔posOffset 同源，符号正确）。
- [ ] 预览与导出样式一致（红框 `C00000` + 浅红底 `FFF2F2` + 红字 `C00000` + 共享 font/height/padding/border/width）。
- [ ] 单个标注可重置回默认位置。
- [ ] `offset_y` 越界被 clamp；非法值被拒绝，不进入 OOXML。
- [ ] 旧库 `Form` 无 `annotation_positions` 时回退默认；项目复制、`.db` 导入、**表单复制**（`forms.py::copy_form`）均携带该列。
- [ ] PATCH 后 `/api/forms/{id}/fields` 与 `/api/projects/{id}/forms` 缓存显式失效，无 30s stale。
- [ ] SimulatedCRFForm 仍只读，无 PATCH 副作用。

## Technical Approach（加固版）
- **后端**：
  1. `models/form.py` 加 `annotation_positions = Column(Text, nullable=True)`（**只动 Form，不动 FormField**）。
  2. `database.py` 对 `form` 表做单列轻量迁移（add-column，backfill NULL）；**无需**改 `_FORM_FIELD_CANONICAL_COLUMNS` / `_rebuild_form_field_table`。
  3. `schemas/form.py` 暴露读/写；写入做 JSON 结构与 clamp 校验（Pydantic）。
  4. `routers/forms.py`：新增/扩展 PATCH 保存 `annotation_positions`；`copy_form`（L280 构造 `Form(...)`）补 `annotation_positions=src.annotation_positions`。
  5. `export_service.py::_add_oid_annotation_box`：签名接收该字段/domain 的 `Δy`，`positionV posOffset = 默认 + Δy`（clamp）；字号/尺寸改用共享常量；`word_table_parity` 文本不变（保持严格一致）。
  6. `project_clone_service.py`（构造新 `Form` 处补透传）、`project_import_service.py`（`_patch_legacy_project_schema` / `_REQUIRED_COLUMNS` 对 `form.annotation_positions` 补列，避免旧库 select 崩）。DB 导出为整库备份，自动含新列。
- **前端**：
  1. 去掉 `.wp-acrf-annotation` 的 `pointer-events:none`（仅 aCRF + editMode + 有持久化目标时启用竖直拖动）；拖动逻辑参考 `useRowResize.js` 但持久化走 `useApi` PATCH（非 localStorage），带防抖合并提交。
  2. 默认 CSS：三类 anchor 分别设默认 `top`；样式改红色系并与导出共享几何常量。
  3. `VisitsTab.vue` word-page 预览接入 aCRF 标注渲染 + 竖直拖动（复用同一 `Form.annotation_positions`）。
  4. 重置操作把该 key 的 `y` 置默认并 PATCH。
  5. PATCH 成功后显式失效相关列表缓存。
- **共享常量（新增 cross-stack 契约）**：标注 box 的 `font_size / height / padding / border_width / width` 与 `offset_y` 单位、clamp 范围、posOffset 符号，写入 `.trellis/spec/guides/cross-stack-contracts.md`。

## Decision (ADR-lite)
- **Context**：评审发现原「FormField/Form 加双列 + 二维 Δcm」方案存在 form_field 重建静默丢列、clone/import/copy/legacy 多处透传遗漏、水平 posOffset 参照系错误、行高 trap 等风险。
- **Decision**：改为 `Form` 单 JSON 列存储；Phase 1 只做竖直偏移 + 固定右对齐；只读预览锁定 VisitsTab；共享几何常量统一样式；双重 clamp + 缓存失效。
- **Consequences**：改动面收敛（后端主要 Form/单迁移/单 PATCH/copy/clone/import 一列）；水平拖动与 CDISC 引线留作后续；VisitsTab 需新增 aCRF 标注渲染入口。

## Out of Scope
- **水平（x 方向）拖动**：Phase 2 待 anchor/box 几何/水平 posOffset 公式定清后再上。
- SimulatedCRFForm / DocxCompareDialog / TemplatePreviewDialog 的拖动持久化（可选只读展示红色矩形，作为 future follow-up）。
- CDISC 引线（leader line）/页边批注。
- 改动 eCRF 视图与非标注导出文本（保持 `word_table_parity` 严格一致）。

## Review Findings Incorporated（双模型评审）
- 评分：antigravity 65/100 REQUEST_CHANGES；codex 37/100 NEEDS_IMPROVEMENT。
- Critical：坐标 contract 不同源(→只做 offset_y + 段落锚 + 共享几何)、posOffset 符号(→默认+Δy)、form_field 重建陷阱(→改 Form JSON 列)、透传遗漏含 copy_form(→列入 checklist)、SimulatedCRFForm 目标错误(→改 VisitsTab)。
- Warning：行高 trap(→段落级竖直锚解耦)、缓存失效、样式同色不同形(→共享常量)、clamp/整数单位、inline 默认 anchor 分类、只读组件职责隔离、annotationMode 独立。
- Info：non-interactive 契约主动变更声明、JSON-on-Form 采纳。

## Implementation Plan（小 PR）
- **PR1（后端契约）**：`Form.annotation_positions` 列 + 单列迁移 + schema/clamp 校验 + PATCH 路由 + `copy_form`/clone/import 透传 + legacy schema 补列 + `_add_oid_annotation_box` 竖直 posOffset 映射与共享常量 + 后端测试（导出竖直位置 XML 断言、迁移回退、copy/clone/import 携带、clamp 拒绝）。
- **PR2（设计器前端）**：`FormDesignerTab.vue` 竖直拖动 + PATCH 持久化 + 防抖 + 缓存失效 + 红色样式/共享几何 + 三类默认 anchor + 重置；更新 `acrfViewToggle.test.js`（non-interactive→可拖）+ 新增拖动/样式/重置/缓存失效用例。
- **PR3（VisitsTab 预览 + 收尾）**：`VisitsTab.vue` aCRF 标注渲染 + 竖直拖动（复用同源存储）；文档同步（README/CLAUDE.md/index.json/cross-stack-contracts.md 新增标注几何契约）；`word_table_parity` 复核。

## Technical Notes
- 已验证事实：`SimulatedCRFForm` 仅用于 `DocxCompareDialog`（`viewMode` 为 `direct/ai`，扁平临时数据）；VisitsTab 预览在 `VisitsTab.vue:744` word-page；`forms.py::copy_form:280` 未复制注释；`database.py:19/867` 存在 `_FORM_FIELD_CANONICAL_COLUMNS` + `_rebuild_form_field_table`。
- 关键文件：`backend/src/models/form.py`、`backend/src/database.py`、`backend/src/schemas/form.py`、`backend/src/routers/forms.py`、`backend/src/services/export_service.py`（`_add_oid_annotation_box` L996-1090、常量 L230-232）、`project_clone_service.py`、`project_import_service.py`；`frontend/src/components/FormDesignerTab.vue`（渲染 L2597+、CSS L4613-4641）、`frontend/src/components/VisitsTab.vue`、`frontend/src/composables/useApi.js`、`useRowResize.js`（拖动参考）。
