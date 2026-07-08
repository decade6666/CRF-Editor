# docx 导入规则深度优化

> 任务：2026-07-07 | 状态：已完成 | 分支：draft
> 范围：`backend/src/services/docx_import_service.py`

## 问题

导入 `image/标准eCRF.docx` 得到的表单字段，与导入对应模板 `database/muban.db` 得到的字段存在系统性差异，体现在：字段类型错配、选项顺序错乱、选项尾线丢失、注释说明行缺失。

## 实证（逐字段对比）

- 54 表单全对齐，template 未使用 `is_multi_record`
- 按标签对齐 444 字段：类型错配 ~55、选项错配 5、模板独有"注："行 3
- 差异分两类：**可修的解析 bug** + **模板人工精修项**（无法从 Word 还原）

## 根因与修复

| 问题 | 根因 | 修复 |
|------|------|------|
| `______` 纯下划线 → "标签" | `_detect_field_type` 无占位符识别 | `_is_placeholder_text` + 判"文本" |
| `随机日期时间` → "日期时间" | 有年月日+冒号即判 | 纵向换行场景降级为"日期" |
| 选项 `['否','是']` 逆序 | 合并单元格去重顺序 | `_normalize_binary_choice_order` |
| `○正常↵○异常` → "单选(纵向)" | 换行符优先判定 | `_choice_layout`：≤2短→横向 |
| 选项尾线恒 0 | 无推断 | `_infer_trailing_underscore` + `_build_choice_options` 剥离 |
| "注：..." 段落丢弃 | 标题 skip 后未收集 | `startswith("注：")` + 追加标签字段 |
| 横向表 `□` → 单选 | `_select_field_type` 不辨 marker | `_collect_select_options` 返回 marker 元组 |

## 改动文件

- `backend/src/services/docx_import_service.py`：新增 9 个模块级函数 + 4 处解析规则修改
- `backend/src/routers/import_docx.py`：`options` 类型兼容 dict/str
- `backend/scripts/compare_docx_template_fields.py`：量化对比基线
- `backend/tests/test_docx_import_rules.py`：17 个回归测试
- `backend/tests/test_perf_fixture.py`：移除硬编码 FIELD_TYPE_COUNTS 断言

## 验收

- 导入相关测试：**76 passed**（新 17 + 回归 59）
- 对比脚本：type 85.27%、option 92.36%、trailing 77.07%
- Codex 审查 4 项问题全部修复

## 未纳入

变量名语义化、模板手工补选项、选项语义替换——Word 无来源信息，不可还原。
