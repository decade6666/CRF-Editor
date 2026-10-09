# 测试会话隔离真实配置来源

## Goal

- 后端测试会话不再读取仓库根目录的真实 `config.yaml`。这个文件可能含 AI 接口密钥、模板库路径、管理员初始密码。
- 测试会话也不继承开发者 shell 里的 `CRF_*` 配置变量（conftest 主动设置的三项除外）。
- 结果：在主目录跑测试和在全新 worktree 里跑，测试进程看到的配置完全一样，都是默认值加 conftest 设置的几项。
- 生产代码零改动。

## Background（证据核实于 2026-10-08，`main` = `6580fc9`）

- **`test-isolation` 只隔离了路径。** 它在 `90a1962` 合入，把数据库、上传、截图、Word 导入临时目录都放进了会话临时根目录；但配置文件本身仍是真实的：
  - `backend/src/config.py:31` 的 `CONFIG_FILE` 固定指向仓库根 `config.yaml`。`load_config`、`save_config`、`update_config` 不传路径时都用它（`:263`、`:284`、`:304`）。
  - `get_config()`（`:334`，有缓存）在导入 `main` 时第一次求值。
  - 主目录有真实 `config.yaml`，所以测试进程会读入其中与路径无关的设置：`ai.*`（含 `api_key`，`:114-120`）、`template.template_path`（`:110-111`）、`admin.bootstrap_password`（`:138-140`）等。
  - 全新 worktree 没有这个文件，读到的是默认值。两种环境的全量结果相同（都是 1030 passed / 4 xfailed），说明目前没有测试依赖真实配置的值。
- **风险是潜在的，尚未发生：**
  - 将来如果有测试走到没打补丁的 AI 调用路径，会带着真实密钥发出真实请求。
  - 写配置的接口如果有测试忘了打补丁，会改写真实配置文件。现有写配置测试都显式替换了 `CONFIG_FILE`（例：`backend/tests/test_recycle_bin_policy_api.py:63`）；`test-isolation` 合入后在主目录全量跑过，真实 `config.yaml` 的哈希前后一致。但这层保护全靠每个测试自己记得，没有兜底。
- **环境变量通道：** `config.py:18-28` 的 `_ENV_OVERRIDE_MAP` 把 9 个 `CRF_*` 变量覆盖到配置上。
  - `backend/tests/conftest.py:26-34` 只强制设置了数据库路径和上传目录；密钥只在为空时补一个随机值；`CRF_ENV` 被清掉。
  - 其余 6 个（`CRF_SERVER_HOST`、`CRF_SERVER_PORT`、`CRF_TEMPLATE_PATH`、`CRF_AUTH_ACCESS_TOKEN_EXPIRE_MINUTES`、`CRF_ADMIN_BOOTSTRAP_PASSWORD`、`CRF_DOCX_SCREENSHOT_BACKEND`）如果开发者 shell 里有，会原样进入测试进程。例如为了手动按生产配置启动服务而 `source` 过部署环境文件。
  - 本机 shell 目前没有任何 `CRF_*` 变量（只按名称核对，未看值）。
- **`_CONFIG_DIR`（`config.py:35`）不是配置来源。** 它只是相对路径的解析基准，用于 `db_path`、`upload_path`（`:241`、`:246`）和模板路径校验（`backend/src/services/import_service.py:71-72`）。测试会话里数据库和上传路径已经是绝对路径；模板路径白名单只认测试临时根下的目录（`import_service.py:60-64`）。
- **按名字导入 `CONFIG_FILE` 是陷阱。** 测试代码里只有 `test_recycle_bin_policy_api.py:10` 这样导入，而且没用上（`:63` 是按字符串 `"src.config.CONFIG_FILE"` 打补丁）。按名字导入会在导入那一刻固定取值，绕过之后的重定向和补丁。

## Requirements

