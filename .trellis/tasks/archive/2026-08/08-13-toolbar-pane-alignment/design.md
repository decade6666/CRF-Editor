# 设计：共享工具栏槽位与导入模板迁移

> 对应父任务 R2（工具栏一致性）、R4（双栏垂直对齐），父任务 AC4/AC5/AC9。

## 1. 现状盘点（证据）

全局 `* { box-sizing: border-box }`（`main.css:117`）；Element Plus `size="small"` 控件高 24px。各页顶部槽位总高（控件 + 底距 + 边框）：

| 位置 | 文件:行 | 槽位总高 |
| --- | --- | --- |
| 字典左栏工具栏 | CodelistsTab.vue:273 | 36px |
| 选项右栏工具栏 | CodelistsTab.vue:343（8px 底距） | 32px（差 4px） |
| 单位工具栏 | UnitsTab.vue:135 | 36px |
| 字段左栏工具栏 | FieldsTab.vue:385 | 36px |
| 字段右栏面板头 | FieldsTab.vue:460 | ≈37px（差 1px） |
| 表单列表工具栏 | FormDesignerTab.vue:3292（缺 `align-items:center`） | 36px |
| 设计画布头 | FormDesignerTab.vue scoped:5591（内含默认 32px `el-switch`） | ≈49px（差 13px） |
| 访视左栏工具栏 | VisitsTab.vue:759 | 36px（访视子任务接线） |
| 访视右栏标题行/添加行 | VisitsTab.vue:829、:834（8px 底距） | 32px（访视子任务接线） |

双栏容器：CodelistsTab.vue:270（`gap:16px`）、FieldsTab.vue:382（`gap:12px; align-items:stretch`）、FormDesignerTab scoped `.form-designer`（`gap:16px; height:100%`）。

测试锚点：`appSettingsShell.test.js:55-67` 锁定 header 含 `@click="openImportDialog">导入模板</el-button>`（需更新）；`listActionsIconify.test.js` 以 `class="fd-formlist"` → `openDesigner` 为表单列表作用域（保持）。

## 2. 共享工具栏契约（main.css）

在 `main.css` 布局区（`.fd-formlist` 附近）新增两条规则，均含 `display:flex; align-items:center; gap:8px; min-height:24px; margin-bottom:12px; flex-shrink:0`：

- `.list-toolbar`：操作工具栏。
- `.pane-tool-slot`：双栏页右栏无操作一侧的结构性占位。

高度数学：无边框工具栏槽位 = 24px + 12px = 36px；带 1px 底边框的标题槽在内容为 24px 时浏览器外高最多 25px，总槽位 37px。验收容差为 0–1px。`FormDesignerTab` 画布头当前包含默认 32px switch，必须同步改为 `size="small"`，否则仅改 padding 后仍会保留约 9px 错位。

### 各页替换表（内联 → 共享类）

| 文件:行 | 替换为 |
| --- | --- |
| CodelistsTab.vue:273、:343 | `class="list-toolbar"`（右栏底距 8→12px，消除 4px 错位） |
| UnitsTab.vue:135 | `class="list-toolbar"` |
| FieldsTab.vue:385 | `class="list-toolbar"` |
| FieldsTab.vue:459-462 | 右栏面板头改 `class="pane-tool-slot"`，`padding:8px 12px` → `padding:0 12px`；保留背景/边框/字号 |
| FormDesignerTab.vue:3292 | `class="list-toolbar"`（补上 `align-items:center`） |
| FormDesignerTab.vue scoped:5591 与主画布 :3368 | `.fd-canvas-header`：`padding:8px 12px` → `min-height:24px; padding:0 12px; margin-bottom:12px`；主画布 `el-switch` 补 `size="small"`（保留 border-bottom 与其余属性） |

注意：`.fd-canvas-header` 被主画布（:3366）与全屏字段面板头（:4047）共用，一条规则两处生效；`.fd-canvas-header-notes` / `.fd-canvas-header-main` 等子规则一律不动（`formFieldPresentation.test.js`、`acrfViewToggle.test.js` 锁定）。

## 3. 导入模板迁移

### App.vue（2 处）

1. 删除 `:1139` 导入按钮；`.header-right` 只保留导出Word 下拉。
2. `:1271` 挂载点加 `@import-template="openImportDialog"`。

导入状态、`openImportDialog`、弹窗、`executeImport` 零改动。

### FormDesignerTab.vue（3 处）

1. `:113` 附近 `const emit = defineEmits(['import-template'])`。
2. `:3292-3299` 改 `class="list-toolbar"`，控件顺序 `[Plus 新建] [搜索 input] [导入模板按钮] [Delete 批量删除]`；导入按钮保留文本，沿用 `type="warning" size="small"`，`@click="emit('import-template')"`。顺序依据：父任务 AC4「搜索框 → 导入模板 → 删除相关操作」，新建保持首位。
3. 不新增刷新逻辑：导入成功由 App `refreshKey++` 经既有 inject/watch（FormDesignerTab:409）驱动重载。

## 4. 双栏顶部槽对齐（R3 应用）

