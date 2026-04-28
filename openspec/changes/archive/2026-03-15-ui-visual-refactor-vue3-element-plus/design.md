# Design: CRF-Editor 前端 UI 视觉重构

**Change ID**: ui-visual-refactor-vue3-element-plus
**Version**: 1.0.0
**Date**: 2026-03-15

---

## 1. 设计系统

### 1.1 CSS 变量系统（`frontend/src/styles/main.css` `:root`）

```css
:root {
  /* ——— 主色 Indigo ——— */
  --color-primary:        #6366f1;   /* Element Plus 主色覆盖 */
  --color-primary-dark:   #4f46e5;   /* hover 态 */
  --color-primary-light:  #e0e7ff;   /* 选中背景 / badge */
  --color-primary-subtle: #f5f3ff;   /* 超轻背景 */

  /* ——— 侧边栏（深靛蓝）——— */
  --color-sidebar-bg:     #1e1b4b;
  --color-sidebar-item:   rgba(255,255,255,0.75);
  --color-sidebar-hover:  rgba(255,255,255,0.12);
  --color-sidebar-active: rgba(255,255,255,0.18);
  --color-sidebar-border: rgba(255,255,255,0.08);

  /* ——— 头部 ——— */
  --color-header-bg:      #6366f1;   /* 从 #409eff 升级 */
  --color-header-text:    #ffffff;

  /* ——— 内容区 ——— */
  --color-bg-body:        #f1f5f9;   /* 主背景 */
  --color-bg-card:        #ffffff;   /* 卡片白 */
  --color-bg-hover:       #f8fafc;   /* 行 hover */
  --color-border:         #e2e8f0;   /* 边框 */
  --color-text-primary:   #1e293b;   /* 主文字 */
  --color-text-secondary: #64748b;   /* 次要文字 */
  --color-text-muted:     #94a3b8;   /* 占位/禁用 */

  /* ——— 状态色 ——— */
  --color-success:        #22c55e;
  --color-warning:        #f59e0b;
  --color-danger:         #ef4444;
  --color-info:           #06b6d4;

  /* ——— 阴影 ——— */
  --shadow-sm:   0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md:   0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -1px rgba(0,0,0,0.04);
  --shadow-lg:   0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04);
  --shadow-page: 0 4px 24px rgba(0,0,0,0.10);  /* word-page 纸张悬浮 */

  /* ——— 圆角 ——— */
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-xl:   16px;

  /* ——— 间距 ——— */
  --space-xs:    4px;
  --space-sm:    8px;
  --space-md:    12px;
  --space-lg:    16px;
  --space-xl:    24px;
  --space-2xl:   32px;

  /* ——— 过渡 ——— */
  --transition-fast: 0.15s ease;
  --transition-std:  0.25s ease;
}
```

### 1.2 Element Plus 主题色覆盖

```css
/* 注入到 main.css（在 :root 后，在其他全局样式前） */
:root {
  --el-color-primary:              var(--color-primary);
  --el-color-primary-dark-2:       var(--color-primary-dark);
  --el-color-primary-light-3:      #a5b4fc;
  --el-color-primary-light-5:      #c7d2fe;
  --el-color-primary-light-7:      var(--color-primary-light);
  --el-color-primary-light-8:      #ede9fe;
  --el-color-primary-light-9:      var(--color-primary-subtle);
  --el-border-radius-base:         var(--radius-sm);
  --el-border-radius-small:        var(--radius-sm);
  --el-border-radius-round:        var(--radius-md);
  --el-box-shadow-light:           var(--shadow-sm);
}
```

---

## 2. 组件改造计划

### 执行顺序（依赖关系决定）

```
① main.css        → 建立变量系统 + 全局覆盖
② App.vue         → Header + Sidebar + Tab 容器
③ 轻量组件        → ProjectInfoTab / UnitsTab / TemplatePreviewDialog
④ 中等复杂组件    → CodelistsTab / FieldsTab / VisitsTab / DocxCompareDialog / DocxScreenshotPanel
⑤ FormDesignerTab → 最后、最谨慎
```

---

### 2.1 `frontend/src/styles/main.css`

