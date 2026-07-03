# 双击序号快速编辑（选项/单位/字段/表单/访视）

## Goal

在表单设计画布之外的各列表界面（选项、单位、字段、表单、访视），允许用户**双击「序号」单元格**直接输入目标序号，把该行快速移动到指定位置——作为长列表场景下「拖拽排序」的高效补充。表单设计画布因双击已被 `openQuickEdit` 占用而排除。

## What I already know

- 目标列表全部使用 `el-table` / `draggable`，序号列模板为 `<span class="ordinal-cell">{{ row.order_index }}</span>`（访视用 `row.sequence`）。
- 现有排序交互统一走 `useSortableTable.js`（拖拽 `.drag-handle` → 重排 `order_index` → `POST reorderUrl(ids[])`）。
- **复用现有 reorder 端点即可，无需后端改动**：移动一行到第 N 位后重算完整 id 顺序再 POST。
- 过滤/搜索状态下拖拽被禁用（`isFiltered`），且序号可能显示 `$index+1` 而非真实 order。
- 表单设计画布已用 `@dblclick="openQuickEdit(...)"`（FormDesignerTab.vue:2485+），故排除该界面。

### 各列表与 reorder 端点
| 列表 | 组件 | 序号字段 | reorder 端点 | payload |
|---|---|---|---|---|
| 数据字典 | CodelistsTab | order_index | `/api/projects/{pid}/codelists/reorder` | `ids[]` |
| 选项 | CodelistsTab | order_index | `/api/projects/{pid}/codelists/{cid}/options/reorder` | `ids[]` |
| 单位 | UnitsTab | order_index | `/api/projects/{pid}/units/reorder` | `ids[]` |
| 字段 | FieldsTab | order_index | `/api/projects/{pid}/field-definitions/reorder` | `ids[]` |
| 访视 | VisitsTab | sequence | `/api/projects/{pid}/visits/reorder` | `ids[]` |
| 访视内表单 | VisitsTab | sequence | `/api/visits/{vid}/forms/reorder` | `ids[]` |
| 表单 | FormDesignerTab(左侧列表 2419) | order_index | `/api/projects/{pid}/forms/reorder` | `ids[]` |
| 字段实例（画布，排除） | FormDesignerTab(2849) | order_index | `/api/forms/{fid}/fields/reorder` | `{ordered_ids}` |

## Assumptions (temporary)

- 「表单」= 表单列表（FormDesignerTab 左侧 2419 的 el-table），**不是**设计画布里的字段实例。
- 交互：双击序号 → 原地变为数字输入框（el-input-number，范围 1..N）→ Enter 确认 / Esc / 失焦取消 → 移动该行到目标位 → 复用 reorder 端点持久化。
- 过滤/搜索激活时禁用双击编辑（与拖拽一致），因为此时序号非真实全序。
- 抽取一个共享 composable（如 `useOrdinalQuickEdit.js`）供各 tab 复用，符合「可复用逻辑入 composables」约定。

## Open Questions

- (已澄清) 选项界面：数据字典列表 + 选项列表**两张表都覆盖**。
- (已澄清) 访视界面：访视列表 + 访视内表单序号**都覆盖**。
- (已澄清) 过滤/搜索激活时**禁用**双击编辑。

## Final Scope — 7 个列表（4 个组件）

| # | 列表 | 组件 | 容器 | 序号字段 | reorder 端点 |
|---|---|---|---|---|---|
| 1 | 数据字典 | CodelistsTab | el-table | order_index | `/api/projects/{pid}/codelists/reorder` |
| 2 | 选项 | CodelistsTab | el-table | order_index | `/api/projects/{pid}/codelists/{cid}/options/reorder` |
| 3 | 单位 | UnitsTab | el-table | order_index | `/api/projects/{pid}/units/reorder` |
| 4 | 字段 | FieldsTab | el-table | order_index | `/api/projects/{pid}/field-definitions/reorder` |
| 5 | 访视 | VisitsTab | el-table | sequence | `/api/projects/{pid}/visits/reorder` |
| 6 | 访视内表单 | VisitsTab | draggable(flex) | sequence | `/api/visits/{vid}/forms/reorder` |
| 7 | 表单 | FormDesignerTab(左侧 2419) | el-table | order_index | `/api/projects/{pid}/forms/reorder` |

