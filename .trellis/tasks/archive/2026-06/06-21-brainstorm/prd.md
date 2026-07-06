# brainstorm: 删除字段后仍出现在字段库

## Goal

修复这样一个前端一致性问题：在字段界面删除字段后，表单设计界面左侧“字段库”不应继续显示已删除字段，避免用户看到过期数据并误以为字段仍可用。

## What I already know

* 字段管理页和表单设计页是两个独立组件：`frontend/src/components/FieldsTab.vue` 与 `frontend/src/components/FormDesignerTab.vue`。
* 字段管理页通过 `reloadFields()` 主动失效并重载 `/api/projects/${props.projectId}/field-definitions` 缓存：`frontend/src/components/FieldsTab.vue:46`。
* 字段管理页删除字段定义后，会调用 `api.del(/api/field-definitions/:id)`，随后执行 `reloadFields()`：`frontend/src/components/FieldsTab.vue:110`。
* 表单设计页左侧“字段库”直接渲染 `filteredFieldDefs`，其数据源是 `fieldDefs.value`：`frontend/src/components/FormDesignerTab.vue:661`、`frontend/src/components/FormDesignerTab.vue:2682`。
* 表单设计页字段定义通过 `loadFieldDefs()` 使用 `api.cachedGet()` 单独加载：`frontend/src/components/FormDesignerTab.vue:118`。
* 表单设计页虽然监听了 `refreshKey`，但只会在收到刷新信号时重载 `fieldDefs`：`frontend/src/components/FormDesignerTab.vue:193`。
* 当前 `App.vue` 只在切换到“字段库”页签时失效字段定义缓存并递增 `refreshKey`，未对切回“表单设计”提供对称刷新：`frontend/src/App.vue:204`。
* 因此，问题大概率不是删除接口失败，而是表单设计器持有了过期字段定义缓存，且缺少“从字段页回到设计页”的刷新触发。

## Assumptions (temporary)

* 该问题描述中的“删除字段”指的是在 `FieldsTab.vue` 删除字段定义，不是删除表单中的字段实例。
* 当前后端删除字段定义接口已经正确删除数据，问题主要在前端缓存/刷新链路。
* 已确认的刷新目标是：删除字段后，用户切回“表单设计”页或重新打开设计器时，左侧字段库应刷新并移除已删除字段。

## Open Questions

* 无阻塞性问题。实现阶段按项目现有前端测试习惯补充一条回归测试，不再单独作为需求决策项。

## Requirements (evolving)

* 字段定义删除后，表单设计器左侧字段库不能继续展示该字段。
* 本次范围不仅覆盖删除，也统一覆盖字段定义的新增 / 编辑 / 复制 / 删除：在字段页完成这些变更后，切回“表单设计”页或重新打开设计器时，字段库都必须刷新到最新后端状态。
* 修复应沿用现有 `useApi` 缓存失效 / 重载模式，不新增全局状态库。
* 保持字段管理页与表单设计页对同一份字段定义数据的展示一致。

## Acceptance Criteria (evolving)

* [x] 已确认刷新时机：切回表单设计页刷新。
* [x] 已确认范围：统一覆盖字段定义的新增 / 编辑 / 复制 / 删除。
* [ ] 在字段界面删除某字段后，切回“表单设计”页或重新打开设计器时，左侧字段库不再显示该字段。
* [ ] 在字段界面对字段进行新增 / 编辑 / 复制后，切回“表单设计”页或重新打开设计器时，左侧字段库能反映最新状态。
* [ ] 修复后不影响字段新增、复制、搜索、拖拽等现有字段库行为。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 不改变字段删除的后端语义。
* 不重构整个前端缓存架构或引入新的全局状态管理方案。
* 不顺带调整字段库 UI 样式或交互文案。
* 暂不要求“字段页删除时，已打开的设计器实时热更新”，除非后续明确纳入范围。

## Research Notes

### What similar patterns already exist in this repo

* `FieldsTab.vue` 在字段数据发生变化后，会先失效字段定义缓存，再主动重载自身列表。
* `FormDesignerTab.vue` 已有 `refreshKey` 监听器，说明项目已有跨页签刷新信号机制。
* `App.vue` 目前只在切换到“字段库”时触发字段定义缓存刷新，说明已有 tab 级别的刷新入口，但覆盖面不完整。

### Constraints from our repo/project

* 前端没有 Vuex / Pinia，全局同步应优先复用 `provide/inject` + `refreshKey` 现有模式。
* 设计器辅助数据（字段、字典、单位）采用懒加载；刷新时需要避免破坏设计器当前表单状态。
* 需求目标是修复数据新鲜度问题，不应扩大成缓存架构重构。

### Feasible approaches here

**Approach A: 切回设计页时失效并刷新字段定义** (Current preference)

* How it works: 从字段页返回设计页时，失效 `field-definitions` 缓存并触发 `refreshKey`，让 `FormDesignerTab` 复用现有 watcher 重载字段库。
* Pros: 最贴合现有实现模式，改动小，风险低。
* Cons: 只有在切页或重开设计器时生效，不是实时同步。

**Approach B: 字段页变更后广播统一刷新信号**

* How it works: 字段页新增/编辑/复制/删除成功后，直接发出跨组件刷新信号，设计器若已挂载则同步刷新字段库。
* Pros: 一致性更强，已打开的设计器也能更新。
* Cons: 需要补足跨组件协作路径，范围更大。

## Technical Notes

* 重点排查文件：`frontend/src/components/FieldsTab.vue`、`frontend/src/components/FormDesignerTab.vue`、`frontend/src/App.vue`。
* 已确认字段管理页删除后会主动刷新自身列表；表单设计页则依赖单独的 `fieldDefs` 缓存和 `refreshKey` 触发。
* 当前是 brainstorm / PRD 阶段，尚未开始实现。
