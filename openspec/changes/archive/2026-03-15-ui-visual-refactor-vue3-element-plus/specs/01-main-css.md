# Spec: main.css — CSS 变量系统与 Element Plus Token 契约

**Change ID**: ui-visual-refactor-vue3-element-plus
**Component Spec**: 01-main-css
**File**: `frontend/src/styles/main.css`
**Risk Level**: HIGH
**Execution Order**: ① 第一步（所有后续步骤的基础）

---

## 1. 改动类型

完全重写视觉层——**保留所有类名、保留所有功能逻辑**，仅更新颜色值、阴影、圆角等纯视觉属性。

---

## 2. 必须完成的改动

### 2.1 新增 `:root` CSS 变量系统

在文件**最顶部**（`element-plus/dist/index.css` 导入之后，其他样式之前）插入以下完整变量系统：

```css
:root {
  /* ——— 原子色板（Primitive Tokens）——— */
  --indigo-50:  #eef2ff;
  --indigo-100: #e0e7ff;
  --indigo-200: #c7d2fe;
  --indigo-300: #a5b4fc;
  --indigo-400: #818cf8;
  --indigo-500: #6366f1;   /* 主色 */
  --indigo-600: #4f46e5;   /* hover 态 */
  --indigo-700: #4338ca;
  --indigo-900: #1e1b4b;   /* 深靛蓝（侧边栏）*/

  /* ——— 语义 Token（Semantic Tokens）——— */
  --color-primary:        var(--indigo-500);
  --color-primary-dark:   var(--indigo-600);
  --color-primary-light:  var(--indigo-100);
  --color-primary-subtle: #f5f3ff;

  --color-sidebar-bg:     var(--indigo-900);
  --color-sidebar-item:   rgba(255,255,255,0.75);
  --color-sidebar-hover:  rgba(255,255,255,0.12);
  --color-sidebar-active: rgba(255,255,255,0.18);
  --color-sidebar-border: rgba(255,255,255,0.08);

  --color-header-bg:      var(--indigo-500);
  --color-header-text:    #ffffff;

  --color-bg-body:        #f1f5f9;
  --color-bg-card:        #ffffff;
  --color-bg-hover:       #f8fafc;
  --color-border:         #e2e8f0;
  --color-text-primary:   #1e293b;
  --color-text-secondary: #64748b;
  --color-text-muted:     #94a3b8;

  --color-success:        #22c55e;
  --color-warning:        #f59e0b;
  --color-danger:         #ef4444;
  --color-info:           #06b6d4;

  /* ——— 阴影 ——— */
  --shadow-sm:   0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md:   0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -1px rgba(0,0,0,0.04);
  --shadow-lg:   0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04);
  --shadow-page: 0 4px 24px rgba(0,0,0,0.10);

  /* ——— 圆角 ——— */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  /* ——— 间距 ——— */
  --space-xs:  4px;
  --space-sm:  8px;
  --space-md:  12px;
  --space-lg:  16px;
  --space-xl:  24px;
  --space-2xl: 32px;

  /* ——— 过渡 ——— */
  --transition-fast: 0.15s ease;
  --transition-std:  0.25s ease;
}
```

### 2.2 新增 Element Plus Token 契约

在 `:root` 变量声明**之后**立即添加 EP 主题覆盖（同一 `:root` 块或独立 `:root` 块均可）：

```css
:root {
  /* Element Plus 主题色覆盖 */
  --el-color-primary:           var(--color-primary);
  --el-color-primary-dark-2:    var(--color-primary-dark);
  --el-color-primary-light-3:   var(--indigo-300);
  --el-color-primary-light-5:   var(--indigo-200);
  --el-color-primary-light-7:   var(--indigo-100);
  --el-color-primary-light-8:   #ede9fe;
  --el-color-primary-light-9:   var(--color-primary-subtle);
  --el-border-radius-base:      var(--radius-sm);
  --el-border-radius-small:     var(--radius-sm);
  --el-border-radius-round:     var(--radius-md);
  --el-box-shadow-light:        var(--shadow-sm);
}
```

### 2.3 更新布局类颜色值

