# Design Notes: 账号密码登录与管理员独立用户管理界面

## Scope of This Change
- 将现有无密码用户名进入流程收敛为账号密码登录。
- 复用 `username` 作为账号标识。
- 为管理员提供独立主工作台，默认进入现有用户管理能力集合。
- 保持现有 `is_admin` 与 `user.id -> project.owner_id` 语义不变。

## Constraints That Shape Design
- 不得通过重建用户完成迁移，否则会破坏项目 owner 关联。
- 管理员初始密码必须来自外部输入，而非代码硬编码。
- 旧用户存在大量 `hashed_password = NULL`，因此需要显式迁移路径与管理员密码管理能力。
- 前端当前无 `vue-router`，管理员与普通用户的布局分流必须适应现有 `App.vue` 壳层。

## Finalized Decisions
- canonical 登录接口固定为 `POST /api/auth/login`；旧 `/api/auth/enter` 不再保留无密码语义，如保留仅允许短期兼容到同一账号密码逻辑。
- 用户名规范化固定为“仅 `trim()` 首尾空白，大小写敏感”，并统一用于登录、创建、改名、限流与保留管理员匹配。
- production 中只要不存在“可用保留管理员”，系统就必须用外部 bootstrap 密码自动创建或修复保留管理员；若 bootstrap 密码缺失或为空，则启动直接失败。
- `admin.bootstrap_password` 在 production 中仅作为“缺少可用保留管理员”时的创建/修复种子；若已存在可用保留管理员，则忽略配置变化，不主动覆盖当前密码。
- “可用保留管理员”定义为：`TRIM(username) == admin.username`、`is_admin = true`、存在可被统一密码服务识别并校验的密码哈希。
- 若历史库中存在多个 `TRIM(username) == admin.username` 的账号，固定保留最早记录作为主修复对象，不自动合并其余记录。
- 管理员新增用户必须同时设置初始密码，不再允许再次创建 `hashed_password = NULL` 的新用户。
- 旧用户未设密码时，development 返回带迁移提示的 401；production 统一返回通用 401，避免泄露账号存在性。
- 密码输入按原样保留：不做 `trim`、不做大小写折叠、也不做 Unicode 规范化；只校验最小长度与非空字符串。
- 密码设置、密码重置和保留管理员 bootstrap 修复都必须立刻使旧 JWT 失效；升级前旧版 JWT 在本次上线后立即失效，用户需重新登录。
- 管理员密码重置接口成功响应固定为 `204 No Content`，不返回响应体。
- 管理员用户列表必须返回密码状态，前端显式展示“已设密码/未设密码”，便于批量迁移旧账号。

## Backend Design

### 1. Authentication Contract
- 新增 `POST /api/auth/login`，请求体固定为：
  - `username: str`
  - `password: str`
- 响应保持：
  - `access_token: str`
  - `token_type: "bearer"`
- `/api/auth/me` 继续返回：
  - `username: str`
  - `is_admin: bool`
- `OAuth2PasswordBearer.tokenUrl`、OpenAPI 元数据、README 与前端请求路径统一改为 `/api/auth/login`。

### 2. Password State Model
- `hashed_password = NULL` 保留为“历史账号未初始化密码”的迁移状态，仅允许存在于旧用户。
- 新增 `auth_version`（或等价稳定整数版本字段）到 `user` 表：
  - 默认 `0`
  - 登录签发 JWT 时写入 `ver`
  - 鉴权时比对数据库当前版本
  - 密码设置、密码重置、bootstrap 修复时递增版本
- 新版 JWT payload 最少包含：
  - `sub: user_id`
  - `username: username`
  - `ver: auth_version`
  - `exp: expire`
- 不包含 `ver` 的旧 JWT 一律视为无效。

