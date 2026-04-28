---
change: align-word-export-to-preview-widths-and-underlines
type: design
status: ready
created: 2026-04-01
---

# Design: 对齐 Word 导出与预览的列宽与下划线语义

## 1. 决策冻结

本次规划冻结以下约束，实施阶段不得再引入同级替代规则：

1. **唯一对齐基准 = FormDesigner**
   - 预览行为以 `frontend/src/components/FormDesignerTab.vue` 所代表的设计器预览为唯一基准。
   - 其他页面或历史导出结果不作为并列基准。

2. **unified 多 inline block 的列宽聚合 = 按列槽位取最大**
   - 同一张 unified 横向表内部只有一个列宽规划作用域。
   - 当存在多个 inline block 时，同一列槽位的需求取各 block 对该槽位需求的最大值。
   - 不允许把多个 block 的需求简单顺序拼接成超长向量，也不允许每个 block 各自独立定义冲突的列宽比例。

3. **`trailing_underscore` = 共享语义 + 兼容层**
   - `trailing_underscore` 的高层含义是“选项标签后附带可见填写线语义”。
   - 具体到 Word 导出时允许保留兼容呈现方式，但兼容层不得反向定义高层语义。
   - 语义层与渲染层必须分离。

4. **多行 `default_value` = 全部统一多行**
   - 预览与导出对同一字段的 `default_value` 均按多行语义处理。
   - 不再按上下文拆分成单行/多行两套规则。

5. **现有布局分类与页宽预算保持不变**
   - `mixed + max_block_width > 4` 仍是 unified 横向布局的触发边界。
   - portrait / landscape 既有页面宽度预算不改变。
   - 本次仅调整宽度规划与可见填写线语义，不调整页面几何。

---

## 2. 问题陈述

当前导出与预览围绕同一 CRF 结构工作，但尚未共享同一层“可见内容语义”，导致存在三个直接用户可见的问题：

1. **横向表格列宽不一致**
   - 预览更接近浏览器内容驱动分配。
   - 导出路径仍存在固定预算下的简化规划与等宽回退。
   - 结果是长中文标签、长选项标签、带填写线语义的列在 Word 中可能被压缩得像短标签一样窄。

2. **choice 选项标签与尾部线之间出现异常视觉符号**
   - 当前导出把选项标签与尾部下划线以固定文本片段拼接。
   - 这种做法会把“语义上的尾部填写线”过早退化成“字面字符序列”，从而引入 Word 端不稳定视觉效果。

3. **文本填写线长度不反映预览语义**
   - 预览倾向于把填写线看作视觉元素。
   - 导出路径仍有多个位置使用固定数量的下划线字符。
   - 同样带填写线语义的内容在不同上下文中呈现长度缺乏一致性。

本次 change 的目标不是像素级复刻浏览器布局，而是在现有结构边界内建立一套稳定、可测试、可复用的共享语义规则。

---

## 3. 现状证据

### 3.1 后端已有部分共享语义基础

`backend/src/services/width_planning.py` 已经定义了确定性字符权重与填写线权重，例如：

- 中文字符权重
- ASCII 字符权重
- 填写线权重
- choice atom 权重

这说明系统已经具备“按可见内容需求估算列宽”的基础能力。

`backend/src/services/field_rendering.py` 也已经在部分路径上把 choice / trailing fill line 视为宽度需求的一部分，而不是仅看字段标题或简单值字符串。

### 3.2 导出主路径尚未完整消费这些语义

`backend/src/services/export_service.py` 仍是当前问题最集中的表面实现：

- unified 横向表只在规划结果与物理列数严格匹配时才应用规划，否则回退到等宽。
- legacy inline 路径主要仍以 `headers + row_values` 为输入，未统一吸收 choice / fill-line / unit / 多行默认值等可见语义。
- `trailing_underscore` 在多个 choice 路径中仍被具体化为固定数量的下划线字符片段。

因此当前问题并不是“完全没有规划器”，而是“已有语义没有被导出主路径一致消费”。

### 3.3 前端已有对齐参考，但并非完整显式宽度系统

`frontend/src/components/FormDesignerTab.vue` 已具备与宽度规划相关的辅助逻辑，并承担用户已确认的唯一对齐基准角色。

`frontend/src/styles/main.css` 中预览表格当前仍主要依赖浏览器表格布局能力。浏览器能天然根据内容形成视觉分配，但这并不等于前端已经持有一套可直接复制到 Word 的固定列宽数值系统。

因此正确的对齐层不是“复制浏览器像素结果”，而是“复用同一套可见内容语义”。

---

## 4. 设计目标

### 4.1 必须达到的目标

- 让导出横向表列宽更接近 FormDesigner 预览的可见内容分配趋势。
- 让 unified 横向表中的多个 inline block 共享同一张表级列宽语义。
- 让 `trailing_underscore` 在预览与导出中都由同一高层语义驱动。
- 让多行 `default_value` 在预览与导出中不再分裂。
- 在既有 portrait / landscape 页宽预算内完成规划。

