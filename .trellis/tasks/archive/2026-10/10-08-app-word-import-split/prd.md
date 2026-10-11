# 拆分 App.vue Word 导入向导

## Goal

- 把 `App.vue`（1965 行）中约占 27% 的 Word 导入向导抽成 `WordImportDialog.vue` 组件与 `useWordImport.js` composable（可复用逻辑模块）。
- 去掉"循环轮询等子组件加载"的脆弱写法，改为显式 props/事件通信。
- 保持子路径部署（`apiUrl()`）契约与 `docx-temp-ownership` 定义的导入流程语义（`temp_id` 原样回传）。

## Background（证据核实于 2026-10-08）

- 规模与构成（已核实）：`frontend/src/App.vue` 共 1965 行。Word 导入向导包括：状态引用 `:729-738`（`showImportWordDialog`、`importWordStep`、`importWordLoading`、`importWordAiTaskId` 等）、`:766` 的弹窗 watch、`:878-883` 的 AI 复核轮询、导入后跳转逻辑、弹窗模板 `:1408-1590`（`el-dialog` "导入Word"）、样式 `:1794` 起——合计约占全文件 27%（审查测量；未计入下方「预览对比与 AI 接受块」，实际占比略高）。
- 循环轮询（已核实，行号微漂）：`openDesignerForImportedForm` 在 `App.vue:1036-1043`，`const tries = 20`（`:1037`）循环最多 20 次、每次 `await new Promise((r) => setTimeout(r, 50))`（`:1042`），等待 `formDesignerTabRef.value?.selectFormById` 出现后再调用——子组件懒加载完成时机靠盲等。
- 预览对比与 AI 接受块（已核实锚点）：`showDocxCompare` / `compareFormData`（`App.vue:741-742`）、`acceptedAiOverrides`（`:745`）及其 reconcile（`:806`）、`toggleAiSuggestionAcceptance`（`:809`）、`toggleAiSuggestionsForForm`（`:830`）、`openDocxCompare`（`:1025-1028`，由弹窗第三步表格 `:1525` 调用）、`showDocxCompare` 重置点（`:770`/`:922`/`:936`）、`DocxCompareDialog` 挂载（`:1593-1607`，props/events 全部接到上述向导状态）。这些与向导强耦合，必须同批迁入或在 design 中显式交接，否则 `App.vue` 残留悬空引用。
- 弹窗样式（已核实锚点）：`<style scoped>` 从 `App.vue:1752` 开始；向导相关的是 `.form-select-header` / `.form-select-meta` / `.form-select-prompt`（`:1763`/`:1771`/`:1778`，仅第二步 `:1456-1458` 使用）、`.docx-ai-global-actions` / `.docx-ai-global-label`（`:1782`/`:1789`）与 `:1794` 注释「导入Word弹窗 - 表单项布局」之下的 `:deep(.docx-form-checkbox…)` / `.docx-form-*`（`:1795-1829`）。scoped 样式作用不到子组件内部，这些规则必须随组件迁移；当前没有前端测试 grep 这些类名。
- 子路径部署契约（既有规范，已核实锚点）：运行时前缀只在 `useApi.js` 的 `apiUrl()` 边界生效；`App.vue` 的绕过点必须继续使用 `apiUrl()`——`:352`（Word 导出 fetch）、`:393`（`_blobDownload`）、`:464`（`/import/auto`）、`:1416`（`el-upload` 的 action）。`frontend/tests/basePathDeployment.test.js` 是守护测试。
- 导入流程语义（来自 `docx-temp-ownership`，Wave A 安全修复）：上传返回的 `temp_id` 必须原样传回执行导入/AI 状态等接口；拆分组件时不得改写该流程或参数。
- AI 复核轮询（`:878-883` `pollAiReview`）是后端任务状态查询，与"等子组件加载"的轮询不同；本任务只替换后者，AI 轮询逻辑随向导一起迁移但语义不变。

## Requirements

