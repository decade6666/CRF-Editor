# 拆分 FormDesignerTab.vue：预览模板、字典弹窗、注释层

## Goal

- 对 6266 行的 `FormDesignerTab.vue` 做第一轮拆分，原则是"先拆不持有核心状态的部分"（stateless-first）。
- 抽出：两套几乎相同的 Word 预览模板、两份字典快捷弹窗、aCRF 注释层。
- 保留全部保存、撤销（undo/redo）、会话恢复保护；不重写状态管理。
- 每一步都要跑全量前端测试、浏览器核对预览与导出一致，并走 Haiku 只读评审。

## Background（证据核实于 2026-10-08）

- 规模（已核实）：`frontend/src/components/FormDesignerTab.vue` 共 6266 行，模板区 `:3311-5585`，是全仓库最大、改动最频繁（约 107 次提交）的前端文件。
- 双份 Word 预览模板（已核实锚点）：主画布预览区 `word-preview` 起于 `:3420`（约 `:3419-4078`）；全屏模式预览 `wp-form-title` 起于 `:4259`（约 `:4255-5057`）。两套模板大部分行相同（审查测得约九成，复核测得约八成），其余 100 多行差异需要逐条清点（主画布块约 660 行、全屏块约 800 行，开工时重新核实）。脚本侧已按参数区分两种模式，主要是模板重复。
- 双份字典快捷弹窗（已核实）：脚本侧快捷新增 `:2886-2967`、快捷编辑 `:2970-3085`（约 200 行），与 `FieldsTab.vue` 的快捷编辑（约 `:203-380`）逻辑重复；`shared-rule-convergence` 会先把逻辑收进 composable，本任务负责把弹窗 UI 合成一个可复用组件并接入设计器。
- 两条保存流程（后续单独决策，不在本轮强制范围）：`saveFieldProp` 定义于 `:2444`（审查测 100 行）与 `saveDraftField` 定义于 `:2652`（审查测 163 行），两者对默认值的兜底写法不一致，可能造成"保存后值变了"；属性编辑器抽 composable 与两者合并属后续单独决策，需用户点头再做。
- 测试包袱（已核实）：`frontend/tests` 有 26 个文件读取 `FormDesignerTab.vue` 源码做文本断言；拆分会移动代码位置，这些测试必须同步改读取路径或改为挂载/行为测试。
- `legacy-cleanup` 会删除本文件 `:105` 的 `usePerfBaseline` 导入，行号会漂移——开工时重新定位。

## Requirements

- R1：抽出 `DesignerWordPreview.vue`：把主画布与全屏两套预览模板合一，差异通过 props（模式、缩放、注记开关等）表达；脚本侧调用点保持参数化用法不变。
  - 动手前先做两套模板的 diff 清单：除模式 / 缩放 / 注记开关外还有 100 多行差异（见 Background），每条差异要么变成 prop / slot，要么显式统一（声明并验证），不许静默丢弃。
  - 样式迁移：预览相关样式在 `FormDesignerTab.vue` 的 `<style scoped>`（起于约 `:5608`）里——`.designer-scaled-word-page`（约 `:6100`）、`.wp-form-title-row`（约 `:6113`）等。scoped 样式只作用到子组件根元素，抽组件时必须把每条规则随模板一起搬走（子组件 scoped 或共享非 scoped 样式表），否则样式静默丢失。`main.css` 的 `.word-page .wp-form-title { text-align: left }` 契约规则不动。
- R2：字典快捷弹窗合一：复用 `shared-rule-convergence` 产出的 composable，把新增/编辑弹窗做成一个组件，`FormDesignerTab.vue` 与 `FieldsTab.vue` 共用；两处刷新规则以 shared-rule-convergence 定稿为准。
- R3：抽出 aCRF 注释层为独立组件（渲染 + 拖拽接入），复用现有 `acrfAnnotationGeometry.js` / `useAcrfAnnotationDrag.js`，不改几何与持久化契约（cross-stack-contracts §6）。
  - 注释层样式 `.wp-acrf-annotation*`（约 `:6124` 起）也在同一个 `<style scoped>` 里，随组件一起迁移；同步更新在 `FormDesignerTab.vue` 源码里找 CSS 规则的测试（如 `acrfViewToggle.test.js:275` 的 `extractRuleBody(formDesignerSource, '.wp-acrf-annotation')`，行号开工时重新核实）。
