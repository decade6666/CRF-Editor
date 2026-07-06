# brainstorm: 搜索框模糊搜索排序规则

## Goal

统一修改 CRF Editor 前端所有搜索框的模糊搜索结果排序规则：搜索后优先展示完全匹配项；无法完全匹配、只能部分匹配的文本，按匹配文本长度从短到长展示，提升搜索结果的可预期性和定位效率。

## What I already know

* 用户要求修改所有搜索框的模糊搜索规则：
  * 优先完全匹配；
  * 仅能部分匹配的文本，按照文本长度从短到长显示。
* 这是前端列表过滤 / 排序行为变化，主要影响 Vue 组件中的 computed 过滤列表。
* 已通过代码搜索定位到主要搜索框：
  * `frontend/src/components/CodelistsTab.vue`：字典列表搜索 `searchCl`、右侧选项搜索 `searchOpt`。
  * `frontend/src/components/UnitsTab.vue`：单位列表搜索 `searchUnit`。
  * `frontend/src/components/FieldsTab.vue`：字段列表搜索 `searchField`。
  * `frontend/src/components/FormDesignerTab.vue`：表单列表搜索 `searchForm`、字段库搜索 `fieldSearch`。
  * `frontend/src/components/VisitsTab.vue`：访视列表搜索 `searchVisit`。
* 现状大多是 `includes()` 过滤；部分列表在过滤前会先按 `order_index` / `id` 排序。
* 搜索状态会禁用拖拽排序，相关逻辑依赖 `isFiltered` / `isFormsFiltered` 等布尔值，应保持不变。
* `CodelistsTab.vue` 的右侧选项列表当前用 `v-show` 过滤而不是 computed 列表，原因是“保留拖拽”；这里需要特别处理，避免破坏拖拽与显示序号语义。

## Assumptions (temporary)

* “完全匹配”默认理解为：某个参与搜索的字段文本在忽略大小写、trim 搜索词后与搜索词完全相等。
* “部分匹配文本长度”默认理解为：命中的具体字段文本长度，而不是整条记录所有字段拼接后的长度；如果一条记录多个字段命中，使用最短命中文本作为该记录排序依据。
* 无搜索词时保持原有顺序，不新增排序。
* 完全匹配组内部保持原有基础顺序；部分匹配同长度时也保持原有基础顺序，避免不必要的列表跳动。
* 该需求主要针对用户可见的前端搜索框，不包含后端数据库内部搜索或测试文件中的普通字符串匹配。

## Open Questions

* 无。

## Requirements (evolving)

* 所有用户可见搜索框在有搜索词时，搜索结果必须先展示完全匹配项。
* 仅部分匹配的结果必须按命中文本长度从短到长展示。
* 空搜索词时保持原有列表顺序。
* 搜索过滤状态、拖拽禁用状态、批量选择等现有交互语义保持不变。
* 修改应通过同一套前端搜索排序工具函数复用，避免多个组件复制不一致逻辑。
* 完全匹配判断：任一参与搜索字段在忽略大小写、trim 搜索词后与搜索词完全相等，即视为完全匹配。
* 部分匹配排序：一条记录若有多个字段部分命中，使用最短命中字段文本长度作为排序依据。
* 同一优先级与同一长度下保持输入列表原始稳定顺序。

## Acceptance Criteria (evolving)

* [ ] 字典、选项、单位、字段、表单、字段库、访视搜索均符合“完全匹配优先 + 部分匹配按长度升序”。
* [ ] 空搜索词时原有 `order_index` / `id` 或原数组顺序不变。
* [ ] 搜索时拖拽排序仍按现有规则禁用。
* [ ] 右侧选项搜索不破坏现有拖拽数据结构和选项操作。
* [ ] 增加或更新前端 source-level 测试覆盖统一排序规则与至少一个组件接入点。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 不改后端 API 搜索或数据库查询行为，除非后续发现用户可见搜索框依赖后端排序。
* 不调整搜索框 UI 样式、占位符、字段展示列。
* 不改变拖拽排序、批量删除、选择状态的业务规则。

## Technical Approach

Add a small pure frontend helper in `frontend/src/composables/` for ranked fuzzy search. Components pass their current base-ordered list plus candidate text extractors; the helper filters and returns stable ranked matches. Each search box keeps its existing empty-search behavior and existing `isFiltered` drag-disable logic.

Ranking order when keyword is non-empty:

1. Exact match exists in any candidate field.
2. Partial matches sorted by shortest matched candidate text length.
3. Stable fallback to original input index.

## Decision (ADR-lite)

**Context**: Search filtering is currently implemented separately in multiple Vue components with local `includes()` logic. Applying a behavior change independently in each component risks drift and makes future search boxes inconsistent.

**Decision**: Use a shared pure frontend search ranking helper and wire all current user-visible search boxes to it.

**Consequences**: The change has one reusable rule source and is easier to test. Components still need explicit candidate-field mapping, so each list controls which fields participate in search.

## Technical Notes

* Code search command: `rg -n "filterText|searchKeyword|searchQuery|filtered[A-Za-z]*|includes\\(" frontend/src/components frontend/src/composables frontend/tests`.
* Main search implementation files:
  * `frontend/src/components/FormDesignerTab.vue:52` `filteredForms`；`frontend/src/components/FormDesignerTab.vue:663` `filteredFieldDefs`。
  * `frontend/src/components/CodelistsTab.vue:16` `filteredCodelists`；`frontend/src/components/CodelistsTab.vue:292` option `v-show` filter。
  * `frontend/src/components/FieldsTab.vue:55` `visibleFields`。
  * `frontend/src/components/UnitsTab.vue:17` `visibleUnits`。
  * `frontend/src/components/VisitsTab.vue:46` `filteredVisits`。
* Potential implementation direction:
  * Add a small pure helper in `frontend/src/composables/` such as `searchRanking.js` / `useSearchRanking.js`.
  * Helper accepts items, keyword, candidate text extractor(s), and an optional base-sort/preordered input.
  * Helper returns matches ordered by exact-match rank first, then shortest matched candidate text length, then original input index for stable ordering.
* Existing tests likely suitable for source-level contracts:
  * `frontend/tests/orderingStructure.test.js` already checks filtered list / drag-handle structure.
  * A new focused test file may be clearer for pure helper behavior and component source wiring.
