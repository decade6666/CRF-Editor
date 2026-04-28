---
change: fix-docx-preview-and-horizontal-layout
type: design
status: ready
created: 2026-04-01
---

# Design: 修复 DOCX 预览与横向布局一致性

## 1. 决策冻结

本次规划冻结以下约束，不再保留实现歧义：

1. **宽度作用域 = 1B**
   - 宽度规划在同一张横向表内部统一计算并产出单份 `WidthPlan`。
   - `unified_landscape` 的多个 inline block 共享同一套列宽语义，不允许每个 block 完全独立各算各的。
   - 对于某个 block 的实际列数 `M < N` 时，通过 span/merge 将全表宽度语义映射到该 block，而不是重新定义另一套独立列宽规则。

2. **宽度度量 = 2C**
   - 使用确定性字符权重估算内容宽度：中文按 2、英文/数字按 1。
   - 标点与符号按轻量权重计入；实现阶段可固化为常量表，但语义必须保持确定性且可复现。

3. **超页宽回退 = 3B**
   - 当规划总宽度超过页面可用宽度时，对所有列做等比缩放，保持比例关系不变。
   - 不允许因为回退而退化为等宽分配。

4. **`trailing_underscore` 不拆行边界 = 4A**
   - “选项文本 + 尾部填写线”必须视为原子 token；两者之间不可换行。
   - 该约束同时适用于横向 choice 与纵向 choice。

5. **排序基准 = 5B**
   - choice 选项排序以 `order_index` 为主；仅在缺失时才允许安全回退到稳定次序。
   - 规划阶段把 `id` 仅视为回退稳定键，不再视为语义主排序键。

---

## 2. 问题陈述

当前实现已经引入 `unified_landscape`，但前后端仍存在三个核心缺口：

1. 前端 HTML 模拟 Word 预览仍以 `table-layout: fixed` + `word-break: break-word` 为主，长文本/横表内容可能通过硬换行与固定列宽勉强塞入页面，缺少与导出侧一致的“内容驱动列宽语义”。
2. 后端导出在 `legacy inline` 与 `unified_landscape` 两条横表路径中仍使用等宽列分配：`backend/src/services/export_service.py:545`、`backend/src/services/export_service.py:891`。
3. `trailing_underscore` 当前通过文本 run + 下划线 run 追加，文本与填写线可在布局层被拆开：`backend/src/services/export_service.py:1049`、`backend/src/services/export_service.py:1090`、`backend/src/services/export_service.py:1151`。

本次 change 的目标不是重写渲染链路，而是在**保持现有结构与触发条件不变**的前提下，为前端预览和后端导出补齐统一的宽度语义契约与 choice no-wrap 契约。

---

## 3. 现状证据

### 3.1 后端导出

- `backend/src/services/export_service.py:455` 已存在 `_classify_form_layout()`，触发条件仍是“mixed + max inline block > 4”。
- `backend/src/services/export_service.py:545` 的 `_build_unified_table()` 当前按 `avail / N` 做等宽分配。
- `backend/src/services/export_service.py:891` 的 `_add_inline_table()` 当前按 `avail / len(marked_fields)` 做等宽分配。
- `backend/src/services/export_service.py:1137` 的 `_get_option_data()` 当前按 `id` 排序，与冻结约束 `5B` 不一致。
- `backend/src/services/export_service.py:1082-1088`、`backend/src/services/export_service.py:1119-1125` 当前把 option 文本和填写线拆成多个 run。

### 3.2 前端预览

- `frontend/src/components/FormDesignerTab.vue:363` 已存在 `buildUnifiedSegments()`，并与后端统一模式相呼应。
- `frontend/src/components/FormDesignerTab.vue:407` 已存在 `renderGroups()`，触发 `unified` 的条件与后端基本一致。
- `frontend/src/styles/main.css:170-180` 中 `.word-page table`、`.inline-table`、`.unified-table` 统一使用 `table-layout: fixed`。
- `frontend/src/styles/main.css:171` 默认对单元格启用 `word-break: break-word`，这会允许文本在与导出语义不一致的位置断开。

---

## 4. 设计目标

### 4.1 保持不变的部分

- `mixed + max_block_width > 4` 仍触发 `unified_landscape`。
- 非横表路径不受影响。
- 前端仍走 HTML 模拟预览，不引入截图/COM/导出回读。
- 后端仍保持固定布局（`autofit = False`）与确定性导出。

### 4.2 新增的能力

- 同一张横向表内部基于内容权重生成稳定的 `WidthPlan`。
- `legacy inline` 与 `unified_landscape` 共用同一种宽度规划语义。
- 前端预览消费同一种宽度语义，但不共享实现代码。
- choice 选项中的“文本 + 尾线”作为原子 token 渲染，禁止拆行。
- 选项顺序基于 `order_index`，保持与业务排序一致。

