# PRD: 设计器历史 busy/session 残留竞态修复

> Task: `07-14-designer-history-busy-residual`
> Status: planning
> Related archive: `.trellis/tasks/archive/2026-07/07-13-designer-history-busy-coordination`（`bb811cd` 已合入但完整度不足）

## 背景

`07-13-designer-history-busy-coordination` 已归档，首轮实现（`bb811cd`）解决了部分 busy/session 问题，但后续独立复核与隔离验证表明：**主分支仍缺多类残留竞态**。隔离工作树 `/tmp/crf-editor-history-current-head` 已完成更完整修复并通过前端全量回归，但因主工作区 `FormDesignerTab.vue` 存在并发脏改动（OID 等），**不能整文件套用补丁**。

本任务目标：把隔离验证过的残留修复，以 **surgical port（点状移植）** 方式合入当前主工作区，且不覆盖并发改动、不重开已归档任务。

## 问题陈述（用户可感知）

表单设计器在异步操作交错时可能出现：

1. 撤回进行中清空历史后，旧 entry 仍可能迁栈（部分已在主工作区补 generation，需确认并保留）。
2. 取消切表单 / 同表单重选 / 项目离开时，pending 切换未正确作废，或错误作废仍停留在原表单的命令。
3. 同表单 metadata 刷新时选中对象被整份替换，编辑上下文抖动。
4. 历史回放 / 排序持久化 / 草稿保存期间仍可离开表单或项目。
5. 先发起字段成员变更（增删复制草稿 log 行），再拖排序：旧 reload 覆盖乐观排序。
6. 快捷编辑 / 横向标记 / 属性保存在排序中重载列表，冲掉乐观顺序。
7. 本地草稿存在时 undo/redo 未先确认保存/丢弃/取消。
8. 后端写成功但上下文已过期时，未先失效目标缓存。

## 范围

### In scope

- `frontend/src/composables/useDesignerHistory.js`（generation / clear 语义；若主工作区已有则校验并保留）
- `frontend/src/components/FormDesignerTab.vue`（surgical only）
- 相关前端测试：
  - `frontend/tests/designerHistory.test.js`
  - `frontend/tests/designerFieldCopy.test.js`
  - `frontend/tests/orderingStructure.test.js`
  - `frontend/tests/quickEditBehavior.test.js`
  - 其他因结构断言失败而需最小适配的测试
- 文档同步：
  - `.trellis/spec/frontend/state-management.md`
  - `frontend/.claude/CLAUDE.md`（仅历史协调段落）
  - 本任务 `design.md` / `implement.md` 验收证据

### Out of scope

- 后端 API / payload 变更
- 字段复制 no-drift 语义重写（只保证兼容）
- `ef4f230` 乐观排序成功路径改为 reload
- 整文件替换 `FormDesignerTab.vue`
- 直接 `git apply` 隔离全量补丁到 main
- 改动无关并发任务（OID、aCRF 几何、列宽等）
- 主动 commit / push（除非用户明确授权）

## 约束

1. **后端契约不变**。
2. **不覆盖并发未提交改动**：移植前先 `git status` / diff，OID 等改动必须保留。
3. **保留** `ef4f230` 乐观排序：成功不 reload 列表。
4. **保留** 字段复制完整定义快照与 no-drift redo。
5. 拒绝 queue/rollback 式复杂调度；采用 token / counter / 入口拒绝 / 条件 reload。
6. 原任务已 archive：本任务是 residual，不修改 archive 目录语义。
7. 浏览器 smoke 若环境不可用，必须在验收中明确“未跑”。

## 需求

### R1. History generation

- `clear()` 推进单调 generation。
- 成功 undo/redo 仅在 generation 未变时迁栈。
- 失败始终恢复 ids 快照并 reject，即使 generation 已变（错误可观测）。

### R2. Selection session vs attempt

- `formSelectionSession`：仅真实提交选中表单，或当前选中表单消失时推进。
- `formSelectionAttempt`：取消/抢占 pending 切换；同表单重选与项目离开可推进 attempt 而不推进 committed session。
- 取消的切换不得使仍停留在原表单的命令过期。

### R3. Same-form reload identity

- `reloadForms()` 在选中表单仍存在时：不推进 session、不替换 `selectedForm` 引用，用 assign 刷新 metadata。

