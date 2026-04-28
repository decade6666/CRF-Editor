# Design: 混合字段横向表单统一渲染

## 1. 架构概览

```
_add_forms_content()
  ├─ 对每个 form:
  │   ├─ _classify_form_layout(form_fields) → LayoutDecision
  │   ├─ if unified_landscape:
  │   │   ├─ _switch_section(doc, LANDSCAPE)
  │   │   ├─ 写 heading
  │   │   ├─ _build_unified_segments(form_fields) → [Segment]
  │   │   ├─ _build_unified_table(doc, segments, N)
  │   │   └─ _switch_section(doc, PORTRAIT)
  │   └─ else:
  │       └─ 现有 legacy 路径（_group_form_fields → _build_form_table / _add_inline_table）
```

## 2. 数据模型

### 2.1 LayoutDecision（内部，不持久化）

```python
@dataclass(frozen=True)
class LayoutDecision:
    mode: str  # "legacy" | "unified_landscape"
    column_count: int  # N (仅 unified 有意义)
    label_span: int
    value_span: int
```

### 2.2 Segment（内部，不持久化）

```python
@dataclass(frozen=True)
class Segment:
    type: str  # "regular_field" | "full_row" | "inline_block"
    fields: list  # FormField 列表
    # inline_block: fields = 该 block 内的连续 inline 字段
    # regular_field: fields = [单个普通字段]
    # full_row: fields = [单个标签/日志字段]
```

## 3. 后端变更

### 3.1 新增方法

| 方法 | 职责 |
|------|------|
| `_classify_form_layout(form_fields)` | 扫描字段，判断是否触发 unified landscape，返回 LayoutDecision |
| `_build_unified_segments(form_fields)` | 按 sort_order 扫描字段流，输出 Segment 列表 |
| `_build_unified_table(doc, segments, layout)` | 创建 N 列统一表格，按 segment 顺序写入行 |
| `_add_unified_regular_row(table, field, layout)` | 在 unified table 中添加普通字段行（merge label/value） |
| `_add_unified_full_row(table, field, N)` | 在 unified table 中添加全宽行（merge 0..N-1） |
| `_add_unified_inline_band(table, block_fields, N)` | 在 unified table 中添加 inline block 的 header + data 行 |
| `_switch_section(doc, orientation, project)` | 添加分节符并设置页面方向 + header/footer |

### 3.2 修改方法

| 方法 | 变更 |
|------|------|
| `_add_forms_content()` | 在 form 循环顶部调用 `_classify_form_layout()`，unified 走新路径，否则走旧路径；移除 form 末尾的无条件 `page_break`，改为条件性 |

### 3.3 不修改的方法

| 方法 | 原因 |
|------|------|
| `_build_form_table()` | legacy 路径保持不变 |
| `_add_inline_table()` | legacy 路径保持不变 |
| `_group_form_fields()` | legacy 路径保持不变（已知的 sort_order 问题不在本次修复范围） |
| `field_rendering.py` 全部 | 可直接复用 |

### 3.4 关键算法

#### _classify_form_layout

```python
def _classify_form_layout(self, form_fields: list) -> LayoutDecision:
    sorted_fields = sorted(form_fields, key=lambda f: (f.sort_order, f.id))
    has_regular = any(f.field_definition.inline_mark == 0 for f in sorted_fields)

    # 计算连续 inline block 宽度
    max_block_width = 0
    current_block_width = 0
    for f in sorted_fields:
        if f.field_definition.inline_mark == 1:
            current_block_width += 1
        else:
            max_block_width = max(max_block_width, current_block_width)
            current_block_width = 0
    max_block_width = max(max_block_width, current_block_width)

    has_inline = max_block_width > 0

    if has_regular and has_inline and max_block_width > 4:
        N = max_block_width
        label_span = max(1, min(N - 1, round(N * 0.4)))
        return LayoutDecision("unified_landscape", N, label_span, N - label_span)

    return LayoutDecision("legacy", 0, 0, 0)
```

#### _build_unified_segments

