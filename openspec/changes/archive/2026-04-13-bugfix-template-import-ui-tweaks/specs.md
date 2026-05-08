# Specs: 模板导入修复与 UI 微调

## Issue 1: 模板导入预览报错 `form_field.order_index`

**现象**: GET `/api/projects/{id}/import-template/form-fields?form_id=98` → 500  
**根因**: `import_service.py:122` 用 `FormField.order_index` 排序，但旧模板 `.db` 的 `form_field` 表无此列  
**约束**:
- 不可修改模板 `.db` 文件（外部只读资源）
- 必须兼容新旧两种模板 schema
- 优先按 `order_index` 排序，缺失时 fallback 为 `FormField.id`

**验收**: 旧模板（无 `order_index` 列）和新模板（有 `order_index` 列）均可正常预览

## Issue 2: 设置界面"导入项目/导入数据库"对所有用户可见

**现象**: `App.vue:788` 用 `v-if="isAdmin"` 限制导入按钮仅 admin 可见  
**需求**: 所有登录用户都可见导入按钮  
**约束**:
- 后端 `import_template.py` 用 `verify_project_owner`（非 admin 限定），无需改后端
- 后端 `project_import_service.py` 的导入项目/数据库接口需确认权限

**验收**: 非 admin 用户能看到并使用"导入项目"和"导入数据库"按钮

## Issue 3: 设置界面导入导出按钮对齐

**现象**: 导入按钮被 `v-if="isAdmin"` 包裹，非 admin 时仅显示左列（导出），布局不对称  
**约束**: Issue 2 修复后，两列 flex:1 并排即自然对齐  
**验收**: 导出与导入按钮左右两列等宽对齐

## Issue 4: 字段/表单拖拽后自动更新序号

**现象**: 用户报告拖拽重排后序号列未即时更新  
**现状分析**:
- `useSortableTable.js:33` 已在拖拽后立即更新 `order_index`
- `reloadFn` 从服务器重载数据，服务器端 `reorder_batch` 正确写入连续序号
- 理论上应正常工作，需实际验证

**约束**:
- 不改变 `useSortableTable.js` 的核心逻辑
- 如有问题，优先排查 `reloadFn` 是否覆盖了本地更新

**验收**: FieldsTab 和 FormDesignerTab 的表单列表拖拽后，序号列立即显示正确的连续编号

## Issue 5: 预览弹窗隐藏变量名、允许修改默认值

**现象**: `FormDesignerTab.vue:699-717` 快速编辑弹窗中，变量名可见（disabled），默认值可见但不可编辑（disabled）  
**需求**: 隐藏变量名行；默认值改为可编辑  
**约束**:
- 后端 `FormFieldUpdate` schema 已含 `default_value: Optional[str]`，无需改后端
- `saveQuickEdit` payload 需添加 `default_value`
- `quickEditProp` reactive 需添加 `default_value` 属性
- 默认值显示条件保持不变（仅在有值时显示），但改为始终显示以便新增

**验收**: 快速编辑弹窗无"变量名"行；默认值可编辑并保存成功
