---
change: word-export-format-fixes-2
type: design
---

# 设计文档：Word 导出格式修复（第二轮）

## Issue 1：封面页格式修正

对照参考文档（EMU 测量值）：

| 段落 | 当前 | 目标 |
|------|------|------|
| "Draft CRF（建库用）" | 12pt | **15pt** |
| 版本号及日期行 | 12pt | **不设字号**（继承样式） |
| 申办方 / 数据管理单位 | 10.5pt，无段间距 | **15pt**，space_before=Pt(7.8)，space_after=Pt(7.8) |
| 封面表格单元格 | bold=False | **bold=True** |
| 筛选号右侧值 | `"S\|__\|__\|__\|__\|"` | `"S\|__\|__\|\|__\|__\|__\|"` |

### 实现

- `_add_cover_para(size: Optional[float])` — 允许 `size=None`，此时不调用 `Pt()`
- `_add_cover_page` — 更新各行字号和表格 bold

## Issue 2：纵向选项独立段落

**当前行为**：`_render_choice_field` 对纵向字段调用 `paragraph.add_run().add_break()`（`<w:br/>`），结果在同一段落内换行。

**目标行为**：每个选项占据单元格内独立的 `<w:p>`（段落），通过 `cell.add_paragraph()` 实现。

### 实现

新增方法 `_render_vertical_choices(self, cell, field_def)`：
- 第一个选项使用 `cell.paragraphs[0]`（first_para）
- 后续选项 `cell.add_paragraph()`，设 space_before=0、space_after=0、line_spacing=1.0、alignment=JUSTIFY
- 最后一个选项保留 space_after 由调用方统一设置

在 `_add_field_row` 中，将 `单选（纵向）`/`多选（纵向）` 路由到 `_render_vertical_choices(right_cell, field_def)`；处理完后对 `right_cell` 第一段落设 space_before=Pt(5.25)，最后一段落设 space_after=Pt(5.25)。

在 `_add_inline_table` 中同理。

## Issue 3：Heading 1 字体显式作用到 Run

`_apply_document_style` 已在样式级别设置 SimSun+Times New Roman，但 `doc.add_heading()` 产生的 Run 可能受主题字体覆盖。

### 实现

在 `_add_forms_content` 中，获取 `add_heading()` 返回的段落，遍历 `runs`，对每个 run 调用 `self._set_run_font(run)`，确保字体显式写入 Run 的 XML。

## Issue 4：表格字段与非表格字段合并为同一表格

**根因**：`_group_form_fields` 将 `is_log_row=True`、`field_type="日志行"`、`field_type="标签"` 的字段单独分组，导致每组各产生一个 Word 表格。

**目标**：所有非 inline 字段应在同一分组（同一 Word 表格）中渲染。`_build_form_table` 已支持在同一表格内混渲 log_row/label/field。

### 实现

简化 `_group_form_fields`：仅对 `inline_mark==1` 字段进行分组隔离，其余所有字段顺序追加到 `current_group`。
