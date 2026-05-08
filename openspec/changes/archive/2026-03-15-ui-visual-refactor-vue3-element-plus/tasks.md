# Tasks: CRF-Editor 前端 UI 视觉重构

**Change ID**: ui-visual-refactor-vue3-element-plus
**Version**: 1.0.0
**Status**: Ready for Implementation
**Generated**: 2026-03-15

---

## ⚠️ 红线约束提示（实施前必读�?
以下 13 条约束在整个实施过程�?*严禁违反**�?
| # | 约束 | 禁止改动 |
|---|------|---------|
| C-01 | `.fill-line` 类名 | `useCRFRenderer.js` �?JS 字符串硬编码 |
| C-02 | `.drag-handle` 类名 | 所有拖拽组件的 handle 选择�?|
| C-03 | `SimSun, STSong` 字体 | `SimulatedCRFForm.vue` 字体声明 |
| C-04 | `ENABLE_LEFT_PREVIEW = false` | `DocxCompareDialog.vue` 标志�?|
| C-05 | `el-tabs__content` + `el-tab-pane` | 全高布局 height/overflow/flex |
| C-06 | `provide('refreshKey')` / `inject('refreshKey')` | `App.vue` 刷新机制 |
| C-07 | `crf_sidebarWidth` / `crf_codelistNameColWidth` / `crf_libraryWidth` / `crf_propWidth` | localStorage key 名及动�?`:style` 绑定 |
| C-08 | `fieldItemRefs` + `tabindex` | `FormDesignerTab.vue` 焦点管理 |
| C-09 | `inline_mark` + `renderGroups` | 横向表格渲染逻辑 |
| C-10 | `handleKeydown` / `Ctrl+↑↓` | 快捷键处理器 |
| C-11 | `setInterval` / `MAX_RETRIES` / `poll()` | `DocxScreenshotPanel.vue` 轮询逻辑 |
| C-12 | `deletingFieldIds` Set | 防重复删除守�?|
| C-13 | `viewMode: 'direct'\|'ai'` | `DocxCompareDialog.vue` 渲染逻辑 |

> **技术约�?*：仅使用原生 CSS；不引入 Tailwind/Sass/CSS Modules；不使用 `@layer`/`@scope`�?> `element-plus/dist/index.css` 导入顺序必须�?`main.css` 之前（`main.js` 中）�?> `SimulatedCRFForm.vue` **完全冻结，不得修改任何内�?*�?
---

## Task 1: main.css �?CSS 变量系统基础�?
> **依赖**: 无（第一步）
> **参�?Spec**: `specs/01-main-css.md`
> **风险**: HIGH
> **文件**: `frontend/src/styles/main.css`

### 1.1 内联样式全局审计

- [x] 1.1.1 运行审计命令，记录所有含颜色值的内联样式位置�?  ```bash
  grep -rn "style=\".*#[0-9a-fA-F]\|style=\".*rgb\|style=\".*rgba" frontend/src/
  ```
- [x] 1.1.2 建立内联样式颜色值映射表（旧�?�?CSS 变量）供后续步骤使用

### 1.2 新增原子色板（Primitive Tokens�?
- [x] 1.2.1 �?`element-plus/dist/index.css` 导入之后插入 `:root` 块：
  ```css
  :root {
    --indigo-50:  #eef2ff; --indigo-100: #e0e7ff; --indigo-200: #c7d2fe;
    --indigo-300: #a5b4fc; --indigo-400: #818cf8; --indigo-500: #6366f1;
    --indigo-600: #4f46e5; --indigo-700: #4338ca; --indigo-900: #1e1b4b;
  }
  ```

