# 补 import_service 跨项目表单模板导入透传 annotation_positions

## Goal
模板库导入（`import_service.py`）构造 `Form(...)` 时漏透传 `annotation_positions`，导致模板导入后标注位置丢回默认（字段 nullable，不崩）。与已覆盖的整库导入（`project_import_service.py` 复用 clone 逻辑）是不同链路。

## 独立验证结论（codex + Claude 双源确认）
- **成立性：是，且原修复方案不够**。codex 发现这条路径不是"值没规范化"而是"字段直接丢了"：
  - `TemplateFormSnapshot` 根本没有 `annotation_positions` 字段（import_service.py:35）
  - 构造 snapshot 没带（import_service.py:476）
  - 旧模板 raw SQL 路径没查该列（import_service.py:515）
  - 最终 `Form(...)` 没写入（import_service.py:680）
- **额外兼容性缺口（codex 发现）**：若模板库有 `paper_orientation` 列但缺 `annotation_positions` 列，`_load_template_forms()` 的 `select(Form)` 会直接 `OperationalError: no such column: form.annotation_positions`（import_service.py:460,500，与现有只探测 `paper_orientation` 的实现一致）。2026-05 至 2026-06 之间生成的旧模板库可能直接不可导入。

## Requirements
- `TemplateFormSnapshot` 增加 `annotation_positions` 字段。
- snapshot 构造、raw SQL fallback、`Form(...)` 构造三处同步带上传入值。
- 落库前走 `preserve_annotation_positions_storage()` 做统一校验+规范化（依赖 06-30-acrf-annotation-str-canonicalize 修复后的字符串分支）。
- 缺 `annotation_positions` 列的旧模板库仍可只读导入，结果回退为 `None`（参照 `paper_orientation` 的只读探测/raw SQL fallback 模式），**禁止为导入而修改源模板库**（模板库路径只读）。

## Acceptance Criteria
- [ ] 模板导入保留合法 `annotation_positions`，落库为 canonical 文本。
- [ ] 模板导入遇非法 JSON / 非法保留 key 时 fail closed（不静默接受）。
- [ ] 缺 `annotation_positions` 列的旧模板仍可只读导入，结果为 `None`，不报 OperationalError。
- [ ] `test_import_service.py` 增加以上三类回归。

## Technical Approach
1. `TemplateFormSnapshot` 加 `annotation_positions: Optional[str] = None`。
2. `_build_template_form_snapshot()` / raw SQL fallback 同步读取该列（缺列时回退 None）。
3. `Form(...)` 构造加 `annotation_positions=preserve_annotation_positions_storage(sf.annotation_positions)`。
4. 旧模板缺列探测：复用 `paper_orientation` 的只读探测模式扩展到 `annotation_positions`，或 raw SQL 显式列名查询。

## 依赖
- 依赖 06-30-acrf-annotation-str-canonicalize 先修字符串分支，否则模板导入会把字符串越界值原样复制落库。

## Out of Scope
- 整库 `project_import_service.py`（已复用 clone，已覆盖）。
- 前端 VisitsTab sequence 丢失。

## Technical Notes
- 同步点：`import_service.py` 的 `TemplateFormSnapshot`、`_build_template_form_snapshot()`、`_load_template_forms()`、`_do_import()`、`_TEMPLATE_REQUIRED_COLUMNS`（import_service.py:95）。
- 关联提交：29a69d1。
- 安全约束：模板库 `template_path` 只读，禁止 ALTER/迁移源库。

## PR 归属与执行顺序
- 归属：**同一后端 PR**（与发现1同 PR）。
- 依赖：发现1 先修 `preserve_annotation_positions_storage` 字符串分支，否则模板导入会把字符串越界值原样复制落库。
- 执行顺序：发现1 → 测试 helper 修正 → 发现2 + 旧模板缺列兼容。
