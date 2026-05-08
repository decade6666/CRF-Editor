# Proposal: CRF-Editor 前端 UI 视觉重构

**Change ID**: ui-visual-refactor-vue3-element-plus
**Version**: 1.0.0
**Status**: Research Complete → Ready for Plan
**Date**: 2026-03-15
**Author**: CCG spec-research (Codex + Gemini 并行探索)

---

## 1. 一句话总结

在**零功能破坏**前提下，将 CRF-Editor 前端 UI 从扁平蓝 `#409eff` 升级为以 Indigo `#6366f1` 为主色的现代设计系统，建立 CSS 变量令牌体系，提升整体视觉质量。

---

## 2. 背景

CRF-Editor 前端（Vue 3 + Element Plus）当前使用老旧扁平蓝风格：

| 当前状态 | 目标状态 |
|---------|---------|
| 主色 `#409eff`（扁平蓝） | 主色 `#6366f1`（Indigo） |
| 硬编码颜色值散落各处 | 集中 CSS 变量令牌系统 |
| 侧边栏白色背景 | 侧边栏深靛蓝 `#1e1b4b` |
| 无阴影层次 | 柔和阴影 + 圆角卡片 |
| Element Plus 默认主题 | Indigo 主题覆盖 |

---

## 3. 研究约束摘要

### 3.1 发现的硬约束（13 条，全部来自代码逆向）

| # | 文件 | 约束项 | 发现来源 |
|---|------|--------|---------|
| C-01 | `useCRFRenderer.js` | `.fill-line` 类名 JS 字符串硬编码 | Codex 探索 |
| C-02 | 所有拖拽组件 | `.drag-handle` vuedraggable handle 选择器 | Codex 探索 |
| C-03 | `SimulatedCRFForm.vue` | `SimSun, STSong` 字体声明 | Codex 探索 |
| C-04 | `DocxCompareDialog.vue` | `ENABLE_LEFT_PREVIEW = false` 标志 | Codex 探索 |
| C-05 | `main.css` | `el-tabs__content` + `el-tab-pane` 全高覆盖 | Gemini 探索 |
| C-06 | `App.vue` | `provide('refreshKey')` / `inject('refreshKey')` | Codex 探索 |
| C-07 | 多组件 | localStorage 4 个 key 名 | Codex 探索 |
| C-08 | `FormDesignerTab.vue` | `fieldItemRefs` 可聚焦元素 (tabindex) | Codex 探索 |
| C-09 | `FormDesignerTab.vue` | `inline_mark` + `renderGroups` 横向表格逻辑 | Codex 探索 |
| C-10 | `FormDesignerTab.vue` | `Ctrl+↑↓` `handleKeydown` 处理器 | Codex 探索 |
| C-11 | `DocxScreenshotPanel.vue` | 轮询逻辑 (`setInterval/MAX_RETRIES/poll()`) | Codex 探索 |
| C-12 | `FormDesignerTab.vue` | `deletingFieldIds` Set 防重删除守卫 | Codex 探索 |
| C-13 | `DocxCompareDialog.vue` | `viewMode: 'direct'\|'ai'` 渲染逻辑 | Codex 探索 |

### 3.2 关键技术约束

- **导入顺序不可改变**：`element-plus/dist/index.css` → `main.css`（`main.js` 中）
- **`append-to-body` 弹窗**：必须通过全局 `:root` CSS 变量主题化，局部类名无法继承
- **CSS 框架限制**：不引入 Tailwind/Sass/CSS Modules，保持原生 CSS（Vite 7.3.1 约束）
- **Element Plus 版本锁定**：2.13.2，不升级

### 3.3 用户决策点（已确认）

| 决策点 | 选择 | 理由 |
|-------|------|------|
| 侧边栏配色 | 深色深靛蓝 `#1e1b4b` | 与 Indigo 主色系一致，专业感强 |
| CRF 预览处理 | 轻微美化（容器阴影） | 保守安全，字体/边框/内容不变 |
| CSS 变量化范围 | 全面变量化 | 颜色+阴影+圆角+间距全部提取到 `:root` |

---

## 4. 影响范围

### 受影响文件（12 个）

```
① frontend/src/styles/main.css          — 重写视觉层（核心）
② frontend/src/App.vue                  — Header/Sidebar/Tab 容器
③ frontend/src/components/ProjectInfoTab.vue      — 轻量
④ frontend/src/components/UnitsTab.vue            — 轻量
⑤ frontend/src/components/TemplatePreviewDialog.vue — 轻量
⑥ frontend/src/components/CodelistsTab.vue        — 中等
⑦ frontend/src/components/FieldsTab.vue           — 中等
⑧ frontend/src/components/VisitsTab.vue           — 中等
⑨ frontend/src/components/DocxCompareDialog.vue   — 中等
⑩ frontend/src/components/DocxScreenshotPanel.vue — 中等（谨慎）
⑪ frontend/src/components/FormDesignerTab.vue     — 最后/最谨慎（874行）
⑫ frontend/src/components/SimulatedCRFForm.vue    — 完全冻结（禁止修改）
```

### 不受影响

- 所有 JavaScript/TypeScript 业务逻辑
- 所有 Vue 3 `<template>` 结构（类名不变）
- `composables/` 目录
- `backend/` 目录
- `vite.config.js`、`main.js` 导入顺序

---

## 5. 设计方案摘要

详见 `design.md`，核心要点：

### 5.1 CSS 变量系统（`:root`）

```css
:root {
  --color-primary:       #6366f1;   /* Indigo 主色 */
  --color-primary-dark:  #4f46e5;   /* hover 态 */
  --color-sidebar-bg:    #1e1b4b;   /* 深靛蓝侧边栏 */
  --color-header-bg:     #6366f1;   /* 头部背景 */
  --color-bg-body:       #f1f5f9;   /* 主背景 */
  --shadow-sm:    0 1px 3px rgba(0,0,0,0.06);
  --shadow-page:  0 4px 24px rgba(0,0,0,0.10);
  --radius-md:    8px;
  --radius-lg:    12px;
}
```

### 5.2 Element Plus 主题覆盖

在 `:root` 中注入 `--el-color-primary` 等变量，覆盖 Element Plus 默认蓝色主题。

### 5.3 执行顺序（依赖关系）

```
① main.css → ② App.vue → ③ 轻量组件 → ④ 中等组件 → ⑤ FormDesignerTab（最后）
```

---

## 6. 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| `:deep()` 覆盖冲突 | 中 | 中 | 在 `main.css` 末尾集中写覆盖 |
| `append-to-body` 弹窗掉主题 | 高 | 中 | 全部用 CSS 变量（已在设计中确保） |
| 全高布局因样式变化塌陷 | 低 | 高 | 保留 `el-tabs__content` 全高覆盖 |
| FormDesignerTab 焦点管理破坏 | 低 | 高 | 只改纯视觉 CSS，不改结构 |
| CRF 预览与导出不一致 | 低 | 高 | SimulatedCRFForm 内部列为红线 |

---

## 7. 验收标准摘要

- **AC-1**：`npm run build` 零报错，`npm run dev` 无 console.error 新增
- **AC-2**：头部/侧边栏/按钮/表格主题色可见升级为 Indigo 系
- **AC-3**：13 条红线功能零回归（CRUD、拖拽、快捷键、localStorage、预览）
- **AC-4**：所有 `append-to-body` 弹窗主题与主界面一致

---

## 8. 下一步行动

```
研究阶段 ✅ COMPLETE

→ 运行 /ccg:spec-plan 生成可执行任务清单
```

完整规格说明见 `spec.md`，完整设计方案见 `design.md`。
