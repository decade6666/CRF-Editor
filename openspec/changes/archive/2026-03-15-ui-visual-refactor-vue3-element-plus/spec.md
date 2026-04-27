# Spec: CRF-Editor 前端 UI 视觉重构

**Change ID**: ui-visual-refactor-vue3-element-plus
**Version**: 1.0.0
**Status**: Proposed
**Date**: 2026-03-15

---

## 1. 背景与目标

CRF-Editor 前端（Vue 3 + Element Plus）当前使用扁平蓝 `#409eff` 作为主色的老旧视觉风格，缺乏现代感。本次变更为**纯视觉层重构**，在**零功能破坏**的前提下，升级为以 Indigo `#6366f1` 为主色的现代化设计系统，提升整体视觉质量和用户体验。

### 目标
1. 建立基于 CSS 变量的设计令牌系统（颜色 + 阴影 + 圆角 + 间距）
2. 升级全局配色方案（Indigo 主色 + 深色侧边栏）
3. 通过 `:deep()` 覆盖 Element Plus 组件外观，实现主题一致性
4. 提升布局层次感（卡片阴影、圆角、间距优化）

---

## 2. 功能范围（Scope）

### 2.1 In Scope

| 类别 | 描述 |
|------|------|
| CSS 变量系统 | 在 `main.css` 中建立 `:root` 变量，统一颜色/阴影/圆角/间距 |
| 全局配色升级 | Header、Sidebar 从扁平蓝升级为 Indigo 系 |
| Element Plus 覆盖 | 通过 `:deep()` 和全局 `.el-*` 类名升级按钮/表格/输入框/对话框外观 |
| 组件视觉微调 | 各 Tab 组件内 scoped `<style>` 的纯视觉改动（颜色/阴影/圆角） |
| 侧边栏深色化 | 侧边栏背景改为深靛蓝 `#1e1b4b`，搭配白色文字 |
| CRF预览容器美化 | 给 `.word-page` 外层容器加轻阴影，模拟纸张悬浮效果（内部不变） |

### 2.2 Out of Scope

| 类别 | 说明 |
|------|------|
| 功能逻辑修改 | 不触碰任何 JavaScript/TypeScript 业务逻辑 |
| 引入新 CSS 框架 | 不引入 Tailwind / Sass / CSS Modules，保持原生 CSS |
| 升级 Element Plus 版本 | 不升级依赖，当前锁定 2.13.2 |
| 响应式断点改造 | 不新增媒体查询或移动端适配 |
| SimulatedCRFForm 内部 | 不改变 CRF 纸质表格内的字体/边框/填写线渲染 |

---

## 3. 约束条件（Constraints）

### 3.1 硬约束（绝对不可违反）

| # | 约束项 | 来源 |
|---|--------|------|
| C-01 | `.fill-line` CSS 类名不可改变 | `useCRFRenderer.js` 在 JS 字符串中硬编码此类名并通过 `v-html` 渲染 |
| C-02 | `.drag-handle` CSS 类名不可改变 | `vuedraggable` 的 `handle=".drag-handle"` 行为选择器 |
| C-03 | `SimSun, STSong` 字体声明不可移除 | `SimulatedCRFForm.vue` 印刷模拟字体，影响与 Word 导出的视觉一致性 |
| C-04 | `ENABLE_LEFT_PREVIEW = false` 不可改 | `DocxCompareDialog.vue` 临时禁用标志，维持现有行为 |
| C-05 | `el-tabs__content` + `el-tab-pane` 全高覆盖不可删 | 支撑标签页全高滚动布局，删除导致内容区塌陷 |
| C-06 | `provide('refreshKey')` / `inject('refreshKey')` 不可改 | 跨组件刷新核心机制 |
| C-07 | `localStorage` 所有 key 名不可改 | 用户布局偏好持久化（侧边栏宽度等 4 个 key） |
| C-08 | `fieldItemRefs` 目标元素必须保持可聚焦 | FormDesignerTab 键盘排序依赖 `.focus()` |
| C-09 | `inline_mark` + `renderGroups` 逻辑不可改 | FormDesignerTab 横向表格渲染核心 |
| C-10 | `Ctrl+↑↓` `handleKeydown` 逻辑不可改 | FormDesignerTab 快捷键排序 |
| C-11 | `DocxScreenshotPanel` 轮询逻辑不可改 | Word 截图异步任务驱动 |
| C-12 | `deletingFieldIds` Set 防重删除逻辑不可改 | FormDesignerTab 防止重复删除的守卫 |
| C-13 | `viewMode: 'direct'\|'ai'` 逻辑不可改 | DocxCompareDialog AI 查看模式 |

