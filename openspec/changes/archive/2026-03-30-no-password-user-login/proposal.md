# 提案：无密码用户名登录（保留数据隔离）

## 变更摘要

将现有"用户名 + 密码"登录改为"仅输入用户名即可进入"，同时保留按用户隔离数据的全部逻辑不变。

## 背景

- 当前系统已实现完整的 JWT + bcrypt 密码认证体系（user.py、auth.py、auth_service.py、dependencies.py）
- 数据隔离已通过 `Project.owner_id` + `verify_project_owner` 实现，所有 8 个路由已接入
- 用户需求：消除登录摩擦（不输密码），但保持多用户数据互不可见

## 用户确认决策

- **识别方式**：只输入用户名，无需密码
- **用户切换**：不需要，进入后固定在自己的数据

## 约束集

### 硬约束

| 约束 | 原因 |
|------|------|
| `get_current_user` 函数签名不变 | 8 个路由文件 + 子资源路由均依赖此依赖项 |
| `verify_project_owner` 逻辑不变 | 数据隔离的核心执行点 |
| `Project.owner_id` 外键不变 | 隔离数据的存储基础 |
| JWT Bearer token 机制保留 | `useApi.js` 所有请求均携带 Authorization 头 |
| `username` 唯一约束保留 | upsert-by-username 依赖此约束 |
| `user.hashed_password` 需迁移为 nullable | 现有 DB 列为 NOT NULL，新用户无密码 |

### 软约束

| 约束 | 原因 |
|------|------|
| 变更文件最小化 | 减少回归风险，现有隔离逻辑已稳定 |
| 不引入新 Python 依赖 | passlib/bcrypt 逻辑可删除（非新增） |
| 保持测试覆盖 | helpers.py 辅助函数同步更新，隔离测试继续有效 |

## 方案设计

### 核心逻辑：Upsert-by-username

```
POST /api/auth/enter  { username: "alice" }
  → 查找 username == "alice" 的用户
  → 不存在则创建（hashed_password = NULL）
  → 签发 JWT token
  → 返回 { access_token, token_type: "bearer" }
```

### 影响文件

| 文件 | 变更类型 | 变更内容 |
|------|----------|----------|
| `backend/src/models/user.py` | 修改 | `hashed_password` → `nullable=True` |
| `backend/src/services/auth_service.py` | 修改 | 删除 `hash_password`/`verify_password`，保留 JWT 函数 |
| `backend/src/routers/auth.py` | 重写 | 单一 `/enter` 端点，upsert 用户 |
| `backend/src/database.py` | 修改 | 轻量迁移：ALTER 列为可空 |
| `frontend/src/components/LoginView.vue` | 修改 | 删除密码字段，改为用户名 + 进入按钮 |
| `backend/tests/helpers.py` | 修改 | `register_and_login` → `login_as(username)` |
| `backend/tests/test_auth.py` | 修改 | 同步更新 |
| `backend/main.py` | 修改（可能） | 删除 `auth.secret_key` 启动校验（仍需要用于 JWT） |

### 不变文件

- `backend/src/dependencies.py` — `get_current_user` 逻辑不变
- `backend/src/routers/projects.py` 及其余 7 个路由 — 全不改
- `backend/src/models/project.py` — `owner_id` 不变
- `backend/src/repositories/project_repository.py` — 不变
- `frontend/src/composables/useApi.js` — 不变
- `frontend/src/App.vue` — 不变（仍监听 `crf:auth-expired`）
- `backend/tests/test_isolation.py` — 隔离测试不变（helpers 更新后继续有效）

## 可验证的成功判据

1. 访问应用时显示"输入用户名"界面（无密码框）
2. 输入 `alice` → 进入，数据为 alice 的项目列表
3. 新开标签输入 `bob` → 进入，看不到 alice 的项目（隔离有效）
4. 再次用 `alice` 登录 → 仍能看到之前 alice 创建的项目（数据持久）
5. `test_isolation.py` 全部通过

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 旧数据库有 NOT NULL hashed_password 记录 | 轻量迁移先将列改为 nullable，再处理存量数据 |
| 存量用户有密码哈希 | 不影响，hashed_password 变为 nullable 后旧数据仍有效（只是不再校验） |
| config.yaml 校验 `auth.secret_key` | 保留校验，JWT 签名仍需 secret_key |
