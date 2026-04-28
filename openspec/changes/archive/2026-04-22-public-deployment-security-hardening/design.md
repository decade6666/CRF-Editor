## Context

CRF-Editor 当前面向公网部署时存在多处高风险暴露面：`backend/main.py` 的 `/assets/{filepath}` 会对原始用户输入直接调用 `is_safe_path()`，未绑定 `_assets_dir` 白名单；管理员权限仍由 `backend/src/dependencies.py` 中的用户名比较驱动；Logo 上传仍接受 SVG；`config.yaml` 内保留明文 `auth.secret_key`；生产模式下文档端点始终暴露；JWT 生命周期可达数天；导入类接口缺少限流；`template_path` 在保存和使用时都缺少足够约束。

本次变更要求在不重构整套认证模型、不切换到 Cookie 会话、不引入 Redis/多实例基础设施的前提下，以最小改动完成一轮“最小但足够”的安全加固。项目还必须兼容 Python 3.8，并保持现有前端 `/api/auth/me -> { username, is_admin }` 契约、中文错误 `detail` 约定、`backend/src/database.py` 的轻量迁移模式，以及桌面入口 `backend/app_launcher.py` 的 `CRF_STATIC_DIR` 注入机制。

本设计同时纳入用户已确认的约束：
- 历史 SVG Logo 读取也必须拒绝，而不是仅禁新上传。
- 限流策略采用 production 强制、development 关闭、test 关闭；`/api/auth/enter` 采用“用户名 + IP”键，导入接口采用“用户 ID 优先、IP 兜底”键；429 返回 JSON `detail` 与 `Retry-After`。
- 管理员保留用户名采用 `strip()` 后的大小写敏感精确匹配。
- 用户坚持在 production 空库场景下“启动时自动创建管理员账号”。该决定与“阻断管理员接管”目标存在内在张力，必须作为已接受残余风险显式记录。

## Goals / Non-Goals

**Goals:**
- 将静态资源访问限制在 `_assets_dir` 内，阻断绝对路径、目录穿越、编码变体与 Windows 路径变体读取。
- 将管理员授权从“用户名字符串比较”迁移为显式 `user.is_admin`，并保持 `/api/auth/me` 响应契约不变。
- 禁止 SVG Logo 的新增与存量读取，避免存储型 XSS 载体继续暴露。
- 引入 `CRF_*` 环境变量覆盖层，要求 production 必须通过环境变量提供 `CRF_AUTH_SECRET_KEY`，且不得回退到 YAML secret。
- 在 production 关闭 `/docs`、`/redoc`、`/openapi.json`，并对普通响应与错误响应统一补充基础安全头。
- 将 JWT 默认过期时间收缩到不超过 60 分钟，并保持前端现有 localStorage + 401 自动退出行为。
- 为登录与高成本导入接口增加基础限流，并保证测试环境可完全关闭。
- 将 `template_path` 约束为 `config.yaml` 根目录解析后落在允许目录中的 `.db` 文件，并在保存与实际使用两层同时校验。
- 产出与上述行为一一对应的测试与部署文档。

**Non-Goals:**
- 不改造为密码登录、Cookie 会话或 CSRF 体系。
- 不引入 Redis、共享限流存储、多实例同步策略或复杂网关限流。
- 不建设完整审计日志、用户密码体系、合规模块或 HTTPS/HSTS 基础设施。
- 不重构整套 FastAPI 架构；仅允许为 env-sensitive 初始化引入小型工厂函数或等价最小封装。
- 不解决“公开管理员用户名 + 无密码登录”模型的根本安全问题；本轮仅在用户坚持的前提下将风险缩到用户接受的边界。

## Decisions

