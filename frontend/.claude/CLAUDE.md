[根目录](../../.claude/CLAUDE.md) > **frontend**

# frontend 模块说明

> 最近更新：2026年4月28日 星期二 08:31:55 PDT

## 模块职责
- 提供 CRF 编辑器的 Vue 3 单页界面。
- 管理登录、项目、访视、表单、字段、单位、字典、设置与管理员页面。
- 承担模板导入、项目导入、Word 导入对比预览、导出、主题切换与侧边栏交互。
- 提供 CRF 预览渲染、排序、缓存刷新、字段实例快编与列宽拖拽体验。

## 关键入口
- `frontend/src/main.js`：创建 Vue 应用并挂载 `App.vue`，注册 Element Plus 与全量图标。
- `frontend/src/App.vue`：应用壳层，管理登录状态、`/api/auth/me` 登录后分流、普通项目工作台、管理员独立工作台、导入导出、刷新、主题、设置弹窗与改密弹窗。
- `frontend/src/composables/useApi.js`：统一请求、错误解析、401 失效处理、GET 缓存与自动失效。
- `frontend/src/composables/useCRFRenderer.js`：统一字段渲染、HTML 预览与内容驱动列宽规划。
- `frontend/src/composables/formFieldPresentation.js`：字段实例展示属性、颜色、默认值等表现层规则。
- `frontend/src/composables/useColumnResize.js`：表单设计器列宽拖拽与本地持久化协作。
- `frontend/vite.config.js`：开发服务器、`/api` 代理与构建分包配置。

## 核心目录
- `src/components/`（12 个 Vue 组件）：项目、字典、单位、字段、表单设计、访视、登录、管理、导入预览、CRF 模拟渲染等页面组件。
- `src/composables/`（11 个 JS 模块）：API、排序、字段渲染、表单设计器属性编辑、导出下载状态、列宽拖拽、访视预览方向、标签页懒加载、性能基线等共享逻辑。
- `src/styles/`：全局样式与主题变量。
- `tests/`（20 个测试文件）：基于 `node:test` 的前端回归与契约测试。

## 关键组件与流程
- `components/LoginView.vue`：账号 + 密码登录表单；development 下展示迁移提示，production 下显示通用认证失败文案。
- `components/AdminView.vue`：管理员独立工作台，负责用户列表、密码状态展示、创建用户、密码重置、批量项目操作与回收站。
- `components/ProjectInfoTab.vue`：项目信息、元数据与 Logo 操作。
- `components/VisitsTab.vue`：访视结构、访视表单矩阵、访视预览与排序。
- `components/FieldsTab.vue`：字段库维护。
- `components/FormDesignerTab.vue`：表单设计、字段实例编辑、实时预览、列宽拖拽与快编。
- `components/TemplatePreviewDialog.vue`：模板导入预览。
- `components/DocxCompareDialog.vue`：Word 导入对比预览与 AI 建议应用。
- `components/DocxScreenshotPanel.vue`：Word 导入截图展示。
- `components/SimulatedCRFForm.vue`：CRF 模拟渲染。
- `App.vue` 负责登录后先拉取 `/api/auth/me` 再决定管理员/普通用户主工作台，并管理项目复制、数据库导入导出、Word 导出频率限制、设置弹窗、AI 连通性测试、暗色模式切换和普通用户改密。

## 依赖与脚本
- 技术栈：Vue 3、Vite、Element Plus、vuedraggable、sortablejs。
- 测试依赖：`node:test`、`fast-check`。
- 常用命令：`npm run dev`、`npm run build`、`npm run lint`、`npm run format`。
- 测试命令：`node --test tests/*.test.js`。
- 开发服务器默认监听 `0.0.0.0:5173`，`/api` 代理到 `http://127.0.0.1:8888`。

## 开发约定
- 复杂复用逻辑放 `composables/`。
- API 请求统一走 `useApi.js`。
- 字段预览与 HTML 渲染统一复用 `useCRFRenderer.js`。
- 字段展示规则优先复用 `formFieldPresentation.js`，避免在组件中重复拼接表现层逻辑。
- 排序交互优先复用 `useOrderableList.js` 与 `useSortableTable.js`。
- 前端测试集中在 `frontend/tests/`，主要覆盖应用壳层、设置、导入反馈、排序、设计器、字段展示、主题、侧边栏与端口约定。

