---
change: word-export-format-fixes
type: spec
status: ready
created: 2026-03-31
---

# Spec: Word 导出格式修复 — 行为规格与 PBT 属性

## S-1 封面页结构

### 规格

| # | 断言 |
|---|------|
| S-1.1 | `doc.tables[0]` 为封面表，3行×2列 |
| S-1.2 | 封面表 `cell(0,0)` = `"方案编号"`，`cell(0,1)` = `project.protocol_number or ""` |
| S-1.3 | 封面表 `cell(1,0)` = `"中心编号"`，`cell(1,1)` = `"|__|__|"` |
| S-1.4 | 封面表 `cell(2,0)` = `"筛选号"`，`cell(2,1)` = `"S|__|__|__|__|"` |
| S-1.5 | 封面表所有单元格 **无边框**（`_remove_cell_borders` 已调用） |
| S-1.6 | `trial_name` 出现在文档段落文本中（非表格），字号 18pt，bold，center |
| S-1.7 | 文档段落中包含 `"Draft CRF（建库用）"` 文本，字号 12pt，bold，center |
| S-1.8 | 文档段落中包含 `"版本号及日期："` 前缀的文本，字号 12pt，bold，center |
| S-1.9 | 若 `sponsor` 非空 → 段落中包含 `"申办方："` 文本；若为空 → 无此段落 |
| S-1.10 | 若 `data_management_unit` 非空 → 段落中包含 `"数据管理单位："` 文本 |
| S-1.11 | 封面最后有 page break（`doc.add_page_break()` 已调用） |

### PBT 属性

**P-COVER-1 封面表恒为 3行×2列**：
```
∀ project : Project
  → doc.tables[0].rows == 3
  → doc.tables[0].columns == 2
```
**生成策略**：`trial_name ∈ {None, "", "X", 50字中文}`，`protocol_number ∈ {None, "", "P-001"}`
**反例生成**：若 rows ≠ 3 或 cols ≠ 2 → 失败

**P-COVER-2 sponsor/dmu 条件段落**：
```
∀ project : Project
  sponsor = None  → "申办方" ∉ paragraphs_text
  sponsor = "ABC" → "申办方：ABC" ∈ paragraphs_text
```
**生成策略**：`sponsor ∈ {None, "", "测试申办方"}`，`data_management_unit ∈ {None, "", "测试DMU"}`

---

## S-2 Heading 1 样式

### 规格

| # | 断言 |
|---|------|
| S-2.1 | `doc.styles["Heading 1"].font.size == Pt(14)` |
| S-2.2 | `doc.styles["Heading 1"].font.color.rgb == RGBColor(0, 0, 0)` |
| S-2.3 | `doc.styles["Heading 1"].font.bold == True` |
| S-2.4 | 所有 `doc.add_heading(…, level=1)` 生成的段落继承此样式 |

### PBT 属性

**P-H1-1 Heading 1 恒为 14pt 黑色**：
```
∀ doc : exported Document
  → doc.styles["Heading 1"].font.size == Pt(14)
  → doc.styles["Heading 1"].font.color.rgb == RGBColor(0, 0, 0)
```
**反例生成**：若 size ≠ Pt(14) 或 color ≠ 黑色 → 失败

---

## S-3 段落间距

### 规格

| # | 断言 | 适用方法 |
|---|------|---------|
| S-3.1 | `para.paragraph_format.space_before == Pt(5.25)` | `_add_log_row` |
| S-3.2 | `para.paragraph_format.space_after == Pt(5.25)` | `_add_log_row` |
| S-3.3 | `para.paragraph_format.line_spacing == 1.0` | `_add_log_row` |
| S-3.4 | 同上 3 条 | `_add_label_row` |
| S-3.5 | `left_para` + `right_para` 同上 3 条 | `_add_field_row` |
| S-3.6 | `FormLabel` 样式 `line_spacing == 1.0`（非 1.5） | `_apply_document_style` |

### PBT 属性

