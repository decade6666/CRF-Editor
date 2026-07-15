# 列宽最小限制放宽（req1）

> 父任务：`07-14-crf-editor-batch-fixes`

## Goal

放宽列宽的最小限制，允许用户把列拖拽/设置为更小的宽度（当前被 10% 的拖拽下限挡住）。在保证不出现 0 宽 / 布局崩坏的前提下，把可设置的最小列宽显著下调。

## Background and confirmed facts

- 用户可拖拽的列宽下限：`frontend/src/composables/useColumnResize.js:5` `const MIN_RATIO = 0.1`——任何列拖拽宽度比例被钳制到 ≥10%。同一常量还用于：
  - 拖拽钳制 `clampLeft`（129/143/144 行）；
  - **缓存校验**（14 行 `arr.every(r => r >= MIN_RATIO && r <= MAX_RATIO)`）——读回持久化列宽比例时的合法性判据。因此下调该常量会一致影响拖拽与缓存读回，是单点常量。
- 内容驱动 planner 的下限（影响自动列宽，不是用户手动设置）：前后端同源 `min_weight = WEIGHT_ASCII*4`（值 4）与 `INLINE_HEADER_FLOOR = WEIGHT_CHINESE*4`（值 8），位于 `backend/src/services/width_planning.py` 与 `frontend/src/composables/useCRFRenderer.js`。
- 跨栈列宽 fixture：`backend/tests/fixtures/planner_cases.json` 由 `frontend/scripts/generatePlannerFixtures.mjs` 单一生成，被后端 `test_width_planning.py` 与前端 `columnWidthPlanning.test.js` 共用；**仅当改动 planner 权重/下限时需重生成**。

## Requirements

### R1 — 下调用户拖拽最小列宽

- 把 `useColumnResize.js` 的 `MIN_RATIO` 从 `0.1` 下调到更小的值（建议 `0.02`，或在 `design.md` 中定一个既能明显变窄又能避免 0 宽/重叠的下限），使用户可将列拖得更窄。
- 保留一个非零下限（epsilon 级）避免列宽为 0 或负、避免边界重叠导致拖拽不可用。
- 缓存读回校验（14 行）随新下限一致放宽，确保按新下限持久化的列宽能正常载入，不被判为非法而回退默认。

### R2 — planner 下限是否同步（在 design 决策）

- 明确 req1 主要针对**用户手动设置/拖拽**的下限（`MIN_RATIO`）；内容驱动 planner 的 `min_weight` / `INLINE_HEADER_FLOOR` 是自动列宽的保护值，默认**不改**。
- 若产品期望自动列宽也能更窄，再在 `design.md` 评估同步下调前后端 planner 下限，并**重新运行 `node frontend/scripts/generatePlannerFixtures.mjs` 重生成 `planner_cases.json`**，保持前后端 fixture 单一真源。默认路径不动 planner，则 fixture 不受影响。

### R3 — 跨栈一致与测试

- 若仅改 `MIN_RATIO`：前端补/扩展 `columnWidthPlanning.test.js` 或 `useColumnResize` 相关测试，覆盖新下限的拖拽钳制与缓存读回；无需动后端 fixture。
- 若同步改 planner 下限：前后端 fixture 重生成，`test_width_planning.py` 与 `columnWidthPlanning.test.js` 同步通过。
- 覆盖率不低于基线。

## Acceptance Criteria

- [ ] 用户可将预览表格列拖拽到明显小于原 10% 的宽度（达到新下限）。
- [ ] 列宽不会被拖到 0 / 负 / 相互重叠导致不可再拖。
- [ ] 按新下限持久化的列宽刷新后能正确载入，不回退默认。
- [ ] 若改动 planner 下限，`planner_cases.json` 已用生成器重生成，前后端列宽测试同步通过；若未改则 fixture 不变。
- [ ] 相关前端（及按需后端）测试通过。

## Notes

- 本子任务不改 `FormDesignerTab.vue`，可与其它子任务实现阶段并行。
- 属跨栈列宽契约相关：任何改动 planner 侧的行为都要同步前后端与 fixture，并更新 README / 模块 CLAUDE.md 中的列宽契约说明。
