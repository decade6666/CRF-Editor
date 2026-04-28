---
change: word-export-format-fixes-2
type: tasks
status: ready
created: 2026-03-31
---

# Tasks: Word 导出格式修复（第二轮）

## Phase 1: 封面页字号与格式修正（Issue 1）

- [x] 1.1 将 `_add_cover_para` 的 `size` 参数类型改为 `Optional[float]`，在方法体内当 `size is not None` 时才调用 `Pt(size)` 传给 `_set_run_font`
- [x] 1.2 在 `_add_cover_page` 中将 `"Draft CRF（建库用）"` 调用由 `size=12` 改为 `size=15`
- [x] 1.3 在 `_add_cover_page` 中将版本号及日期行调用由 `size=12` 改为 `size=None`（不设字号，继承样式）
- [x] 1.4 在 `_add_cover_page` 中将封面表格所有单元格的 `self._set_run_font(..., bold=False)` 改为 `bold=True`
- [x] 1.5 在 `_add_cover_page` 中将 `"筛选号"` 行的右侧值从 `"S|__|__|__|__|"` 改为 `"S|__|__||__|__|__|"`
- [x] 1.6 在 `_add_cover_page` 中将申办方和数据管理单位段落由 `size=10.5` 改为 `size=15`，并在每个 `_add_cover_para` 调用后设置该段落的 `space_before=Pt(7.8)` 和 `space_after=Pt(7.8)`（通过返回段落或在 `_add_cover_para` 中返回 para）

## Phase 2: 纵向单选/多选改用独立段落（Issue 2）

- [x] 2.1 在 `export_service.py` 中新增方法 `_render_vertical_choices(self, cell, field_def)`：使用 `cell.paragraphs[0]` 作为第一段，后续选项调用 `cell.add_paragraph()` 新建段，每段设 space_before=Pt(0)、space_after=Pt(0)、line_spacing=1.0、alignment=JUSTIFY；符号 run 使用宋体；不设整体段间距（由调用方处理首段 space_before 和末段 space_after）
- [x] 2.2 在 `_add_field_row` 中，对 `field_type in ["单选（纵向）", "多选（纵向）"]` 的分支，改为调用 `self._render_vertical_choices(right_cell, field_def)`；之后将 `right_para.paragraph_format.space_before = Pt(5.25)` 保留作用于第一段（right_para），并对 `right_cell.paragraphs[-1].paragraph_format.space_after = Pt(5.25)` 单独设置
- [x] 2.3 在 `_add_inline_table` 中，对 `field_type in ["单选（纵向）", "多选（纵向）"]` 的分支，改为调用 `self._render_vertical_choices(cell, field_def)`

## Phase 3: Heading 1 字体显式作用到 Run（Issue 3）

- [x] 3.1 在 `_add_forms_content` 的 `doc.add_heading(...)` 调用之后，获取返回的段落对象，遍历其 `runs`，对每个 run 调用 `self._set_run_font(run)`，确保 SimSun+Times New Roman 写入 Run 级 XML

## Phase 4: 合并表格字段与非表格字段（Issue 4）

- [x] 4.1 简化 `_group_form_fields`：删除对 `is_log_row`/`field_type in {"标签","日志行"}`/`not field_def` 的单独分组逻辑；仅对 `inline_mark==1` 做分组隔离，其余所有字段顺序追加到 `current_group`

## Phase 5: 测试同步与验证

- [x] 5.1 运行 `cd backend && python -m pytest tests/test_export_service.py tests/test_export_validation.py -v`，确认全部测试通过；如有测试因行为变更失败，同步修正断言（仅限测试本身错误；若是实现问题则修复实现）
