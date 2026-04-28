# Spec: 中等组件 — CodelistsTab / FieldsTab / VisitsTab / DocxCompareDialog / DocxScreenshotPanel

**Change ID**: ui-visual-refactor-vue3-element-plus
**Component Spec**: 04-medium-components
**Files**:
- `frontend/src/components/CodelistsTab.vue`
- `frontend/src/components/FieldsTab.vue`
- `frontend/src/components/VisitsTab.vue`
- `frontend/src/components/DocxCompareDialog.vue`
- `frontend/src/components/DocxScreenshotPanel.vue`
**Risk Level**: MEDIUM
**Execution Order**: ④ 第四步（依赖 01 + 02 + 03 完成）

---

## 1. 改动原则

中等复杂度组件。每个文件处理前必须先做**内联样式审计**，替换颜色值为 CSS 变量。
`<template>` 结构不变，业务逻辑不变，仅 `<style scoped>` 和内联颜色值升级。

---

## 2. CodelistsTab.vue

### 2.1 内联样式审计

```bash
grep -n "style=\"" frontend/src/components/CodelistsTab.vue
```

### 2.2 样式改动

```css
/* 左侧列表面板 */
.codelist-panel,
.codelist-list {
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  background: var(--color-bg-card);
}

/* 右侧选项编辑区 */
.option-editor,
.codelist-detail {
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  background: var(--color-bg-card);
}

/* 拖拽手柄（类名不变）*/
.drag-handle {
  color: var(--color-text-muted);
  transition: color var(--transition-fast);
}
.drag-handle:hover {
  color: var(--color-primary);
}

/* trailing_underscore 功能样式保留，颜色升级 */
.trailing-underscore,
.has-trailing-underscore {
  /* 若有颜色值，替换为对应 CSS 变量 */
}
```

### 2.3 禁止改动

| 禁止项 | 原因 |
|--------|------|
| `.drag-handle` 类名 | C-02 |
| `crf_codelistNameColWidth` localStorage key | C-07 |
| `trailing_underscore` 功能逻辑 | 业务逻辑 |

---

## 3. FieldsTab.vue

### 3.1 内联样式审计

```bash
grep -n "style=\"" frontend/src/components/FieldsTab.vue
```

### 3.2 样式改动

```css
/* 左侧字段列表 */
.fields-list,
.field-list-panel {
  box-shadow: var(--shadow-sm);
  border-radius: var(--radius-md);
}

/* 右侧属性面板（固定 320px 宽） */
.field-properties,
.property-panel {
  border-left: 1px solid var(--color-border);  /* 从硬编码颜色升级 */
  background: var(--color-bg-card);
}

/* 字段类型图标 */
.field-type-icon,
.field-type-badge {
  color: var(--color-primary);  /* 主色图标 */
}

/* 字段列表项 */
.field-item:hover {
  background: var(--color-bg-hover);
}
.field-item.selected {
  background: var(--color-primary-light);
  border-left: 3px solid var(--color-primary);
}
```

### 3.3 禁止改动

- `visibleFields` 计算逻辑
- 属性面板宽度（320px）的 CSS 值本身（若用户没有改动意图）

---

## 4. VisitsTab.vue

### 4.1 内联样式审计

```bash
grep -n "style=\"" frontend/src/components/VisitsTab.vue
```

⚠️ VisitsTab 的 matrix 表格中**可能存在大量动态内联样式**（行列样式计算），
对于动态绑定的 `:style` 对象，只替换颜色属性，不改布局属性。

### 4.2 样式改动

```css
/* Matrix 表格头部 */
.matrix-table th,
.visit-matrix-header {
  background: var(--color-primary-subtle);
  color: var(--color-text-primary);
}

/* 访视列/表单行悬停 */
.matrix-table tr:hover td {
  background: var(--color-bg-hover);
}

/* 选中单元格 */
.matrix-table .cell-checked {
  background: var(--color-primary-light);
}

/* 预览弹窗 */
:deep(.el-dialog) {
  border-radius: var(--radius-lg);
  overflow: hidden;
}
```

### 4.3 禁止改动

- 50%/50% 布局比例（不改）
- 两个预览弹窗的功能逻辑

---

## 5. DocxCompareDialog.vue

### 5.1 内联样式审计

```bash
grep -n "style=\"" frontend/src/components/DocxCompareDialog.vue
```

### 5.2 样式改动

```css
/* 对比面板容器 */
.compare-panel {
  box-shadow: var(--shadow-sm);
  border-radius: var(--radius-md);
}

/* 面板头部 */
.panel-header {
  background: var(--color-primary-subtle);
  border-bottom: 1px solid var(--color-border);
}

/* AI diff 摘要高亮 */
.ai-diff-summary {
  border-left: 3px solid var(--color-primary);
  padding-left: var(--space-sm);
  background: var(--color-primary-subtle);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
```

### 5.3 禁止改动

| 禁止项 | 原因 |
|--------|------|
| `ENABLE_LEFT_PREVIEW = false` | C-04：左侧预览临时禁用标志 |
| `viewMode: 'direct'\|'ai'` 逻辑 | C-13：AI 查看模式 |
| `dialogWidth` 相关逻辑 | 弹窗尺寸逻辑 |

---

## 6. DocxScreenshotPanel.vue（谨慎）

### 6.1 内联样式审计

```bash
grep -n "style=\"" frontend/src/components/DocxScreenshotPanel.vue
```

### 6.2 样式改动

```css
/* Spinner/Loading 动画颜色 */
.screenshot-spinner,
.loading-indicator {
  border-top-color: var(--color-primary);  /* 只改颜色，不改动画逻辑 */
}

/* 页面高亮区域 */
/* ⚠️ 重要：必须用 outline 或 box-shadow，不得用 border */
/* 原因：border 会改变 box model，导致图片位置偏移 */
.page-highlight {
  outline: 2px solid var(--color-primary);
  /* 或：box-shadow: 0 0 0 2px var(--color-primary); */
}

/* 状态指示器 */
.status-idle    { color: var(--color-text-muted); }
.status-starting,
.status-running { color: var(--color-warning); }
.status-done    { color: var(--color-success); }
.status-failed  { color: var(--color-danger); }
```

### 6.3 禁止改动

| 禁止项 | 原因 |
|--------|------|
| `setInterval`/`MAX_RETRIES`/`poll()` 轮询逻辑 | C-11：Word 截图异步任务 |
| `pageRanges`/`fieldPages` 数据结构 | 功能数据结构 |
| `.page-highlight` 的 `border` → 改为 `outline` | 避免 box model 变化（见上） |

---

## 7. 整批验证检查点

完成本批所有 5 个组件后验证：

- [ ] CodelistsTab 拖拽排序正常（C-02 验证）
- [ ] FieldsTab 字段列表可滚动，属性面板正常显示
- [ ] VisitsTab 访视-表单矩阵显示正常，预览弹窗可打开
- [ ] DocxCompareDialog 对比弹窗打开，左侧仍禁用（C-04 验证）
- [ ] DocxCompareDialog AI 模式（C-13）切换正常
- [ ] DocxScreenshotPanel 轮询状态显示颜色正确（C-11 功能不变）
- [ ] 所有弹窗主题与主界面一致（AC-4）
- [ ] `npm run build` 零报错
