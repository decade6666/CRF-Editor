# 字段库直接编辑引用字典内容

## Goal
在字段库（`FieldsTab.vue`）属性面板，当单选/多选类字段引用了选项字典（codelist）时，允许就地「编辑已引用字典」与「新增字典」，无需切换到「选项字典」Tab。补齐与表单设计器（`FormDesignerTab.vue` 已具备）一致的体验。

## Requirements
- 字段库属性面板中，当 `field_type` 为单选/多选/单选（纵向）/多选（纵向）时，`选项` 行在下拉旁提供两个图标按钮：
  - 「新增字典」：弹窗输入字典名称/描述 + 增删选项行（code/decode/后加下划线），保存后新字典写入并自动选中（`editProp.codelist_id = created.id`）。
  - 「编辑字典」：已选字典时可用；弹窗预填字典名称/描述/选项，支持改名/改描述/选项增删与「后加下划线」切换，保存走 `PUT /snapshot`。
- 编辑被字段引用的字典前，调用 `references` 并弹「影响提醒」确认（与设计器/CodelistsTab 语义一致）。
- 保存成功后：失效并重载 codelists 与 field-definitions 缓存、bump 全局 `refreshKey`，使字段库「单位/选项」列与其他 Tab 同步最新字典名/选项。
- 保存失败：刷新为最新字典数据并提示「请重新检查后再编辑」（与设计器一致），不静默吞错。
- editMode（简洁/完整）下，弹窗内 OID（option.code / codelist.code）按现有约定显隐，与 CodelistsTab 一致。
- 弹窗内不提供选项拖拽排序（与设计器现状一致；完整排序仍在选项字典 Tab）。

## Acceptance Criteria
- [ ] 字段库选中一个引用字典的单选/多选字段，可在不离开字段 Tab 的情况下编辑该字典内容并保存成功，列表「单位/选项」列随之更新。
- [ ] 「新增字典」可创建带选项的新字典，并把当前字段的 `选项` 自动指向新字典（仍需点「保存」持久化字段本身）。
- [ ] 编辑被多个字段引用的字典时出现「影响提醒」确认；取消则不提交。
- [ ] 保存失败时界面刷新为最新字典数据并给出明确错误提示，不破坏右侧编辑面板状态。
- [ ] 非单选/多选字段不显示字典编辑入口；未选字典时「编辑字典」禁用。
- [ ] 新增前端测试覆盖：入口显隐/禁用条件、保存调用 snapshot/create 与刷新链路接线。

## Definition of Done
- 前端 `node --test tests/*.test.js` 全绿，新增 FieldsTab 字典内联编辑接线测试。
- lint / build 通过。
- README / README.en / `frontend/.claude/CLAUDE.md` / 根 `.claude/CLAUDE.md` 变更日志按约定同步（字段库新增内联字典编辑能力）。

## Technical Approach
- 仅前端、仅 `FieldsTab.vue`；后端零改动（复用现有 `POST /codelists`、`PUT /codelists/{id}/snapshot`、`GET /codelists/{id}/references`）。
- 在 FieldsTab 内新增独立、精简的快速增/改字典状态与两个弹窗（参照设计器行为，但不 import 设计器、不改设计器）。
- 字典写操作完成后统一走「失效缓存 → 重载 load() → refreshKey++」刷新链路（FieldsTab.load 已同时拉取 field-definitions + codelists）。

## Decision (ADR-lite)
- **Context**：设计器已内联同等能力（约190行逻辑+弹窗内联在4159行的 FormDesignerTab），字段库仅有普通下拉。可选「抽取共享单元」或「字段库内独立实现」。
- **Decision**：字段库内独立实现一份，不改动设计器（用户在风险与 DRY 之间选择风险优先）。
- **Consequences**：字段库与设计器存在受控的逻辑重复；换取零回归风险地不触碰大文件设计器。后续如需统一，可再抽取 `useCodelistQuickEdit` 共享 composable + 弹窗组件（标记为未来改进）。

## Out of Scope
- 后端 API 改动、新增端点。
- 选项字典 Tab（`CodelistsTab.vue`）重构。
- 表单设计器（`FormDesignerTab.vue`）改动或抽取共享单元。
- 弹窗内选项拖拽排序。

## Technical Notes
- 参照源（仅读，不改）：`FormDesignerTab.vue` 行 1976-2170（quickAdd/quickEdit codelist 逻辑）+ 模板 `choice-codelist-row`（行 3285 起）。
- 目标文件：`frontend/src/components/FieldsTab.vue`（下拉行 231-235 → 增加图标按钮 + 两个弹窗 + 快速增改逻辑）。
- 刷新链路参照：FieldsTab `load()` / `reloadFields()`（行 40-50），全局 `refreshKey`（inject）。
- 测试参照：`frontend/tests/quickEditBehavior.test.js`、`searchRankingWiring.test.js` 等 node:test 接线测试风格。

## Implementation Plan（small steps）
- Step 1：在 FieldsTab 选项行加入「新增字典/编辑字典」图标按钮（显隐/禁用条件），落地两个弹窗骨架。
- Step 2：接入新增字典（create）+ 编辑字典（references 提醒 → snapshot）+ 刷新链路（失效缓存/重载/refreshKey）。
- Step 3：新增接线测试，跑通 node:test，同步 README 与模块文档/变更日志。
