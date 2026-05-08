---
change: word-export-format-fixes
type: proposal
status: draft
created: 2026-03-31
---

# Word 导出格式修复提案

## 背景

Word 导出文档存在 6 项格式/内容问题，需按参考文档对齐。

---

## 需求分析（增强后）

### 目标
修复 `export_service.py` 中 6 处导出格式缺陷，使导出文档与参考文档
`docs/XX项目-eCRF-V1.0-2026XXXX.docx` 一致。

### 技术约束
- 仅改动 `backend/src/services/export_service.py`（主修改文件）
- 无需改动 schema / 数据库 / 前端
- 兼容现有 python-docx API
- 不得破坏现有单元测试（`backend/tests/`）

### 范围边界
- **in-scope**：封面布局、访视分布图标题样式、表单一级标题样式、表格段落间距、log 行加粗、时间字段格式
- **out-of-scope**：前端预览样式、数据库结构、导入逻辑

---

## 6 项问题与约束集

### Issue 1 — 封面页重构

**当前**：3 行×2 列表格（trial_name / protocol+version / center+screening）

**参考文档结构**（`docs/XX项目-eCRF-V1.0-2026XXXX.docx` + 截图）：
```
[段落] XXXX临床试验         ← bold, center, 小二(18pt)
[段落] Draft CRF（建库用）  ← bold, center, 小四(12pt)
[段落] 版本号及日期：X.X/20XX-XX-XX  ← bold, center, 小四(12pt)
[空行]
[表格 2列×3行，无边框]
  方案编号 | {protocol_number}
  中心编号 | |__|__|
  筛选号   | S|__|__|...|
[空行]
[段落] 申办方：{sponsor}       ← bold, center
[段落] 数据管理单位：{dmu}     ← bold, center
```

**约束**：
- `Project` 已有 `trial_name`, `crf_version`, `crf_version_date`, `protocol_number`, `sponsor`, `data_management_unit` 字段
- 封面最后必须调用 `doc.add_page_break()`
- 不破坏 `_validate_output` 中 `len(doc.tables) >= 3` 的检查（封面表算 1 个）

### Issue 2 — 访视分布图标题：黑色、宋体

**当前**：`doc.add_heading("表单访视分布图", level=1)` — Heading 1 默认有主题色（蓝色）

**约束**：
- 在 `_apply_document_style` 中为 `Heading 1` 增加 `font.color.rgb = RGBColor(0, 0, 0)`
- 不改变现有字体（SimSun eastAsia 已设置）

### Issue 3 — 表单名称（一级标题）：黑色、宋体、四号

**当前**：Heading 1 为 `Pt(22)`，无显式黑色

**约束**：
- `_apply_document_style` 中将 Heading 1 `font.size` 从 `Pt(22)` 改为 `Pt(14)`（四号）
- 同时配合 Issue 2 设置黑色
- 两处 `doc.add_heading(…, level=1)` 均受益（访视分布图标题 + 表单名称）

### Issue 4 — 表格文字：段前段后 0.5 行，单倍行距

**当前**：`_add_field_row`、`_add_log_row`、`_add_label_row` 的单元格段落均未设置 spacing；`FormLabel` 样式的 `line_spacing = 1.5`（应为 1.0）

**约束**：
- 0.5 行 = `Pt(5.25)`（= 10.5pt 字号的一半），与 inline 表已有实现一致
- 需在以下位置追加段落格式：
  - `_add_field_row`：左单元格 `left_para` + 右单元格 `right_para`
  - `_add_log_row`：`para`（merged cell）
  - `_add_label_row`：`para`（merged cell，且 FormLabel 样式 line_spacing 改为 1.0）
- 不改动 inline 表（已正确）

### Issue 5 — "以下为log行" 文本加粗

**当前**：`_add_log_row` 调用 `self._set_run_font(run, size=Pt(10.5))` 无 `bold`

**约束**：
- 改为 `self._set_run_font(run, size=Pt(10.5), bold=True)`
- 仅改一行

### Issue 6 — 时间字段导出多秒

**当前**：`_render_field_control` 中 `"时间"` 类型硬编码 `"|__|__|时|__|__|分|__|__|秒"` 忽略 `date_format`

**前端对齐逻辑**（`useCRFRenderer.js:180`）：
```js
if (field.field_type === '时间') return renderDateFmt(field.date_format || 'HH:mm')
```
默认 `HH:mm`（不含秒）

**约束**：
- 对 `"时间"` 类型：检查 `field_def.date_format`；若含 `'ss'` 则追加秒，否则不含秒
- 对 `"日期时间"` 类型：同理，默认不含秒（`'yyyy-MM-dd HH:mm'`），仅当 format 含 `'ss'` 时追加秒
- `FieldDefinition.date_format` 字段已存在，无需数据库变更

---

## 发现的依赖与风险

| 依赖/风险 | 说明 |
|-----------|------|
| `_validate_output` 检查 `tables >= 3` | 封面重构后必须保留封面表（至少 1 张），不低于 3 张总数 |
| Heading 1 全局尺寸改为 14pt | 访视分布图标题也变成 14pt（可接受，参考文档中该标题约 12-14pt） |
| `FormLabel` 样式 line_spacing 修正 | 现有 label 类字段行距从 1.5→1.0，视觉变化明显但符合需求 |
| `date_format` 可能为 None | 须用 `or 'HH:mm'` 兜底，与前端一致 |

---

## 成功验收标准

1. **封面页**：导出文档首页包含试验名称（加粗居中）、"Draft CRF（建库用）"、版本号、3 行信息表、申办方、数据管理单位，无边框表格
2. **访视分布图标题**：`表单访视分布图` 文字为黑色（RGB 000000）+ 宋体
3. **表单名称标题**：每个表单名称为黑色、宋体、14pt
4. **表格间距**：所有普通表格单元格段前=段后=5.25pt，行距=单倍
5. **log行加粗**：`以下为log行`（或自定义 label）文字为粗体
6. **时间格式**：`date_format='HH:mm'` 的时间字段导出为 `|__|__|时|__|__|分`（无秒）；`date_format='HH:mm:ss'` 导出为含秒

---

## 影响范围

- **修改文件**：`backend/src/services/export_service.py`（唯一改动文件）
- **测试文件**：`backend/tests/test_export_service.py`（需同步验证 6 项）
- **行数估计**：约 40-60 行改动（含注释）
