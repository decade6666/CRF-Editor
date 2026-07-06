# 修复 annotation_positions 字符串路径未 clamp 重序列化

## Goal
`preserve_annotation_positions_storage()` 的字符串分支 parse 后直接 `return value`，未走 canonical serializer，导致 copy_form / 项目克隆 / 项目 .db 导入把越界 `y` 值（如 `{"_form":{"y":999}}`）原样入库，库值(999) 与接口/导出值(200) 不一致，违反后端 CLAUDE.md 跨入口统一校验契约。

## 独立验证结论（codex + Claude 双源确认）
- **成立性：是**。`parse_annotation_positions()` 会经 `AnnotationPosition.clamp_y` clamp（form.py:18,51），但 `preserve_annotation_positions_storage()` 字符串分支把 clamp 结果丢掉、返回原串（form.py:82）。
- **调用链证据**：`copy_form()`（routers/forms.py:273）→ 该函数；`ProjectCloneService.clone_from_graph()`（project_clone_service.py:288）→ 该函数；项目 .db 导入经 `clone_from_graph()` 落库（project_import_service.py:241）。
- **读侧已安全**：`FormResponse` validator（form.py:135）与 `export_service._load_annotation_offsets`（export_service.py:1026,1044 `_clamp_annotation_delta_y`）会重新 parse+clamp，所以接口/导出看似正常，但库值仍脏。现有导出测试 test_export_acrf.py:513 印证读侧把 999 当 200。
- codex 跑 `pytest test_form_annotation_positions.py`：3 failed / 14 passed（失败属测试误用，见下方"关联测试 bug"，不影响本发现的运行时成立性）。

## Requirements
- `preserve_annotation_positions_storage()` 字符串分支改为 `return serialize_annotation_positions(value)`，与对象分支统一走 canonical 序列化（key 排序、去空格、clamp）。
- 不改模型层、不改 migration、不改 export 读侧（已安全）。

## Acceptance Criteria
- [ ] 字符串越界值 `{"_form":{"y":999}}` 经 `preserve_annotation_positions_storage()` 返回 `{"_form":{"y":200}}`（canonical JSON 文本）。
- [ ] copy_form / 项目克隆 / 项目 .db 导入落库后，DB 实际存储文本为 canonical 且 y 已 clamp。
- [ ] 空串 / null → None；非法 JSON / 非法保留 key 仍 fail closed（ValueError）。
- [ ] `test_form_annotation_positions.py` 3 条失败测试修正后转绿（见关联测试 bug）。

## Technical Approach
最小改动：字符串分支 `parse_annotation_positions(value)` 后 `return serialize_annotation_positions(value)`。无需抽新 helper，直接委托现有 serializer。

## 关联测试 bug（codex 额外发现，Claude 已复现确认）
`test_form_annotation_positions.py::_create_owned_form()` 调 router `create_form()`，而 `create_form` 返回 `list[FormResponse]`（Pydantic 响应对象，非 ORM `Form`）。测试对该返回对象执行 `form.annotation_positions = '...'` + `session.flush()` 实际未写库，导致：
- `test_project_clone_preserves_form_annotation_positions`（断言克隆保留 `{"y":18},{"y":-12}`，实际源库为空 → 失败）
- `test_copy_form_rejects_invalid_annotation_positions`（源库未写入非法值，copy 不触发 409 → DID NOT RAISE）
- `test_project_clone_rejects_invalid_form_annotation_positions`（同上 → DID NOT RAISE）

修复方向：helper 改为直接 seed ORM `Form` 行（`session.add(Form(...))`）或对真实 `Form` query 后赋值，不要复用 router 返回的响应模型。本任务修复代码后须同步修这 3 条测试，否则回归无效。

## Out of Scope
- `export_service.py` 读侧 clamp（已安全，不动）。
- 模板库导入缺列兼容（见 06-30-acrf-import-service-passthrough 任务）。
- 前端 VisitsTab sequence 丢失（见 06-30-acrf-visitstab-sequence-loss 任务）。

## Technical Notes
- 共享契约：后端 CLAUDE.md "form.annotation_positions 跨入口统一校验"。
- 关联提交：29a69d1。
- 受影响同步点：`schemas/form.py`、`routers/forms.py` copy、`project_clone_service.py`、`project_import_service.py`（经 clone）。
- canonicalization 副作用：key 排序 + 去空格，与现有 CRUD 写入语义对齐；`test_project_copy.py` 若按字节比较 DB 文本需改成语义/parse 比较。

## PR 归属与执行顺序
- 归属：**后端 PR**（含发现1 + 发现2 + 测试 helper 修正 + 旧模板缺列兼容）。
- 本任务为后端 PR 第一刀：①修 `schemas/form.py:82` 字符串分支重序列化；②修 `test_form_annotation_positions.py::_create_owned_form` helper 直接 seed ORM `Form`，让 3 条红测试反映真实行为；③补"字符串越界值经 copy/clone 规范化落库"回归。
- 后续：发现2 + 缺列兼容在同一后端 PR 内继续。
