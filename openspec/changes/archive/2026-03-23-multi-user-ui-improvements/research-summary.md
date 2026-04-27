# Research Summary — multi-user-ui-improvements

## Codebase Snapshot

### Backend Architecture
- FastAPI + SQLAlchemy ORM + SQLite（单库）
- 当前无任何认证机制，所有 API 无鉴权
- `get_engine()` 全局单例，数据库路径来自 `config.yaml`
- `get_session()` / `get_read_session()` 作为 FastAPI Depends
- 配置: `config.py` — `get_config()` LRU缓存单例，`update_config()` 线程锁写
- 迁移: `database.py` — `init_db()` 含多个 `_migrate_*` 函数，启动时运行

### Frontend Architecture
- Vue 3 + Vite + Element Plus + vuedraggable
- 无 vue-router，无 Pinia/Vuex
- `App.vue` 单文件管理所有状态（projects, selectedProject, activeTab）
- 子组件通过 `props` + `inject('refreshKey')` 通信
- API 调用封装在 `composables/useApi.js`（含 `api.cachedGet` 缓存）
- 样式: 内联 style，CSS 变量（`--color-*`），暗色模式 via `data-theme`

### Key Files for Each Requirement

| 需求 | 关键文件 |
|------|----------|
| 需求1 多用户 | `backend/main.py`, `backend/src/database.py`, `backend/src/config.py`, `frontend/src/App.vue` |
| 需求2 布局 | `frontend/src/components/ProjectInfoTab.vue` L57（移动试验名称 form-item） |
| 需求3 tooltip | `frontend/src/components/CodelistsTab.vue` L281（`<b>{{ selected.name }}</b>`） |
| 需求4 样式 | `frontend/src/components/CodelistsTab.vue` L305-306（编码值/标签 span style） |
| 需求5 倒序 | `frontend/src/components/CodelistsTab.vue` L295（draggable v-model） |
| 需求6 排序图标 | `CodelistsTab.vue`, `UnitsTab.vue`, `FieldsTab.vue`, `VisitsTab.vue`, `FormDesignerTab.vue` |
| 需求7 删除按钮 | `frontend/src/App.vue` L414（`.del-btn` span） |
| 需求8 复制 | `backend/src/routers/projects.py`（新增 POST /copy），`frontend/src/App.vue` L410 |

### Current Order Index Pattern
- `el-input-number` 显示/编辑 `order_index`，`@change` 触发 PUT API
- `filteredXxx` computed 用于搜索过滤，可在此叠加排序
- `draggable` 用于拖拽排序，`@end` 触发 reorder API

### Project Copy — Related Models
- Project → Form → FormField（field_definition_id FK）
- Project → FieldDefinition（codelist_id FK, unit_id FK）
- Project → CodeList → CodeListOption
- Project → Unit
- Project → Visit → VisitForm（form_id FK）
- 所有 FK 均在同一项目内，复制时需建立 old_id → new_id 映射表

### Multi-user — Engine Per User Pattern
```python
# 伪代码
_engines: dict[str, Engine] = {}

def get_user_engine(username: str) -> Engine:
    if username not in _engines:
        db_path = f"data/{username}.db"
        engine = create_engine(f"sqlite:///{db_path}", ...)
        # enable WAL, FK
        _engines[username] = engine
        init_db_for_engine(engine)  # 运行迁移
    return _engines[username]
```
