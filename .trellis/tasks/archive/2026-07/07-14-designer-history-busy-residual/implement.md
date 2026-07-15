# Implement: 设计器历史 busy/session 残留竞态修复

> Task: `07-14-designer-history-busy-residual`
> Mode: surgical port from isolation tree → current main worktree
> Do **not** `task.py start` until user confirms plan after planning-doc review

## 0. 新对话启动检查清单（必做）

```bash
cd /root/github/CRF-Editor
python3 ./.trellis/scripts/task.py current --source
# 应指向: .trellis/tasks/07-14-designer-history-busy-residual

git status --short
git log -3 --oneline
git diff HEAD -- frontend/src/components/FormDesignerTab.vue | head -n 120

# 只读参考（不要 apply 到 main）
ls -la /tmp/crf-editor-history-current-head
ls -la /tmp/designer-history-busy-coordination-latest.patch
ls -la /tmp/designer-history-generation-main-safe.patch
cat /tmp/crf-history-integration-assessment.md | head -n 80
```

确认：

- [ ] 当前任务是 residual，不是 archive 的 07-13
- [ ] 主工作区 `FormDesignerTab.vue` 并发改动列表已知（OID + `refreshKey++`）
- [ ] 规划已含碰撞区/命名策略/jsonl（2026-07-14 复核修订）
- [ ] 用户已确认开始实施（`task.py start`）后再写代码

## 1. 实施顺序

### Step A — 对齐 composable

文件：`frontend/src/composables/useDesignerHistory.js`

- [ ] 核对 main 已有 generation / clear / 成功迁栈守卫 / 失败 throw（预期 **no-op**）
- [ ] 若缺失：移植隔离树等价实现
- [ ] 测试：`designerHistory.test.js` 中 clear 成功/失败用例仍绿
- [ ] **不要**为“对齐隔离”改无关 API

### Step B — FormDesignerTab surgical port

文件：`frontend/src/components/FormDesignerTab.vue`  
**规则：只改下列符号与其调用点；保留 OID 等并发插入**

#### B.0 碰撞区硬约束（移植前再 diff 一次）

| 禁止 | 详情 |
|---|---|
| 删除 OID import | `isValidOptionalOid` / `isValidRequiredOid` / `OID_ERROR` |
| 回退 OID 守卫 | `addForm` / `updateForm` / `saveSelectedFieldProp` / `quickAddCodelist` / `quickSaveCodelist` |
| 删除 `refreshKey.value++` | `saveFieldProp` 非日志行定义更新分支（字段库刷新） |
| 改错误文案 | 保留 `字段属性保存上下文已变更` |
| 无谓重命名 | 保留 `isCurrentDesignerHistoryContext`（不要改成隔离的 `isDesignerHistoryContextCurrent`，除非全测同步且有明确收益） |
| 整函数盲替换 `saveFieldProp` | 只改 `loadFormFields` 条件包裹 |

#### B.1 helpers

- [ ] `formSelectionAttempt`（与 `formSelectionSession` 并列）
- [ ] `invalidateFormSelectionSession`：session **与** attempt 同时 +1
- [ ] `isFormSelectionAttemptCurrent(attempt, session, projectId)`
- [ ] `fieldMembershipMutationCount` + `begin` / `end` / `isFieldMembershipBusy`
- [ ] 历史 context 继续用 **main 名** `isCurrentDesignerHistoryContext`（语义对齐隔离）

#### B.2 `reloadForms` identity

- [ ] 选中表单仍在：`Object.assign(selectedForm.value, refreshed)` + list map 回同一引用
- [ ] **不**推进 session（避免 `watch(selectedForm)` → `loadFormFields` 冲乐观序）
- [ ] 选中消失：invalidate + 清空 fields/selection

#### B.3 `selectForm` attempt/session/busy leave

- [ ] 同 form id：只 `formSelectionAttempt++`，return；**不**推进 session
- [ ] replay/reorder/`savingDraft` busy：attempt++，恢复 current row，return
- [ ] 捕获 session/project，`selectionAttempt = ++formSelectionAttempt`
- [ ] 每个 cancelable await 后 `isFormSelectionAttemptCurrent`
- [ ] leave guard 全通过后：`invalidateFormSelectionSession()` 再提交 `selectedForm`
- [ ] **不碰** OID 相关代码路径

