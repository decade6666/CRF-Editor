# Design: Word 导出严格对齐参考文档

**Change ID**: strict-word-export-reference-template
**Version**: 1.0.0
**Date**: 2026-03-30

---

## 1. 架构决策

### D1: 重建而非补丁

**决策**: 重写 `ExportService` 的核心渲染方法，而非在现有 one-table-per-field 上打补丁。

**理由**: 当前"一字段一表"布局与参考文档的"一表单一表"布局结构性不兼容，修补无法收敛。

**影响范围**: 仅 `backend/src/services/export_service.py`，不改变类接口。

### D2: 保持程序生成路线

**决策**: 继续从 `Document()` 程序化生成，不引入 docxtpl/mailmerge 模板引擎。

**理由**: H1 约束 + H6 约束（仅 python-docx）。

### D3: 排序策略统一

**决策**: `Form` 使用 `order_index` 字段排序，`FormField` 使用 `sort_order` 字段排序，均放弃 `name` 字母排序。

**注意**: `Form.order_index` 与 `FormField.sort_order` 字段名不同，实现时须区分。

**理由**: 字母排序导致文档章节顺序与业务逻辑不一致。

### D4: 后置验证防御层

**决策**: 在 `export.py` 路由层添加导出后验证，不依赖 `ExportService` 的返回值做唯一判断。

**理由**: H8（0 字节防御）+ H9（结构验证）。

---

## 2. 组件设计

### 2.1 修改文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `backend/src/services/export_service.py` | 重写核心方法 | 渲染骨架重建 |
| `backend/src/routers/export.py` | 增强 | 添加后置验证 |
| `backend/tests/test_export_*.py` | 新增 | 文档级结构测试 + PBT |

### 2.2 ExportService 方法重构

```
ExportService
├── export_project_to_word()          # 入口不变
│   ├── _apply_document_style()       # 保留
│   ├── _add_cover_page()             # 重写：固定 3×2 表结构
│   ├── _setup_header_footer()        # 增强：多 Section 页眉复制
│   ├── _add_toc_placeholder()        # 保留
│   ├── _add_visit_flow_diagram()     # 修改：× 标记 + order_index 排序
│   ├── _add_forms_content()          # 重写：one-table-per-form
│   │   ├── _build_form_table()       # 新增：单表单→单表格
│   │   ├── _add_field_row()          # 新增：字段→表格行
│   │   ├── _add_log_row()            # 新增：日志行（跨列合并）
│   │   └── _add_label_row()          # 新增：标签行（跨列合并）
│   └── _add_inline_table()           # 保留，微调
├── _apply_header_to_section()        # 新增：Section 页眉复制
├── _validate_output()                # 新增：后置验证（供路由层调用）
└── 辅助方法                          # 保留
```

### 2.3 核心渲染流程（one-table-per-form）

```python
def _add_forms_content(self, doc, project):
    """重写：每个表单渲染为一张表格"""
    forms = sorted(project.forms, key=lambda f: (f.order_index or 999999, f.id))

    for idx, form in enumerate(forms, start=1):
        # 表单标题段落
        self._add_form_heading(doc, idx, form)

        # 收集字段，按 sort_order 排序
        form_fields = sorted(form.form_fields, key=lambda ff: (ff.sort_order, ff.id))

        # 分组：普通字段行 vs inline_mark 块
        groups = self._group_form_fields(form_fields)

        for group in groups:
            if group.type == 'inline':
                # inline 表格保持现有逻辑
                is_wide = len(group.fields) > 4
                if is_wide:
                    self._switch_to_landscape(doc)
                self._add_inline_table(doc, group.fields, is_wide)
                if is_wide:
                    self._switch_to_portrait(doc)
            else:
                # 普通字段组 → 一张表格
                table = self._build_form_table(doc, group.fields)

        doc.add_page_break()
```

### 2.4 _build_form_table 设计

```python
def _build_form_table(self, doc, fields):
    """将一组字段渲染为单张表格，字段为行"""
    # 计算行数：每个字段一行（日志行/标签行跨列）
    row_count = len(fields)
    if row_count == 0:
        row_count = 1  # 空骨架至少一行

    table = doc.add_table(rows=row_count, cols=2)
    table.autofit = False
    table.columns[0].width = Cm(7.2)   # 参考文档左列宽（约50%）
    table.columns[1].width = Cm(7.4)   # 参考文档右列宽（约50%）
    self._apply_grid_table_style(table)

    for row_idx, form_field in enumerate(fields):
        if form_field.is_log_row or (form_field.field_definition and
                                      form_field.field_definition.field_type == "日志行"):
            self._add_log_row(table, row_idx, form_field)
        elif form_field.field_definition and form_field.field_definition.field_type == "标签":
            self._add_label_row(table, row_idx, form_field)
        else:
            self._add_field_row(table, row_idx, form_field)

    return table
```

### 2.5 日志行合并设计

```python
def _add_log_row(self, table, row_idx, form_field):
    """日志行：跨2列合并，带底纹"""
    cell_a = table.rows[row_idx].cells[0]
    cell_b = table.rows[row_idx].cells[1]
    cell_a.merge(cell_b)  # 跨列合并

    label = form_field.label_override or "以下为log行"
    para = cell_a.paragraphs[0]
    run = para.add_run(label)
    self._set_run_font(run, size=Pt(10.5))

    bg = form_field.bg_color or 'D9D9D9'
    self._apply_cell_shading(cell_a, bg)
```

