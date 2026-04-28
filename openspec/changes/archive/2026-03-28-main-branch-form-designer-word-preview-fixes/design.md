## Context

当前变更聚焦于 `main` 分支上的“表单设计 / Word 预览”修复，但真正需要收敛的是跨前后端的数据语义，而不仅是界面布局。现有问题包含 6 个相互关联的点：选项尾部下划线对齐、非表格字段单行覆盖值、设计器 HTML 模拟预览增强、`design_notes` 右侧展示、字典名称修改后的联动刷新、字段单位清空失败。

本次规划基于以下事实与约束：
- 用户已确认本次在当前 `main` 分支修改。
- 设计期预览继续采用 HTML 模拟，不引入 Word 截图 / COM 实时链路。
- **表格 / inline 场景**继续保持现有语义：只要字段存在 `default_value`，它就会覆盖该表格单元中的所有字段类型，不加字段类型白名单。
- **非表格场景**下，覆盖值仍仅允许用于普通文本类字段，不允许用于选项类、标签、日志行等非支持字段。
- 当字段从 `inline_mark=1` 切换为 `0` 时，不再把“清空 `default_value`”作为本次变更的既定规则；该状态迁移应与当前代码实现保持一致，即不额外清空已存值。
- 选项类字段在**非表格场景**下不允许覆盖值；预览与导出都应继续按字典选项 / 占位符规则渲染。
- `design_notes` 仅作用于设计期预览右侧备注区域，不进入最终导出文档。
- `trailing_underscore` 的一致性边界包含模板导入链路，导入后也必须保留该语义。

多模型分析结果：
- Codex 后端分析已完成，确认本次核心不是新增后端能力，而是冻结 `default_value` / `inline_mark` / choice / import / unit clear 的契约，避免预览与导出继续分叉。
- Gemini 前端分析按要求多次重试，但持续遭遇模型容量 429 与 CLI `AttachConsole failed` 异常，未得到可用结果。因此本设计中的前端可维护性约束，依据 proposal、仓内现有 OpenSpec 模板、代码扫描证据与用户显式确认收敛。

## Goals / Non-Goals

**Goals:**
- 统一前端 HTML 预览与后端导出在选项尾部下划线、choice 占位、普通字段覆盖值边界上的关键语义。
- 明确 `default_value` 在本次变更中的双层语义：在表格 / inline 场景中继续作为所有字段类型的单元格覆盖值来源；在非表格场景中仅作为普通文本类字段的单行覆盖值来源。
- 以当前代码实现为准，不再将“`inline_mark` 关闭时清空 `default_value`”视为本次必须保持的规则；避免规范继续与实现和用户确认冲突。
- 在设计器预览中以右侧备注区域展示 `design_notes`，并扩大预览容器、压缩正文宽度。
- 修复字典名称快速编辑后的属性面板、预览与当前编辑态联动刷新。
- 修复字段单位清空流程，显式提交 `unit_id: null` 并在回读后保持为空。
- 将 `trailing_underscore` 语义扩展到模板导入保真，避免导入后预览/导出失真。

**Non-Goals:**
- 不新增第二套预览数据结构或新的实时预览 API。
- 不新增 `FormField.display_override` 等新数据库字段。
- 不允许选项类字段在**非表格场景**使用覆盖值，也不改变 choice 字段以字典/占位渲染为主的既有语义。
- 不把 `design_notes` 写入最终导出文档。
- 不整体重写导出系统、导入系统或设计器架构。
- 不恢复与本需求无关的独立 CRUD / Tab / Word 截图链路。

## Decisions

### 1. 继续复用 `FormField.default_value`，并区分表格与非表格语义
- **Decision**: 本次不新增数据库列，继续复用 `FormField.default_value`；但明确区分两层语义：表格 / inline 场景中继续对所有字段类型生效，非表格场景中仅作为普通文本类字段的**单行覆盖值**。
- **Rationale**: 这是当前代码结构下最小可行方案，既保持现有表格能力不变，又把非表格扩展边界写死，避免扩大到 schema migration。
- **Alternatives considered**:
  - 新增专用列如 `display_override`：长期更清晰，但超出本次修复范围。
  - 只做前端临时状态不持久化：不满足“保存后重新加载仍能读回”的需求。

### 2. `inline_mark` 状态迁移以当前实现与新约束为准
- **Decision**: 本次不再坚持“字段从 `inline_mark=1` 切换为 `0` 时清空 `default_value`”这一旧规则；计划应与当前实现和最新用户约束保持一致，不额外清空已存的 `default_value`。
- **Rationale**: 你已确认表格内默认值覆盖所有字段类型的现有语义应保持不变，而当前代码也已移除 clear-on-disable 逻辑；继续保留旧规则只会制造规范/实现/测试三方冲突。
- **Alternatives considered**:
  - 强制清空：与当前实现和最新约束冲突。
  - 按字段类型分流：会增加额外隐式规则，不符合本次最小变更目标。

