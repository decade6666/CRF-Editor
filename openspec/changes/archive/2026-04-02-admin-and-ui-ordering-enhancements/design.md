# Design: admin-and-ui-ordering-enhancements

## 1. 架构概览

本次变更采用**弱管理员后端门禁 + 独立服务层 + 复用 OrderService**方案。

```
前端 (Vue 3 + Element Plus)          后端 (FastAPI + SQLAlchemy)
─────────────────────────────        ──────────────────────────────────────
App.vue                              main.py (router 注册)
  ├── 设置弹窗 (2列布局)              ├── routers/admin.py  [NEW]
  │     ├── 导入项目 (R1)            │     ├── GET  /api/auth/me
  │     └── 导入数据库 (R1)          │     ├── POST /api/admin/import/project-db
  ├── 管理员入口 (R7)                 │     ├── POST /api/admin/import/database-merge
  │     └── AdminView.vue [NEW]      │     ├── GET  /api/admin/users
  │           └── UserMgmtTable      │     ├── POST /api/admin/users
  ├── 项目列表 (R4, R5)              │     ├── PATCH /api/admin/users/{id}
  │     ├── 复制按钮                  │     └── DELETE /api/admin/users/{id}
  │     ├── 删除按钮(常显)            ├── routers/projects.py  [MODIFIED]
  │     └── 折叠按钮(R5)             │     └── POST /api/projects/{id}/copy
  ├── FieldsTab (R3拖拽)             ├── services/project_clone_service.py [NEW]
  ├── FormDesignerTab (R2,R3,R6)    ├── services/import_service.py  [MODIFIED]
  └── VisitsTab (R3拖拽)            │     └── ProjectDbImportService [NEW]
                                    │     └── DatabaseMergeService [NEW]
composables/                        ├── services/user_admin_service.py [NEW]
  ├── useOrderableList.js [复用]     ├── dependencies.py  [MODIFIED]
  └── useApi.js [复用]               │     └── require_admin() [NEW]
                                    └── config.py + config.yaml [MODIFIED]
                                          └── admin.username
```

## 2. 关键技术决策

### 2.1 管理员判定

**选择：后端 gate + 前端 is_admin**

- `GET /api/auth/me` 返回 `is_admin: bool`，前端据此显示/隐藏入口
- 所有 `/api/admin/*` 路由使用 `require_admin` 依赖二次校验
- 不向前端暴露 `admin_username` 原值
- 用户名比较：strip 前后空白 + 大小写敏感

**放弃**：仅前端隐藏（无后端 gate）——任何人知道接口路径即可绕过

### 2.2 Token 策略（改名后立即失效）

当前 JWT 载荷绑定稳定 `user.id` 与 `username` 快照。鉴权时：
- 先按 `user.id` 查用户
- 再校验库内 `username` 与 token 快照一致
- 任一不匹配即返回 401

因此用户改名后：
- 若被改名的是当前管理员自身 → 前端改名成功回调中清除 token，跳转登录页
- 若被改名的是其他用户 → 其下次请求时因 username 快照失配返回 401
- 即使旧用户名被新用户重新创建，旧 token 仍不会复活

**不做 token 黑名单**（复杂度高）；自然失效通过稳定主键 + 用户名快照实现。

### 2.3 项目克隆架构

```python
# 核心流程
class ProjectCloneService:
    def clone(project_id, new_owner_id, db) -> Project:
        graph = ProjectGraphLoader.load(project_id, db)  # 完整图
        id_map = {}  # 旧ID -> 新ID 映射
        # 按拓扑顺序深拷贝：project -> visit/form -> visit_form/form_field -> ...
        new_project = clone_project(graph.project, new_owner_id, id_map)
        clone_resources(graph, id_map, db)
        copy_logo_file(graph.project, new_project)  # 事务外执行
        return new_project
```

**ProjectGraphLoader.load** 覆盖范围（区别于 export loader）：
- project-scoped 全量 field_definitions（含未被 form 引用的）
- project-scoped 全量 units
- project-scoped 全量 codelists + options
- 所有 forms（含 order_index）
- 所有 visits（含 order_index）
- 所有 visit_forms（含 sequence）
- 所有 form_fields（含 order_index）
- logo 文件路径（若存在）

**命名规则**：
```
原名 → 「原名 (副本)」→ 「原名 (副本2)」→ ...
```

### 2.4 导入服务架构

```python
class ProjectDbImportService:
    def import_single_project(file, current_user_id, db) -> Project:
        ext_db = open_readonly_sqlite(file)
        validate_schema(ext_db)          # 检查必要表存在
        validate_single_project(ext_db)  # project 数量 == 1
        graph = load_external_project(ext_db)
        return ProjectCloneService.clone_from_graph(graph, current_user_id, db)

class DatabaseMergeService:
    def merge(file, current_user_id, db) -> MergeReport:
        ext_db = open_readonly_sqlite(file)
        validate_schema(ext_db)
        projects = load_all_projects(ext_db)  # 不加载 user 表
        report = MergeReport()
        for p in projects:
            final_name = resolve_name_conflict(p.name, db)  # 自动重命名
            cloned = ProjectCloneService.clone_from_graph(p, current_user_id, db)
            report.record(original=p.name, final=final_name)
        return report
```

**原子性**：所有数据库写入在单一事务内；logo 文件写入在事务提交后执行。

