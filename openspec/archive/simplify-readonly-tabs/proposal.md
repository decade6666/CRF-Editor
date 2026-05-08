# Proposal: simplify-readonly-tabs (v2)

## 变更摘要

删除 `CodelistsTab`、`UnitsTab`、`FieldsTab` 三个 Tab（整体移除，非只读化）；`FormDesignerTab` 仅保留表单列表的 `order_index` 序号调整 + 右侧 Word 只读预览，删除所有表单 CRUD 和字段设计器。同步清理前后端死代码。

**范围**：前端删除 3 个 .vue 文件 + 1 个 composable + 大幅裁剪 FormDesignerTab + App.vue；后端清理死路由。

---

## 发现的约束集

### 硬约束（不可违反）

| # | 约束 | 来源 |
|---|------|------|
| H1 | 后端模型/repo/service 不可删除（导入/导出/VisitsTab 预览依赖 codelist、unit、field_definition） | Codex 分析 |
| H2 | `GET /api/forms/{form_id}/fields` 必须保留（VisitsTab 预览 + Word 预览依赖） | Codex 分析 |
| H3 | `PUT /api/forms/{form_id}` 必须保留（updateFormOrder 依赖） | 序号调整核心 |
| H4 | `GET /api/projects/{project_id}/forms` 必须保留（FormDesignerTab + VisitsTab 依赖） | 表单列表加载 |
| H5 | `refreshKey` / `isLocked` inject 在 App.vue 已有，保留机制不变 | 全局状态 |
| H6 | `api` composable 仅允许删除死代码导出（genFieldVarName, truncRefs） | 全局共享 |
| H7 | Word 预览渲染函数（renderCtrl, renderCellHtml, getInlineRows, renderGroups, needsLandscape）必须保留 | Word 预览面板 |
| H8 | 导入路由（import-template, import-docx）不可删除 | 导入功能仍在 |

### 软约束（惯例/风格）

| # | 约束 | 来源 |
|---|------|------|
| S1 | 删除操作后去掉对应的 unused import | 代码质量规范 |
| S2 | App.vue 增加 activeTab sanitize 兜底逻辑 | Codex 建议 |
| S3 | LOCKED_TABS 收缩为只含 'designer' | Tab 减少 |

### 依赖关系

| 删除目标 | 级联清理 |
|----------|----------|
| CodelistsTab.vue | 文件删除 |
| UnitsTab.vue | 文件删除 |
| FieldsTab.vue | 文件删除 |
| useOrderableList.js | 文件删除（仅被上述 2 个 Tab 使用） |
| genFieldVarName (useApi.js) | 导出删除（仅被 FieldsTab + FormDesigner 设计器使用） |
| truncRefs (useApi.js) | 导出删除（验证后确认无引用） |

---

## 前端变更清单

### 删除文件
- `frontend/src/components/CodelistsTab.vue`
- `frontend/src/components/UnitsTab.vue`
- `frontend/src/components/FieldsTab.vue`
- `frontend/src/composables/useOrderableList.js`

### App.vue
- 删除 3 个 import（CodelistsTab, UnitsTab, FieldsTab）
- 删除 3 个 `<el-tab-pane>`（codelists, units, fields）
- LOCKED_TABS 收缩（移除 codelists, units, fields）
- 增加 activeTab sanitize：值不在合法集合时回退 'info'

### FormDesignerTab.vue

**Script 删除**：
- 状态：`showAddForm`, `showEditForm`, `showDesigner`, `newFormName`, `newFormCode`, `editFormName`, `editFormCode`, `editFormTarget`, `selForms`, `selectedIds`, `deletingFieldIds`, `dragSrcId`, `dragOverIdx`, `fieldSearch`, `filteredFieldDefs`, `fieldDefs`, `codelists`, `units`
- 所有字段设计器相关状态（selectedFieldId, editProp, isCreating, designerFieldTypes, DATE_FORMAT_OPTIONS, 快速新增字典/单位相关状态）
- 函数：`addForm`, `delForm`, `batchDelForms`, `copyForm`, `openEditForm`, `updateForm`, `openAddForm`, `confirmFormChange`, `addField`, `removeField`, `batchDelete`, `toggleInline`, `onDragStart`, `onDragOver`, `onDragLeave`, `onDrop`, `handleFieldKeydown`, `newField`, `addLogRow`, `selectField`, `saveFieldProp`, 所有快速新增/编辑字典/单位函数
- 数据加载：`loadFieldDefs`, `loadCodelists`, `loadUnits`
- Computed：`usedDefIds`, `fieldIndexMap`
- Hook：`onBeforeUpdate`, `fieldItemRefs`
- 面板拖拽调整相关（libraryWidth, propWidth, isLibResizing, isPropResizing 等）

