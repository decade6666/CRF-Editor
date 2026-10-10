# 导出层整理：删死分支、合并重复渲染、拆大函数

## Goal

- 删除导出层走不到的 `unified_landscape` 旧布局分支及其专属构建函数与"预期失败"测试。
- 合并导出模块内的重复渲染逻辑（控件分派、日志行/标签行、选项标签函数）。
- 把数据库导出函数移出 Word 导出模块；把 262 行的 `_add_forms_content` 按版式拆成子函数。
- 只动文本与样式层，绝不改列宽布局算法；严格预览/导出一致性（parity，即浏览器预览与 Word 导出逐格一致）是硬门禁。

## Background（证据核实于 2026-10-08）

- 死分支（已核实锚点）：`backend/src/services/export_service.py:1861` `elif layout.mode == "unified_landscape":` 分支；`_classify_form_layout` 在 `:2091`；配套两个构建函数 `_build_unified_segments`（`:2194`）与 `_build_unified_table`（`:2284`）；`LayoutDecision.mode` 注释在 `:200` 列出该模式。审查核实：`_classify_form_layout` 实际只会返回 `legacy` 或 `mixed_landscape`，生产路径走不到 `unified_landscape`。
- 对应的"预期失败"测试与单元用例（已核实的已知位置；删分支前需全仓库 grep 复核无遗漏）：`backend/tests/test_export_unified.py:344`、`:405`、`:883`（xfail 原因均注明 "unified_landscape rendering disabled by 786aaa4"）、`backend/tests/test_export_column_width_override.py:340`、`backend/tests/test_export_acrf.py:377`、`backend/tests/test_export_service.py:1150`（后三处直接构造 `LayoutDecision("unified_landscape", ...)`），删分支时需一并处理。
- 不能一起删的（审查明确 + 已核实共享契约）：`backend/src/services/width_planning.py`、共享测试数据 `backend/tests/fixtures/planner_cases.json`、前端同名规划逻辑（`useCRFRenderer.js`）仍在使用，全部保留。
- 重复渲染（已核实锚点）：日志行/标签行判定与"以下为log行"渲染至少出现在 `export_service.py:2232`、`:2559-2565`、`:2894-2923` 多处；选项标签函数重复——`export_service.py:3670` `_get_option_labels` 与 `backend/src/services/field_rendering.py:224` `_get_option_labels_for_width` 功能重复；控件分派 `_render_field_control` 在 `:3359`，审查指出分派逻辑写了三处（按 legacy/mixed/unified 三条渲染路径各一份），完整清单在 design 阶段枚举。
- 数据库导出混居（已核实）：`export_service.py:4249` `export_full_database`、`:4283` `_vacuum_sqlite_file`、`:4292` `export_project_database`、`:4319` `export_user_projects_database` 四个函数位于 Word 导出模块末尾，应移入独立服务模块并更新调用方（`routers/projects.py` 等导入点执行时 grep）。
- 大函数（已核实）：`_add_forms_content` 定义于 `export_service.py:1749`，下一个定义在 `:2011`，即 262 行（审查测 259 行），复杂度约 34，是后端改动最频繁的函数。
- 硬门禁（根 `.claude/CLAUDE.md` 既有契约）：预览/导出严格比对由 `backend/src/services/word_table_parity.py` 与 `backend/scripts/compare_word_table_parity.py` 承担；列宽、复选框（`checkbox_label`）、日期格式、aCRF 注记四条跨栈契约不得变化。

## Requirements

