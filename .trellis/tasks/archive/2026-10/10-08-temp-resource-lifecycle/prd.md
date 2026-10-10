# 统一临时资源生命周期：流式上传与异步接口线程池

> 锚点策略：本 PRD 的行号为 2026-10-09 基于 main（a4431b0，LC/BF 合入前）的指示性参考，**以符号名为权威**；任务开工（LC `legacy-cleanup` 删除 `src/perf.py` 与全部 `perf_span`/`record_*`、BF `backend-format` ruff 0.16.10 全后端重排）之后行号必然漂移，由 implement.md S0 按符号重新锚定。历次规划版本的行号迭代值记录在 `research/evidence-2026-10-09.md`，不再在本文重复。

## Goal

- 上传接口改为"边读边限长、直接写临时文件"，超大文件在端点缓冲完整请求体之前就被拒绝（应用层语义；框架 multipart 解析先于端点，不属本任务承诺）。
- 把异步接口（`async def`）里跑的同步重活移入线程池，避免单个慢请求卡住整个事件循环（event loop，即 asyncio 单线程调度器）。
- 把临时文件的目录定义统一为单一来源，并复用 `docx-temp-ownership` 的归属登记与过期清理，不再各写一套。

## Background（证据核实于 2026-10-09，main@a4431b0；本文只保留单一权威锚点集）

- 上传先整读进内存、后查大小（已核实）：
  - `.db` 导入：`backend/src/routers/projects.py` 三处 `file_bytes = await file.read()`（`import_project_db`/`import_database_merge`/`import_auto` 三个 `async def` 内）；大小上限 `_MAX_IMPORT_SIZE = 200MB`（模块常量），检查在 `_save_bytes_to_temp`（魔数 `content[:16].startswith(b"SQLite format 3")` 在前、`len(content)` 大小判断在后，400 文案「文件不是有效的 SQLite 数据库」「文件大小超过限制（最大 200 MB）」）。`_save_bytes_to_temp` 经 `tempfile.mkstemp` 落入系统临时目录，仅靠请求内 `finally` 删除，进程崩溃即泄漏；存储后缀取 `Path(filename).suffix or '.db'`，接受任意/无后缀。
  - Word 预览：`backend/src/routers/import_docx.py` `preview_docx_import` 内 `content = await file.read()` 整读后调 `DocxImportService.save_temp_file`；10MB 上限为 `DocxImportService.MAX_FILE_SIZE`（`backend/src/services/docx_import_service.py`），检查在其 `save_temp_file` 内，同样发生在整读之后。
  - Logo 上传已是限长读取，不在本任务范围内（审查结论，维持不变）。
- 异步接口跑同步重活（最终清单见 design.md D4）：`projects.py` 三个导入 `async def`（重活 `ProjectDbImportService.import_single_project` 与 `DatabaseMergeService.merge`，均同步、只 flush、提交在 `get_session` 的 `session.begin()` 收尾）；`import_docx.py` 中 `preview_docx_import`（重活 `parse_full` + `DocxScreenshotService.start`，后者内部 LibreOffice 渲染）与 `start_docx_screenshot`（条件性 `parse_full` + `start`）；`cleanup_screenshots`（同步目录遍历+删除，admin 手动）。轻接口不包：`get_ai_review_status`、`get_screenshot_status`、`get_screenshot_page`（纯内存/路径解析）；`start_ai_review` 留在事件循环（asyncio.create_task）。对照：Word 导出路由、`execute_docx_import`、`import_template.py` 三端点均为普通 `def`，FastAPI 自动放线程池，不受影响（已复核）。
- 临时目录定义分裂（已核实）：`DocxImportService.TEMP_DIR = "uploads/docx_temp"`（`docx_import_service.py`，相对 cwd）；`DocxScreenshotService.BASE_DIR`（`docx_screenshot_service.py`，由 `__file__` 推出绝对路径 `backend/uploads/docx_temp`）。两者只有在服务以 `cwd=backend/` 运行时才指向同一目录。
- 运行目录核实：`deploy/crf-editor.service.template` `WorkingDirectory=__APP_DIR__/backend`（服务器生产模式 cwd=backend，两目录恰好重合）；`backend/app_launcher.py` chdir 到可执行文件目录（桌面打包模式相对路径可能失效；桌面增量见 design.md D7）。
- 本任务基于 `docx-temp-ownership`（已合入）的归属登记与过期清扫机制做扩展（复用，不重复造）：`background_jobs.py` 的 `_docx_temp_sweep_loop` 每小时经 `asyncio.to_thread` 调 `DocxImportService.purge_expired_uploads()`，本任务扩展该函数即可覆盖 `.db`，无需改 `background_jobs.py`。
- 本任务在 LC 之后开工：`src/perf.py` 与全部 `perf_span`/`record_*` 调用（含 `projects.py`/`import_docx.py`/`docx_import_service.py`/`project_import_service.py`）已被 LC 删除，本任务**不引入任何替代性能埋点**。
- `save_temp_file`（bytes 签名）在本任务内删除：流式化后其唯一生产调用方（docx 预览）改走流式，另一调用方 `run_perf_baseline.py` 已被 LC 删除；不为此保留仅剩测试使用的生产代码（测试接缝转换见 design.md D3/D6）。

## Requirements