### 1. 通过 `user.is_admin` 完成管理员语义迁移，并保留保留用户名规则
- **选择**：在 `backend/src/models/user.py` 新增 `is_admin` 布尔列；在 `backend/src/database.py` 增加轻量迁移，为旧库执行 `ALTER TABLE user ADD COLUMN is_admin INTEGER DEFAULT 0 NOT NULL`；`require_admin()`、`/api/auth/me`、管理员用户管理接口统一只依赖 `user.is_admin`。
- **原因**：将授权依据落到数据库状态，才能阻断“抢注保留用户名即成为管理员”的直接接管路径。
- **额外约束**：
  - 保留管理员用户名继续存在，采用 `strip()` 后大小写敏感的精确匹配。
  - `/api/auth/enter` 不得再自动创建保留管理员用户名对应的普通用户。
  - `UserAdminService.create_user()` 与 `rename_user()` 都必须拒绝创建或改名到保留用户名。
  - 保留管理员用户名对应账号禁止在后台用户管理中被改名或删除。
  - 启动阶段对已存在的保留用户名用户执行幂等“自愈升级”为 `is_admin=True`。
  - 为满足用户要求，在 production 空库场景下，启动时自动创建保留管理员用户名的 `is_admin=True` 用户。
- **备选方案**：
  - 继续用用户名比较：无法满足安全目标，拒绝。
  - 移除保留用户名概念：需要同步改动更多配置语义，不符合“最小改动”。
  - 空库仅离线 seed：安全性更高，但用户已明确拒绝。

### 2. 采用“调用方约束原始输入 + `is_safe_path()` 校验解析后候选路径”的双层路径模型
- **选择**：不把 `is_safe_path()` 简化为“拒绝所有绝对路径”，而是保留它对候选 `Path.resolve()` 结果做“是否位于 allowed_dirs 内”的职责；`/assets`、`template_path` 等调用方负责先过滤原始输入中的绝对路径、点段、混合分隔符、Windows 盘符等非法形式。
- **原因**：`/assets` 修复需要对白名单内的绝对候选路径做包含关系校验，而 `template_path` 又需要兼容基于 `config.yaml` 的相对路径解析。若把两者混在一个函数里，会导致语义冲突和误拒。
- **落点**：
  - `/assets/{filepath}` 先对原始 `filepath` 做拒绝式校验，再将 `(_assets_dir / filepath).resolve()` 交给 `is_safe_path(candidate, allowed_dirs=[_assets_dir])`。
  - `settings.py` 保存模板路径前先按 `config.yaml` 所在目录解析，再做 allowed_dirs + `.db` 限制。
  - `ImportService` 使用模板时再重复同一套校验，防止旧配置或手工篡改绕过。
- **备选方案**：仅在调用点拼字符串前做前缀判断会被 `..`、符号链接、Windows 盘符绕过，拒绝。

### 3. SVG 采用“新增拒绝 + 历史读取拒绝 + 保存扩展名受内容检测控制”的闭环策略
- **选择**：Logo 上传仅允许位图白名单（PNG/JPEG/WEBP 等）；读取现存 `.svg` 或嗅探结果为 SVG/XML 的 Logo 时也直接拒绝；最终落盘扩展名由服务端检测结果决定，不再信任用户原始扩展名。
- **原因**：只禁新上传不能消除已有存量 SVG 的 XSS 风险；只看 MIME 或扩展名也会被伪装文件绕过。
- **落点**：
  - `frontend/src/components/ProjectInfoTab.vue` 将 `<input accept>` 从 `image/*` 收窄为位图类型，并展示来自后端 `detail` 的错误信息。
  - `backend/src/utils.py` 的文件校验同时检查扩展名、内容嗅探和真实文件大小；Logo 上传从流中完整统计大小，而不是只看前 8KB。
  - `GET /api/projects/{project_id}/logo` 在读取历史 `.svg` 或非安全类型文件时返回 400/404 风格错误，提示重新上传位图。
- **备选方案**：只在上传时拒绝 SVG，保留历史 SVG 继续可读。用户已否决。