### 3. Password Hashing
- 引入专门的密码哈希/校验依赖，并封装到 `backend/src/services/auth_service.py` 或独立密码服务内。
- 统一提供：
  - `hash_password(password: str) -> str`
  - `verify_password(password: str, hashed: str) -> bool`
  - `validate_password_policy(password: str) -> None`
- 最小密码策略：至少校验最小长度；本次不引入复杂度规则、验证码、账户锁定。

### 4. Reserved Admin Bootstrap / Repair
- 配置层新增管理员 bootstrap 密码来源，支持环境变量覆盖。
- `init_db()` 中保留管理员自愈逻辑改为：
  1. 标记 `TRIM(username) == admin.username` 的记录为 `is_admin = true`
  2. 检查是否存在“可用保留管理员”
  3. 若 production 下不存在，则使用外部 bootstrap 密码执行“原位修复或创建”
  4. 若 bootstrap 密码缺失/为空，则直接抛错终止启动
- 修复优先级：
  1. 优先修复已存在且 `TRIM(username)` 命中保留管理员的最早记录
  2. 若不存在命中记录，则创建新保留管理员
  3. 不改动普通用户 `id`，不改动项目 `owner_id`

### 5. Admin User Management Contract
- `GET /api/admin/users` 响应新增密码状态字段：
  - 推荐 `has_password: bool`
- `POST /api/admin/users` 请求新增 `password`，创建即设密码。
- 新增管理员密码重置接口：
  - `PUT /api/admin/users/{user_id}/password`
  - 请求体：`password: str`
- 保留管理员账号：
  - 不允许手动创建同名账号
  - 不允许删除
  - 不允许改名
  - 允许通过密码重置接口重置密码

### 6. Error Semantics
- 登录失败统一返回 401，不返回 token。
- 用户存在但未设密码时：
  - development：`401` + 明确迁移提示（可带 machine-readable code）
  - production：`401` + 通用“未授权/用户名或密码错误”
- production 超限继续返回 `429` 与 `Retry-After`。

## Frontend Design

### 1. LoginView.vue
- 从单用户名表单改为账号 + 密码表单。
- 登录请求改为 `POST /api/auth/login`。
- 保留上次用户名记忆。
- development 下显示后端返回的迁移提示；production 下显示通用登录失败文案。

### 2. App.vue Shell Split
- 登录成功后先调用 `/api/auth/me`，再决定主工作台。
- `admin` 登录后默认进入单一 `AdminView` 工作台，不渲染普通用户项目壳层。
- 普通用户仍进入现有 CRF 工作台。
- 避免先加载普通项目列表再切管理员视图的闪动；管理员路径不调用普通项目加载链路。

### 3. AdminView.vue
- 保留现有用户管理、批量迁移/复制/删除项目、回收站能力。
- 新增用户创建时的密码输入。
- 新增密码重置入口。
- 用户列表展示密码状态列，便于识别旧账号迁移进度。

## Test Strategy

### Backend
- 认证测试：登录成功、错误密码、未设密码、旧 token 失效、限流、bootstrap 修复。
- 管理员测试：创建用户必须带密码、重置密码、`has_password` 状态、保留管理员保护、生产启动失败语义。
- 迁移测试：
  - 非空库无可用 admin -> 自动补建/修复
  - bootstrap 密码缺失 -> fail fast
  - whitespace admin 历史数据 -> 原位修复
  - 普通用户 `owner_id` 不变

### Frontend
- 登录组件结构测试：账号/密码字段、请求路径、错误文案。
- App 壳层测试：admin 默认只挂载 `AdminView`，不显示普通工作台入口。
- AdminView 结构测试：新增密码状态列、创建/重置密码入口仍走 `/api/admin`。

## Documentation Impact
- 更新 `README.md`、`README.en.md`：登录方式、管理员初始密码要求、旧账号迁移说明。
- 更新 `backend/.claude/CLAUDE.md` 与 `frontend/.claude/CLAUDE.md` 中认证入口与管理员主工作台描述。
