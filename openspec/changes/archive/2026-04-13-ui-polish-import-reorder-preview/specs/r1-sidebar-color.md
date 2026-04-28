# Spec: R1 — 侧边栏配色加深

## 需求
将侧边栏从浅绿色 (`#90EE90`) 改为与 header 蓝色系协调的深蓝色。

## 约束
- C1-1: 仅修改 `frontend/src/styles/main.css` 中的 CSS 变量
- C1-2: 同时更新暗色模式变量
- C1-3: 文字与背景对比度 >= 4.5:1（WCAG AA）
- C1-4: 与 header 蓝色系协调

## 具体变更

### 亮色模式（`:root`）
```css
--color-sidebar-bg:     var(--indigo-900);  /* #234972 */
--color-sidebar-item:   rgba(255,255,255,0.85);
--color-sidebar-hover:  rgba(255,255,255,0.12);
--color-sidebar-active: rgba(255,255,255,0.20);
--color-sidebar-border: rgba(255,255,255,0.10);
```

### 暗色模式（`html[data-theme="dark"]`）
暗色模式已有 `--indigo-900: #18365a`，无需额外变更。

## 对比度验证
- `#234972` 背景 + `rgba(255,255,255,0.85)` 文字 → 约 7.0:1 ✓
- `#234972` 背景 + `#ffffff` active 文字 → 约 8.2:1 ✓

## 影响文件
| 文件 | 行 | 变更 |
|------|-----|------|
| `frontend/src/styles/main.css` | 21-25 | 修改 5 个 sidebar CSS 变量 |

## 验证标准
- [ ] 侧边栏显示为深蓝色，与 header 形成层次感
- [ ] 项目列表文字清晰可读
- [ ] hover/active 状态有明显反馈
- [ ] 暗色模式切换正常