### 2.5 拖拽排序集成

复用现有 `useOrderableList.js` 协议：
1. vuedraggable `@end` 事件 → 更新本地顺序
2. 调用 `reorder(ids)` → 发送完整 ID 数组到后端
3. 过滤/搜索状态下设置 `:disabled="isFiltered"` 禁用 vuedraggable

### 2.6 设置页布局

```html
<!-- 现有单列 -->
<div class="data-actions">
  <el-button>导出当前项目</el-button>
  <el-button>导出整个数据库</el-button>
</div>

<!-- 新两列布局 -->
<div class="data-actions two-col">
  <div class="col-left">
    <el-button>导入项目</el-button>       <!-- admin only -->
    <el-button>导入数据库</el-button>     <!-- admin only -->
  </div>
  <div class="col-right">
    <el-button>导出当前项目</el-button>
    <el-button>导出整个数据库</el-button>
  </div>
</div>
```

导入按钮触发 `<input type="file" accept=".db">` 并调用对应 admin API。

## 3. 数据模型变更

### 3.1 config.yaml 新增字段
```yaml
admin:
  username: "admin"
```

### 3.2 config.py 新增
```python
class AdminConfig(BaseModel):
    username: str = "admin"

class Settings(BaseSettings):
    ...
    admin: AdminConfig = AdminConfig()
```

### 3.3 现有模型无结构变更
- User 模型：不新增 role/is_admin 字段（通过 config 比较判定）
- Project 模型：无变更
- 所有其他模型：无变更

## 4. PBT 属性汇总

| 需求 | Invariant | Falsification Strategy |
|------|-----------|----------------------|
| R1 | 导入后项目及子资源外键完整，owner_id ≠ NULL | 随机生成含全量子资源的单项目 .db，导入后做 referential integrity 扫描 |
| R1 | 整库合并：失败时零变更 | 在合并中途注入异常，比较前后快照 |
| R2 | feature 前后后端 JSON keys 不变 | 对 CRUD + export 做 response schema 快照比较 |
| R3 | reorder 后同作用域 order_index 构成 1..n 稠密排列 | 随机生成 permutation + 边界：重复ID/缺失ID/跨作用域ID |
| R3 | 刷新后顺序与导出一致 | 随机重排后重新 list 并导出，比较出现顺序 |
| R4 | clone 后新项目与源同构（节点数等价），所有新主键隔离 | 随机生成项目图后 clone，检查 counts 和内部引用 |
| R4 | logo 生命周期独立 | 复制后删除/替换源 logo，验证副本不受影响 |
| R7 | 非管理员调用 /api/admin/* 返回 403 | admin_username 变体（大小写、空白前后缀）fuzzing |
| R7 | is_admin=true 不泄露 admin_username 原值 | 遍历所有 public/auth 响应搜索配置值 |
| R8 | create/rename 后 username 全局唯一 | 并发 create/rename 随机变体 |
| R8 | 用户有项目时无法删除 | 随机分配 0..n 项目后删除，比较 owner 分布 |
| R8 | 改名后旧 token 在下次请求时 401 | 改名后重放旧 token；再创建旧用户名新用户后仍 401 |

## 5. 前端组件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| frontend/src/App.vue | 修改 | 设置弹窗两列布局、折叠按钮逻辑、复制按钮、管理员入口 |
| frontend/src/components/FieldsTab.vue | 修改 | 补 vuedraggable + 隐藏 code 列 |
| frontend/src/components/FormDesignerTab.vue | 修改 | 补 vuedraggable + 文案改为 Code（域名）+ 隐藏 code 列 |
| frontend/src/components/VisitsTab.vue | 修改 | 补 vuedraggable + 隐藏 code 列（如有） |
| frontend/src/components/CodelistsTab.vue | 修改 | 隐藏 code 列（如有） |
| frontend/src/components/UnitsTab.vue | 修改 | 隐藏 code 列（如有） |
| frontend/src/components/AdminView.vue | 新建 | 管理员用户管理界面 |

## 6. 后端文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| backend/src/config.py | 修改 | 新增 AdminConfig |
| config.yaml | 修改 | 新增 admin.username |
| backend/src/dependencies.py | 修改 | 新增 require_admin |
| backend/src/routers/admin.py | 新建 | auth/me + admin/* 路由 |
| backend/src/routers/projects.py | 修改 | 新增 POST /{id}/copy |
| backend/src/services/project_clone_service.py | 新建 | ProjectGraphLoader + ProjectCloneService |
| backend/src/services/import_service.py | 修改 | 新增 ProjectDbImportService + DatabaseMergeService |
| backend/src/services/user_admin_service.py | 新建 | UserAdminService |

## 7. 风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 伪管理员（知道用户名可登录） | 高 | 所有 admin API 后端 gate；文档明确弱安全声明 |
| 项目复制遗漏资源 | 高 | ProjectGraphLoader 独立于 export loader；集成测试覆盖全量图 |
| 整库合并产生脏数据 | 高 | 单一事务；预检 schema 兼容性；失败零变更 |
| 用户改名 token 漂移 | 高 | JWT 绑定 `user.id` + `username` 快照；失配即 401；admin 自改名 → 强制重登 |
| SQLite 长事务锁 | 中 | 预检后再开写事务；大文件加文件大小上限 200MB |
