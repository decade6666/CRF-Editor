# 拆分 VisitsTab.vue 预览弹窗

## Goal

- 把 `VisitsTab.vue`（1614 行）中的表单预览弹窗抽成自持数据的 `VisitFormPreviewDialog.vue` 组件。
- 消除 4 份表单数据靠 `mergeFormIntoState` 手动同步的脆弱结构（这里曾出过真实缺陷）。
- 保持与 `FormDesignerTab` 共享的 eCRF/aCRF 视图模式契约和 aCRF 注记契约不变。

## Background（证据核实于 2026-10-08）

- 规模与构成（已核实）：`frontend/src/components/VisitsTab.vue` 共 1614 行；预览弹窗模板 `el-dialog`（`showFormPreview`）从 `:1058` 到 `:1520`（约 462 行），加上 `:114-128` 起的 `formPreview*` 状态、`:405-480` 一带的预览渲染函数，预览相关代码约占全文件近一半（审查结论）。
- 手动数据同步缺陷（已核实锚点）：`mergeFormIntoState` 定义于 `VisitsTab.vue:518`，调用点 `:567`、`:580`。审查核实共有 4 份表单数据副本靠它手动同步，2026-06-30 曾因漏同步丢失 `sequence` 字段一次。
- 必须保持的契约（已核实锚点 + 既有规范）：eCRF/aCRF 视图模式存储键 `VIEW_MODE_STORAGE_KEY = 'crf_view_mode'` 在 `VisitsTab.vue:58` 与 `FormDesignerTab.vue:128` 各有一份读取/写回逻辑（同一 localStorage 键）；aCRF 注记几何与持久化契约见 `.trellis/spec/guides/cross-stack-contracts.md` §6（`acrfAnnotationGeometry.js` / `useAcrfAnnotationDrag.js`，不得改动）。
- 预览渲染依赖（已核实）：弹窗模板内使用本文件的 `renderCellHtml`（`:427`）等预览函数——`shared-rule-convergence` 合入后这些函数已收敛到共享模块，本任务直接从共享模块导入，不再随身携带。
- 多行默认值缺陷将由 `shared-rule-convergence` 修复（当前锚点：`VisitsTab.vue:423`/`:433` 一带的 `singleLine` 路径）；该任务合入后，预览纯函数移入共享模块，`VisitsTab.vue` 内相关行号随之失效，开工时重新定位。本任务不得回退该修复。
- 弹窗专属样式（已核实锚点）：`<style scoped>`（`VisitsTab.vue:1523-1614`）内全部规则都服务于预览弹窗——`.wp-form-title-row`（`:1524`）与 `.wp-acrf-annotation` 系列（`:1530` 起，含 `__text`、`--interactive`、`--inline-header`、`-reset` 及悬停/禁用态）。scoped 样式作用不到子组件内部，必须随组件整体迁移；`acrfViewToggle.test.js`、`formFieldPresentation.test.js` 会在源码里 grep 这些类名，迁移后同步改路径。

## Requirements

