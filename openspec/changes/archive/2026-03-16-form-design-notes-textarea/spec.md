# Spec: 表单设计备注文本框

## 变更 ID
`form-design-notes-textarea`

## 需求摘要

在表单设计界面（`showDesigner` 对话框）右侧属性编辑面板的**下方**，增加一个"表单设计备注"大文本框。

- 文本框可调节显示高度（用户拖拽 resize）
- 高度跨会话持久化（localStorage）
- 内容自动保存（防抖 debounce，500ms）
- **仅在表单设计界面内显示**，其他页面不可见

---

## 约束集

### HARD（不可违背）

| # | 约束 | 来源 |
|---|------|------|
| H1 | 数据库新增 `form.design_notes` 列，类型 TEXT，可为 NULL | 业务需求 |
| H2 | 迁移方式：在 `database.py` 中添加 `_migrate_add_design_notes(engine)` 函数，在 `init_db()` 中调用 | 项目迁移规范（无 Alembic） |
| H3 | ORM 模型 `Form` 新增字段 `design_notes: Mapped[Optional[str]]`（`Text`，`nullable=True`） | SQLAlchemy 一致性 |
| H4 | `FormUpdate` schema 新增 `design_notes: Optional[str] = None` | FastAPI 路由自动处理 |
| H5 | `FormResponse` schema 新增 `design_notes: Optional[str] = None` | 前端读取备注内容 |
| H6 | `copy_form` 路由（`POST /forms/{form_id}/copy`）必须将 `design_notes` 复制到新表单 | 数据完整性 |
| H7 | 文本框**仅在** `showDesigner` 对话框内显示，不得出现在其他视图 | 用户需求原文 |
| H8 | 文本框插入位置：属性面板 `<div>`（`flexDirection:column`）内，在所有 `v-if/v-else-if/v-else` 属性区块之后 | FormDesignerTab.vue 结构 |

### SOFT（推荐，可偏移）

| # | 约束 | 说明 |
|---|------|------|
| S1 | 高度 resize 方式：CSS `resize: vertical`（原生浏览器拖拽） | 最简方案，无需 JS |
| S2 | 高度持久化：`crf_notesHeight` localStorage key，随 `watch()` + `localStorage.setItem()` 保存 | 与现有 `crf_propWidth`/`crf_libraryWidth` 模式一致 |
| S3 | 保存策略：debounce 自动保存（500ms），无需手动点击"保存" | 备注为自由文本，频繁点击保存影响体验 |
| S4 | 默认高度：120px；最小高度：60px | UI 视觉平衡 |
| S5 | 标签：`表单设计备注`；placeholder：`在此记录表单设计说明、注意事项…` | 提示清晰 |
| S6 | 使用 `el-input type="textarea"` + `autosize: false`（固定高度，由 CSS resize 控制） | Element Plus 一致性 |

### OPEN（待确认，有默认值）

| # | 问题 | 默认决策 | 理由 |
|---|------|----------|------|
| O1 | `design_notes` 是否进入 Word 导出 | **否（本期不做）** | 导出逻辑独立，不影响主功能 |
| O2 | API 请求防重（快速切换表单时）| 切换 `selectedForm` 时取消未发出的 debounce | 防止将 A 表单备注写入 B 表单 |

---

## 影响范围

### 后端

| 文件 | 改动 |
|------|------|
| `backend/src/models/form.py` | 新增 `design_notes` 字段 |
| `backend/src/schemas/form.py` | `FormUpdate` + `FormResponse` 新增字段 |
| `backend/src/routers/forms.py` | `copy_form` 端点复制 `design_notes` |
| `backend/src/database.py` | `_migrate_add_design_notes()` + `init_db()` 调用 |

### 前端

| 文件 | 改动 |
|------|------|
| `frontend/src/components/FormDesignerTab.vue` | 新增备注区块 + reactive state + debounce 保存逻辑 |

### 数据库

| 操作 | SQL |
|------|-----|
| 新增列 | `ALTER TABLE "form" ADD COLUMN design_notes TEXT` |
| 索引 | 无需索引（非查询条件） |

---

## 可验证成功判据

| # | 判据 | 验证方式 |
|---|------|----------|
| V1 | 打开表单设计界面，右侧面板底部显示备注文本框 | 手动测试 |
| V2 | 文本框可通过底部拖拽调整高度 | 手动测试 |
| V3 | 刷新页面后，文本框高度与内容均恢复 | 手动测试（localStorage + API） |
| V4 | 500ms 内停止输入后，备注自动保存至服务端 | Network DevTools |
| V5 | 切换到其他界面（访视、字段库等），备注文本框不可见 | 手动测试 |
| V6 | 复制表单后，新表单的 `design_notes` 与原表单一致 | API 响应验证 |
| V7 | 旧数据库启动后自动补列，不崩溃 | 使用旧 DB 文件启动后端 |
| V8 | PUT `/api/forms/{id}` 携带 `design_notes` 参数，后端正确持久化 | pytest 集成测试 |