- **选项页**：两栏均 `.list-toolbar` → 顶部同为 36px。
- **字段页**：左栏 `.list-toolbar`；右栏面板头 `.pane-tool-slot` → 表单区与左栏表格顶部对齐。
- **表单页**：左栏 `.list-toolbar`；右栏 `.fd-canvas-header` 槽位化，并把其中默认尺寸 switch 改为 small → 预览区与左栏表格顶部偏差控制在 0–1px。
- 槽位契约与颜色无关，明暗主题天然一致。

## 5. 访视交接契约（visit-flow-workspace 消费）

访视任务重组 DOM 后旧行号会失效，因此交接按**语义位置**而非当前行号定义：

| 接口 | 内容 |
| --- | --- |
| 默认列表 / 流程入口工具栏 | `class="list-toolbar"`；允许内部用正向 `margin-left:auto` spacer 将「访视流程」推至右侧 |
| 流程标题或单访视右栏标题行 | `class="pane-tool-slot"`，保持 24px 内容高 + 12px 底距；槽内交互控件使用 small 尺寸 |
| 单访视右栏添加表单行 | `class="list-toolbar"` |
| 禁令 | 不引入负 margin / 页面私有 gap、底距像素补丁；共享类提供统一的 8px gap 与 36–37px 槽位 |
| 测试 | `.list-toolbar` / `.pane-tool-slot` 消费与无负 margin 断言进入 `visitFlowWorkspace.test.js`；本任务测试显式排除 VisitsTab |

串行方向固定为 **toolbar → visit-flow**：先落地 `main.css` 契约，再由访视任务消费。

## 6. 文件冲突矩阵与串行顺序

| 文件 | 本任务改动 | 冲突任务 | 策略 |
| --- | --- | --- | --- |
| `frontend/src/App.vue` | `:1137-1149`、`:1271` | `08-13-admin-organization-management`（管理端分支 `:1078-1103`） | 同一文件必须串行；本任务只改普通用户分支 |
| `frontend/src/components/FormDesignerTab.vue` | `:113`、`:3292-3299`、scoped `:5591` | `08-13-designer-panel-draft-fix` | 必须串行（父 PRD 规定）；**推荐本任务先行**，设计器任务消费 36px 槽位契约 |
| `frontend/src/components/VisitsTab.vue` | 零写入 | `08-13-visit-flow-workspace` | 本任务不碰；访视任务消费 `main.css` 契约 → 排在本任务之后 |
| `frontend/src/styles/main.css` | 新增两共享类 | 当前无 | 设计器任务调整面板边框时不得破坏 36px 槽位契约 |

**推荐串行顺序**：`admin → toolbar → visit → designer`。理由：本任务先落地共享 CSS 契约，访视与设计器任务在其上消费；admin 与后续任务无契约依赖，但任何任务不得并行写 `App.vue`。

## 7. 测试契约（源码级，与 `listActionsIconify.test.js` 同风格）

新增 `frontend/tests/toolbarPaneAlignment.test.js`：

1. App.vue：`header-right` 内 `doesNotMatch` 导入模板；挂载点匹配 `@import-template="openImportDialog"`。
2. FormDesignerTab：`defineEmits(['import-template'])`；`fd-formlist` 作用域内 indexOf 顺序断言 `搜索表单` < `导入模板` < `批量删除表单`；导入按钮匹配 `type="warning"` 与 `emit('import-template')`。
3. 四类页面工具栏匹配 `class="list-toolbar"`（CodelistsTab 两处）；FieldsTab 右栏面板头匹配 `class="pane-tool-slot"`。
4. main.css：两规则匹配 `min-height: 24px`、`margin-bottom: 12px`、`display: flex`、`align-items: center`、`gap: 8px`、`flex-shrink: 0`。
5. FormDesignerTab scoped `.fd-canvas-header` 匹配 `min-height:24px` / `padding:0 12px` / `margin-bottom:12px`，主画布 switch 匹配 `size="small"`，防止默认 32px 控件重新撑高。
6. 负 margin 守卫：四类页面 + `main.css` `doesNotMatch(/margin-(top|bottom):\s*-/)`（已核实现存零负 margin）。
7. 显式排除 VisitsTab（注释说明由访视子任务接线）。

更新 `appSettingsShell.test.js:55-67`：header 断言翻转为 `doesNotMatch` 导入模板，保留导出Word 全部既有断言。

**不受影响的既有测试**（已核实断言不涉及工具栏内联样式/顺序）：`listActionsIconify.test.js`、`searchRankingWiring.test.js`、`formFieldPresentation.test.js`、`acrfViewToggle.test.js`、`orderingStructure.test.js`、`ordinalQuickEditWiring.test.js`、`quickEditBehavior.test.js`、`appTabLazyLoad.test.js`、`basePathDeployment.test.js`。

## 8. 边界与红线

- 后端零改动；不改 `App.vue` 导入状态/弹窗/`executeImport` 逻辑。
- 不动 `.fd-canvas-header-notes`、`.fd-canvas-header-main`、`.header`/`header-right` 媒体查询（`sidebarCollapseBehavior.test.js`、`formFieldPresentation.test.js` 锁定）。
- 不碰全屏设计器工具栏（后续子任务）。
- 不引入任何负 margin 或按页像素补偿。
