# Spec: FormDesignerTab.vue — 最高风险组件（纯视觉 CSS，零业务改动）

**Change ID**: ui-visual-refactor-vue3-element-plus
**Component Spec**: 05-form-designer
**File**: `frontend/src/components/FormDesignerTab.vue`
**Risk Level**: HIGHEST（874 行，无 `<style>` 块，50+ 内联样式）
**Execution Order**: ⑤ 最后一步（依赖 01 + 02 + 03 + 04 全部完成）

---

## 1. 改动原则

FormDesignerTab 是**最高风险组件**，遵循最保守改动策略：

- **仅改颜色相关的内联样式** — 颜色值替换为 CSS 变量，布局值（width/height/padding/margin）**绝对不改**
- **无 `<style>` 块** — 本组件所有视觉依赖 `main.css` 全局样式（步骤①已处理）
- **不创建新的 `<style>` 块** — 如需增补局部样式，统一追加到 `main.css` 末尾
- `<template>` 结构：**一字不改**，类名不变，标签不变，属性不变（除内联颜色值外）
- JS/`<script>` 逻辑：**完全不改**

---

## 2. 内联样式审计（强制执行）

修改本文件前，**必须先运行以下命令**，完整列出所有内联样式：

```bash
# 列出所有内联 style 属性
grep -n "style=\"" frontend/src/components/FormDesignerTab.vue

# 列出所有动态绑定 :style
grep -n ":style=\"" frontend/src/components/FormDesignerTab.vue

# 额外检查含颜色值的内联样式
grep -n "style=.*#[0-9a-fA-F]\|style=.*rgb\|style=.*rgba" frontend/src/components/FormDesignerTab.vue
```

**审计结果处理规则**：

| 内联样式类型 | 处理方式 |
|------------|---------|
| 静态颜色值 `style="color: #xxx"` | 替换为对应 CSS 变量 |
| 静态背景色 `style="background: #xxx"` | 替换为对应 CSS 变量 |
| 动态颜色绑定 `:style="{ borderColor: isDragging ? '#xxx' : 'transparent' }"` | 替换颜色值为 CSS 变量（见 2.1 节） |
| 布局相关 `style="width: 280px"` | **不改** |
| 动态宽度 `:style="{ width: libraryWidth + 'px' }"` | **不改**（C-07 约束） |
| 动态 padding/margin | **不改** |

### 2.1 dragOverIdx 动态内联 border 颜色（特别注意）

⚠️ FormDesignerTab 中可能存在类似以下的动态内联 border 颜色：

```html
<!-- 示例：拖拽排序的 hover 指示器 -->
<div :style="{ borderTop: dragOverIdx === index ? '2px solid #409eff' : 'none' }">
```

**处理方式**：仅替换颜色字符串值，不改布局属性：

```html
<!-- 修改后 -->
<div :style="{ borderTop: dragOverIdx === index ? `2px solid var(--color-primary)` : 'none' }">
```

⚠️ 注意：若此处 `border` 会导致元素尺寸变化，改用 `outline` 或将 `box-shadow` 替代——但**必须先确认现有行为**，不要假设改动安全。若不确定，**保持原值不改**，在验证清单中标注。

---

## 3. 允许改动的 CSS 类（全部在 main.css 中）

FormDesignerTab 无自己的 `<style>` 块，所有 CSS 类依赖 `main.css` 全局定义。
步骤①（01-main-css）已处理大部分全局样式，本步骤仅处理**遗漏的特有类名**。

若发现以下类名在 `main.css` 中有硬编码颜色未升级，在 `main.css` 末尾追加：

```css
/* ——— FormDesignerTab 专属补丁（追加到 main.css 末尾）——— */

/* 表单设计区三面板 */
.fd-formlist,
.fd-library,
.fd-canvas {
  box-shadow: var(--shadow-sm);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
}

/* 字段库列表项 */
.ff-item {
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}

.ff-item:hover {
  background: var(--color-bg-hover);
  box-shadow: var(--shadow-sm);
}

.ff-item.active,
.ff-item.selected {
  background: var(--color-primary-light);
  border-left: 3px solid var(--color-primary);
}

/* 拖拽手柄（类名保持 .drag-handle，C-02）*/
.drag-handle {
  color: var(--color-text-muted);
  transition: color var(--transition-fast);
}

.drag-handle:hover {
  color: var(--color-primary);
}

/* 字段属性面板边框 */
.fd-prop-panel,
.field-prop-panel {
  border-left: 1px solid var(--color-border);
  background: var(--color-bg-card);
}
```

**注意**：追加前先检查这些选择器是否已在 `main.css` 中存在，避免重复定义。

---

## 4. 完全禁止改动项（红线）

### 4.1 JS/Script 红线

以下逻辑**绝对不改，不看，不碰**：

