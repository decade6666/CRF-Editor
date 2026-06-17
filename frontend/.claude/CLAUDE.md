[根目录](../../.claude/CLAUDE.md) > **frontend**

# frontend 模块说明

> 最近更新：2026年6月15日

## 模块职责
- 提供 CRF 编辑器的 Vue 3 单页界面。
- 管理登录、项目、访视、表单、字段、单位、字典、设置与管理员页面。
- 承担模板导入、项目导入、Word 导入双栏证据预览、导出、主题切换与侧边栏交互。
- 提供 CRF 预览渲染、排序、缓存刷新、字段实例快编、列宽 / 行高拖拽与会话倒计时体验。

## 关键入口
- `frontend/src/main.js`：创建 Vue 应用并挂载 `App.vue`，注册 Element Plus 与全量图标。
- `frontend/src/App.vue`：应用壳层，管理登录状态、`/api/auth/me` 登录后分流、普通项目工作台、管理员独立工作台、导入导出、刷新、主题、设置弹窗与改密弹窗。
- `frontend/src/composables/useApi.js`：统一请求、错误解析、401 失效处理、GET 缓存与自动失效。
- `frontend/src/composables/useCRFRenderer.js`：统一字段渲染、HTML 预览与内容驱动列宽规划。
- `frontend/src/composables/formFieldPresentation.js`：字段实例展示属性、颜色、默认值等表现层规则。
- `frontend/src/composables/useColumnResize.js`：表单设计器列宽拖拽与本地持久化协作。
- `frontend/src/composables/useRowResize.js`：Word 预览行高拖拽、稳定行 key 与本地持久化。
- `frontend/src/composables/useSessionTimer.js`：JWT `exp` 展示、临期提醒与复用 `/api/auth/me` 的点击续期。
- `frontend/src/composables/formDesignerPreviewModel.js`：表单设计器 / 模板预览的派生视图模型缓存，避免模板重复重算。
- `frontend/vite.config.js`：开发服务器、`/api` 代理与构建分包配置。

## 核心目录
- `src/components/`（13 个 Vue 组件）：项目、字典、单位、字段、表单设计、访视、登录、管理、会话倒计时、导入预览、CRF 模拟渲染等页面组件。
- `src/composables/`（15 个 JS 模块）：API、排序、字段渲染、表单设计器属性编辑、预览视图模型、导出下载状态、列宽 / 行高拖拽、会话倒计时、设计器撤销/恢复历史、访视预览方向、标签页懒加载、性能基线等共享逻辑。
- `src/styles/`：全局样式与主题变量。
- `scripts/`（3 个脚本）：fixture 生成（`generatePlannerFixtures.mjs`）、构建指标采集（`collectBuildMetrics.mjs`）、浏览器性能基线（`runBrowserPerfBaseline.mjs`）。
- `tests/`（28 个文件：27 个 `.test.js` + `testProperty.js`）：基于 `node:test` 的前端回归、契约测试与属性测试辅助工具。

## 关键组件与流程
- `components/LoginView.vue`：账号 + 密码登录表单；development 下展示迁移提示，production 下显示通用认证失败文案。
- `components/SessionTimer.vue`：顶栏会话剩余时间展示、临期状态样式与点击续期入口。
- `components/AdminView.vue`：管理员独立工作台，负责用户列表、密码状态展示、创建用户、密码重置、批量项目操作与回收站。
- `components/ProjectInfoTab.vue`：项目信息、元数据与 Logo 操作。
- `components/VisitsTab.vue`：访视结构、访视表单矩阵、访视预览与排序。
- `components/FieldsTab.vue`：字段库维护。
- `components/FormDesignerTab.vue`：表单设计、字段实例编辑、实时预览、列宽拖拽、快编与内存撤销/恢复（撤回/恢复按钮 + Ctrl+Z / Ctrl+Y）。
- `components/TemplatePreviewDialog.vue`：模板导入预览。
- `components/DocxCompareDialog.vue`：Word 导入对比预览与 AI 建议应用。
- `components/DocxScreenshotPanel.vue`：Word 导入截图展示。
- `components/SimulatedCRFForm.vue`：CRF 模拟渲染。
- `App.vue` 负责登录后先拉取 `/api/auth/me` 再决定管理员/普通用户主工作台，并管理项目复制、数据库导入导出、Word 导出频率限制、设置弹窗、AI 连通性测试、暗色模式切换和普通用户改密。

