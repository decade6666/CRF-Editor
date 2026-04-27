# Specs: Word 导出严格对齐参考文档

**Change ID**: strict-word-export-reference-template
**Version**: 1.0.0
**Status**: Planned
**Date**: 2026-03-30

---

## 1. 功能规格

### 1.1 导出文档结构规格

导出的 `.docx` 文件必须包含以下结构元素，顺序固定：

| # | 元素 | 内容来源 | 空数据行为 |
|---|------|----------|-----------|
| S1 | 封面页 | Project 字段 | 保留骨架，字段值留占位符 |
| S2 | 目录占位 | TOC field code | 始终输出 |
| S3 | 表单访视分布图 | Visit × Form 矩阵 | 无访视/表单时输出空表头骨架 |
| S4 | 正文表单（N 个） | Form + FormField + FieldDefinition | 无字段时输出仅含表头的空表骨架 |

### 1.2 封面页规格

- **封面信息表**: 2 列 × 3 行固定结构（与参考文档一致）
  - 行1: 试验名称（跨2列合并）→ `project.trial_name`
  - 行2: 方案编号 | 版本号 + 日期 → `project.protocol_number` | `project.crf_version`（`project.crf_version_date`）
  - 行3: 中心编号（空白输入框，非项目字段） | 筛选号（空白输入框，非项目字段）
- **数据来源**: `project.trial_name`, `project.protocol_number`, `project.crf_version`, `project.crf_version_date`
- **空值处理**: 使用 `[请在项目信息中设置XXX]` 占位符；中心编号/筛选号行固定为空白输入框

### 1.3 页眉页脚规格

- **页眉**: 每个 Section 的页眉均包含公司 Logo 图片（`docs/logo.png`）
  - Logo 位置: 左对齐
  - 尺寸: 高度 1.0cm，宽度按比例
  - 新增 Section 时必须复制页眉设置
- **页脚**: 包含页码字段（`PAGE` / `NUMPAGES`）
  - 格式: "第 X 页 / 共 Y 页"

### 1.4 目录规格

- TOC field code: `TOC \o "1-3" \h \z \u`
- 用户在 Word 中打开后手动刷新即可看到目录
- 始终输出，不依赖项目数据

### 1.5 访视分布图规格

- **表结构**: (len(forms) + 1) 行 × (len(visits) + 1) 列
- **表头行**: 第一列 "访视名称"，其余列为各访视名称
- **表头行底纹**: `#A5C9EB`
- **交叉点**: 有关联 → `×`（非序号），无关联 → 留空
- **排序**: 访视按 `visit.sequence` 升序，表单按 `form.order_index` 升序（无 order_index 时按 ID）
- **空数据**: 无访视时输出仅含 "访视名称" 表头的 1×1 骨架表

### 1.6 正文表单规格

#### 1.6.1 渲染模式：one-table-per-form

每个表单渲染为一张固定结构的表格，字段作为表格行：

```
┌──────────────────────────────────────┐
│  表单标题（序号. 表单名称）            │  ← 段落，非表格
├──────────┬───────────────────────────┤
│ 字段标签  │ 字段控件/值               │  ← 普通字段行
├──────────┼───────────────────────────┤
│ 字段标签  │ □选项1 □选项2 □选项3      │  ← 选择字段行
├──────────┴───────────────────────────┤
│ ██ 日志行标签（满宽合并）██           │  ← 日志行（跨列合并+底纹）
├──────────┬───────────────────────────┤
│ 字段标签  │ 字段控件                  │
└──────────┴───────────────────────────┘
```

- **列结构**: 2列（标签列 + 控件列），固定宽度 7.2cm + 7.4cm = 14.6cm（与参考文档比例对齐）
- **表单标题段落**: `doc.add_heading(f"{idx}. {form.name}", level=1)`，可出现在 TOC 中
- **单元格对齐**: 所有正文字段行使用 `WD_ALIGN_PARAGRAPH.JUSTIFY`（两端对齐）
- **标签行（FormLabel）**: 段落内 run 设置 `font.bold = True`
- **日志行**: 跨 2 列合并，底纹 `#D9D9D9`（或 `form_field.bg_color`）
- **标签字段**: 跨 2 列合并，无边框底纹
- **空表单**: 输出仅含表头行的空表骨架

