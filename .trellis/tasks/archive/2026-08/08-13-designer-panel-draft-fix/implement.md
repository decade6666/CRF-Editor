# 实施计划：设计器分隔与草稿保存修复

## 0. 前置条件

- **必须等 `08-13-toolbar-pane-alignment` 合入后再开始**：两者共用 `FormDesignerTab.vue`，禁止并行写（父任务 PRD 串行要求）。实施前 `git pull` 确认 toolbar 已合入、无冲突。
- 后端零改动：不碰 `backend/`；仅跑全量 pytest 回归。
- `frontend/dist/` 是 gitignore 旧构建：浏览器验证前必须 `npm run build` 并同步 dist（08-12 教训）。

## 1. 写操作清单

| 文件 | 操作 |
| --- | --- |
| `frontend/src/composables/formDesignerPropertyEditor.js` | `buildFieldProfileCommand` 扩展 + 新增 `DRAFT_DEFINITION_DIFF_KEYS` / `sameDraftDefinitionPayload` |
| `frontend/src/components/FormDesignerTab.vue` | `saveDraftField`（影响确认 + 闭包捕获 + undo/redo）+ scoped 样式（三面板边框 / 轨道分隔线 / 堆叠媒体块） |
| `frontend/tests/fieldProfileCommands.test.js` | 修改 + 新增（RED 起点） |
| `frontend/tests/designerNewFieldDraft.test.js` | 修改 + 新增（RED 起点） |
| `frontend/tests/designerHistory.test.js` | 新增用例 |
| `frontend/tests/paneSplit.test.js` | 新增用例（或新文件 `designerPaneBorders.test.js`） |

## 2. TDD：先红后绿（Phase 0 → 1-4）

### Phase 0（RED）

1. `fieldProfileCommands.test.js`：
   - 改 `new draft attaches existing definition when candidate selected`（:108-115）：候选快照与编辑态有差异 → `definition_operation.operation === 'update_shared'`、`target_definition_id === selectedDefinitionId`、`binding.mode === 'existing'`；
   - 新增：无差异 → `definition_operation === undefined`（实例级仍局部）；`sameDraftDefinitionPayload` 9 键契约（`is_multi_record`/`table_type` 差异不算变化 = 假阳性守卫；任一 9 键差异算变化）；共享更新载荷保留候选快照中的 `is_multi_record`/`table_type`；链接 + OID 改动仍分叉（现有 `draft fork` 用例保留）。
2. `designerNewFieldDraft.test.js`：新增 —— `saveDraftField` 从命令派生共享写入目标并调 `confirmFieldReferenceImpact`，取消/关闭 → `return false` 且草稿保留（无 POST、mutation 计数器未开启）；undo 闭包 `definitionChanged` 时先 `PUT /api/projects/${projectId}/field-definitions/${ids.fdId}`、立即失效字段定义缓存，再 `buildDeleteProfileCommand`，`cleanupDefinitionId` 仍由 `definitionCreated` 守卫；redo 闭包链接路径原样重放捕获命令（含 `update_shared`）、分叉路径保留 `create_or_restore` + `preferred_definition_id` 覆盖。
3. `designerHistory.test.js`：新增 saveDraftField 源级断言 —— 仍是单条 `'新建字段'` 记录（原子动作），undo 闭包内恢复与删除共存。
4. 边界（`paneSplit.test.js` 或新文件）：fields 含 `border-right: none; border-bottom: none;`；editor 含 `border-right: none; border-top: none;`；preview 含 `border-left: none;`；两轨道含 `::before` 1px 分隔线（`--color-border`）；面板规则**之后**存在堆叠媒体块（fields/editor 的 `border-right` 恢复、preview `border-left` 恢复、editor 保 `border-bottom`、preview `border-top: none`）；`.ff-item` 卡片 / `.ff-selected` 规则仍存在（字段条目不变守卫）。

定向确认 RED：`node --test tests/fieldProfileCommands.test.js tests/designerNewFieldDraft.test.js tests/designerHistory.test.js tests/paneSplit.test.js`

### Phase 1 — 命令层（最小实现）

`formDesignerPropertyEditor.js`：新增 9 键常量与 `sameDraftDefinitionPayload`；`buildFieldProfileCommand` 加 `candidateDefinitionPayload = null` 参数，候选链接成立且有差异时追加 `definition_operation.update_shared`。更新载荷用 `buildDefinitionPayload({ ...candidateDefinitionPayload, ...editorState })`，保留候选未暴露的 `is_multi_record` / `table_type`。

### Phase 2 — saveDraftField 接线

`FormDesignerTab.vue`：现有校验之后、`savingDraft.value = true` 之前构建命令（传 `candidateDefinitionPayload: candidateBeforeDefinition`）、派生 `definitionChanged`、按需 `confirmFieldReferenceImpact`（cancel/close → `return false`）；闭包捕获 `definitionChanged` / `restoreDefinitionPayload = candidateBeforeDefinition`。

### Phase 3 — undo/redo 闭包

按 design.md §4.2/§4.3 改写：undo 恢复先行、立即失效字段定义缓存、再删除实例；redo 链接路径原样重放、分叉路径保持现状。

### Phase 4 — 边界单线样式

按 design.md §6：三面板去内缘边框、两轨道 `::before` 分隔线、面板规则之后新增堆叠媒体块；`.ff-item` 零改动。

## 3. 验证（Phase 5）

1. 定向回归（全绿）：`cd frontend && node --test tests/fieldProfileCommands.test.js tests/designerNewFieldDraft.test.js tests/designerHistory.test.js tests/formDesignerPropertyEditor.runtime.test.js tests/paneSplit.test.js tests/orderingStructure.test.js tests/quickEditBehavior.test.js tests/designerFieldCopy.test.js`
2. 前端全量 `node --test tests/*.test.js`（基线 622 passed，不得下降）；lint 0 errors；`npm run build` 并同步 `frontend/dist/`。
3. 后端回归：`cd backend && python -m pytest`（基线 799 passed / 4 xfailed，证明零改动）。
4. 浏览器实机（环境不允许则明确标注未运行）：宽/窄屏 + 明暗主题下每组相邻区域仅一条 1px 分隔线，轨道 hover/拖拽正常，窄屏 editor 右外缘完整，字段条目交互不变；草稿全流程（候选链接 → 改定义级属性保存 → 定义被更新且显示最后编辑值，同时隐藏 legacy 列不变；仅改实例级属性 → 无确认、定义不变）；多表单共享候选确认取消 → 草稿保留；撤销一次恢复定义快照+删实例、重做一次重放+恢复，按钮与 Ctrl+Z/Y 正常；改 OID 分叉与现状一致；模拟 redo 前候选被外部删除时请求失败且历史命令保留可重试；无 console error。

## 4. 文档与收尾

- 同步 `frontend/.claude/CLAUDE.md`（草稿共享更新/历史与主面板单线契约）、根 `.claude/CLAUDE.md` 变更日志、`.claude/index.json`；若共享组件规范需要落盘，同步 `.trellis/spec/frontend/component-guidelines.md`。
- 不主动 commit；完成后按仓库流程走 PR（`worktree-admin-org-visit-flow-ui` 基分支），PR 说明与 toolbar 子任务的串行关系。
- 若实现偏离本设计，先返回规划修正文档，不以实现反向覆盖用户已确认的共享更新语义。