## 依赖与脚本
- 技术栈：Vue 3、Vite、Element Plus、vuedraggable、sortablejs。
- 测试依赖：`node:test`、自研轻量属性测试工具 `tests/testProperty.js`。
- 常用命令：`npm run dev`、`npm run build`、`npm run lint`、`npm run format`。
- 测试命令：`node --test tests/*.test.js`。
- 开发服务器默认监听 `0.0.0.0:5173`，`/api` 代理到 `http://127.0.0.1:8888`。

## 开发约定
- 复杂复用逻辑放 `composables/`。
- API 请求统一走 `useApi.js`。
- 字段预览与 HTML 渲染统一复用 `useCRFRenderer.js`。
- 字段展示规则优先复用 `formFieldPresentation.js`，避免在组件中重复拼接表现层逻辑。
- 排序交互优先复用 `useOrderableList.js` 与 `useSortableTable.js`。
- `FormDesignerTab.vue` 的设计备注展示已从右侧 aside 迁移到 canvas header / designer-section-title 的摘要 + tooltip 路径；仅 VisitsTab 仍保留原 aside 样式。
- 新增字段为本地草稿态：点「新建字段」（`newField`）只构造临时草稿对象（`id='__draft__'`、`__draft:true`、带完整本地 `field_definition`）插入 `formFields` 并选中，不发请求；顶栏出现「保存」按钮（`saveDraftField`）才依次 `POST field-definitions` + `POST forms/{id}/fields` 落库、替换草稿、刷新并作为一次「新建字段」入撤销栈。草稿态下属性自动保存链路在 watcher 入口短路为 `applyEditorToDraft` 本地写回；`removeField` 对草稿仅移除本地、不调 DELETE；同一时刻仅允许一个草稿，切换表单/选其它字段/再次新建前经 `confirmDiscardDraft`（保存/丢弃/取消）；**切换项目时只要设计器 tab 已激活，也必须先走 `canLeaveProject` 守卫，避免懒加载组件仍挂载时草稿被静默清空**；草稿存在时禁止排序、草稿行不参与批量选择与 inline 快切。从字段库拖入已有定义的 `addField` 维持立即落库不变。
- 字段属性自动保存的离开策略统一走 `resolveFieldPropLeave`：关闭设计窗口（`before-close`）、切换表单、切换项目都先尝试 flush；`missing_codelist`（单选/多选未选字典）这类不可自动保存但可放弃的错误，使用 `confirmDiscardFieldPropChanges` 给出“继续修改 / 放弃并离开”出口；网络/服务端错误则阻断离开并提示原因。放弃未保存字段属性只清理本地 autosave 队列与编辑器状态，不额外 reload，避免在离开过程中引入新的网络失败面。
- 设计器撤销/恢复为纯内存双栈（`useDesignerHistory.js`，上限 20，刷新即清空，不做后端持久化）。覆盖属性编辑、排序、新增（含 log 行）、新建字段、删除、批量删除六类操作；删除/批量删除的逆操作用删除前快照按原 `order_index` 重建并 `remapId` 回写新 id；新建字段撤销时对称删除自动创建的字段定义（被其他表单引用返回 409 则降级保留并提示）。切换表单清空历史；`toggleInline` 等其他快编路径暂不入栈。
- 表单方向（`paper_orientation`）应以 `selectedFormPaperOrientation` + `resolveLandscape` 为主；首次加载会迁移一次 `localStorage['crf_forceLandscape']` 到 per-form 设置，迁移完成后不再依赖旧全局开关。
- 前端测试集中在 `frontend/tests/`，主要覆盖应用壳层、设置、导入反馈、排序、设计器、字段展示、主题、侧边栏与端口约定。