#### B.4 `canLeaveProject`

- [ ] `busy || isReordering || savingDraft` → false
- [ ] 否则 `formSelectionAttempt++` 取消 pending form switch
- [ ] 再走 draft / annotation / notes / field-prop

#### B.5 `runHistory` draft/busy

- [ ] 入口：`busy || isReordering || savingDraft` → return
- [ ] 有草稿：`confirmDiscardDraft`；确认后 **`isCurrentDesignerHistoryContext` 再回放**
- [ ] 取消 / stale → 不回放

#### B.6 membership mutations（仅 6 条写路径）

对 `addField` / `copyFormField` / `removeField` / `batchDelete` / `saveDraftField` / `addLogRow`：

- [ ] confirm 后、begin 前：若 `isReordering` → return
- [ ] `begin` → `try { write; invalidate; context/reorder 守卫; UI/record } finally { end }`
- [ ] 写成功且 reorder 中：invalidate 后 return，不 reload
- [ ] **`newField` 不 begin/end**；仅 `if (busy || isReordering) return`

#### B.7 reorder 路径

- [ ] `persistFieldReorder`：membership busy 拒绝；成功 invalidate 后 **重检 context** 再 record
- [ ] drag start / drop / keyboard move：membership busy 拒绝
- [ ] template `:draggable` 含 `!isFieldMembershipBusy()`

#### B.8 property / quick / inline / newField

- [ ] `saveFieldProp`：`if (!isReordering.value) await loadFormFields();`  
      **并保留** 非日志行分支的 `refreshKey.value++`（在颜色 patch 前/后按现有位置，勿丢）
- [ ] `saveQuickEdit` / `toggleInline`：入口拒 reorder；成功按 formId invalidate；reorder 中 immutable sync
- [ ] `newField`：busy/reorder 拒绝

参考对照：`/tmp/crf-editor-history-current-head/frontend/src/components/FormDesignerTab.vue`  
**禁止** `cp` 整文件；**禁止** `git apply /tmp/designer-history-busy-coordination-latest.patch`。

### Step C — 测试适配

- [ ] `frontend/tests/designerHistory.test.js`
  - generation 已有则保持
  - busy/reorder/membership 守卫正则与最终源码一致
  - **补**：`runHistory` 在 `confirmDiscardDraft` 后对 stale context 的拦截断言（structure）
  - `:draggable` 字符串含 membership busy
- [ ] `frontend/tests/designerFieldCopy.test.js`：`createRuntime` 注入 begin/end/isReordering 等，**arity 与依赖表同步**
- [ ] `frontend/tests/orderingStructure.test.js`：reorder + membership busy 结构断言
- [ ] `frontend/tests/quickEditBehavior.test.js`：quick/toggle/canLeave 结构断言
- [ ] `frontend/tests/formDesignerPropertyEditor.runtime.test.js`：**不得**因丢 `refreshKey++` 而红
- [ ] 若 full suite 暴露其它 structure 测试：最小修复

### Step D — 文档

- [ ] `.trellis/spec/frontend/state-management.md`：attempt/session、membership↔reorder、stale cache、reloadForms identity
- [ ] `frontend/.claude/CLAUDE.md`：历史协调摘要（与并发 CLAUDE 脏改动合并，勿整段覆盖）
- [ ] 本文件勾选 + 验证证据

### Step E — 验证命令

```bash
cd frontend
node --test tests/designerHistory.test.js tests/designerFieldCopy.test.js \
  tests/orderingStructure.test.js tests/quickEditBehavior.test.js \
  tests/formDesignerPropertyEditor.runtime.test.js
node --test tests/*.test.js
npm run lint
npm run build
# 禁止: npm run format
git diff HEAD -- frontend/src/components/FormDesignerTab.vue | rg -n "refreshKey|oidValidation|OID_ERROR|isValidOptionalOid|isValidRequiredOid" || true
```

- [ ] focused 全绿
- [ ] full 全绿
- [ ] lint 0 errors
- [ ] build 成功
- [ ] `git diff --check`
- [ ] 人工 diff review：无 backend、无 OID/`refreshKey` 回退、无无关格式化

### Step F — 收尾（仅用户授权后）

