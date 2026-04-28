# Spec 02: 数据隔离

## 1. Project 模型变更（backend/src/models/project.py）

### 1.1 新增 import

```python
from sqlalchemy import ForeignKey
```

在 `TYPE_CHECKING` 块中添加：

```python
if TYPE_CHECKING:
    from .user import User
```

### 1.2 新增字段

在 `Project` 类现有字段末尾添加：

```python
owner_id: Mapped[Optional[int]] = mapped_column(
    Integer, ForeignKey("user.id"), nullable=True, index=True
)
owner: Mapped[Optional["User"]] = relationship(back_populates="projects")
```

> `nullable=True` 仅为迁移过渡期兼容（旧数据无 owner_id）。`_bootstrap_admin_user` 执行后所有行均有值。

---

## 2. 数据库迁移（backend/src/database.py）

### 2.1 _migrate_add_project_owner_id

在现有迁移函数末尾追加：

```python
def _migrate_add_project_owner_id(engine):
    """给 project 表补上 owner_id 列（迁移到多用户版本）"""
    insp = inspect(engine)
    if not insp.has_table("project"):
        return
    with engine.begin() as conn:
        cols = [c["name"] for c in insp.get_columns("project")]
        if "owner_id" not in cols:
            conn.execute(
                text('ALTER TABLE project ADD COLUMN owner_id INTEGER REFERENCES "user"(id)')
            )
```

### 2.2 _bootstrap_admin_user

```python
def _bootstrap_admin_user(engine):
    """首次部署：创建 admin 账号并回填旧项目的 owner_id。

    幂等：admin 已存在时跳过创建，但仍执行 owner_id 回填。
    """
    import logging
    from src.config import get_config
    from src.services.auth_service import hash_password

    config = get_config()
    initial_password = config.auth.admin_initial_password
    if not initial_password:
        logging.warning(
            "auth.admin_initial_password 未配置，跳过 admin 账号初始化。"
            "如需多用户功能，请在 config.yaml 中设置此字段。"
        )
        return

    with engine.begin() as conn:
        row = conn.execute(
            text('SELECT id FROM "user" WHERE username = :u'), {"u": "admin"}
        ).first()
        if row is None:
            hashed = hash_password(initial_password)
            conn.execute(
                text('INSERT INTO "user" (username, hashed_password) VALUES (:u, :h)'),
                {"u": "admin", "h": hashed}
            )
            row = conn.execute(
                text('SELECT id FROM "user" WHERE username = :u'), {"u": "admin"}
            ).first()

        admin_id = row[0]
        conn.execute(
            text("UPDATE project SET owner_id = :uid WHERE owner_id IS NULL"),
            {"uid": admin_id}
        )
```

### 2.3 init_db 更新

```python
def init_db():
    engine = get_engine()
    Base.metadata.create_all(engine)
    _migrate_add_code_columns(engine)
    _migrate_add_trailing_underscore(engine)
    _migrate_add_order_index(engine)
    _migrate_add_design_notes(engine)
    _migrate_add_color_mark(engine)
    _migrate_add_project_owner_id(engine)   # 新增
    _bootstrap_admin_user(engine)           # 新增
```

---

## 3. ProjectRepository 变更（backend/src/repositories/project_repository.py）

新增两个方法（不修改 BaseRepository，在 ProjectRepository 子类中覆盖/新增）：

```python
def get_all_by_owner(self, owner_id: int) -> list[Project]:
    """仅返回属于 owner_id 的项目，按 id 排序。"""
    from sqlalchemy import select
    stmt = select(Project).where(Project.owner_id == owner_id).order_by(Project.id)
    return list(self.session.scalars(stmt))


def create_with_owner(self, project: Project, owner_id: int) -> Project:
    """注入 owner_id 后创建项目。"""
    project.owner_id = owner_id
    self.session.add(project)
    self.session.flush()
    self.session.refresh(project)
    return project
```

---

## 4. Projects 路由变更（backend/src/routers/projects.py）

### 4.1 新增导入

```python
from src.dependencies import get_current_user, verify_project_owner
from src.models.user import User
```

### 4.2 端点变更规则

所有端点签名新增参数：
```python
current_user: User = Depends(get_current_user)
```

| 端点 | 变更内容 |
|------|----------|
| `GET /projects` | 改用 `repo.get_all_by_owner(current_user.id)` |
| `POST /projects` | 改用 `repo.create_with_owner(Project(**data.model_dump()), current_user.id)` |
| `GET /projects/{id}` | 获取项目后校验 owner，否则 403 |
| `PUT /projects/{id}` | 同上 |
| `DELETE /projects/{id}` | 同上 |
| `GET /projects/{id}/logo` | 同上 |
| `POST /projects/{id}/logo` | 同上 |

### 4.3 所有权校验代码模式

```python
project = ProjectRepository(session).get_by_id(project_id)
if not project:
    raise HTTPException(404, "项目不存在")
if project.owner_id != current_user.id:
    raise HTTPException(403, "无权访问此项目")
```

---

## 5. 子资源路由变更规则

### 5.1 通用模式

所有含 `project_id` 路径参数的端点，统一采用以下模式：

```python
from src.dependencies import get_current_user, verify_project_owner
from src.models.user import User

@router.get("/{project_id}/visits")
def list_visits(
    project_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    verify_project_owner(project_id, current_user, session)
    # 原有逻辑保持不变
    ...
```

### 5.2 涉及文件清单

| 文件 | 含 project_id 的端点数（估算） |
|------|-------------------------------|
| `routers/visits.py` | 全部（约 4-6 个） |
| `routers/forms.py` | 全部（约 4-6 个） |
| `routers/fields.py` | 全部（约 4-6 个） |
| `routers/codelists.py` | 全部（约 4-6 个） |
| `routers/units.py` | 全部（约 3-5 个） |
| `routers/export.py` | 含 project_id 的端点 |
| `routers/import_template.py` | 含 project_id 的端点 |
| `routers/import_docx.py` | 含 project_id 的端点 |

> `routers/settings.py`：全局配置，无 project_id，不加隔离。

### 5.3 错误响应

- project 不存在：`404 {"detail": "项目不存在"}`
- 非 owner 访问：`403 {"detail": "无权访问此项目"}`
- 未携带/无效 token：`401 {"detail": "未授权"}`
