## 📋 实施计划：公网部署安全加固

### 任务类型
- [x] 前端 (→ gemini)
- [x] 后端 (→ codex)
- [x] 全栈 (→ 并行)

### 任务目标
在**不重构整套认证系统**的前提下，以最小但足够安全的改动，修复当前项目在公网部署前的高风险问题，使其满足以下最低上线条件：

1. `/assets` 不能再读取任意绝对路径或穿越路径。
2. 管理员身份不能再被抢注用户名获得。
3. Logo 上传不能再通过 SVG 引入存储型 XSS。
4. 生产环境不再依赖仓库中的明文 `auth.secret_key`。
5. 生产环境可关闭 `/docs`、`/redoc`、`/openapi.json`，并下发基础安全响应头。
6. JWT 暴露窗口缩短，关键滥用入口具备基础限流。
7. `template_path` 等敏感路径配置不能再指向任意系统路径。

---

### 技术方案
采用**分阶段硬化**策略，优先修复可直接导致服务器文件泄露、管理员接管、XSS 的 Critical 问题，再补齐生产配置、限流和测试。

核心原则：
- **优先小改动**，避免牵连现有业务流程。
- **后端先收口风险**，前端只做必要配合。
- **生产开关显式化**，通过环境变量区分开发/生产行为。
- **测试先覆盖漏洞复现路径**，再覆盖回归路径。

---

## 实施步骤

### 1. 修复 `/assets` 路径穿越
**目标**：彻底阻断绝对路径、`..` 路径、目录逃逸。

**涉及文件**
- `backend/src/utils.py:60-94`
- `backend/main.py:142-170`
- `backend/tests/test_utils.py`
- `backend/tests/test_subresource_isolation.py` 或新增 `backend/tests/test_static_assets_security.py`

**修改方案**
1. 重写 `is_safe_path()` 的判定语义：
   - 空路径拒绝。
   - 绝对路径拒绝。
   - 包含 `..` 的路径拒绝。
   - 若传入 `allowed_dirs`，则必须把“候选路径”解析到白名单目录之内，否则拒绝。
2. 在 `serve_asset()` 中不再直接校验用户传入的 `filepath`，而是：
   - 先基于 `_assets_dir / filepath` 组合候选路径；
   - 再把候选路径传给 `is_safe_path(..., allowed_dirs=[_assets_dir])`；
   - 仅当目标文件存在且位于 `_assets_dir` 内时才返回。
3. 顺便把静态资源缓存策略拆分：
   - `index.html` 保持 no-cache；
   - 带 hash 的 `/assets/*` 后续可切换为 immutable（本步骤先不强制）。

**伪代码**
```python
# utils.py

def is_safe_path(path: str, allowed_dirs: list[str] | None = None) -> tuple[bool, str]:
    if not path:
        return False, "路径不能为空"

    raw = Path(path)
    if raw.is_absolute():
        return False, "不允许绝对路径"
    if ".." in raw.parts:
        return False, "路径不能包含 .."

    if not allowed_dirs:
        return True, ""

    candidate = raw.resolve()
    for allowed_dir in allowed_dirs:
        allowed_real = Path(allowed_dir).resolve()
        try:
            candidate.relative_to(allowed_real)
            return True, ""
        except ValueError:
            pass
    return False, "路径必须在允许目录内"
```

```python
# main.py
asset_path = (_assets_dir / filepath).resolve()
safe, err = is_safe_path(str(asset_path), allowed_dirs=[str(_assets_dir)])
if not safe:
    return Response(status_code=400, content=err)
```

**验收标准**
- `/assets//etc/passwd`、`/assets/../../config.yaml`、编码后的 `..` 变体都失败。
- 正常静态资源仍可访问。

---

### 2. 阻止管理员用户名抢注
**目标**：管理员权限不再依赖“第一个注册该用户名的人”。

