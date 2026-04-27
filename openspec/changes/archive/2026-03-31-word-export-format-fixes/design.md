---
change: word-export-format-fixes
type: design
status: ready
created: 2026-03-31
---

# Design: Word 导出格式修复

## 修改范围

**唯一修改文件**：`backend/src/services/export_service.py`

**同步更新测试**：`backend/tests/test_export_service.py`（仅修复封面结构变化导致失效的 1 个测试）

**禁止修改**：`_validate_output`、`_add_inline_table`、数据库模型、前端代码

---

## Issue 1 — 封面页重构（`_add_cover_page` 全量重写）

### 空字段处理决策

| 字段 | 为 None/空字符串 时 | 来源 |
|------|-------------------|------|
| `trial_name` | 显示 `"[请设置试验名称]"` | 与旧实现一致 |
| `crf_version` | 使用 `"[版本号]"` | |
| `crf_version_date` | 使用 `"[日期]"` | |
| `protocol_number` | 右侧单元格为空字符串 `""` | 不显示占位符 |
| `sponsor` | **跳过该段落** | 不输出任何内容 |
| `data_management_unit` | **跳过该段落** | 不输出任何内容 |

### 新封面结构（严格顺序）

```
段落：{trial_name}          → 18pt, bold, center
段落："Draft CRF（建库用）"  → 12pt, bold, center
段落："版本号及日期：{ver}/{date}"  → 12pt, bold, center
段落：（空行）
表格：3行×2列，无边框
  row[0]: "方案编号" | {protocol_number or ""}
  row[1]: "中心编号" | "|__|__|"
  row[2]: "筛选号"   | "S|__|__|__|__|"
段落：（空行）
[仅当 sponsor 非空] 段落："申办方：{sponsor}"        → 10.5pt, bold, center
[仅当 dmu 非空]     段落："数据管理单位：{dmu}"     → 10.5pt, bold, center
doc.add_page_break()
```

### 版本号及日期格式

```python
ver = project.crf_version or "[版本号]"
date_str = (
    project.crf_version_date.strftime("%Y-%m-%d")
    if project.crf_version_date
    else "[日期]"
)
# 段落文本：
text = f"版本号及日期：{ver}/{date_str}"
```

### 封面辅助私有方法（新增）

```python
def _add_cover_para(self, doc: Document, text: str, size: float, *, bold: bool = True) -> None:
    """封面专用段落：居中，指定字号。"""
    para = doc.add_paragraph()
    run = para.add_run(text)
    self._set_run_font(run, size=Pt(size), bold=bold)
    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
```

### 封面表格单元格字体

- 左列（方案编号/中心编号/筛选号）：10pt，无加粗
- 右列（值/占位符）：10pt，无加粗
- 所有单元格调用 `self._remove_cell_borders(cell)` 移除边框

---

## Issue 2+3 — Heading 1 样式修改（`_apply_document_style`）

**当前代码（lines 743-747）**：
```python
if "Heading 1" in doc.styles:
    h1_style = doc.styles["Heading 1"]
    h1_style.font.size = Pt(22)
    h1_style.font.bold = True
    h1_style.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
```

**修改后**：
```python
if "Heading 1" in doc.styles:
    h1_style = doc.styles["Heading 1"]
    h1_style.font.size = Pt(14)                           # 四号字
    h1_style.font.bold = True
    h1_style.font.color.rgb = RGBColor(0, 0, 0)           # 显式黑色
    h1_style.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
```

**影响**：访视分布图标题 + 所有表单名称一级标题，同步变为 14pt 黑色。

---

## Issue 4 — 段落间距修复

### 统一插入代码片段（3行）

```python
para.paragraph_format.space_before = Pt(5.25)
para.paragraph_format.space_after = Pt(5.25)
para.paragraph_format.line_spacing = 1.0
```

`Pt(5.25)` = 0.5 行（10.5pt × 0.5），与 `_add_inline_table` 已有实现一致。

### 插入位置

| 方法 | 段落变量 | 插入位置（在哪行之前） |
|------|---------|----------------------|
| `_add_log_row` | `para` | `para.alignment = WD_ALIGN_PARAGRAPH.LEFT` 之前 |
| `_add_label_row` | `para` | `para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY` 之前 |
| `_add_field_row` | `left_para` | `left_para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY` 之前 |
| `_add_field_row` | `right_para` | `right_para.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY` 之前 |