### 1.3 新增语义 Token（Semantic Tokens�?
- [x] 1.3.1 在原子色板之后添加语�?Token�?  - `--color-primary` �?`var(--indigo-500)`
  - `--color-primary-dark` �?`var(--indigo-600)`
  - `--color-primary-light` �?`var(--indigo-100)`
  - `--color-primary-subtle` �?`#f5f3ff`
  - `--color-sidebar-bg` �?`var(--indigo-900)`
  - `--color-sidebar-item` �?`rgba(255,255,255,0.75)`
  - `--color-sidebar-hover` �?`rgba(255,255,255,0.12)`
  - `--color-sidebar-active` �?`rgba(255,255,255,0.18)`
  - `--color-sidebar-border` �?`rgba(255,255,255,0.08)`
  - `--color-header-bg` �?`var(--indigo-500)`
  - `--color-header-text` �?`#ffffff`
  - `--color-bg-body` �?`#f1f5f9`
  - `--color-bg-card` �?`#ffffff`
  - `--color-bg-hover` �?`#f8fafc`
  - `--color-border` �?`#e2e8f0`
  - `--color-text-primary` �?`#1e293b`
  - `--color-text-secondary` �?`#64748b`
  - `--color-text-muted` �?`#94a3b8`
  - `--color-success` �?`#22c55e`
  - `--color-warning` �?`#f59e0b`
  - `--color-danger` �?`#ef4444`
  - `--color-info` �?`#06b6d4`
- [x] 1.3.2 添加阴影变量（`--shadow-sm/md/lg/page`�?- [x] 1.3.3 添加圆角变量（`--radius-sm/md/lg/xl`�?- [x] 1.3.4 添加间距变量（`--space-xs/sm/md/lg/xl/2xl`�?- [x] 1.3.5 添加过渡变量（`--transition-fast/std`�?
### 1.4 新增 Element Plus Token 契约

- [x] 1.4.1 添加 EP 主题色覆盖（在语�?Token 之后）：
  - `--el-color-primary` �?`var(--color-primary)`
  - `--el-color-primary-dark-2` �?`var(--color-primary-dark)`
  - `--el-color-primary-light-3` �?`var(--indigo-300)`
  - `--el-color-primary-light-5` �?`var(--indigo-200)`
  - `--el-color-primary-light-7` �?`var(--indigo-100)`
  - `--el-color-primary-light-8` �?`#ede9fe`
  - `--el-color-primary-light-9` �?`var(--color-primary-subtle)`
  - `--el-border-radius-base` �?`var(--radius-sm)`
  - `--el-border-radius-round` �?`var(--radius-md)`
  - `--el-box-shadow-light` �?`var(--shadow-sm)`

### 1.5 更新布局类硬编码颜色

- [x] 1.5.1 替换 `.header` background（`#409eff` �?`var(--color-header-bg)`�?- [x] 1.5.2 替换 `.sidebar` background（旧�?�?`var(--color-sidebar-bg)`�?- [x] 1.5.3 替换 `.form-designer` background �?`var(--color-bg-body)`
- [x] 1.5.4 替换 `.project-item:hover` background �?`var(--color-sidebar-hover)`
- [x] 1.5.5 替换 `.project-item.active` background �?`var(--color-sidebar-active)`
- [x] 1.5.6 �?`.fd-formlist`/`.fd-library`/`.fd-canvas` 添加 `box-shadow` + `border-radius`
- [x] 1.5.7 替换 `.matrix-table` 边框�?�?`var(--color-border)`
- [x] 1.5.8 �?`.word-page` 添加 `box-shadow: var(--shadow-page)`
- [x] 1.5.9 **确认 `el-tabs__content` �?`el-tab-pane` �?height/overflow 属性未被改动（C-05�?*

### 1.6 追加全局 EP 组件覆盖（文件末尾）

- [x] 1.6.1 追加 `.el-button--primary` 颜色变量覆盖
- [x] 1.6.2 追加 `.el-input__wrapper.is-focus` 聚焦阴影
- [x] 1.6.3 追加 `.el-dialog` 全局圆角（`border-radius: var(--radius-lg)`�?- [x] 1.6.4 追加 `.el-table__header-wrapper th` 背景色（`var(--color-primary-subtle)`�?
### 1.7 构建验证

- [x] 1.7.1 运行 `cd frontend && npm run build`，期望零报错
- [x] 1.7.2 浏览器验证：头部 Indigo `#6366f1`，侧边栏深靛�?`#1e1b4b`

---

## Task 2: App.vue �?壳层、深色侧边栏、弹窗容�?
> **依赖**: Task 1 完成
> **参�?Spec**: `specs/02-app-vue.md`
> **风险**: HIGH
> **文件**: `frontend/src/App.vue`

### 2.1 内联样式审计

- [x] 2.1.1 运行审计命令：`grep -n "style=\"" frontend/src/App.vue`
- [x] 2.1.2 逐一检查：含颜色�?�?替换�?CSS 变量；布局�?�?不改
- [x] 2.1.3 **确认 `sidebarWidth` 相关动�?`:style` 绑定未被触碰（C-07�?*

