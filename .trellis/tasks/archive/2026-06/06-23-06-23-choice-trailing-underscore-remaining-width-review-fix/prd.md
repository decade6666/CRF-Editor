# choice trailing_underscore 剩余宽度闭环

## Goal

根据第一轮审查意见，修正 choice `trailing_underscore` 尾部下划线的列宽自适应口径：后端 Word 导出和前端预览都不能直接使用整列填写线根数，而要按 `marker + label` 后的剩余宽度计算尾线长度，并用更强的物理宽度断言闭合“不换行”风险。

## What I already know

* 第一轮审查指出：整格填写线根数适用于“单元格唯一内容”，不能直接套到选项尾线；否则 `label + 尾线` 会超过列宽并视觉换行。
* 当前工作区已经出现第二版修复：后端新增 `compute_choice_trailing_fill_char_count`，前端新增 `computeChoiceTrailingFillCharCount`，并在导出/预览路径接入。
* 无列宽上下文时仍应回退 6 根下划线，保持导入语义与旧调用方兼容。
* 仍需补充更强断言：估算 `marker + label + trailing underscores` 的物理宽度不能超过列宽预算，而不只是断言文本没有 `\n`。
* 相关验证已局部通过：backend choice trailing 回归 5 passed；frontend `columnWidthPlanning.test.js` 45 passed；`git diff --check` 通过。

## Assumptions (temporary)

* MVP 范围聚焦于闭合第一轮审查意见，不扩展到重新设计 choice atom 的整体换行模型。
* 横向多选项允许在选项之间换行；本任务只保证每个 `marker + label + tail line` atom 内部不会因尾线过长而撑破列宽。
* 无列宽上下文的旧 6 根回退继续保留。

## Open Questions

* 无阻塞问题；按当前 MVP 继续执行。

## Requirements

* 后端 Word 导出中，normal / inline / vertical choice 的尾部下划线按剩余宽度计算。
* 前端预览中，HTML 路径和 plain-text 路径使用与后端一致的剩余宽度规则。
* 无列宽上下文时，choice trailing underscore 保持 6 根兼容回退。
* 测试需要覆盖：宽列场景下尾线根数大于 6，但小于整列填写线根数；同时估算物理宽度不超过可用列宽。
* 文档/跨栈契约描述要和最终函数名、计算口径一致。

## Acceptance Criteria

* [ ] 后端 `compute_choice_trailing_fill_char_count` 的测试断言 `marker + label + tail` 估算宽度不超过列宽预算。
* [ ] 前端 `computeChoiceTrailingFillCharCount` 的测试断言与后端物理宽度口径一致。
* [ ] Word 导出 normal / inline choice 回归通过。
* [ ] 前端 column width planning 回归通过。
* [ ] `git diff --check` 通过。
* [ ] 如未做浏览器/Word 视觉验证，最终说明未验证范围。

## Definition of Done (team quality bar)

* Tests added/updated for the reviewed defect.
* Targeted backend/frontend regressions pass.
* Lint/typecheck/build scope is either run or explicitly listed as not run.
* Docs/notes updated if behavior text changes.
* No unrelated refactor or dependency change.

## Out of Scope

* 不重新设计横向 choice group 的整体排版策略。
* 不要求横向多个选项必须整行不换行；只约束单个 choice atom 内部尾线不因整列根数而溢出。
* 不处理当前工作区既有的 `.trellis/tasks/...` 删除项。
* 不处理搜索排序相关任务。

## Technical Notes

* Backend files: `backend/src/services/width_planning.py`, `backend/src/services/export_service.py`, `backend/tests/test_export_service.py`, `backend/tests/test_export_unified.py`。
* Frontend files: `frontend/src/composables/useCRFRenderer.js`, `frontend/src/components/VisitsTab.vue`, `frontend/tests/columnWidthPlanning.test.js`。
* Cross-stack docs: `.trellis/spec/guides/cross-stack-contracts.md`, `.trellis/spec/frontend/component-guidelines.md`, root/module `CLAUDE.md`, README files。
* Current risk from review: tests that only inspect text or strict parity cannot detect Word/browser soft wrapping; add physical-width assertions as the stronger regression signal.

## Decision (ADR-lite)

**Context**: 第一轮审查确认整列填写线根数会让 choice 尾线在标签后溢出，违背“不换行”的 06-21 目标。

**Decision**: 保留列宽自适应，但计算对象改为选项尾线的剩余宽度：先计算整列可承载填写线根数，再扣除 `marker + label` 的宽度权重；无列宽上下文继续回退 6 根。

**Consequences**: 宽列下尾线仍能比 6 根更长，但不会按整列铺满；横向多个选项仍可在选项之间换行，这是当前预览/导出排版的既有语义。
