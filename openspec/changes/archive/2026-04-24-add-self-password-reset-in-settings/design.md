# Design Notes: 设置中的普通用户自助修改密码

## Scope of This Change

- 在现有设置弹窗中，为普通用户增加自助修改自己密码的入口。
- 在认证域新增自助改密接口，校验当前密码并复用现有密码策略。
- 修改成功后立即使旧 JWT 失效，并要求用户重新登录。
- 保持管理员为他人重置密码流程不变。

## Constraints That Shape Design

- 入口必须放在 `frontend/src/App.vue` 设置弹窗“当前用户”这一行，且位于用户名右侧。
- 入口仅普通用户显示；管理员设置弹窗中不显示，且后端也必须拒绝管理员调用。
- 前端现有 `frontend/src/composables/useApi.js` 会把所有 `401` 视为登录过期并清理 token，因此“当前密码错误”不能返回 `401`。
- 密码策略、哈希与 JWT 失效机制必须复用既有实现，不新增并行逻辑。
- production 下必须复用现有登录限流契约，不新增独立限流规则集。
- 当前后端写操作通过 `backend/src/database.py:get_session` 在事务中提交，设计必须保持单次请求原子更新。

## Finalized Decisions

- 自助改密接口固定为：`PUT /api/auth/me/password`
- 路由固定放在：`backend/src/routers/auth.py`
- 接口只接受：
  - `current_password: str`
  - `new_password: str`
- 前端 `确认新密码` 只作为 UI 校验字段，不进入后端请求体；后端请求模型应禁止额外字段被静默忽略。
- 成功响应固定为：`204 No Content`
- 成功后必须：
  - `hashed_password = hash_password(new_password)`
  - `auth_version += 1`
  - 由事务提交后返回 204
- 当前密码错误、当前凭据不可验证、新密码不满足策略、新密码与当前密码相同，统一返回 `400`
- 认证失败（未登录、token 过期、旧 token、无效 token）仍返回 `401`
- 若管理员调用自助端点，固定返回 `403`
- production 下自助改密失败复用登录限流：沿用 `AUTH_LOGIN_RULE(limit=5, window_seconds=60)` 与 `Retry-After` 契约
- 密码输入保持原样：不 `trim`、不大小写折叠、也不做 Unicode 规范化
- 自助改密成功后全部旧 JWT 失效，不返回新 token，不保留当前会话
- 新密码与当前密码相同固定拒绝，返回 `400`，避免无意义地使全部会话失效
- 并发语义固定为：允许 last-write-wins，不为本次变更引入乐观锁或 `409` 语义
- 自助改密失败不记录密码明文，不在错误响应中暴露 hash、token 或内部异常细节

## Backend Design

### 1. API Contract

新增 `PUT /api/auth/me/password`：

请求体：
- `current_password: str`
- `new_password: str`

成功响应：
- `204 No Content`

失败响应：
- `401`：认证失败（缺 token、token 失效、旧 token、无效 token）
- `403`：管理员调用普通用户专用自助端点
- `400`：当前密码错误、当前凭据不可验证、新密码不符合策略、新密码与当前密码相同
- `429`：production 下命中复用后的登录限流，带 `Retry-After`

### 2. Authorization Rule

- 自助端点依赖 `get_current_user` 获取当前用户。
- 若 `current_user.is_admin == true`，直接返回 `403`。
- 不接受任意 `user_id`、`username` 作为目标用户标识，目标用户固定为当前认证用户。

### 3. Password Verification and Update

- 当前密码校验：`verify_password(current_password, current_user.hashed_password)`
- 新密码校验：复用 `validate_password_policy(new_password)` / `hash_password(new_password)`
- 当 `current_user.hashed_password` 为空、损坏、未知 scheme 时，`verify_password` 统一视为失败，返回 `400`
- 新密码与当前密码相同时返回 `400`
- 仅在全部校验通过后才执行：
  - 更新 `hashed_password`
  - 递增 `auth_version`
- 所有写操作在既有事务里完成，保证失败无副作用

### 4. Rate Limiting

- production 下自助改密复用现有登录限流契约。
- 复用方式固定为：在自助改密请求进入业务校验前调用与登录同级别的认证限流函数。
- 限流标识按当前请求输入的用户名不可用，因此应基于当前用户用户名与客户端 IP 复用同一 bucket 语义，保持 5 次/60 秒与 `Retry-After` 不变。
- 非 production 环境不启用该限流。

### 5. Session Invalidation

- 自助改密成功后通过 `auth_version += 1` 使全部旧 JWT 失效。
- 失效效果由 `backend/src/dependencies.py:get_current_user` 统一生效。
- 当前改密请求本身仍返回 `204`；之后使用旧 token 的任何受保护请求返回 `401`。

## Frontend Design

### 1. Settings Dialog Placement

- 在 `frontend/src/App.vue` 的设置弹窗中，修改“当前用户”行布局：
  - 左侧显示当前用户名
  - 右侧显示 `修改密码` 按钮
- 该按钮只在 `!isAdmin` 条件下渲染。
- 不把按钮放到底部按钮组，也不放到“导出所有项目/导入Word”区域。

### 2. Password Change Dialog

- 点击 `修改密码` 打开子弹窗。
- 子弹窗字段固定为：
  - 当前密码
  - 新密码
  - 确认新密码
- 提交前前端校验：
  - 三个字段均非空
  - 新密码与确认新密码一致
- 提交请求只发送：
  - `current_password`
  - `new_password`

### 3. Success and Failure UX

- 成功时：
  1. 显示成功提示
  2. 调用现有会话清理逻辑
  3. 关闭设置弹窗与子弹窗
  4. 回到登录态
- 当前密码错误、新密码策略错误、限流错误直接展示后端 `detail`
- 认证失效仍走现有 401 全局处理链路

## Test Strategy

### Backend

在 `backend/tests/test_auth.py` 增加：
- 普通用户正确当前密码 + 合法新密码返回 204
- 成功后旧 JWT 访问受保护接口返回 401
- 成功后旧密码登录失败、新密码登录成功
- 当前密码错误返回 400，`hashed_password` 与 `auth_version` 不变
- 新密码不满足策略返回 400，数据库状态不变
- 新密码与当前密码相同返回 400
- 管理员调用自助端点返回 403
- 密码前后空格按原样处理
- production 下自助改密失败复用登录限流并返回 429 + Retry-After

### Frontend

在 `frontend/tests/appSettingsShell.test.js` 增加：
- 普通用户设置弹窗在“当前用户”一行包含用户名右侧的“修改密码”按钮
- 管理员设置弹窗不显示该按钮
- 子弹窗包含三个密码字段
- 成功流程调用既有登出/清理会话逻辑
- 不把业务错误误判为全局 401 过期流程

## PBT Properties to Preserve

- 失败请求无副作用：任意失败原因都不修改 `hashed_password` 与 `auth_version`
- 成功请求失效全部旧 JWT：改密前所有 token 后续访问都返回 `401`
- 新旧密码登录可分离：成功后旧密码永远失败，新密码成功
- 密码原样语义不变：包含空格、Unicode 的密码只接受完全相同输入
- 管理员隔离：管理员永远不能通过普通用户自助端点修改自己的密码
- production 限流稳定：同一限流窗口内超过阈值时返回 `429` 与 `Retry-After`

## Documentation Impact

本次规划只要求生成 OpenSpec 产物，不要求同步修改 README 或模块级 CLAUDE 文档；这些更新应在实现阶段按实际改动决定是否同步。