- R1：新建 `frontend/src/components/WordImportDialog.vue`：弹窗模板、步骤状态、上传/预览/AI 复核交互迁入；「预览对比与 AI 接受块」与弹窗 scoped 样式（见 Background）一并迁入或在 design 中显式交接；`App.vue` 只保留入口按钮与打开开关。
- R2：新建 `frontend/src/composables/useWordImport.js`：向导的状态机与接口调用逻辑（上传、预览、执行、AI 任务轮询）收进 composable，供组件消费；接口路径继续通过 `useApi.js`（`apiUrl()`）。
- R3：替换 `App.vue:1036-1043` 的 20×50ms 盲等：改为显式通信——如子组件 `defineExpose` 配合 `@ready` 事件，或由设计器组件在挂载完成后通知；删除轮询循环。
- R4：契约保持：`apiUrl()` 四个绕过点语义不变（可随迁移移动位置但不得绕过 `apiUrl()`）；`temp_id` 的产生、回传、失效流程与 `docx-temp-ownership` 定稿一致；`basePathDeployment.test.js` 与导入相关测试全绿。
- R5：测试：更新读取 `App.vue` 源码的文本测试（改路径或转行为/挂载测试）；`basePathDeployment.test.js:99-102` 用正则把绕过点钉在 `App.vue` 源码里，`el-upload` action（`:1416`）迁出后要改指新文件；为"导入完成后选中目标表单"补一个不依赖盲等的回归测试。
- R6：过程门禁：全量前端测试；浏览器实测完整 Word 导入链路（上传 → 预览 → （可选）AI 复核 → 执行 → 跳转设计器选中表单）；Haiku 只读评审。

## Acceptance Criteria

- [ ] AC1（对应 R1/R2）：`WordImportDialog.vue` 与 `useWordImport.js` 存在且被 `App.vue` 消费；`App.vue` 行数显著下降；`grep` 确认向导逻辑不在 `App.vue` 内联。
- [ ] AC2（对应 R3）：`setTimeout` 轮询循环删除（`grep` 零命中该模式）；导入完成后仍能正确跳转并选中表单（回归测试 + 浏览器实测）。
- [ ] AC3（对应 R4）：`apiUrl()` 绕过点全部保留且使用 `apiUrl()`；`frontend/tests/basePathDeployment.test.js` 已更新到新文件位置并通过（非原样通过）。
- [ ] AC4（对应 R4）：Word 导入全链路行为不变（`temp_id` 语义不变），导入相关测试全绿。
- [ ] AC5（对应 R6）：浏览器实测记录完整链路证据；Haiku 评审完成且问题已处理或记录。
- [ ] AC6（回归门禁）：前端 `cd frontend && node --test tests/*.test.js` 无新增失败；后端收尾跑全量 pytest 无新增失败。
- [ ] AC7（文档同步）：`frontend/.claude/CLAUDE.md` 组件/composable 清单与根 `.claude/CLAUDE.md` 涉及 App 的描述同步更新；子路径契约条目如有措辞变化，同步 `.trellis/spec/guides/cross-stack-contracts.md` 与根 `.claude/CLAUDE.md`「Cross-Stack Contracts」中重新核实的 9 处绕过点的文件归属（`el-upload` action 移入 `WordImportDialog.vue`）。

## Out of Scope

- 不改 Word 导入的后端接口与解析逻辑。
- 不改 AI 复核的业务语义（轮询仍按现有任务状态机制）。
- 不动 `App.vue` 的其他部分（登录恢复、主题、管理端路由等维持现状）。
- 不改 `docx-temp-ownership` 的归属与清理规则。
- 全局非目标：不做重写 / 换技术栈 / 微服务 / TypeScript 迁移；不引入 Alembic 或版本表迁移；不合并不同的数据库会话类型、排序规则或撤销保护；不做通用 CRUD 列表组件；不做大范围"防御性代码"清理；不重写 Word 导入解析器；不引入 Redis/Celery。

## Dependencies and Order

- 顺序调整（用户于 2026-10-11 确认）：先执行本任务 `app-word-import-split`；`visits-preview-split` 等 `designer-split` 合入 `main` 后再重新核实和执行，不再作为本任务前置。仍需 `frontend-mount-tests` 已合入（挂载测试可用）与 `docx-temp-ownership` 已合入（`temp_id` 流程语义已定稿）。
- `shared-rule-convergence` 无直接文件冲突，但其带来的测试改造惯例应遵循。
- 与 Wave D 后端串行链无文件冲突，可并行。
- 一个任务 = 一个 worktree + 一个分支，检查通过后本地合入 `main`。

## Before Starting

这是范围文档。开工前必须基于当时最新的 main 补写 design.md 和 implement.md（Trellis 对复杂任务的要求），并重新核实上面的行号。执行流程见父任务 `implement.md`（公共执行手册）。
