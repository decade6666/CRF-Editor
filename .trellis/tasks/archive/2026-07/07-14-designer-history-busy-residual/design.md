# Design: 设计器历史 busy/session 残留竞态修复

> Task: `07-14-designer-history-busy-residual`
> Depends on archive: `07-13-designer-history-busy-coordination` (`bb811cd` baseline + residual gaps)

## 1. 设计目标

在**不改后端契约**、**不覆盖并发 FormDesignerTab 改动**的前提下，把隔离树已验证的协调语义点状移植到当前主分支 `FormDesignerTab.vue` + `useDesignerHistory.js`。

核心原则：

- **Token 优于队列**：session / attempt / generation / membership counter
- **写成功先失效缓存，再决定能否动当前 UI**
- **乐观排序成功不 reload**（兼容 `ef4f230`）
- **入口拒绝 + 条件 reload**，不做全局请求中间件

## 2. 边界

| 层 | 职责 |
|---|---|
| `useDesignerHistory` | busy 锁、generation、record 拒绝、迁栈条件、失败 reject |
| `FormDesignerTab` | history context、selection session/attempt、membership counter、leave/draft/reorder 协调 |
| 测试 | structure 契约 + 少量 runtime（copy） |
| 文档 | state-management 契约与 frontend CLAUDE 摘要 |

## 3. 关键设计

### 3.1 History generation（composable）

```
generation: number  // 闭包变量，非 ref
clear() -> generation++, 清空双栈
undo/redo 成功后: if replayGeneration !== generation: 不迁栈; 仍 finally busy=false
undo/redo 失败: 恢复 ids 快照; throw; 即使 generation 已变也要 throw
```

主工作区可能已有 generation 小修；移植时 **diff 后保留/对齐**，避免重复或回退。

### 3.2 History context

```
captureDesignerHistoryContext() -> { formId, sessionId: formSelectionSession } | null
// 主工作区现名 isCurrentDesignerHistoryContext；隔离树曾用 isDesignerHistoryContextCurrent。
// 移植策略：保留 main 命名，禁止为对齐隔离而全仓重命名（除非同步改完所有 structure 测试）。
isCurrentDesignerHistoryContext(ctx) -> session 与当前 selectedForm.id 双匹配
recordDesignerHistory(ctx, entry) -> 先 current 再 designerHistory.record
```

所有 8 类历史 entry 必须走 wrapper（排序/新增/复制/删除/批量删除/编辑属性/新建字段/log 行）。

### 3.3 Selection: committed session vs attempt

```
formSelectionSession     // 已提交上下文
formSelectionAttempt     // pending 切换尝试
invalidateFormSelectionSession() // 两者同时 +1
isFormSelectionAttemptCurrent(attempt, session, projectId)
```

`selectForm(next)` 语义：

1. 同 form id：只 `formSelectionAttempt++`（取消旧 pending），return；**不**推进 session。
2. replay/reorder/draft-save busy：attempt++，恢复 current row，return。
3. 捕获 `selectionSession`、`projectId`，`selectionAttempt = ++formSelectionAttempt`。
4. 每个 cancelable await 后校验 attempt/session/project。
5. 全部 leave guard 通过后：`invalidateFormSelectionSession()`，再提交 `selectedForm`。

`canLeaveProject`：busy 时 false；否则 attempt++ 取消 pending form switch，再走 draft/annotation/notes/field-prop。

`reloadForms`：选中仍在则 `Object.assign` + 列表 map 回同一引用；消失才 invalidate + 清空。

### 3.4 Stale backend success

顺序固定：

```
await api.write(...)
api.invalidateCache(target)
if (!isCurrentDesignerHistoryContext(ctx)) return
// 仅此时允许 loadFormFields / selectField / record history
```

适用：add/copy/remove/batchDelete/saveDraft/addLogRow/persistFieldReorder（及 quickEdit/toggle 的 formId 捕获版）。

`persistFieldReorder` 成功路径：invalidate 后须再检 context，再 `recordReorderHistory`；失败路径仅在 current 时恢复本地列表 + `loadFormFields`。

### 3.5 Membership ↔ reorder

```
fieldMembershipMutationCount: ref(0)
isFieldMembershipBusy()
beginFieldMembershipMutation() / endFieldMembershipMutation()
```

- **Membership 路径（计 counter）**：`addField` / `copyFormField` / `removeField` / `batchDelete` / `saveDraftField` / `addLogRow` 共 6 条。
  - `begin` 在 `try` 外、网络窗口入口；`end` 必须在 `finally`（`return` 于 `try` 内仍会 end，防泄漏）。
  - confirm / await 后、begin 前：若已 `isReordering` → return（尚未 begin）。
  - 写成功后若 `isReordering`：`invalidateCache` 后 return，不 `loadFormFields` / 不改乐观 UI。