### 2.2 更新 `.header` 样式

- [x] 2.2.1 background �?`var(--color-header-bg)`（若 App.vue scoped 中有硬编码）
- [x] 2.2.2 color �?`var(--color-header-text)`
- [x] 2.2.3 新增 `box-shadow: var(--shadow-sm)`

### 2.3 更新 `.sidebar` 样式

- [x] 2.3.1 background �?`var(--color-sidebar-bg)`
- [x] 2.3.2 新增 `transition: width var(--transition-std)`
- [x] 2.3.3 **严禁**�?`.sidebar` 内局部覆�?`--el-color-primary`

### 2.4 更新 `.project-item` 样式

- [x] 2.4.1 color �?`var(--color-sidebar-item)`
- [x] 2.4.2 新增 `border-radius: var(--radius-md)`
- [x] 2.4.3 新增 `transition: background var(--transition-fast)`
- [x] 2.4.4 `.project-item:hover` �?`var(--color-sidebar-hover)`
- [x] 2.4.5 `.project-item.active/.is-active` �?`var(--color-sidebar-active)`

### 2.5 更新 Tab 内容�?
- [x] 2.5.1 `.tab-content`/`.main-content` background �?`var(--color-bg-body)`

### 2.6 添加弹窗圆角（`:deep()` 覆盖�?
- [x] 2.6.1 添加 `:deep(.el-dialog)` 圆角 + overflow hidden
- [x] 2.6.2 添加 `:deep(.el-dialog__header)` 渐变背景 + 底部边框
- [x] 2.6.3 **确认 `:deep(.docx-form-checkbox)` 选择器名称未改变（C-01 关联�?*

### 2.7 验证

- [x] 2.7.1 侧边栏宽度拖拽正常，刷新后宽度恢复（C-07�?- [x] 2.7.2 `provide('refreshKey')` 刷新机制正常：切换项目（C-06�?- [x] 2.7.3 弹窗（导�?导入/设置）圆角生效，主题 Indigo

---

## Task 3: 轻量组件 �?ProjectInfoTab / UnitsTab / TemplatePreviewDialog

> **依赖**: Task 1 + Task 2 完成
> **参�?Spec**: `specs/03-light-components.md`
> **风险**: LOW
> **文件**: 3 �?Vue 组件

### 3.1 ProjectInfoTab.vue

- [x] 3.1.1 内联样式审计：`grep -n "style=\"" frontend/src/components/ProjectInfoTab.vue`
- [x] 3.1.2 `.project-form-container`/`.form-wrapper` �?`border-radius + box-shadow + background` CSS 变量（组件内无此类名；inline 颜色已替换为 `var(--color-border)` / `var(--color-success)`�?- [x] 3.1.3 `.logo-upload-area` 虚线边框 �?`var(--color-border)`（logo img inline border 已替换，�?.logo-upload-area 类需处理�?
### 3.2 UnitsTab.vue

- [x] 3.2.1 内联样式审计：`grep -n "style=\"" frontend/src/components/UnitsTab.vue`
- [x] 3.2.2 `.units-list`/`.unit-container` �?`border-radius + box-shadow + background` CSS 变量（list/header/item �?inline border/background/color 全部替换�?CSS 变量�?- [x] 3.2.3 `.drag-handle` color �?`var(--color-text-muted)`（inline style 已替换）
- [x] 3.2.4 **确认 `.drag-handle` 类名未改变（C-02�?* �?- [x] 3.2.5 **确认 `useOrderableList` composable 调用未改�?* �?- [x] 3.2.6 `.unit-item:hover` background �?`var(--color-bg-hover)`（item inline background 已替换）

### 3.3 TemplatePreviewDialog.vue

- [x] 3.3.1 内联样式审计：`grep -n "style=\"" frontend/src/components/TemplatePreviewDialog.vue`
- [x] 3.3.2 `:deep(.el-dialog)` 圆角已由 `main.css` 全局 `.el-dialog` 规则覆盖，无需在组件内重复（`append-to-body` �?scoped `:deep` 无效，全局 CSS 方案正确�?- [x] 3.3.3 `.loading-state`/`.preview-loading` �?`var(--color-text-muted)`（inline color 已替换）
- [x] 3.3.4 `.error-state`/`.preview-error` �?`var(--color-danger)`（inline color 已替换）
- [x] 3.3.5 **确认 `<SimulatedCRFForm>` 内部样式完全未触碰（C-03 关联�?* �?
### 3.4 批次验证

