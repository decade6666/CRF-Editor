## 📋 实施计划：管理员用户标签与操作收敛

### 任务类型
- [x] 前端 (→ gemini)
- [x] 后端 (→ codex)
- [ ] 全栈 (→ 并行)

### 技术方案
采用最小范围的前后端联动改动：

1. 后端在 `GET /api/admin/users` 的列表响应中新增 `is_admin: bool` 字段，来源于已存在的 `User.is_admin` 持久化字段。
2. 前端管理员页面 `frontend/src/components/AdminView.vue` 基于 `row.is_admin` 渲染“管理员”标签，并对管理员行仅保留“改名”“重置密码”两个操作。
3. 不基于用户名（如 `admin`）做前端推断，不引入角色系统重构，不修改数据库结构。
4. 保持现有后端“保留管理员用户名”保护语义不变；本次仅实现基于 `is_admin` 的 UI 呈现与交互收敛。

### 需求澄清与边界
- “管理员用户”应按 `User.is_admin == true` 判定，而不是按用户名是否为保留管理员账号判定。
- “保留管理员用户名”是后端现有保护规则，限制特定用户名的创建/改名/删除；它与 `is_admin` 是相关但不完全等同的概念。
- 本次只收敛管理员界面上的可见/可点操作；不额外把“所有管理员账号都不可被 API 删除”升级为新的后端强约束，除非用户另行确认。

### 实施步骤
1. 扩展后端用户列表 DTO  
   - 文件：`backend/src/services/user_admin_service.py`
   - 在 `UserInfo` dataclass 中新增 `is_admin: bool`。
   - 预期产物：服务层可携带管理员标识。

2. 扩展后端用户列表查询  
   - 文件：`backend/src/services/user_admin_service.py`
   - 在 `list_users()` 的 `select(...)` 中加入 `User.is_admin`。
   - 在 `UserInfo(...)` 构造中映射 `is_admin`。
   - 预期产物：`UserAdminService.list_users()` 返回的每个用户对象都包含 `is_admin`。

3. 扩展管理员列表接口响应模型  
   - 文件：`backend/src/routers/admin.py`
   - 在 `UserListItem` 中新增 `is_admin: bool`。
   - 在 `/admin/users` 返回列表的映射中传出 `u.is_admin`。
   - 预期产物：前端 `loadUsers()` 能拿到管理员标识。

4. 在管理员页面用户名列添加标签  
   - 文件：`frontend/src/components/AdminView.vue`
   - 将“用户名”列从简单 `prop` 展示改为 slot/template 展示。
   - 在用户名旁边增加 `el-tag`，当 `row.is_admin` 为真时显示“管理员”。
   - 样式保持与现有 Element Plus 标签体系一致，优先采用 `size="small"`，颜色选 `danger` 或项目现有更协调的高亮方案。
   - 预期产物：管理员账号在表格中可被一眼识别。

5. 收敛管理员行的操作按钮  
   - 文件：`frontend/src/components/AdminView.vue`
   - 始终保留：`改名`、`重置密码`。
   - 仅对非管理员行显示：`批量迁移`、`批量复制`、`批量删除`、`删除`。
   - 推荐实现方式：对这 4 个按钮加 `v-if="!row.is_admin"`，而不是单纯 `disabled`，以减少视觉噪音并与需求“仅允许点击这两个操作”一致。
   - 非管理员行保留原有逻辑，例如删除按钮仍继续受 `row.project_count > 0` 限制。
   - 预期产物：管理员行只剩两个入口，普通用户行行为不变。

6. 补充后端测试  
   - 文件：`backend/tests/test_user_admin.py`
   - 新增或扩展测试：调用 `GET /api/admin/users`，断言返回项包含 `is_admin`。
   - 至少覆盖：
     - 保留管理员账号（如 `admin`）返回 `is_admin == true`
     - 普通用户返回 `is_admin == false`
     - 可选再覆盖一个非保留用户名但 `is_admin == true` 的管理员（如 `ops_root`），证明逻辑不依赖用户名
   - 预期产物：后端契约变更受测试保护。

7. 补充前端结构测试  
   - 文件：`frontend/tests/adminViewStructure.test.js`
   - 新增断言：
     - 模板中存在 `row.is_admin`
     - 存在“管理员”标签文案
     - `openBatchMove/openBatchCopy/openBatchDelete/deleteUser` 这些管理员受限操作受 `!row.is_admin` 条件控制
     - `openRenameUser/openResetPassword` 仍存在且不受该条件限制
   - 预期产物：管理员界面模板结构变更受回归测试保护。

8. 验证实现  
   - 后端：`cd backend && python -m pytest tests/test_user_admin.py`
   - 前端：`cd frontend && node --test tests/adminViewStructure.test.js`
   - 可选构建验证：`cd frontend && npm run build`
   - 若有条件运行界面，再人工确认管理员/普通用户两类行的展示差异与点击行为。

