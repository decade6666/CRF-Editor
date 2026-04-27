# Tasks: Word 导出严格对齐参考文档

**Change ID**: strict-word-export-reference-template
**Date**: 2026-03-30 | **Updated**: 2026-03-31

---

## Phase 1: 核心渲染重建

- [x] 1.1 重写 `_add_forms_content()` 为 one-table-per-form 模式（核心骨架）
  - `_group_form_fields()` 方法已实现，将字段分为普通组和 inline 组 ✓
  - `_build_form_table()` 方法已实现，普通字段组渲染为单张 2 列表格 ✓
  - `_add_field_row()` 方法已实现，单个字段渲染为表格行（标签列+控件列）✓
  - `_add_log_row()` 方法已实现，日志行跨 2 列合并 + 底纹 ✓
  - `_add_label_row()` 方法已实现，标签字段跨 2 列合并 ✓
  - `_add_inline_table()` 已保留现有逻辑 ✓
  - 空表单骨架（1行2列）已实现 ✓
  - 复用 `field_rendering.py` 的 `extract_default_lines()` 和 `build_inline_table_model()` ✓

- [x] 1.1.a 修改表单标题为 Heading 1 样式
  - 将 `doc.add_paragraph() + Pt(14) bold` 替换为 `doc.add_heading(f"{idx}. {form.name}", level=1)`
  - 目标：使表单名称出现在 TOC 目录中

- [x] 1.1.b 修改正文表格列宽为 7.2cm + 7.4cm
  - `_build_form_table()` 中：`Cm(2.5)` → `Cm(7.2)`，`Cm(12.16)` → `Cm(7.4)`
  - 依据：参考文档实测左列 7.2cm / 右列 7.4cm（约 50/50 比例）

- [x] 1.1.c 为字段行添加 JUSTIFY 两端对齐
  - `_add_field_row()` 中字段内容段落：`paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY`
  - 同步更新 `_add_label_row()` 的合并单元格段落对齐

- [x] 1.1.d FormLabel 行设置粗体
  - `_add_label_row()` 中：在 run 添加后设置 `run.font.bold = True`

- [x] 1.2 表单排序策略（实现已正确）
  - `_add_forms_content()` 已使用 `(form.order_index or 999999, form.id)` 排序 ✓
  - `_add_visit_flow_diagram()` 已同步使用 `order_index` 排序 ✓
  - 注：`Form.order_index` ≠ `FormField.sort_order`，两者字段名不同

- [x] 1.3 访视分布图标记
  - 交叉点有关联已改为填 `×` ✓
  - 空访视时已输出 1×1 骨架表（仅 "访视名称" 表头）✓

## Phase 2: 结构对齐

- [x] 2.1 重写 `_add_cover_page()` 为参考文档封面结构
  - 目标：2 列 × 3 行（参考文档实测结构）
  - 行1: 试验名称（跨2列合并）→ `project.trial_name`
  - 行2: 方案编号 `project.protocol_number` | 版本号+日期 `project.crf_version`（`project.crf_version_date`）
  - 行3: 中心编号（空白输入框） | 筛选号（空白输入框）
  - 空值使用占位符 `[请在项目信息中设置XXX]`

- [x] 2.2 页眉多 Section 复制
  - `_apply_header_to_section()` 方法已实现 ✓
  - 每次 `doc.add_section()` 后调用，确保新 Section 页眉包含 Logo ✓
  - Logo 文件缺失时静默跳过 ✓

- [x] 2.3 页脚页码
  - 页脚格式 "第 X 页 / 共 Y 页" 已实现 ✓
  - 使用 `PAGE` + `NUMPAGES` field code ✓

- [x] 2.4 消除 "暂无XX数据" 文本
  - `_add_visit_flow_diagram()`: 空访视已输出骨架表 ✓
  - `_add_forms_content()`: 空表单列表已保留骨架（无 "暂无表单" 段落）✓
  - 表单内空字段已输出空骨架表行 ✓

## Phase 3: 后置验证

- [x] 3.1 `_validate_output()` 静态方法
  - 检查1: `os.path.getsize(path) > 0` ✓
  - 检查2: `Document(path)` 可正常打开 ✓
  - 检查3: `len(doc.tables) >= 3`（封面+访视图+至少1张表单）✓
  - 返回 `(bool, str)` 元组 ✓

- [x] 3.2 `export.py` 路由层集成验证
  - `prepare_export()` 中已追加验证 ✓
  - 验证失败 → 删除临时文件 → HTTP 500 ✓

## Phase 4: 测试

- [x] 4.1 文档级结构测试（`test_export_service.py`）
  - table 数量 = 2 + len(forms) ✓
  - 封面表行列结构 ✓
  - 访视图维度 = (forms+1) × (visits+1) ✓
  - 访视图 "×" 标记 ✓

- [x] 4.2 空数据骨架测试
  - 空项目导出不产生 0 字节 ✓
  - 空表单（无字段）输出空骨架表 ✓
  - 无访视时访视图输出骨架 ✓

- [x] 4.3 排序一致性测试
  - order_index 排序生效 ✓
  - order_index 为 None 时按 ID 回退 ✓

- [x] 4.4 PBT 属性测试（需 `hypothesis` 库）
  - P1 非空输出: hypothesis 生成随机项目数据验证 `file_size > 0`
  - P2 有效 docx: 验证 `Document(path)` 不抛异常
  - P8 幂等性: 同一项目两次导出结构一致
  - P9 空数据骨架: 空表单仍有表骨架

- [x] 4.5 后置验证测试（`test_export_validation.py`）
  - 正常文件通过验证 ✓
  - 0 字节文件被拦截 ✓
  - 无效 docx 被拦截 ✓
  - prepare_export 返回 token + download_url + expires_in ✓
  - 跨用户下载鉴权（401/403/200）✓

- [x] 4.6 回归测试
  - 导入链路 skip_first_2_tables 假设不受影响 ✓
  - inline_mark 表格渲染不受影响 ✓
  - Landscape/Portrait section 切换正常 ✓

## Phase 5: 集成验证

- [x] 5.1 手动验证
  - 导出包含多访视、多表单、多字段的完整项目
  - 在 Word 中打开验证结构与参考文档对齐
  - 验证目录可手动刷新
  - 验证页眉 Logo 在所有页面可见

- [x] 5.2 空数据场景验证
  - 新建空项目导出
  - 仅有访视无表单的项目导出
  - 表单存在但无字段的项目导出
