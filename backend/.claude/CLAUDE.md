[根目录](../../.claude/CLAUDE.md) > **backend**

# backend 模块说明

> 最近更新：2026年4月28日 星期二 08:31:55 PDT

## 模块职责
- 提供 REST API 与前端静态资源入口。
- 管理 SQLite 数据模型、轻量迁移与 WAL / 外键等连接配置。
- 执行模板 `.db` 导入、项目 `.db` 导入 / 整库合并、Word `.docx` 导入、Word 导出与数据库导出。
- 提供用户认证、管理员接口、普通用户改密、项目隔离与桌面发行入口。

## 关键入口
- `backend/main.py`：创建 FastAPI 应用、注册路由、配置异常处理与安全头，启动时校验配置、创建上传目录并初始化数据库。
- `backend/app_launcher.py`：PyInstaller 桌面入口，注入打包静态目录、启动 Uvicorn、本地浏览器与系统托盘。
- `backend/src/config.py`：配置加载、缓存与原子更新；`config.yaml` 位于项目根目录，生产优先读取 `CRF_*` 环境变量。
- `backend/src/database.py`：数据库引擎、SQLite PRAGMA、Session 与列级轻量迁移。
- `backend/src/dependencies.py`：认证、数据库会话、项目权限与管理员权限依赖。
- `backend/src/rate_limit.py`：单机内存限流，用于登录、改密与高成本导入接口。
- `backend/src/perf.py`：性能基线中间件与指标收集。
- `backend/src/utils.py`：路径安全校验等通用工具函数。

## 核心目录
- `src/routers/`（12 个路由模块）：认证、管理员、项目、访视、表单、字段、字典、单位、导入导出、设置接口。
- `src/services/`（12 个服务模块）：认证、用户管理、导入、导出、排序、项目克隆、项目导入、AI 复核、Docx 截图缓存、列宽规划、字段渲染等重逻辑。
- `src/models/`（10 个 ORM 模型）：Project、Visit、Form、VisitForm、FieldDefinition、FormField、CodeList、CodeListOption、Unit、User。
- `src/schemas/`（6 个 Pydantic 模块）：项目、访视、表单、字段、字典、单位等请求/响应结构。
- `src/repositories/`（5 个仓储模块）：基础仓储、项目、字段定义、字段实例、表单字段等数据库访问封装。
- `tests/`（34 个测试文件）：认证、管理员、权限、项目隔离、导入导出、排序、配置、WAL、限流、列宽规划、性能基线等 pytest 用例。
- `scripts/`（4 个脚本）：模板数据库迁移、性能 fixture 生成、性能基线运行、性能证据汇总。

## 路由概览
- `routers/auth.py`：登录、当前用户、普通用户改密与认证错误语义。
- `routers/admin.py`：管理员用户管理、密码重置、批量项目操作与回收站。
- `routers/projects.py`：项目 CRUD、项目复制、Logo 上传/读取/删除、数据库导入导出。
- `routers/visits.py`、`routers/forms.py`、`routers/fields.py`：CRF 结构维护。
- `routers/codelists.py`、`routers/units.py`：字典与单位维护。
- `routers/import_template.py`、`routers/import_docx.py`：模板库与 Word 导入预览/应用。
- `routers/export.py`：Word 导出。
- `routers/settings.py`：配置读取、保存与 AI 连通性测试。

## 服务概览
- `auth_service.py`、`user_admin_service.py`：密码哈希、JWT 版本失效、管理员保留账号与用户管理。
- `import_service.py`、`project_import_service.py`、`docx_import_service.py`：模板、项目库与 Word 导入。
- `export_service.py`：Word 文档渲染与导出。
- `width_planning.py`：后端列宽规划，与前端 `useCRFRenderer.js` 共享 fixture 契约。
- `order_service.py`：访视、表单、字段等排序写入逻辑。
- `project_clone_service.py`：项目深拷贝与 Logo 联动。
- `docx_screenshot_service.py`：Word 导入截图缓存生命周期。
- `ai_review_service.py`：AI 导入建议/复核调用。
- `field_rendering.py`：字段渲染辅助逻辑。

## 数据库与兼容性
- SQLite 连接启用 `foreign_keys=ON`、`journal_mode=WAL`、`busy_timeout=5000`、`synchronous=NORMAL`。
- `src/database.py` 负责历史库兼容迁移，包括 `code`、`order_index`、`design_notes`、颜色标记、`owner_id`、软删除、排序字段与用户密码相关字段等补齐。
- `form_field` 结构采用规范列集合重建策略，确保老库升级后字段实例结构一致。
- 主入口统一将常见验证错误、唯一约束冲突、导入错误与导出错误转换为稳定 JSON 响应。

