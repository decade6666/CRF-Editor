# Tasks: ui-fix-dark-mode-layout-export

> R1/R2/R3 无交叉依赖，可并行执行。

- [x] 1.1 在 `frontend/src/styles/main.css` 的 `html[data-theme="dark"]` 块（L226）之后追加 `html[data-theme="dark"] .word-page` 规则：`background: var(--color-bg-card); color: var(--color-text-primary);`
- [x] 1.2 追加 `html[data-theme="dark"] .word-page td` 规则：`border-color: var(--color-border);`
- [x] 1.3 追加 `html[data-theme="dark"] .word-page .wp-ctrl` 规则：`color: var(--color-text-primary);`
- [x] 1.4 追加 `html[data-theme="dark"] .word-page .wp-inline-header` 规则：`background: var(--color-bg-hover); color: var(--color-text-primary);`
- [x] 1.5 追加 `html[data-theme="dark"] .word-page .wp-empty` 规则：`color: var(--color-text-muted);`
- [x] 1.6 验证：切换暗色模式 → FormDesignerTab 预览面板背景变为深色纸张，表格边框/文字/标题可读（SC-1.1 ~ SC-1.6）
- [x] 2.1 在 `frontend/src/components/ProjectInfoTab.vue` 模板区，将 L57 `<el-form-item label="试验名称"><el-input v-model="form.trial_name" /></el-form-item>` 移至 L58 `<el-divider>封面页信息</el-divider>` 之后、`<el-form-item label="CRF版本">` 之前
- [x] 2.2 验证：ProjectInfoTab → "试验名称"出现在"封面页信息"下方第一行；修改后保存 HTTP 200（SC-2.1 ~ SC-2.3）
- [x] 3.1 在 `backend/src/services/export_service.py` `_add_cover_page()` 中将 L135 `doc.add_paragraph()` 替换为 `p_pre_table = doc.add_paragraph()` 并添加 `p_pre_table.paragraph_format.line_spacing = 1.5`
- [x] 3.2 在申办方段（L182-186）添加 `p.paragraph_format.space_before = Pt(7.8)` 和 `p.paragraph_format.space_after = Pt(7.8)`
- [x] 3.3 在 DMU 段（L190-194）添加 `p.paragraph_format.space_before = Pt(7.8)` 和 `p.paragraph_format.space_after = Pt(7.8)`
- [x] 3.4 将 DMU 后的 `doc.add_paragraph()`（L195）替换为 `p_post_dmu = doc.add_paragraph()` 并添加 `p_post_dmu.paragraph_format.line_spacing = 2.0`
- [x] 3.5 将 `doc.add_page_break()`（L198）替换为 `p_break = doc.add_page_break()` 并添加 `p_break.paragraph_format.line_spacing = 2.0`
- [x] 3.6 在 `_apply_cover_page_table_style()` 中移除 `table.columns[i].width = Cm(...)` 和 `row.cells[i].width = Cm(...)` 行，替换为 XML pct 方式：`w:tblW type=pct w=2345`，第一列 `w:tcW type=pct w=2335`，第二列 `w:tcW type=pct w=2665`
- [x] 3.7 更新 `_apply_cover_page_table_style()` 的 docstring：将"无边框、左对齐、表格宽度5cm"改为"无边框、居中对齐、表格宽度 46.9%（≈6.87cm）"
- [x] 3.8 验证：导出 Word → 封面页表格宽度、段间距、行距与参考文档视觉对齐；sponsor/DMU 为空时导出不报错（SC-3.1 ~ SC-3.5）
