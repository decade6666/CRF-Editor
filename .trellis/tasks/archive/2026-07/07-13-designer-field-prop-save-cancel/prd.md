# 设计器属性卡改为保存/取消与脏拦截（G3 / 需求 3）

> 父任务：`07-13-designer-fields-ux-batch`
> 复杂任务：本 PRD 之外需在 `task.py start` 前补 `design.md` + `implement.md`。

## Goal

将表单设计器属性编辑卡片从当前"自动保存（autosave）"模式改为显式"保存/取消"模式：常显保存/取消按钮，仅点保存才提交数据；离开有未保存修改的字段（切字段/关设计界面等）时弹窗拦截并可选择保存或取消；保存（含通过拦截弹窗保存）时若字段被多个表单引用，弹出与字段界面一致的影响提醒。

## Background and confirmed facts（当前 autosave 机制）

- 属性编辑器状态：`editProp` reactive（`FormDesignerTab.vue:1690-1706`）。
- 自动保存链：`watch(currentFieldPropDraftKey)`（`2038-2043`）+ `fieldPropSaveTimer` 防抖 + `saveFieldProp(snapshot, sessionId)`（`2115`）；草稿字段短路到 `applyEditorToDraft()` 本地写回（`2187`）。
- 离开 flush：`flushFieldPropSaveBeforeReset`（`1928`）→ `resolveFieldPropLeave`（`1969`）→ 失败时 `confirmDiscardFieldPropChanges`（`1872`，提供"继续编辑/丢弃并离开"）。
- 离开触发点：设计窗口 `before-close`（`handleDesignerBeforeClose:2742`）、切表单、切项目（`2704-2728` / `canLeaveProject:2730`）。
- 撤销/重做：属性保存会记录历史（属性历史回放 `replayFieldPropState`，见 `571-590`、`useDesignerHistory.js`）。
- 影响提醒范式：字段界面 `FieldsTab.vue:108-112` 保存前 `GET /field-definitions/{id}/references`，`refs.length` 时 `ElMessageBox.confirm('修改将影响以下表单：...')`。
- references 契约见父任务 D1：返回 `[{form_name, form_code}]`，无去重、无 form_id。

## Requirements

### R1 — 显式保存/取消（3.1）

- 属性卡常显"保存""取消"按钮。
- 编辑 `editProp` 不再自动提交；仅点"保存"才发起字段定义/实例更新请求（复用现有 `saveFieldProp` 的请求 payload 与语义）。
- "取消"将编辑器还原到当前选中字段的基准状态（`initialFieldPropState`），不发请求。
- 引入脏标记 `isDirty`（基准态与 `editProp` 深比较）；无修改时保存/取消可为禁用或无副作用。
- 草稿字段（新建未落库）语义保持：草稿仍走本地写回，不受"保存才提交"影响其既有创建流程（`saveDraftField` 顶栏保存不变）；需明确草稿态下属性卡按钮与草稿保存按钮的关系，避免双入口冲突。

### R2 — 离开拦截弹窗（3.2）

- 存在未保存属性修改（`isDirty`）时，切换到其他字段、关闭设计界面被拦截并弹窗提醒"字段属性修改未保存"。
- 弹窗提供"保存""取消"按钮（语义：保存=提交后继续执行被阻止的操作；取消=丢弃修改后继续执行被阻止的操作）；关闭弹窗/点 X = 留在原地不执行。
- 保存/取消后执行此前被阻止的动作（完成切字段 / 关闭窗口）。
- 复用/改造 `resolveFieldPropLeave` 承接切表单、切项目、before-close，语义统一为上述三态。

### R3 — 保存影响提醒（3.3）

- 点"保存"（含经 R2 拦截弹窗触发的保存）时，若字段被**多个表单**引用（父任务 D1 判定：去重后不同表单数 > 1），弹出与字段界面一致的影响提醒（复用 D2 文案与 `truncRefs`）；确认后再提交，取消则不提交并保持编辑态。
- 单表单或未引用时不弹影响提醒，直接保存。

### R4 — 兼容既有机制

- 撤销/重做仍能记录属性保存并正确回放；autosave 移除后历史仅在显式保存时入栈。
- 不破坏 `07-13-designer-history-busy-coordination` 的 busy 门控 / session 校验。
- 保存失败沿用现有错误提示；`missing_codelist`（单选/多选未选字典）等校验在保存点前置拦截并提示。
- 快速编辑弹窗 `saveQuickEdit`（实例级 label/颜色等）与本属性卡是不同入口，本任务不改其行为，但需确认两者不产生脏态歧义。

## Acceptance Criteria

- [ ] AC1（3.1）：修改属性后不点保存则数据不提交；点保存才 PUT；点取消还原基准态且不发请求。
- [ ] AC2（3.2）：`isDirty` 下切字段/关窗被拦截并弹"未保存"窗；选保存→提交后完成动作；选取消→丢弃后完成动作；关弹窗→留在原地。
- [ ] AC3（3.3）：字段被多个表单引用时保存（含弹窗内保存）弹出与字段界面一致的影响提醒；单/零表单不弹。
- [ ] AC4：撤销/重做对显式属性保存正确记录与回放；不再有 autosave 触发的历史噪音。
- [ ] AC5：切项目/关窗/切表单三条离开路径语义一致，无遗漏拦截或双弹窗。
- [ ] AC6：`node --test tests/*.test.js`（含 `formDesignerPropertyEditor.runtime.test.js`、`designerHistory.test.js`、`designerNewFieldDraft.test.js`）、`npm run lint`、`npm run build` 通过；新增覆盖脏拦截三态与影响提醒的回归。
- [ ] AC7：如可用浏览器验证，完成保存/取消/拦截弹窗/影响提醒的交互 smoke；否则说明未跑范围。

## Out of scope

- 字段界面（FieldsTab）侧改动属于 G4；本任务仅复用其 D1/D2 判定与文案。
- 后端字段更新接口、属性存储结构变更。
- 快速编辑弹窗（实例级）行为改造。

## Planning status

复杂任务，需 `design.md`（脏态基准管理、`resolveFieldPropLeave` 三态改造、autosave 拆除范围、与草稿/历史/切项目路径的交互矩阵）与 `implement.md`（TDD 顺序、回归清单、回滚点）后再 `start`。关键依赖父任务 D1（"多表单"判定落点）先在 G4 收敛或与 G4 同步定义共享。