## 预览列宽（内容驱动）
- `useCRFRenderer.js` 暴露 `planInlineColumnFractions` / `planNormalColumnFractions` / `planUnifiedColumnFractions` 作为三类表格的统一 planner 入口。
- 字符权重常量与 CJK 码点范围与后端 `backend/src/services/width_planning.py` 共享契约，任一端改动需同步另一端。
- `FormDesignerTab.vue` 使用 `useColumnResize` 管理拖拽；默认值源接受数组/工厂函数/Ref，切换 `formId` 或 `tableKind` 时自动 rehydrate。
- localStorage 键：`crf:designer:col-widths:<form_id>:<table_kind>`；只有设计器写入，`TemplatePreviewDialog` / `SimulatedCRFForm` 仅读取。
- 读取列宽缓存失败（非数组/元素越界/和不为 1）时回退内容驱动默认值。
- 跨栈 fixture：`backend/tests/fixtures/planner_cases.json` 同时被前端 `columnWidthPlanning.test.js` 与后端 `test_width_planning.py` 加载；新增用例通过 `frontend/scripts/generatePlannerFixtures.mjs` 重新生成。

## 认证与管理员交互
- 登录后由 `App.vue` 调用 `/api/auth/me` 获取 `username` 与 `is_admin`，再分流到管理员工作台或普通项目工作台。
- 管理员工作台不渲染普通项目列表、设计器与 CRF 编辑入口。
- 普通用户改密属于认证链路，需与后端 `auth.py`、`auth_service.py`、`rate_limit.py` 同步验证。
- 401 失效处理统一在 `useApi.js` 中处理，组件不应各自维护不一致的认证错误分支。

## 测试关注点
- `adminViewStructure.test.js`：管理员界面结构。
- `appSettingsShell.test.js`、`appCollapse.test.js`、`sidebarCollapseBehavior.test.js`：应用壳层、设置与折叠行为。
- `columnWidthPlanning.test.js`、`columnWidthPlanning.pbt.test.js`：列宽规划契约与属性测试。
- `formDesignerPropertyEditor.runtime.test.js`、`quickEditBehavior.test.js`、`formFieldPresentation.test.js`：设计器属性编辑、快编与字段展示。
- `exportDownloadState.test.js`：导出下载状态。
- `portDefaults.test.js`：开发端口约定。
- `visitPreviewLandscape.test.js`：访视预览方向。
- `orderingStructure.test.js`：排序结构契约。
- `themePalette.test.js`：主题调色板。
- `importRenameFeedback.test.js`：导入重命名反馈。
- `projectInfoMetadata.test.js`：项目信息元数据。
- `appTabLazyLoad.test.js`：标签页懒加载。
- `sidebarCopyButtonScope.test.js`：侧边栏复制按钮作用域。
- `browserPerfBaselineScript.test.js`、`perfBaselineHelpers.test.js`：性能基线相关。

## 相关文件清单
| 类别 | 文件 |
|------|------|
| 入口 | `src/main.js`、`src/App.vue` |
| 组件 | `src/components/AdminView.vue`、`src/components/LoginView.vue`、`src/components/ProjectInfoTab.vue`、`src/components/CodelistsTab.vue`、`src/components/UnitsTab.vue`、`src/components/FieldsTab.vue`、`src/components/FormDesignerTab.vue`、`src/components/VisitsTab.vue`、`src/components/SimulatedCRFForm.vue`、`src/components/TemplatePreviewDialog.vue`、`src/components/DocxCompareDialog.vue`、`src/components/DocxScreenshotPanel.vue` |
| Composables | `src/composables/useApi.js`、`src/composables/useCRFRenderer.js`、`src/composables/formFieldPresentation.js`、`src/composables/useColumnResize.js`、`src/composables/useOrderableList.js`、`src/composables/useSortableTable.js`、`src/composables/formDesignerPropertyEditor.js`、`src/composables/exportDownloadState.js`、`src/composables/visitPreviewLandscape.js`、`src/composables/useLazyTabs.js`、`src/composables/usePerfBaseline.js` |
| 样式 | `src/styles/main.css` |
| 配置 | `package.json`、`vite.config.js` |

## 变更记录
- `2026年4月28日 星期二 08:31:55 PDT`：全量扫描刷新。源码 26 文件（组件 12、composables 11、样式 1、入口 2）、测试 20 文件。补充完整测试关注点列表与文件清单。
- `2026年4月27日 星期一 05:45:45 PDT`：初始生成。