#### 1.6.2 inline_mark 表格（横向表格）

- 连续 `inline_mark == 1` 的字段组合为多列表格
- 列数 > 4 时切换为 Landscape section
- 结构: 1 表头行 + N 数据行
- Landscape section 结束后恢复 Portrait

#### 1.6.3 表单排序

- 主排序: `form.order_index` 升序
- 次排序: `form.id` 升序（order_index 相同时）
- 表单内字段排序: `form_field.sort_order` 升序，次按 `form_field.id`

### 1.7 Section 拓扑规格

| Section | 方向 | 触发条件 |
|---------|------|----------|
| 初始 Section | Portrait | 封面+目录 |
| 访视分布图后 | Portrait（NEW_PAGE） | 分节符 |
| 宽 inline 表 | Landscape（NEW_PAGE） | inline_mark 列 > 4 |
| 宽表后恢复 | Portrait（NEW_PAGE） | 宽表结束 |
| 正文表单间 | 分页符（非分节符） | 表单间分隔 |

### 1.8 后置验证规格

导出完成后，在返回 token 之前执行：

1. **文件大小检查**: `os.path.getsize(tmp_path) > 0`
2. **有效性检查**: `Document(tmp_path)` 可正常打开
3. **内容检查**: 文档至少包含 3 个 table（封面表 + 访视图表 + 至少1张表单表）
4. 任一检查失败 → 删除临时文件 → 返回 HTTP 500

---

## 2. 约束决策记录

| 歧义 | 决策 | 依据 |
|------|------|------|
| A1 表格模式 | one-table-per-form（字段为行） | 参考文档结构 |
| A2 骨架拓扑 | 动态骨架：按项目数据生成，空数据保留骨架 | H3 约束 |
| A3 排序策略 | Form: `order_index` 升序，无值时按 ID；FormField: `sort_order` 升序 | 避免字母排序；两模型字段名不同 |
| A4 页脚内容 | 固定格式页码 | 参考文档标准 |
| A5 访视图标记 | "×" 标记 | 参考文档标准 |
| A6 后置验证 | 文件大小 + 有效 docx + 最少表数 | H8/H9 约束 |

---

## 3. PBT 属性

| # | 属性名 | 类别 | 不变量 | 伪造策略 |
|---|--------|------|--------|----------|
| P1 | 非空输出 | Bounds | ∀ valid project: file_size > 0 | 空项目、无访视、无表单、无字段 |
| P2 | 有效 docx | Invariant | ∀ output: Document(path) 不抛异常 | 各种数据组合 |
| P3 | 骨架最小表数 | Invariant | len(tables) ≥ 3（封面+访视图+至少1张表单骨架） | 空项目/空表单 |
| P4 | 表单-表格映射 | Invariant | ∀ non-inline form → 1 table | 0 字段表单 |
| P5 | 访视图维度 | Invariant | rows == forms+1, cols == visits+1 | 各种数量组合 |
| P6 | 排序一致性 | Monotonicity | table[i] 对应 form[i] by order_index | 乱序 order_index |
| P7 | Section 方向 | Invariant | wide inline → Landscape | >4列 inline |
| P8 | 幂等性 | Idempotency | 两次导出结构一致 | 同一项目连续导出 |
| P9 | 空数据骨架 | Invariant | empty form → table with ≥1 row | 删除所有字段 |
| P10 | 页眉 Logo | Invariant | ∀ section header has ≥1 image | 多 section |

---

## 4. 成功判据

- [ ] 导出不再产生 0 字节文件或无效 docx
- [ ] 导出文件可被 python-docx 正常读取
- [ ] 导出文件包含非空正文
- [ ] 封面信息表为固定 3×2 结构
- [ ] 访视分布图使用 "×" 标记而非序号
- [ ] 正文表单采用 one-table-per-form 模式
- [ ] 日志行跨列合并 + 底纹
- [ ] 宽 inline 表自动切换 Landscape section
- [ ] 空数据时保留骨架结构
- [ ] 后置验证拦截无效导出
- [ ] 所有 PBT 属性通过测试
