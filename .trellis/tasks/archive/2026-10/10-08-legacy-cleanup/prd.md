# 删除退役性能埋点、shrimp-rules.md 与死代码

## Goal

- 删除已退役的性能基线（performance baseline）管线：埋点调用、`perf.py` 模块、中间件、专用脚本与测试。
- 删除仓库根的 `shrimp-rules.md`（用户已拍板删除）；保留 `AGENTS.md`（用户已拍板保留，它被 `.trellis/.template-hashes.json` 和 `.codex/config.toml` 引用）。
- 删除审查确认的死代码：无引用的仓储类与 schema 类、失效 CSS 选择器。每一项删除前都必须 grep 复核零引用。
- 审查列出的「重复的密钥脱敏函数」经核实不是重复，已移出本任务，交给 `backend-dedup` 由用户决定（见 Background）。

## Background（证据核实于 2026-10-08）

- 性能埋点现状（已核实，数量比审查时多）：`perf_span` / `record_counter` 在 `backend/src` 10 个文件共 87 处——`src/perf.py:2`（定义）、`routers/export.py:7`、`routers/import_docx.py:12`、`routers/projects.py:13`、`routers/visits.py:3`、`services/docx_import_service.py:12`、`services/export_service.py:7`、`services/order_service.py:13`、`services/project_clone_service.py:5`、`services/project_import_service.py:13`。另有 `src.perf` 的其他 API 被引用：`backend/main.py:25-28` 导入（含 `is_perf_baseline_enabled`），`backend/main.py:345-373` 定义并挂载 `performance_baseline_middleware`；`backend/tests/test_perf_baseline.py` 使用 `perf_span`/`record_counter`，`test_perf_busy_wait_metric.py:3` 导入 `src.perf` 的 `begin_request_metrics` 等。
- 配套脚本与前端残留（已核实）：`backend/scripts/generate_perf_fixture.py`、`backend/scripts/run_perf_baseline.py`、`frontend/src/composables/usePerfBaseline.js`（调用点 `frontend/src/App.vue:41`、`frontend/src/components/FormDesignerTab.vue:105`）、`frontend/scripts/collectBuildMetrics.mjs`、`frontend/scripts/runBrowserPerfBaseline.mjs`、`frontend/tests/browserPerfBaselineScript.test.js`、`frontend/tests/perfBaselineHelpers.test.js`。性能基线管线已于 2026-06-11（提交 `72fb3fc`）退役，用户已拍板整套删除。
- 更正一条审查说法："相关 package.json scripts"已不成立——`frontend/package.json` 的 scripts 只有 `dev/build/preview/lint/format`，没有任何性能脚本条目，无需清理。
- 必须保留的相近文件（已核实）：`backend/tests/test_perf_fk_indexes.py` 不导入 `src.perf`，测的是外键索引的真实性能回归，与埋点无关，必须保留；`backend/tests/test_width_planning.py` 等同理不在删除范围。
- 文档引用需同步清理（已核实）：`backend/.claude/CLAUDE.md`（基础设施清单中的 `src/perf.py`、scripts 描述、测试清单中的 performance baseline 字样）、`frontend/.claude/CLAUDE.md`（`usePerfBaseline.js`、`collectBuildMetrics.mjs`、`runBrowserPerfBaseline.mjs`、`perfBaselineHelpers.test.js` 等出现在约 `:35`、`:37`、`:125`、`:150`）、`.claude/index.json`（infrastructure 列出 `backend/src/perf.py`）。`README.md` / `README.en.md` 未发现性能埋点引用（已 grep）。
- shrimp-rules.md 与 AGENTS.md（已核实）：两文件都在仓库根存在；`AGENTS.md` 被 `.trellis/.template-hashes.json` 和 `.codex/config.toml` 引用，保留。
- 死代码（已核实）：`FieldRepository`（`backend/src/repositories/field_repository.py:13` 定义，仅 `repositories/__init__.py:3,8` 再导出，无其他引用；注意与在用的 `FormFieldRepository` 区分）；`FieldProfileResult`（`backend/src/schemas/field_profile.py:117` 定义，模块外零引用）；`main.css` 的 `.del-btn`（`:169-170`）与 `.ff-type`（`:252`）在 `src/` 内无任何使用（已 grep）。审查另指出 `main.css` 有 5 组失效选择器及重复的"默认值支持"规则——执行时逐组 grep 复核。
- 测试死代码（2026-10-08 并入，AST + symtable 作用域级核实于 main `6580fc9`）：`backend/tests/test_export_validation.py` 的 `from tests.helpers import auth_headers, login_as`（`:21`，两名均为零引用——两个函数本身在 `helpers.py` 中仍被其他测试文件使用，只删本文件的导入行）、`session` 夹具（`:24-33`，无任何测试以其作参数，conftest.py 中也没有同名夹具可被继承，唯一「使用者」是同样零引用的 `create_project` 的形参）、`create_project` 助手（`:53-57`，零引用）。对照组：`engine` 夹具（`:37`）确实被 `test_export_word_returns_docx_file`（`:103`）与 `test_export_word_rejects_invalid_docx`（`:158`）用作参数，必须保留。连带项：`sessionmaker`（`:8` 导入，仅 `:28` 使用）在 `session` 夹具被删后同样零引用，属于本项删除范围；`Session` 仍被多个测试使用，保留。上述行号核实于 main `6580fc9`，执行前必须重新 grep 复核（父任务执行手册 §5.2）。
- 密钥脱敏函数**不是重复**（2026-10-08 复核，更正审查结论）：
  - `backend/src/utils.py:100` `mask_secret` 只露后 4 位，其余换成等长的 `*`。它的输出返回给前端（`routers/settings.py:144`、`:219`），保存时又拿来比对、判断「密钥没改」（`:178`、`:242`）。所以格式必须保持不变。
  - `backend/src/services/ai_review_service.py:152` `_mask_api_key` 只露前 4 位再加 `***`，只用在两行日志里（`:553`、`:631`）。
  - 合并就会改变日志格式，属于行为变化，所以不能算作删除死代码。已移到 `backend-dedup` 的可选项 (c)，本任务两个函数都不动。
