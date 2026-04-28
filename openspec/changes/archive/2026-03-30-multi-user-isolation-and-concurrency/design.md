# Design: 多用户隔离与并发安全

> 零决策可执行设计 — 所有架构决策已在 proposal.md 和本文档中完整锁定。

## 1. 架构总览

### 1.1 认证流

```
[Browser]
  ├─ POST /api/auth/register  →  创建用户，返回 JWT
  ├─ POST /api/auth/login     →  验证密码，返回 JWT
  │
  ├─ 所有 /api/* 请求         →  Header: Authorization: Bearer <token>
  │                           →  FastAPI Depends(get_current_user)
  │                           →  解码 JWT → User → 注入路由函数
  │
  └─ 401 → 前端清除 token → 跳转登录页
```

### 1.2 数据隔离链

```
user.id
  └─► project.owner_id  (直接隔离)
       └─► visit.project_id      (链式校验)
            └─► form.project_id
                 └─► field_definition.project_id
                      └─► codelist.project_id
                           └─► unit.project_id
```

### 1.3 新增组件

| 组件 | 类型 | 路径 |
|------|------|------|
| User 模型 | 新增 | `backend/src/models/user.py` |
| AuthService | 新增 | `backend/src/services/auth_service.py` |
| Auth 路由 | 新增 | `backend/src/routers/auth.py` |
| 共享依赖 | 新增 | `backend/src/dependencies.py` |
| LoginView.vue | 新增 | `frontend/src/components/LoginView.vue` |

### 1.4 修改组件

| 组件 | 变更摘要 |
|------|----------|
| `config.py` | 新增 `AuthConfig` |
| `database.py` | WAL pragma + 迁移函数 + admin 初始化 |
| `models/project.py` | 新增 `owner_id` FK |
| `repositories/project_repository.py` | 新增 owner 过滤方法 |
| `routers/projects.py` | `Depends(get_current_user)` + 所有权校验 |
| `routers/visits.py` | `Depends` + 项目归属链校验 |
| `routers/forms.py` | `Depends` + 项目归属链校验 |
| `routers/fields.py` | `Depends` + 项目归属链校验 |
| `routers/codelists.py` | `Depends` + 项目归属链校验 |
| `routers/units.py` | `Depends` + 项目归属链校验 |
| `routers/export.py` | `Depends` + 项目归属链校验 |
| `routers/import_template.py` | `Depends` + 项目归属链校验 |
| `routers/import_docx.py` | `Depends` + 项目归属链校验 |
| `composables/useApi.js` | Bearer 注入 + 401 拦截 |
| `App.vue` | 登录态守卫 |

---

## 2. 数据模型

### 2.1 新增：user 表

```sql
CREATE TABLE "user" (
    id          INTEGER     PRIMARY KEY AUTOINCREMENT,
    username    VARCHAR(100) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    created_at  DATETIME    NOT NULL DEFAULT (datetime('now'))
);
```

SQLAlchemy Mapped 风格（与现有 Project 模型一致）：

```python
class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    projects: Mapped[list["Project"]] = relationship(back_populates="owner")
```

### 2.2 修改：project 表新增 owner_id

```sql
ALTER TABLE project ADD COLUMN owner_id INTEGER REFERENCES "user"(id);
-- 迁移后回填：
UPDATE project SET owner_id = <admin_user.id> WHERE owner_id IS NULL;
```

SQLAlchemy 模型添加：

```python
owner_id: Mapped[Optional[int]] = mapped_column(
    Integer, ForeignKey("user.id"), nullable=True, index=True
)
owner: Mapped[Optional["User"]] = relationship(back_populates="projects")
```

> `owner_id` 设 `nullable=True` 仅为迁移兼容。`_bootstrap_admin_user` 运行后所有行均有值。

---

## 3. 配置变更

### 3.1 新增 AuthConfig

```python
class AuthConfig(BaseModel):
    secret_key: str = ""
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    admin_initial_password: str = ""
```

### 3.2 AppConfig 新增 auth 字段

```python
class AppConfig(BaseModel):
    # ... 现有字段 ...
    auth: AuthConfig = AuthConfig()
```

### 3.3 config.yaml 示例

```yaml
auth:
  secret_key: "请替换为随机生成的256bit密钥"
  access_token_expire_minutes: 30
  admin_initial_password: "Admin@2026"
```

> `config.yaml` 已在 `.gitignore` 中排除，`secret_key` 不得提交版本控制。