替换以下选择器中的硬编码颜色：

| 选择器 | 当前值 | 替换为 |
|--------|--------|--------|
| `.header` background | `#409eff`（硬编码） | `var(--color-header-bg)` |
| `.header` color | `#ffffff`（若有） | `var(--color-header-text)` |
| `.sidebar` background | 白色或旧蓝 | `var(--color-sidebar-bg)` |
| `.sidebar` color | 深色 | `var(--color-sidebar-item)` |
| `.form-designer` background | 灰色 | `var(--color-bg-body)` |
| `.project-item:hover` background | 旧色 | `var(--color-sidebar-hover)` |
| `.project-item.active` background | 旧色 | `var(--color-sidebar-active)` |
| `.fd-formlist`, `.fd-library`, `.fd-canvas` border/shadow | 无阴影 | `box-shadow: var(--shadow-sm)` + `border-radius: var(--radius-md)` |
| `.ff-item:hover` | 无阴影 | `box-shadow: var(--shadow-sm)` |
| `.ff-item.active` background | 旧色 | `var(--color-primary-light)` |
| `.word-page` 外层容器 | 无阴影 | `box-shadow: var(--shadow-page)` |
| `.matrix-table` 边框色 | 硬编码 | `var(--color-border)` |

### 2.4 保留 el-tabs 全高覆盖（C-05 红线）

以下选择器**绝对不改**，仅允许修改颜色值，不允许改 height/overflow/flex 等布局属性：

```css
/* 保留原有全高覆盖逻辑 */
.el-tabs__content { /* height 相关不改 */ }
.el-tab-pane { /* height 相关不改 */ }
```

### 2.5 全局 EP 组件覆盖（在文件末尾追加）

```css
/* ——— 全局 Element Plus 覆盖 ——— */
/* 这些覆盖写在文件末尾确保优先级 */

/* 按钮主色 */
.el-button--primary {
  --el-button-bg-color: var(--color-primary);
  --el-button-border-color: var(--color-primary);
  --el-button-hover-bg-color: var(--color-primary-dark);
  --el-button-hover-border-color: var(--color-primary-dark);
}

/* 输入框聚焦色 */
.el-input__wrapper.is-focus,
.el-textarea__inner:focus {
  box-shadow: 0 0 0 1px var(--color-primary) inset;
}

/* 弹窗圆角（全局 append-to-body） */
.el-dialog {
  border-radius: var(--radius-lg);
  overflow: hidden;
}

/* 表格头部 */
.el-table__header-wrapper th.el-table__cell {
  background-color: var(--color-primary-subtle);
  color: var(--color-text-primary);
}
```

---

## 3. 禁止改动

| 禁止项 | 原因 |
|--------|------|
| `.fill-line` 类名及其样式逻辑 | C-01：JS 字符串硬编码，v-html 渲染 |
| `.drag-handle` 类名 | C-02：vuedraggable handle 选择器 |
| `el-tabs__content` height/overflow | C-05：全高布局依赖 |
| 引入 Tailwind / Sass / @layer | 技术约束：仅原生 CSS |
| `@scope` 或 `@layer` CSS 规则 | Vite 7.3.1 兼容性约束 |

---

## 4. 内联样式审计要求

**在修改 main.css 之前**，必须用以下命令审计项目中所有内联样式：

```bash
# 查找所有含颜色值的内联样式
grep -rn "style=\".*#[0-9a-fA-F]\|style=\".*rgb\|style=\".*rgba" frontend/src/
```

main.css 的变量系统**不会自动覆盖**内联样式（inline style 优先级高于类选择器）。
内联样式中的硬编码颜色需要在各组件任务中单独处理。

---

## 5. 验证检查点

完成本任务后，运行：

```bash
cd frontend && npm run build
```

期望：零报错、零警告。

浏览器验证：
- [ ] 头部背景色为 Indigo `#6366f1`（非旧 `#409eff`）
- [ ] 侧边栏背景色为深靛蓝 `#1e1b4b`
- [ ] Element Plus 按钮主色跟随 Indigo
- [ ] `append-to-body` 弹窗圆角生效