- R4（后续单独决策，默认不做）：属性编辑器 composable；`saveDraftField` / `saveFieldProp` 默认值兜底合并。列入任务记录，实施前需用户确认。
- R5：保护性约束：`saveFieldProp`/`saveDraftField`/撤销历史（`useDesignerHistory`）/会话恢复（load-session）逻辑不重构、不改行为；状态留在 `FormDesignerTab.vue`，抽出的组件只通过 props/emit 通信。
- R6：同步处理 26 个源码读取测试：读取路径更新或改为挂载测试（优先用 `frontend-mount-tests` 的设施把能转的转成行为断言）。
- R7：过程门禁：每个拆分步骤独立提交；每步跑全量前端测试；每步在浏览器验证预览与 Word 导出一致（含 `backend/scripts/compare_word_table_parity.py` 比对）；每步走 Haiku 只读评审。

## Acceptance Criteria

- [ ] AC1（对应 R1）：`DesignerWordPreview.vue` 存在且被两处复用；`FormDesignerTab.vue` 行数显著下降；主画布与全屏预览显示一致（浏览器实测 + 截图留存）。
- [ ] AC2（对应 R2）：设计器内字典快捷新增/编辑走唯一弹窗组件；保存后字段库数据立即刷新。
- [ ] AC3（对应 R3）：注释层独立组件接入，aCRF 注记的拖拽与持久化行为与拆分前一致（现有 acrf 相关测试全绿 + 浏览器拖拽实测）。
- [ ] AC4（对应 R4）：属性编辑器与两条保存流程未被改动（除非用户事后批准并记录）；现有保存/撤销/会话恢复相关测试全部通过。
- [ ] AC5（对应 R6）：读取 `FormDesignerTab.vue` 源码的测试文件更新完毕，`node --test` 全绿。
- [ ] AC6（对应 R7）：每步的测试、浏览器验证、Haiku 评审记录齐备；预览与导出 parity 比对一致。
- [ ] AC7（回归门禁）：前端 `cd frontend && node --test tests/*.test.js` 无新增失败；后端全量测试（父任务执行手册 §3 的命令，在任务 worktree 内运行）无新增失败（收尾各跑一次）。
- [ ] AC8（文档同步）：`frontend/.claude/CLAUDE.md` 组件清单与根 `.claude/CLAUDE.md` 涉及设计器的描述同步更新；aCRF 契约如有措辞变化同步 `.trellis/spec/guides/cross-stack-contracts.md`。
- [ ] AC9（对应 R1/R3 样式迁移）：拆分前后浏览器截图对比无样式丢失（预览区与注释层逐项核对，截图留存）。

## Out of Scope

- 不重写状态管理、不引入 Pinia 等新状态库。
- 不做属性面板 composable 与两条保存流程合并（单独决策）。
- 不改字段渲染规则与列宽算法（共享模块已由 `shared-rule-convergence` 收敛）。
- 不动 `VisitsTab.vue` 与 `App.vue`（各有后续任务）。
- 全局非目标：不做重写 / 换技术栈 / 微服务 / TypeScript 迁移；不引入 Alembic 或版本表迁移；不合并不同的数据库会话类型、排序规则或撤销保护；不做通用 CRUD 列表组件；不做大范围"防御性代码"清理；不重写 Word 导入解析器；不引入 Redis/Celery。

## Dependencies and Order

- 前置：`shared-rule-convergence`（共享预览模块与字典 composable）、`frontend-mount-tests`（挂载测试设施）、`legacy-cleanup`（perf 清理 + 巨型文件先行变更）全部已合入。
- Wave E 前端拆分链的第一环：`designer-split` → `visits-preview-split` → `app-word-import-split`；一次只拆一个巨型文件。
- 与 Wave D 后端任务无文件冲突，可在 `legacy-cleanup` 合入后与后端串行链并行。
- 一个任务 = 一个 worktree + 一个分支，检查通过后本地合入 `main`。

## Before Starting

这是范围文档。开工前必须基于当时最新的 main 补写 design.md 和 implement.md（Trellis 对复杂任务的要求），并重新核实上面的行号。执行流程见父任务 `implement.md`（公共执行手册）。