### 2.6 访视分布图修改

```diff
- # 交叉点：有关联填序号
- cross_run = cross_para.add_run(str(sequence))
+ # 交叉点：有关联填 ×
+ cross_run = cross_para.add_run("×")
```

排序修改：
```diff
- sorted_forms = sorted(all_forms.values(), key=lambda f: f.name)
+ sorted_forms = sorted(all_forms.values(), key=lambda f: (f.order_index or 999999, f.id))
```

### 2.7 页眉多 Section 复制

```python
def _apply_header_to_section(self, section, logo_path):
    """为新 Section 设置页眉（包含 Logo）"""
    header = section.header
    header.is_linked_to_previous = False
    p = header.paragraphs[0] if header.paragraphs else header.add_paragraph()
    run = p.add_run()
    if Path(logo_path).exists():
        run.add_picture(logo_path, height=Cm(1.0))
```

### 2.8 后置验证设计

```python
# 在 export.py 的 prepare_export() 中，doc.save() 之后：
def _validate_export(tmp_path: str) -> bool:
    """验证导出文件有效性"""
    import os
    # 1. 文件大小
    if os.path.getsize(tmp_path) == 0:
        return False
    # 2. 有效 docx
    try:
        doc = Document(tmp_path)
    except Exception:
        return False
    # 3. 最少表数（封面 + 访视图 + 至少1张表单骨架 = 3）
    if len(doc.tables) < 3:
        return False
    return True
```

### 2.9 空数据骨架策略

| 场景 | 行为 |
|------|------|
| project.visits == [] | 访视图输出 1×1 表（仅 "访视名称" 表头） |
| project.forms == [] | 仍输出至少1个空表单骨架表（确保 len(tables) ≥ 3 通过后置验证） |
| form.form_fields == [] | 输出仅含标题的空表骨架（1行2列空表） |
| field_def == None | 跳过该字段行（不影响表骨架） |

### 2.10 封面页重设计（3行×2列）

```python
def _add_cover_page(self, doc, project):
    """封面表：2列×3行，与参考文档结构一致"""
    table = doc.add_table(rows=3, cols=2)
    # 行1：试验名称，跨2列合并
    row0 = table.rows[0]
    row0.cells[0].merge(row0.cells[1])
    trial_name = project.trial_name or "[请在项目信息中设置试验名称]"
    row0.cells[0].paragraphs[0].add_run(trial_name)
    # 行2：方案编号 | 版本号+日期
    table.cell(1, 0).text = f"方案编号：{project.protocol_number or '[方案编号]'}"
    ver = project.crf_version or "[版本号]"
    ver_date = project.crf_version_date.strftime("%Y-%m-%d") if project.crf_version_date else "[日期]"
    table.cell(1, 1).text = f"版本号：{ver}（{ver_date}）"
    # 行3：中心编号 | 筛选号（空白输入框，非项目字段）
    table.cell(2, 0).text = "中心编号：______________"
    table.cell(2, 1).text = "筛选号：______________"
```

### 2.11 表单标题 Heading 1

```python
def _add_form_heading(self, doc, idx: int, form):
    """表单标题使用 Heading 1 样式，使其出现在 TOC 中"""
    heading = doc.add_heading(f"{idx}. {form.name}", level=1)
    # 注：doc.add_heading() 自动应用 Heading 1 样式
    # 不额外设置字体大小，依赖样式定义保持与参考文档一致
    return heading
```

### 2.12 字段行对齐与 FormLabel 粗体

```python
def _add_field_row(self, table, row_idx, form_field):
    """字段行：两端对齐（JUSTIFY）"""
    # ...现有逻辑...
    for cell in row.cells:
        cell.paragraphs[0].paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

def _add_label_row(self, table, row_idx, form_field):
    """标签行（FormLabel）：跨2列合并，粗体"""
    # ...现有合并逻辑...
    run = para.add_run(label_text)
    run.font.bold = True  # FormLabel 粗体
```

---

## 3. 不变约束验证

### 3.1 导入兼容性

`docx_import_service.py` 假设前 2 张表为封面 + 访视图。本次重构：
- 封面表仍为第 1 张表 ✓
- 访视分布图仍为第 2 张表 ✓
- 正文表单从第 3 张表开始（one-table-per-form）

**结论**: 导入链路的 `skip_first_2_tables` 假设不受影响。

### 3.2 field_rendering.py 复用

- `extract_default_lines()`: 继续在 `_add_field_row()` 中使用 ✓
- `build_inline_table_model()`: 继续在 `_add_inline_table()` 中使用 ✓
- 不新增渲染语义，避免导入导出分叉

### 3.3 前端兼容性

- 前端仅触发 prepare + download，不感知文档结构 ✓
- 接口签名不变 ✓
- token 机制不变 ✓

---

## 4. 风险缓解

| 风险 | 缓解 |
|------|------|
| 重写范围过大导致回归 | 保持类接口不变，仅重写内部方法 |
| 合并单元格导致 docx 损坏 | PBT P2 属性验证每次输出有效性 |
| Form.order_index 字段为 None | 使用 `(f.order_index or 999999, f.id)` 双重排序 |
| Logo 文件缺失 | 检查 Path.exists()，缺失时跳过图片 |
| 导入链路假设破坏 | 验证前 2 表结构不变 |
