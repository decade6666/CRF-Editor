# brainstorm: 调整表单设计界面 eCRF/aCRF 切换按钮位置

## Goal

把表单设计界面里当前位于右上区域的 eCRF/aCRF 视图切换按钮移动到更靠左的位置，贴近表单名称，减少视线跳转并让标题与视图状态更靠近。

## What I already know

* 当前实现位于 `frontend/src/components/FormDesignerTab.vue`。
* 主界面表单画布头部里，切换按钮现在在“设计表单”按钮后、表单名称前：`FormDesignerTab.vue:2685-2697`。
* 全屏设计器弹窗头部也有一个同款切换按钮，当前在标题右侧：`FormDesignerTab.vue:3324-3334`。
* 用户已明确：这次**只调整全屏设计器的开关**，主界面表单页的开关不改。
* 相关样式由 `.fd-canvas-header`、`.fd-canvas-header-main`、`.designer-dialog-header` 控制：`FormDesignerTab.vue:4804-4829`、`FormDesignerTab.vue:4962-4977`。
* 前端约束要求优先复用现有组件与结构，避免无关重构；`feat/fix` 需要补对应测试，前端最少跑相关 `node --test` 用例。

## Assumptions (temporary)

* 这次调整主要是布局位置变化，不涉及 `viewMode` 状态逻辑、持久化逻辑或 aCRF 标注逻辑。
* 全屏设计器与主界面仍继续共用同一个 `viewMode`。
* 用户已确认采用“紧跟标题”方案：切换按钮应紧贴全屏设计器标题 `设计：<表单名>` 右侧，形成同一左侧信息组。

## Open Questions

* 无。

## Requirements (evolving)

* 只调整**全屏设计器弹窗头部**的 eCRF/aCRF 切换按钮位置。
* 主界面表单页头部现有开关布局保持不变。
* 全屏设计器中，切换按钮需紧跟在 `设计：<表单名>` 标题右侧，保持较小间距。
* 保持现有 `viewMode` 切换语义不变。
* 不引入与本任务无关的交互或样式重构。

## Acceptance Criteria (evolving)

* [ ] 全屏设计器头部中 eCRF/aCRF 切换按钮紧跟在 `设计：<表单名>` 右侧显示，不再停留在当前偏右位置。
* [ ] 主界面表单页头部开关位置保持不变。
* [ ] 切换按钮仍可正常在 `eCRF` / `aCRF` 间切换。
* [ ] 相关前端测试更新后通过。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 不修改 `viewMode` 的存储键、持久化方式或切换逻辑。
* 不修改 aCRF 标注拖拽、导出样式、标注位置持久化。
* 不做整页头部样式系统重构。

## Technical Notes

* 代码定位：
  * 主头部结构：`frontend/src/components/FormDesignerTab.vue:2685-2709`
  * 全屏设计器头部结构：`frontend/src/components/FormDesignerTab.vue:3324-3334`
  * 主头部样式：`frontend/src/components/FormDesignerTab.vue:4804-4829`
  * 弹窗头部样式：`frontend/src/components/FormDesignerTab.vue:4962-4977`
* 项目约束：
  * `frontend/src/components/FormDesignerTab.vue` 已有未提交改动（与 aCRF 标注拖拽相关），实现时要避免覆盖现有工作。
  * 当前项目前端规范要求：复用现有 Element Plus / Composition API 模式，避免直接 DOM 操作，避免无关重构。