### 关键文件
| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/services/user_admin_service.py:17-64` | 修改 | 扩展 `UserInfo` 与 `list_users()`，透出 `is_admin` |
| `backend/src/routers/admin.py:283-305` | 修改 | 扩展 `UserListItem` 和 `/admin/users` 返回映射 |
| `frontend/src/components/AdminView.vue:276-296` | 修改 | 用户名列加管理员标签，操作列按 `row.is_admin` 收敛 |
| `backend/tests/test_user_admin.py:85-140` | 修改 | 增加 `/api/admin/users` 返回 `is_admin` 的断言 |
| `frontend/tests/adminViewStructure.test.js:18-45` | 修改 | 增加管理员标签与受限操作条件渲染断言 |

### 伪代码
```python
# backend/src/services/user_admin_service.py
@dataclass
class UserInfo:
    id: int
    username: str
    project_count: int
    has_password: bool
    is_admin: bool

@staticmethod
def list_users(session: Session) -> List[UserInfo]:
    stmt = (
        select(
            User.id,
            User.username,
            User.hashed_password,
            func.count(Project.id).label("project_count"),
            User.is_admin,
        )
        .outerjoin(Project, (Project.owner_id == User.id) & Project.deleted_at.is_(None))
        .group_by(User.id)
        .order_by(User.id)
    )
    rows = session.execute(stmt).all()
    return [
        UserInfo(
            id=row[0],
            username=row[1],
            has_password=has_usable_password_hash(row[2]),
            project_count=row[3],
            is_admin=row[4],
        )
        for row in rows
    ]
```

```python
# backend/src/routers/admin.py
class UserListItem(BaseModel):
    id: int
    username: str
    project_count: int
    has_password: bool
    is_admin: bool

@router.get("/admin/users", response_model=List[UserListItem])
def list_users(...):
    users = UserAdminService.list_users(session)
    return [
        UserListItem(
            id=u.id,
            username=u.username,
            project_count=u.project_count,
            has_password=u.has_password,
            is_admin=u.is_admin,
        )
        for u in users
    ]
```

```vue
<!-- frontend/src/components/AdminView.vue -->
<el-table-column label="用户名">
  <template #default="{ row }">
    <span>{{ row.username }}</span>
    <el-tag v-if="row.is_admin" size="small" type="danger">管理员</el-tag>
  </template>
</el-table-column>

<el-table-column label="操作" width="540">
  <template #default="{ row }">
    <el-button size="small" @click="openRenameUser(row)">改名</el-button>
    <el-button size="small" type="primary" @click="openResetPassword(row)">重置密码</el-button>

    <template v-if="!row.is_admin">
      <el-button size="small" type="primary" plain @click="openBatchMove(row)">批量迁移</el-button>
      <el-button size="small" type="success" plain @click="openBatchCopy(row)">批量复制</el-button>
      <el-button size="small" type="warning" plain @click="openBatchDelete(row)">批量删除</el-button>
      <el-button size="small" type="danger" plain @click="deleteUser(row)" :disabled="row.project_count > 0">删除</el-button>
    </template>
  </template>
</el-table-column>
```

### 风险与缓解
| 风险 | 缓解措施 |
|------|----------|
| 前端当前拿不到管理员标识，无法正确渲染 | 先扩展 `/api/admin/users` 响应，再改前端模板 |
| 用用户名判断管理员会误伤/漏判多管理员场景 | 明确统一使用 `row.is_admin`，不写 `username === 'admin'` 逻辑 |
| “管理员用户”与“保留管理员用户名”语义混淆 | 在实现和测试中区分：UI 基于 `is_admin`；后端保留用户名保护维持现状 |
| 前端隐藏按钮但 API 仍可操作非保留管理员 | 在计划中明确这是 UI 收敛，不是新授权策略；若要升级为服务端强约束需另行确认 |
| 前后端未同步发布导致前端拿不到 `is_admin` | 尽量同批部署，并通过测试覆盖 API 契约 |
| 管理员标签挤占表格空间 | 采用小号 `el-tag`，尽量内联展示，不新增独立列 |

### 关键取舍
- **采用**：前端隐藏管理员受限动作，而不是仅 disabled。这样更贴近“仅允许点击改名和重置密码”，同时减少操作列噪音。
- **不采用**：本次直接修改后端删除逻辑来禁止删除所有 `is_admin=true` 用户。因为这会改变现有服务端语义，超出当前最小需求。
- **不采用**：基于保留用户名做管理员标签或操作控制。因为真实权限判断已经是 `User.is_admin`，前端应与后端一致。

### SESSION_ID（供 /ccg:execute 使用）
- CODEX_SESSION: `019dbe13-aa45-7d61-ada7-24fc92e7c074`
- GEMINI_SESSION: `9d1a0c4f-f69c-4b5b-b6bc-39512feea76e`

### 参考分析会话
- CODEX_ANALYZER_SESSION: `019dbe10-ab73-7dc1-9db4-d183ba3078fa`
- GEMINI_ANALYZER_SESSION: `7d7213d1-87a1-4e78-b37e-a3b10b02264d`
