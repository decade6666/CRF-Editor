# 修复 VisitsTab aCRF 拖动保存丢 sequence

## Goal
`VisitsTab.vue::mergeFormIntoState()` 的 `currentForm` 优先取 `allForms`（表单对象，不含 `sequence`），再用单一 `nextForm` 回写 `visitForms`，导致右侧访视表单列表在 aCRF 标注拖动保存后丢失 sequence/序号。

## 独立验证结论（codex + Claude 双源确认）
- **成立性：是**。
  - `load()` 把 `allForms` 取自 `/api/projects/{id}/forms`（VisitsTab.vue:134），表单对象无 `sequence`。
  - `syncVisitForms()` 把 `sequence` 作为访视关联关系字段临时拼到 `visitForms`（VisitsTab.vue:228）。
  - 后端矩阵接口返回的 `forms` 只有 `id`/`name`，无 `sequence`（routers/visits.py:290）。
  - `mergeFormIntoState()` 优先用 `allForms` 做 base（VisitsTab.vue:450），同一 `nextForm` 回写 `visitForms`（VisitsTab.vue:463）。
  - aCRF 持久化回来的 `updatedForm` 只有局部字段 `{id, annotation_positions}`（useAcrfAnnotationDrag.js:78,89）。
- **触发条件**：当前 form 同时存在于 `allForms` 和 `visitForms`，且 `updatedForm` 仅含 `{id, annotation_positions}` → `nextForm` 不带 `sequence` → 右侧列表序号被覆盖。
- **FormDesignerTab 同类检查**：FormDesignerTab.vue:186 有同名 `mergeFormIntoState`，但当前只合并 `forms` 和 `selectedForm`，无关系层字段 `sequence`，**暂无同类 bug**（codex 确认）。

## Requirements
- 回写各集合时以**该集合自身对象**为 base merge（`{...item, ...updatedForm}`），而非用单一 `nextForm` 覆盖所有集合。
- 保证 `visitForms[n].sequence` 在部分字段更新（如 aCRF 拖动）后保持不变。
- `allForms` / `matrixData.forms` / `formPreviewForm` 各自的局部状态不被跨集合污染。

## Acceptance Criteria
- [ ] aCRF 拖动保存后 `visitForms[n].sequence` 保持原值。
- [ ] `allForms[n].annotation_positions` 被正确更新。
- [ ] `formPreviewForm` 打开时不因部分 merge 丢掉已有预览状态。
- [ ] 前端新增 VisitsTab 行为测试（非源码正则），断言上述三点。

## Technical Approach
最优解（codex 推荐 + 用户原方案一致）：按集合各自对象做 base merge。每个集合的 `map` 用 `{...item, ...updatedForm}` 而非外部统一 `nextForm`：
```js
// visitForms 回写改为以自身 item 为 base
visitForms.value = visitForms.value.map(item =>
  item.id === updatedForm.id ? { ...item, ...updatedForm } : item)
// allForms / matrixData.forms 同理各自 base
```
仅对 `visitForms` 特判保留 `sequence` 更小但太脆（未来再有集合局部字段会重演），不采纳。

## Out of Scope
- `useAcrfAnnotationDrag` 本身（cache invalidation、串行 flush 均无问题）。
- FormDesignerTab merge 逻辑（无同类 bug，不改）。
- 后端 annotation_positions 规范化（见 06-30-acrf-annotation-str-canonicalize）。

## Technical Notes
- 风险：局部对象合并语义，非并发问题（拖拽队列已按 form 串行 flush）。
- 关联提交：29a69d1。
- PR 可独立于后端两个任务（无代码冲突，回滚/验证简单）。

## PR 归属与执行顺序
- 归属：**独立前端 PR**（与后端 PR 无代码冲突）。
- 执行顺序：后端 PR 合并后做，或并行；回滚/验证独立。
