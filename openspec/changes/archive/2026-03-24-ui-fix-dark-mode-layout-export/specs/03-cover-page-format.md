# Spec 03 — Word 封面页格式对齐

## 目标

对齐 Word 导出封面页格式与参考文档 `docs/XX项目-eCRF-V1.0-2026XXXX.docx`。

---

## 前提条件

- `export_service.py` 的 `_add_cover_page()` 生成封面页内容
- `_apply_cover_page_table_style()` 设置封面信息表格样式
- 参考文档已由 Codex 验证，具体数值已确认

---

## 变更规格

### 3.1 修改 `_add_cover_page()` — 表格前空段行距

**位置**：`export_service.py` L134-135

**变更前**：
```python
# 添加一个换行符（空段落）
doc.add_paragraph()
```

**变更后**：
```python
# 表格前空段 — 1.5 倍行距（与参考文档对齐）
p_pre_table = doc.add_paragraph()
p_pre_table.paragraph_format.line_spacing = 1.5
```

---

### 3.2 修改 `_add_cover_page()` — 申办方段间距

**位置**：`export_service.py` L182-186

**变更前**：
```python
if project.sponsor:
    p = doc.add_paragraph()
    run = p.add_run(f"申办方：{project.sponsor}")
    self._set_run_font(run, size=Pt(15), bold=True)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
```

**变更后**：
```python
if project.sponsor:
    p = doc.add_paragraph()
    run = p.add_run(f"申办方：{project.sponsor}")
    self._set_run_font(run, size=Pt(15), bold=True)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(7.8)
    p.paragraph_format.space_after = Pt(7.8)
```

---

### 3.3 修改 `_add_cover_page()` — 数据管理单位段间距 + 后续空段

**位置**：`export_service.py` L190-195

**变更前**：
```python
if project.data_management_unit:
    p = doc.add_paragraph()
    run = p.add_run(f"数据管理单位：{project.data_management_unit}")
    self._set_run_font(run, size=Pt(15), bold=True)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    doc.add_paragraph()
```

**变更后**：
```python
if project.data_management_unit:
    p = doc.add_paragraph()
    run = p.add_run(f"数据管理单位：{project.data_management_unit}")
    self._set_run_font(run, size=Pt(15), bold=True)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(7.8)
    p.paragraph_format.space_after = Pt(7.8)
    # DMU 后空段 — 2.0 倍行距（与参考文档对齐）
    p_post_dmu = doc.add_paragraph()
    p_post_dmu.paragraph_format.line_spacing = 2.0
```

---

### 3.4 修改 `_add_cover_page()` — 分页段行距

**位置**：`export_service.py` L197-198

**变更前**：
```python
# 分页
doc.add_page_break()
```

**变更后**：
```python
# 分页 — 2.0 倍行距（与参考文档对齐）
p_break = doc.add_page_break()
p_break.paragraph_format.line_spacing = 2.0
```

---

### 3.5 修改 `_apply_cover_page_table_style()` — 表格宽度

**位置**：`export_service.py` L822-858

**变更前**：
```python
def _apply_cover_page_table_style(self, table):
    """封面信息表格专用样式：无边框、左对齐、表格宽度5cm"""
    ...
    # 设置列宽：第一列2cm，第二列3cm（总宽度5cm）
    if table.columns:
        table.columns[0].width = Cm(2)
        table.columns[1].width = Cm(3)

    for row in table.rows:
        if len(row.cells) >= 2:
            row.cells[0].width = Cm(2)
            row.cells[1].width = Cm(3)
```

**变更后**：
```python
def _apply_cover_page_table_style(self, table):
    """封面信息表格专用样式：无边框、居中对齐、表格宽度 46.9%（≈6.87cm）"""
    ...
    # 表格总宽：pct 2345 = 46.9% 页面可用宽度（≈6.87cm）
    existing_tblW = tblPr.find(qn('w:tblW'))
    if existing_tblW is not None:
        tblPr.remove(existing_tblW)
    tblW = OxmlElement('w:tblW')
    tblW.set(qn('w:type'), 'pct')
    tblW.set(qn('w:w'), '2345')
    tblPr.append(tblW)

    # 列宽：pct 单位（5000 = 100%）
    # 第一列：2335/5000 = 46.7%（≈3.21cm）
    # 第二列：2665/5000 = 53.3%（≈3.67cm）
    col_widths_pct = ['2335', '2665']
    for row in table.rows:
        for i, cell in enumerate(row.cells):
            if i < len(col_widths_pct):
                tcPr = cell._tc.get_or_add_tcPr()
                existing_tcW = tcPr.find(qn('w:tcW'))
                if existing_tcW is not None:
                    tcPr.remove(existing_tcW)
                tcW = OxmlElement('w:tcW')
                tcW.set(qn('w:type'), 'pct')
                tcW.set(qn('w:w'), col_widths_pct[i])
                tcPr.append(tcW)
```

**移除**：`table.columns[i].width = Cm(...)` 和 `row.cells[i].width = Cm(...)` 行。

---

### 3.6 不改动的位置

| 位置 | 当前值 | 原因 |
|------|--------|------|
| 表格后空段（L169-179） | `line_spacing=1.5` | Codex 验证与参考文档一致 |
| `table.alignment` | `WD_ALIGN_PARAGRAPH.CENTER` | 已与参考文档一致 |

---

## 约束

| ID | 类型 | 约束 |
|----|------|------|
| HC-6 | Hard | 封面表格总宽使用 pct 2345（≈6.87cm） |
| HC-7 | Hard | 申办方/DMU 段 space_before/after = 7.8pt |
| HC-8 | Hard | DMU 后空段和分页段 line_spacing = 2.0 |

---

## PBT 属性

| 属性 | 不变量 | 伪造策略 |
|------|--------|---------|
| 表格宽度一致性 | 导出 DOCX 中封面表格的 `w:tblW` 值为 `type=pct, w=2345` | 解析导出文件 XML → 断言 tblW 属性值 |
| 列宽比例 | 第一列 tcW=2335，第二列 tcW=2665 | 解析每行 cell 的 tcW → 断言值 |
| 段间距对称性 | 申办方和 DMU 段的 space_before 和 space_after 均为 7.8pt | 遍历封面页段落 → 断言段间距值 |
| 空字段安全 | sponsor/DMU 任一为空时，导出不报错且封面结构完整 | 随机置空 sponsor/DMU → 导出 → 断言 DOCX 可正常打开 |
| 行距正确性 | 表格前空段 1.5，表格后空段 1.5，DMU 后空段 2.0，分页段 2.0 | 解析封面页所有空段落 → 断言 line_spacing 值 |

---

## 验证条件

| ID | 条件 |
|----|------|
| SC-3.1 | 导出 Word → 封面表格宽度≈6.87cm（pct 46.9%） |
| SC-3.2 | 导出 Word → 申办方/DMU 段前后间距为 7.8pt |
| SC-3.3 | 导出 Word → DMU 后空段行距为 2.0 |
| SC-3.4 | 导出 Word → 整体封面版式与参考文档视觉对齐 |
| SC-3.5 | sponsor/DMU 任一为空时导出不报错 |

---

## 风险

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| python-docx `add_page_break()` 返回类型变更 | 低 | 当前版本返回 `Paragraph`，用 `hasattr` 防御 |
| 不同 Word 查看器对 pct 宽度渲染差异 | 低 | pct 是 OOXML 标准单位，主流查看器均支持 |
| sponsor/DMU 均为空时多余留白 | 低 | 空字段分支不生成段落，不产生多余空段 |