- R1：新建 `frontend/src/components/VisitFormPreviewDialog.vue`：预览弹窗的全部状态（字段列表、表单方向、备注、loading/error、请求序号防竞态）迁入该组件，由它自持；父组件只传入表单标识/入口参数并通过事件接收必要的关闭/刷新通知。一并迁入：`useAcrfAnnotationDrag` 挂载（`VisitsTab.vue:575`）、`useRowResize` 调用（`VisitsTab.vue:700`，键为 `formPreviewFormId`）、`previewRowResizerCache`（`VisitsTab.vue:123`）与 `<style scoped>` 弹窗专属样式（见 Background）。
- R2：删除 `mergeFormIntoState` 及 4 份副本的手动同步：表单数据更新后改为向预览组件传最新 props 或触发其重新加载，单一数据源（single source of truth，即同一份数据只有一处持有者）。
- R3：视图模式契约保持：`crf_view_mode` 的读写仍走现有共享键；组件内 eCRF/aCRF 切换与 `FormDesignerTab` 的行为一致（用户切换在设计器与访视页互通）。
- R4：aCRF 注记契约不变：预览内注记渲染与拖拽继续复用 `acrfAnnotationGeometry.js` / `useAcrfAnnotationDrag.js`，零修改（如确需修改，升级为跨栈契约变更并单独报批）。行高契约同步不变：`useRowResize` 的行高 localStorage（`crf:designer:row-heights:*`）与 `FormDesignerTab` 共享读写语义，迁移后保持读写对等。
- R5：测试：更新读取 `VisitsTab.vue` 源码的文本测试（改路径或转为行为/挂载测试），至少包括 `rowHeightResize.test.js`（行高锚点）、`acrfViewToggle.test.js` 与 `formFieldPresentation.test.js`（grep `wp-*` 类名）；为"表单更新后预览拿到最新数据（含 `sequence`）"补一个回归测试，防止 2026-06-30 那类缺陷复发。
- R6：过程门禁：全量前端测试；浏览器实测访视页预览（eCRF/aCRF 两种视图、多行默认值、注记拖拽）与 Word 导出一致（`backend/scripts/compare_word_table_parity.py`）；Haiku 只读评审。

## Acceptance Criteria

- [ ] AC1（对应 R1/R2）：`VisitFormPreviewDialog.vue` 存在并自持预览数据；`VisitsTab.vue` 中 `mergeFormIntoState` 与 `formPreview*` 副本状态删除；`grep` 确认无残留同步代码。
- [ ] AC2（对应 R5）：新增回归测试证明表单更新（含 `sequence` 字段）后预览显示最新数据。
- [ ] AC3（对应 R3）：`crf_view_mode` 在设计器与访视页之间切换互通，localStorage 键不变（现有测试 + 手工验证）。
- [ ] AC4（对应 R4）：注记几何/拖拽相关测试全绿，`acrfAnnotationGeometry.js` 与 `useAcrfAnnotationDrag.js` 零修改。
- [ ] AC5（对应 R6）：浏览器实测通过并留存证据；parity 比对一致；Haiku 评审完成且问题已处理或记录。
- [ ] AC6（回归门禁）：前端 `cd frontend && node --test tests/*.test.js` 无新增失败；后端收尾跑全量 pytest 无新增失败。
- [ ] AC7（文档同步）：`frontend/.claude/CLAUDE.md` 组件清单同步（新增组件、VisitsTab 描述更新）。

## Out of Scope

- 不拆 `VisitsTab.vue` 的非预览部分（访视列表、排序等维持现状）。
- 不改预览渲染规则本身（共享模块由 `shared-rule-convergence` 维护）。
- 不改 `FormDesignerTab.vue`（其拆分属 `designer-split`）；只保持契约一致。
- 全局非目标：不做重写 / 换技术栈 / 微服务 / TypeScript 迁移；不引入 Alembic 或版本表迁移；不合并不同的数据库会话类型、排序规则或撤销保护；不做通用 CRUD 列表组件；不做大范围"防御性代码"清理；不重写 Word 导入解析器；不引入 Redis/Celery。

## Dependencies and Order

- 前置：`designer-split` 已合入（一次只拆一个巨型文件）、`shared-rule-convergence` 已合入（预览函数已共享）、`frontend-mount-tests` 已合入（挂载测试可用）。
- Wave E 前端拆分链第二环，之后是 `app-word-import-split`。
- 与 Wave D 后端串行链无文件冲突，可并行。
- 一个任务 = 一个 worktree + 一个分支，检查通过后本地合入 `main`。

## Before Starting

这是范围文档。开工前必须基于当时最新的 main 补写 design.md 和 implement.md（Trellis 对复杂任务的要求），并重新核实上面的行号。执行流程见父任务 `implement.md`（公共执行手册）。