**改动类型**：完全重写视觉层，保留所有类名和功能逻辑

| 选择器 | 改动 |
|--------|------|
| `:root` | 新增全部 CSS 变量 |
| `.header` | `background: var(--color-header-bg)`，移除硬编码 `#409eff` |
| `.sidebar` | `background: var(--color-sidebar-bg)`，文字色 `var(--color-sidebar-item)` |
| `.sidebar-resizer` | 颜色更新，hover 时用 `var(--color-primary)` |
| `.project-item` | hover/active 用 sidebar 变量，圆角 `var(--radius-md)` |
| `.form-designer` 容器 | `background: var(--color-bg-body)`，移除灰色 border |
| `.fd-formlist` / `.fd-library` / `.fd-canvas` | 面板加 `var(--shadow-sm)`，圆角 `var(--radius-md)` |
| `.ff-item` | hover 加 `var(--shadow-sm)`，active 用 `var(--color-primary-light)` |
| `.word-page` 容器 | 加 `box-shadow: var(--shadow-page)` 模拟纸张悬浮（内部不变） |
| `.fill-line` | **不改变**（仅保留已有下划线样式） |
| `.matrix-table` | 边框色用 `var(--color-border)` |
| Element Plus 全局 `:deep()` | `.el-button--primary` 主色覆盖、`.el-table` 头部背景、输入框聚焦色 |

---

### 2.2 `frontend/src/App.vue`

**改动类型**：`<style scoped>` 视觉属性更新，`<template>` 类名不变

| 区域 | 改动 |
|------|------|
| Header `.header` | 文字/图标色跟随变量，`box-shadow: var(--shadow-sm)` |
| Sidebar `.sidebar` | 过渡动画 `transition: var(--transition-std)` |
| `.project-item` | hover 效果用 CSS 变量，`border-radius: var(--radius-md)` |
| Tab 内容区 | `background: var(--color-bg-body)` |
| 弹窗（导出/导入/设置） | `:deep(.el-dialog)` 圆角 `var(--radius-lg)`，header 加微渐变 |
| `:deep(.docx-form-checkbox)` | 保留，颜色改用 CSS 变量（**选择器不改变**） |

**禁止改动**：`provide('refreshKey')`、`sidebarWidth` localStorage、resize 鼠标事件处理器

---

### 2.3 `frontend/src/components/ProjectInfoTab.vue`

**改动类型**：轻量，仅改表单容器和输入框样式

- 表单容器加 `border-radius: var(--radius-lg)` + `box-shadow: var(--shadow-sm)`
- logo 上传区域升级为虚线圆角框，hover 变主色边框
- 保留 `skipFormReset` 逻辑不变

---

### 2.4 `frontend/src/components/UnitsTab.vue`

**改动类型**：轻量

- 列表容器加 `border-radius: var(--radius-md)` + `var(--shadow-sm)`
- `.drag-handle` **类名不变**，图标颜色改为 `var(--color-text-muted)`，hover 改为 `var(--color-primary)`
- 保留 `useOrderableList` 拖拽逻辑不变

---

### 2.5 `frontend/src/components/TemplatePreviewDialog.vue`

**改动类型**：轻量

- `:deep(.el-dialog)` 加圆角 `var(--radius-lg)`
- loading/error 状态 UI 颜色用 CSS 变量
- `SimulatedCRFForm` 组件内部**不改**

---

### 2.6 `frontend/src/components/CodelistsTab.vue`

**改动类型**：中等

- 左侧列表面板加 `var(--shadow-sm)` + 圆角
- 右侧选项编辑区加卡片样式
- `.drag-handle` **类名不变**
- `crf_codelistNameColWidth` localStorage key **不变**
- `trailing_underscore` 功能样式保留

---

### 2.7 `frontend/src/components/FieldsTab.vue`

**改动类型**：中等

- 左侧字段列表加卡片阴影
- 右侧属性面板（320px）加 `border-left: 1px solid var(--color-border)`
- 字段类型选择图标颜色用主色变量
- `visibleFields` 逻辑**不变**

---

### 2.8 `frontend/src/components/VisitsTab.vue`

**改动类型**：中等

