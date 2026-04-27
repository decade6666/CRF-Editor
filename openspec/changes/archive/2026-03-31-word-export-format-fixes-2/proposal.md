---
change: word-export-format-fixes-2
type: proposal
---

# Word 导出格式修复（第二轮）

## Why

测试导出的 Word 文档与参考文档（`docs/XX项目-eCRF-V1.0-2026XXXX.docx`）存在以下格式差异：
1. 封面页字号、间距未完全对齐参考文档
2. 纵向单选/多选选项使用 `<w:br/>` 软换行，而非独立段落
3. 一级标题（Heading 1）字体设置未显式作用到 Run 级别
4. 含日志行（log row）的表单与普通字段被拆成两个 Word 表格，应合并为一个

## What Changes

- `export_service.py` — `_add_cover_page`、`_add_cover_para`、`_render_vertical_choices`（新增）、`_add_field_row`、`_add_inline_table`、`_group_form_fields`、`_add_forms_content`