## 预览列宽（内容驱动）
- `useCRFRenderer.js` 暴露 `planInlineColumnFractions` / `planNormalColumnFractions` / `planUnifiedColumnFractions` 作为三类表格的统一 planner 入口。
- 字符权重常量与 CJK 码点范围与后端 `backend/src/services/width_planning.py` 共享契约，任一端改动需同步另一端。共享常量包含 `WEIGHT_CHINESE=2`、`WEIGHT_ASCII=1`、`FILL_LINE_WEIGHT=6`、`INLINE_HEADER_FLOOR=WEIGHT_CHINESE*4=8`（仅作用于 inline 表，保护 ≤4 字短表头如 `未查` / `项目` / `单位` 与长邻居共存时不被挤压到不可单行）、`AVAILABLE_CM=14.66`。
- `FormDesignerTab.vue` 使用 `useColumnResize` 管理列宽拖拽；默认值源接受数组/工厂函数/Ref，切换 `formId` 或 `tableKind` 时自动 rehydrate。
- `FormDesignerTab.vue` 与 `VisitsTab.vue` 复用 `useRowResize` 管理 Word 预览行高拖拽；行高 key 由字段 id 与表格实例组成，hover / active 指示线需覆盖整行。
- localStorage 键：`crf:designer:col-widths:<form_id>:<table_kind>`；只有设计器写入，`TemplatePreviewDialog` / `SimulatedCRFForm` 仅读取。
- 行高 localStorage 键：`crf:designer:row-heights:<form_id>:<table_instance_id>`；设计器与访视预览共享读取 / 写入语义。
- 读取列宽缓存失败（非数组/元素越界/和不为 1）时回退内容驱动默认值。
- 跨栈 fixture：`backend/tests/fixtures/planner_cases.json` 同时被前端 `columnWidthPlanning.test.js` 与后端 `test_width_planning.py` 加载；**唯一权威生成器** `frontend/scripts/generatePlannerFixtures.mjs`，新增/修改 case 必须改 generator 后重跑。
- `.wp-form-title` 必须保持 `text-align: left` 与 Word 导出 `add_heading(level=1)` 默认左对齐对齐，由 `frontend/tests/wordPageGeometry.test.js` 锁住，禁止改回 `center` 或引入 `margin: 0 auto` 触发块居中。

## 认证与管理员交互
- 登录后由 `App.vue` 调用 `/api/auth/me` 获取 `username` 与 `is_admin`，再分流到管理员工作台或普通项目工作台。
- 管理员工作台不渲染普通项目列表、设计器与 CRF 编辑入口。
- 普通用户改密属于认证链路，需与后端 `auth.py`、`auth_service.py`、`rate_limit.py` 同步验证。
- 401 失效处理统一在 `useApi.js` 中处理，组件不应各自维护不一致的认证错误分支。
- `SessionTimer.vue` / `useSessionTimer.js` 仅解码本地 JWT `exp` 用于展示；真实有效性仍以后端鉴权为准；点击续期复用 `GET /api/auth/me` 与 `X-Refreshed-Token` 写回路径。

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
- `sessionTimer.test.js`：JWT `exp` 解码、会话剩余时间展示、临期提醒与点击续期。
- `rowHeightResize.test.js`：行高持久化、稳定行 key、整行 hover 指示线和设计器 / 访视预览拖拽锚点。
- `designerHistory.test.js`：撤销/恢复双栈上限 20、新操作清空 redo、undo/redo 栈迁移、删除撤销后的 id 重映射、数组 id 重映射、回放失败保栈与清空语义。
- `designerNewFieldDraft.test.js`：新增字段本地草稿——`newField` 不落库、`saveDraftField` 先建定义后建实例并入栈、草稿删除不调 DELETE、属性自动保存对草稿短路、切换前确认与排序/批量选择守卫、保存按钮与草稿行模板契约。
- `formDesignerPreviewModel.test.js`：表单设计器 / 模板预览派生视图模型与旧模板纯函数输出等价。
- `docxBimodalPreview.test.js`：Word 导入双栏截图证据面板、温和定位提示与调试日志清理。
- `wordPageGeometry.test.js`：Word 预览 A4 几何契约——`.word-page` 21cm×29.7cm、`.word-page.landscape` 翻转、`--word-page-margin-x/y` 变量、`@media print` 回退、`.designer-scaled-word-page` 保持 A4 几何而非 100% 宽度，以及 `inline-table` / `unified-table` 的 `table-layout: fixed` 与 `<colgroup>` 契约。
- `testProperty.js`：属性测试工具库（seeded 随机生成器、`forAll` runner），为契约与属性测试提供轻量替代 fast-check 的基础设施。