---

## 5. 核心方案

### 5.1 引入共享语义：WidthPlan

本次不要求前后端共享代码，但要求共享同一份**语义契约**。

建议抽象为以下概念：

```text
WidthToken
  - kind: label | control | choice_atom | literal | unit
  - text: string
  - weight: number

ColumnDemand
  - columnKey: stable key within one horizontal table
  - intrinsicWeight: number
  - minWeight: number

WidthPlan
  - scope: one horizontal table
  - columnCount: N
  - demands: ColumnDemand[]
  - normalizedFractions: number[]
  - fallbackApplied: scale_to_fit | none
```

约束：
- `scope = one horizontal table`，对应冻结约束 `1B`。
- `normalizedFractions` 由字符权重计算后归一化得到。
- 若总需求超预算，仅允许 `scale_to_fit`，对应 `3B`。

### 5.2 宽度规划算法

#### 输入
- `legacy inline`：每个 inline 字段列头 + 数据占位/默认值/choice 原子 token。
- `unified_landscape`：
  - 普通字段行：label 区与 value 区分别建模；
  - inline block：block 中各列需求纳入同一张表的总规划；
  - full-row 不参与列宽竞争，但不得破坏既有 `N` 列网格。

#### 度量规则
- 中文字符 = 2
- 英文/数字 = 1
- 常规标点/空格/符号 = 1
- 填写线按固定权重计入，不以最终重复字符数直接替代语义长度
- `choice_atom = symbol + 空格 + label + trailing_fill_line_if_any`

#### 输出规则
1. 汇总各列的 intrinsic weight。
2. 做归一化，得到目标比例。
3. 将比例映射到页面可用宽度。
4. 若超预算，整体等比缩放。
5. 给出每列最终宽度；不得退化为等宽，除非输入本身等权。

### 5.3 `legacy inline` 方案

`backend/src/services/export_service.py:891` 的 `_add_inline_table()` 不再直接 `avail / len(marked_fields)`，而是：

1. 使用现有 `build_inline_table_model()` 收集 header / row_values / field_defs。
2. 基于 header + 代表性内容构建列需求。
3. 生成 `WidthPlan` 并写回 `table.columns[i].width`。
4. 前端 inline 预览对同一组字段生成相同语义的列比例，输出到 `colgroup` 或单元格宽度样式。

### 5.4 `unified_landscape` 方案

`backend/src/services/export_service.py:545` 的 `_build_unified_table()` 不再把 N 列均分，而是：

1. 先扫描全部 `segments` 生成全表级 `WidthPlan`。
2. 普通字段行继续复用 `label_span/value_span` 语义，但其 span 所覆盖的物理列宽总和需与 `WidthPlan` 一致。
3. inline block 使用同一份全表宽度语义；当 `M < N` 时，按既有 `_compute_merge_spans()` 将全表列映射为 block span。
4. 任何 block 不得脱离全表重新定义独立比例，满足 `1B`。

### 5.5 前端预览方案

前端不共享 Python 代码，但必须共享语义：

- 在 `frontend/src/components/FormDesignerTab.vue` 与 `frontend/src/composables/useCRFRenderer.js` 所在渲染链路中新增宽度规划辅助逻辑。
- `renderGroups()` / `buildUnifiedSegments()` 保持现有职责。
- 预览表格不再只依赖 `table-layout: fixed`，而是显式输出列比例。
- 对长文本容器优先使用 `overflow-wrap: anywhere` 仅作为文本保护策略；列宽语义仍由规划器决定。
- 对 choice atom 使用不可拆分包装（如 `inline-flex` / `white-space: nowrap` / 独立 span 组合），保证“文本 + 尾线”整体不换行。

### 5.6 `trailing_underscore` 原子 token 方案

冻结约束 `4A` 要求：

```text
choice_atom := symbol + optional spacing + label + optional trailing_fill_line
```

性质：
- `choice_atom` 内部不可断行。
- 相邻 choice atom 之间可断行。
- 纵向 choice 中每个 atom 独占一行；横向 choice 中多个 atom 可并列，但 atom 内部不可拆。

后端实现含义：
- 不再把 label 与 fill line 当作两个可独立换行的普通 run 语义看待。
- 可通过 run 聚合、non-breaking 控制字符、OXML noWrap、或等价的 Word 级不可拆分语义实现；规划阶段不锁定具体 API，只锁定行为结果。

前端实现含义：
- 预览 HTML 需把 label 与尾线包裹在同一个 no-wrap 容器中。

### 5.7 选项排序语义

`backend/src/services/export_service.py:1143` 当前按 `id` 排序，与业务排序不符。

本次设计冻结为：

```text
sort key = (order_index if present else +∞, id if present else +∞)
```