- R1：删除 `unified_landscape` 分支、`_build_unified_segments` / `_build_unified_table`、上述 xfail 测试与 `LayoutDecision("unified_landscape", ...)` 单元用例；`LayoutDecision` 的 mode 注释同步收窄为 `legacy | mixed_landscape`。保留 `width_planning.py`、`planner_cases.json`、前端同名逻辑。
- R2：日志行/标签行的判定与渲染合并为一份实现（函数或小类），剩余调用点改为复用（原 `:2232` 位于 `_build_unified_segments` 内、随 R1 删除；R1 完成后剩 `:2559-2565`、`:2894-2923` 两处，行号开工时重新核实）；生成的 Word 文本逐字不变。
- R3：选项标签函数去重：`export_service.py` 改为复用 `field_rendering.py` 的实现（或反向收敛，design 定），宽度计算结果不变（`test_width_planning.py` 全绿）。
- R4：控件分派收敛为一份：R1 删除 unified 死分支后，剩余两条渲染路径（legacy / mixed_landscape）共用同一个分派入口；导出文本逐字不变。
- R5：四个数据库导出函数移入新模块（如 `backend/src/services/database_export_service.py`），更新所有导入点（已核实：`routers/export.py:19-24` 一次性导入三个函数与 `ExportError`；`main.py:478` 导入 `ExportError` 注册全局处理器，`ExportError` 若留在 `export_service` 则此点不改；`tests/test_project_import.py:1250` 导入 `export_project_database`；执行时 grep 复核）；函数行为与错误语义不变。
- R6：`_add_forms_content` 按版式（legacy / mixed_landscape）拆成子函数，每个子函数圈复杂度 <= 10（分支数指标）；拆分纯为搬移，不改逻辑顺序。
- R7：每一项完成后跑导出相关测试；收尾跑 `compare_word_table_parity.py` 的预览/导出比对并留存结果。

## Acceptance Criteria

- [ ] AC1（对应 R1）：仓库内 `unified_landscape` 零命中（除变更日志/历史说明）；相关 xfail 测试删除后套件无 xfail 缺失告警；`width_planning` 与 `planner_cases.json` 原样保留。
- [ ] AC2（对应 R2/R4）：重复渲染合并后，对同一测试项目导出的 `.docx` 与改造前逐字节级内容一致（以导出测试 + parity 比对证明）。
- [ ] AC3（对应 R3）：选项标签只有一份实现；`test_width_planning.py` 与 `frontend/tests/columnWidthPlanning.test.js` 全绿。
- [ ] AC4（对应 R5）：数据库导出函数在新模块；`test_export_validation.py`、数据库导出相关测试全绿；`export_service.py` 不再含数据库导出。
- [ ] AC5（对应 R6）：`_add_forms_content` 拆分后每个子函数 <= 50 行或圈复杂度 <= 10；导出结果一致。
- [ ] AC6（对应 R7）：`compare_word_table_parity.py` 比对运行并留存结果（表单/行/单元格完全一致）。
- [ ] AC7（回归门禁）：后端全量测试（父任务执行手册 §3 的命令，在任务 worktree 内运行）无新增失败；前端零改动，`node --test` 未跑需注明。
- [ ] AC8（文档同步）：`backend/.claude/CLAUDE.md` 中 export_service 的描述与新模块清单同步更新；跨栈契约条目如有措辞变化同步 `.trellis/spec/guides/cross-stack-contracts.md`。

## Out of Scope

- 不改列宽规划算法、不改任何跨栈共享常量。
- 不改 Word 导入解析器、不改前端预览渲染。
- 不给导出层加新功能（TOC、注记几何等维持现状）。
- 全局非目标：不做重写 / 换技术栈 / 微服务 / TypeScript 迁移；不引入 Alembic 或版本表迁移；不合并不同的数据库会话类型、排序规则或撤销保护；不做通用 CRUD 列表组件；不做大范围"防御性代码"清理；不引入 Redis/Celery。

## Dependencies and Order

- 前置：`backend-format` 已合入（本任务大量编辑 `export_service.py`，避免与格式化提交冲突）；`small-defects` 已合入（其 `ExportError` 放行修复涉及 `export_service.py:528` 一带）。
- Wave D 内顺序：`legacy-cleanup` → `backend-format` → 本任务 → `backend-dedup`；与前端 Wave E 可并行（文件不重叠）。
- 一个任务 = 一个 worktree + 一个分支，检查通过后本地合入 `main`。

## Before Starting

这是范围文档。开工前必须基于当时最新的 main 补写 design.md 和 implement.md（Trellis 对复杂任务的要求），并重新核实上面的行号。执行流程见父任务 `implement.md`（公共执行手册）。
