# Design: 预览/设计器表格列宽内容驱动自动适配

## Planning Summary for OPSX

**Multi-Model Analysis Results**:
- **Codex (Backend/Algorithm)**: 推荐"纯 planner 放在 `useCRFRenderer.js` + `useColumnResize` 作为 designer-only 的薄状态外壳"分层；识别关键风险包括 JS `charCodeAt` 对非 BMP CJK 低估、`resizerCache` 上下文陈旧、`getResizer` 当前传原始值导致 rehydrate watcher 失效、normal 表后端实际使用固定宽度而非 width_planning（需扩展）；提供 7 步落地计划与 6 条技术风险。
- **Gemini (Frontend/Integration)**: 推荐 factory 函数签名（`initialRatios | () => number[]`）向后兼容；警示 first-time-load flicker（需 setup 阶段完成计算）、resizerCache 应加入 fieldsSignature 关键字；scalability 在 50 inline 列规模下可忽略（O(N·M) 字符长度计算）。
- **Consolidated Approach**: 采用"Composable（内部依赖 pure function）"；前端纯 planner（`useCRFRenderer.js` 扩展）+ `useColumnResize.js` 的 `defaultsSource` 参数支持函数/ref/数组，`rehydrate()` / `resetToEven()` 每次 resolve；后端对等扩展 `width_planning.py` 新增 normal 专用语义；统一 codePoint 语义。

**Resolved Constraints**:
- 前后端权重常量、最小保护 `max(weight, 4)`、等比缩放回退语义严格对齐（扩展到 normal）。
- `useColumnResize(formIdRef, tableKindRef, defaultsSource)`：第三参数支持 `number[] | () => number[] | Ref<number[]> | ComputedRef<number[]>`；`resolveDefaults()` 每次对 source 求值；`rehydrate` / `resetToEven` 内部调用。
- localStorage 键 `crf:designer:col-widths:<form_id>:<table_kind>` 协议不变；validity 规则不变（`[0.1, 0.9]`、和为 `1±1e-3`、长度匹配）。
- `FormDesignerTab.getResizer` 必须把 `formId` / `tableKind` 改为 ref/computed 传入（解除 watcher 失效的伪重构）。
- unified 物理列 `N = max(block_cols)`；drag/persist 启用；key 形如 `unified-N`。
- `TemplatePreviewDialog` / `SimulatedCRFForm` 为纯展示面：只读共享设计器 localStorage 保存值（同键），无拖拽入口，不写入。
- 前端 `computeCharWeight` 改用 `codePointAt(0)`；配合 `for...of`（已用）保证高代理对正确识别。
- Backend 扩展 `width_planning.py`：`build_normal_table_demands(fields)` + `plan_normal_table_width(fields, available_cm)`；export_service 消费之替换固定 7.2/7.4cm。
- PBT：引入 `fast-check`（devDependency），覆盖 planner 系列函数的不变量。
- `resetToEven()` 函数名保留，语义改为"清 localStorage + 回到 factory 默认值"。

**PBT Properties** (详见 §3)

**Technical Decisions**:
- 算法实现：Composable + Pure function 分层（Codex 推荐，Gemini 同意）
- normal 两列聚合：复用 `buildInlineColumnDemands([ff])[0].weight`，按列 `max` 聚合（与后端对等实现对齐）
- unified 聚合：per-slot-max（与后端 `plan_unified_table_width` 对齐），**regular_field 也参与**（V4 约束）
- CJK 对齐：前端 `codePointAt(0)` ↔ 后端 `ord()`
- 持久化：designer 可写，preview/simulated 只读共享
- PBT 框架：`fast-check`（devDependency）
- **Canonical table_instance_id**：`kind:fieldIds=<ordered-field-ids>`（V2 约束）
- **导出列宽覆盖契约**：POST body 传递 `column_width_overrides`，localStorage 为前端私有缓存（V6 约束）

**Implementation Tasks** (详见 tasks.md)