**涉及文件**
- `backend/src/routers/auth.py:31-41`
- `backend/src/dependencies.py:32-39`
- `backend/src/models/user.py:14-25`
- `backend/src/database.py`（如需轻量迁移）
- `backend/tests/test_auth.py`
- `backend/tests/test_user_admin.py` 或 `backend/tests/test_permission_guards.py`

**推荐方案（最稳妥）**
为 `user` 表增加 `is_admin` 布尔字段，由数据层决定管理员身份；`require_admin()` 改为检查 `current_user.is_admin`。

**分步实施**
1. `User` 模型新增 `is_admin: bool = False`。
2. 在 `database.py` 增加轻量迁移：若列不存在则补 `is_admin INTEGER DEFAULT 0 NOT NULL`。
3. `require_admin()` 改为基于 `current_user.is_admin` 校验，不再比较用户名。
4. 在 `auth.enter()` 中增加保护：
   - 若请求用户名等于 `config.admin.username` 且数据库中不存在该用户，拒绝自动创建；
   - 若数据库中已存在该用户，则允许正常登录。
5. 增加一个**启动期自愈/校准**逻辑（二选一）：
   - **方案 A，推荐**：应用启动时确保 `config.admin.username` 对应用户存在且 `is_admin=True`，不存在则创建。
   - **方案 B**：提供单独脚本初始化管理员，应用启动时若 admin 不存在则拒绝启动。

**伪代码**
```python
# models/user.py
is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
```

```python
# dependencies.py
if not current_user.is_admin:
    raise HTTPException(status_code=403, detail="需要管理员权限")
```

```python
# auth.py
admin_username = get_config().admin.username.strip()
if data.username.strip() == admin_username and not user:
    raise HTTPException(403, "管理员账号必须由系统初始化")
```

**权衡**
- 相比“继续靠用户名比较 + 禁止注册该用户名”，增加 `is_admin` 更安全，也更方便未来扩展多管理员。
- 改动面略大，但仍属于低风险局部修改。

**验收标准**
- 首次调用 `/api/auth/enter` 使用管理员用户名时不能获得管理员身份。
- 已初始化的管理员仍能登录并访问 `/api/admin/*`。

---

### 3. 消除 Logo SVG 存储型 XSS
**目标**：上传 Logo 不再允许可执行脚本载体。

**涉及文件**
- `backend/src/routers/projects.py:320-372`
- `backend/src/utils.py:115-176`
- `frontend/src/components/ProjectInfoTab.vue`（如有上传提示文案）
- `backend/tests/test_project_metadata.py` 或新增 `backend/tests/test_logo_upload_security.py`

**推荐方案**
**直接移除 SVG 支持**，仅允许位图格式：JPEG / PNG / GIF / BMP / WEBP。

**原因**
- 现有系统并无 SVG 消毒管线。
- 对临床类后台系统而言，去掉 SVG 的 UX 成本极低，安全收益极高。

**分步实施**
1. 从 `allowed_types` 删除 `image/svg+xml`。
2. `is_safe_file_upload()` 中同步删除 SVG 魔数识别逻辑。
3. 若前端上传控件有格式提示，改成不再显示 SVG。
4. 如果已有历史 SVG Logo：
   - 保守方案：允许旧文件继续读取，但新上传禁止 SVG；
   - 更安全方案：在读取时若扩展名为 `.svg` 则拒绝响应并提示重新上传位图。

**伪代码**
```python
allowed_types = [
    "image/jpeg", "image/png", "image/gif", "image/bmp", "image/webp"
]
```

**验收标准**
- 上传 SVG 返回 400。
- JPG/PNG/WEBP 上传仍正常。
- 现有项目 Logo 展示路径不受影响。

---

### 4. 改造密钥与生产配置加载
**目标**：生产环境可以不把密钥写进 `config.yaml`。