```python
def _build_unified_segments(self, form_fields: list) -> list[Segment]:
    sorted_fields = sorted(form_fields, key=lambda f: (f.sort_order, f.id))
    segments = []
    inline_buffer = []

    for f in sorted_fields:
        fd = f.field_definition
        if fd.inline_mark == 1:
            inline_buffer.append(f)
        else:
            # flush inline buffer
            if inline_buffer:
                segments.append(Segment("inline_block", list(inline_buffer)))
                inline_buffer.clear()
            # classify normal field
            if fd.field_type == 'label' or fd.is_log_field:
                segments.append(Segment("full_row", [f]))
            else:
                segments.append(Segment("regular_field", [f]))

    # flush trailing inline buffer
    if inline_buffer:
        segments.append(Segment("inline_block", list(inline_buffer)))

    return segments
```

#### 窄 block 列合并策略

当 inline block 字段数 M < N 时，在 N 列 grid 上模拟 M 列等分：

```python
def _compute_merge_spans(N: int, M: int) -> list[int]:
    """将 N 列分成 M 个区间，返回每个区间的 span 列表。"""
    base = N // M
    extra = N % M
    spans = []
    for i in range(M):
        spans.append(base + (1 if i < extra else 0))
    return spans
# 例：N=7, M=5 → [2, 2, 1, 1, 1]（前 2 列各占 2 格，后 3 列各占 1 格）
```

## 4. 前端变更

### 4.1 FormDesignerTab.vue

#### renderGroups 计算属性

```javascript
const renderGroups = computed(() => {
  const fields = sortedFormFields.value
  if (!fields.length) return []

  // 检测 unified 触发条件
  const hasRegular = fields.some(f => f.field_definition?.inline_mark === 0)
  let maxBlockWidth = 0, currentWidth = 0
  for (const f of fields) {
    if (f.field_definition?.inline_mark === 1) {
      currentWidth++
    } else {
      maxBlockWidth = Math.max(maxBlockWidth, currentWidth)
      currentWidth = 0
    }
  }
  maxBlockWidth = Math.max(maxBlockWidth, currentWidth)
  const hasInline = maxBlockWidth > 0

  if (hasRegular && hasInline && maxBlockWidth > 4) {
    return [{ type: 'unified', fields, colCount: maxBlockWidth }]
  }

  // 现有分组逻辑...
})
```

#### 新增 unified 模板区域

在 preview 模板中新增 `v-if="g.type === 'unified'"` 分支，渲染统一 HTML 表格：
- 按 sort_order 遍历字段
- 普通字段：`<td colspan={labelSpan}> + <td colspan={valueSpan}>`
- 全宽行：`<td colspan={colCount}>`
- inline block：`<th> × M` 表头 + `<td> × M` 数据行
- 窄 block 的 `colspan` 按 `_compute_merge_spans` 对应逻辑

### 4.2 main.css

新增样式（如需要）：
- `.unified-table` — 统一表格容器
- `.unified-label-cell` — 普通字段左侧 merged label
- `.unified-value-cell` — 普通字段右侧 merged value

## 5. 文件影响矩阵

| 文件 | 变更类型 | 行数估计 |
|------|----------|----------|
| `backend/src/services/export_service.py` | 修改 + 新增方法 | +150~200 行 |
| `frontend/src/components/FormDesignerTab.vue` | 修改 renderGroups + 新增模板 | +80~120 行 |
| `frontend/src/styles/main.css` | 新增样式 | +15~25 行 |
| `backend/tests/test_export_service.py` | 新增测试 | +100~150 行 |

## 6. 复用策略

| 现有函数/模式 | 在 unified 中的复用方式 |
|---------------|------------------------|
| `field_rendering.build_inline_table_model()` | 为每个 inline block 生成 headers/rows/field_defs |
| `field_rendering.extract_default_lines()` | 获取多行默认值 |
| `_set_run_font()` | 所有 run 的字体设置 |
| `_apply_cell_shading()` | merge 后的 cell 底纹 |
| `_apply_grid_table_style()` | 统一表格边框 |
| `_render_vertical_choices()` | 普通字段值区的纵向选项渲染 |
| `renderCellHtml()` (前端) | 统一表格中各 cell 的 HTML 渲染 |
| `getInlineRows()` (前端) | inline block 的行数据生成 |

## 7. 风险缓解

| 风险 | 缓解措施 |
|------|----------|
| merge 后样式丢失 | 先 merge 再渲染（specs §4） |
| 空白页 | landscape form 结束不追加额外 page_break |
| 标题错页 | heading 写在 landscape section 内 |
| 窄 block 列数不匹配 | 使用 `_compute_merge_spans` 在 N 列 grid 上模拟 M 列 |
| 回归 | 非 unified 路径完全不动；`_classify_form_layout` 作为唯一入口 guard |