---

## 1. 架构蓝图

```
┌──────────────────────────────────────────────────────────────┐
│  frontend/src/composables/useCRFRenderer.js                  │
│  ──────────────────────────────────────────────              │
│  PURE PLANNERS（新/改）                                      │
│  • computeCharWeight(ch)       ← 改用 codePointAt(0)         │
│  • buildInlineColumnDemands()  ← 保留                        │
│  • buildNormalColumnDemands()  ← 新增                        │
│  • planWidth()                 ← 保留                        │
│  • planInlineColumnFractions() ← 保留                        │
│  • planNormalColumnFractions() ← 新增                        │
│  • planUnifiedColumnFractions()← 新增                        │
└───────────────┬──────────────────────────────────────────────┘
                │ (pure function, no side effect)
                ▼
┌──────────────────────────────────────────────────────────────┐
│  frontend/src/composables/useColumnResize.js                 │
│  ──────────────────────────────────────────────              │
│  THIN STATE WRAPPER（改造）                                  │
│  useColumnResize(formIdRef, tableKindRef, defaultsSource)    │
│    ├─ resolveDefaults() // 每次调用求值 defaultsSource       │
│    ├─ readRatios(key, n) // localStorage 校验                │
│    ├─ rehydrate() ← 调用 resolveDefaults()                   │
│    ├─ resetToEven() ← 清 storage + resolveDefaults()         │
│    ├─ onResizeStart / onMove / onUp (保留)                   │
│    └─ SNAP_ANCHORS / SNAP_PX / MIN_RATIO（保留）             │
└───────────────┬──────────────────────────────────────────────┘
                │ (ref-based reactive)
                ▼
┌──────────────────────────────────────────────────────────────┐
│  frontend/src/components/FormDesignerTab.vue                 │
│  ──────────────────────────────────────────────              │
│  getResizer(kind, colCount, groupIndex) [IMPROVED]           │
│    • 传 computed formId ref                                  │
│    • 传 computed tableKind ref                               │
│    • 传 factory closure:                                     │
│        kind='normal'  → () => planNormalColumnFractions(fields)│
│        kind='inline'  → () => planInlineColumnFractions(fields)│
│        kind='unified' → () => planUnifiedColumnFractions(segs)│
│  模板：normal / inline / unified 三类均挂 useColumnResize    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  frontend/src/components/TemplatePreviewDialog.vue           │
│  + SimulatedCRFForm.vue                                      │
│  ──────────────────────────────────────────────              │
│  PURE READ-ONLY CONSUMERS                                    │
│  • 计算 defaults = plan*ColumnFractions(...)                │
│  • 若 formId 存在：读 localStorage 同键；合法→用它；否则用默认│
│  • <colgroup> + <col width="X%"> 输出                        │
│  • 无 drag, 无 snap, 无 write                                │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  backend/src/services/width_planning.py                      │
│  ──────────────────────────────────────────────              │
│  + build_normal_table_demands(fields) → List[ColumnDemand]   │
│    • 对每个 ff: 用 build_inline_column_demands([ff])[0]      │
│    • 再按 label/control 聚合：                               │
│        labelWeight = max(compute_text_weight(label)... for ff)│
│        controlWeight = max(inlineDemand.weight for ff)       │
│        clamp min_weight = WEIGHT_ASCII * 4                   │
│  + plan_normal_table_width(fields, available_cm=14.66)       │
│    • build_normal_table_demands → plan_width → cm 映射       │
└───────────────┬──────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────┐
│  backend/src/services/export_service.py                      │
│  ──────────────────────────────────────────────              │
│  normal 表导出 [CHANGE]                                      │
│  • 移除 "7.2cm / 7.4cm" 硬编码（line ~1701-1715）             │
│  • 调用 plan_normal_table_width(fields, available_cm=14.66)  │
│  • 应用于 table.columns[i].width = Cm(plan[i])               │
└──────────────────────────────────────────────────────────────┘
```

