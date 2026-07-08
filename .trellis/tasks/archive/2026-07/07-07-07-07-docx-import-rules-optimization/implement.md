# 实现记录

> 任务：07-07-07-07-docx-import-rules-optimization | 状态：已完成

## 实现步骤

### 1. 实证分析（Phase 1 探索）
- 并行 3 个 Explore Agent：docx 导入链路、模板导入链路、字段模型 & 渲染依赖
- 逐字段对比 54 表单 444 字段，定位差异根因
- 量化：类型错配 ~55、选项错配 5、尾线 0%
- 根因分类：解析 bug（可修）vs 人工精修（不可还原）

### 2. Codex 实现（主逻辑）
- 文件：`backend/src/services/docx_import_service.py` (+210/-100)
- 新增 9 个模块级函数：`_is_placeholder_text`、`_choice_layout`、`_infer_trailing_underscore`、`_build_choice_options`、`_normalize_choice_metadata`、`_normalize_binary_choice_order`、`_choice_option_decode`、`_should_skip_note_paragraph`
- 选项契约变更：`List[str]` → `List[dict]`（含 decode + trailing_underscore），写库和预览双兼容
- 对比脚本 + 新测试文件

### 3. Codex + Antigravity 交叉审查
- Codex：2 Critical, 2 Warning, 1 Info
- Antigravity：API 401，按 fallback 规则跳过
- Claude 终审：4 项全部修复

### 4. 审查修复
- Critical 1：日期+时间单行 `HH:mm` 保留（仅纵向换行降级）
- Critical 2：横向表 `□` → `_collect_select_options` 返回 marker，`_select_field_type` 按 marker 分派单/多选
- Warning 1：`_build_choice_options` 尾线剥离 `rstrip("_＿")`
- Warning 2：`注：` 识别改 `startswith`，裸 `注：`/`注:` 保护保持不变

### 5. 测试验证
- 新增 6 个回归测试（12→17）
- 全量：导入相关 76 passed
- 对比脚本：type 85.27%、option 92.36%、trailing 77.07%

## 验证命令
```bash
cd backend && python3 -m pytest tests/test_docx_import_rules.py tests/test_docx_import_contract.py tests/test_ai_review_service.py tests/test_import_service.py tests/test_perf_fixture.py -q
# 76 passed

cd backend && python3 scripts/compare_docx_template_fields.py ../image/标准eCRF.docx ../database/muban.db
```
