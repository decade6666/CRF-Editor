# 字段编辑窗口按钮尺寸统一

## Goal

统一字段库页面右侧编辑字段窗口底部“保存”和“取消”按钮的视觉尺寸，消除当前主次按钮宽度不一致带来的界面不平衡感，并在不改变交互语义的前提下让操作区更整齐。

## Requirements

* 仅调整字段库页面 `frontend/src/components/FieldsTab.vue` 的右侧字段属性编辑面板。
* 面板底部“保存”和“取消”按钮需要在同一行内显示为相同宽度。
* 保持现有按钮顺序不变：左侧“取消”、右侧“保存”。
* 保持现有按钮语义不变：取消为默认按钮，保存为主按钮。
* 不修改保存/取消的现有逻辑、提示文案或字段编辑流程。
* 不引入无关样式重构，沿用当前 Element Plus + `flex` 布局模式做最小改动。

## Acceptance Criteria

* [x] 在 `FieldsTab.vue` 右侧字段属性编辑面板中，“保存”和“取消”按钮显示为相同宽度。
* [x] 两个按钮仍位于同一行，按钮间距保持当前面板风格一致。
* [x] 点击“保存”与“取消”后的现有行为不发生变化。
* [x] 除 `FieldsTab.vue` 外，其他页面不因本次改动发生样式变化。

## Definition of Done

* 代码改动限制在明确范围内
* 完成窄范围验证并明确记录已运行/未运行项
* 若无共享样式契约变化，不额外扩散到其他页面

## Technical Approach

在 `frontend/src/components/FieldsTab.vue` 的底部按钮容器中，当前“保存”按钮使用了 `flex:1`，而“取消”按钮没有，因此两者宽度不一致。实现时应将两侧按钮改为一致的宽度策略，优先采用同一行等宽 `flex` 方案，以最小改动满足视觉统一目标。

## Decision (ADR-lite)

**Context**：用户希望统一字段界面右侧编辑窗口底部“保存”和“取消”按钮大小。代码检查确认问题仅存在于 `FieldsTab.vue` 当前底部操作区。  
**Decision**：本次范围锁定为 `FieldsTab.vue`，不扩散到 `FormDesignerTab.vue` 或其他相似界面；实现上采用最小样式改动让两个按钮等宽。  
**Consequences**：改动面小、回归风险低，但不会顺带统一其他页面的按钮样式；如果未来要做全局一致性整理，应另开任务处理。

## Out of Scope

* 不修改 `FormDesignerTab.vue` 或其他组件中的保存/取消按钮
* 不修改按钮文案、颜色、尺寸级别（`size`）、禁用逻辑或提交流程
* 不重构整个字段属性面板布局

## Technical Notes

* 目标文件：`frontend/src/components/FieldsTab.vue`
* 参考文件：`frontend/src/components/FormDesignerTab.vue`
* 已定位当前实现：底部操作区为一个横向 `flex` 容器，其中“保存”按钮使用 `style="flex:1"`，而“取消”按钮未使用对应宽度策略，这是造成视觉尺寸不一致的直接原因。
* 这属于单文件、小范围、样式层改动，适合直接进入实现并做窄范围验证。
