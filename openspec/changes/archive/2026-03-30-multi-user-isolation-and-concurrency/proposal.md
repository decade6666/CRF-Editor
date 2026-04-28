# Proposal: 多用户隔离与并发安全

**Change ID**: multi-user-isolation-and-concurrency
**Version**: 1.0.0
**Status**: Research Complete → Ready for Plan
**Date**: 2026-03-30
**Author**: CCG spec-research

---

## 1. 一句话总结

为 CRF-Editor 添加基于 JWT 的用户认证体系，实现**完全数据隔离**（每用户只访问自己的项目），并通过 SQLite WAL 模式优化支持多用户并发读写。

---

## 2. 背景

当前 CRF-Editor 是无认证单用户应用：所有 API 端点完全开放，所有项目数据全局共享。引入多用户场景后，需要：

| 当前状态 | 目标状态 |
|---------|---------|
| 无认证，所有 API 可任意访问 | JWT Bearer Token 认证 |
| 所有用户共享同一份数据 | 每用户只见自己创建的项目 |
| SQLite 默认 journal 模式 | WAL 模式 + 连接池优化 |
| 无用户模型 | `User` 表（username + hashed_password） |
| Project 无所有者字段 | `project.owner_id` → FK to `user.id` |

---

## 3. 约束集

### 3.1 Hard Constraints（不可违反）

| # | 约束 | 来源 |
|---|------|------|
| H1 | 不得迁移到 PostgreSQL，保持 SQLite | 用户确认 |
| H2 | 认证方式为 JWT，无 server-side session | 用户确认 |
| H3 | 数据隔离模型：完全隔离，无跨用户数据共享 | 用户确认 |
| H4 | 所有写操作路由必须注入 `current_user` 依赖 | 代码审查 |
| H5 | `project.owner_id` 迁移时，旧数据回填到默认 admin 账号 | 迁移安全 |
| H6 | JWT 密钥必须存储在 `config.yaml` 的 `auth.secret_key` 字段，不可硬编码 | 安全规范 |
| H7 | 非 owner 访问 `PUT/DELETE /api/projects/{id}` 必须返回 403 | 隔离要求 |
| H8 | `GET /api/projects` 只返回当前用户的项目 | 隔离要求 |

### 3.2 Soft Constraints（约定/偏好）

| # | 约束 | 来源 |
|---|------|------|
| S1 | 新 `User` 模型遵循现有 SQLAlchemy `Mapped` 风格 | 代码约定 |
| S2 | 认证路由挂载在 `/api/auth/` 前缀下 | REST 约定 |
| S3 | 错误响应遵循 `{"detail": "..."}` 格式，401/403 同理 | 现有 exception handler |
| S4 | 密码哈希使用 `passlib[bcrypt]` | Python 标准实践 |
| S5 | 前端 token 存储在 `localStorage["crf_token"]` | SPA 惯例 |
| S6 | 前端 `useApi.js` 统一注入 `Authorization: Bearer` 头 | 现有 API 封装约定 |
| S7 | 登录页作为独立 Vue 组件，应用壳层（`App.vue`）控制显示 | 现有组件结构 |

---

## 4. 依赖关系

```
User 模型
  └─► project.owner_id FK 迁移
       └─► ProjectRepository 增加 owner 过滤
            └─► 所有 10 个 router 注入 current_user Depends
                 └─► 前端 useApi.js 附加 Bearer 头
                      └─► 前端 App.vue 登录态守卫
```

**跨模块影响文件清单**：
- 新增：`backend/src/models/user.py`
- 新增：`backend/src/routers/auth.py`
- 新增：`backend/src/services/auth_service.py`（JWT 签发/验证）
- 修改：`backend/src/models/project.py`（+owner_id）
- 修改：`backend/src/database.py`（WAL pragma + 迁移函数）
- 修改：`backend/src/config.py`（+AuthConfig）
- 修改：`backend/src/repositories/project_repository.py`（+owner_id 过滤）
- 修改：`backend/src/routers/projects.py`（+Depends(get_current_user)）
- 修改（可选）：其余 9 个 router（visits/forms/fields/codelists/units/export/import_*）只读接口可按需保护
- 新增：`frontend/src/components/LoginView.vue`
- 修改：`frontend/src/composables/useApi.js`（+Bearer 头 + 401 拦截）
- 修改：`frontend/src/App.vue`（+登录态守卫）

---

## 5. 风险与缓解

| 风险 | 概率 | 缓解措施 |
|------|------|---------|
| 旧数据无 owner_id，迁移后变孤儿 | 高 | 迁移时自动创建 `admin` 账号并回填所有现有项目 |
| SQLite 并发写入竞争（多用户同时操作） | 中 | 启用 WAL pragma，已有 session begin 事务包裹 |
| JWT 密钥泄露 | 低 | config.yaml 不提交 git（检查 .gitignore），支持运行时轮换 |
| 前端 token 过期导致空白页 | 中 | 前端 `useApi.js` 拦截 401 → 清除 token → 跳转登录页 |
| 访视/表单等子资源未加 owner 过滤 | 中 | 通过 `project_id` 归属链条间接隔离，子资源查询前先验证 project 所有权 |

---

## 6. 方案选项

### Option A：仅 Project 层隔离（推荐）

通过 `project.owner_id` 实现顶层隔离，子资源（visit/form/field 等）
通过 `project_id` 的归属链条自然隔离。**不需要给每个子资源表加 owner 字段**。

优点：改动最小，符合 YAGNI；现有 cascade delete 逻辑不受影响。
缺点：如未来需要按子资源授权，需重构。

### Option B：所有资源表加 owner_id

每张表都加 `owner_id`，直接过滤。

优点：未来灵活性高。
缺点：改动量大（10+ 表），当前场景过度设计。

**采用 Option A**（用户确认隔离模型为完全隔离，且无团队共享需求）。

---

## 7. 成功判据（可验证）

- [ ] `POST /api/auth/register` 注册用户，返回 `{"access_token": "...", "token_type": "bearer"}`
- [ ] `POST /api/auth/login` 登录，返回同格式 token
- [ ] 未携带 token 访问 `GET /api/projects` → 返回 `401 {"detail": "未授权"}`
- [ ] 用户 A 创建的项目，用户 B 的 token 无法访问（403 或 404）
- [ ] `GET /api/projects` 只返回当前 token 用户的项目
- [ ] 两用户并发创建项目，数据互不干扰（integration test）
- [ ] 前端未登录时显示登录页，登录成功后恢复原界面
- [ ] 前端 token 过期（401）后自动跳转登录页

---

## 8. 范围边界

**本次包含**：
- 用户注册/登录 API
- JWT 签发与验证
- Project 层数据隔离（owner_id）
- SQLite WAL 模式启用
- 前端登录页 + token 管理

**本次不包含**：
- 用户角色/权限（RBAC）
- 团队/协作功能
- 用户管理界面（admin panel）
- 密码重置/找回
- OAuth/第三方登录
- 实时协作（WebSocket）
