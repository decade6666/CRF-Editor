# Proposal: 公网部署安全加固

## Enhanced Requirement

在**不重构整套认证系统**、**不切换 Cookie 会话制**、**不引入多实例基础设施**的前提下，对 CRF-Editor 的公网部署路径做一轮"最小但足够"的安全加固，优先消除可直接导致**文件泄露、管理员接管、存储型 XSS、长期 token 滥用、敏感配置暴露**的 Critical / High 风险，并补齐最小回归测试与部署文档。

### 目标
- 阻断 `/assets/{filepath}` 任意绝对路径读取与目录穿越。
- 管理员权限从"用户名比较"迁移为显式 `user.is_admin`，阻断管理员用户名抢注。
- 禁止 SVG 作为项目 Logo 上传，阻断存储型 XSS 载体。
- 将生产密钥从仓库内 `config.yaml` 明文迁移到环境变量，生产环境缺失密钥时启动失败。
- 在生产模式关闭 `/docs`、`/redoc`、`/openapi.json`，并下发基础安全响应头。
- 将 JWT 默认过期时间从当前的超长值收缩到 60 分钟以内，同时保持前端当前登录形态不变。
- 为登录与高消耗导入接口增加基础限流。
- 收紧 `template_path` 配置，禁止任意系统路径。
- 保持前端 `/api/auth/me -> { username, is_admin }` 响应契约不变，避免 UI 破坏性变更。

### 技术约束
- 后端为 **FastAPI + SQLAlchemy + SQLite**，数据结构演进必须沿用 `backend/src/database.py` 内现有**轻量迁移链**。
- 前端为 **Vue 3 + Element Plus + fetch 封装**，token 当前存于 `localStorage`，本轮不迁移到 HttpOnly Cookie。
- 项目仍需兼容近期恢复的 **Python 3.8** 基线（见近期兼容性修复提交）。
- 配置源为项目根目录 `config.yaml` + `backend/src/config.py`；需新增 `CRF_*` 环境变量覆盖，但保持开发环境默认启动体验。
- 桌面打包入口 `backend/app_launcher.py` 通过 `CRF_STATIC_DIR` 注入静态资源目录，`/assets` 修复不能破坏该路径注入机制。
- 现有工具函数与接口错误响应约定应尽量保持：如 `is_safe_path()` 返回 `(bool, str)`、后端错误 `detail` 为可直接展示的中文字符串。

### 范围边界

**纳入范围**
- `backend/main.py`
- `backend/src/utils.py`
- `backend/src/routers/auth.py`
- `backend/src/dependencies.py`
- `backend/src/routers/admin.py`
- `backend/src/models/user.py`
- `backend/src/database.py`
- `backend/src/config.py`
- `backend/src/routers/projects.py`
- `backend/src/routers/settings.py`
- `backend/src/services/user_admin_service.py`
- `backend/src/routers/import_*` / 相关导入路由（用于限流）
- `backend/requirements.txt`
- `backend/tests/*`
- `frontend/src/composables/useApi.js`
- `frontend/src/components/LoginView.vue`
- `frontend/src/components/ProjectInfoTab.vue`
- `frontend/src/App.vue`（仅回归验证 / 可能极小文案适配）
- `README.md`、`README.en.md`、模块级 `CLAUDE.md`（如部署/配置说明发生变化）
- 新增 `.env.example`

**不纳入范围**
- Cookie + CSRF 迁移
- 审计日志体系
- 数据库加密 / 业务数据脱敏
- Redis / 多实例共享限流存储
- CORS 分域部署
- HTTPS 反代 / HSTS 基础设施落地
- 合规与审计制度建设

