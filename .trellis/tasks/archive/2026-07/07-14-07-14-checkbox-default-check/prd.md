# 复选文本默认✔

## Goal

复选（`复选`）字段的"复选文本"（`checkbox_label`）为空时，渲染与宽度计算的回退值从"字段标签"改为固定字符 `✔`。

## Background

当前 `复选` 字段渲染为 `label | □checkbox text`。`checkbox_label` 为空时，前后端均回退到字段标签：
- 后端 `backend/src/services/field_rendering.py::resolve_checkbox_label`：`checkbox_label or label or ""`
- 前端 `frontend/src/composables/useCRFRenderer.js::resolveCheckboxText`：`checkbox_label || label || ''`

回退到标签会产生冗余渲染 `label | □label`。改为默认 `✔` 后呈现 `label | □✔`，更符合复选控件语义。

## Requirements

- 空 `checkbox_label` 的回退值由字段标签改为固定字符 `✔`，前后端保持一致（渲染 + 宽度计算共用同一回退）。
- 只改回退语义；`checkbox_label` 非空时行为不变，仍按自定义文本渲染。
- 不做数据迁移：不写入 `✔` 到已有记录，仅影响运行时回退。
- 宽度计划夹具 `backend/tests/fixtures/planner_cases.json` 的空 label 复选用例随生成器 `frontend/scripts/generatePlannerFixtures.mjs` 重新生成，后端/前端 width 测试同步通过。
- 跨栈契约（Checkbox field contract、Column width planning）保持前后端同步。

## Acceptance Criteria

- [ ] 后端 `resolve_checkbox_label` 空值回退 `✔`；前端 `resolveCheckboxText` 空值回退 `✔`。
- [ ] `checkbox_label` 非空时渲染与宽度不变。
- [ ] `planner_cases.json` 经生成器重新生成，后端 `pytest`（含 `test_width_planning.py`）与前端 `columnWidthPlanning.test.js`、`checkboxFieldType.test.js` 全绿。
- [ ] 前端全量 `node --test tests/*.test.js` 与后端 `python -m pytest` 通过（不低于原有绿数）。

## Notes

- 单一回退点：后端 `field_rendering.py`、前端 `useCRFRenderer.js`；export/width 均复用该 helper，无需逐处改。
- Word 导出经 `export_service.py::resolve_checkbox_label`，自动继承新回退。
- 需同步更新受影响测试断言（原 fixture 断言基于回退到标签"已"）。