## 2. 关键算法决策

### 2.1 `planNormalColumnFractions(fields)` — 前后端对等

```
输入: fields (array of FormField with field_definition)
输出: [labelFraction, controlFraction]  （sum = 1）

算法:
  demands_per_row = [buildInlineColumnDemands([ff])[0] for ff in fields if ff.field_type != '标签' and ff.field_type != '日志行']
  labelWeight = max(computeTextWeight(ff.label_override || ff.field_definition.label) for ff in non-structural fields)
  controlWeight = max(d.weight for d in demands_per_row)

  labelWeight = max(labelWeight, WEIGHT_ASCII * 4)
  controlWeight = max(controlWeight, WEIGHT_ASCII * 4)

  return planWidth([labelWeight, controlWeight], WEIGHT_ASCII * 4 * 2)
```

**边界情形**:
- 空 fields → 返回 `[0.5, 0.5]`（与后端一致：零需求时等分）。
- 全结构字段（标签/日志行）→ 返回 `[0.5, 0.5]`（cross-row 只有结构行时两列均分）。
- 单字段 label 长度 1 + 控件单填线（weight=6）→ 归一化为 `[4/(4+6), 6/(4+6)]` = `[0.4, 0.6]`。

### 2.2 `planUnifiedColumnFractions(segments, columnCount)`

```
输入:
  segments: 由 buildFormDesignerUnifiedSegments(fields) 生成，{type, fields[]}
            只 type='inline_block' 参与 per-slot-max 聚合
  columnCount: g.colCount（max_block_cols）
输出: [f_0, f_1, ..., f_{N-1}]  （sum = 1）

算法（与后端 plan_unified_table_width 严格对齐）:
  N = columnCount
  slot_weights = [0] * N
  for seg in segments where seg.type == 'inline_block':
    inline_demands = buildInlineColumnDemands(seg.fields)
    for i, d in enumerate(inline_demands):
      if i < N:
        slot_weights[i] = max(slot_weights[i], d.weight)
  aggregated = [max(w, WEIGHT_ASCII*4) for w in slot_weights]
  return planWidth(aggregated, sum(aggregated))
```

**边界情形**:
- 所有 segment 为 `regular_field` / `full_row` → slot_weights 保持 0 → 所有 demand = 4 → 均分。
- `columnCount = 0` → 返回 `[]`；调用方不渲染 `<colgroup>`。

### 2.3 CJK 码点对齐

**前端修正**:
```js
function computeCharWeight(char) {
  const code = char.codePointAt(0)  // ← 改点：codePointAt 支持扩展 B+
  if (
    (code >= 0x4E00 && code <= 0x9FFF) ||      // 基本区
    (code >= 0x3400 && code <= 0x4DBF) ||      // 扩展 A
    (code >= 0x20000 && code <= 0x2A6DF) ||    // 扩展 B-F
    ...
  ) return WEIGHT_CHINESE
  return WEIGHT_ASCII
}
```

配合 `for (const char of text)` 的已有迭代（`for...of` 按 codepoint 迭代字符串），码点范围判断才会正确落入扩展区。

### 2.4 `useColumnResize` 的 `defaultsSource` 参数

```js
export function useColumnResize(formIdRef, tableKindRef, defaultsSource) {
  const resolveDefaults = () => {
    const raw = typeof defaultsSource === 'function'
      ? defaultsSource()
      : resolveValue(defaultsSource)  // 兼容 ref / computed / 数组
    return Array.isArray(raw) && raw.length > 0 ? [...raw] : [0.5, 0.5]
  }

  const colRatios = ref((() => {
    const defaults = resolveDefaults()
    const k = getKey()
    return (k ? readRatios(k, defaults.length) : null) ?? defaults
  })())

  const rehydrate = () => {
    const defaults = resolveDefaults()
    const k = getKey()
    const loaded = k ? readRatios(k, defaults.length) : null
    colRatios.value = loaded ?? defaults
  }

  const resetToEven = () => {  // 名称保留，语义升级
    const k = getKey()
    if (k) { try { localStorage.removeItem(k) } catch { /* ignore */ } }
    colRatios.value = resolveDefaults()
  }

  // ... onMove / onUp / onResizeStart 保持不变
}
```

