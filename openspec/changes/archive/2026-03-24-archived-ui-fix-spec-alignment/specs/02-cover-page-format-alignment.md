# Spec 02 — 封面页尾随空段回调对齐

## 目标

将 `backend/src/services/export_service.py::_add_cover_page()` 的内容后空段逻辑回调到 archived Spec 03 的原始边界：
- 仅在 `data_management_unit` 存在时插入 2.0 行距空段
- sponsor-only 场景不插入该空段

---

## 变更规格

### 2.1 修改 `_add_cover_page()`

将当前：

```python
if project.sponsor or project.data_management_unit:
    p_post_content = doc.add_paragraph()
    p_post_content.paragraph_format.line_spacing = 2.0
```

回调为：

```python
if project.data_management_unit:
    ...
    p_post_dmu = doc.add_paragraph()
    p_post_dmu.paragraph_format.line_spacing = 2.0
```

### 2.2 不改动的规则

以下行为保持不变：

- sponsor 段 `space_before = Pt(7.8)`、`space_after = Pt(7.8)`
- DMU 段 `space_before = Pt(7.8)`、`space_after = Pt(7.8)`
- 分页段 `line_spacing = 2.0`
- 封面表格宽度 `w:tblW pct=2345`
- 列宽 `2335 / 2665`

---

## 场景矩阵

| 场景 | 预期 |
|------|------|
| sponsor only | sponsor 段后无 2.0 内容后空段，直接分页 |
| DMU only | DMU 段后有 1 个 2.0 内容后空段，再分页 |
| both present | DMU 段后有 1 个 2.0 内容后空段，再分页 |
| both absent | 无内容后空段，直接分页 |

---

## 约束

| ID | 类型 | 约束 |
|----|------|------|
| HC-6 | Hard | 内容后 2.0 空段仅由 `data_management_unit` 触发 |
| HC-7 | Hard | sponsor / DMU 段前后间距继续为 `Pt(7.8)` |
| HC-8 | Hard | 分页段继续为 `line_spacing = 2.0` |

---

## PBT 属性

| 属性 | 不变量 | 伪造策略 |
|------|--------|---------|
| 条件单调性 | `data_management_unit` 为空时，不生成内容后空段 | 构造 sponsor-only / both-absent 场景验证 |
| 条件触发性 | `data_management_unit` 非空时，生成且仅生成一个内容后空段 | 构造 DMU-only / both-present 场景验证 |
| 分页不变量 | 分页段始终存在且 `line_spacing = 2.0` | 导出后解析段落格式 |
| 非扩张性 | sponsor-only 场景不会因为 sponsor 存在而额外插入内容后空段 | 对比 sponsor-only 与 DMU-only |

---

## 验证条件

| ID | 条件 |
|----|------|
| SC-2.1 | sponsor-only 时，不存在内容后 2.0 空段 |
| SC-2.2 | DMU-only 时，存在 1 个内容后 2.0 空段 |
| SC-2.3 | both-present 时，仍然只存在 1 个内容后 2.0 空段 |
| SC-2.4 | both-absent 时，不存在内容后空段 |
| SC-2.5 | 分页段 2.0 行距保持不变 |