### 3. 选项类字段仅在非表格场景排除覆盖值，继续以字典/占位规则渲染
- **Decision**: choice 字段不纳入**非表格**覆盖值适用范围；前端预览与后端导出都继续以字典选项、`trailing_underscore` 与“无字典时下划线占位符”为准。表格 / inline 场景则保持现有 `default_value` 覆盖所有字段类型的规则不变。
- **Rationale**: 这样既保留现有表格行为，又能消除非表格预览与导出在选项字段上的优先级分叉。
- **Alternatives considered**:
  - 允许 choice 字段覆盖值优先显示：灵活但会显著扩大规则矩阵与回归面。

### 4. `design_notes` 仅用于设计期右侧备注区域
- **Decision**: `design_notes` 只在设计器 HTML 模拟预览中显示于右侧备注区域，不进入最终导出文档。
- **Rationale**: 用户已明确确认；后端现有 `design_notes` CRUD / copy 契约已足够，无需扩展导出语义。
- **Alternatives considered**:
  - 同步写入导出：会扩大后端导出范围，与本次目标不符。

### 5. 预览与导出共享 choice / placeholder / trailing_underscore 语义
- **Decision**: 前端 HTML 预览必须与后端导出对齐以下规则：
  - choice 字段无字典或无选项时显示下划线占位符；
  - `trailing_underscore=1` 仅影响尾部填写线语义，不改变选项文本与顺序；
  - 选项尾部下划线在同组中保持一致的起始对齐规则。
- **Rationale**: 本次变更的核心成功标准之一就是消除“设计器看到 A，导出得到 B”的规则分叉。
- **Alternatives considered**:
  - 只修前端视觉：无法满足“前后端语义更一致”的目标。

### 6. 单位清空必须显式提交 `unit_id: null`
- **Decision**: 字段保存请求中，清空单位必须显式发送 `unit_id: null`；保存成功后以前后端回读结果覆盖本地状态。
- **Rationale**: 后端 schema 与 router 已支持 nullable 外键；关键在于前端必须准确表达“主动清空”。
- **Alternatives considered**:
  - 省略字段：无法表达 clear intent。
  - 传空字符串：语义不稳定且依赖后端容错。

### 7. `trailing_underscore` 一致性边界包含模板导入
- **Decision**: 若模板或导入源中的 `CodeListOption.trailing_underscore` 已存在，导入到目标项目后必须保真。
- **Rationale**: 否则用户在设计器和导出中看到的尾线规则会因为导入动作而悄悄丢失，违背“一致性修复”的定义。
- **Alternatives considered**:
  - 仅修当前编辑与导出链路：实现更小，但会保留显著的跨链路数据损失缺陷。

### 8. 用可验证不变式约束实现
- **Decision**: 本次 specs 与 tasks 显式记录以下 PBT / 可验证属性：
  - 非表格非支持字段类型永远不出现覆盖值入口；
  - 表格 / inline 场景中 `default_value` 对所有字段类型的覆盖语义保持不变；
  - non-inline 普通字段持久化的覆盖值始终为单行；
  - `inline_mark` 状态迁移与当前实现保持一致且幂等；
  - `unit_id: null` round-trip 后仍为空；
  - `trailing_underscore` 只影响尾线显示，不影响选项文本和顺序；
  - 模板导入后 `trailing_underscore` 保真。
- **Rationale**: 这些性质是后续实现、测试与 review 的机械执行基线。

## Risks / Trade-offs

- **[`default_value` 仍然一列多义] → Mitigation**: 不做 schema 扩张，但把“表格全类型覆盖”和“非表格文本类单行覆盖”的双层边界写死。
- **[仅前端修视觉导致继续分叉] → Mitigation**: specs 中强制要求前端预览与后端导出共享 choice / placeholder / trailing_underscore 语义。
- **[`inline_mark` 状态迁移继续漂移] → Mitigation**: 让 OpenSpec、测试与当前实现统一到同一规则，避免规范继续要求 clear-on-disable。
- **[导入链路遗漏 `trailing_underscore`] → Mitigation**: 将导入保真纳入本次 scope 与任务分解，不允许作为后续 TBD。
- **[单位清空表面成功、刷新回弹] → Mitigation**: 成功标准以“请求显式 null + 回读仍为空”为准，而不是仅看本地 UI。
- **[Gemini 前端分析缺失] → Mitigation**: 限制设计为最小增量、复用现有预览链路与 OpenSpec 模板，不引入新抽象或新状态层。

## Migration Plan

1. 先生成 `design.md`、`specs/*.md`、`tasks.md`，冻结契约与任务顺序。
2. 实施时优先收敛字段覆盖值、choice 占位和 `trailing_underscore` 的共享语义，再调整设计器 UI 入口与预览布局。
3. 随后修复字典联动刷新与单位清空，保证保存→回读一致。
4. 最后补充模板导入保真和针对上述规则的自动化验证。
5. 本次无数据库迁移脚本；若实施失败，回滚策略为撤销相关前后端局部变更，不影响现有基础 CRUD 能力。

## Open Questions

- 无阻塞性开放问题；用户已完成所有关键歧义确认。
- 已记录的非阻塞缺口：Gemini 前端分析由于外部容量/CLI 异常未返回，本规划已用本地代码证据与用户确认约束替代。