### FormLabel 样式修复（`_apply_document_style`）

```python
# 当前（line 790）
label_style.paragraph_format.line_spacing = 1.5
# 改为
label_style.paragraph_format.line_spacing = 1.0
```

### 明确不改动

`_add_inline_table` 中 lines 553-555 已正确，**禁止修改**：
```python
para.paragraph_format.space_before = Pt(5.25)   # 已有
para.paragraph_format.space_after = Pt(5.25)    # 已有
para.paragraph_format.line_spacing = 1.0        # 已有
```

---

## Issue 5 — log 行加粗（`_add_log_row`）

**当前（line 455）**：
```python
self._set_run_font(run, size=Pt(10.5))
```

**改为**：
```python
self._set_run_font(run, size=Pt(10.5), bold=True)
```

---

## Issue 6 — 时间字段格式（`_render_field_control`）

### 替换逻辑

```python
elif field_type == "日期时间":
    fmt = (field_def.date_format or "").lower()
    if "ss" in fmt:
        return "|__|__|__|__|年|__|__|月|__|__|日  |__|__|时|__|__|分|__|__|秒"
    return "|__|__|__|__|年|__|__|月|__|__|日  |__|__|时|__|__|分"
elif field_type == "时间":
    fmt = (field_def.date_format or "").lower()
    if "ss" in fmt:
        return "|__|__|时|__|__|分|__|__|秒"
    return "|__|__|时|__|__|分"
```

### 规则说明

| 条件 | 结果 |
|------|------|
| `date_format` 为 None/空 | 不含秒（默认） |
| `date_format` 含 `'ss'`（大小写不敏感） | 含秒 |
| 其他非 None/空 格式 | 不含秒 |

与前端 `useCRFRenderer.js:180` 的 `renderDateFmt(field.date_format || 'HH:mm')` 逻辑一致。

---

## 测试文件同步（`test_export_service.py`）

### 需修改的测试（唯一 1 个）

`test_export_project_renders_cover_table_with_three_rows_two_cols`（lines 277-294）

**失败原因**：trial_name 从 table[0].cell(0,0) 移到段落；protocol_number 从 cell(1,0) 移到 cell(0,1)；crf_version 从 cell(1,1) 移到段落。

**新断言**：
```python
# trial_name 和 crf_version 出现在段落文本中
assert any("试验名称" in p.text for p in doc.paragraphs)
assert any("V1.0" in p.text for p in doc.paragraphs)
# 封面表结构：3行×2列
cover_table = doc.tables[0]
assert len(cover_table.rows) == 3
assert len(cover_table.columns) == 2
assert cover_table.cell(0, 0).text.strip() == "方案编号"
assert cover_table.cell(0, 1).text.strip() == "P-001"
assert cover_table.cell(1, 0).text.strip() == "中心编号"
assert cover_table.cell(2, 0).text.strip() == "筛选号"
```

### 不需修改的测试（已验证兼容）

| 测试 | 兼容理由 |
|------|---------|
| `test_export_project_preserves_skip_first_two_tables_import_assumption` | 封面表仍为 table[0]，访视表仍为 table[1] |
| `test_export_project_table_count_matches_cover_visit_and_forms` | 封面表仍计为 1 张，总数不变 |
| `test_export_no_forms_produces_3_tables` | 封面 1 + 访视 1 + 空骨架 1 ≥ 3 |
| 所有 hypothesis PBT 测试（P1/P2/P8/P9） | 结构约束（≥3 张表、幂等性）不变 |

---

## 行数估计

| 修改点 | 约行数 |
|--------|--------|
| `_add_cover_page` 重写 + `_add_cover_para` 新增 | 40–50 |
| `_apply_document_style` Heading 1 改色+改号 + FormLabel | 3 |
| `_add_log_row` spacing + bold | 4 |
| `_add_label_row` spacing | 3 |
| `_add_field_row` spacing ×2 | 6 |
| `_render_field_control` 时间/日期时间 | 8 |
| 测试修改（1 个测试函数） | 10–12 |
| **合计** | **~74–86** |
