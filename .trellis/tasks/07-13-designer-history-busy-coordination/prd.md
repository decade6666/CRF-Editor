# 设计器历史命令与 busy / 表单 session 协调

## Goal

消除 `FormDesignerTab.vue` 中会写入撤销栈的异步命令与撤销/重做回放锁、表单切换 session 之间的竞态，确保历史栈只接收当前表单、当前选择会话且不与回放并发的命令。

该问题是项目既有健壮性缺陷，由 `07-13-designer-field-copy` 的交叉审查发现，不是字段复制功能单独引入。

## Background and confirmed facts

### Defect A：回放期间仍可写入历史栈（原审查严重度 High）

- `frontend/src/composables/useDesignerHistory.js:33-36,59-91` 在 `undo()` / `redo()` 回放期间令 `busy=true`，并仅通过 `canUndo` / `canRedo` 阻止再次回放。
- `frontend/src/composables/useDesignerHistory.js:45-57` 的 `record()` 当前不检查 `busy`；若异步命令在回放窗口内完成并调用 `record()`，会同时改写 undo / redo 栈。
- `frontend/src/components/FormDesignerTab.vue` 当前共有 8 个直接 `designerHistory.record(...)` 调用点：排序、字段库新增、字段复制、单删、批删、属性保存、新字段草稿保存、日志行新增。
- 现有 UI 只有撤销/重做按钮绑定 `designerHistory.busy`；字段库新增、草稿保存、日志行新增、批量删除、复制、删除、拖拽/键盘排序和属性编辑没有统一门控。

### Defect B：异步完成后未校验表单选择会话（原审查严重度 Medium）

- `frontend/src/components/FormDesignerTab.vue:158,171-173,1543-1583` 已使用 `formSelectionSession` 防止过期的表单切换链路继续回写。
- `frontend/src/components/FormDesignerTab.vue:289-295` 在选中表单变化时清空历史栈。
- 8 个历史记录调用点均在异步网络操作之后直接入栈，没有校验命令开始时捕获的 `formSelectionSession` 与 `formId`。
- 若命令等待期间切换表单，旧命令可能在新表单历史已清空后把旧表单记录写入当前栈；仅比较 `formId` 不能防住 A → B → A，必须同时比较单调递增的 session。
- `loadFormFields(formId)` 已通过独立的 `formFieldsLoadSession` 与当前表单 id 防止旧列表覆盖新表单；本任务不重做该加载机制。

## Requirements

### R1 — 历史容器拒绝回放期间的新记录

`useDesignerHistory.record()` 必须在 `busy=true` 时不修改 undo / redo 栈，并通过返回值明确表示记录是否被接收。正常记录、20 条上限、redo 清空、id remap 和失败回滚语义保持不变。

### R2 — 所有异步历史命令使用统一的表单上下文门卫

- 命令在首个可能让出执行权的操作前捕获 `{ formId, formSelectionSession }`。
- 入栈统一走一个组件级包装器，不允许 8 个业务路径继续直接调用 `designerHistory.record()`。
- 包装器仅在以下条件同时成立时入栈：
  1. 捕获的 session 等于当前 `formSelectionSession`；
  2. 捕获的 `formId` 等于当前选中表单 id；
  3. 历史容器接受该记录（即未处于回放 busy）。
- 过期命令的后端副作用不回滚、不排队，也不写入当前历史栈；现有加载 session 继续负责阻止跨表单 UI 覆盖。

### R3 — 回放期间阻止用户触发会产生日志记录的编辑入口

- 字段库新增、草稿保存、日志行新增、批量删除、字段复制、持久化字段删除在 `designerHistory.busy` 时禁用。
- 字段拖拽排序在 busy 时不可开始/提交；键盘排序在业务函数入口同样受保护。
- 会自动保存并记录属性历史的属性编辑表单在 busy 时禁用。
- 业务函数仍保留入口防线，不能只依赖模板禁用；`record()` 的 busy 拒绝是最终一致性防线。

### R4 — 保持现有业务与错误语义

- 不改变后端接口、请求 payload、字段复制快照、删除重建、id remap、草稿保存、属性保存和排序语义。
- 不新增依赖，不引入跨组件全局状态，不持久化撤销栈。
- 正常失败继续使用现有错误提示与回放失败保栈策略；过期记录被丢弃时不弹额外提示，避免用户已切换表单后收到旧上下文噪音。

### R5 — 测试与规范同步

- 先增加能复现 busy 期间 `record()` 污染与跨 session 过期记录的失败测试，再实现修复。
- 覆盖全部 8 个记录调用点及相应 busy 门控，不允许遗漏新增/复制/删除/批删/排序/属性/草稿/日志行任一路径。
- 更新前端模块上下文与对应 Trellis 前端状态管理规范，记录新的历史协调契约。

## Acceptance Criteria

- [ ] AC1（R1）：撤销或重做 promise 尚未完成时调用 `record()`，undo / redo 栈不被新记录污染，且 `record()` 返回未接收。
- [ ] AC2（R2）：命令等待期间从表单 A 切到 B，或 A → B → A，旧命令完成后均不会写入当前历史栈。
- [ ] AC3（R2/R3）：`FormDesignerTab.vue` 中只有统一包装器可直接调用 `designerHistory.record()`；8 类历史命令全部捕获并传入上下文。
- [ ] AC4（R3）：busy 期间相关按钮、属性表单、拖拽和键盘排序不可触发持久化历史命令；直接调用业务函数也有保护。
- [ ] AC5（R4）：既有撤销/重做、字段复制 no-drift、草稿、排序和属性编辑回归测试保持通过。
- [ ] AC6（R5）：`node --test tests/*.test.js`、`npm run lint`、`npm run build` 通过；若浏览器验证环境可用，完成一次 busy 状态禁用 smoke check。

## Out of scope

- 取消或回滚已经发往后端的过期请求。
- 将所有正向编辑命令纳入一个新的全局异步队列，或改变操作完成顺序。
- 跨表单持久化撤销历史、后端撤销事务、多人协同编辑。
- 与历史栈无关的快捷编辑路径、设计备注与 aCRF 注释保存机制重构。
- 后端 API、数据库或跨栈数据契约修改。

## Planning status

仓库证据已覆盖问题边界；没有仍阻塞设计的产品问题。技术方案与执行步骤见 `design.md`、`implement.md`。