---

## 4. 认证服务设计

### 4.1 密码哈希

- 库：`passlib[bcrypt]`
- CryptContext：`schemes=["bcrypt"], deprecated="auto"`
- bcrypt cost factor：passlib 默认值（12）

### 4.2 JWT 结构

Payload：

```json
{
  "sub": "username",
  "exp": 1234567890
}
```

算法：HS256，密钥来源：`get_config().auth.secret_key`

### 4.3 get_current_user 依赖

```
HTTP Request
  → OAuth2PasswordBearer 提取 Bearer token
  → decode_token(token) → username（失败抛 PyJWTError → 401）
  → session.query(User).filter_by(username=username).first()（不存在 → 401）
  → 返回 User 实例
```

---

## 5. 子资源归属链校验

### 5.1 verify_project_owner 函数（backend/src/dependencies.py）

```python
def verify_project_owner(project_id: int, current_user: User, session: Session) -> Project:
    project = ProjectRepository(session).get_by_id(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    if project.owner_id != current_user.id:
        raise HTTPException(403, "无权访问此项目")
    return project
```

### 5.2 子资源路由使用模式

```python
@router.get("/{project_id}/visits")
def list_visits(
    project_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    verify_project_owner(project_id, current_user, session)
    # 原有逻辑不变
```

> `verify_project_owner` 放在 `src/dependencies.py`，供全部路由导入。

---

## 6. SQLite WAL 优化

现有 `_enable_fk` 事件监听器扩展为：

```python
@event.listens_for(_engine, "connect")
def _configure_sqlite(dbapi_conn, connection_record):
    dbapi_conn.execute("PRAGMA foreign_keys = ON")
    dbapi_conn.execute("PRAGMA journal_mode=WAL")
    dbapi_conn.execute("PRAGMA busy_timeout=5000")
    dbapi_conn.execute("PRAGMA synchronous=NORMAL")
```

| Pragma | 值 | 效果 |
|--------|-----|------|
| `journal_mode` | `WAL` | 并发读+单写，读写互不阻塞 |
| `busy_timeout` | `5000` ms | 写锁等待最多 5 秒，避免立即报 `SQLITE_BUSY` |
| `synchronous` | `NORMAL` | WAL 下安全的性能优化，不丢已提交事务 |

---

## 7. 前端认证流

### 7.1 Token 管理

| 操作 | 方式 |
|------|------|
| 存储 | `localStorage.setItem('crf_token', token)` |
| 读取 | `localStorage.getItem('crf_token')` |
| 删除 | `localStorage.removeItem('crf_token')` |
| 注入 | 所有 fetch 请求头：`Authorization: Bearer <token>` |

### 7.2 401 拦截机制

```
fetch 响应 status === 401
  → _handle401()
      → localStorage.removeItem('crf_token')
      → window.dispatchEvent(new CustomEvent('crf:auth-expired'))
  → App.vue 监听 'crf:auth-expired'
      → isLoggedIn.value = false
      → 渲染 <LoginView>
```

### 7.3 App.vue 守卫结构

```html
<template>
  <LoginView v-if="!isLoggedIn" @login-success="onLoginSuccess" />
  <div v-else>
    <!-- 现有主界面 -->
  </div>
</template>
```

---

## 8. 迁移策略

### 8.1 init_db 执行顺序

```
Base.metadata.create_all(engine)     ← 创建 user 表（新表）
_migrate_add_code_columns(engine)    ← 现有
_migrate_add_trailing_underscore(engine)  ← 现有
_migrate_add_order_index(engine)     ← 现有
_migrate_add_design_notes(engine)    ← 现有
_migrate_add_color_mark(engine)      ← 现有
_migrate_add_project_owner_id(engine)  ← 新增：project 表加 owner_id 列
_bootstrap_admin_user(engine)        ← 新增：创建 admin + 回填旧数据
```

### 8.2 admin 账号创建规则

| 条件 | 行为 |
|------|------|
| `admin_initial_password` 为空 | 打印 WARNING，跳过（不阻塞启动） |
| user 表中 `username='admin'` 不存在 | 创建 admin + 哈希密码，回填所有 `owner_id IS NULL` 项目 |
| admin 已存在 | 跳过创建，仍执行 `UPDATE project SET owner_id` 回填（幂等） |

---

## 9. 成功判据

见 `proposal.md` Section 7（8 项可验证判据）。
