---
change: word-export-format-fixes
type: tasks
status: ready
created: 2026-03-31
---

# Tasks: Word 导出格式修复

## Phase 1: 封面页重构（Issue 1）

- [x] 1.1 在 `_add_cover_page` 方法之前新增私有辅助方法 `_add_cover_para(self, doc, text, size, *, bold=True)` — 创建居中段落、设置字号与加粗、调用 `_set_run_font`
- [x] 1.2 将 `_add_cover_page` 方法体完全重写：先添加 3 个段落（trial_name 18pt / "Draft CRF（建库用）" 12pt / "版本号及日期：{ver}/{date}" 12pt），再添加空行段落
- [x] 1.3 在 `_add_cover_page` 中添加 3行×2列无边框表格：row[0]="方案编号"|protocol_number, row[1]="中心编号"|"|__|__|", row[2]="筛选号"|"S|__|__|__|__|"；所有单元格 10pt 无加粗，调用 `_remove_cell_borders`
- [x] 1.4 在表格后添加空行段落，然后条件添加 sponsor 段落（仅非空时）和 dmu 段落（仅非空时），10.5pt bold center；最后 `doc.add_page_break()`

## Phase 2: Heading 1 样式修改（Issue 2+3）

- [x] 2.1 在 `_apply_document_style` 中将 `h1_style.font.size = Pt(22)` 改为 `Pt(14)`，并追加 `h1_style.font.color.rgb = RGBColor(0, 0, 0)`

## Phase 3: 段落间距修复（Issue 4）

- [x] 3.1 在 `_add_log_row` 的 `para.alignment = WD_ALIGN_PARAGRAPH.LEFT` 之前插入 3 行：`space_before=Pt(5.25)`, `space_after=Pt(5.25)`, `line_spacing=1.0`
- [x] 3.2 在 `_add_label_row` 的 `para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY` 之前插入同样 3 行间距代码
- [x] 3.3 在 `_add_field_row` 的 `left_para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY` 之前插入 3 行间距代码
- [x] 3.4 在 `_add_field_row` 的 `right_para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY` 之前插入 3 行间距代码
- [x] 3.5 在 `_apply_document_style` 中将 `FormLabel` 样式的 `line_spacing = 1.5` 改为 `1.0`

## Phase 4: Log 行加粗（Issue 5）

- [x] 4.1 在 `_add_log_row` 中将 `self._set_run_font(run, size=Pt(10.5))` 改为 `self._set_run_font(run, size=Pt(10.5), bold=True)`

## Phase 5: 时间字段格式修复（Issue 6）

- [x] 5.1 在 `_render_field_control` 中替换 `"日期时间"` 分支：读取 `(field_def.date_format or "").lower()`，若含 `"ss"` 返回含秒字符串，否则返回不含秒字符串
- [x] 5.2 在 `_render_field_control` 中替换 `"时间"` 分支：同上逻辑

## Phase 6: 测试同步

- [x] 6.1 修改 `test_export_project_renders_cover_table_with_three_rows_two_cols`：将封面表断言改为检查 cell(0,0)="方案编号"、cell(0,1)=protocol_number；增加段落文本断言验证 trial_name 和 crf_version

## Phase 7: 验证

- [x] 7.1 运行 `cd backend && python -m pytest tests/test_export_service.py tests/test_export_validation.py -v` — 全部通过
- [x] 7.2 确认 inline 表格相关测试（`test_export_project_groups_adjacent_inline_fields_into_one_table`）未被影响
- [x] 7.3 确认所有 hypothesis PBT 测试（P1/P2/P8/P9）通过