### 4.2 明确不是目标的内容

- 不是像素级还原浏览器 auto layout。
- 不重写 unified / inline 布局分类逻辑。
- 不改数据库 schema、导入流程或字段业务语义。
- 不把前后端强行抽成共享运行时代码。
- 不改变页面几何、纸张方向或既有宽度预算。

---

## 5. 核心方案

## 5.1 共享语义层：Visible Content Demand

本次 change 的核心不是新增另一套布局模式，而是把现有导出与预览都收束到同一层“可见内容需求”语义。

建议在设计层冻结以下概念：

```text
VisibleContentDemand
  - semantic_kind: label | value | choice_atom | fill_line | unit | literal
  - display_text: string
  - weight: number

ColumnDemand
  - slot_index: integer
  - intrinsic_weight: number
  - min_weight: number

WidthPlan
  - scope: one horizontal table
  - column_count: integer
  - column_demands: ColumnDemand[]
  - normalized_fractions: number[]
  - fallback: none | scale_to_fit
```

含义：

- `scope` 固定为“一张横向表”，不允许在 unified 内按 block 再次分裂。
- `intrinsic_weight` 由可见内容语义计算，不再只依赖 header 或裸值字符串。
- `normalized_fractions` 必须在固定页宽预算内归一化。
- `fallback` 仅允许 `scale_to_fit`，不允许退回等宽。

## 5.2 字符权重与填写线语义

宽度需求继续建立在确定性字符权重上，而不是运行时字体测量：

- 中文字符需求大于 ASCII 字符需求。
- 标点、数字、英文均使用稳定常量计权。
- 填写线需求由语义常量表达，而不是直接把最终渲染字符数量当作语义本体。

这意味着：

- 规划器关心“需要一段视觉填写线”，而不是“必须是 6 个下划线”。
- Word 中可以用兼容表现层来落地这段语义。
- 前端也可以用边框、容器宽度或其他视觉方式落地同一语义。

## 5.3 unified 横向表：按列槽位取最大

对于 unified 横向表，规划阶段冻结以下规则：

1. 先建立全表级 `N` 列网格。
2. 扫描所有普通字段段、inline block 段与其他参与横向宽度竞争的内容。
3. 对于每个 `slot_index`，收集来自所有 segment 的需求。
4. 同一 `slot_index` 的最终需求取最大值。
5. 基于 `N` 个槽位需求统一归一化并映射到固定页宽预算。

这样可以保证：

- 后出现的长标签 block 能真实拉宽对应槽位。
- 早出现的短标签 block 不会因为先被扫描就固化整表比例。
- 不会再因为“拼接多个 block 的列向量”导致结果长度与物理列数失配。

## 5.4 legacy inline 路径：改为消费可见内容语义

对于 legacy inline 横向表，规划不再只看：

- header 文本
- row value 文本

而应额外纳入：

- choice atom 的最长可见需求
- 文本填写线语义
- 单位追加后的可见需求
- 多行默认值语义
- 必要时的最小宽度保护

目标不是让 legacy inline 和 unified 使用同一份代码，而是让两者遵守同一套语义输入规则。

## 5.5 `trailing_underscore`：共享语义 + 兼容层

本次设计明确区分两层：

### 语义层

`trailing_underscore` 表示：

- 该选项标签后应附带一段可见填写线
- 该填写线属于该选项显示单元的一部分
- 该选项标签与填写线必须视为一个稳定视觉原子

### 兼容层

Word 导出阶段允许继续使用兼容实现来呈现尾部填写线，但兼容层必须满足：

- 不引入额外异常视觉符号
- 不让标签与填写线在布局层分离
- 不把“6 个下划线”回写成高层语义定义

这一定义允许实施阶段在不改变业务含义的前提下，替换具体 Word run / no-break / underline 组合方式。

## 5.6 choice atom：渲染原子化

所有 choice 路径共享同一条行为规则：

```text
choice_atom := choice_symbol + label + optional trailing_fill_line
```

约束：

- `choice_atom` 内部不可拆分。
- 横向 choice 中，多个 atom 之间可以换行，但单个 atom 内部不能换行。
- 纵向 choice 中，每个 atom 自成一行，但标签与尾线仍不可分离。

这条规则同时约束：

- `单选`
- `多选`
- `单选（纵向）`
- `多选（纵向）`

## 5.7 多行 `default_value` 统一

当前规划冻结：

- 预览中的 `default_value` 若包含多行语义，则导出必须保持同样的多行语义。
- 导出中的 `default_value` 不得再为了节省空间回退为单行简化语义。
- 多行值对列宽需求的贡献按其可见最长行与整体多行存在性共同决定。

这项规则的意义不是把所有多行文本都变成更宽，而是确保：

- 预览与导出的换行语义一致
- 相关填写线长度/列宽需求来源一致

## 5.8 前端作用面控制

虽然 canonical preview 是 FormDesigner，但本次前端改动面仍应保持最小：