**涉及文件**
- `backend/src/config.py:52-119`
- `backend/main.py:62-72, 102`
- `backend/tests/test_config.py`
- 根目录 `config.yaml`（仅作为示例文档更新，不在本计划内直接改产品代码）

**修改方案**
1. 在 `load_config()` 或 `get_config()` 阶段引入环境变量覆盖：
   - `CRF_AUTH_SECRET_KEY`
   - `CRF_ADMIN_USERNAME`
   - `CRF_ENV`
   - 可选：`CRF_ACCESS_TOKEN_EXPIRE_MINUTES`
2. 优先级：**环境变量 > config.yaml 默认值**。
3. 在 `lifespan()` 中按环境做启动校验：
   - 开发环境：允许从 `config.yaml` 读 secret；
   - 生产环境：要求 `CRF_AUTH_SECRET_KEY` 存在，缺失则启动失败。
4. 给 `FastAPI(...)` 增加环境相关配置（见下一步）。

**伪代码**
```python
# config.py
secret_key = os.getenv("CRF_AUTH_SECRET_KEY") or data.get("auth", {}).get("secret_key", "")
admin_username = os.getenv("CRF_ADMIN_USERNAME") or data.get("admin", {}).get("username", "admin")
```

```python
# main.py
app_env = os.getenv("CRF_ENV", "development")
if app_env == "production" and not os.getenv("CRF_AUTH_SECRET_KEY"):
    raise RuntimeError("生产环境必须通过 CRF_AUTH_SECRET_KEY 提供密钥")
```

**验收标准**
- 开发环境不破坏现有启动方式。
- 生产环境可仅靠环境变量启动。
- secret 不再强制保存在仓库配置文件中。

---

### 5. 增加生产模式安全响应头并关闭公开文档
**目标**：降低点击劫持、MIME 嗅探、公开 API 文档暴露面。

**涉及文件**
- `backend/main.py:102`
- `backend/tests/test_auth.py` 或新增 `backend/tests/test_security_headers.py`

**修改方案**
1. 使用 `CRF_ENV` 区分开发 / 生产。
2. 在 `FastAPI(...)` 初始化时：
   - 生产环境 `docs_url=None, redoc_url=None, openapi_url=None`
   - 开发环境保持现状
3. 添加全局 HTTP 中间件注入基础安全头：
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Referrer-Policy: no-referrer`
   - `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; frame-ancestors 'none'`
   - 若明确走 HTTPS 反代，可加 `Strict-Transport-Security`
4. 此阶段**不强行引入 CORS**，因为当前前后端以同源/代理方式协作；若未来分域部署，再显式配置允许源。

**伪代码**
```python
app = FastAPI(
    title="CRF编辑器",
    lifespan=lifespan,
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
)

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    ...
    return response
