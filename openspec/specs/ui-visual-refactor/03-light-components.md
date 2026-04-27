# Spec: 轻量组件 — ProjectInfoTab / UnitsTab / TemplatePreviewDialog

**Change ID**: ui-visual-refactor-vue3-element-plus
**Component Spec**: 03-light-components
**Files**:
- `frontend/src/components/ProjectInfoTab.vue`
- `frontend/src/components/UnitsTab.vue`
- `frontend/src/components/TemplatePreviewDialog.vue`
**Risk Level**: LOW
**Execution Order**: ③ 第三步（依赖 01 + 02 完成）

---

## 1. 改动原则

三个组件均为**轻量改动**：仅 `<style scoped>` 中的颜色/阴影/圆角更新。
`<template>` 结构和 JS 逻辑**完全不改**。

---

## 2. ProjectInfoTab.vue

### 2.1 内联样式审计

```bash
grep -n "style=\"" frontend/src/components/ProjectInfoTab.vue
```

替换所有含颜色值的内联样式为 CSS 变量。保留布局值。

### 2.2 样式改动

```css
/* 表单容器 */
.project-form-container,
.form-wrapper {
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  background: var(--color-bg-card);
}

/* Logo 上传区域（若存在） */
.logo-upload-area {
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-md);
  transition: border-color var(--transition-fast);
}

.logo-upload-area:hover {
  border-color: var(--color-primary);
}
```

### 2.3 禁止改动

- `skipFormReset` 相关逻辑（不在 CSS 范围内，仅确认不涉及）

---

## 3. UnitsTab.vue

### 3.1 内联样式审计

```bash
grep -n "style=\"" frontend/src/components/UnitsTab.vue
```

### 3.2 样式改动

```css
/* 列表容器 */
.units-list,
.unit-container {
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  background: var(--color-bg-card);
}

/* 拖拽手柄颜色（类名必须保持 .drag-handle）*/
.drag-handle {
  color: var(--color-text-muted);   /* 从硬编码颜色升级 */
  transition: color var(--transition-fast);
}

.drag-handle:hover {
  color: var(--color-primary);
}

/* 单位列表项 */
.unit-item:hover {
  background: var(--color-bg-hover);
}
```

### 3.3 禁止改动

| 禁止项 | 原因 |
|--------|------|
| `.drag-handle` 类名 | C-02：vuedraggable handle 选择器 |
| `useOrderableList` composable 调用 | 业务逻辑冻结 |

---

## 4. TemplatePreviewDialog.vue

### 4.1 内联样式审计

```bash
grep -n "style=\"" frontend/src/components/TemplatePreviewDialog.vue
```

### 4.2 样式改动

```css
/* 弹窗样式（通过 :deep 覆盖）*/
:deep(.el-dialog) {
  border-radius: var(--radius-lg);
  overflow: hidden;
}

/* Loading 状态 */
.loading-state,
.preview-loading {
  color: var(--color-text-secondary);
}

/* Error 状态 */
.error-state,
.preview-error {
  color: var(--color-danger);
}
```

### 4.3 SimulatedCRFForm 冻结区

`TemplatePreviewDialog.vue` 内部嵌套的 `<SimulatedCRFForm>` 组件：
- **绝对不改**其内部样式
- 若对话框容器有 padding/margin 改动，必须确保 CRF 预览区域尺寸不受影响

---

## 5. 验证检查点

- [ ] ProjectInfoTab 表单容器有圆角和轻阴影
- [ ] UnitsTab 拖拽排序正常（`.drag-handle` 功能未破坏）
- [ ] TemplatePreviewDialog 弹窗圆角生效
- [ ] SimulatedCRFForm 预览：填写线、字体、横向表格显示正常
- [ ] 三个组件的 CRUD 操作均无报错
