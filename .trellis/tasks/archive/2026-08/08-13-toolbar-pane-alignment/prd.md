# 工具栏与双栏对齐

## Goal

将「导入模板」入口从全局顶栏移入表单列表工具栏（搜索框与批量删除之间）；统一选项/单位/字段/表单/访视五类列表工具栏的间距与垂直对齐规则；用同一等高顶部工具槽对齐选项/字段/表单双栏页面，不用页面私有负 margin 或像素补丁。

## Confirmed Repository Facts

- 「导入模板」按钮在 `App.vue:1139`（`header-right`）；导入状态与弹窗全由 `App.vue` 持有（`:614-704`）。
- 导入成功 `executeImport` 已执行 `api.clearAllCache()` + `refreshKey++`（`App.vue:697-698`），`FormDesignerTab` 注入监听全局 `refreshKey`（`:114`、`:409-417`）自动重载表单列表——迁移入口无需新增刷新通道。
- `FormDesignerTab` 仅声明 `projectId` prop（`:113`），无 emit；挂载点 `App.vue:1271` 未接线事件。
- 五类工具栏依赖分散内联 `flex/gap/margin-bottom`，右栏顶部槽位高度互不相同导致错位：左栏统一 36px（24px 控件 + 12px 底距）；CodelistsTab 选项右栏 32px（8px 底距）、FieldsTab 面板头 ≈37px、FormDesignerTab 画布头 ≈41px。全局 `* { box-sizing: border-box }`（`main.css:117`），Element Plus small 控件 24px。
- 测试锚点：`appSettingsShell.test.js:55-67` 锁定「header 保留导入模板」旧结构（须更新）；`listActionsIconify.test.js` 以 `class="fd-formlist"` → `openDesigner` 为表单列表作用域锚点（保持）。

## Requirements

### R1 导入模板入口迁移

- 删除全局顶栏「导入模板」按钮；入口只出现在表单列表工具栏。
- 工具栏顺序：新建 → 搜索框 → 导入模板 → 批量删除。
- 导入状态与弹窗继续由 `App.vue` 持有，业务零复制；`FormDesignerTab` 仅 `emit('import-template')` 触发 `App.openImportDialog()`。
- 导入后刷新沿用既有 `refreshKey` 链路。

### R2 共享工具栏规则

- `frontend/src/styles/main.css` 新增 `.list-toolbar`（操作工具栏）与 `.pane-tool-slot`（右栏无操作一侧的结构性顶部槽），统一「24px 控件高 + 12px 底距 = 36px 槽位」。
- CodelistsTab（两栏）、UnitsTab、FieldsTab（左栏）、FormDesignerTab（表单列表）替换内联工具栏样式。
- 访视页由访视子任务套用同一契约（本任务只定义接口与串行顺序，不写 `VisitsTab.vue`）。

### R3 双栏顶部槽对齐

- 选项/字段/表单双栏页面左右内容区顶部与有效高度一致，明暗主题一致（契约不依赖颜色）。
- 有操作一侧显示工具栏，无操作一侧保留结构性占位；禁止页面私有负 margin 或逐页像素补丁。
- FormDesignerTab 画布头纳入 36px 槽位契约（主画布与全屏共用 `.fd-canvas-header`，一并生效）。

### R4 访视交接接口

- 左栏列表工具栏用 `.list-toolbar`（现 `VisitsTab.vue:759`）；右栏标题行用 `.pane-tool-slot`（现 `:829`）；右栏添加表单行用 `.list-toolbar`（现 `:834`）；视图切换后左右槽位仍等高，不得引入负 margin。

## Acceptance Criteria

- [ ] AC1：全局顶栏不再出现「导入模板」；按钮只出现在表单列表工具栏，顺序为 搜索框 → 导入模板 → 批量删除。
- [ ] AC2：点击「导入模板」打开 App 持有的既有导入弹窗，选择/预览/执行/成功刷新流程与迁移前一致。
- [ ] AC3：选项、单位、字段、表单四类页面工具栏改用共享类，间距与垂直对齐规则一致；源码级回归锁定契约（访视页由访视子任务接线并复核）。
- [ ] AC4：选项/字段/表单双栏页面左右内容区顶部对齐（统一 36px 顶部工具槽），明暗主题一致；无负 margin。
- [ ] AC5：相关前端测试、lint、build 通过；浏览器实机验证（明暗主题），未运行项必须明确说明。

## Scope Notes

- 纯前端改动，后端零改动。
- 不写 `VisitsTab.vue`（属访视子任务）；`FormDesignerTab.vue` 与设计器子任务存在共享文件冲突，必须串行（见 `design.md` §6）。
- 全屏设计器工具栏不属于本任务；保持 `appSettingsShell.test.js` 其余契约不变。