**Script 保留**：
- `forms`, `searchForm`, `filteredForms`, `selectedForm`, `formFields`
- `loadForms`, `reloadForms`, `loadFormFields`
- `updateFormOrder` + `ElMessage`（序号调整）
- 渲染函数：`renderCtrl`, `renderCellHtml`, `getInlineRows`, `renderGroups`, `needsLandscape`
- `refreshKey` inject + watch
- `onMounted`（收缩为只调 `loadForms()`）
- `watch(projectId)`（收缩为只调 `loadForms()`）

**Template 删除**：
- 工具栏：新建表单按钮、批量删除按钮
- 表单表格：checkbox 列、操作列（编辑/删除/复制）
- 右侧 Word 预览区的「设计表单」按钮
- 所有 `<el-dialog>`（新建表单、编辑表单、设计表单、快速新增字典、快速编辑字典、快速新增单位）

**Template 保留**：
- 表单列表表格（含搜索框、序号 el-input-number、表单名称、Code 列）
- 右侧 Word 预览面板（只读渲染）

### useApi.js
- 删除 `genFieldVarName` 导出

---

## 后端变更清单

### 可整体删除的 router 文件
- `backend/src/routers/codelists.py`（所有路由死亡）
- `backend/src/routers/units.py`（所有路由死亡）

### fields.py router 中删除的路由
- `POST /api/projects/{project_id}/field-definitions`
- `PUT /api/projects/{project_id}/field-definitions/{fd_id}`
- `GET /api/field-definitions/{fd_id}/references`
- `DELETE /api/field-definitions/{fd_id}`
- `POST /api/projects/{project_id}/field-definitions/batch-delete`
- `POST /api/projects/{project_id}/field-definitions/batch-references`
- `POST /api/projects/{project_id}/field-definitions/reorder`（已是死代码）
- `POST /api/field-definitions/{fd_id}/copy`
- `POST /api/forms/{form_id}/fields`
- `PUT /api/form-fields/{ff_id}`
- `DELETE /api/form-fields/{ff_id}`
- `PATCH /api/form-fields/{ff_id}/inline-mark`
- `POST /api/forms/{form_id}/fields/reorder`
- `POST /api/forms/{form_id}/fields/batch-delete`

### fields.py router 中保留的路由
- `GET /api/projects/{project_id}/field-definitions`（导入预览可能引用）
- `GET /api/forms/{form_id}/fields`（VisitsTab 预览 + Word 预览）

### forms.py router 中删除的路由
- `POST /api/projects/{project_id}/forms`
- `DELETE /api/forms/{form_id}`
- `GET /api/forms/{form_id}/references`
- `POST /api/projects/{project_id}/forms/batch-delete`
- `POST /api/projects/{project_id}/forms/batch-references`
- `POST /api/forms/{form_id}/copy`
- `POST /api/projects/{project_id}/forms/reorder`（已是死代码）

### forms.py router 中保留的路由
- `GET /api/projects/{project_id}/forms`
- `PUT /api/forms/{form_id}`（updateFormOrder 依赖）

### 不可删除
- 所有 models/、repositories/、services/、schemas/ —— 导入/导出仍依赖

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| activeTab 值残留在已删 tab 名上 | App.vue 增加 sanitize 兜底 |
| 后端删路由时误删 GET /api/forms/{form_id}/fields | 明确标注保留清单 |
| 后端 router 文件删除后 main.py include_router 残留 | 同步清理 main.py |
| useApi.js 删 genFieldVarName 后其他文件仍引用 | Codex 确认仅被删除范围引用 |
| FormDesignerTab onMounted/watch 中残留已删函数调用 | 收缩为只调 loadForms() |

---

## 成功判据

1. CodelistsTab、UnitsTab、FieldsTab 三个 Tab 完全不可见
2. FormDesignerTab 只显示表单列表（含序号调整）+ 右侧 Word 预览
3. 无任何表单新建/编辑/删除/复制按钮
4. 无字段设计器入口
5. `npm run build` 零错误零警告
6. 后端启动无报错
7. VisitsTab 预览正常、导出正常
8. 无 console 错误
9. `isLocked` 机制行为不变
