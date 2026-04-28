# Design: simplify-readonly-tabs (v2)

## 策略

删除型重构——删除 3 个 Tab 文件、裁剪 FormDesignerTab、清理后端死路由。不新增功能代码，仅增加 activeTab sanitize 兜底。

## 前端设计

### 删除文件（4 个）
- `CodelistsTab.vue` — 整体删除
- `UnitsTab.vue` — 整体删除
- `FieldsTab.vue` — 整体删除
- `useOrderableList.js` — 整体删除（无其他调用方）

### App.vue 改动

1. 删除 3 个 import：`CodelistsTab`, `UnitsTab`, `FieldsTab`
2. 删除 3 个 `<el-tab-pane>`：codelists, units, fields
3. `LOCKED_TABS` 从 `['codelists', 'units', 'fields', 'designer']` 收缩为 `['designer']`
4. 增加 activeTab sanitize：
   ```js
   const VALID_TABS = ['info', 'designer', 'visits']
   watch(activeTab, v => { if (!VALID_TABS.includes(v)) activeTab.value = 'info' })
   ```

### FormDesignerTab.vue 裁剪

**目标**：从 944 行裁剪至约 200-250 行。

**保留的 Script**：
```
import: ref, computed, watch, onMounted, inject
import: ElMessage (序号调整报错)
import: api (数据加载)
import: renderCtrl, renderCtrlHtml, toHtml (渲染)

props, refreshKey inject

forms, searchForm, filteredForms, selectedForm, formFields
loadForms, reloadForms, loadFormFields

updateFormOrder(row, newValue)

renderCtrl(fd), renderCellHtml(ff), getInlineRows(fields)
renderGroups, needsLandscape

watch(selectedForm, loadFormFields)
watch(refreshKey, () => { loadForms(); if (selectedForm.value) loadFormFields() })
onMounted(() => { loadForms() })
watch(() => props.projectId, () => { selectedForm.value = null; formFields.value = []; loadForms() })
```

**保留的 Template**：
```html
<div class="form-designer">
  <!-- 左侧：表单列表 -->
  <div class="fd-formlist">
    <el-input v-model="searchForm" ... /> <!-- 搜索框 -->
    <el-table :data="filteredForms" @current-change="r => selectedForm = r">
      <el-table-column label="序号">
        <el-input-number :model-value="row.order_index" @change="v => updateFormOrder(row, v)" />
      </el-table-column>
      <el-table-column prop="name" label="表单名称" />
      <el-table-column prop="code" label="Code" />
    </el-table>
  </div>

  <!-- 右侧：Word预览（只读） -->
  <div class="fd-right">
    <!-- 原有 Word 预览代码完整保留，仅删除「设计表单」按钮 -->
  </div>
</div>
```

**删除的 Template**：
- 工具栏按钮（新建、批量删除）
- 表格 checkbox 列、操作列
- 「设计表单」按钮
- 所有 6 个 `<el-dialog>`

### useApi.js 改动
- 删除 `genFieldVarName` 函数定义和导出
- `genCode`, `truncRefs` 可能变为未使用（需验证 VisitsTab 是否使用 genCode）

---

## 后端设计

### 删除整个 router 文件
- `backend/src/routers/codelists.py`
- `backend/src/routers/units.py`

### 裁剪 router 文件

**fields.py**：仅保留 2 个 GET 路由
- `GET /api/projects/{project_id}/field-definitions`
- `GET /api/forms/{form_id}/fields`
- 删除其余 14 个写路由

**forms.py**：仅保留 2 个路由
- `GET /api/projects/{project_id}/forms`
- `PUT /api/forms/{form_id}`
- 删除其余 7 个写路由

### main.py 清理
- 移除 `codelists_router` 和 `units_router` 的 `include_router`
- `fields_router` 和 `forms_router` 保留（仍有存活路由）

### 不动的后端代码
- models/ — 导入/导出依赖
- repositories/ — 导入/导出/VisitsTab 依赖
- services/ — 导入/导出依赖
- schemas/ — 导入/导出/VisitsTab 依赖

---

## 风险缓解

| 风险 | 缓解 |
|------|------|
| activeTab 残留 | sanitize watch 兜底 |
| 后端误删读路由 | 明确保留清单 + 每步 build 验证 |
| main.py 残留 include_router | 同步清理 |
| FormDesignerTab refreshKey watcher 残留 | 收缩为只调 loadForms() |
| genCode/truncRefs 可能变死代码 | 验证 VisitsTab 引用后决定 |

## PBT 属性

| 属性 | 不变量 | 验证策略 |
|------|--------|----------|
| Tab 不可见性 | 删除的 Tab 在任何 isLocked 状态下都不出现 | 遍历所有 Tab 状态组合 |
| 序号调整幂等 | 相同序号值重复提交，结果不变 | 重复调用 updateFormOrder 验证 |
| Word 预览一致 | 删除前后选中同一表单的 Word 预览结果一致 | 快照对比 |
| 导出不退化 | 删除前后同一项目的 Word 导出结果一致 | 二进制比对 |
| activeTab 安全 | 任何非法 tab 值都被纠正为 'info' | 随机 tab 名测试 |
| 后端启动正常 | 删除路由后服务器启动无报错 | 启动 + healthcheck |
