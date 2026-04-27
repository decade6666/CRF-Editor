# Proposal: 导入锁定模式 (Import Lock Mode)

## Change ID
`import-lock-mode`

## Summary
为 CRF-Editor 实现「导入锁定模式」：项目通过 Word 或模板导入表单后，进入受限编辑状态，
仅开放访视管理（CRUD）与访视内表单排序，其余设计类功能（字段、字典、单位、表单设计）全部禁用。

---

## Research Summary

### Discovered Constraints

**Hard constraints（不可违背）**:
- `Project` 模型当前无 `source` 字段，需新增列（SQLite ALTER TABLE 兼容）
- `ProjectResponse` schema 需暴露 `source` 字段供前端判断锁定状态
- 无 Alembic 迁移工具：需在 `database.py` 的 `create_all` 或启动时用原生 SQL 兼容旧库
- 前端无全局状态管理（Vuex/Pinia），锁定状态通过 `selectedProject.source` 就地计算
- 后端无统一中间件层，权限检查须在各 router 内联实现

**Soft constraints（惯例）**:
- 后端权限拒绝统一使用 `HTTPException(403, ...)`
- 前端 Tab 控制用 `v-if` / `:disabled` 配合计算属性 `isLocked`
- 缓存失效通过 `api.clearAllCache()` + `refreshKey.value++` 触发
- 新字段 default 值为 `"manual"`，保持旧数据兼容

### Dependencies (cross-module)

| 模块 | 依赖关系 |
|------|----------|
| `backend/src/models/project.py` | 新增 `source` 字段，影响 schema/repo/router |
| `backend/src/schemas/project.py` | `ProjectResponse` 需暴露 `source` |
| `backend/src/routers/import_docx.py` | `execute` 端点需在成功后设置 `project.source` |
| `backend/src/routers/import_template.py` | `execute` 端点需在成功后设置 `project.source` |
| `backend/src/routers/fields.py` | 写操作需检查 `project.source != "manual"` |
| `backend/src/routers/codelists.py` | 同上 |
| `backend/src/routers/units.py` | 同上 |
| `backend/src/routers/forms.py` | 表单创建/修改/字段增删需检查锁定 |
| `frontend/src/App.vue` | 计算 `isLocked`，控制 Tab 显隐与按钮禁用 |

### Risks & Mitigations

| 风险 | 缓解方案 |
|------|----------|
| 旧 SQLite 库无 `source` 列 → 启动崩溃 | 用 `ALTER TABLE ... ADD COLUMN` + `IF NOT EXISTS` 兼容 |
| 模板导入会 `created_field_definitions`/`merged_codelists`：锁定后能否继续导入？ | **待用户确认**（见 Open Questions） |
| 前端 Tab 隐藏后用户直接 fetch API 绕过 | 后端 403 兜底，双重防护 |
| `visit_form` 顺序调整（`PUT /visits/{id}/forms/{form_id}`）应保留 | 访视内表单排序属于允许操作，不受限 |

### Success Criteria

- [ ] 手动新建项目：所有 Tab 和功能正常，不受影响
- [ ] Word/模板导入后：`project.source` 被设置为非 `"manual"` 值
- [ ] 锁定项目：字段/字典/单位/表单设计 Tab 不可见或不可操作
- [ ] 锁定项目：访视增删改、访视内表单增删/排序正常工作
- [ ] 后端：对锁定项目的字段/字典/单位/表单设计写操作返回 `403 Forbidden`
- [ ] 旧数据库兼容：存量项目自动视为 `"manual"`（可全功能编辑）

---

## Open Questions（需用户确认）

1. **重复导入**：锁定项目是否仍允许继续「导入Word」或「导入模板」（追加更多表单）？
   - 若允许：导入按钮保留，但导入行为本身会创建 field_definitions/codelists
   - 若禁止：导入按钮在锁定状态下隐藏，项目一旦导入后不可再追加

2. **项目信息 Tab**：锁定后，「项目信息」（名称、版本、试验名称等元数据）是否仍可编辑？

---

## Proposed Implementation Plan

### Phase 1: Backend — 数据模型与 Schema

**文件**: `backend/src/models/project.py`
- 新增 `source: Mapped[str]` 列，default `"manual"`，可选值：`manual | word_import | template_import`

**文件**: `backend/src/schemas/project.py`
- `ProjectResponse` 新增 `source: str = "manual"` 字段

**文件**: `backend/src/database.py` 或 `backend/main.py`
- 启动时执行兼容迁移：`ALTER TABLE project ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'`（已有列则跳过）

### Phase 2: Backend — 导入端点标记 source

**文件**: `backend/src/routers/import_docx.py`
- `execute_docx_import` 成功后：`project.source = "word_import"; session.flush()`

**文件**: `backend/src/routers/import_template.py`
- `execute_import` 成功后：`project.source = "template_import"; session.flush()`

### Phase 3: Backend — 路由锁定守卫

新增共享工具函数（`backend/src/utils.py` 或内联）：
```python
def assert_project_editable(project: Project) -> None:
    if project.source != "manual":
        raise HTTPException(403, "该项目为导入项目，不允许修改字段/表单设计")
```

**需要加守卫的端点**（POST/PUT/DELETE）：
- `routers/fields.py`：所有写操作
- `routers/codelists.py`：所有写操作
- `routers/units.py`：所有写操作
- `routers/forms.py`：表单创建、删除、编辑；form_field 增删改

**明确不加守卫的端点**（允许操作）：
- `routers/visits.py`：全部（CRUD + 排序）
- `routers/visits.py`: `PUT /visits/{id}/forms/{form_id}`（访视内表单排序）
- `routers/visits.py`: `POST/DELETE /visits/{id}/forms/{form_id}`（访视内表单增删关联）
- `routers/export.py`：导出不受限

### Phase 4: Frontend — UI 锁定

**文件**: `frontend/src/App.vue`
- 新增计算属性：`const isLocked = computed(() => selectedProject.value?.source !== 'manual')`
- Tab 控制：
  - `codelists` Tab：`v-if="!isLocked"`
  - `units` Tab：`v-if="!isLocked"`
  - `fields` Tab：`v-if="!isLocked"`
  - `designer` Tab：`v-if="!isLocked"`
- 锁定时在侧边栏项目名旁显示锁定标记（`<el-tag size="small">只读</el-tag>` 或图标）
- 导入按钮处理（依用户决策）

---

## User Decisions (Confirmed)

| 问题 | 用户决策 |
|------|----------|
| 锁定后是否允许继续导入 Word/模板追加表单 | **允许**：导入按钮保留，仍可追加表单 |
| 锁定后「项目信息」Tab 是否可编辑 | **可以编辑**：元数据不受锁定影响 |

这两个决策已纳入实现计划。