- "重复的默认值支持规则"未能定位：直接短语搜索（"默认值支持"）在前后端源码中没有命中对应规则文本。执行者需先在文档/规范中找到审查所指的重复表述；找不到且无其他佐证时，明确记录"该项未定位，未删除"，不得凭猜测删内容。

## Requirements

- R1：删除 `backend/src/perf.py`、`main.py` 的埋点导入与中间件、10 个业务文件里的全部 `perf_span` / `record_counter` / `record_payload_size` 等 `src.perf` 调用（调用点删除后保持语句合法，如 `with perf_span(...):` 块改为直接执行体）。逐文件 grep 复核删除后无残留引用。
- R2：删除 `backend/scripts/generate_perf_fixture.py`、`backend/scripts/run_perf_baseline.py`、`backend/tests/test_perf_baseline.py`、`test_perf_busy_wait_metric.py`、`test_perf_contracts.py`、`test_perf_fixture.py`、`test_perf_harness.py`、`test_perf_redaction.py`、`test_perf_reorder_spans.py`；保留 `test_perf_fk_indexes.py`。删除 `frontend/src/composables/usePerfBaseline.js` 及两处调用、`frontend/scripts/collectBuildMetrics.mjs`、`runBrowserPerfBaseline.mjs`、两个 perf 前端测试文件。每删一项前 grep 验证没有被保留代码引用。
- R3：删除仓库根 `shrimp-rules.md`；不触碰 `AGENTS.md`、`.trellis/.template-hashes.json`、`.codex/config.toml`。
- R4：删除死代码：`field_repository.py` 与 `__init__.py` 再导出、`FieldProfileResult`（连同其在 `schemas/__init__.py` 的再导出，如有）、`.del-btn`/`.ff-type` 及经 grep 复核的其余失效选择器组。每项删除前 grep 复核零引用，并在提交说明中列出证据。不动 `mask_secret` 与 `_mask_api_key`。
- R5：同步更新 `backend/.claude/CLAUDE.md`、`frontend/.claude/CLAUDE.md`、`.claude/index.json` 中对被删文件的引用；不重排其他内容。
- R6：前端文件（App.vue、FormDesignerTab.vue 的 import 清理）完成后走 Haiku 只读评审。
- R7：删除 `backend/tests/test_export_validation.py` 中核实无人使用的夹具/助手/导入：`session` 夹具（`:24-33`）、`create_project` 助手（`:53-57`）、`from tests.helpers import auth_headers, login_as`（`:21`），并连同随之零引用的 `sessionmaker` 导入（`:8` 导入行）。只删本项列出的零引用物：`engine` 夹具（`:37`）与其余导入/测试一律不动；`engine` 作为对照证明核实方法有效（若它也被判定为零引用，说明核实方法有误，必须停下来复查而不是照删）。