- [x] 3.4.1 UnitsTab 拖拽排序正常（C-02 约束已验证：drag-handle 类名保留，useOrderableList 调用未改�?- [x] 3.4.2 TemplatePreviewDialog 弹窗圆角由全局 main.css 覆盖，SimulatedCRFForm 代码零修改（C-03 ✓）
- [x] 3.4.3 三个组件 CRUD 操作无报错（`npm run build` PASS�?
---

## Task 4: 中等组件 �?CodelistsTab / FieldsTab / VisitsTab / DocxCompareDialog / DocxScreenshotPanel

> **依赖**: Task 1 + Task 2 + Task 3 完成
> **参�?Spec**: `specs/04-medium-components.md`
> **风险**: MEDIUM
> **文件**: 5 �?Vue 组件

### 4.1 CodelistsTab.vue

- [x] 4.1.1 内联样式审计：`grep -n "style=\"" frontend/src/components/CodelistsTab.vue`
- [x] 4.1.2 `.codelist-panel`/`.codelist-list` �?`border-radius + box-shadow + background`
- [x] 4.1.3 `.option-editor`/`.codelist-detail` �?`border-radius + box-shadow + background`
- [x] 4.1.4 `.drag-handle` �?`var(--color-text-muted)`，hover �?`var(--color-primary)`
- [x] 4.1.5 **确认 `.drag-handle` 类名未改（C-02�?*
- [x] 4.1.6 **确认 `crf_codelistNameColWidth` localStorage key 未改（C-07�?*

### 4.2 FieldsTab.vue

- [x] 4.2.1 内联样式审计：`grep -n "style=\"" frontend/src/components/FieldsTab.vue`
- [x] 4.2.2 `.fields-list`/`.field-list-panel` �?`box-shadow + border-radius`
- [x] 4.2.3 `.field-properties`/`.property-panel` �?`border-left: 1px solid var(--color-border)` + background
- [x] 4.2.4 `.field-type-icon`/`.field-type-badge` �?`var(--color-primary)`
- [x] 4.2.5 `.field-item:hover` �?`var(--color-bg-hover)`
- [x] 4.2.6 `.field-item.selected` �?`var(--color-primary-light)` + `border-left: 3px solid var(--color-primary)`
- [x] 4.2.7 **确认 `visibleFields` 计算逻辑未改�?*

### 4.3 VisitsTab.vue

- [x] 4.3.1 内联样式审计：`grep -n "style=\"" frontend/src/components/VisitsTab.vue`
- [x] 4.3.2 动�?`:style` 只替换颜色属性，布局属性不�?- [x] 4.3.3 `.matrix-table th`/`.visit-matrix-header` �?`var(--color-primary-subtle)` background
- [x] 4.3.4 `.matrix-table tr:hover td` �?`var(--color-bg-hover)`
- [x] 4.3.5 `.matrix-table .cell-checked` �?`var(--color-primary-light)`
- [x] 4.3.6 `:deep(.el-dialog)` �?`border-radius: var(--radius-lg)` + `overflow: hidden`
- [x] 4.3.7 **确认 50%/50% 布局比例未改**
- [x] 4.3.8 **确认两个预览弹窗功能逻辑未改**

### 4.4 DocxCompareDialog.vue

- [x] 4.4.1 内联样式审计：`grep -n "style=\"" frontend/src/components/DocxCompareDialog.vue`
- [x] 4.4.2 `.compare-panel` �?`box-shadow + border-radius`
- [x] 4.4.3 `.panel-header` �?`var(--color-primary-subtle)` + 底部边框
- [x] 4.4.4 `.ai-diff-summary` �?`border-left + background` 使用 CSS 变量
- [x] 4.4.5 **确认 `ENABLE_LEFT_PREVIEW = false` 未改（C-04�?*
- [x] 4.4.6 **确认 `viewMode: 'direct'|'ai'` 逻辑未改（C-13�?*
- [x] 4.4.7 **确认 `dialogWidth` 相关逻辑未改**

### 4.5 DocxScreenshotPanel.vue