**向后兼容**：
- 原有调用 `useColumnResize(id, key, [0.3, 0.7])` 继续可用（数组分支）；
- 新调用 `useColumnResize(idRef, keyRef, () => planNormalColumnFractions(fields))` 推荐使用。

### 2.5 `FormDesignerTab.getResizer` 改造

```js
import { computed } from 'vue'
import {
  planNormalColumnFractions,
  planInlineColumnFractions,
  planUnifiedColumnFractions,
} from '../composables/useCRFRenderer'

const formIdRef = computed(() => selectedForm.value?.id)

function getResizer(kind, colCount, groupIndex) {
  const mapKey = `${groupIndex}-${kind}-${colCount}`
  if (!resizerCache.has(mapKey)) {
    const formId = formIdRef.value
    if (formId == null) return null
    const tableKindRef = computed(() => mapKey)
    const defaultsSource = () => {
      const group = designerRenderGroups.value[groupIndex]
      if (!group) return Array.from({ length: colCount }, () => 1 / colCount)
      if (kind === 'normal') return planNormalColumnFractions(group.fields)
      if (kind === 'inline') return planInlineColumnFractions(group.fields)
      if (kind === 'unified') {
        const segments = buildFormDesignerUnifiedSegments(group.fields)
        return planUnifiedColumnFractions(segments, group.colCount)
      }
      return Array.from({ length: colCount }, () => 1 / colCount)
    }
    resizerCache.set(mapKey, useColumnResize(formIdRef, tableKindRef, defaultsSource))
  }
  return resizerCache.get(mapKey)
}
```

**关键**：`formIdRef` 与 `tableKindRef` 均为 ref/computed，使得 `useColumnResize` 内 `watch` 真正生效；`designerRenderGroups` 变化时，下一次渲染调用 `getResizer` 的新 groupIndex 会触发重算 factory（通过 `rehydrate`）。

## 3. PBT 属性（fast-check）

### P1 — 长度保持
```
∀ fields, |planInlineColumnFractions(fields)| == |fields|
∀ fields, |planNormalColumnFractions(fields)| == 2
∀ segs, columnCount ≥ 0, |planUnifiedColumnFractions(segs, columnCount)| == columnCount
Falsification: fast-check 随机 fields.length ∈ [0, 50]，断言输出长度
```

### P2 — 归一化
```
∀ valid input, |sum(output) - 1| < 1e-9 OR output == []
Falsification: 随机 100 次生成任意权重组合，验证 sum == 1
```

### P3 — 确定性（幂等）
```
∀ fields, planX(fields) == planX(fields)  // 多次调用结果相等
Falsification: 运行 planner 两次，深比较
```

### P4 — 等需求 → 等比例
```
∀ fields where all column demands are equal, output values are all equal
Falsification: 构造 [demand, demand, demand]，验证 output == [1/n, 1/n, 1/n]
```

### P5 — 单调性
```
∀ fields, increasing fields[i].demand → output[i] non-decreasing fraction
Falsification: 随机 fields 克隆后将 field[i] 标签加倍，断言 output[i]' ≥ output[i]
```

### P6 — unified per-slot-max 单调性
```
∀ segments, 对任一 slot i 增大其 demand 后，output[i] 不减小
Falsification: 随机 block 集合，对 block[0] 的第 i 列加倍权重，断言 output[i] 不减
```

### P7 — CJK 扩展区权重
```
∀ char ∈ {扩展 B/C/D/E/F/G/H/I/J + CJK 基本 + 扩展 A + 兼容区 + 兼容补充},
  computeCharWeight(char) == WEIGHT_CHINESE == 2
∀ char ∈ ASCII printable (0x20-0x7E), computeCharWeight(char) == WEIGHT_ASCII == 1
Falsification: fast-check 从指定 Unicode 区间采样 200 个码点验证
```