排除：表单设计画布字段实例（2849，双击已用于 `openQuickEdit`）。

## Requirements (evolving)

- [ ] 上述 7 个列表的序号列支持双击进入快速编辑
- [ ] 输入目标序号后行移动到对应位置并持久化（复用现有 reorder 端点，POST id 数组）
- [ ] 表单设计画布（字段实例）不受影响
- [ ] 过滤/搜索激活时禁用双击编辑

## Acceptance Criteria (evolving)

- [ ] 双击序号 → 出现数字输入框，初始值为当前序号
- [ ] 输入 1..N 内整数 + Enter → 行移动到该位置，列表重排，序号连续
- [ ] Esc / 失焦 → 取消，序号还原
- [ ] 越界 / 非法输入 → 钳制或拒绝，不发请求
- [ ] reorder 失败 → 提示并恢复顺序（沿用现有 `ElMessage.warning('排序保存失败，已恢复')`）
- [ ] 过滤/搜索状态下不可进入快速编辑

## Definition of Done (team quality bar)

- 新增 composable + 各组件接线有 `node:test` 回归
- `npm run lint` / `node --test tests/*.test.js` 全绿
- 同步 frontend `.claude/CLAUDE.md` 与根 `.claude/CLAUDE.md`（如约定变化）
- 不破坏现有拖拽排序、草稿态禁排序、editMode 显隐等既有行为

## Out of Scope (explicit)

- 表单设计画布字段实例的序号编辑（双击已用于 openQuickEdit）
- 后端 reorder 接口改动
- 拖拽排序逻辑重写

## Technical Approach

- 新增共享 composable `useOrdinalQuickEdit.js`，参数与 `useSortableTable` 对齐（`sourceList` / `reorderUrl` / `reloadFn` / `isFiltered` / `renderList`），暴露：
  - `editingId` / `draftValue`：当前编辑行与输入值
  - `begin(row)`：进入编辑（isFiltered 时拒绝）
  - `commit()`：钳制 1..N，目标==当前则 no-op；否则把行 splice 到目标位、重算连续序号、`POST reorderUrl(ids[])`，失败 `ElMessage.warning('排序保存失败，已恢复')` + reload 恢复
  - `cancel()`：还原
- 各组件序号列模板：静态 span 增加 `@dblclick="begin(row)"`，编辑态条件渲染 `el-input-number`（`:min=1 :max=N` + `@keyup.enter=commit` + `@blur=cancel` + Esc）。
- el-table 6 个 + draggable(flex) 1 个共用同一 composable，仅模板渲染差异。
- 草稿态（FormDesignerTab）/ isFiltered 守卫保留，与拖拽禁用条件一致。

## Decision (ADR-lite)

**Context**: 7 个列表的「移动到位 N」逻辑完全相同，项目约定可复用逻辑入 composables。
**Decision**: 抽取单一 `useOrdinalQuickEdit.js`，复用现有 reorder 端点（无后端改动），移动算法 = splice 到 (targetSeq-1) + 重算连续序号 + POST id 数组。
**Consequences**: 与拖拽排序同源、行为一致、无 undo（与列表拖拽现状一致，仅设计画布有 undo 且已排除）；后续如需键盘入口或批量改序，可在该 composable 扩展。

## Technical Notes

- 移动算法：从当前 index 取出目标行，splice 到 (targetSeq-1)，`forEach` 重算 `order_index`/`sequence`，POST ids。
- 测试：composable 纯逻辑单测（commit/cancel/clamp/no-op/失败恢复）+ 各组件接线 smoke（`node:test`，沿用 testProperty 风格）。
- 文档同步：frontend `.claude/CLAUDE.md`「Ordering interactions」约定追加 `useOrdinalQuickEdit`。