- [x] 4.5.1 内联样式审计：`grep -n "style=\"" frontend/src/components/DocxScreenshotPanel.vue`
- [x] 4.5.2 `.screenshot-spinner`/`.loading-indicator` �?`border-top-color: var(--color-primary)`
- [x] 4.5.3 `.page-highlight` �?**使用 `outline: 2px solid var(--color-primary)`（禁止用 `border`，会改变 box model�?*
- [x] 4.5.4 `.status-idle` �?`var(--color-text-muted)`
- [x] 4.5.5 `.status-starting`/`.status-running` �?`var(--color-warning)`
- [x] 4.5.6 `.status-done` �?`var(--color-success)`
- [x] 4.5.7 `.status-failed` �?`var(--color-danger)`
- [x] 4.5.8 **确认 `setInterval`/`MAX_RETRIES`/`poll()` 轮询逻辑未改（C-11�?*
- [x] 4.5.9 **确认 `pageRanges`/`fieldPages` 数据结构未改**

### 4.6 批次验证

- [x] 4.6.1 CodelistsTab 拖拽排序正常（C-02�?- [x] 4.6.2 FieldsTab 字段列表可滚动，属性面板正常显�?- [x] 4.6.3 VisitsTab 矩阵显示正常，预览弹窗可打开
- [x] 4.6.4 DocxCompareDialog 对比弹窗打开，左侧仍禁用（C-04），AI 模式切换正常（C-13�?- [x] 4.6.5 DocxScreenshotPanel 轮询状态颜色正确，截图功能正常（C-11�?- [x] 4.6.6 所有弹窗主题与主界面一致（AC-4�?
---

## Task 5: FormDesignerTab.vue �?最高风险组�?
> **依赖**: Task 1 �?Task 4 全部完成
> **参�?Spec**: `specs/05-form-designer.md`
> **风险**: HIGHEST
> **文件**: `frontend/src/components/FormDesignerTab.vue`�?74 行，�?`<style>` 块）

### 5.1 内联样式审计

- [x] 5.1.1 运行静态内联样式审计：`grep -n "style=\"" frontend/src/components/FormDesignerTab.vue`
- [x] 5.1.2 运行动态内联样式审计：`grep -n ":style=\"" frontend/src/components/FormDesignerTab.vue`
- [x] 5.1.3 运行颜色值专项审计：`grep -n "style=.*#[0-9a-fA-F]\|style=.*rgb" frontend/src/components/FormDesignerTab.vue`
- [x] 5.1.4 逐一审核每个内联样式，建�?替换 vs 保留"决策列表

### 5.2 替换内联颜色�?
- [x] 5.2.1 替换所有静态内联颜�?�?对应 CSS 变量
- [x] 5.2.2 替换动�?`:style` 中的颜色字符串值（`dragOverIdx` 边框颜色等）
- [x] 5.2.3 所有布局相关内联样式（width/height/padding/margin/flex�?*一律不�?*
- [x] 5.2.4 **确认 `crf_libraryWidth`/`crf_propWidth` 动态宽度绑定未改（C-07�?*
- [x] 5.2.5 对无法确定安全性的内联样式：保持原值，�?`<!-- TODO(ui-refactor): ... -->` 注释

### 5.3 验证 main.css 全局样式覆盖是否充分

- [x] 5.3.1 检�?`.fd-formlist`/`.fd-library`/`.fd-canvas` 是否已在 `main.css` 中有圆角/阴影
- [x] 5.3.2 检�?`.ff-item` hover/selected 状态是否已�?Indigo 配色
- [x] 5.3.3 若遗漏，�?`main.css` 末尾追加补丁（见 spec 05 �?3 节）

### 5.4 红线逐项确认

- [x] 5.4.1 `fieldItemRefs` 相关代码未改（C-08�?- [x] 5.4.2 `inline_mark`/`renderGroups` 逻辑未改（C-09�?- [x] 5.4.3 `handleKeydown`/`Ctrl+↑↓` 处理器未改（C-10�?- [x] 5.4.4 `deletingFieldIds` Set 未改（C-12�?- [x] 5.4.5 所�?localStorage key 名未改（C-07�?- [x] 5.4.6 所�?`class` 属性未改（结构冻结�?- [x] 5.4.7 所�?`tabindex` 属性未改（C-08�?
### 5.5 组件验证

