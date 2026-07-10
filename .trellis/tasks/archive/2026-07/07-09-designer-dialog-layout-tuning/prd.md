# PRD — 表单设计弹窗界面调整

## Goal / User Value
优化全屏表单设计弹窗（`frontend/src/components/FormDesignerTab.vue`）的布局与信息密度，让属性编辑/设计备注、字段列表/Word 预览两组卡片可按需拖拽分配高度，并让 aCRF 视图下字段库更易读、字段列表去除无意义的数据库 id。

## Scope
仅前端单文件 `frontend/src/components/FormDesignerTab.vue`（模板 + `<script setup>` + `<style>`），必要时新增一个共享 composable 用于纵向分栏拖拽，并同步相关前端源级测试。后端不改。

## Confirmed Facts (from code inspection)
- 设计弹窗根：`el-dialog.designer-dialog`（fullscreen），内容为 `.designer-shell`（grid：`auto 4px minmax(320px,1fr) 460px`）= 字段库pane | 横向resizer | workspace | side-pane。
- `.designer-workspace`（grid-rows `minmax(0,2fr) minmax(260px,1fr)`，gap 8px）= 上 `designer-workspace-top`（字段列表 `designer-fields-panel`）/ 下 `designer-workspace-bottom`（Word 预览 `designer-preview-pane`）。
- `.designer-side-pane`（宽 `propWidth`=460 固定；grid-rows `minmax(0,1fr) minmax(180px,1fr)`，gap 8px）= 上 `designer-editor-card`（属性编辑）/ 下 `designer-notes-card`（设计备注）。
- 属性编辑非日志行分支（约 4308-4318 行）：`字段标签` el-form-item 在前，`OID` el-form-item（`v-if="editMode && !['标签','日志行'].includes(field_type)"`）在后。
- 中间字段列表项（约 3446-3453 行）：`<el-checkbox v-model="selectedIds" :label="ff.id" ...>` —— Element Plus 2.13.2 中 `label` 既是取值又渲染为复选框右侧文本，故复选框右侧显示的“数字”实为 `ff.id`（表单字段数据库 id），并非 `_displayOrder`（`ordinal-cell`，表单内序号，需保留）。用户截图 `image/2026-07-10_141323.jpg` 已确认：红框 4847–4857 = `ff.id`（要删），绿色 1–11 = `_displayOrder`（保留）。
- 左侧字段库项（约 3353-3365 行）：`button.fd-item` 单行 = label（flex:1，ellipsis）+ field_type（右侧小字）；数据来自 `filteredFieldDefs`（含 `fd.label`、`fd.variable_name`、`fd.field_type`）。
- aCRF 判定：`showAcrfAnnotations = editMode && viewMode==='aCRF'`（1079 行）。
- 现有横向拖拽范例：`startLibResize`（1304 行）+ `libraryWidth` localStorage 持久化（1301-1303 行），可作纵向拖拽实现参考。
- 受影响测试（需同步更新）：`tests/orderingStructure.test.js` L254 断言 `.designer-workspace` grid-rows、L256 断言 `.designer-side-pane` grid-rows；`tests/quickEditBehavior.test.js`、`tests/formFieldPresentation.test.js` 断言 `designer-workspace-bottom`→`designer-preview-pane` 顺序（保持顺序即可）。`designerNewFieldDraft.test.js` L144 要求复选框保留 `v-if="!isDraftField(ff)"`。无测试断言 `:label="ff.id"`。

## Requirements
- **R1 属性编辑 / 设计备注 高度可调**：`.designer-side-pane` 两卡片默认高度比例 = 属性编辑:设计备注 = **3:1**（属性编辑更高，editor fraction=0.75），并在两卡片间加入可拖拽分隔条手动调整比例，比例持久化到 localStorage。
- **R2 属性编辑字段顺序**：属性编辑卡片内把 `OID` el-form-item 移到第一行、`字段标签` el-form-item 移到第二行（保持 OID 的 `v-if` 显隐条件；OID 隐藏时字段标签自然为首行）。
- **R3 去除字段列表复选框右侧的库 id**：中间字段列表复选框不再渲染 `ff.id` 文本（`:label` → `:value`，保留多选取值与 `v-if="!isDraftField(ff)"`），保留其右侧 `_displayOrder` 序号列不变。
- **R4 字段列表 / Word 预览 高度可调**：`.designer-workspace` 上（字段列表）/ 下（Word 预览）之间加入可拖拽分隔条手动调整高度比例，默认沿用现有 2:1，比例持久化。
- **R5 aCRF 字段库两行布局**：aCRF 视图（`showAcrfAnnotations`）下左侧字段库每项占两行——第 1 行 OID（`variable_name`）、第 2 行字段标签（`label`）；右侧 `field_type` 垂直居中跨两行。非 aCRF 保持现单行（label + type）。
- **R6 字段库悬停完整信息 tooltip（按行分别显示）**：aCRF 两行布局下，悬停 OID 行显示完整 OID（`variable_name`），悬停标签行显示完整字段标签（`label`）；非 aCRF 单行模式悬停显示完整标签。因内容以省略号截断，tooltip 补足完整文本。

## Acceptance Criteria
- AC1：打开设计弹窗，属性编辑与设计备注按默认比例显示；拖动其间分隔条可改变两者高度，刷新弹窗/重开后比例保持。
- AC2：属性编辑卡片首个可见表单项为 OID（editMode 且非标签/日志行时），其下为字段标签；标签/简洁模式下 OID 不显示，字段标签为首项。
- AC3：中间字段列表复选框右侧不再出现 `ff.id` 数字；多选、批量删除、`_displayOrder` 序号显示均正常。
- AC4：拖动字段列表与 Word 预览之间的分隔条可改变两者高度，比例持久化。
- AC5：aCRF 视图下字段库每项两行（OID / 标签）+ 右侧类型跨行；切回 eCRF 恢复单行。
- AC6：字段库项悬停可看到完整 OID/标签（不被省略号截断）。
- AC7：`node --test tests/*.test.js` 全通过（含按本次布局更新后的 `orderingStructure.test.js` 等断言）。

## Out of Scope
- 后端、导出、Word 预览渲染逻辑。
- 侧栏宽度（`libraryWidth`/`propWidth`）交互（保持现状）。
- VisitsTab 等其它组件。

## Open Questions
无（Q1/Q2 已确认：R1=3:1；R6=按行分别显示）。
