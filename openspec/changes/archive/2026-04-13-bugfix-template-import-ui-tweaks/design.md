# Design: 模板导入修复与 UI 微调

## 修改总览

| # | 文件 | 改动 | 行数 |
|---|------|------|------|
| 1 | `backend/src/services/import_service.py` | try/except fallback 排序 | ~8 行 |
| 2 | `frontend/src/App.vue` | 移除 `v-if="isAdmin"` | 1 行 |
| 3 | （合并到 #2） | Issue 2 解决后自动对齐 | 0 行 |
| 4 | 验证项 | 确认拖拽序号已正常工作 | 0 行 |
| 5 | `frontend/src/components/FormDesignerTab.vue` | 隐藏变量名、可编辑默认值 | ~8 行 |

## Issue 1: 模板导入 order_index 兼容

**文件**: `backend/src/services/import_service.py:118-123`

**当前代码**:
```python
# 获取排序后的表单字段列表
form_fields = list(tmpl.scalars(
    select(FormField)
    .where(FormField.form_id == form_id)
    .order_by(FormField.order_index)
).all())
```

**修改为**:
```python
# 获取排序后的表单字段列表（兼容无 order_index 列的旧模板）
try:
    form_fields = list(tmpl.scalars(
        select(FormField)
        .where(FormField.form_id == form_id)
        .order_by(FormField.order_index)
    ).all())
except OperationalError:
    form_fields = list(tmpl.scalars(
        select(FormField)
        .where(FormField.form_id == form_id)
        .order_by(FormField.id)
    ).all())
```

需在文件顶部导入:
```python
from sqlalchemy.exc import OperationalError
```

## Issue 2 & 3: 导入按钮可见性与对齐

**文件**: `frontend/src/App.vue:788`

**当前**: `<div v-if="isAdmin" style="flex:1;display:flex;flex-direction:column;gap:8px">`  
**改为**: `<div style="flex:1;display:flex;flex-direction:column;gap:8px">`

仅删除 `v-if="isAdmin"`。后端 `import_project_db` 和 `import_database_merge` 均使用 `get_current_user`（非 `require_admin`），权限已开放。

## Issue 4: 拖拽序号更新（验证项）

**分析**: `useSortableTable.js:33` 已在拖拽后更新 `order_index`，`reloadFn` 从服务端获取更新后数据。理论上应正常工作。

**操作**: 实施 Issue 1-3 和 5 后，手动验证字段页和表单页的拖拽序号是否即时更新。如仍有问题，再定位 `reloadFn` 时序。

## Issue 5: 快速编辑弹窗修改

**文件**: `frontend/src/components/FormDesignerTab.vue`

### 5a. quickEditProp 增加 default_value（line 387）

**当前**:
```javascript
const quickEditProp = reactive({ label: '', field_type: '', bg_color: '', text_color: '', inline_mark: false })
```

**改为**:
```javascript
const quickEditProp = reactive({ label: '', field_type: '', bg_color: '', text_color: '', inline_mark: false, default_value: '' })
```

### 5b. openQuickEdit 初始化 default_value（line 390-396）

在 `Object.assign(quickEditProp, { ... })` 中增加:
```javascript
default_value: ff.default_value || ''
```

### 5c. saveQuickEdit payload 增加 default_value（line 402）

**当前**:
```javascript
const payload = { label_override: quickEditProp.label, bg_color: quickEditProp.bg_color || null, text_color: quickEditProp.text_color || null, inline_mark: quickEditProp.inline_mark ? 1 : 0 }
```

**改为**:
```javascript
const payload = { label_override: quickEditProp.label, bg_color: quickEditProp.bg_color || null, text_color: quickEditProp.text_color || null, inline_mark: quickEditProp.inline_mark ? 1 : 0, default_value: quickEditProp.default_value || null }
```

### 5d. 模板：隐藏变量名行（line 703）

**删除**:
```html
<el-form-item v-if="quickEditField?.field_definition?.variable_name" label="变量名"><el-input :model-value="quickEditField.field_definition.variable_name" disabled /></el-form-item>
```

### 5e. 模板：默认值改为可编辑（line 711）

**当前**:
```html
<el-form-item v-if="quickEditField?.default_value != null && quickEditField.default_value !== ''" label="默认值"><el-input :model-value="quickEditField.default_value" disabled type="textarea" :autosize="{ minRows: 1, maxRows: 3 }" /></el-form-item>
```

**改为**:
```html
<el-form-item label="默认值"><el-input v-model="quickEditProp.default_value" type="textarea" :autosize="{ minRows: 1, maxRows: 3 }" /></el-form-item>
```

移除 `v-if` 条件（始终显示，即使当前为空也可填写），改为 `v-model` 双向绑定。