- 优先限制在 `frontend/src/components/FormDesignerTab.vue`
- 如需共享 HTML 渲染语义，则只在 `frontend/src/composables/useCRFRenderer.js` 增补必要辅助
- 样式调整仅限于支撑列宽输出与 choice atom no-wrap 的必要样式

不扩大到无关页面。

---

## 6. 文件影响矩阵

| 文件 | 变更类型 | 规划说明 |
|---|---|---|
| `backend/src/services/width_planning.py` | 修改 | 固化可见内容需求、槽位聚合与 scale-to-fit 规则 |
| `backend/src/services/field_rendering.py` | 修改或复用 | 提供更接近用户可见内容的语义输入 |
| `backend/src/services/export_service.py` | 修改 | 让 legacy inline 与 unified 都消费共享语义，并修正 choice atom 输出 |
| `backend/tests/test_width_planning.py` | 修改 | 覆盖槽位聚合、预算安全、比例与幂等性 |
| `backend/tests/test_export_unified.py` | 修改 | 覆盖 unified 表级共享语义与回归行为 |
| `frontend/src/components/FormDesignerTab.vue` | 视需要修改 | 作为唯一 canonical preview 对齐层输出显式宽度语义 |
| `frontend/src/composables/useCRFRenderer.js` | 视需要修改 | 统一 choice atom 与填写线相关 HTML 语义 |
| `frontend/src/styles/main.css` | 视需要修改 | 支撑 no-wrap atom 与列宽表达 |

---

## 7. PBT / 不变式

### P1. 宽度预算安全
- **性质**：任意横向表最终列宽总和不得超过对应页面预算。
- **反例方向**：随机生成超长中文、超长英文、混合 choice atom、带多行默认值的横表输入。

### P2. 槽位最大需求单调性
- **性质**：在 unified 横向表中，如果某槽位新增一个更大的可见需求，则该槽位最终宽度不得变小。
- **反例方向**：构造多个 inline block，对同一槽位逐步增加标签长度或 choice atom 长度。

### P3. unified 共享作用域一致性
- **性质**：同一 unified 表中的多个 inline block 受同一份 `WidthPlan` 约束。
- **反例方向**：构造前后两个 block，验证后者不会因独立重算而产生第二套冲突比例。

### P4. 比例回退保持相对关系
- **性质**：当超预算触发 `scale_to_fit` 时，较高需求槽位的最终宽度仍不小于较低需求槽位。
- **反例方向**：构造极端长短列组合，验证不会退化为等宽。

### P5. trailing token 原子完整性
- **性质**：任意带 `trailing_underscore` 的选项，其标签与尾部填写线在预览和导出结果中都不可分离。
- **反例方向**：随机生成横向/纵向 choice 组合与长短标签，检查不会出现标签与尾线分离结构。

### P6. 多行默认值一致性
- **性质**：同一多行 `default_value` 在预览与导出中保留相同的多行语义类别。
- **反例方向**：构造单行、多行、尾部空行、混合中英文多行值，验证不会一端多行一端单行。

### P7. 规划幂等性
- **性质**：对同一语义输入重复执行宽度规划，结果完全一致。
- **反例方向**：多次重复运行同一组 inline / unified 输入。

---

## 8. 风险与缓解

| 风险 | 说明 | 缓解 |
|---|---|---|
| 浏览器与 Word 布局机制不同 | 无法像素级一致 | 以共享语义与趋势一致为验收标准 |
| unified 作用域实现不当 | 仍可能回退到等宽 | 明确以 `N` 个槽位聚合，不允许拼接超长向量 |
| compatibility layer 定义不清 | 继续把下划线字符当高层语义 | 在 spec 中显式分离语义层与兼容层 |
| 多行默认值扩大影响面 | 可能同时影响预览与导出多个上下文 | 通过统一规则与针对性测试锁定边界 |
| 前端改动扩散 | 影响非 FormDesigner 页面 | 将 canonical preview 作用面限制在 FormDesigner 及必要共享渲染辅助 |

---

## 9. 实施边界

本次规划明确不做以下事情：

- 不修改数据库 schema。
- 不改变导入流程或表单业务含义。
- 不发明新的布局模式。
- 不改变 unified 触发条件。
- 不把前后端实现强制抽成共享运行时代码。
- 不在 planning 阶段修改任何源码。

---

## 10. 验收映射

- **横向表列宽更接近预览趋势**
  - 由共享 `Visible Content Demand` 与统一 `WidthPlan` 达成。

- **多个 inline block 共享同一张表的列宽语义**
  - 由“按列槽位取最大”的 unified 聚合规则达成。

- **choice 标签与尾部填写线不再出现异常分离或视觉伪影**
  - 由 `trailing_underscore = 共享语义 + 兼容层` 与 `choice_atom` 原子化达成。

- **多行默认值语义在预览与导出中一致**
  - 由统一多行规则与相关回归测试达成。

- **现有布局边界与页宽预算不被破坏**
  - 由实施边界与预算安全性质约束保证。