| 约束编号 | 禁止项 | 具体位置 | 原因 |
|---------|--------|----------|------|
| C-08 | `fieldItemRefs` + `tabindex` 焦点管理 | `<script>` 中 `fieldItemRefs` 相关代码 | 键盘导航依赖 |
| C-09 | `inline_mark` + `renderGroups` 横向表格 | `<script>` 中 `inline_mark` 逻辑 | CRF 横向渲染业务逻辑 |
| C-10 | `handleKeydown` / `Ctrl+↑↓` 处理器 | `<script>` 中 `handleKeydown` 函数 | 快捷键功能 |
| C-12 | `deletingFieldIds` Set 防重删除守卫 | `<script>` 中 `deletingFieldIds` | 防止并发删除 Bug |

### 4.2 Template 红线

| 禁止项 | 原因 |
|--------|------|
| 任何元素的 `class` 属性 | 结构冻结 |
| `tabindex` 属性值 | C-08：焦点管理依赖 |
| `@keydown`/`v-on:keydown` 绑定 | C-10：快捷键处理器 |
| `v-if`/`v-for`/`v-show` 逻辑 | 业务逻辑冻结 |

### 4.3 localStorage Key 红线（C-07）

以下 localStorage key 名**不得更改**（动态 `:style` 绑定中用到的 key 值）：

| Key 名 | 用途 |
|--------|------|
| `crf_libraryWidth` | 字段库面板宽度 |
| `crf_propWidth` | 属性面板宽度 |

动态宽度绑定（如 `:style="{ width: libraryWidth + 'px' }"`）**绝对不改**。

---

## 5. 特殊情况处理

### 5.1 无法判断是否安全的内联样式

如果遇到无法确定是否安全的内联颜色样式（如嵌套在复杂 `:style` 对象中），**保持原值不改**，并在代码旁加注释：

```html
<!-- TODO(ui-refactor): 此处颜色 #409eff 待确认是否可替换为 CSS 变量 -->
<div :style="complexStyle">
```

### 5.2 inline_mark 相关内联样式

`inline_mark` 功能涉及特殊的 CRF 渲染逻辑。若其周边有内联样式：
- 颜色属性可替换
- **任何影响 inline_mark 布局的 width/display/flex 属性——绝对不改**

---

## 6. 验证检查点

完成本组件后验证（所有检查点必须通过，不得有任何 SKIP）：

- [ ] `npm run build` 零报错、零警告
- [ ] 字段库面板（左侧）显示正常，可滚动
- [ ] 字段属性面板（右侧）显示正常，宽度可拖拽且刷新后恢复（C-07）
- [ ] 字段可拖拽排序，`.drag-handle` 功能正常（C-02）
- [ ] 字段列表项 hover/selected 状态颜色升级为 Indigo 系
- [ ] `tabindex` 焦点管理正常：Tab 键可在字段间导航（C-08）
- [ ] `Ctrl+↑` / `Ctrl+↓` 快捷键可移动字段（C-10）
- [ ] 删除字段无重复操作 Bug（C-12 — `deletingFieldIds` 守卫有效）
- [ ] `inline_mark` 横向表格字段显示正常（C-09）
- [ ] CRF 预览（点击"预览"按钮）横向表格、填写线正常（SimulatedCRFForm 未受影响）

---

## 7. 整批最终验证（完成全部 5 个 spec 后）

所有 5 个 spec 执行完毕后，执行完整回归验证：

### 7.1 构建验证
```bash
cd frontend && npm run build
```
期望：**零报错，零 warning**

### 7.2 13 条红线功能验证清单

| # | 约束 | 验证动作 | 期望结果 |
|---|------|---------|---------|
| C-01 | `.fill-line` | 打开任意 CRF 预览 | 填写线正常显示 |
| C-02 | `.drag-handle` | 在 UnitsTab/CodelistsTab/FormDesignerTab 拖拽 | 拖拽排序正常 |
| C-03 | `SimSun/STSong` | 导出 Word 文档 | 字体正确 |
| C-04 | `ENABLE_LEFT_PREVIEW` | 打开 DocxCompare 弹窗 | 左侧仍禁用 |
| C-05 | `el-tabs` 全高 | 切换各 Tab | 内容区全高显示，无塌陷 |
| C-06 | `refreshKey` | 切换项目 | UI 正确刷新 |
| C-07 | localStorage | 拖拽改变侧边栏/面板宽度，刷新 | 宽度恢复 |
| C-08 | `fieldItemRefs` | Tab 键在字段间切换 | 焦点正确跳转 |
| C-09 | `inline_mark` | 查看含横向字段的表单 | 横向布局正常 |
| C-10 | `handleKeydown` | `Ctrl+↑` / `Ctrl+↓` | 字段上下移动 |
| C-11 | 截图轮询 | 触发 Word 截图功能 | 状态图标颜色正确，轮询正常 |
| C-12 | `deletingFieldIds` | 快速连续点击删除 | 无重复删除 |
| C-13 | `viewMode` | DocxCompare 切换 AI/直接模式 | 两种模式正常 |

### 7.3 视觉验收标准

| 验收项 | 期望值 |
|--------|--------|
| AC-1 | `npm run build` 零报错 |
| AC-2 | 主色从 `#409eff` 升级为 `#6366f1`（Indigo） |
| AC-3 | 13 条红线全部零回归 |
| AC-4 | 所有 `append-to-body` 弹窗主题与主界面一致 |
