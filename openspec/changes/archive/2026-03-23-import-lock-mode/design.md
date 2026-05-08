## Context

CRF-Editor 是 FastAPI + Vue 3 的前后端分离应用。当前所有项目均可自由编辑字段/字典/单位/表单设计。随着 Word 和模板导入功能上线，用户可以将外部 CRF 结构导入为项目，但后续直接编辑设计结构会破坏与来源文档的一致性。

**当前约束**：
- `Project` 模型无 `source` 字段，无法区分手动建立与导入建立
- 无 Alembic 迁移，变更通过 `inspect + ALTER TABLE` 原生 SQL 兼容旧库
- 前端无全局状态管理（Vuex/Pinia），状态集中在 `App.vue`
- 模板导入服务 `ImportService.get_template_projects` 使用 `select(Project)` 全实体查询，老模板库无 `source` 列时会崩溃

---

## Goals / Non-Goals

**Goals:**
- 为 `Project` 模型增加 `source` 字段，记录项目创建来源
- 导入成功后自动标记 `source`（第一次导入获胜，之后不再覆写）
- 锁定项目（`source != "manual"`）的 design 类写操作返回 `403 Forbidden`
- 前端隐藏被锁定项目的 design 类 Tab，并展示锁定状态提示
- 旧数据库兼容：存量项目统一视为 `manual`（可全功能编辑）
- 修复模板库全实体查询导致的老库兼容问题

**Non-Goals:**
- 不支持「解锁」操作（无接口将 `source` 从非 `manual` 回写为 `manual`）
- 不支持按项目级别配置哪些操作被锁定
- 不删除锁定项目（`delete_project` 不受限制）
- 不迁移外部模板库（只读，不加 `source` 列）
- 不追溯旧项目实际创建方式（老库统一 `manual`）

---

## Decisions

### D1: source 字段类型与值域

**决策**：`VARCHAR(32) NOT NULL DEFAULT 'manual'`，值域在 Python 层用 `Literal["manual", "word_import", "template_import"]` 约束，不在 SQLite 加 `CHECK`。

**理由**：SQLite `CHECK` 约束对旧库的 `ALTER TABLE ADD COLUMN` 兼容性较差（SQLite 3.25 以前不验证），且现有迁移风格不依赖 DB 级约束。Python/Pydantic 层已足够。

**备选方案**：Python `Enum` 类型 → 额外序列化开销，且未来扩展值域需改 Enum；`Literal` 更轻量。

---

### D2: source 不暴露到 ProjectCreate / ProjectUpdate

**决策**：`source` 仅出现在 `ProjectResponse`，不加入 `ProjectCreate` / `ProjectUpdate`。

**理由**：若 `ProjectUpdate` 含 `source`，用户可通过更新项目接口绕过锁定，将任意导入项目的 `source` 改回 `manual`。后端是唯一可信的 `source` 写入方。

---

### D3: source 标记使用条件更新（第一次导入获胜）

**决策**：导入成功后执行 `UPDATE project SET source=:new_source WHERE id=:id AND source='manual'`，而不是直接赋值。

**理由**：若项目已是 `word_import` 后又追加模板导入，或并发导入场景，条件更新确保 `source` 只被第一次导入来源写入，不被后续导入覆盖。语义清晰且幂等。

---

### D4: 守卫位置——共享工具函数，非全局中间件

**决策**：新建 `backend/src/routers/_project_guard.py`，提供以资源类型分类的守卫函数；在各 router 入口显式调用，不做全局中间件。

**理由**：需求明确允许多类写操作（访视 CRUD、导入、项目元数据、导出）绕过锁定。全局中间件会误拦截这些允许操作，难以维护豁免列表。共享函数保持 403 消息统一，同时让每个 router 的锁定意图可读可测。

**守卫顺序**：「确认资源存在 + 归属合法」→「守卫检查 403」→「业务校验」→「写入」。

---

### D5: 模板库兼容——列选查询

**决策**：`ImportService.get_template_projects` 改为 `select(Project.id, Project.name, Project.version, ...)` 列选，不加载全实体。

**理由**：模板库是只读外部文件，不应被本项目迁移。通过列选绕过模型层对 `source` 的依赖，彻底规避老模板库无 `source` 列的崩溃。

---

### D6: 前端 isLocked 计算属性

**决策**：`isLocked = computed(() => !!selectedProject.value && selectedProject.value.source !== 'manual')`

**理由**：原 proposal 的 `selectedProject.value?.source !== 'manual'` 在无选中项目时返回 `undefined !== 'manual'` = `true`，导致无项目时 design Tab 被误隐藏（虽然实际无影响，但语义不正确）。加 `!!selectedProject.value` 前置判断保证语义准确。

---

### D7: 锁定 Tab 用 v-if 隐藏而非 disabled

**决策**：锁定状态用 `v-if="!isLocked"` 隐藏 Tab，不用 `:disabled`。

**理由**：导入项目与手动项目是两种不同操作模式，隐藏 Tab 减少认知负担；用户无需面对灰化的不可用选项。配合锁定提示横幅告知原因，不会造成困惑。

---

## Risks / Trade-offs

| 风险 | 缓解方案 |
|------|----------|
| 老模板库无 `source` 列导致模板预览崩溃 | D5：列选查询；与 D1 模型变更同一阶段部署 |
| `source` 通过 `ProjectUpdate` 被绕过 | D2：schema 层隔离，`ProjectUpdate` 不含 `source` |
| 前端隐藏 Tab 不够，用户直接调 API | D4：后端 403 兜底，双重防护 |
| 存量已导入项目（迁移前）变成 `manual` | 无法追溯，已知限制；文档说明 |
| Tab 切换到锁定项目时 activeTab 仍指向 design Tab | 前端 watch selectedProject，锁定时 activeTab 重置为 'info' |
| 导入失败一半时 source 被错误标记 | D3 条件更新在导入服务返回成功后才执行；DB 事务回滚确保一致 |

---

## Migration Plan

1. 所有文件变更在同一发布版本中部署（不分批上线）
2. 应用启动时 `init_db()` 自动执行 `_migrate_add_project_source()`，存量项目 `source` 回填为 `'manual'`
3. 无需停机，SQLite `ALTER TABLE ADD COLUMN` 是在线操作
4. 回滚：删除 `source` 列（SQLite 不支持 `DROP COLUMN`，需重建表）；实际上删列风险低，更建议通过 `source` 守卫逻辑的 feature flag 回退

---

## Open Questions

（已在 proposal User Decisions 中全部确认，无待决问题）
