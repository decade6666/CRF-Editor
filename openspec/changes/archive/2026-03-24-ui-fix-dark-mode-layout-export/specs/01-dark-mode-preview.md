# Spec 01 — 暗色模式预览窗口

## 目标

`.word-page` 预览面板在暗色模式下使用暗纸风格背景和适配的文本/边框颜色。

---

## 前提条件

- `html[data-theme="dark"]` 暗色模式已实现（存量 main.css L211-226）
- `.word-page` 被 `FormDesignerTab.vue` 和 `VisitsTab.vue` 共用
- `.fill-line` 是 C-01 红线，样式和类名均不可修改

---

## 变更规格

### 1.1 修改 `frontend/src/styles/main.css`

在现有 `html[data-theme="dark"] { ... }` 块（L211-226）**之后**，追加以下规则：

```css
/* 暗色模式 — Word 预览纸张 */
html[data-theme="dark"] .word-page {
  background: var(--color-bg-card);
  color: var(--color-text-primary);
}
html[data-theme="dark"] .word-page td {
  border-color: var(--color-border);
}
html[data-theme="dark"] .word-page .wp-ctrl {
  color: var(--color-text-primary);
}
html[data-theme="dark"] .word-page .wp-inline-header {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}
html[data-theme="dark"] .word-page .wp-empty {
  color: var(--color-text-muted);
}
```

**不修改的选择器**：
- `.fill-line`（HC-3 红线）
- `.word-page .wp-label`（自动继承 `.word-page` 的 `color`）
- `.word-page .wp-form-title`（自动继承 `.word-page` 的 `color`）
- `.word-page table`（仅 `td` 需要 border-color 覆盖）

---

## 约束

| ID | 类型 | 约束 |
|----|------|------|
| HC-1 | Hard | 暗色背景使用 `--color-bg-card`（暗纸隐喻），不使用纯黑 |
| HC-2 | Hard | 通过 `html[data-theme="dark"]` 选择器覆盖，不改亮色模式 |
| HC-3 | Hard | `.fill-line` 类名和样式不可修改（C-01 红线） |

---

## PBT 属性

| 属性 | 不变量 | 伪造策略 |
|------|--------|---------|
| 亮色模式不变性 | 移除 `data-theme="dark"` 后，`.word-page` 样式与修改前完全一致 | 切换到 light → 逐一比对 background/color/border 计算值 |
| 暗色适配完整性 | `data-theme="dark"` 时，`.word-page` 无硬编码亮色值可见 | 遍历所有 `.word-page` 子元素，断言无 `#fff`/`#000`/`#d9d9d9` 计算值 |
| `.fill-line` 不可变性 | `.fill-line` 的 `border-bottom` 在任何主题下均为 `1px solid #333` | 切换主题 → 读取 `.fill-line` 计算样式 → 断言不变 |
| 横向模式继承 | `.word-page.landscape` 继承所有暗色覆盖 | 暗色模式下检查 `.word-page.landscape` 的 background 和 color |

---

## 验证条件

| ID | 条件 |
|----|------|
| SC-1.1 | 暗色模式下 `.word-page` 背景变为深色（`#1e293b`） |
| SC-1.2 | 暗色模式下表格边框颜色变为 `#334155` |
| SC-1.3 | 暗色模式下 `.wp-inline-header` 背景变为 `#334155` |
| SC-1.4 | 切换回亮色模式后所有预览样式恢复原状 |
| SC-1.5 | `.fill-line` 在暗色/亮色模式下样式均不变 |
| SC-1.6 | `FormDesignerTab` 和 `VisitsTab` 中的预览均受暗色覆盖影响 |

---

## 风险

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| `.fill-line` (#333) 在暗色背景上对比度低 | 低 | HC-3 禁止修改；装饰性边框在暗色下弱化可接受 |
| `.wp-empty` 提示文字对比度不足 | 低 | 使用 `--color-text-muted` 确保最低可读性 |