**P-SPACING-1 非 inline 表格段落间距统一**：
```
∀ form_field ∈ project.forms.fields
  if field_type ∉ inline_group:
    → cell_para.space_before == Pt(5.25)
    → cell_para.space_after == Pt(5.25)
    → cell_para.line_spacing == 1.0
```
**生成策略**：生成 1-4 个含不同字段类型（文本/标签/日志行）的表单
**反例生成**：检查每个非 inline 字段的表格单元格段落格式

**P-SPACING-2 FormLabel 行距恒为 1.0**：
```
∀ doc : exported Document
  → doc.styles["FormLabel"].paragraph_format.line_spacing == 1.0
```

---

## S-4 Log 行加粗

### 规格

| # | 断言 |
|---|------|
| S-4.1 | `_add_log_row` 中 `run.font.bold == True` |
| S-4.2 | log 行文本为 `form_field.label_override or "以下为log行"` |

### PBT 属性

**P-LOG-1 日志行文字恒加粗**：
```
∀ form_field where field_type == "日志行"
  → log_row_run.bold == True
```

---

## S-5 时间字段格式

### 规格

| # | 条件 | 期望输出 |
|---|------|---------|
| S-5.1 | `field_type="时间"`, `date_format=None` | `"丨__丨__丨时丨__丨__丨分"` |
| S-5.2 | `field_type="时间"`, `date_format="HH:mm"` | `"丨__丨__丨时丨__丨__丨分"` |
| S-5.3 | `field_type="时间"`, `date_format="HH:mm:ss"` | `"丨__丨__丨时丨__丨__丨分丨__丨__丨秒"` |
| S-5.4 | `field_type="日期时间"`, `date_format=None` | `"…日  丨__丨__丨时丨__丨__丨分"` |
| S-5.5 | `field_type="日期时间"`, `date_format="yyyy-MM-dd HH:mm"` | `"…日  丨__丨__丨时丨__丨__丨分"` |
| S-5.6 | `field_type="日期时间"`, `date_format="yyyy-MM-dd HH:mm:ss"` | `"…日  丨__丨__丨时丨__丨__丨分丨__丨__丨秒"` |
| S-5.7 | `field_type="时间"`, `date_format="HH:MM:SS"` (大写) | 含秒（`.lower()` 后 `"ss" in fmt`） |

### PBT 属性

**P-TIME-1 时间字段默认无秒**：
```
∀ field_def where field_type == "时间" and (date_format is None or "ss" not in date_format.lower())
  → "秒" ∉ render_output
```
**生成策略**：`date_format ∈ {None, "", "HH:mm", "hh:mm", "HH:MM"}`

**P-TIME-2 时间字段显式含秒**：
```
∀ field_def where field_type == "时间" and "ss" in (date_format or "").lower()
  → "秒" ∈ render_output
```
**生成策略**：`date_format ∈ {"HH:mm:ss", "hh:mm:SS", "HH:MM:SS"}`

**P-TIME-3 日期时间字段同理**：
```
∀ field_def where field_type == "日期时间"
  → same ss-checking logic as P-TIME-1/2
```

---

## S-6 不变量保护（回归守卫）

### 规格

| # | 断言 | 说明 |
|---|------|------|
| S-6.1 | `len(doc.tables) >= 3` | `_validate_output` 不变 |
| S-6.2 | `doc.tables[0]` 为封面表 | table 索引约定不变 |
| S-6.3 | `doc.tables[1].cell(0,0).text == "访视名称"` | 访视流程表结构不变 |
| S-6.4 | `doc.tables[2+]` 为表单内容 | 表单表从 index 2 开始 |
| S-6.5 | inline 表格段落间距不变（Pt(5.25), 1.0） | `_add_inline_table` 禁止修改 |

### PBT 属性

**P-STRUCT-1 表格总数 = 2 + form_count（已有，不变）**：
```
∀ project with n forms (n >= 0)
  → len(doc.tables) == 2 + max(n, 1)
```

**P-STRUCT-2 双次导出表格结构一致（幂等性，已有 P8）**：
```
∀ project
  → export(project).tables.count == export(project).tables.count
```
