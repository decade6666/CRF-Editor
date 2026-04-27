# 规格说明：无密码用户名登录

## 功能规格

### FR-1 用户进入端点

- `POST /api/auth/enter`，请求体：`{ "username": "<string>" }`（JSON，非 form-data）
- 用户名经 `.strip()` 去除首尾空白后不得为空，否则返回 `422 Unprocessable Entity`
- 若用户名对应用户不存在，自动创建（hashed_password = NULL）
- 若用户名对应用户已存在，直接签发 token（幂等）
- 成功响应：`200 OK`，`{ "access_token": "<jwt>", "token_type": "bearer" }`

### FR-2 移除密码相关端点

- 删除 `POST /api/auth/register`
- 删除 `POST /api/auth/login`（OAuth2 form）

### FR-3 数据隔离不变

- `Project.owner_id` 外键约束保留
- `verify_project_owner` 逻辑不变
- `get_current_user` 依赖注入签名不变（8 个路由继续使用）

### FR-4 JWT 机制保留

- Bearer token 签发/验证逻辑不变（PyJWT）
- `useApi.js` 中所有 API 请求继续携带 `Authorization: Bearer <token>`
- Token 过期后前端收到 `401`，触发 `crf:auth-expired` 事件，跳回登录界面

### FR-5 前端登录界面

- 删除密码输入框
- 保留用户名输入框（`el-input`，placeholder: "请输入用户名"）
- 按钮文本：`进入`（原 `登录`）
- 请求格式：JSON POST 到 `/api/auth/enter`
- 错误场景：空用户名（前端校验）、网络错误（提示"连接失败，请重试"）；删除"密码错误"场景

---

## 非功能规格

### NFR-1 安全

- 移除 `_bootstrap_admin_user`：无密码模式下任意用户可冒用 "admin"，此函数必须删除
- 替换为 `_warn_orphan_projects`：启动时记录 `owner_id IS NULL` 的历史孤立项目数量（WARNING 级日志）
- `config.yaml` 中的 `auth.secret_key` 保留（JWT 签名仍需要）

### NFR-2 依赖精简

- 删除 `passlib[bcrypt]` 和 `bcrypt<4.0.0`
- 保留 `python-multipart`（文件上传依赖）
- 保留 `PyJWT>=2.8.0`

### NFR-3 数据库兼容

- SQLite 不支持 `ALTER COLUMN`，需重建 `user` 表以将 `hashed_password` 改为可空
- 迁移函数幂等：已是 nullable 则跳过
- 存量用户数据（hashed_password 有值）不受影响，仅列约束变更

### NFR-4 测试覆盖

- `test_auth.py`：覆盖 `/enter` 端点全部语义（创建用户、幂等返回 token、空用户名 422、无 token 401）
- `test_isolation.py`：测试逻辑不变，仅 helper 调用签名更新
- `test_subresource_isolation.py`：不改动

---

## 约束汇总

| 约束 | 类型 | 原因 |
|------|------|------|
| `get_current_user` 签名不变 | 硬 | 8 个路由文件依赖此注入 |
| `verify_project_owner` 不变 | 硬 | 数据隔离核心执行点 |
| `Project.owner_id` 不变 | 硬 | 隔离数据的存储基础 |
| JWT Bearer token 保留 | 硬 | useApi.js 所有请求携带此头 |
| `username` 唯一约束保留 | 硬 | upsert-by-username 依赖此约束 |
| `dependencies.py` 不改 | 硬 | tokenUrl 仅影响 Swagger 文档，功能正常 |
| `useApi.js` / `App.vue` 不改 | 硬 | 认证状态管理无需变动 |
| 8 个业务路由不改 | 硬 | 与认证入口完全解耦 |
| `python-multipart` 保留 | 硬 | 文件上传仍需要 |
