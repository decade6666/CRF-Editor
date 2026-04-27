# Tasks: 公网部署安全加固

## 1. 管理员语义迁移

- [x] 1.1 在 `backend/src/models/user.py` 增加 `is_admin` 字段，并在 `backend/src/database.py` 增加轻量迁移与幂等自愈逻辑。
- [x] 1.2 在启动路径实现 production 空库自动创建保留管理员账号，并确保重复启动不重复创建。
- [x] 1.3 修改 `backend/src/dependencies.py`、`backend/src/routers/admin.py`、`backend/src/routers/auth.py`，使管理员授权与 `/api/auth/me` 统一依赖 `user.is_admin`。
- [x] 1.4 修改 `backend/src/services/user_admin_service.py`，禁止创建、改名或删除保留管理员账号。
- [x] 1.5 更新 `backend/tests/helpers.py` 及相关管理员测试基座，适配 `is_admin` 语义。

## 2. 路径与静态资源安全

- [x] 2.1 重构 `backend/src/utils.py` 的路径校验语义，保留 `(bool, str)` 协议并支持 allowlisted resolved-path 校验。
- [x] 2.2 修改 `backend/main.py` 的 `/assets/{filepath}`，先拒绝原始危险输入，再对白名单候选路径做包含关系校验。
- [x] 2.3 为 `/assets` 增加 POSIX、URL 编码、Windows 风格路径绕过回归测试。

## 3. Logo 与模板路径加固

- [x] 3.1 收紧 `backend/src/utils.py` 的上传校验：拒绝 SVG/XML、校验真实文件大小、按检测结果决定保存扩展名。
- [x] 3.2 修改 `backend/src/routers/projects.py` 的 Logo 上传与读取逻辑，禁止历史 SVG 继续被读取。
- [x] 3.3 修改 `frontend/src/components/ProjectInfoTab.vue`，将 Logo 文件选择器限制为位图格式，并展示后端错误详情。
- [x] 3.4 修改 `backend/src/routers/settings.py`，将 `template_path` 限制为白名单目录内的 `.db` 文件。
- [x] 3.5 修改模板实际使用路径（如 `backend/src/services/import_service.py`），在运行时再次执行同样的 `template_path` 安全校验。
- [x] 3.6 为 Logo 与 `template_path` 添加保存层和运行层回归测试。

## 4. 生产配置与响应面收敛

- [x] 4.1 在 `backend/src/config.py` 实现显式 `CRF_*` 环境变量覆盖层，并保证 env-only secret 不会被 `update_config()` 写回 YAML。
- [x] 4.2 将生产 secret 校验、docs 关闭逻辑前移到应用构造阶段，必要时引入轻量 `create_app()` 封装并保持现有入口兼容。
- [x] 4.3 在 `backend/main.py` 增加统一安全响应头中间件，覆盖成功、错误、429 与静态文件响应。
- [x] 4.4 将默认 JWT TTL 收紧到不超过 60 分钟，并更新 `config.yaml`、`.env.example` 示例值。
- [x] 4.5 为生产 env secret、docs 404、安全头、JWT TTL 添加后端测试。

## 5. 登录与导入限流

- [x] 5.1 在后端实现单机内存限流组件，支持 production 启用、development/test 关闭、测试态重置。
- [x] 5.2 将限流应用到 `POST /api/auth/enter`、`POST /api/projects/import/project-db`、`POST /api/projects/import/database-merge`、`POST /api/projects/import/auto`、`POST /api/projects/{project_id}/import-docx/preview`、`POST /api/projects/{project_id}/import-docx/execute`。
- [x] 5.3 统一 429 JSON 响应为中文 `detail` 并附带 `Retry-After`，且默认不信任 `X-Forwarded-For`。
- [x] 5.4 调整 `frontend/src/composables/useApi.js` 与 `frontend/src/components/LoginView.vue` 的错误展示，确保 429 与 401 继续按现有 UX 正常工作。
- [x] 5.5 为限流触发、窗口恢复、测试隔离和前端错误展示补齐测试。

## 6. 文档与部署说明

- [x] 6.1 新增 `.env.example`，列出 `CRF_ENV`、`CRF_AUTH_SECRET_KEY`、TTL 与必要配置示例。
- [x] 6.2 更新 `README.md` 与 `README.en.md`，补充公网部署安全要求、secret 迁移、docs 关闭、SVG 禁用、模板路径白名单与限流说明。
- [x] 6.3 更新根级或模块级 `CLAUDE.md` 中与部署/配置相关的关键上下文，确保说明与实现一致。
- [x] 6.4 在文档中显式记录“production 空库自动创建管理员账号”为已接受残余风险及上线后审计步骤。

## 7. 验证与回归

- [x] 7.1 运行后端测试，覆盖管理员迁移、路径安全、Logo/模板路径、生产配置、限流与 JWT TTL。
- [x] 7.2 运行前端测试，覆盖登录 401/429、Logo 上传错误展示与现有登录回归。
- [x] 7.3 手动验证 production 配置下 `/docs`、`/redoc`、`/openapi.json` 为 404，普通响应带安全头，非法 Logo/路径被拒绝，登录与导入接口可命中 429。
