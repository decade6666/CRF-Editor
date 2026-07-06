# 任务：PR1 后端契约（aCRF 标注竖直拖动持久化）

你是被委派的执行者。先完整阅读需求，再严格在下面的**文件范围**内实现。禁止改动前端与本 PR 范围外的文件。

## 必读
1. `.trellis/tasks/06-30-acrf-annotation-drag/prd.md`（完整需求与评审结论，务必读全）
2. `.trellis/spec/guides/cross-stack-contracts.md`（现有跨栈契约，§5 preview/export parity）

## 本 PR 范围（仅后端）
只允许修改/新增以下文件；不要碰任何 `frontend/` 文件，不要碰 `FormField` 相关的 canonical rebuild：
- `backend/src/models/form.py`
- `backend/src/database.py`
- `backend/src/schemas/form.py`
- `backend/src/routers/forms.py`
- `backend/src/services/export_service.py`
- `backend/src/services/project_clone_service.py`
- `backend/src/services/project_import_service.py`
- `backend/tests/`（新增/扩展测试）

## 必须实现（严格遵循 PRD 的 Decisions 与 Technical Approach 加固版）
1. `models/form.py`：新增 `annotation_positions = Column(Text, nullable=True)`。**只动 Form，不动 FormField**。
2. `database.py`：对 `form` 表做**单列**轻量迁移（add-column，backfill NULL）。**不要**修改 `_FORM_FIELD_CANONICAL_COLUMNS` / `_rebuild_form_field_table`。
3. `schemas/form.py`：暴露读/写 `annotation_positions`；写入用 Pydantic 校验 JSON 结构与 clamp：
   - 结构 `{ "_form": {"y": <int>}, "<variable_name>": {"y": <int>}, ... }`，表单 domain 用 `_form` key，字段用 `variable_name` 为 key。
   - `y` 单位为 `0.01cm` 的**整数**；clamp 到 `[-200, +200]`（即 ±2.0cm）；非有限/非整数值拒绝（422）。
4. `routers/forms.py`：新增/扩展 PATCH 保存 `annotation_positions`；`copy_form`（约 L280 构造 `Form(...)` 处）补 `annotation_positions=src.annotation_positions`。
5. `export_service.py::_add_oid_annotation_box`（约 L996-1090）：签名接收该字段/domain 的 `Δy`（0.01cm 整数），`positionV posOffset = 默认 + Δy`（导出层再做一次 clamp）；字号/尺寸改用共享常量（在文件常量区约 L230-232 定义 `ACRF_ANNOTATION_*`：font_size/height/padding/border_width/box_width）。**`word_table_parity` 比对的文本必须保持不变**（不要改标注文字内容与表格文本）。posOffset 符号方向：Δy 为正表示**向下**偏移（与预览 Δy 同源同向），contract 固定。
6. `project_clone_service.py`：构造新 `Form(...)` 处补透传 `annotation_positions`。
7. `project_import_service.py`：`_patch_legacy_project_schema` / `_REQUIRED_COLUMNS`（或等价旧库补列逻辑）对 `form.annotation_positions` 补列，避免旧库 select 崩溃。DB 导出为整库备份，自动含新列，无需额外处理。

## 必须新增/扩展测试（backend/tests/）
- 导出竖直位置 XML 断言：给定 Δy，`_add_oid_annotation_box` 产出的 OOXML `positionV`/`posOffset` = 默认 + Δy。
- 迁移回退：旧库 `form` 表无 `annotation_positions` 时能正常读取并回退默认（NULL）。
- 透传：`copy_form`、`project_clone`、`project_import` 后新 Form 携带 `annotation_positions`。
- clamp/拒绝：越界 `y` 被 clamp；非法值（非整数/非有限/结构错误）被 schema 拒绝，不进入 OOXML。
- 回归：`word_table_parity` 相关测试仍通过（文本严格一致）。

## 完成后自检
- 运行：`cd backend && python -m pytest -q`，确保全绿；若失败，修复到通过。
- 不要 `git add` / `git commit` / `git push`（由主控 Claude 审查 diff 后决定）。
- 结束时用**中文**输出：改了哪些文件、关键设计点、`annotation_positions` JSON 结构与 clamp 范围、posOffset 符号约定、测试结果（通过/失败数）、以及任何未决问题。
