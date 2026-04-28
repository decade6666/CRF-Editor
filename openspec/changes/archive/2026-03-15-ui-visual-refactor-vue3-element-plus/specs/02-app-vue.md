# Spec: App.vue — 壳层、深色侧边栏、弹窗容器

**Change ID**: ui-visual-refactor-vue3-element-plus
**Component Spec**: 02-app-vue
**File**: `frontend/src/App.vue`
**Risk Level**: HIGH
**Execution Order**: ② 第二步（依赖 01-main-css 完成）

---

## 1. 改动类型

`<style scoped>` 视觉属性更新 + `:deep()` 弹窗圆角。
**`<template>` 结构不变，所有类名不变，所有 JS 逻辑不变。**

---

## 2. 必须完成的改动

### 2.1 Header 区域

```css
/* 更新 .header 相关样式 */
.header {
  background: var(--color-header-bg);    /* 从硬编码 #409eff 升级 */
  color: var(--color-header-text);
  box-shadow: var(--shadow-sm);          /* 新增：底部柔和阴影 */
}
```

### 2.2 Sidebar 区域

```css
.sidebar {
  background: var(--color-sidebar-bg);   /* 深靛蓝 #1e1b4b */
  transition: width var(--transition-std);  /* 新增：平滑过渡 */
}

.project-item {
  color: var(--color-sidebar-item);
  border-radius: var(--radius-md);       /* 新增：圆角 */
  transition: background var(--transition-fast);
}

.project-item:hover {
  background: var(--color-sidebar-hover);
}

.project-item.active,
.project-item.is-active {
  background: var(--color-sidebar-active);
}
```

⚠️ **严禁**：不在 `.sidebar` 容器内局部重写 `--el-color-primary`。
深色侧边栏内的 EP 组件（按钮、输入框、开关等）颜色必须通过全局 `:root` 变量控制，
否则会导致侧边栏内 EP 组件出现意外颜色变化。

### 2.3 Tab 内容区

```css
.tab-content,
.main-content {
  background: var(--color-bg-body);  /* 从白色/灰色升级 */
}
```

### 2.4 弹窗圆角（`:deep()` 覆盖）

```css
/* 导出/导入/设置等弹窗 */
:deep(.el-dialog) {
  border-radius: var(--radius-lg);
  overflow: hidden;
}

:deep(.el-dialog__header) {
  background: linear-gradient(
    135deg,
    var(--color-primary-subtle) 0%,
    var(--color-bg-card) 100%
  );
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-border);
}
```

### 2.5 保留 docx-form-checkbox 类（选择器不变）

```css
/* ⚠️ 选择器名称不可改，颜色改用 CSS 变量 */
:deep(.docx-form-checkbox) {
  /* 原有样式保留，颜色值替换为 CSS 变量 */
  /* 具体值查看现有代码，只替换颜色部分 */
}
```

---

## 3. 内联样式审计

在 `App.vue` `<template>` 中运行以下检查：

```bash
grep -n "style=\"" frontend/src/App.vue
```

对于每个找到的内联 style：
- 如果含有颜色值（`#xxx`, `rgb()`, `rgba()`）→ 替换为对应 CSS 变量
- 如果是布局值（`width`, `height`, `display`）→ **不改**

### 特别注意：侧边栏宽度动态样式

`sidebarWidth` 相关的动态 `:style` 绑定（如 `:style="{ width: sidebarWidth + 'px' }"`）
→ **绝对不改**（C-07：localStorage 持久化逻辑）

---

## 4. 禁止改动

| 禁止项 | 关联约束 |
|--------|---------|
| `provide('refreshKey')` / `inject('refreshKey')` 逻辑 | C-06 |
| `sidebarWidth` localStorage 读写逻辑 | C-07 |
| sidebar resize 鼠标事件处理器 | C-07 |
| `.sidebar-resizer` 的宽度/cursor/功能逻辑 | C-07 |
| `<template>` 中任何元素的 class 属性 | 结构冻结 |

---

## 5. 验证检查点

- [ ] 头部背景 Indigo，字体/图标白色清晰
- [ ] 侧边栏深靛蓝背景，项目名称白色文字
- [ ] 侧边栏宽度拖拽仍正常，刷新后宽度保持
- [ ] 导出/导入/设置弹窗圆角生效，主题一致
- [ ] `provide('refreshKey')` 刷新机制正常（切换项目测试）
