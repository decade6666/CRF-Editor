# Tasks: simplify-readonly-tabs (v2)

## Phase 1: 前端 — 删除 3 个 Tab 文件

- [x] 1.1 删除 `frontend/src/components/CodelistsTab.vue`
- [x] 1.2 删除 `frontend/src/components/UnitsTab.vue`
- [x] 1.3 删除 `frontend/src/components/FieldsTab.vue`
- [x] 1.4 删除 `frontend/src/composables/useOrderableList.js`

## Phase 2: 前端 — App.vue 清理

- [x] 2.1 删除 App.vue 中 CodelistsTab、UnitsTab、FieldsTab 的 import 语句
- [x] 2.2 删除 App.vue 中 codelists、units、fields 三个 el-tab-pane
- [x] 2.3 收缩 LOCKED_TABS 为 ['designer']
- [x] 2.4 增加 activeTab sanitize watch 兜底逻辑（非法值回退 'info'）

## Phase 3: 前端 — FormDesignerTab 裁剪

- [x] 3.1 删除所有表单 CRUD 状态和函数（showAddForm, showEditForm, newFormName, newFormCode, editFormName, editFormCode, editFormTarget, selForms, addForm, delForm, batchDelForms, copyForm, openEditForm, updateForm, openAddForm）
- [x] 3.2 删除所有字段设计器状态和函数（showDesigner, selectedIds, deletingFieldIds, dragSrcId, dragOverIdx, fieldSearch, filteredFieldDefs, fieldDefs, codelists, units, usedDefIds, fieldItemRefs, selectedFieldId, editProp, isCreating, designerFieldTypes, DATE_FORMAT_OPTIONS 及所有相关函数）
- [x] 3.3 删除数据加载函数 loadFieldDefs, loadCodelists, loadUnits
- [x] 3.4 收缩 refreshKey watcher 为只调 loadForms() + loadFormFields()
- [x] 3.5 收缩 onMounted 为只调 loadForms()
- [x] 3.6 收缩 watch(projectId) 为只调 loadForms() 并重置 selectedForm/formFields
- [x] 3.7 删除模板中的工具栏按钮（新建、批量删除）
- [x] 3.8 删除模板中的表格 checkbox 列和操作列（编辑/删除/复制）
- [x] 3.9 删除 Word 预览区的「设计表单」按钮
- [x] 3.10 删除所有 el-dialog（新建表单、编辑表单、设计表单、快速新增字典、快速编辑字典、快速新增单位）
- [x] 3.11 删除面板拖拽调整相关代码（libraryWidth, propWidth, isLibResizing 等）
- [x] 3.12 清理 unused import（ElMessageBox, onBeforeUpdate, nextTick, reactive, genCode, genFieldVarName, truncRefs 等）

## Phase 4: 前端 — useApi.js 清理

- [x] 4.1 删除 useApi.js 中 genFieldVarName 函数定义和导出
- [x] 4.2 验证 genCode 是否仍被 VisitsTab 使用（若否则也删除）
- [x] 4.3 验证 truncRefs 是否仍被其他文件使用（若否则也删除）

## Phase 5: 后端 — 删除死路由

- [x] 5.1 删除 `backend/src/routers/codelists.py` 文件
- [x] 5.2 删除 `backend/src/routers/units.py` 文件
- [x] 5.3 裁剪 `backend/src/routers/fields.py`：仅保留 GET /api/projects/{project_id}/field-definitions 和 GET /api/forms/{form_id}/fields
- [x] 5.4 裁剪 `backend/src/routers/forms.py`：仅保留 GET /api/projects/{project_id}/forms 和 PUT /api/forms/{form_id}
- [x] 5.5 清理 `backend/main.py` 中 codelists_router 和 units_router 的 include_router

## Phase 6: 验证

- [x] 6.1 运行 `npm run build` 确认零错误零警告
- [x] 6.2 运行后端 `python main.py` 确认启动无报错
- [x] 6.3 浏览器验证：只有 info、designer、visits 三个 Tab 可见
- [x] 6.4 验证 FormDesignerTab 序号 el-input-number 可调整并保存
- [x] 6.5 验证 FormDesignerTab 选中表单后右侧 Word 预览正常
- [x] 6.6 验证 VisitsTab 预览正常
- [x] 6.7 验证导出 Word 正常
  - 2026-03-24 验证记录：浏览器点击导出后由 IDM 接管下载，导出文件已落地 `D:/下载/IDM下载/文档/通用表单_CRF_4.docx`（58496 bytes）。
- [x] 6.8 验证 isLocked 机制行为不变
  - 2026-03-24 验证记录：创建临时项目 `LOCK_TEST_TEMP` 并将 `source` 置为 `template_import` 后，浏览器现场出现锁定告警，且 Tab 仅剩 `项目信息`、`访视`，`表单` Tab 被隐藏；验证后已删除该临时项目。
- [x] 6.9 无 console 错误
