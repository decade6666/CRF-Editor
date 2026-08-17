# Technical Design — 管理端与属性卡体验修复

## Scope and boundaries

所有生产代码变更限于 `frontend/`。后端项目软删除、恢复与彻底清理 API 保持不动；本任务只校准 UI 描述与交互。

## 1. 管理端

### 1.1 机构预设弹窗

`OrganizationManagementView.vue` 将从 `org-layout` 双栏改为“工作区页头 + 全宽 `el-table` + 单个编辑 `el-dialog`”。

- `showEdit` 取代 `editing`；`draftId` 决定弹窗标题和 POST/PUT 路径。
- `resetDraft()` 仍是 Logo draft state 的唯一清理点：关闭时清空表单、释放仅由编辑预览持有的 Object URL；表格缩略图 URL 不由它释放。
- `openAdd()` 和 `openEdit(row)` 都先调用 `resetDraft()`，再初始化 draft 并打开弹窗。
- 表格缩略图由现有 reactive `thumbnailUrls` Map 负责；`showPreview()`、键盘 Enter/Space、`hide-on-click-modal` 保持。
- 删除 `selectedId`、`onRowChange()` 和无选择占位文案，不影响 `removePreset()` 的刷新和 URL 释放。

### 1.2 切换缓存

`App.vue` 以 `<KeepAlive>` 包装管理员页面条件分支。Vue 会缓存已激活的两个组件实例；首次访问各页面保留既有 `onMounted` 加载，返回页面不再次触发 load。组件最终卸载（退出管理员工作区）仍执行机构页面的 `onBeforeUnmount` 释放 blob URL。

### 1.3 删除文案模型

保留通用 `buildFinalDeleteConfirmMessage` 默认的不可恢复语义，新增可选 `recoverable` 参数来选定后缀：

- `recoverable: true` → `删除后如需恢复，请联系管理员。`
- 未传/false → `此操作不可恢复。`

仅项目普通删除路径传入 recoverable；回收站 hard-delete 以及非项目实体不改变。

## 2. 表单设计器

### 2.1 顶栏 chip flex 约束

主画布的 `.fd-canvas-toolbar` 是一个 `pane-tool-slot`，但它不需要工具栏换行。局部设为 `flex-wrap: nowrap`，移除 notes chip 的 96px fallback right margin。现有：

- `.fd-canvas-header-main { flex: 1 1 auto; min-width: 0 }`
- title/chip 皆有 `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`
- count 是 `flex-shrink:0`

因此可在有限空间中截断 title/chip，而不把整个 header group 送到第二行。chip 保留 `flex:0 1 auto`，不重回填满 header 的历史行为。

### 2.2 单线面板

Fullscreen field pane 不再带 `.fd-canvas` class，显式拥有 `.fd-canvas` 所需的布局属性（`flex`, `display:flex`, `flex-direction:column`, `transition`），但只保留外缘 top/left border。这样 resizer `::before` 是左右/上下内部分隔唯一来源，不会叠加 inherited right/bottom border 或 shadow。

### 2.3 草稿保存选择恢复

`saveDraftField()` 的成功路径已有两种结果：

1. `loadFormFields(formId)` 成功：服务端列表包含真实字段，已有 `selectField(realFf)`。
2. 读取被 session guard 吞掉：本地 `map()` 把 draft 转为真实字段。

第二种结果也要在 map 后通过真实 id 查找并执行 `selectField(newFf)`。该调用复用已有 selection、编辑模型 hydration、baseline 和候选状态清理逻辑；不改 history、API 请求和缓存世代协议。

## 3. UnitsTab / VisitsTab 属性卡

### 3.1 共用布局惯例（不抽新组件）

两个 tab 都采用 FieldsTab 已验证的内联两层结构：

```
outer row: display:flex; gap:12px; align-items:stretch; height:calc(100vh - 160px)
left: flex:1; min-width:0; display:flex; flex-direction:column
right: width:320px; display:flex; flex-direction:column; flex-shrink:0
  ├ .pane-tool-slot（标题，卡片外）
  └ inner: flex:1; min-height:0; border; border-radius; display:flex; flex-direction:column; overflow:hidden
```

不抽出新的通用属性卡组件，因为两者只有视觉骨架相同、业务状态与影响确认流程不同；抽象会增加跨组件耦合并超过本次需要。

### 3.2 UnitsTab 状态

以 `selectedUnitId`、`isCreatingUnit` 和单一 `unitEditProp` 替代 add/edit 两套 refs。`resetUnitEditor()` 创建不可变输入快照并填入 reactive edit state；`clearUnitSelection()` 是取消、项目切换、删除成功的统一清理点。

- 新增：生成 `UNIT` OID，POST 后 reload，选择创建后的真实行并重新水合。
- 编辑：点行复制行数据，更新前保留现有 references GET + 多字段影响确认，PUT 后 reload + 水合。
- 删除/批量删除：保留现有引用保护和确认；若影响当前选择则清理。
- `useSortableTable` 与 `useOrdinalQuickEdit` 接线不变，列表行选择 class 与 checkbox batch selection 各自保留语义。

### 3.3 VisitsTab 状态

仅 `workspaceMode === 'list'` 改为左右布局，flow 分支不变。复用 `selectedVisit` 作为行选择来源，新增 `isCreatingVisit` 与单一 `visitEditProp`：

- 新增 POST 只提交 name/code，不提交 sequence；后端维持默认追加顺序。
- 编辑 PUT 只提交 name/code。序号不参与属性表单，防止拖拽后属性保存回写旧 sequence。
- 行 current-change 更新 selectedVisit 并水合 `visitEditProp`，而列表保存/取消不影响已有 `syncVisitForms` 计算。
- 复制和删除保留，删除/批删时继续清空已失效的 selectedVisit。

### 3.4 矩阵移除

`toggleCell()` 移除现有 `confirmDelete()`，保留 `try/catch` 与 API delete；该行为与 `removeFormFromVisit()` 一致。

## 4. Test strategy

先将每个行为变更写入/调整源码级 Node test（RED），再改组件（GREEN）：

- Admin: `adminViewStructure`, `adminOrgPresets`, `projectDeleteConfirmation`
- Designer: `designerNewFieldDraft`, `paneSplit`, `formFieldPresentation`
- Units/Visits: `editModeHiddenIdentifiers`, `toolbarPaneAlignment`, `listActionsIconify`, `projectDeleteConfirmation`, `visitFlowWorkspace`, `ordinalQuickEditWiring`, `orderingStructure`

保留 scoped CSS 与 selector test 的既有精确结构；改变源码形状时同步更新断言，避免错误地把旧实现当作契约。
