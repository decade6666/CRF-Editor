# Specs: simplify-readonly-tabs (v2)

## 目标

删除 `CodelistsTab`、`UnitsTab`、`FieldsTab` 三个 Tab（整体移除）；`FormDesignerTab` 仅保留表单列表序号调整 + 右侧 Word 只读预览；同步清理前后端死代码。

## 范围

- 前端：删除 3 个 .vue 文件 + 1 个 composable + 裁剪 FormDesignerTab + App.vue
- 后端：删除/裁剪 4 个 router 文件 + 清理 main.py
- 不动：后端 models/repositories/services/schemas（导入/导出依赖）

## 功能规格

### FS-01: Tab 删除

- CodelistsTab（选项）、UnitsTab（单位）、FieldsTab（字段）三个 Tab 从应用中完全移除
- 用户在任何状态（locked/unlocked）下都不可见这三个 Tab
- 相关 .vue 文件和 composable 文件物理删除

### FS-02: FormDesignerTab 精简

**保留**：
- 表单列表：显示所有表单，支持搜索、序号调整（el-input-number + updateFormOrder）
- Word 预览：选中表单后右侧展示只读 Word 样式预览（renderGroups, needsLandscape, renderCellHtml, getInlineRows）

**删除**：
- 表单 CRUD：新建/编辑/删除/复制表单功能及所有相关弹窗
- 字段设计器：整个设计弹窗（字段库、画布、属性编辑、拖拽排序）
- 快速新增字典/单位弹窗
- 工具栏按钮（新建、批量删除）
- 表格 checkbox 列和操作列
- Word 预览区的「设计表单」按钮

### FS-03: activeTab 安全

- 合法 Tab 集合：`['info', 'designer', 'visits']`
- 任何非法 activeTab 值自动回退为 `'info'`

### FS-04: 后端路由清理

| 操作 | 目标 |
|------|------|
| 删除整个文件 | codelists.py（13 路由）、units.py（8 路由） |
| 裁剪 | fields.py：保留 2 GET，删除 14 写路由 |
| 裁剪 | forms.py：保留 GET 列表 + PUT 更新，删除 7 写路由 |
| 清理 | main.py：移除 codelists_router、units_router 的 include_router |

### FS-05: 不退化项

- VisitsTab 功能完整不变
- ProjectInfoTab 功能完整不变
- Word 导出功能不变
- 模板导入 / Word 导入功能不变
- isLocked 机制不变

## 技术规格

### TS-01: 前端文件删除清单

| 文件 | 操作 |
|------|------|
| `frontend/src/components/CodelistsTab.vue` | 删除 |
| `frontend/src/components/UnitsTab.vue` | 删除 |
| `frontend/src/components/FieldsTab.vue` | 删除 |
| `frontend/src/composables/useOrderableList.js` | 删除 |

### TS-02: FormDesignerTab 保留清单

| 类别 | 保留项 |
|------|--------|
| 数据 | forms, searchForm, filteredForms, selectedForm, formFields |
| 加载 | loadForms, reloadForms, loadFormFields |
| 交互 | updateFormOrder |
| 渲染 | renderCtrl, renderCellHtml, getInlineRows, renderGroups, needsLandscape |
| Import | renderCtrlBase, renderCtrlHtml, toHtml from useCRFRenderer |
| 生命周期 | onMounted(loadForms), watch(projectId), watch(selectedForm), watch(refreshKey) |

### TS-03: 后端路由保留清单

| Router 文件 | 保留路由 |
|-------------|----------|
| forms.py | `GET /api/projects/{pid}/forms`, `PUT /api/forms/{fid}` |
| fields.py | `GET /api/projects/{pid}/field-definitions`, `GET /api/forms/{fid}/fields` |
| codelists.py | 删除整个文件 |
| units.py | 删除整个文件 |

### TS-04: useApi.js 清理

| 符号 | 操作 | 原因 |
|------|------|------|
| genFieldVarName | 删除 | 仅被 FieldsTab + FormDesigner 设计器使用 |
| truncRefs | 删除 | 验证后确认无引用（已被删除的 Tab 组件是唯一调用方） |
| genCode | 保留 | VisitsTab 仍在使用 |

## 非功能约束

| # | 约束 |
|---|------|
| NF-1 | `npm run build` 零错误零警告 |
| NF-2 | 后端 `python main.py` 启动无报错 |
| NF-3 | 删除操作后同步清理 unused import |
| NF-4 | `isLocked` inject 机制行为不变 |
| NF-5 | 无 console 报错 |
| NF-6 | activeTab 对非法值有兜底 |

## 成功判据

1. 只有 info、designer、visits 三个 Tab 可见
2. FormDesignerTab 只显示表单列表（含序号调整）+ 右侧 Word 预览
3. 无任何表单新建/编辑/删除/复制按钮，无字段设计器入口
4. `npm run build` 通过
5. 后端启动无报错
6. VisitsTab 预览正常、导出正常
7. 页面无 console 错误
