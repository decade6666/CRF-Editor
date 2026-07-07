# Word导入AI建议接受开关

## Goal

在 Word (.docx) 导入预览流程中，让用户可以显式选择是否接受 AI 复核建议（字段类型调整），并在"导入效果"预览中实时反映接受建议后的字段渲染；确认导入时把已接受的建议作为 `ai_overrides` 传给后端真正落库。

## Background / Current State

- 后端 `POST /projects/{id}/import-docx/execute` **已支持** `ai_overrides`（`[{form_index, overrides:[{index, field_type}]}]`），并在 `docx_import_service.import_forms` 中构建 `{form_index:{field_index:field_type}}` 覆盖 `field_info["field_type"]`。字段类型合法性由 `VALID_FIELD_TYPES` 校验（路由层 + 服务层双校验）。
- AI 建议数据结构：每条 `{index, suggested_type, reason}`，`index` = 表单内真实字段（已过滤 `log_row`）索引。
- 前端缺口：
  1. `DocxCompareDialog.vue` 只把 AI 建议当**只读卡片**展示，无任何"接受"控件。
  2. 右侧"导入效果"面板始终渲染**原始字段类型**，不反映接受建议后的样子。
  3. `App.vue::executeImportWord()` 调 execute 时**从不传** `ai_overrides`，接受状态也从未持久化到执行调用。

## Requirements

### R1 三级接受控制（用户明确要求"单条、单个表单、全部"）
- **单条建议**：AI 建议列表每条可独立勾选是否接受。
- **单个表单**：单个表单可"全接受 / 全取消"其所有建议（预览对话框内）。
- **全部表单**：Step 2 表单选择页可一键"接受全部表单的全部建议 / 全部取消"。

### R2 默认关闭
- 所有层级默认**不接受**（未勾选）。用户主动勾选才生效。导入效果默认显示原始解析结果。

### R3 导入效果实时反映
- "导入效果"预览（`SimulatedCRFForm`）按当前接受状态渲染：已接受建议的字段以 `suggested_type` 渲染，未接受的保持原 `field_type`。
- 需与后端 `import_forms` 的覆盖语义一致：仅覆盖字段类型，其余属性（options/整数位/小数位/日期格式/单位等）保留原解析值。

### R4 执行导入携带 overrides
- `executeImportWord()` 按接受状态构造 `ai_overrides` 并随 execute 请求发送。仅包含被接受、且 `suggested_type ∈ VALID_FIELD_TYPES`、且与原类型不同的项。
- 未接受任何建议时不发送 `ai_overrides`（或发送空，保持现有行为）。

### R5 状态一致性
- 接受状态在预览对话框与 Step 2 列表间保持同一数据源，切换表单预览、重新轮询 AI 建议、关闭重开对话框时不丢失/不错乱。
- AI 轮询 `mergeAiSuggestions` 更新建议时，需保留已有接受选择（除非该建议本身消失）。
- 关闭整个 Word 导入对话框 / 返回上一步 / 重新上传时，接受状态按现有 reset 语义清空。

## Constraints

- 后端不改（已具备 `ai_overrides` 能力）；如分析发现后端有必要小改，需单独说明并复核。
- 前端改动集中在 `frontend/src/App.vue` 与 `frontend/src/components/DocxCompareDialog.vue`；预览渲染复用 `SimulatedCRFForm.vue`，不新造渲染逻辑。
- 遵循前端约定：可复用逻辑进 `composables/`；不破坏 `docxBimodalPreview.test.js` 等既有契约。
- 默认关闭，不改变"AI 不可用 / 复核中 / 失败"时的既有降级展示。

## Acceptance Criteria

- [ ] 预览对话框 AI 建议列表每条有可勾选的接受控件，默认未勾选。
- [ ] 预览对话框有"本表单全接受 / 全取消"控件；Step 2 有"全部表单全接受 / 全取消"控件。
- [ ] 勾选某条建议后，右侧"导入效果"对应字段立即以 `suggested_type` 渲染；取消后恢复原类型。
- [ ] 点击"确认导入"时，请求体 `ai_overrides` 只包含已接受且有效（合法类型且异于原类型）的项；未接受时不含无效项。
- [ ] 导入结果的字段类型与预览接受效果一致（后端按 `ai_overrides` 落库）。
- [ ] 切换表单预览 / AI 轮询刷新 / 关闭重开对话框，接受状态保持一致；关闭整个导入对话框后状态清空。
- [ ] 新增前端测试覆盖：接受状态数据模型、三级勾选/全选语义、预览类型覆盖、`ai_overrides` 构造（含默认关闭与过滤无效项）、与 AI 轮询合并的状态保留。
- [ ] `node --test tests/*.test.js` 全绿；`npm run lint` 无新增阻断错误。

## Out of Scope

- 不改后端 `ai_overrides` 契约与 `VALID_FIELD_TYPES`。
- 不引入"接受建议时同步调整 options/位数/日期格式"等超出字段类型的联动（后端当前也只覆盖类型）。
- 不改 AI 复核触发/轮询后端逻辑与截图证据面板。
