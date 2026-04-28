# Design: archived-ui-fix-spec-alignment

## 架构决策

本变更是一次**实现回调型修正**：
- 以 archived spec 为基准
- 收缩当前运行时代码，使其重新落回原始规格边界
- 不扩展功能，不新增视觉规则，不追认现状

---

## R1 — 暗色模式预览回调

### 目标

恢复 Spec 01 的边界：
- 仅在 `html[data-theme="dark"]` 下追加 `.word-page` 相关覆盖
- 亮色模式不新增 `.wp-log-row` 基线样式

### 当前偏差

当前 `frontend/src/styles/main.css` 同时包含：
- 亮色态：`.word-page .wp-log-row { background: #d9d9d9; }`
- 暗色态：`html[data-theme="dark"] .word-page .wp-log-row { background: var(--color-bg-hover); }`

这让亮色模式相对 archived spec 出现额外行为，破坏了 Spec 01 的“亮色模式不变性”。

### 回调方案

- 删除亮色态 `.word-page .wp-log-row` 规则
- 保留暗色态 `.word-page .wp-log-row` 规则
- 不修改 `.wp-inline-header`、`.wp-empty`、`.wp-ctrl`、`.word-page td` 的暗色覆盖
- 不触碰 `.fill-line`

### 影响范围

- 文件：`frontend/src/styles/main.css`
- 风险：`FormDesignerTab.vue` / `VisitsTab.vue` 中 log row 在亮色模式下恢复为无独立灰底
- 这是**有意回调**，因为本次目标是匹配 archived spec，而不是保留实现扩展

---

## R2 — 封面页尾随空段回调

### 目标

恢复 Spec 03 的边界：
- 2.0 行距的内容后空段仅在 `data_management_unit` 存在时生成
- sponsor-only 场景不生成该空段

### 当前偏差

当前 `_add_cover_page()` 实现为：

```python
if project.sponsor or project.data_management_unit:
    p_post_content = doc.add_paragraph()
    p_post_content.paragraph_format.line_spacing = 2.0
```

这把 archived spec 中“DMU 后空段”的语义扩成了“附加信息块后空段”。

### 回调方案

将逻辑收回为：

```python
if project.data_management_unit:
    ...
    p_post_dmu = doc.add_paragraph()
    p_post_dmu.paragraph_format.line_spacing = 2.0
```

并保持：
- sponsor 段的 `space_before/space_after = Pt(7.8)` 不变
- DMU 段的 `space_before/space_after = Pt(7.8)` 不变
- 分页段 `line_spacing = 2.0` 不变

### 场景矩阵

| 场景 | 预期输出 |
|------|----------|
| sponsor only | sponsor 段 → 分页段 |
| DMU only | DMU 段 → DMU 后空段（2.0）→ 分页段 |
| both present | sponsor 段 → DMU 段 → DMU 后空段（2.0）→ 分页段 |
| both absent | 直接分页段 |

---

## 文件变更矩阵

| 文件 | 变更类型 | 修改点 |
|------|----------|--------|
| `frontend/src/styles/main.css` | 修改 | 删除亮色态 `.wp-log-row` 基线 |
| `backend/src/services/export_service.py` | 修改 | 将内容后 2.0 空段恢复为 DMU-only |
| `openspec/changes/archived-ui-fix-spec-alignment/*.md` | 新增 | proposal/design/specs/tasks |

---

## 风险与缓解

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| 亮色模式下 log row 失去灰底后，视觉与当前体验不同 | 中 | 明确这是与 archived spec 对齐的有意回调 |
| sponsor-only 封面版式回退 | 中 | 在 spec 中明确 sponsor-only 不带 2.0 内容后空段 |
| 审查结论再次变化 | 低 | 本次以 archived spec 原文为唯一裁决依据 |

---

## PBT / 不变量抽取

### 前端
- **亮色模式不变性**：不存在 `.word-page .wp-log-row` 的亮色专用背景规则
  - 伪造策略：切回 light，检查 `.wp-log-row` 不应有新增灰底规则来源
- **暗色覆盖边界**：`.wp-log-row` 仅在 dark 下获得 `var(--color-bg-hover)`
  - 伪造策略：切换 dark，检查 `.word-page .wp-log-row` 计算样式来自 dark 规则

### 后端
- **条件边界不变量**：内容后 2.0 空段仅由 `data_management_unit` 决定
  - 伪造策略：分别构造 4 个组合场景，断言空段存在性
- **唯一性**：无论 sponsor/DMU 组合如何，内容后空段最多 1 个
  - 伪造策略：导出并解析封面段落序列
- **分页不变量**：分页段始终存在且 `line_spacing = 2.0`
  - 伪造策略：导出 DOCX 后检查分页段格式
