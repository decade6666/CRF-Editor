# brainstorm: 新增字段保存取消按钮消失

## Goal

修复表单设计界面中“新增字段”流程的可用性回归：在增加“标签加粗”和“标签字号”属性后，新增字段时原本应出现的保存按钮和取消按钮消失，导致用户无法完成或放弃草稿字段创建。

## What I already know

* 用户反馈：表单设计界面里，增加“标签加粗”和“标签字号”之后，新增字段的保存按钮和取消按钮消失了。
* 近期已实现 `label_bold` / `label_font_size` 全栈功能，涉及 `frontend/src/components/FormDesignerTab.vue`、`frontend/src/components/SimulatedCRFForm.vue`、`frontend/src/composables/formFieldPresentation.js` 等。
* `FormDesignerTab.vue` 中现有属性编辑状态包含 `label_bold` 与 `label_font_size`，快捷编辑弹窗 footer 仍有取消/确定按钮，说明“按钮消失”更可能发生在新增字段右侧属性面板，而不是快捷编辑弹窗。
* 新增字段草稿机制仍然存在：`newField()` 只创建本地草稿，`hasDraft` 为真时字段列表头部会显示 `data-test="designer-save-draft"` 的保存按钮，`confirmDiscardDraft()` 负责“保存 / 丢弃 / 取消”三态。
* 已有测试 `frontend/tests/designerNewFieldDraft.test.js` 覆盖草稿完整生命周期，当前更像是模板/布局可见性回归，而不是草稿流程被整体删除。

## Assumptions (temporary)

* 问题是前端布局/条件渲染回归，不是后端保存接口缺失。
* 问题范围优先聚焦“新增字段草稿态”的保存/取消操作，不扩展到已有字段编辑或快捷编辑弹窗。

## Open Questions

* 无。当前按现有交互约定收敛：显式点击“取消”时直接丢弃草稿；只有在切换/离开等隐式中断场景下，才继续使用现有的“保存 / 丢弃 / 取消”确认弹窗。

## Requirements (evolving)

* 仅修复新增字段草稿态的右侧“保存 / 取消”操作入口，不重做整个属性面板交互。
* 定位新增字段草稿态保存/取消按钮的渲染位置与显示条件。
* 确认 `label_bold` / `label_font_size` 改动如何影响该区域显示（条件渲染、面板高度、溢出、footer 结构或样式）。
* 产出最小修复方案，恢复新增字段流程的完成与取消路径。

## Acceptance Criteria (evolving)

* [ ] 在表单设计界面点击新增字段后，右侧属性编辑区再次可见“保存”和“取消”按钮。
* [ ] 用户可以在右侧属性编辑区完成新增字段保存，也可以取消草稿字段创建。
* [ ] 顶部现有草稿保存机制不会因本次修复被破坏。
* [ ] 修复不影响已有字段编辑与快捷编辑弹窗的按钮显示。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Technical Approach

在 `frontend/src/components/FormDesignerTab.vue` 的右侧属性编辑卡片中，为“草稿字段选中态”补回显式操作区：

* 仅当当前选中字段是草稿字段时，显示右侧“保存 / 取消”按钮。
* “保存”复用现有 `saveDraftField()`，不改动草稿的后端提交流程。
* “取消”走本地草稿移除逻辑，直接丢弃当前新增字段草稿。
* 已有字段继续保持当前自动保存路径，不引入新的手动保存流程。
* 顶部已有 `hasDraft` 保存按钮先保留，避免破坏现有草稿机制与测试假设。

## Decision (ADR-lite)

**Context**: 用户反馈新增 `label_bold` / `label_font_size` 后，新增字段时右侧编辑区不再提供明确的保存/取消操作，新增流程可发现性下降。代码检查显示草稿保存机制仍在，但右侧属性面板当前没有草稿专用 footer，而类似的字段库编辑面板存在显式“取消 / 保存”按钮。

**Decision**: 采用最小修复方案，只为新增字段草稿态恢复右侧显式“保存 / 取消”按钮，不调整已有字段编辑模式，也不重构整个属性面板布局。

**Consequences**: 可快速恢复新增字段可用性，风险低；代价是顶部与右侧会暂时同时存在保存入口，但这比扩大交互改造范围更稳妥。

## Out of Scope (explicit)

* 不统一已有字段编辑与新增字段草稿态的全部交互模式。
* 不重做整套属性编辑器 UI。
* 不扩展到与本问题无关的字段样式新需求。
* 不改动后端字段模型/导入导出协议，除非排查证明根因在接口契约。

## Technical Notes

* Suspect files: `frontend/src/components/FormDesignerTab.vue`, possible preview coupling in `frontend/src/components/SimulatedCRFForm.vue`.
* Recent related feature memory: label bold and font size were fully implemented on 2026-06-21 and touched the designer/property editor path.
* Confirmed code points so far:
  * `frontend/src/components/FormDesignerTab.vue:95` defines `DRAFT_FIELD_ID='__draft__'`.
  * `frontend/src/components/FormDesignerTab.vue:100` computes `hasDraft` from `formFields`.
  * `frontend/src/components/FormDesignerTab.vue:1808` `newField()` builds a local draft and selects it.
  * `frontend/src/components/FormDesignerTab.vue:1847` `saveDraftField()` performs the actual POST sequence.
  * `frontend/src/components/FormDesignerTab.vue:2717` shows a header save button when `hasDraft` is true.
* Code comparison evidence:
  * `frontend/src/components/FormDesignerTab.vue:3244` 起的右侧属性编辑区当前只有表单内容，没有草稿专用按钮区。
  * `frontend/src/components/FormDesignerTab.vue:2717` 仍保留顶部 `hasDraft` 条件保存按钮。
  * `frontend/src/components/FieldsTab.vue:245` 的右侧属性面板存在清晰的“取消 / 保存”按钮，可作为同项目内对照模式。
* Current hypothesis after inspection: 这更像右侧草稿操作区缺失/回归，而不是后端保存能力消失。