- [ ] 独立 code review（可选 Codex / code-reviewer）
- [ ] commit（用户明确要求时）
- [ ] `task.py` finish / archive

## 2. 明确禁止

1. `git apply /tmp/designer-history-busy-coordination-latest.patch` 到 main  
2. 整文件覆盖 `FormDesignerTab.vue`  
3. `npm run format`  
4. 未授权 commit / push / force push  
5. 修改 `.trellis/tasks/archive/2026-07/07-13-designer-history-busy-coordination/` 内容以“重开”旧任务  
6. 与 Claude 同时让 Codex 写同一文件  
7. 回退 OID 校验或 `saveFieldProp` 的 `refreshKey.value++`  
8. 把乐观排序成功路径改回 list reload（破坏 `ef4f230`）  
9. 改字段复制 no-drift redo 语义  
10. 无必要重命名 `isCurrentDesignerHistoryContext`

## 3. 建议提交信息（授权后）

```
fix(designer): 补齐历史 busy/session 残留竞态与排序成员互斥
```

## 4. 验收证据（实施后填写）

| 项 | 结果 | 备注 |
|---|---|---|
| focused tests | **pass** | residual 相关 131 pass（含 designerHistory/fieldCopy/ordering/quickEdit/newFieldDraft/propertyEditor）；check 修复 `functionBody` 对解构参数误解析 |
| full frontend tests | **490 pass / 0 fail** | `cd frontend && node --test tests/*.test.js`（2026-07-14 check 回合复跑） |
| lint | **0 errors** | 既有 warnings only（~2093 prettier）；未跑 `npm run format` |
| build | **success** | `npm run build` ~27s（check 回合复跑） |
| browser smoke | **已跑（关键路径 PASS）** | 登录 DECADE → 项目「通用表单」→ 表单「知情同意」→ 设计器：① 新建字段草稿 + 保存按钮出现 + 删除草稿确认；② 空历史时撤回/恢复 disabled；③ 空闲字段 `draggable=true`；④ 字段库添加「出生日期」后字段 6→7、撤回→6、恢复→7 再撤回清理；⑤ 草稿关闭触发「未保存草稿」保存/丢弃提示。源码静态 14/14 仍 PASS。 |
| concurrent OID preserved | **yes** | diff 仍含 oidValidation import + 5 处守卫 |
| refreshKey++ preserved | **yes** | `saveFieldProp` 非日志行分支保留 |
| leave guard 形态 | **note** | `canLeaveProject`/`canLeaveTab` 委托 `resolveDesignerLeave`；App.vue `:before-leave` 挂 `canLeaveTab` |

## 5. 关键 API 速查（移植时对照）

| 符号 | 作用 | 备注 |
|---|---|---|
| `formSelectionSession` | 已提交表单上下文 | 仅真实提交选中或选中消失时推进 |
| `formSelectionAttempt` | pending 切换令牌 | 同表重选 / leave / busy 可只 +attempt |
| `fieldMembershipMutationCount` | 成员变更飞行计数 | 仅 6 条写路径 |
| `captureDesignerHistoryContext` | {formId, sessionId} | |
| `isCurrentDesignerHistoryContext` | 是否仍可改当前 UI / 入栈 | **main 命名，保留** |
| `isFormSelectionAttemptCurrent` | pending 切换是否仍有效 | 新增 |
| `begin/endFieldMembershipMutation` | 排序互斥占坑 | 新增；`newField` 不用 |

## 6. 已知主分支缺口摘要（移植优先级）

P0: generation（**已有**，Step A 核对）  
P0: selectForm attempt/session + reloadForms identity  
P0: membership↔reorder（mutation-first / reorder-second）  
P1: leave guards + draft-aware runHistory（含 confirm 后 stale 断言）  
P1: quickEdit/toggle/newField/saveFieldProp reorder（**保 refreshKey++**）  
P1: 测试与文档  

## 7. 联系材料路径

- PRD: `prd.md`（本目录）
- Design: `design.md`
- Isolation tree: `/tmp/crf-editor-history-current-head`
- Assessment: `/tmp/crf-history-integration-assessment.md`
- Review notes: 2026-07-14 Codex(超时回退)+AGY+Claude 交叉复核已并入本文与 design.md
