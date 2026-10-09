# 后端引入 ruff format 一次性统一格式

## Goal

- 给后端引入 ruff 的格式化器（formatter，即自动统一代码风格的工具），用户已批准 `ruff format`。
- 用一次"只改空白与风格、不改语义"的提交统一 `backend/` 全部 Python 文件格式，之后的功能改动才好审阅。
- 把该提交登记进 `.git-blame-ignore-revs`，让 `git blame` 跳过纯格式提交，保持行级历史可读。

## Background（证据核实于 2026-10-08）

- 后端目前没有任何格式化配置（已核实）：`backend/pyproject.toml` 与 `backend/ruff.toml` 都不存在；依赖文件 `backend/requirements-dev.txt` 已存在，可把 ruff 固定版本写入。
- 空行占比虚高（2026-10-08 实测，口径为「空白行数 / `wc -l` 行数」，开工时可复测）：生产代码（`main.py`、`app_launcher.py`、`src/`、`scripts/`，84 个文件）约 32% 为空行，`tests/` 约 19%，合计约 25%；部分大文件明显更高，如 `routers/fields.py` 54%、`services/order_service.py` 53%、`routers/import_docx.py` 52%、`routers/visits.py` 50%、`services/docx_import_service.py` 48%、`main.py` 46%、`services/export_service.py` 46%。`export_service.py` 名义 4354 行、有效代码仅 2365 行。格式统一属于此任务范围。
- `.git-blame-ignore-revs` 尚不存在（已核实），需要新建并在提交后写清启用命令。
- 风格基准：`.context/prefs/coding-style.md` 只要求遵循 PEP 8 和函数签名类型注解，未规定行宽与引号风格——执行时以仓库现状为准选配置（统计当前主流行宽与引号），目标是把 diff 压到最小，而不是借机改风格。
- `backend/src/routers/import_docx.py` 现在几乎每行之间都有空行（已核实），格式化会显著压缩该文件，属预期效果。
- 前置顺序依据：`legacy-cleanup`（Wave D 前序）会先删掉 `perf_span` 等埋点行，避免格式化提交里混入即将删除的代码。

## Requirements

- R1：在 `backend/requirements-dev.txt` 固定 ruff 版本（pin，如 `ruff==0.x.y`）；新建格式化配置（`backend/pyproject.toml` 或 `backend/ruff.toml`，二选一即可），只含 format 相关配置（line-length、quote-style 等贴近现状），不加任何 `ruff check` lint 规则。
- R2：对 `backend/` 全部 Python 文件（`main.py`、`app_launcher.py`、`src/`、`scripts/`、`tests/`）跑一次 `ruff format`，做成单独的格式化提交；提交信息注明"只改格式不改语义"。
- R3：语义不变的机器证明：对每个被改文件，格式化前后各做一次 `ast.dump(ast.parse(...))` 比较（AST，即语法树，是代码结构的规范化表示；风格改动不应改变它），全部相等才允许提交；随后跑全量后端测试。
- R4：紧随其后的第二个提交：把格式化提交的哈希写入新建的 `.git-blame-ignore-revs`（带一行注释说明原因），并在 `README.md`/`README.en.md` 开发者章节与 `.trellis/spec/guides/git-and-tooling-conventions.md` 记录 `git config blame.ignoreRevsFile .git-blame-ignore-revs` 的启用方法。
- R5：若 `pre-commit-gate` 已合入：给 `.githooks/pre-commit` 增加对暂存 `.py` 文件的 `ruff format --check`（ruff 未安装时跳过并提示，不失败）；若尚未合入，在本任务收尾时记录待办，由后续任务补上。

## Acceptance Criteria

- [ ] AC1（对应 R1）：`requirements-dev.txt` 含固定版本的 ruff；配置文件存在且不含 lint 规则；`ruff format --check` 在本仓库后端可重复运行。
- [ ] AC2（对应 R3）：AST 比对脚本输出"全部文件语义等价"的证据（保存比对结果或输出摘要进任务记录）；格式化提交的 diff 中没有 AST 变化。
- [ ] AC3（对应 R2）：`ruff format --check backend/` 通过（0 个待格式化文件）。
- [ ] AC4（对应 R4）：`.git-blame-ignore-revs` 包含格式化提交哈希；配置 `blame.ignoreRevsFile` 后 `git blame` 任一被格式化文件不再把该提交显示为行来源。
- [ ] AC5（对应 R5）：pre-commit 钩子的 ruff 检查已补上，或明确记录为待办。
- [ ] AC6（回归门禁）：后端全量测试（父任务执行手册 §3 的命令，在任务 worktree 内运行）无新增失败。前端未改动，`node --test` 可不跑（本任务零前端文件变更），在验证报告中注明未跑范围。
- [ ] AC7（文档同步）：README 中英与 git-and-tooling-conventions 已更新。

## Out of Scope

- 不启用 `ruff check` / 任何 lint 规则（用户只批准了 format）。
- 不格式化前端、不引入前端格式化工具。
- 不在格式化提交里混入任何手工代码修改、重命名或注释改写。
- 不改变测试、不改变任何行为。
- 全局非目标：不做重写 / 换技术栈 / 微服务 / TypeScript 迁移；不引入 Alembic 或版本表迁移；不合并不同的数据库会话类型、排序规则或撤销保护；不做通用 CRUD 列表组件；不做大范围"防御性代码"清理；不重写 Word 导入解析器；不引入 Redis/Celery。

## Dependencies and Order

- 前置：`legacy-cleanup` 先合入（先删埋点再格式化）。
- 合入窗口独占：格式化采样到合入期间，其他后端分支不得合入 `main`。2026-10-09 并行会话协调后，已打开的 `feat/shared-rule-convergence` 与 `feat/reference-delete-guard` 可继续各自 worktree 内实现；两位负责人均确认在本任务之后同步格式化并验证，由后合入者负责冲突，具体流程见 `design.md`。其他未协调的后端写入仍须先查明。
- Wave D 内顺序：`legacy-cleanup` → `backend-format` → `export-layer-cleanup` → `backend-dedup`（后两者依赖本任务先行合入）。
- 与所有前端任务（Wave C/E）无文件冲突，可并行。
- 一个任务 = 一个 worktree + 一个分支，检查通过后本地合入 `main`。

## Before Starting

这是范围文档。开工前必须基于当时最新的 main 补写 design.md 和 implement.md（Trellis 对复杂任务的要求），并重新核实上面的行号。执行流程见父任务 `implement.md`（公共执行手册）。