- 访视-表单 matrix 表格头部背景用 `var(--color-primary-subtle)`
- 访视列/表单行悬停效果用 CSS 变量
- 两个预览弹窗 `:deep(.el-dialog)` 加圆角
- 50%/50% 布局比例**不变**

---

### 2.9 `frontend/src/components/DocxCompareDialog.vue`

**改动类型**：中等

- `.compare-panel` 加 `box-shadow: var(--shadow-sm)` + 圆角
- `.panel-header` 改用 `var(--color-primary-subtle)` 背景
- `.ai-diff-summary` 加 Indigo 主题的左边框高亮
- `ENABLE_LEFT_PREVIEW = false` **绝对不改**
- `viewMode`/`dialogWidth` **不改**

---

### 2.10 `frontend/src/components/DocxScreenshotPanel.vue`

**改动类型**：中等（谨慎）

- spinner 动画 CSS 颜色改用 `var(--color-primary)`
- `.page-highlight` 边框色改为 `var(--color-primary)`
- status 状态显示（idle/starting/running/done/failed）颜色用语义变量
- **轮询逻辑（`setInterval`/`MAX_RETRIES`/`poll()`）绝对不改**
- `pageRanges`/`fieldPages` 数据结构**不改**

---

### 2.11 `frontend/src/components/FormDesignerTab.vue`

**改动类型**：最谨慎（874行，最复杂）

**允许改动**（纯视觉 CSS）：
- `.fd-formlist`/`.fd-library`/`.fd-canvas` 面板边框/阴影/圆角
- `.ff-item` hover/selected 状态颜色（用 CSS 变量）
- `.drag-handle` 颜色（**类名不变**）
- 属性面板标题/分隔线颜色

**严禁改动**：
- `fieldItemRefs`/`tabindex`/`focusField()` 相关
- `draggable`/`dragStart`/`dragEnd` HTML5 拖拽逻辑
- `handleKeydown` Ctrl+↑↓ 处理器
- `inline_mark`/`renderGroups` 横向表格逻辑
- `deletingFieldIds` Set
- `crf_libraryWidth`/`crf_propWidth` localStorage 逻辑

---

## 3. SimulatedCRFForm — 完全冻结区

`frontend/src/components/SimulatedCRFForm.vue` 列为**完全冻结区**。

**不得改动**：
- `font-family: SimSun, STSong, serif`
- `table` 结构和边框
- `.fill-line` 样式
- `viewMode: 'direct'|'ai'` 渲染逻辑
- 黄色 AI 高亮 (`background: #fffbe6`)

**允许的唯一改动**：
- 外层包裹容器（若有）的阴影 —— 等同于 `.word-page` 轻微美化策略

---

## 4. 关键 CSS 继承路径

```
main.js
  ├── import 'element-plus/dist/index.css'   ← EP 默认样式
  └── import './styles/main.css'             ← 覆盖层（顺序必须保持）

main.css
  ├── :root { CSS 变量 }
  ├── :root { --el-* 变量覆盖 EP 主题 }
  ├── 布局类（.header/.sidebar/.form-designer/...）
  └── 全局 EP 覆盖（.el-button/.el-table/.el-dialog/...）

组件 <style scoped>
  └── :deep(.el-*) 覆盖（仅局部使用）

append-to-body 弹窗
  └── 继承 :root CSS 变量（全局作用域，无需额外处理）
```

---

## 5. 验证检查清单

实施完成后，依次验证：

```bash
# 1. 构建
cd frontend && npm run build

# 2. 启动开发服务器
npm run dev

# 3. 浏览器检查（手动）
□ 头部 Indigo 主色正确
□ 侧边栏深靛蓝背景 + 白色文字
□ 所有 Tab 切换正常，无布局塌陷
□ Element Plus 按钮/表格主题色一致
□ 拖拽排序（单位/代码表选项）正常
□ FormDesigner Ctrl+↑↓ 排序正常
□ CRF 预览填写线/字体/横向表格正常
□ 弹窗（导入/导出/设置/预览）主题一致
□ 刷新后面板宽度恢复（localStorage）
□ console.error 零新增
```