## 相关文件清单
| 类别 | 文件 |
|------|------|
| 入口 | `src/main.js`、`src/App.vue` |
| 组件 | `src/components/AdminView.vue`、`src/components/LoginView.vue`、`src/components/SessionTimer.vue`、`src/components/ProjectInfoTab.vue`、`src/components/CodelistsTab.vue`、`src/components/UnitsTab.vue`、`src/components/FieldsTab.vue`、`src/components/FormDesignerTab.vue`、`src/components/VisitsTab.vue`、`src/components/SimulatedCRFForm.vue`、`src/components/TemplatePreviewDialog.vue`、`src/components/DocxCompareDialog.vue`、`src/components/DocxScreenshotPanel.vue` |
| Composables | `src/composables/useApi.js`、`src/composables/useCRFRenderer.js`、`src/composables/formFieldPresentation.js`、`src/composables/formDesignerPreviewModel.js`、`src/composables/useColumnResize.js`、`src/composables/useRowResize.js`、`src/composables/useSessionTimer.js`、`src/composables/useDesignerHistory.js`、`src/composables/useOrderableList.js`、`src/composables/useSortableTable.js`、`src/composables/formDesignerPropertyEditor.js`、`src/composables/exportDownloadState.js`、`src/composables/visitPreviewLandscape.js`、`src/composables/useLazyTabs.js`、`src/composables/usePerfBaseline.js` |
| 样式 | `src/styles/main.css` |
| 配置 | `package.json`、`vite.config.js` |

## 变更记录
- `2026年6月15日`（任务 `06-15-designer-new-field-draft`）：新增字段改为本地草稿态。`newField` 不再立即落库，构造带完整本地 `field_definition` 的草稿（`id='__draft__'`、`__draft:true`）插入 `formFields` 并选中；顶栏「保存」按钮（`saveDraftField`）才依次 `POST field-definitions` + `POST forms/{id}/fields` 落库、替换草稿并作为一次「新建字段」入撤销栈。属性自动保存 watcher 对草稿短路为 `applyEditorToDraft` 本地写回；`removeField`、`openQuickEdit`、`toggleInline` 对草稿加函数级 guard，`addField` / `addLogRow` 落库前 `confirmDiscardDraft` 防止 `loadFormFields` 覆盖草稿；切换表单/选字段/再次新建前统一经 `confirmDiscardDraft`（保存/丢弃/取消）；草稿存在时禁止排序、草稿行不参与批量选择与 inline 快切。从字段库拖入已有定义的 `addField` 维持立即落库。测试目录 27→28（新增 `designerNewFieldDraft.test.js`，16 个用例），全量 257 passed。
- `2026年6月15日`（任务 `06-15-designer-undo-redo-20`）：新增设计器内存撤销/恢复。composables 14→15（新增 `useDesignerHistory.js`，undo/redo 双栈、上限 20、id 重映射、busy 锁），测试目录 26→27（新增 `designerHistory.test.js`，11 个用例）。`FormDesignerTab.vue` 顶栏新增「撤回」「恢复」按钮并绑定 Ctrl+Z / Ctrl+Y（焦点在输入控件内时让出原生撤销），六类操作（属性编辑/排序/新增/新建字段/删除/批量删除）接入历史；排序在拖拽与键盘两条路径均经 `recordReorderHistory` 入栈；属性回放对日志行与普通字段都回放颜色（与正向保存一致）；回放失败时快照还原本条记录 id 防止栈污染；后端无改动，删除逆操作复用现有 `POST /forms/{id}/fields`（携 `order_index` 与全属性）。
- `2026年6月14日`：文档同步刷新。组件 12→13（新增 `SessionTimer.vue`），composables 11→14（新增 `useSessionTimer.js`、`useRowResize.js`、`formDesignerPreviewModel.js`），测试目录 22→26（25 个 `.test.js` + `testProperty.js`，新增会话倒计时、行高拖拽、预览视图模型与 Docx 双栏证据面板相关回归）；补充会话续期、行高拖拽与预览模型缓存约定。
- `2026年5月12日 17:42:57`：增量扫描刷新。测试 21→22 文件（新增 `wordPageGeometry.test.js`，固化 Word 预览/导出的 A4 页面几何与表格布局 CSS 契约）；同步更新测试关注点列表。
- `2026年5月8日 18:26:34`：增量扫描刷新。测试 20→21 文件（新增 `testProperty.js`）；补充 `scripts/` 目录条目与测试工具说明。
- `2026年5月8日`：FormDesignerTab 备注展示迁移到顶栏/section-title、新增 per-form `paper_orientation` 控制与旧 `forceLandscape` 迁移；同步更新前端测试与样式。
- `2026年4月28日 星期二 08:31:55 PDT`：全量扫描刷新。源码 26 文件（组件 12、composables 11、样式 1、入口 2）、测试 20 文件。补充完整测试关注点列表与文件清单。
- `2026年4月27日 星期一 05:45:45 PDT`：初始生成。