### P8 — localStorage 优先级
```
State model:
  given (localStorage entry E, fields F):
    if E is valid (length, range, sum) → useColumnResize returns E
    else → returns plan(F)
Falsification: fast-check 生成 arbitrary (E, F)，oracle = 协议规则
```

### P9 — resetToEven 幂等性
```
∀ state, resetToEven() ; resetToEven() == resetToEven()
即：多次 reset 结果相等
Falsification: 调用两次后断言 colRatios.value 深相等
```

### P10 — 前后端对等（跨栈）
```
∀ fields (serializable to both JSON/Python),
  abs(planInlineColumnFractions_js(fields)[i] - plan_inline_table_width_py(fields)[i] / sum(...)) < 1e-6
Falsification: Python 测试加载前端 fixture 文件，对比数值
此属性通过后端 pytest 实现（读取 backend/tests/fixtures/planner_cases.json）
```

## 4. 风险与缓解

| 风险 | 来源 | 缓解 |
|------|------|------|
| R-FLOAT：JS/Py 浮点差异 | Codex | A1b 容差 1e-6；cross-lang fixture 固定 Unicode NFC |
| R-REHYDRATE：watcher 失效伪重构 | Codex | 强制 `getResizer` 改传 ref/computed，单元测试验证 `watch(formIdRef)` 触发 |
| R-CACHE-STALE：closure 捕获旧 fields | Codex + Gemini | factory 闭包内 `designerRenderGroups.value[groupIndex]` 每次重取，不缓存 fields |
| R-CJK：扩展 B+ 低估 | Codex | P7 PBT 覆盖；rare_cjk_extension_char fixture |
| R-NORMAL-BACKEND：后端 normal 固定宽度 | Codex | 明确扩展 build_normal_table_demands / plan_normal_table_width |
| R-UX-FLICKER：首次加载 flicker | Gemini | `setup()` 阶段同步计算；`<colgroup>` 在 template 首帧即生效 |
| R-UNIFIED-COMPLEX：colspan 语义 | Codex | unified 的 `<colgroup>` 按 `g.colCount` 物理列；`colspan` 仍由 `computeMergeSpans` 控制 |

## 5. 测试策略

### 5.1 单元测试（frontend/tests/columnWidthPlanning.test.js）
- 每个 planner 的典型 fixture：
  - `normal_short_label_fill_line`
  - `normal_long_cjk_label_short_control`
  - `inline_choice_with_trailing_underscore`
  - `inline_multiline_default_value`
  - `unified_two_blocks_per_slot_max`
  - `missing_field_definition`
  - `rare_cjk_extension_char`
- useColumnResize 行为：localStorage 优先 / 非法回退 / resetToEven / rehydrate on formId change

### 5.2 PBT 测试（frontend/tests/columnWidthPlanning.pbt.test.js）
- P1-P9 in fast-check
- 种子固定（`fc.configureGlobal({ seed: 424242 })`），确保 CI 可重现

### 5.3 后端对等测试（backend/tests/test_width_planning.py）
- 新增 `test_build_normal_table_demands_*`
- 新增 `test_plan_normal_table_width_matches_frontend`（P10）
- 新增 `test_compute_char_weight_cjk_extension_b`

### 5.4 集成/回归
- 视觉验证：在 3 个真实表单（short-label、long-label、16 列 inline）打开设计器，截图对比
- `cd frontend && npm run lint` 无新增
- `cd backend && python -m pytest` 全绿

## 6. 验证发现与约束（Phase 14 补充）

### 6.1 Canonical table_instance_id

**问题**：当前 `groupIndex` 作为表实例标识符不稳定——字段排序变化导致 groupIndex 重映射，破坏持久化一致性。

