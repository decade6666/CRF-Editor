# 本机提交前钩子：密钥扫描与基本自检

## Goal

- CI（GitHub Actions + gitleaks）已于 2026-10-08 删除，本机提交前的检查成为合入 `main` 前的唯一一道关。
- 用一个版本化的 shell 钩子在每次 `git commit` 前自动完成：暂存区密钥扫描、空白错误检查、暂存 `.py` 文件语法检查（以及 backend-format 合入后的格式检查）。
- 钩子快速（目标几秒内完成）、失败即拦截（fail closed）、缺依赖时给出明确的安装提示。

## Background（证据核实于 2026-10-08）

- CI 已整体删除：提交 `8ed19cd` 删除了 `.github/workflows/ci.yml`、`.github/workflows/gitleaks.yml`、`.gitleaks.toml` 和 `backend/tests/test_ci_merge_gate.py`（共 528 行删除）。此后测试、风格检查、构建、密钥扫描都不再自动运行。
- 本机未安装 gitleaks：`command -v gitleaks` 找不到任何结果（已核实）。执行者必须先征得用户同意再安装（单个二进制放入 `~/.local/bin` 即可，无需 sudo）。
- 被删的 allowlist 配置可以从历史恢复：`git show 8ed19cd^:.gitleaks.toml` 可读出 37 行配置（已核实）。
  - 它使用新版的 `[[allowlists]]` 数组表写法，只放行已知的占位密钥。文件注释说明，旧的单表写法 `[allowlist]` 会在 gitleaks v9 中移除。
  - 装好后要确认所装版本支持这种写法。
  - 仅在实际需要时恢复。
- `git config core.hooksPath` 当前未设置，`extensions.worktreeConfig` 也未开启（已核实）。因此 `git config core.hooksPath .githooks` 写入的是仓库共享配置（`.git/config`），本仓库所有 worktree 共用同一份配置——在一个 worktree 里启用后，其他 worktree 的提交同样会走该钩子。钩子脚本本身放在版本化的 `.githooks/pre-commit`，每个 worktree 都有同名文件。
- 不同版本的 gitleaks，扫描暂存区的子命令写法不同：
  - 较早的版本用 `gitleaks protect --staged`；
  - 较新的版本改为 `gitleaks git --staged`，旧子命令已标记弃用。

  安装后必须按所装版本的官方文档确认子命令写法，不能凭记忆硬编码。

## Requirements

- R1：新增版本化脚本 `.githooks/pre-commit`（纯 POSIX shell，无新框架）；用 `git config core.hooksPath .githooks` 启用；在文档中说明该配置为本仓库所有 worktree 共享。
- R2：对暂存区变更做 gitleaks 密钥扫描。安装前必须先询问用户；安装后按已装版本文档核对子命令（`protect --staged` 还是 `git --staged`）；仅在需要时从 `8ed19cd^` 恢复 `.gitleaks.toml` allowlist。gitleaks 缺失时钩子必须失败并输出安装提示（fail closed）。
- R3：快速自检：(a) `git diff --cached --check` 拦截空白错误；(b) 对暂存的 `.py` 文件逐个跑 `python3 -m py_compile` 拦截语法错误；(c) 条件启用——backend-format 合入且 `ruff` 可用时，对暂存 `.py` 跑 `ruff format --check`；ruff 不可用时跳过并打印一行提示，不失败。
- R4：钩子内不跑任何测试套件；结束时打印本次钩子耗时（目标：几秒）。
- R5：文档同步：`README.md` 与 `README.en.md` 的开发者环境章节、根 `.claude/CLAUDE.md` 常用命令、`.trellis/spec/guides/git-and-tooling-conventions.md`，说明钩子的启用方式、覆盖范围，并提及 `git commit --no-verify` 存在但不得日常使用。

## Acceptance Criteria

- [ ] AC1（对应 R2）：向暂存区放入一个 gitleaks 可识别的假密钥后 `git commit` 被拦截，输出指明命中的规则。
- [ ] AC2（对应 R2）：gitleaks 未安装时（可用临时改 PATH 模拟），钩子失败并给出安装提示，而不是放行。
- [ ] AC3（对应 R2/R3）：一次干净的正常提交顺利通过钩子。
- [ ] AC4（对应 R3）：暂存含尾随空格/冲突标记的文件时 `git diff --cached --check` 拦截提交。
- [ ] AC5（对应 R3）：暂存一个含语法错误的 `.py` 文件时提交被拦截。
- [ ] AC6（对应 R1）：在 `git worktree add` 出的新 worktree 里提交，钩子同样生效（验证 core.hooksPath 共享）。
- [ ] AC7（对应 R4）：钩子运行耗时被测量并在输出中报告，且在几秒量级。
- [ ] AC8（回归门禁）：后端全量测试（父任务执行手册 §3 的命令，在任务 worktree 内运行）无新增失败；前端 `cd frontend && node --test tests/*.test.js` 无新增失败。本任务只改钩子与文档，若某套件与本任务无关仍需各跑一次确认无影响。
- [ ] AC9（对应 R5，文档同步）：README 中英、根 `.claude/CLAUDE.md`、git-and-tooling-conventions 均已更新且相互一致。

## Out of Scope

- 不重装 GitHub Actions / CI，不恢复 `test_ci_merge_gate.py`。
- 不引入 Python `pre-commit` 包（那是新依赖，除非用户另行批准）。
- 不新增 gitleaks 之外的扫描工具，不改扫描规则本身（仅按需恢复原 allowlist）。
- 不在钩子里跑测试、lint 全量或构建。
- 全局非目标：不做重写 / 换技术栈 / 微服务 / TypeScript 迁移；不引入 Alembic 或版本表迁移；不合并不同的数据库会话类型、排序规则或撤销保护；不做通用 CRUD 列表组件；不做大范围"防御性代码"清理；不重写 Word 导入解析器；不引入 Redis/Celery。

## Dependencies and Order

- Wave A（现在即可开工），与 `docx-temp-ownership`、`test-isolation` 并行，互不触碰对方文件。
- 不阻塞其他任务；`backend-format`（Wave D）合入后需回头按 R3(c) 给钩子补 `ruff format --check`。
- 一个任务 = 一个 worktree + 一个分支，检查通过后本地合入 `main`。

## Before Starting

这是范围文档，且本任务为轻量任务（LIGHTWEIGHT）：只保留本 PRD 即可开工，用户审阅通过后即可执行，无需补写 design.md / implement.md；执行流程仍遵循父任务 `implement.md`（公共执行手册）。