- R1：四处上传（`projects.py` 三个 `.db` 导入/合并接口、`import_docx.py` 的 Word 预览）改为流式分块读取：循环 `chunk` 读取并累计大小，超过上限立即拒绝并删除半成品文件；内容直接写入临时文件，不再整体缓冲。保留现有语义：SQLite 魔数校验（`b"SQLite format 3"` 15 字节前缀 + EOF 短读兼容，不收紧为 16 字节/NUL）、文件名安全处理、错误码与提示文案不变。错误先后顺序不变：现状先查魔数再查大小，超大且非 SQLite 的文件报「文件不是有效的 SQLite 数据库」；流式读取必须先完成魔数校验、再执行大小上限（design.md D1/D3b，顺序有测试锁定）。
- R2：把 design.md D4 清单中跑重活的服务调用包进 `fastapi.concurrency.run_in_threadpool`（唯一机制，不用 `asyncio.to_thread`——非放弃取消语义是正确性约束：取消需等工作线程完成，避免 `get_session` 的事务收尾与仍在运行的线程并发操作同一 Session，见 design.md D4）；只包服务调用本身，数据库会话（session）与事务的归属保持不变（会话仍由请求级依赖创建、在请求结束时关闭，不在多线程间并发共享）。
- R3：临时目录统一为单一常量来源：`DocxImportService.TEMP_DIR` 与 `DocxScreenshotService.BASE_DIR` 同源（由模块文件位置推出的绝对路径，落在 `backend/uploads/docx_temp`），两处引用同一小模块常量，不再依赖 cwd；常量仅允许在 `temp_paths.py` 定义与两处类属性赋值中被引用（测试隔离硬约束，design.md D2）。
- R4：复用 `docx-temp-ownership` 的归属登记与过期清扫机制覆盖本任务新增/迁移的临时文件（`.db` 临时文件纳入同一清扫入口，走 `backend/src/background_jobs.py` 现有后台循环，不新增调度框架）。
- R5：测试：(a) 构造超过上限的流式请求体，断言被拒绝且服务端未缓冲完整请求体（应用层证明：mock 读取计数/提前停止/边读边写；见 design.md D1 上传边界）；(b) 断言重活经 `fastapi.concurrency.run_in_threadpool` 执行（断言该符号被调用；改用 `asyncio.to_thread` 视为违反 D4）；(c) 现有全部导入相关测试保持绿色（断言不变、接缝按 design.md D6 转换）。

## Acceptance Criteria

- [ ] AC1（对应 R1）：超大 `.db` 与超大 `.docx` 上传返回与现在一致的错误响应（400 + 中文提示），且临时目录无残留半成品文件；超大且非 SQLite 的文件仍报「文件不是有效的 SQLite 数据库」（魔数先于大小的顺序有测试锁定）。
- [ ] AC2（对应 R1）：正常大小的 `.db` / `.docx` 上传功能行为不变（现有导入测试全绿）。
- [ ] AC3（对应 R2）：design.md D4 最终清单（6 个接口）的服务调用全部经 `fastapi.concurrency.run_in_threadpool` 在线程池中执行（唯一机制，理由见 D4），事件循环不再被阻塞（有自动化断言，spy 锁定该符号）。
- [ ] AC4（对应 R3）：`DocxImportService.TEMP_DIR` 与 `DocxScreenshotService.BASE_DIR` 指向同一绝对目录，有测试锁定；在非 `backend/` cwd 下启动服务时 Word 上传仍落到正确目录。
- [ ] AC5（对应 R4）：`.db` 临时文件纳入过期清扫，测试覆盖"过期文件被清扫"。
- [ ] AC6（回归门禁）：后端全量测试（父任务执行手册 §3 的命令，在任务 worktree 内运行）无新增失败；BF 已合入，改动文件须过 ruff format 门。
- [ ] AC7（文档同步）：按 implement.md S9 的文档所有权分工同步（执行者改 `backend/.claude/CLAUDE.md` 与 session.log，协调者所有文档由执行者提案文本）。

## Out of Scope

- 不改 Word 导入解析器与预览比对逻辑（只动上传与执行方式）。
- 不改 Logo 上传（已限长）。
- 不引入 Redis / Celery / 新的后台任务框架（复用 `background_jobs.py`）。
- 不改前端导入向导（那是 `app-word-import-split` 的范围）；不改 `docx-temp-ownership` 已定义的归属与命名规则本身。
- 不引入任何性能埋点/计时替代物（LC 已删除 `perf.py` 与全部埋点，本任务不回填）。
- 全局非目标：不做重写 / 换技术栈 / 微服务 / TypeScript 迁移；不引入 Alembic 或版本表迁移；不合并不同的数据库会话类型、排序规则或撤销保护；不做通用 CRUD 列表组件；不做大范围"防御性代码"清理；不重写 Word 导入解析器。

## Dependencies and Order

- **开工前置**：`legacy-cleanup`（LC）与 `backend-format`（BF）必须都已合入 `main`（S0 按符号验证：`perf.py` 不存在、`backend/ruff.toml` 存在）；未满足则不开工并上报。
- 并行面：开工后与 `export-layer-cleanup`（ELC）、`backend-dedup`（BD）并行。已知交叠：BD 修改 `routers/projects.py` 的 `BatchDeleteRequest`（与三个导入端点不同区域）；协调者会在 ELC/BD 开工前通报具体面，若实际交叠则后合并方执行"先 `git merge main` 入分支、重跑全部门禁"的二次合并规则。
- 一个任务 = 一个 worktree + 一个分支，检查通过后本地合入 `main`。

## Before Starting

这是范围文档。design.md / implement.md 已基于 2026-10-09 的 main 补写（锚点为符号优先，S0 会按 LC/BF 合入后的实际代码重新锚定）；执行流程见父任务 `implement.md`（公共执行手册）。就绪状态：`docx-temp-ownership` 已合入（归属登记 + 24h 清扫可直接复用）、测试套件完全隔离（全新 worktree 零配置直跑、`pytest-cov` 可用）、设计/执行文档已就绪——唯一未满足项是 LC/BF 的合入（S0 门禁）。
