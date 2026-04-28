# Tasks: 多用户隔离与并发安全

> 零决策可执行任务。所有架构决策已在 design.md 和 specs/*.md 中锁定。
> 实施顺序：Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7。

## Phase 1: 基础配置与服务层

- [x] 1.1 在 `backend/requirements.txt` 中添加 `PyJWT>=2.8.0`、`passlib[bcrypt]>=1.7.4`、`python-multipart>=0.0.9`
- [x] 1.2 在 `backend/src/config.py` 中添加 `AuthConfig` 类（字段：secret_key, algorithm, access_token_expire_minutes, admin_initial_password）并在 `AppConfig` 中添加 `auth: AuthConfig = AuthConfig()` 字段
- [x] 1.3 创建 `backend/src/models/user.py`：`User` 模型（id, username, hashed_password, created_at），遵循现有 SQLAlchemy Mapped 风格
- [x] 1.4 在 `backend/src/models/__init__.py` 中导入 `User`，确保 `Base.metadata.create_all` 能创建 user 表
- [x] 1.5 创建 `backend/src/services/auth_service.py`：`hash_password`、`verify_password`、`create_access_token`、`decode_token` 四个函数（PyJWT + passlib[bcrypt]）
- [x] 1.6 创建 `backend/src/dependencies.py`：`get_current_user` 依赖（OAuth2PasswordBearer + PyJWT 解码 + User 查询，失败返回 401）和 `verify_project_owner` 函数（项目不存在 → 404，非 owner → 403）

## Phase 2: 数据库迁移与 WAL 优化

- [x] 2.1 在 `backend/src/database.py` 的 `get_engine()` 中，将现有 `_enable_fk` 事件监听器重命名为 `_configure_sqlite` 并追加三条 PRAGMA：`journal_mode=WAL`、`busy_timeout=5000`、`synchronous=NORMAL`
- [x] 2.2 在 `backend/src/database.py` 中添加 `_migrate_add_project_owner_id(engine)` 函数：用 inspect 检查 project 表的列，若无 `owner_id` 则执行 `ALTER TABLE project ADD COLUMN owner_id INTEGER REFERENCES "user"(id)`
- [x] 2.3 在 `backend/src/database.py` 中添加 `_bootstrap_admin_user(engine)` 函数：读取 `config.auth.admin_initial_password`，为空则 WARNING 跳过；否则检查 admin 账号不存在时创建，并 `UPDATE project SET owner_id = <admin_id> WHERE owner_id IS NULL`
- [x] 2.4 在 `init_db()` 末尾依次调用 `_migrate_add_project_owner_id(engine)` 和 `_bootstrap_admin_user(engine)`

## Phase 3: Project 层数据隔离

- [x] 3.1 在 `backend/src/models/project.py` 中添加 `owner_id: Mapped[Optional[int]]`（`ForeignKey("user.id")`，nullable=True，index=True）和 `owner: Mapped[Optional["User"]]` relationship
- [x] 3.2 在 `backend/src/repositories/project_repository.py` 中添加 `get_all_by_owner(self, owner_id: int) -> list[Project]` 方法（`SELECT ... WHERE owner_id = :owner_id`）
- [x] 3.3 在 `backend/src/repositories/project_repository.py` 中添加 `create_with_owner(self, project: Project, owner_id: int) -> Project` 方法（注入 owner_id 后 add + flush + refresh）
- [x] 3.4 在 `backend/src/routers/projects.py` 所有端点签名中添加 `current_user: User = Depends(get_current_user)` 参数
- [x] 3.5 修改 `list_projects`：改用 `repo.get_all_by_owner(current_user.id)`
- [x] 3.6 修改 `create_project`：改用 `repo.create_with_owner(Project(**data.model_dump()), current_user.id)`
- [x] 3.7 修改 `get_project`、`update_project`、`delete_project`、`get_logo`、`upload_logo`：获取项目后校验 `project.owner_id == current_user.id`，不匹配则 `raise HTTPException(403, "无权访问此项目")`

## Phase 4: 认证路由

- [x] 4.1 创建 `backend/src/routers/auth.py`：`POST /auth/register`（RegisterRequest: username+password → 检查重复 → 创建 User → 返回 TokenResponse）和 `POST /auth/login`（OAuth2PasswordRequestForm → 验证密码 → 返回 TokenResponse）
- [x] 4.2 在 `backend/main.py` 中导入并注册 auth 路由：`app.include_router(auth_router, prefix="/api")`
- [x] 4.3 在 `backend/main.py` 的应用启动阶段添加 `secret_key` 非空校验：`config.auth.secret_key` 为空时 `raise RuntimeError("config.yaml 缺少 auth.secret_key")`

## Phase 5: 子资源路由归属链校验

- [x] 5.1 在 `backend/src/routers/visits.py` 所有含 `project_id` 路径参数的端点中添加 `current_user: User = Depends(get_current_user)` 并在函数体首行调用 `verify_project_owner(project_id, current_user, session)`
- [x] 5.2 在 `backend/src/routers/forms.py` 中同 5.1 处理
- [x] 5.3 在 `backend/src/routers/fields.py`（field_definitions）中同 5.1 处理
- [x] 5.4 在 `backend/src/routers/codelists.py` 中同 5.1 处理
- [x] 5.5 在 `backend/src/routers/units.py` 中同 5.1 处理
- [x] 5.6 在 `backend/src/routers/export.py` 含 `project_id` 的端点中添加归属链校验
- [x] 5.7 在 `backend/src/routers/import_template.py` 含 `project_id` 的端点中添加归属链校验
- [x] 5.8 在 `backend/src/routers/import_docx.py` 含 `project_id` 的端点中添加归属链校验

## Phase 6: 前端集成

- [x] 6.1 创建 `frontend/src/components/LoginView.vue`：用户名/密码表单，`POST /api/auth/login`（`application/x-www-form-urlencoded`），成功后 `localStorage.setItem('crf_token', token)` 并 `emit('login-success')`，失败显示 ElMessage.error
- [x] 6.2 在 `frontend/src/composables/useApi.js` 中添加 `_getAuthHeaders()` 函数（从 localStorage 读取 token，返回 `{Authorization: 'Bearer ...'}` 或空对象），并为所有 `fetch` 调用注入该 headers
- [x] 6.3 在 `frontend/src/composables/useApi.js` 中添加 `_handle401()` 函数（清除 token + 触发 `crf:auth-expired` 事件），在所有 fetch 响应处理前检查 `status === 401`
- [x] 6.4 在 `frontend/src/App.vue` 中添加 `isLoggedIn` 响应式状态（初值为 `!!localStorage.getItem('crf_token')`），监听 `crf:auth-expired` 事件，未登录时渲染 `<LoginView @login-success="onLoginSuccess" />`，登录成功后渲染原有主界面

## Phase 7: 测试

- [x] 7.1 在 `backend/tests/` 中创建 `test_auth.py`：注册成功、用户名重复注册报 400、登录成功、密码错误报 401、无 token 访问 `GET /api/projects` 报 401
- [x] 7.2 在 `backend/tests/` 中创建 `test_isolation.py`：用户 A 创建项目后，用户 B 的 token 访问该项目 `GET/PUT/DELETE` 返回 403；`GET /api/projects` 只返回当前用户的项目
- [x] 7.3 在 `backend/tests/` 中创建 `test_subresource_isolation.py`：用户 A 项目下的 visit/form/field，用户 B token 访问返回 403
- [x] 7.4 在 `backend/tests/` 中创建 `test_wal.py`：两个线程/Session 并发创建项目，数据互不干扰，无 `SQLITE_BUSY` 异常抛出
