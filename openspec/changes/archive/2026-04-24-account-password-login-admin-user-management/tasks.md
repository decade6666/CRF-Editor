# Tasks: 账号密码登录与管理员独立用户管理界面

## 1. 配置与数据模型
- [x] 1.1 修改 `backend/src/config.py`：为管理员 bootstrap 密码增加配置来源，并接入环境变量覆盖
- [x] 1.2 修改 `backend/src/models/user.py`：新增 `auth_version`（或等价版本字段），默认值固定为 0
- [x] 1.3 修改 `backend/src/database.py`：补充 `user.auth_version` 轻量迁移，保持旧库幂等升级
- [x] 1.4 修改 `backend/src/database.py`：把“可用保留管理员”判定、自愈、自动补建与 production fail-fast 规则固化到初始化流程
- [x] 1.5 修改 `backend/src/database.py`：保留普通用户 `id` 与 `project.owner_id` 不变，覆盖 whitespace admin 历史记录修复路径

## 2. 后端密码认证能力
- [x] 2.1 修改 `backend/requirements.txt`：新增密码哈希依赖，选择可稳定用于当前部署/打包环境的方案
- [x] 2.2 修改 `backend/src/services/auth_service.py`：新增 `hash_password`、`verify_password`、`validate_password_policy`
- [x] 2.2.1 收口“可用密码哈希”判定：统一由单一密码服务函数负责，禁止登录、列表、bootstrap 各自分散解释
- [x] 2.3 修改 `backend/src/services/auth_service.py`：JWT payload 新增版本字段并在校验时比对数据库版本
- [x] 2.4 修改 `backend/src/dependencies.py`：统一 `OAuth2PasswordBearer.tokenUrl` 与新登录接口 `/api/auth/login`
- [x] 2.5 修改 `backend/src/routers/auth.py`：新增账号密码 `POST /api/auth/login`，移除无密码自动创建语义
- [x] 2.6 修改 `backend/src/routers/auth.py`：为“未设密码账号”实现 development 明确提示 / production 通用 401 的错误契约
- [x] 2.7 修改 `backend/src/routers/auth.py`：保留 production 认证限流与 `429 + Retry-After` 契约

## 3. 管理员用户管理能力
- [x] 3.1 修改 `backend/src/services/user_admin_service.py`：创建用户时强制设置初始密码，不再创建 `hashed_password = NULL` 新用户
- [x] 3.2 修改 `backend/src/services/user_admin_service.py`：新增管理员密码重置能力，并在重置后递增认证版本
- [x] 3.3 修改 `backend/src/services/user_admin_service.py`：为用户列表增加 `has_password`（或最终定稿状态字段）
- [x] 3.4 修改 `backend/src/routers/admin.py`：扩展 `POST /api/admin/users` 请求体，要求 `password`
- [x] 3.5 修改 `backend/src/routers/admin.py`：新增 `PUT /api/admin/users/{user_id}/password` 接口，成功响应固定为 `204 No Content`
- [x] 3.6 修改 `backend/src/routers/admin.py`：更新用户列表响应模型，返回密码状态字段
- [x] 3.7 修改 `backend/src/routers/admin.py`：保持保留管理员不可删除、不可改名、不可手动创建同名账号，但允许重置密码

## 4. 前端登录与壳层分流
- [x] 4.1 修改 `frontend/src/components/LoginView.vue`：新增密码输入项、改为调用 `/api/auth/login`
- [x] 4.2 修改 `frontend/src/components/LoginView.vue`：development 下展示迁移提示，production 下显示通用失败文案
- [x] 4.3 修改 `frontend/src/App.vue`：登录成功后先拉取 `/api/auth/me` 再决定管理员/普通用户主工作台
- [x] 4.4 修改 `frontend/src/App.vue`：管理员登录时不加载普通项目壳层，不显示项目列表、设计器与普通编辑入口
- [x] 4.5 修改 `frontend/src/components/AdminView.vue`：新增用户创建密码输入与密码重置入口
- [x] 4.6 修改 `frontend/src/components/AdminView.vue`：新增密码状态列，显示“已设密码/未设密码”

## 5. 后端测试重建
- [x] 5.1 修改 `backend/tests/helpers.py`：`login_as` 迁移到账号密码登录契约，支持显式设密码用户
- [x] 5.2 重写 `backend/tests/test_auth.py`：覆盖成功登录、错误密码、未设密码、旧 JWT 立即失效、无 token 401
- [x] 5.3 修改 `backend/tests/test_rate_limit.py`：把认证限流入口从 `/api/auth/enter` 切到 `/api/auth/login`，保持 production/non-production 契约不变
- [x] 5.4 修改 `backend/tests/test_user_admin.py`：覆盖创建用户必须带密码、密码重置、`has_password` 状态、保留管理员保护
- [x] 5.5 修改 `backend/tests/test_user_admin.py`：覆盖 production 空库 bootstrap、非空库无 admin 自动补建/修复、bootstrap 密码缺失 fail-fast
- [x] 5.6 修改 `backend/tests/conftest.py` 与相关夹具：去除对无密码 `/api/auth/enter` 自动创建语义的依赖

## 6. 前端测试与文档同步
- [x] 6.1 修改 `frontend/tests/appSettingsShell.test.js`：校验登录组件结构与 admin 壳层挂载逻辑
- [x] 6.2 修改 `frontend/tests/adminViewStructure.test.js`：校验 `AdminView` 的密码状态列与密码管理入口
- [x] 6.3 Grep 检查并更新 `frontend/tests/*.test.js` 中旧 `/api/auth/enter`、旧登录文案与旧壳层断言
- [x] 6.4 更新 `README.md` 与 `README.en.md`：账号密码登录、管理员 bootstrap 密码、旧账号迁移说明
- [x] 6.5 更新 `backend/.claude/CLAUDE.md` 与 `frontend/.claude/CLAUDE.md`：同步新的认证入口与管理员独立工作台说明

## 7. 验证与质量校验
- [x] 7.1 运行 `cd backend && python -m pytest`，确认认证、管理员、限流回归全部通过
- [x] 7.2 运行 `cd frontend && node --test tests/*.test.js`，确认登录与管理员壳层回归通过
- [x] 7.3 手动验证：管理员登录默认进入独立用户管理工作台，普通工作台入口不显示
- [x] 7.4 手动验证：旧无密码账号在 development 收到迁移提示，在 production 收到通用未授权
- [x] 7.5 手动验证：管理员重置密码后，旧 token 立即失效，新 token 可正常访问
