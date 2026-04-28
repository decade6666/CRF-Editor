# 技术设计：无密码用户名登录

## 核心设计决策

### D-1 Upsert-by-username 模式

```
POST /api/auth/enter { username: "alice" }
  → strip() 去空白
  → 校验非空（空则 422）
  → SELECT * FROM user WHERE username = "alice"
  → 不存在 → INSERT user(username, hashed_password=NULL)
  → 签发 JWT(sub=username)
  → 返回 { access_token, token_type: "bearer" }
```

单端点替代原有 register + login 两端点，降低认知负担。

### D-2 hashed_password 改为可空

SQLite 不支持 `ALTER COLUMN`，采用**重建表**模式（与 `database.py` 现有迁移一致）：

```
CREATE TABLE user_new (hashed_password VARCHAR(255))   ← 无 NOT NULL
INSERT INTO user_new SELECT ... FROM user
DROP TABLE user
ALTER TABLE user_new RENAME TO user
```

迁移函数通过 `inspect(engine).get_columns("user")` 检测 nullable 状态，已满足则幂等跳过。

### D-3 移除 _bootstrap_admin_user

安全风险：无密码模式下任何人输入 "admin" 即可获得 admin token，访问历史孤立项目。

替换为 `_warn_orphan_projects`：启动时查询 `owner_id IS NULL` 的项目数，记录 WARNING 日志，不自动创建用户。

### D-4 前端仅删减，不重构

- 删除 `password` ref、密码 `el-form-item`、相关 rules
- `handleLogin()` 改为 `fetch('/api/auth/enter', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username}) })`
- 不引入新组件或新 composable

---

## 文件变更清单

### 后端

| 文件 | 操作 | 关键变更 |
|------|------|---------|
| `backend/src/models/user.py` | 修改 | `hashed_password: Mapped[Optional[str]]`, `nullable=True` |
| `backend/src/services/auth_service.py` | 修改 | 删除 `passlib` 导入、`hash_password`、`verify_password`；保留 JWT 函数 |
| `backend/src/routers/auth.py` | 重写 | 删 `/register`、`/login`；新增 `/enter`（EnterRequest + upsert 逻辑）|
| `backend/src/database.py` | 修改 | 删 `_bootstrap_admin_user`；加 `_migrate_user_hashed_password_nullable` + `_warn_orphan_projects`；更新 `init_db()` |
| `backend/src/config.py` | 修改 | `AuthConfig` 删除 `admin_initial_password` 字段 |
| `backend/requirements.txt` | 修改 | 删 `passlib[bcrypt]`、`bcrypt<4.0.0` |

### 前端

| 文件 | 操作 | 关键变更 |
|------|------|---------|
| `frontend/src/components/LoginView.vue` | 修改 | 删密码字段；请求改为 JSON POST `/api/auth/enter`；按钮文本 `进入` |

### 测试

| 文件 | 操作 | 关键变更 |
|------|------|---------|
| `backend/tests/helpers.py` | 修改 | `register_and_login` → `login_as(client, username)`；保留 `auth_headers` |
| `backend/tests/test_auth.py` | 重写 | 覆盖 `/enter` 语义：创建用户、幂等、空用户名 422、无 token 401 |
| `backend/tests/test_isolation.py` | 修改 | 替换 helper 调用签名，测试逻辑不变 |
| `backend/tests/conftest.py` | 修改（可能）| 移除 mock config 中 `admin_initial_password` 键（如存在） |

### 不变文件

- `backend/src/dependencies.py` — `get_current_user` 不变，`tokenUrl` 过期只影响 Swagger 文档
- `backend/src/routers/` 8 个业务路由 — 无需改动
- `backend/src/models/project.py` — `owner_id` 不变
- `frontend/src/composables/useApi.js` — Bearer token 机制不变
- `frontend/src/App.vue` — 认证状态管理不变

---

## init_db() 调用顺序（更新后）

```python
def init_db():
    engine = get_engine()
    Base.metadata.create_all(engine)
    _migrate_add_code_columns(engine)
    _migrate_add_trailing_underscore(engine)
    _migrate_add_order_index(engine)
    _migrate_add_design_notes(engine)
    _migrate_add_color_mark(engine)
    _migrate_add_project_owner_id(engine)
    _migrate_user_hashed_password_nullable(engine)  # 新增：hashed_password 改可空
    _warn_orphan_projects(engine)                   # 新增：替换 _bootstrap_admin_user
```

---

## 关键伪代码

### auth.py /enter 端点

```python
class EnterRequest(BaseModel):
    username: str

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("用户名不能为空")
        return v

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/enter", response_model=TokenResponse)
def enter(data: EnterRequest, session: Session = Depends(get_session)):
    user = session.scalar(select(User).where(User.username == data.username))
    if not user:
        user = User(username=data.username, hashed_password=None)
        session.add(user)
        session.flush()
    return TokenResponse(access_token=create_access_token(user.username))
```

### LoginView.vue handleLogin()

```js
async function handleLogin() {
  if (!username.value.trim()) {
    ElMessage.error('请输入用户名')
    return
  }
  loading.value = true
  try {
    const r = await fetch('/api/auth/enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value.trim() })
    })
    if (!r.ok) throw new Error('network')
    const data = await r.json()
    localStorage.setItem('crf_token', data.access_token)
    emit('login-success')
  } catch {
    ElMessage.error('连接失败，请重试')
  } finally {
    loading.value = false
  }
}
```

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 旧数据库 hashed_password NOT NULL 记录 | 迁移函数先改列约束，存量哈希值保留（不再校验） |
| _bootstrap_admin_user 移除后孤立项目不可见 | `_warn_orphan_projects` 启动时记录日志，提示管理员 |
| `dependencies.py` tokenUrl 失效 | 仅影响 Swagger /docs UI 的 Authorize 按钮，API 功能正常 |
| `python-multipart` 误删 | 已明确在 requirements.txt 中保留 |