### 3.2 软约束（尽量遵守）

- `append-to-body` 弹窗的主题必须通过**全局 CSS 变量**而非局部容器类实现，否则弹窗会掉主题
- `main.js` 中 Element Plus CSS → `main.css` 的导入顺序不可调换（覆盖顺序依赖）
- SimulatedCRFForm 中预览样式改动须保证与 Word 导出视觉接近

### 3.3 技术约束

- 框架：Vue 3.5.25 + Element Plus 2.13.2（不可替换/升级）
- 构建：Vite 7.3.1，仅支持原生 CSS，不引入预处理器
- CSS 变量：使用 `:root` 声明，不使用 `@layer` 或 `@scope`

---

## 4. 用户决策记录

| 决策点 | 用户选择 | 说明 |
|--------|---------|------|
| 侧边栏配色 | 深色（深靛蓝 `#1e1b4b`） | 与 Indigo 主色系一致，专业感强 |
| CRF预览处理 | 轻微美化（加容器阴影） | 保守安全，字体/边框/内容不变 |
| CSS变量化范围 | 全面变量化 | 颜色+阴影+圆角+间距全部提取到 `:root` |

---

## 5. 验收标准（Acceptance Criteria）

### AC-1：构建与运行
- [ ] `cd frontend && npm run build` 零报错、零警告
- [ ] 开发服务器 `npm run dev` 正常启动，浏览器无 console.error 新增

### AC-2：视觉改进
- [ ] 头部背景从扁平蓝 `#409eff` 升级为 Indigo `#6366f1`
- [ ] 侧边栏背景升级为深靛蓝 `#1e1b4b`
- [ ] Element Plus 组件（按钮/表格/输入框）主题色与 Indigo 统一
- [ ] 卡片/面板具备柔和阴影和圆角
- [ ] `.word-page` 容器具备轻阴影悬浮效果

### AC-3：功能零回归（13 条红线验证）
- [ ] 所有 Tab 的 CRUD 操作正常（项目信息/选项/单位/字段/表单/访视）
- [ ] 侧边栏/字段库/属性面板宽度拖拽后刷新仍保持（localStorage 持久化）
- [ ] UnitsTab + CodelistsTab 拖拽排序正常（`.drag-handle` 选择器）
- [ ] FormDesignerTab `Ctrl+↑↓` 键盘排序正常
- [ ] CRF 预览（SimulatedCRFForm）填写线、字体、横向表格正常显示
- [ ] Word 导入/导出功能正常
- [ ] AI 建议查看模式（viewMode 切换）正常
- [ ] DocxCompareDialog 对比弹窗正常（左侧仍禁用）
- [ ] DocxScreenshotPanel Word 截图轮询正常

### AC-4：弹窗主题一致性
- [ ] 所有 `append-to-body` 弹窗（导入/导出/设置/预览）视觉与主界面一致

---

## 6. 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| `:deep()` 覆盖与现有样式冲突 | 中 | 中 | 在 `main.css` 末尾集中写覆盖，优先级有保障 |
| `append-to-body` 弹窗不继承主题 | 高 | 中 | 所有主题色用 CSS 变量，弹窗自动继承 `:root` |
| 全高布局因圆角/边框变化而塌陷 | 低 | 高 | 保留 `el-tabs__content` 全高覆盖，仅调整视觉属性 |
| CRF预览字体/边框变化导致与导出不一致 | 低 | 高 | SimulatedCRFForm 内部样式列入红线，禁止修改 |
| FormDesignerTab 焦点管理破坏 | 低 | 高 | 字段列表项根节点结构不改，仅调整视觉类名 |