## 安全行为
- production 下关闭 `/docs`、`/redoc`、`/openapi.json`，并要求 `CRF_AUTH_SECRET_KEY`。
- production 下 JWT TTL 不得超过 60 分钟。
- 登录、改密与高成本导入接口使用单机内存限流。
- production 下若不存在可用保留管理员，启动阶段会基于 `admin.bootstrap_password` / `CRF_ADMIN_BOOTSTRAP_PASSWORD` 自动修复或补建；缺失时 fail-fast。
- 管理员创建用户必须同时设置初始密码；重置密码会通过 `auth_version` 立即失效旧 JWT。
- Logo 文件由 `upload_path/logos` 管理，仅允许安全位图格式，项目复制与硬删除会同步处理对应文件。
- `template_path` 必须位于白名单目录内且为 `.db`。

## 导入导出与列宽契约
- Word 导出 normal 表列宽采用内容驱动：`export_service._build_form_table` 调用 `width_planning.plan_normal_table_width(fields, available_cm=14.66)`。
- `available_cm=14.66` 与原页面预算对齐；字符权重与 CJK 扩展区覆盖与前端 `useCRFRenderer.js` 共享契约。
- 跨栈 fixture 位于 `backend/tests/fixtures/planner_cases.json`，同时被 `backend/tests/test_width_planning.py` 与 `frontend/tests/columnWidthPlanning.test.js` 读取。

## 常用命令
```bash
cd backend && python main.py
cd backend && python -m pytest
cd backend && python -m pytest tests/test_config.py -q
cd backend && python -m pytest tests/test_auth.py tests/test_user_admin.py -q
```

## 开发约定
- 分层结构：`routers -> repositories/services -> models/schemas`。
- 重逻辑放 `services/`，接口层保持轻量。
- 数据结构演进由 `src/database.py` 内轻量迁移维护。
- 接口响应以稳定 JSON 为主，错误信息优先返回可直接展示的中文 `detail`。
- 修改认证、管理员、限流、项目隔离、导入路径或 Logo 处理时，需要同步补充安全测试。
- 修改导入导出或列宽规划时，需要同步更新后端测试、前端契约测试和根级/模块级文档。

## 相关文件清单
| 类别 | 文件 |
|------|------|
| 入口 | `main.py`、`app_launcher.py` |
| 基础设施 | `src/config.py`、`src/database.py`、`src/dependencies.py`、`src/rate_limit.py`、`src/perf.py`、`src/utils.py` |
| 路由 | `src/routers/auth.py`、`src/routers/admin.py`、`src/routers/projects.py`、`src/routers/visits.py`、`src/routers/forms.py`、`src/routers/fields.py`、`src/routers/codelists.py`、`src/routers/units.py`、`src/routers/export.py`、`src/routers/settings.py`、`src/routers/import_template.py`、`src/routers/import_docx.py` |
| 服务 | `src/services/auth_service.py`、`src/services/user_admin_service.py`、`src/services/import_service.py`、`src/services/project_import_service.py`、`src/services/docx_import_service.py`、`src/services/export_service.py`、`src/services/width_planning.py`、`src/services/order_service.py`、`src/services/project_clone_service.py`、`src/services/docx_screenshot_service.py`、`src/services/ai_review_service.py`、`src/services/field_rendering.py` |
| 模型 | `src/models/project.py`、`src/models/visit.py`、`src/models/form.py`、`src/models/visit_form.py`、`src/models/field_definition.py`、`src/models/field.py`、`src/models/form_field.py`、`src/models/codelist.py`、`src/models/unit.py`、`src/models/user.py` |
| Schema | `src/schemas/project.py`、`src/schemas/visit.py`、`src/schemas/form.py`、`src/schemas/field.py`、`src/schemas/codelist.py`、`src/schemas/unit.py` |
| 仓储 | `src/repositories/base_repository.py`、`src/repositories/project_repository.py`、`src/repositories/field_definition_repository.py`、`src/repositories/field_repository.py`、`src/repositories/form_field_repository.py` |

## 变更记录
- `2026年4月28日 星期二 08:31:55 PDT`：全量扫描刷新。源码 53 文件（routers 12、services 12、models 10、schemas 6、repositories 5、基础设施 8）、测试 34 文件、脚本 4 文件。补充基础设施与服务条目。
- `2026年4月27日 星期一 05:45:45 PDT`：初始生成。