含义：
- `order_index` 是业务主序。
- `id` 只是稳定回退键。
- 前端和后端对同一 choice 数据必须使用同一排序语义。

---

## 6. 文件影响矩阵

| 文件 | 变更类型 | 规划说明 |
|---|---|---|
| `backend/src/services/export_service.py` | 修改 | 接入宽度规划、修正 option 排序、实现 choice atom 不拆行 |
| `backend/src/services/field_rendering.py` | 小幅修改或只读复用 | 作为 inline 数据模型输入层，必要时补充 token 提取辅助函数 |
| `frontend/src/components/FormDesignerTab.vue` | 修改 | 输出宽度计划到 unified/inline 预览表格 |
| `frontend/src/composables/useCRFRenderer.js` | 修改 | 统一生成 choice atom HTML、宽度度量辅助 |
| `frontend/src/styles/main.css` | 修改 | 新增 no-wrap / colgroup / overflow 样式，避免继续纯 fixed-table 语义 |
| `backend/tests/test_export_service.py` | 修改 | legacy inline 宽度与 choice atom 导出断言 |
| `backend/tests/test_export_unified.py` | 修改 | unified_landscape 宽度规划与回退断言 |
| `backend/tests/test_import_service.py` | 修改 | `trailing_underscore` 语义回归、排序与 round-trip 保真 |

---

## 7. PBT / 不变式

### P1. 宽度总预算不变式
- **性质**：任一横向表的最终列宽总和不得超过页面可用宽度。
- **边界**：最窄内容、最宽内容、超长中文、混合中英、全部 choice trailing。
- **反例生成**：随机生成 1~12 列、不同字符分布与默认值长度。

### P2. 比例保持不变式
- **性质**：若两列的 intrinsic weight 满足 `a > b`，则回退缩放后仍有 `width(a) >= width(b)`。
- **边界**：超预算缩放、接近等权、含最小宽度保护。
- **反例生成**：构造极端长短列组合，验证不会退化为等宽。

### P3. 作用域一致性不变式
- **性质**：同一 unified 横向表中的多个 inline block 必须消费同一份 `WidthPlan` 语义。
- **边界**：block 数 1~N、不同 block 列数不同、普通字段与 block 混排。
- **反例生成**：构造前窄后宽两个 block，验证后者不会单独重算独立比例。

### P4. choice atom 不拆分不变式
- **性质**：任何带 `trailing_underscore` 的 option，其 label 与 fill line 在导出和预览中都不可分离。
- **边界**：横向、纵向、超长 option label、多个 atom 连续出现。
- **反例生成**：随机生成 label 长度与是否 trailing，检查渲染结果中不存在 label 与 fill line 分离的结构证据。

### P5. 排序稳定性不变式
- **性质**：当 `order_index` 已定义时，导出与预览顺序只受 `order_index` 影响，不受 `id` 扰动影响。
- **边界**：`order_index` 相同、缺失、乱序、空值。
- **反例生成**：对同一组 option 随机打乱 `id`，验证输出顺序不变。

### P6. 幂等性不变式
- **性质**：同一输入重复规划列宽，结果必须一致。
- **边界**：legacy inline、unified、混合字符集。
- **反例生成**：重复运行规划器 N 次，比较结果序列完全相同。

---

## 8. 风险与缓解

| 风险 | 说明 | 缓解 |
|---|---|---|
| 前后端语义漂移 | 两端独立实现宽度规划，可能细节不一致 | 在 spec 中冻结字符权重、作用域、回退、排序语义 |
| 等比缩放后最小列过窄 | 极端长文本导致某些列不可读 | 实现阶段增加最小宽度保护，但不得改变相对次序 |
| Word no-wrap API 选择不当 | 仅改 run 文本无法阻止断行 | 以行为验收，不在规划阶段锁死 API |
| 改排序影响既有测试 | 当前测试可能依赖 `id` 顺序 | 在 spec 中把 `order_index` 升格为主排序，并同步回归测试 |
| 误伤非横表路径 | 横向策略外溢到普通 2 列表 | 仅在 `_add_inline_table()` 与 `_build_unified_table()` 接入规划器 |

---

## 9. 实施边界

本次 planning 明确**不做**以下事情：

- 不改导入截图预览链路。
- 不新增字段类型、数据库字段或配置项。
- 不把前后端强行抽成共享运行时代码。
- 不把 fixed layout 改成 Word autofit。
- 不在本阶段修改业务流程。

---

## 10. 验收映射

- 预览不超页：由前端宽度规划 + 样式保护达成。
- 导出列宽按内容比例：由后端 `WidthPlan` 达成。
- `trailing_underscore` 整体不拆行：由 choice atom 契约达成。
- 前后端语义一致：由共享 spec 契约保证，而不是共享源码。
- 既有路径不误伤：通过作用域隔离与回归测试保证。