## Acceptance Criteria

- [ ] AC1（对应 R1/R2）：仓库内 `grep -r "perf_span\|record_counter\|from src.perf\|from src import perf\|src\.perf"` 零命中；`usePerfBaseline`、`collectBuildMetrics`、`runBrowserPerfBaseline` 零命中。
- [ ] AC2（对应 R2）：`test_perf_fk_indexes.py` 仍在且通过（外键索引回归不受影响）。
- [ ] AC3（对应 R3）：`shrimp-rules.md` 已删除；`AGENTS.md` 与两个引用它的文件原样保留。
- [ ] AC4（对应 R4）：被删类/选择器无残留引用；`utils.py` 与 `ai_review_service.py` 的两个脱敏函数在 diff 中没有任何改动。
- [ ] AC5（对应 R5）：三处文档已同步，无指向已删文件的引用。
- [ ] AC6（对应 R6）：Haiku 评审完成，问题已处理或记录。
- [ ] AC7（回归门禁）：后端全量测试（父任务执行手册 §3 的命令，在任务 worktree 内运行）无新增失败；`cd frontend && node --test tests/*.test.js` 无新增失败。
- [ ] AC8（对应 R7）：`grep -nE "def session|auth_headers|login_as|create_project|sessionmaker" backend/tests/test_export_validation.py` 零命中，且 `engine` 夹具仍在；后端全量测试（父任务执行手册 §3 的命令）通过数与该任务基线一致（无新增失败、无新增 skip/xfail）；`git diff --stat main -- backend/src backend/main.py` 为空（生产代码零改动）。

## Out of Scope

- 不清理"防御性代码"、不补全仓储层、不重构任何在用逻辑（只删零引用物）。
- 不动 `main.css` 中仍在使用的选择器；不做样式重构。
- 不改性能相关真实测试（FK 索引、列宽规划）。
- 全局非目标：不做重写 / 换技术栈 / 微服务 / TypeScript 迁移；不引入 Alembic 或版本表迁移；不合并不同的数据库会话类型、排序规则或撤销保护；不做通用 CRUD 列表组件；不重写 Word 导入解析器；不引入 Redis/Celery。

## Dependencies and Order

- 前置：`docx-temp-ownership`、`small-defects`、`temp-resource-lifecycle` 必须先合入（它们编辑含 `perf_span` 的文件，后删埋点可避免冲突）。
- Wave D 第一个执行；必须在 `backend-format` 之前合入（格式化提交覆盖的文件越少越好，先删再格式化）。
- 与 Wave C 的 `shared-rule-convergence`（前端）有共同文件（FormDesignerTab.vue），避免同时开工；`frontend-mount-tests` 等前端拆分任务排在其后。
- 一个任务 = 一个 worktree + 一个分支，检查通过后本地合入 `main`。

## Before Starting

这是范围文档。开工前必须基于当时最新的 main 补写 design.md 和 implement.md（Trellis 对复杂任务的要求），并重新核实上面的行号。执行流程见父任务 `implement.md`（公共执行手册）。
