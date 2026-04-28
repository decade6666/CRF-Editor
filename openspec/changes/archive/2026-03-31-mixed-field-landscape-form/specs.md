# Specs: 混合字段横向表单统一渲染

## 1. 触发条件

表单同时满足以下三个条件时进入 **unified landscape** 渲染模式：

1. 存在至少一个 `inline_mark=1` 的字段（has_inline）
2. 存在至少一个 `inline_mark=0` 的字段（has_regular）
3. `max_block_width > 4`（max_block_width = 最大连续 inline block 的字段数）

不满足以上条件的表单继续走现有渲染路径（纯 normal / 纯 inline / mixed 且 max_block_width ≤ 4）。

## 2. 统一表格结构

### 2.1 列数 N

```
N = max(len(block) for block in contiguous_inline_blocks)
```

- `contiguous_inline_blocks`：按 `sort_order` 扫描字段流，收集连续 `inline_mark=1` 字段形成的每个 block
- 如果表单中存在多个分离的 inline block，N 取最宽的那个

### 2.2 列宽

- 横向页面可用宽度：`Cm(23.36)`（A4 横向减去左右页边距）
- 宽 block（字段数 = N）：每列宽度 = `total_width / N`
- 窄 block（字段数 M < N）：每列宽度 = `total_width / M`，均匀拉伸填满表格宽度
- 普通字段行 / 全宽行：继承表格 N 列等分 grid，通过 merge 实现视觉宽度

### 2.3 行类型

按 `sort_order` 顺序扫描表单字段流，生成以下 segment 类型：

| Segment 类型 | 来源 | 表格行为 |
|--------------|------|----------|
| `regular_field` | `inline_mark=0` 且非标签/日志 | 1 行：左 merge label_span 列显示标签，右 merge value_span 列显示值 |
| `full_row` | 标签字段 (`field_type='label'`) 或日志行 | 1 行：merge 全部 N 列为单个单元格 |
| `inline_block` | 连续 `inline_mark=1` 字段 | 1 行表头 + K 行数据（K = `max(data_rows)` 或 `log_line_count`） |

### 2.4 普通字段合并公式

```python
label_span = clamp(round(N * 0.4), 1, N - 1)
value_span = N - label_span
```

| N | label_span | value_span |
|---|-----------|-----------|
| 5 | 2 | 3 |
| 6 | 2 | 4 |
| 7 | 3 | 4 |
| 8 | 3 | 5 |
| 10 | 4 | 6 |

### 2.5 窄 inline block 处理

当 inline block 字段数 M < N 时：
- 该 block 的 header 行和 data 行仍然只有 M 个物理列
- 每列宽度 = `total_width / M`（均匀拉伸填满）
- 不做 trailing merge，不留空白列

> **实现约束**：这意味着窄 block 行与宽 block 行的物理列数不同。在 python-docx 中，同一 `<w:tbl>` 的所有行必须基于相同 `<w:tblGrid>`。因此窄 block 行仍建立 N 列 grid，但通过 merge 使其视觉上表现为 M 列等分。具体做法：将 N 列按 M 等分区间合并，每个区间 `floor(N/M)` 或 `ceil(N/M)` 列。

## 3. 页面方向与分节符

### 3.1 进入 landscape

1. 在写表单 heading **之前**，调用 `doc.add_section(WD_SECTION.NEW_PAGE)`
2. 设置新 section 的页面尺寸为 `Cm(29.7) × Cm(21)`（横向）
3. 设置方向为 `WD_ORIENT.LANDSCAPE`
4. 复制 header/footer 设置

### 3.2 写入内容

在 landscape section 内依次写入：
1. 表单标题 heading
2. 统一表格

### 3.3 恢复 portrait

1. 表格写完后，调用 `doc.add_section(WD_SECTION.NEW_PAGE)`
2. 恢复 `Cm(21) × Cm(29.7)`、`WD_ORIENT.PORTRAIT`
3. **不再额外追加 `doc.add_page_break()`**，避免空白页

### 3.4 非 unified 表单

保留现有的分页逻辑，不做变更。但建议将现有 inline-landscape 的 section 切换也上移到 form 级（修复标题与表格分离的潜在问题）。

## 4. 单元格渲染顺序

对统一表格中的每一行，严格按以下顺序操作：

1. **创建行** — `table.add_row()` 获得 N 个 cells
2. **合并单元格** — 按行类型执行 `cell_a.merge(cell_b)`
3. **写入内容** — 在 surviving cell 中写入文字/段落
4. **应用样式** — 字体（`_set_run_font`）、底纹（`_apply_cell_shading`）、段落间距
5. **应用边框** — 统一使用 `_apply_grid_table_style`

## 5. 回归保护

以下场景的导出行为**必须不变**：

| 场景 | 预期行为 |
|------|----------|
| 纯 normal 表单 | 2 列表格，portrait |
| 纯 inline 表单 (≤4 列) | inline 表格，portrait |
| 纯 inline 表单 (>4 列) | inline 表格，landscape（建议顺带修复标题错页） |
| mixed + max_block_width ≤ 4 | split-table（normal 表 + inline 表），portrait |

## 6. 前端预览

### 6.1 renderGroups 扩展

当触发条件满足时，`renderGroups` 计算属性返回单个 group：
```javascript
{ type: 'unified', fields: [...all fields by sort_order], colCount: N }
```

### 6.2 HTML 表格结构

- 普通字段行：`<tr><td colspan={label_span}>标签</td><td colspan={value_span}>值</td></tr>`
- 全宽行：`<tr><td colspan={N}>内容</td></tr>`
- inline block 表头：`<tr><th colspan=1>...</th> × M</tr>`（M < N 时用 colspan 拉伸）
- inline block 数据：对应的 `<td>` 行

### 6.3 needsLandscape 更新

```javascript
const needsLandscape = computed(() => {
  return renderGroups.value.some(g =>
    (g.type === 'inline' && g.fields.length > 4) ||
    g.type === 'unified'
  )
})
```

## 7. PBT 属性

| ID | 不变量 | 伪造策略 |
|----|--------|----------|
| P1 | `label_span ∈ [1, N-1]` 且 `label_span + value_span = N` | 穷举 N∈[2,20] |
| P2 | unified 触发 ↔ has_inline ∧ has_regular ∧ max_block_width > 4 | 随机字段组合 |
| P3 | 统一表格物理列数 = N | 多 inline block 表单，检查 XML |
| P4 | segment 顺序与 sort_order 单调递增 | 随机 sort_order |
| P5 | label/log 行 gridSpan = N | 任意 N + label 位置 |
| P6 | 普通字段行恰好 2 个 merged cell | 随机 N 和普通字段位置 |
| P7 | heading 与 table 在同一 landscape section | 生成 unified form |
| P8 | 同一输入多次导出结构相同 | 对比两次 XML |
| P9 | landscape form 后恢复 PORTRAIT | 检查后续 section |
| P10 | 非 unified 表单行为不变 | 回归对比 |
| P11 | 窄 block 列宽 = total_width / M | 检查 gridCol XML |
| P12 | merge 后 cell 保留完整样式 | 检查底纹/颜色 XML |