### 验收标准
- `/assets//etc/passwd`、`/assets/../../config.yaml`、编码后 `..` 变体不可读取文件内容。
- 首次使用管理员用户名登录不会自动创建普通用户并获得管理员能力。
- 已初始化管理员仍可正常登录并访问 `/api/admin/*`。
- 上传 SVG Logo 返回 400；PNG/JPG/WEBP 等位图仍正常。
- `CRF_ENV=production` 且未提供 `CRF_AUTH_SECRET_KEY` 时，应用启动失败。
- `CRF_ENV=production` 时访问 `/docs`、`/redoc`、`/openapi.json` 返回 404。
- 关键响应包含 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`、CSP。
- 默认 JWT TTL 不超过 60 分钟；前端 token 过期后仍能自动退出登录。
- 高频请求 `/api/auth/enter` 与导入接口可命中 429。
- `template_path` 不再允许白名单外绝对路径，且必须为 `.db`。
- 后端新增/更新测试覆盖上述行为，前端回归保持通过。

## Research Summary for Planning

### User Confirmations
- **管理员自愈策略**：若现存 DB 中已存在 `config.admin.username` 对应用户，则启动时**直接将其升级为 `is_admin=True`**。
- **`template_path` 白名单**：限定为 `db_path` 父目录 + `upload_path`。
- **测试改造策略**：升级 `backend/tests/helpers.py:login_as()`，当登录管理员用户名时先自动种子 `is_admin=True` 用户，再请求 `/api/auth/enter`。
- **密钥清理策略**：修复当前仓库内明文 secret，并同步提供 `.env.example` 与部署说明。

### Existing Structures
- `backend/src/routers/auth.py:31-41`：`/api/auth/enter` 为**无密码登录**，若用户名不存在则直接创建用户。
- `backend/src/dependencies.py:32-39`：`require_admin()` 当前通过 `current_user.username == config.admin.username` 判定管理员。
- `backend/src/routers/admin.py:35-42`：`/api/auth/me` 返回 `{ username, is_admin }`，`is_admin` 当前同样源于用户名比较；前端已依赖该响应形态。
- `backend/src/models/user.py:18-23`：`user` 表当前仅有 `id / username / hashed_password / created_at`，尚无 `is_admin` 字段。
- `backend/src/database.py:763-789`：启动链为 `Base.metadata.create_all()` 后串联多个 `_migrate_*()`，已有新增列与重建表两类迁移范式。
- `backend/src/utils.py:60-94`：`is_safe_path(path, allowed_dirs)` 返回 `(bool, str)`，当前未显式拒绝绝对路径；当 `allowed_dirs` 为空时几乎对任意可解析路径放行。
- `backend/main.py:142-172`：`/assets/{filepath:path}` 当前直接对用户传入的 `filepath` 调 `is_safe_path(filepath)`，未绑定 `_assets_dir` 白名单。
- `backend/src/utils.py:115-176` + `backend/src/routers/projects.py:341-350`：Logo 上传当前允许 `image/svg+xml`，魔数检测也接受 `<svg` / `<?xml`。
- `backend/src/routers/settings.py:124-182`：`template_path` 保存前只调用 `is_safe_path(payload.template_path)`，未提供 `allowed_dirs`，也未限制 `.db` 后缀。
- `backend/src/config.py:80-102`：配置模型由 `AppConfig` 聚合；`db_path` / `upload_path` 通过属性基于 `config.yaml` 所在目录解析。
- `backend/main.py:67-75`：启动时只要 `config.auth.secret_key` 为空就直接失败，尚未区分开发/生产环境。
- `config.yaml:19-23`：当前仓库配置存在 `admin.username: admin666`、明文 `auth.secret_key`、`access_token_expire_minutes: 8640`。
- `frontend/src/composables/useApi.js:25-49`：前端 token 存于 `localStorage.crf_token`；401 会清 token 并广播 `crf:auth-expired`。
- `frontend/src/components/LoginView.vue:17-30`：登录页直接请求 `/api/auth/enter`，失败时读取 `err.detail` 显示；可承接 403/429 明确提示。
- `frontend/src/components/ProjectInfoTab.vue:52-60`：Logo 上传后端报错目前未做精细错误解析；文件 input 需与后端格式限制同步。
- `backend/tests/helpers.py` + `backend/tests/test_auth.py` + `backend/tests/test_permission_guards.py` + `backend/tests/test_user_admin.py`：现有大量测试默认 `login_as(client, "admin")` / 管理员用户名可直接登录，管理员语义迁移后会集中受影响。

### Hard Constraints
- **前端响应契约不可破坏**：`/api/auth/me` 必须继续返回 `{ username, is_admin }`，否则 `frontend/src/App.vue` 管理员 UI gating 会失效。
- **数据库迁移必须可就地升级旧库**：`user.is_admin` 需要兼容已有 SQLite 用户库；新增布尔列优先走 `ALTER TABLE ADD COLUMN ... DEFAULT 0 NOT NULL`。
- **`login_as()` 测试辅助必须跟随管理员语义迁移**：否则大量现有测试会因为管理员用户名不能自动创建而统一失败。
- **`is_safe_path()` 的返回协议应保持 `(bool, str)`**，避免影响调用方错误处理与中文提示。
- **`/assets` 修复不能破坏桌面打包场景**：`backend/app_launcher.py` 注入的 `CRF_STATIC_DIR` 仍是静态根目录真相源。
- **生产环境必须不再依赖仓库中的 `config.yaml` secret**：当前明文 key 已构成真实暴露面，实施时必须轮换。
- **JWT 仍保留 Bearer + localStorage 形态**：本轮仅缩短 TTL，不引入 Cookie / CSRF 改造。
- **限流实现需兼容单机部署**：本次默认以内存存储为边界，不要求 Redis。

### Soft Constraints
- 优先采用**局部修补**而非大规模重构。
- 后端错误应继续输出可直接展示的中文 `detail`。
- 前端保留相对路径 `/api/*` 调用与现有 fetch 封装。
- 开发环境应尽量保持可启动、可调试，不把生产约束强行施加给本地开发。
- 文档更新需覆盖部署变量与安全注意事项，避免 README 与实际行为漂移。

### Dependencies
- `auth.py` / `dependencies.py` / `admin.py` / `models/user.py` / `database.py`：管理员语义迁移是同一变更链，必须一起规划。
- `settings.py` 与模板导入/预览相关代码：`template_path` 收紧会影响管理员设置保存与后续模板使用路径。
- `projects.py` / `utils.py` / `ProjectInfoTab.vue`：Logo 上传限制需同步后端验证与前端 UX。
- `config.py` / `main.py` / `README*` / `.env.example`：环境变量覆盖、生产启动校验、部署文档必须联动。
- `requirements.txt` / `main.py` / 导入相关 routers / 测试：限流依赖引入后会扩散到应用初始化、错误响应与测试隔离。
- `useApi.js` / `LoginView.vue` / `App.vue`：JWT TTL 缩短与 429/403 提示依赖现有错误处理链。

### Risks & Mitigations
- **风险：`is_safe_path()` 绝对路径语义与现有调用方式冲突。**
  - 现有计划草案中同时出现"拒绝绝对路径"与"把 `(_assets_dir / filepath).resolve()` 传回 `is_safe_path()`"两种不兼容写法。
  - **缓解**：规划阶段必须先统一该函数的输入语义（校验原始用户输入 vs 校验候选解析结果），避免出现修复后所有绝对候选路径都被误拒。
- **风险：管理员自愈策略可能把已占用的管理员用户名直接提升为管理员。**
  - 用户已确认采用"强制升级"策略；这适合可信旧库迁移，但对不可信历史数据有放大风险。
  - **缓解**：实施说明中需增加升级前 DB 检查与上线前审计步骤。
- **风险：当前 `config.yaml` 含 Windows 绝对 `template_path`，一旦用户通过设置页面重新保存，新的白名单检查将拒绝该路径。**
  - **缓解**：README / 设置页提示中需明确改为相对路径或迁移到允许目录。
- **风险：历史 SVG Logo 的读取策略尚未确定。**
  - **缓解**：在规划阶段明确是"仅禁止新上传"还是"读取时也拦截并要求重新上传"。
- **风险：限流会干扰现有测试与本地开发调试。**
  - **缓解**：为测试环境提供可控重置/放宽策略，或在 fixture 中隔离 limiter 状态。
- **风险：轮换 secret 后，现存 token 全部失效。**
  - **缓解**：文档中加入部署切换窗口说明；属于可接受安全代价。

### Open Questions Carried Forward
- **历史 SVG Logo 读取策略**：
  - 方案 A：仅禁止新上传，历史 SVG 继续可读。
  - 方案 B：读取时也拒绝，并提示重新上传位图。
- **限流在开发/测试环境的开关策略**：
  - 是否默认在 `development/test` 放宽或关闭 limiter，以减少本地误伤。
- **429 前端提示细节**：
  - 是否需要统一使用专门提示文案，如"操作过于频繁，请稍后重试"，以及是否暴露 `Retry-After`。

### Success Criteria
- `GET /assets//etc/passwd`、`GET /assets/../../config.yaml` 无法返回敏感文件内容。
- 首次 `POST /api/auth/enter` 使用 `admin666`（当前配置值）不会获得管理员身份；系统初始化/自愈后该账号可正常登录并访问 `GET /api/admin/users`。
- `POST /api/projects/{id}/logo` 上传 SVG 返回 400；PNG/JPG/WEBP 正常。
- `CRF_ENV=production` 且缺失 `CRF_AUTH_SECRET_KEY` 时，`backend/main.py` 启动失败。
- `CRF_ENV=production` 时 `GET /docs` / `GET /redoc` / `GET /openapi.json` 返回 404。
- 普通 API 响应具备 `nosniff`、`DENY`、`no-referrer`、CSP 等安全头。
- 新签发 JWT 的 `exp` 约束在 ≤ 60 分钟；401 后前端仍能回到登录态。
- 高频请求 `/api/auth/enter` / 导入接口可稳定返回 429 JSON。
- `PUT /api/settings` 对 `/etc/passwd`、`C:\\Windows\\win.ini`、白名单外路径返回 400；白名单内 `.db` 路径允许保存。
- 后端 pytest 与前端回归测试在新语义下可通过。