- **R1 配置文件重定向：** conftest 在导入 `main` 之前，把 `src.config.CONFIG_FILE` 指向会话临时根下一个不存在的 `config.yaml`。
  - 读取只得到默认值加环境变量覆盖；
  - 任何没打补丁的写配置操作都落在临时根，随会话删除。
- **R2 清理外部配置变量：** conftest 在导入 `main` 之前：
  - 清除 `_ENV_OVERRIDE_MAP` 里除强制设置项以外的全部 `CRF_*` 变量。名单直接取自 `_ENV_OVERRIDE_MAP`，测试里不另抄一份，以后新增的配置变量自动覆盖；
  - `CRF_AUTH_SECRET_KEY` 改为每次会话无条件随机生成，不再沿用 shell 里的值。
- **R3 删除陷阱导入：** 删掉 `test_recycle_bin_policy_api.py:10` 没用上的 `from src.config import CONFIG_FILE`。
- **R4 守卫测试：** 在 `backend/tests/test_test_environment_isolation.py` 中新增两条：
  - `CONFIG_FILE` 解析到测试临时根之下；
  - 会话中不存在未被强制设置的 `CRF_*` 配置变量。失败信息只列变量名，不打印值。
- **R5 文档同步：**
  - `.trellis/spec/backend/quality-guidelines.md` 的 "Test Session Isolation (hermetic)" 一节补上配置文件和环境变量两条约定，以及「测试里不得按名字导入 `CONFIG_FILE`」；
  - README 中英文、根 `.claude/CLAUDE.md`、`backend/.claude/CLAUDE.md`、变更日志归档同步。

## Acceptance Criteria

- [ ] **AC1（R4）：** 两条新守卫先失败后通过：
  - `CONFIG_FILE` 守卫在实现前失败（指向仓库根）；
  - 环境变量守卫在 shell 里设置了 `CRF_TEMPLATE_PATH` 等哨兵变量时，实现前失败、实现后通过。
- [ ] **AC2（R1）：** 毒文件验证。在任务 worktree 根目录放一个一次性的 `config.yaml`，内容是非法 YAML，不含任何真实数据：
  - 实现前：导入 `main` 就报配置格式错误，测试会话起不来；
  - 实现后：毒文件还在的情况下，全量测试照常通过，证明测试进程不再解析仓库根的配置文件；
  - 验证完删掉这个文件。
- [ ] **AC3：** 后端全量测试的通过数不少于基线（`6580fc9` 时为 1030 passed / 4 xfailed；以开工时在最新 `main` 上重测的结果为准），没有新增失败。
- [ ] **AC4：** 生产代码零改动，`git diff --stat main -- backend/src backend/main.py backend/app_launcher.py` 为空。
- [ ] **AC5：** 合入后在主目录跑一次全量测试：通过；真实 `config.yaml` 的 sha256 前后一致。
- [ ] **AC6（R5）：** 文档已同步。

## Out of Scope

- 把 `_CONFIG_DIR` 也改到临时根。它不是配置来源，改了会改变相对路径的解析结果（见 design.md）。
- 为生产代码新增 `CRF_CONFIG_FILE` 一类的配置项，即为了测试需要扩大生产配置面。
- `CRF_DISABLE_BACKGROUND_JOBS`、`CRF_ENV` 这类运行开关。它们不在 `_ENV_OVERRIDE_MAP` 里，conftest 现有处理不变。
- 每个测试结束后清空临时根下 `config.yaml` 的逐测试兜底。目前没有测试不打补丁就写配置，改为在规范里写明约定。

## Dependencies and Order

- 前置：`test-isolation`（已在 `90a1962` 合入）。
- B 波，P3，低优先级。改动文件（`conftest.py`、守卫测试、`test_recycle_bin_policy_api.py` 的一行）与正在进行的 `small-defects` 不重叠，可以并行。
- 不要和 `backend-format` 同时进行，它要求没有其他后端分支在进行。如果 `backend-format` 先合入，从格式化后的 `main` 开工。
- `docs-sync` 最后执行，它的前置清单已加入本任务。
