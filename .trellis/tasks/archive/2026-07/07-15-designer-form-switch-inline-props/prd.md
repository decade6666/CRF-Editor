# 表单设计器下拉切换与内联表单属性

## Goal

让用户在全屏表单设计器内快速切换表单，并直接在右侧属性卡编辑当前表单的 OID、名称、纸张方向；未选字段时显示表单属性，点击字段列表空白区可回到表单属性。

## Background

- 全屏设计器标题当前为静态 `设计：{{ selectedForm?.name }}`（`FormDesignerTab.vue:3697`）。
- 表单 OID/名称/纸张方向仅能通过左侧列表「编辑表单」弹窗修改（`openEditForm` / `updateForm`）。
- 右侧属性卡未选字段时是空状态 `← 选择字段`，浪费面板空间。
- 字段属性已采用显式保存 + 三态脏态离开守卫；表单属性应镜像该模式。

## Confirmed Product Decisions

1. 表单属性使用**显式保存/取消按钮**（非自动保存）。
2. 左侧列表「编辑表单」弹窗**保留**，与设计器内联卡双入口并存。
3. 范围仅全屏设计器（`showDesigner`），不改主工作台画布标题。

## Requirements

### R1 下拉切换表单
- 全屏设计器 `#header` 将固定标题改为「设计：」前缀 + 可搜索下拉框。
- 下拉选项来自现有 `filteredForms`（排序 + 模糊搜索）。
- 切换必须走 `selectForm`，守卫拒绝时受控值回弹到当前表单。
- 保留完整模式 aCRF/eCRF 开关。

### R2 右侧内联表单属性
- 未选字段时右侧显示「表单属性」：名称、OID（仅 `editMode`）、纸张方向（auto/横向/纵向）。
- 提供「保存」「取消」；脏态时按钮可用。
- 保存复用现有校验：可选 OID 字符集、访视引用影响确认、纵向宽表警告；`PUT /api/forms/{id}` body 为 `{name, code, paper_orientation}`。
- 保存成功后刷新 forms 列表与下拉显示，保持 `selectedForm` 对象 identity。
- 弹窗 `updateForm` 与内联卡共用同一保存逻辑。

### R3 空白点击回退表单属性
- 点击字段列表容器内、非 `.ff-item` 区域时，经字段脏态/草稿守卫后清空 `selectedFieldId`，右侧回到表单属性。
- 点击字段行、侧栏属性卡、弹层不触发回退。

### R4 离开守卫
- 新增表单属性三态离开守卫，并入 `resolveDesignerLeave` / 切表单 / 关设计器。
- 优先级：先字段级、后表单级。

## Out of Scope

- 后端 API / schema / 模型变更
- 移除左侧编辑弹窗
- 主工作台非全屏标题下拉化
- 表单 domain / design_notes 内联编辑（备注卡已有）

## Acceptance Criteria

- [x] AC1：全屏设计器标题区存在受控 `el-select`（`model-value=selectedForm.id`，选项 `filteredForms`，change 走 `selectForm`），守卫拒绝时不切表单。
- [x] AC2：未选字段时右侧显示表单属性表单 + 保存/取消；选中字段时显示字段属性。
- [x] AC3：OID 仅在完整模式显示；非法 OID 前端拦截不发请求。
- [x] AC4：`saveFormProp` / 共享保存路径对当前表单 PUT `{name,code,paper_orientation}`，并 `reloadForms`；纵向宽表有确认。
- [x] AC5：表单属性脏时切表单/关设计器/切项目弹出三态确认（保存/丢弃/取消）。
- [x] AC6：点击字段列表空白回退表单属性；点字段行/侧栏不回退。
- [x] AC7：左侧编辑弹窗仍可用且与内联卡共用校验/保存契约。
- [x] AC8：新增/扩展前端测试通过；前端全量测试与 lint 通过。

## Technical Notes

- 主文件：`frontend/src/components/FormDesignerTab.vue`
- 复用：`selectForm`、`updateForm` 契约、`oidValidation.js`、`resolveFieldPropLeave` 模式
- 后端零改动：`PUT /api/forms/{id}`，`paper_orientation ∈ {auto,landscape,portrait}`