```

**验收标准**
- 生产环境访问 `/docs` 返回 404。
- 关键接口响应包含安全头。

---

### 6. 缩短 JWT 风险窗口，保留当前前端登录形态
**目标**：在不立刻改 Cookie 会话制的前提下，先降低 token 泄露影响。

**涉及文件**
- `backend/src/config.py:70-73`
- `backend/src/services/auth_service.py:14-23`
- `frontend/src/App.vue:20-34`
- `frontend/src/composables/useApi.js:25-48`
- `backend/tests/test_auth.py`

**本阶段推荐方案**
1. 将默认 `access_token_expire_minutes` 从超长值收回到 30~60 分钟。
2. 保持前端 `localStorage` 方案不变，避免本次计划引入 Cookie + CSRF 的大改动。
3. 增加一个后续阶段建议：
   - 未来迁移为 `HttpOnly Cookie + CSRF Token`。
4. 如需再加一步安全性：JWT payload 增加 `iat`，为未来吊销策略预留空间。

**验收标准**
- 登录流程不变。
- 过期 token 能正常触发前端登出。
- 测试覆盖过期时间配置读取。

---

### 7. 为高滥用接口增加基础限流
**目标**：防止用户名撞库式创建、导入接口磁盘/CPU 滥用。

**涉及文件**
- `backend/requirements.txt`
- `backend/main.py`
- `backend/src/routers/auth.py`
- `backend/src/routers/projects.py`
- `backend/src/routers/import_docx.py`
- `backend/tests/test_auth.py`
- `backend/tests/test_project_import.py`

**推荐方案**
引入轻量限流组件（优先 `slowapi` 或等价实现），先覆盖：
- `/api/auth/enter`
- `/api/projects/import/project-db`
- `/api/projects/import/database-merge`
- `/api/projects/import/auto`
- `/api/projects/{id}/import-docx/preview`

**建议限额**
- `auth/enter`: `5/minute/IP`
- 导入接口：`2/minute/IP` 或 `3/5minutes/user`

**分步实施**
1. 增加依赖。
2. 在应用入口初始化 limiter。
3. 为上述接口加装饰器。
4. 返回统一 429 JSON。

**权衡**
- 内存型限流足够覆盖单机部署；
- 若未来多实例部署，再切 Redis 存储。

**验收标准**
- 连续请求超过阈值时返回 429。
- 正常用户低频操作不受影响。

---

### 8. 收紧 `template_path` 等路径配置
**目标**：管理员也不能把模板路径指向任意系统位置。

**涉及文件**
- `backend/src/routers/settings.py`
- `backend/src/utils.py`
- `backend/tests/test_config.py` 或新增 `backend/tests/test_settings_security.py`

**修改方案**
1. 为模板路径引入白名单根目录，例如：
   - `database/`
   - `uploads/`
   - 或单独新增 `templates/`
2. `update_settings()` 在校验 `template_path` 时，必须传 `allowed_dirs`。
3. 同时要求后缀必须是 `.db`。
4. 若路径不存在，可允许保存但只能在白名单目录内；若希望更严格，也可要求文件存在。

**伪代码**
```python
allowed_dirs = [
    str((Path(get_config().db_path).parent).resolve()),
    str(Path(get_config().upload_path).resolve()),
]
is_valid, error_msg = is_safe_path(payload.template_path, allowed_dirs=allowed_dirs)
if not payload.template_path.lower().endswith(".db"):
    raise HTTPException(400, "模板路径必须是 .db 文件")
```

**验收标准**
- `/etc/passwd`、`C:\\Windows\\win.ini`、白名单外路径保存失败。
- 合法模板库路径仍可保存与使用。

---

### 9. 测试策略（TDD / 回归）

#### 后端新增/更新测试
1. `backend/tests/test_utils.py`
   - `is_safe_path` 拒绝绝对路径
   - `is_safe_path` 拒绝 `..`
   - `is_safe_path` 允许白名单内路径
2. `backend/tests/test_subresource_isolation.py` 或新文件
   - `/assets//etc/passwd` 返回 400/404，不能返回文件内容
3. `backend/tests/test_auth.py`
   - 管理员用户名首次不能自动创建
   - 已存在管理员用户可登录
   - token 过期配置生效
4. `backend/tests/test_user_admin.py` / `test_permission_guards.py`
   - `require_admin` 基于 `is_admin` 校验
5. `backend/tests/test_project_metadata.py` 或新文件
   - SVG 上传被拒绝
   - PNG/JPG 正常上传
6. 新增 `backend/tests/test_security_headers.py`
   - 生产模式关闭 `/docs`
   - 响应头包含 `nosniff` / `DENY` / `CSP`
7. `backend/tests/test_config.py`
   - 环境变量覆盖 `config.yaml`
   - 生产环境缺失密钥时失败
8. `backend/tests/test_project_import.py`
   - 导入接口命中限流返回 429
9. 新增 `backend/tests/test_settings_security.py`
   - `template_path` 白名单校验

#### 前端回归测试
1. 登录过期后仍能清理本地 token（现有逻辑回归）
2. Logo 上传失败时 UI 错误提示正确
3. 管理员视图不因 `is_admin` 后端字段变更而异常