### R4. Stale backend success

- 写成功后先对目标 form fields（及必要时 field-definitions）`invalidateCache`，再做 stale UI 守卫。

### R5. Reorder ↔ membership mutual exclusion

- `fieldMembershipMutationCount` 标记成员变更飞行中。
- membership busy 时禁止开始 drag/keyboard reorder。
- 成员变更在 confirm 后与写成功后重检 `isReordering`；busy 时跳过当前列表 reload/UI 提交，但仍失效缓存。

### R6. Property / quick edit / inline during reorder

- 排序中不 `loadFormFields` 覆盖乐观顺序；可改为不可变字段同步或直接拒绝。

### R7. Leave guards

- history replay / reorder / draft save busy 时：阻止表单切换与项目离开。

### R8. Draft-aware history

- undo/redo 遇本地草稿：先保存/丢弃/取消确认；取消则不回放。

## 验收标准

- [ ] AC1: `useDesignerHistory` generation 行为有测试覆盖，且主工作区实现与测试一致。
- [ ] AC2: `selectForm` / `canLeaveProject` / `reloadForms` 满足 attempt/session 与 same-form identity 契约（结构或 runtime 测试）。
- [ ] AC3: 成员变更与排序双向互斥有测试；mutation-first / reorder-second 不再用旧 reload 冲掉乐观顺序。
- [ ] AC4: quickEdit / toggleInline / saveFieldProp / newField 在 reorder 下不破坏乐观顺序。
- [ ] AC5: draft-aware undo/redo 与 leave guards 有断言。
- [ ] AC6: 字段复制 no-drift 相关测试仍通过。
- [ ] AC7: `cd frontend && node --test tests/*.test.js` 全绿。
- [ ] AC8: lint 0 errors；`npm run build` 成功。
- [ ] AC9: diff 不含 backend / 无关重构；不破坏主工作区既有 OID 等并发改动。
- [ ] AC10: 文档（state-management / frontend CLAUDE）与实现一致；验收证据写入 `implement.md`。

## 非目标

- 不引入通用请求队列框架。
- 不重做属性编辑器 UX（显式保存/取消已由其他任务处理，仅协调竞态）。
- 不重新 archive 或修改 `07-13` 归档目录内容作为“未完成”伪装。

## 参考材料（新对话必读）

1. 隔离完整实现：`/tmp/crf-editor-history-current-head`
2. 隔离全量补丁（**仅参考，不可直接 apply 到 main**）：`/tmp/designer-history-busy-coordination-latest.patch`
3. 整合评估：`/tmp/crf-history-integration-assessment.md`
4. 主工作区已落地的 generation 小补丁：`/tmp/designer-history-generation-main-safe.patch`
5. 归档任务：`.trellis/tasks/archive/2026-07/07-13-designer-history-busy-coordination/`
6. 会话摘要线索：此前会话中 Codex 最终复核 High = mutation-first / reorder-second reload 覆盖乐观排序

## 交付后用户意图

用户将**新开对话**处理本任务。创建本任务后保持 `planning`，**不要** `task.py start`，直到新对话完成规划确认。

## 规划复核修订（2026-07-14）

Codex（超时回退）+ Antigravity + Claude 交叉复核后，已将下列项并入 `design.md` / `implement.md` / jsonl（**仍未 start、未改业务代码**）：

1. `saveFieldProp` 必须保留 main 的 `refreshKey.value++`；只包 `loadFormFields`。
2. OID 并发脏点清单：import + `addForm`/`updateForm`/`saveSelectedFieldProp`/`quickAddCodelist`/`quickSaveCodelist`。
3. 保留 helper 命名 `isCurrentDesignerHistoryContext`（不强制改隔离名）。
4. `newField` **不是** membership counter 路径；仅 busy/reorder 入口拒绝。
5. 测试补洞：`runHistory` 草稿确认后 stale 拦截 structure 断言；`designerFieldCopy` runtime arity。
6. `implement.jsonl` / `check.jsonl` 已去掉 placeholder，填入 spec + 只读参考路径。
7. 禁止清单补充：禁止回退 OID/`refreshKey`、禁止改乐观排序成功 reload、禁止改 copy no-drift。

启动门槛：用户确认本修订后，方可 `task.py start`。