### 4. 配置采用显式 `CRF_*` 覆盖层，production 强制 env secret，且 env 不得被写回 YAML
- **选择**：在 `backend/src/config.py` 中为关键字段增加显式 allowlist 覆盖：`CRF_ENV`、`CRF_AUTH_SECRET_KEY`、`CRF_AUTH_ACCESS_TOKEN_EXPIRE_MINUTES`、`CRF_TEMPLATE_PATH`、必要时 `CRF_SERVER_HOST/PORT`。`get_config()` 返回运行时合成结果；`update_config()` 继续以 YAML 原文为基线写回，不落盘 env-only 值。
- **原因**：显式映射比任意层级反射更可控，且能防止 secret 被设置页误写回仓库内 `config.yaml`。
- **额外约束**：
  - production 下若未提供 `CRF_AUTH_SECRET_KEY`，应用启动失败；且不得回退到 YAML 中的 `auth.secret_key`。
  - 开发与测试环境可继续使用 YAML 或 fixture secret，保证本地体验。
  - `template_path` 的相对路径统一相对 `config.yaml` 所在目录解析，和 `db_path` / `upload_path` 语义对齐。
- **备选方案**：自动将任意 `CRF_` 前缀映射到 YAML 嵌套键，过于脆弱，拒绝。

### 5. 通过小型 app factory 或等价初始化封装实现 production docs 关闭与安全头注入
- **选择**：将 FastAPI 构造前所需的 production 配置判断抽出为可测试的初始化路径，使 `docs_url`、`redoc_url`、`openapi_url` 在 production 为 `None`。同时增加统一 middleware，为成功/错误/429/FileResponse 等响应补充：
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - 最小可行 CSP（仅允许 `'self'`、必要的 `data:` 图片、阻止 object/frame 嵌入）
- **原因**：docs 开关必须在 FastAPI 实例化时决定，单靠启动事件太晚；安全头必须统一覆盖错误响应，否则会出现“正常响应安全、异常响应不安全”的漏洞。
- **备选方案**：保持全局 `app = FastAPI(...)` 并通过路由层拦截 docs 路径返回 404。实现可行，但难测且易漏 `/openapi.json`。优先接受轻量工厂化。

### 6. JWT 只缩 TTL，不改存储形态；前端依赖现有 401 自动退出机制
- **选择**：默认 JWT TTL 收缩到 <= 60 分钟；前端仍然使用 localStorage 存 token；`frontend/src/composables/useApi.js` 的 401 清 token / 广播退出逻辑继续作为唯一登出机制。
- **原因**：满足用户“当前登录形态不变”的边界，同时降低长期泄露 token 的滥用窗口。
- **落点**：
  - `config.yaml` 与 `.env.example` 同步更新示例 TTL。
  - `LoginView.vue` 与 `useApi.js` 需要对 403/429 维持可展示中文错误，不引入新的认证交互。
- **备选方案**：迁移到 HttpOnly Cookie。超范围，拒绝。

### 7. 限流采用进程内窗口计数器，按环境可关闭，并显式定义接口范围
- **选择**：在后端引入一个轻量限流实现（优先自写最小依赖，不强制新增第三方库），仅针对以下高价值接口启用：
  - `POST /api/auth/enter`：5 次 / 60 秒 / `normalized_username + client_ip`
  - `POST /api/projects/import/project-db`：3 次 / 60 秒 / `current_user.id` 优先，否则 IP
  - `POST /api/projects/import/database-merge`：3 次 / 60 秒 / 同上
  - `POST /api/projects/import/auto`：3 次 / 60 秒 / 同上
  - `POST /api/projects/{project_id}/import-docx/preview`：3 次 / 60 秒 / 同上
  - `POST /api/projects/{project_id}/import-docx/execute`：3 次 / 60 秒 / 同上
- **原因**：这些接口要么暴露认证面，要么有明显 CPU/IO 成本，最适合单机限流。
- **额外约束**：
  - `test` 环境完全关闭，避免测试污染；`development` 环境也关闭；`production` 强制启用。
  - 默认不信任 `X-Forwarded-For`，除非未来新增 trusted proxy 配置。
  - 429 响应统一为 JSON：`{"detail": "操作过于频繁，请稍后重试"}`，并附带 `Retry-After`。
  - 必须提供测试级 reset hook。