---

## 关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/main.py:62-72` | 修改 | 启动阶段按环境校验 secret |
| `backend/main.py:102` | 修改 | FastAPI 生产模式关闭 docs/openapi |
| `backend/main.py:142-170` | 修改 | 修复 `/assets` 路径穿越 |
| `backend/src/utils.py:60-94` | 修改 | 收紧 `is_safe_path` |
| `backend/src/utils.py:115-176` | 修改 | 删除 SVG 上传识别 |
| `backend/src/routers/auth.py:31-41` | 修改 | 阻止管理员用户名自动创建 |
| `backend/src/dependencies.py:32-39` | 修改 | 改为基于 `is_admin` 判权 |
| `backend/src/models/user.py:14-25` | 修改 | 新增 `is_admin` 字段 |
| `backend/src/database.py` | 修改 | 用户表轻量迁移，补 `is_admin` |
| `backend/src/routers/projects.py:320-372` | 修改 | 禁止 SVG Logo 上传 |
| `backend/src/config.py:52-119` | 修改 | 增加环境变量覆盖 |
| `backend/src/routers/settings.py` | 修改 | `template_path` 白名单路径校验 |
| `backend/requirements.txt` | 修改 | 增加限流依赖（如 `slowapi`） |
| `frontend/src/App.vue:20-34` | 可能修改 | 仅在需要补充 UX 提示时微调 |
| `frontend/src/composables/useApi.js:25-48` | 可能修改 | 保持 token 清理逻辑，必要时补充回归测试 |
| `backend/tests/test_utils.py` | 修改/新增用例 | 覆盖路径校验 |
| `backend/tests/test_auth.py` | 修改/新增用例 | 覆盖 admin 抢注与 token 过期 |
| `backend/tests/test_project_import.py` | 修改/新增用例 | 覆盖限流 |
| `backend/tests/test_config.py` | 修改/新增用例 | 覆盖 env override |

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| `is_admin` 字段引入后影响现有管理员识别 | 启动时自动校准 admin 用户，补迁移测试 |
| 历史 SVG Logo 无法继续使用 | 先禁止新上传；读取历史 SVG 时给出替换提示，作为兼容过渡 |
| 生产关闭 docs 影响调试 | 仅在 `CRF_ENV=production` 时关闭 |
| 限流影响测试或本地开发 | 开发环境放宽限额或允许关闭 limiter |
| 环境变量改造导致部署脚本失效 | 在计划执行时同步更新 README / 部署说明 |
| `template_path` 白名单过窄影响现有使用 | 先把现有合法目录纳入白名单，再逐步收紧 |

---

## 推荐实施顺序

### Phase A：必须先做（阻断高危利用）
1. `/assets` 路径穿越
2. 管理员抢注
3. SVG Logo XSS

### Phase B：上线前配置加固
4. 环境变量密钥覆盖
5. 生产关闭 docs + 安全头
6. `template_path` 白名单

### Phase C：上线前抗滥用与回归
7. JWT 过期策略收紧
8. 接口限流
9. 测试补齐与文档更新

---

## SESSION_ID（供 /ccg:execute 使用）
- `CODEX_SESSION`: `UNAVAILABLE`（codex CLI 在启动前即因 `/root/.codex/memories/codex-home/config.toml` 重复键 `GROK_MODEL` 失败，未生成 session）
- `GEMINI_SESSION`: `29084a86-af99-4dae-a280-9c0ae918da49`

---

## 执行备注
- 若你希望**最小变更**优先，我建议先执行 Phase A 三项 Critical。
- 若你希望**一次性达到公网最低可用基线**，建议执行 Phase A + Phase B + 对应测试。
- 本计划未包含 Cookie 会话迁移、审计日志、数据加密、合规性体系建设；这些应作为后续独立计划。