- **非 membership 路径**：`newField` **不** begin/end counter；仅入口拒绝 `designerHistory.busy || isReordering`（本地草稿插入，无成员写网）。
- `persistFieldReorder` / drag start / drop / keyboard move：`isFieldMembershipBusy()` 时拒绝。
- template `:draggable` 同步禁用 membership busy。

### 3.6 Property / quick / inline

- `saveFieldProp`：`if (!isReordering) await loadFormFields()`。
  - **并发保护区**：main 在非日志行分支已有 `refreshKey.value++`（字段库刷新）；移植时只改 reload 条件，**严禁删除/覆盖该行**。
  - **文案**：保留 main 的 `字段属性保存上下文已变更`，不要改成隔离树的 `自动保存上下文已变更`。
- `saveQuickEdit` / `toggleInline`：入口拒 reorder；成功后按捕获 formId invalidate；reorder 中则 immutable sync，不 reload。
- `newField`：busy 或 reorder 时拒绝（避免失败回滚静默丢草稿）；**不是** membership counter 路径（见 3.5）。

### 3.7 Draft-aware runHistory

```
if busy || reordering || savingDraft: return
capture context
if hasDraft: confirm; recheck context; if !proceed return
await undo/redo; catch 提示并可选 reload
```

## 4. 与主分支现状的关系

主分支已有（`bb811cd` 等）：

- 部分 history context / record wrapper
- busy 时 record false
- 部分 invalidate + context check

主分支仍缺（本任务重点）：

- attempt/session 分离与 selectForm 重写
- reloadForms identity
- membership counter 双向互斥
- leave / draft-aware history
- quickEdit/toggle/newField reorder 保护
- generation（可能已有，需对齐测试）

并发脏文件（2026-07-14 复核实测，main 相对 HEAD 约 +19 行）：

| 区 | 位置 | 移植约束 |
|---|---|---|
| OID import | `import { isValidOptionalOid, isValidRequiredOid, OID_ERROR } from '../composables/oidValidation'` | 禁止删除/改动 |
| OID 守卫 | `addForm` / `updateForm` / `saveSelectedFieldProp` / `quickAddCodelist` / `quickSaveCodelist` | 禁止回退 |
| 字段库刷新 | `saveFieldProp` 非日志行分支 `refreshKey.value++` | 禁止删除；仅包 `loadFormFields` |
| 错误文案 | `字段属性保存上下文已变更` | 保留 main，勿对齐隔离文案 |
| helper 命名 | `isCurrentDesignerHistoryContext` | 保留 main 命名 |

移植时 **只改协调相关符号/函数**，禁止整文件拷贝隔离树版本；禁止为对齐隔离而重命名已有 helper（除非全测同步且收益明确）。

## 5. 数据流（stale completion）

```
[Action A on form X] -> write OK -> invalidate cache(X)
                     -> context still X? 
                        yes -> reload UI / record
                        no  -> stop (cache already fresh for next load)
```

```
[Membership M starts] -> begin counter
[Reorder R tries]     -> counter>0? reject
[M completes]         -> invalidate; if reordering: no reload; end counter
```

```
[reloadForms same form still exists]
  -> Object.assign(selectedForm, refreshed) + list map 回同一引用
  -> 不 invalidate session（避免 watch(selectedForm) 误触发 loadFormFields 冲乐观序）
[selected form disappeared]
  -> invalidateFormSelectionSession(); clear selection
```

## 6. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 与 OID / `refreshKey++` 并发改动冲突 | surgical edit；`saveFieldProp` 只改 reload 条件；改前 `git diff` 核对 |
| structure 测试过严绑死旧实现 | 更新断言匹配最终语义，不弱化行为；注意 `:draggable` 字符串与 busy 守卫正则 |
| 复制 runtime 参数数量变化 | 同步 `designerFieldCopy.test.js` createRuntime（arity 随 membership 依赖扩展） |
| `runHistory` 草稿确认后 stale 无测试 | 补 structure 断言：confirm 后 `isCurrentDesignerHistoryContext` 再回放 |
| 误 apply 隔离全量 patch | implement 明确禁止；以当前 main 文件为 base |
| helper 无谓重命名 | 保留 `isCurrentDesignerHistoryContext` |

回滚：按文件 `git checkout -- <file>` 恢复本任务改动；不 revert 已 archive 的 `bb811cd`。

## 7. 验证策略

1. focused：上述 4 个测试文件  
2. full：`node --test tests/*.test.js`  
3. lint / build  
4. `git diff` 审查：无 backend、无无关格式化（禁止 `npm run format`）  
5. 浏览器 smoke 可选；不可用则记录未跑

## 8. 参考实现位置

- 语义权威：`/tmp/crf-editor-history-current-head/frontend/src/components/FormDesignerTab.vue`
- composable 权威：同树 `useDesignerHistory.js`
- **禁止**把上述文件整份复制到 main
