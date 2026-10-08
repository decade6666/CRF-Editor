# 后端测试隔离真实资源并统计覆盖率

## Goal

- 后端测试只读写临时目录和临时数据库，不再碰仓库里的真实数据库、配置和上传目录。
- 在全新的 worktree（同一仓库的另一个独立工作目录）里，不建 `config.yaml`、不建数据库，就能直接跑通全量后端测试。
- 引入覆盖率统计（只统计、不设门槛），让「覆盖率不低于 80%」这条规定可以被检查。
- 生产代码零改动。

## Background（证据核实于 2026-10-08，`main` = `77e8f3f`）

- **CI 已删除**（提交 `8ed19cd`）。本机检查成了合入 `main` 前唯一的一道关，而本机测试目前不安全。
- **会读真实数据库的导出测试：**
  - `backend/tests/test_permission_guards.py:302` 经 `backend/src/routers/export.py:115-122`，调用 `export_service.py:4319`；
  - 这条路径直接读 `config.yaml` 指向的数据库，conftest 没有替换 `src.routers.export.get_config`；
  - 在主目录跑，读的是真实库；在新 worktree 里跑，会凭空建一个空库，然后测试失败；
  - 以前靠 CI 预建数据库，现在那段脚本只剩 git 历史（`a601090:.github/workflows/ci.yml`）。
- **今天新增的风险：** `backend/tests/test_docx_screenshot_service.py:207` 的 `test_lifespan_runs_render_backend_self_check_once` 会启动完整应用，而且没有替换 `init_db` 和配置。在主目录跑，会对真实数据库执行初始化迁移。
- **截图和导入的临时目录：**
  - 应用每次退出，`backend/main.py` 都会调用 `DocxScreenshotService.cleanup_old_caches(days=0)`，删掉 `backend/uploads/docx_temp` 下的所有子目录。这一步不受 `CRF_DISABLE_BACKGROUND_JOBS` 控制。
  - `DocxImportService.TEMP_DIR`（相对当前目录的 `uploads/docx_temp`）在测试里从来没被替换过，所以导入类测试会往真实目录写文件。
- **上传目录：** `backend/tests/conftest.py:35-38` 的 `_TEST_CONFIG` 默认 `./uploads`。每次启动应用都会在仓库根目录建一个 `uploads/`。
- **新 worktree 连测试都收集不了：** 没有 `config.yaml` 时 `auth.secret_key` 为空，`main.py` 在被导入时就报错。
- **没人用的夹具：** `backend/tests/test_export_validation.py:47-78` 定义了 `engine` 和 `client`，但没有测试用它们；而且它们没有隔离 `init_db`。
- **覆盖率工具不存在：**
  - `pytest-cov` 未安装，`backend/requirements-dev.txt` 里也没有；
  - `.coverage` 不在 `.gitignore` 里。
- **配置加载方式：**
  - `get_config()` 有缓存（`backend/src/config.py:334`），第一次被调用是在导入 `main` 的时候；
  - 所以 conftest 只要在导入应用之前设置好环境变量，就能可靠地改写路径（`CRF_DATABASE_PATH`、`CRF_STORAGE_UPLOAD_PATH` 等，见 `config.py:18-28`）。

## Requirements

- **R1 会话临时根目录：** conftest 在导入应用之前：
  - 为本次测试会话建一个临时根目录；
  - **强制**把数据库路径和上传目录指向它，不受开发者 shell 里同名环境变量的影响；
  - 没有密钥时，用随机生成的测试密钥（不写死字面量）；
  - `_TEST_CONFIG` 的上传目录也指向它。
- **R2 截图和导入目录：** 在会话级别，把 `DocxScreenshotService.BASE_DIR` 和 `DocxImportService.TEMP_DIR` 替换到临时根目录下。这样退出清理和导入写文件都落在临时目录里。不改生产代码。
- **R3 导出测试自建数据库：** `test_permission_guards.py` 的导出测试自己建一个临时数据库文件，写入被导出的用户和项目，不再依赖外部预建的库。
- **R4 删除没人用的夹具：** 删掉 `test_export_validation.py` 里没人用的 `engine`、`client`。
- **R5 守卫测试：** 断言测试会话中，数据库、上传目录、截图目录、导入临时目录都解析到临时根目录下。以后有人破坏隔离，这个测试会失败。
- **R6 覆盖率：**
  - `pytest-cov` 以固定版本加入 `requirements-dev.txt`，并装进本机虚拟环境；
  - 文档写明只统计、不设门槛的命令；
  - `.coverage`、`.coverage.*`、`htmlcov/`、`coverage.xml` 加入 `.gitignore`；
  - 不加进 `pytest.ini` 的默认参数。
- **R7 收尾：** 测试会话结束后删除临时根目录。
- **R8 文档同步：**
  - 测试命令和覆盖率命令写进 README 中英文、根 `.claude/CLAUDE.md` 和 `backend/.claude/CLAUDE.md`；
  - 测试隔离规则写进 `.trellis/spec/backend/quality-guidelines.md`。

## Acceptance Criteria

- [ ] **AC1（R5）**：守卫测试先失败后通过。
- [ ] **AC2（R1–R4）**：在全新 worktree 里，不建 `config.yaml`、不建数据库，全量后端测试通过。LibreOffice 相关测试照常运行。
- [ ] **AC3**：跑完全量测试后，用 `git status --porcelain --ignored` 对比，worktree 里除 `__pycache__/` 和 `.pytest_cache/` 外没有新增文件。
- [ ] **AC4**：生产代码零改动，`git diff --stat main -- backend/src backend/main.py` 为空。
- [ ] **AC5（R6）**：覆盖率命令可以运行，并记录基线：总覆盖率，以及各模块覆盖率中最低的 10 个。
- [ ] **AC6**：后端全量测试的通过数不少于基线（基线用一次性配置测得），没有新增失败。
- [ ] **AC7（R8）**：文档已同步。

## Out of Scope

- 合并 9 份重复的 `engine` 夹具（各自的连接池和外键设置不同）。
- 设覆盖率门槛；前端覆盖率（`frontend-mount-tests` 中作为可选项）。
- 把截图目录做成生产配置项，或在 `main.py` 里按开关跳过退出清理（两者都要改生产代码）。
- `docx-temp-ownership` 自己的测试（它的测试自己替换目录，与本任务兼容）。

## Dependencies and Order

- 第一波，没有前置依赖。可与 `docx-temp-ownership`、`pre-commit-gate` 并行，代码文件不重叠。
- 合入后，其他子任务不再需要一次性测试配置。父任务执行手册 §1 的「禁止在主目录跑后端测试」随之解除，但仍建议在任务 worktree 里跑。