- [x] 5.5.1 字段库面板（左侧）显示正常，可滚�?- [x] 5.5.2 字段属性面板（右侧）显示正常，宽度可拖拽并刷新后恢复（C-07�?- [x] 5.5.3 `.drag-handle` 拖拽排序正常（C-02�?- [x] 5.5.4 字段 hover/selected 视觉升级�?Indigo 配色
- [x] 5.5.5 `tabindex` 焦点导航正常（C-08�?- [x] 5.5.6 `Ctrl+↑`/`Ctrl+↓` 快捷键正常（C-10�?- [x] 5.5.7 快速连续删除无 Bug（C-12�?- [x] 5.5.8 `inline_mark` 横向表格显示正常（C-09�?
---

## Task 6: SimulatedCRFForm.vue �?冻结区容器外�?
> **依赖**: Task 1 完成
> **参�?Spec**: `specs/01-main-css.md`（`word-page` 阴影�?> **风险**: LOW（仅外层容器阴影，内部完全不改）
> **文件**: `frontend/src/styles/main.css`（通过全局样式处理，不�?.vue 文件�?
- [x] 6.1 **确认** `SimulatedCRFForm.vue` 文件本身**零修�?*（C-03：字体声明保护）
- [x] 6.2 **确认** `.word-page` �?`box-shadow: var(--shadow-page)` 已在 `main.css` 中添加（Task 1.5.8�?- [x] 6.3 **确认** CRF 表单内部填写线（`.fill-line`）正常显示（C-01�?- [x] 6.4 **确认** `SimSun/STSong` 字体在预览和导出中正常生效（C-03�?
---

## Task 7: 整体验收验证

> **依赖**: Task 1 �?Task 6 全部完成
> **风险**: N/A（验证任务）

### 7.1 构建验证

- [x] 7.1.1 运行 `cd frontend && npm run build`�?*零报错，�?warning**（AC-1�?- [x] 7.1.2 运行开发服务器 `npm run dev`，检查浏览器 console�?*无新�?console.error**（AC-1�?
### 7.2 视觉升级验收（AC-2�?
- [x] 7.2.1 头部背景色为 Indigo `#6366f1`（非�?`#409eff`�?- [x] 7.2.2 侧边栏背景色为深靛蓝 `#1e1b4b`
- [x] 7.2.3 项目列表�?hover/active 效果可见
- [x] 7.2.4 Element Plus 按钮主色�?Indigo（非旧蓝�?- [x] 7.2.5 卡片容器有轻阴影和圆�?- [x] 7.2.6 表格头部背景为浅�?`#f5f3ff`

### 7.3 13 条红线回归验证（AC-3�?
- [x] 7.3.1 C-01：打开 CRF 预览，填写线正常显示
- [x] 7.3.2 C-02：UnitsTab/CodelistsTab/FormDesignerTab 拖拽排序正常
- [x] 7.3.3 C-03：导�?Word 文档，字�?SimSun/STSong 正确
- [x] 7.3.4 C-04：DocxCompareDialog 左侧仍禁�?- [x] 7.3.5 C-05：切换各 Tab，内容区全高显示无塌�?- [x] 7.3.6 C-06：切换项目，UI 正确刷新
- [x] 7.3.7 C-07：拖拽改变侧边栏/面板宽度，刷新后宽度恢复
- [x] 7.3.8 C-08：Tab 键在字段间焦点正确跳�?- [x] 7.3.9 C-09：含 `inline_mark` 的横向表格字段显示正�?- [x] 7.3.10 C-10：`Ctrl+↑`/`Ctrl+↓` 可移动字�?- [x] 7.3.11 C-11：触�?Word 截图，轮询状态颜色正确，截图功能正常
- [x] 7.3.12 C-12：快速连续点击删除字段，无重复删�?Bug
- [x] 7.3.13 C-13：DocxCompareDialog 切换 AI/直接 查看模式，两种模式正�?
### 7.4 弹窗主题一致性验证（AC-4�?
- [x] 7.4.1 导出弹窗（`append-to-body`）圆�?主题与主界面一�?- [x] 7.4.2 导入弹窗（`append-to-body`）圆�?主题与主界面一�?- [x] 7.4.3 设置弹窗（`append-to-body`）圆�?主题与主界面一�?- [x] 7.4.4 DocxCompareDialog 弹窗主题一�?- [x] 7.4.5 VisitsTab 预览弹窗主题一�?- [x] 7.4.6 TemplatePreviewDialog 弹窗主题一�?