**方案**：定义规范标识符：
```
table_instance_id = kind:fieldIds=<ordered-field-ids>

示例：
- normal:fieldIds=1,2,3
- inline:fieldIds=4,5
- unified:fieldIds=6,7,8,9
```

**实现影响**：
- localStorage 键格式：`crf:designer:col-widths:<form_id>:<table_instance_id>`
- 导出 API 接受 `column_width_overrides: {table_instance_id: [fractions...}`

### 6.2 Export Column Width Override Contract

**问题**：`App.vue` 的 `collectColumnWidthOverrides()` 搜索错误格式的键，导致导出无法读取用户保存的列宽。

**方案**：
1. 前端遍历 `crf:designer:col-widths:<form_id>:*-*` 格式的实际存储键
2. 解析每个键提取 `table_instance_id`（格式：`<kind>-<groupIndex>-<colCount>`，需迁移为 `kind:fieldIds=...`）
3. POST body 传递 `column_width_overrides` 对象给后端
4. 后端 `_get_column_width_override(table_instance_id)` 从请求体读取，而非自己计算

### 6.3 Reset Button UI

**问题**：`resetToEven()` 函数已实现，但无 UI 入口。

**方案**：在 `FormDesignerTab.vue` 工具栏"批量删除"按钮右侧添加"重置列宽"按钮。
- 单选表单：重置当前表单所有列宽
- 多选表单：批量重置所选表单列宽

### 6.4 regular_field 参与 Unified 权重计算

**问题**：当前 `planUnifiedColumnFractions` 仅 `inline_block` 参与 per-slot-max 聚合。

**方案**：扩展算法，`regular_field` 的 label/control 权重也贡献到对应 slot：

```javascript
function planUnifiedColumnFractions(segments, columnCount) {
  const slot_weights = Array(columnCount).fill(0)

  for (const seg of segments) {
    if (seg.type === 'inline_block') {
      const demands = buildInlineColumnDemands(seg.fields)
      for (let i = 0; i < demands.length && i < columnCount; i++) {
        slot_weights[i] = Math.max(slot_weights[i], demands[i].weight)
      }
    } else if (seg.type === 'regular_field') {
      // regular_field 贡献 label/control 权重到前两个 slot（或合并后的 slot）
      const labelWeight = computeTextWeight(seg.field.label)
      const controlWeight = buildInlineColumnDemands([seg.field])[0].weight
      // label 占第一个 slot，control 占第二个 slot
      slot_weights[0] = Math.max(slot_weights[0], labelWeight)
      slot_weights[1] = Math.max(slot_weights[1], controlWeight)
    }
  }

  const aggregated = slot_weights.map(w => Math.max(w, WEIGHT_ASCII * 4))
  return planWidth(aggregated, aggregated.reduce((a, b) => a + b, 0))
}
```

### 6.5 Mixed Unified Layout Alignment Strategy

**问题**：unified 布局中 inline_block 与 regular_field 混合时，两部分纵向框线可能不对齐。

**策略**："视觉尽量接近"——不强制对齐，但通过权重规划使两部分列宽尽量接近。

**实现**：
- inline_block 和 regular_field 的权重通过 per-slot-max 统一聚合
- 生成统一的 `<colgroup>` 控制物理列宽
- `colspan` 机制保证合并单元格跨列正确

### 6.6 迁移路径

**localStorage 键迁移**：
- 旧格式：`crf:designer:col-widths:<form_id>:<groupIndex>-<kind>-<colCount>`
- 新格式：`crf:designer:col-widths:<form_id>:<kind>:fieldIds=<ids>`

**迁移策略**：
1. 后端 API 返回字段 ID 列表，前端重建 `fieldIds`
2. 首次加载时检测旧键，迁移到新键后删除旧键
3. 兼容期：同时支持新旧格式读取

## 7. 上下文检查点

- 预期上下文占用：当前约 60K tokens（代码探索 + 分析）。执行阶段建议 `/clear` 后 `/ccg:spec-impl` 接续。

---
