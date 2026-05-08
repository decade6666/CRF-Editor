# Spec 01 — 暗色模式预览回调对齐

## 目标

将 `frontend/src/styles/main.css` 的 `.wp-log-row` 行为回调到 archived Spec 01 的原始边界：
- 亮色模式不新增 `.wp-log-row` 基线规则
- 暗色模式下继续保留 `.wp-log-row` 的覆盖规则

---

## 变更规格

### 1.1 修改 `frontend/src/styles/main.css`

删除亮色态规则：

```css
.word-page .wp-log-row { background: #d9d9d9; }
```

保留暗色态规则：

```css
html[data-theme="dark"] .word-page .wp-log-row {
  background: var(--color-bg-hover);
}
```

### 1.2 不改动的规则

以下规则保持不变：

- `html[data-theme="dark"] .word-page`
- `html[data-theme="dark"] .word-page td`
- `html[data-theme="dark"] .word-page .wp-ctrl`
- `html[data-theme="dark"] .word-page .wp-inline-header`
- `html[data-theme="dark"] .word-page .wp-empty`
- `.fill-line`

---

## 约束

| ID | 类型 | 约束 |
|----|------|------|
| HC-1 | Hard | `.wp-log-row` 不得在亮色模式新增专用背景规则 |
| HC-2 | Hard | `.wp-log-row` 的背景变化仅通过 `html[data-theme="dark"]` 生效 |
| HC-3 | Hard | `.fill-line` 不得修改 |

---

## PBT 属性

| 属性 | 不变量 | 伪造策略 |
|------|--------|---------|
| 亮色模式不变性 | light 模式下不存在 `.wp-log-row` 专用灰底规则 | 切换到 light，验证 `.wp-log-row` 不依赖新增亮色规则 |
| 暗色边界性 | dark 模式下 `.wp-log-row` 才获得 `var(--color-bg-hover)` | 切换到 dark，检查 `.wp-log-row` 计算背景 |
| 红线保持 | `.fill-line` 在任何主题下均未改动 | 搜索并比对 `.fill-line` 样式 |

---

## 验证条件

| ID | 条件 |
|----|------|
| SC-1.1 | `main.css` 中不再存在亮色态 `.word-page .wp-log-row` 规则 |
| SC-1.2 | 暗色态 `.word-page .wp-log-row` 规则保留 |
| SC-1.3 | 其他 `.word-page` 暗色覆盖不被误改 |
| SC-1.4 | `.fill-line` 未被修改 |