- **备选方案**：引入 Redis 或网关限流。超范围，拒绝。

### 8. 以规格驱动测试覆盖所有不变量
- **选择**：本次设计中的每个 capability 都映射到明确测试：路径绕过、管理员迁移、自愈/自动创建、生产 env secret、docs 404、安全头、SVG/伪装文件、模板路径白名单、JWT TTL、429 触发与恢复、前端 401/429 UX 回归。
- **原因**：这是一次跨后端、前端、配置与部署的安全加固，没有测试很容易在后续回归中失效。
- **备选方案**：只补少量 happy path 测试。无法支撑安全目标，拒绝。

## Risks / Trade-offs

- **[公网自动创建管理员重新引入接管面]** → 这是用户明确接受的残余高风险。缓解方式是：仅在“库为空 + production 启动”触发一次；保留用户名禁止自动登录创建；设计/README 中要求上线后立即改用受控管理员账号并审计初始账号。
- **[限流基于进程内内存，未来多 worker 会稀释效果]** → 规格中明确边界为单机/单进程部署；文档注明若升级为多实例需替换为共享存储限流。
- **[CSP 过严可能误伤前端或桌面打包]** → 采用最小可行 CSP，并为首页、资产、错误响应做回归验证；避免一开始引入过强 script/style 限制。
- **[历史配置中的 `template_path` 可能在新规则下变为非法]** → 保存时阻止新增非法值，运行时使用模板前再次校验并返回明确中文错误；文档指导用户迁移到允许目录。
- **[SVG 历史文件读取改为拒绝会影响现有项目展示]** → 这是为了封住存量 XSS 风险的必要代价；在 UI 和 README 中明确提示重新上传位图。
- **[引入 app factory 可能波及现有测试导入方式]** → 保持 `app = create_app()` 兼容原运行入口，并让测试可显式构造应用实例。

## Migration Plan

1. **代码迁移顺序**
   1. 增加 `user.is_admin` 模型字段与数据库轻量迁移。
   2. 实现管理员自愈与空库 production 自动创建逻辑。
   3. 修改 `require_admin()`、`/api/auth/me`、`/api/auth/enter`、`UserAdminService`。
   4. 收紧 `is_safe_path()` 语义与 `/assets` 白名单调用。
   5. 实现 `template_path` 双层校验。
   6. 收紧 Logo 上传/读取策略。
   7. 引入 env overlay、production secret 强制校验、docs 关闭、安全头。
   8. 引入限流与 429 统一响应。
   9. 更新前端错误提示、Logo 上传 accept、README / README.en / `.env.example`。
   10. 补齐 pytest / 前端回归测试。

2. **部署步骤**
   - 部署前从仓库配置中移除现有明文 secret，并生成新的 `CRF_AUTH_SECRET_KEY`。
   - 在生产环境注入 `CRF_ENV=production` 与 `CRF_AUTH_SECRET_KEY`。
   - 若数据库为空，首次启动将自动创建保留管理员用户名账号；上线后立即验证并进行管理员账号审计。
   - 验证 `/docs`、`/redoc`、`/openapi.json` 为 404，验证安全头存在，验证 SVG 被拒绝，验证 429 与 JWT TTL。

3. **回滚策略**
   - 数据库层：`is_admin` 列为向前兼容新增列，不需要回滚 schema 即可运行旧代码，但旧代码会忽略该列。
   - 配置层：若回滚到旧版本，需暂时恢复 YAML secret 或调整环境变量策略。
   - 风险提示：回滚会重新暴露本次封堵的安全问题，且旧 token/新 token 可能因 secret 切换全部失效。

## Open Questions

- 无阻塞性设计歧义残留；但需在实施文档中明确标注一个**已接受残余风险**：用户坚持“production 空库启动时自动创建管理员”，这与“彻底阻断管理员接管”目标冲突，只能通过文档和运维步骤减轻，不能通过代码完全消除。
