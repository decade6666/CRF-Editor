# brainstorm: Word导入预览窗口未显示表单效果

## Goal

修复 Word (.docx) 导入流程中，点击"预览"按钮后弹出的 DocxCompareDialog 对话框打开但内容区域空白的问题。

## What I already know

### 完整数据流
1. 用户上传 .docx → 后端 `preview_docx_import()` 解析并返回 `{forms: [...], temp_id}`
2. 前端 `handleDocxUploadSuccess()` 存入 `importedFormsPreview`
3. Step 2 列表中每项有"预览"按钮 → 调用 `openDocxCompare(f)`
4. `compareFormData = f` → 传入 `DocxCompareDialog` 的 `:form-data` prop
5. 右侧面板渲染 `<SimulatedCRFForm :fields="formData.fields || []">`

### 关键代码位置
- `frontend/src/App.vue:762` — `openDocxCompare(form)` 设置 compareFormData
- `frontend/src/App.vue:1225-1233` — DocxCompareDialog 使用处
- `frontend/src/components/DocxCompareDialog.vue:32-36` — SimulatedCRFForm 渲染
- `frontend/src/components/SimulatedCRFForm.vue` — CRF 模拟表格渲染
- `backend/src/routers/import_docx.py:300-378` — preview 响应构建（含 fields）
- `backend/src/services/docx_import_service.py` — docx 解析逻辑

### 后端返回的字段结构
```json
{
  "forms": [{
    "index": 0, "name": "表单名", "field_count": 5,
    "fields": [{"index": 0, "label": "字段名", "field_type": "文本", ...}],
    "ai_suggestions": [...], "raw_html": "<table>..."
  }],
  "temp_id": "abc123"
}
```

### 深度代码审查结论
- **Pydantic v2 (2.13.3) + FastAPI**：`response_model_exclude_none` 默认 `False`，`fields: null` 不会被排除
- **数据链路理论上完整**：后端 fields → 前端 importedFormsPreview → openDocxCompare → DocxCompareDialog → SimulatedCRFForm
- **渲染函数覆盖完整**：`renderCtrl()` 覆盖所有 docx 导出的 field_type（文本/数值/日期/单选/多选/标签等）
- **Vue 3 响应式**：`v-for="f in importedFormsPreview"` 的 `f` 是 Proxy，传入 `openDocxCompare` 后赋值给 `compareFormData.value`，响应式链完整
- **el-upload 响应处理**：`on-success` 回调第一个参数是解析后的 response body，与 `handleDocxUploadSuccess(response)` 匹配
- **DocxCompareDialog 生命周期**：`destroy-on-close` 仅销毁内部 template，dialog 组件本身保留在 DOM（`hasOpenedDocxCompare` 始终为 true）

### 排除的可能性
- FastAPI `exclude_none=True`（默认是 False）
- el-upload 响应解析错误（step 2 列表已正确展示）
- field_type 渲染缺失（所有 docx 导出类型均已覆盖）
- CSS 隐藏（scoped 样式 + append-to-body 不影响内容可见性）

## 需要用户协助调试

静态分析无法定位确切根因，需要以下调试信息：

1. **浏览器 DevTools → Network 标签**：找到 `/api/projects/{id}/import-docx/preview` 请求，查看 Response JSON 中 `forms[].fields` 是否为非空数组
2. **浏览器 Console**：点击预览按钮时是否有红色错误或 Vue warning
3. **Vue DevTools**（如有）：检查 DocxCompareDialog 组件的 `formData` prop 值

## Requirements (evolving)

- 预览窗口应正确展示导入解析后的 CRF 表单字段

## Acceptance Criteria (evolving)

- [ ] 点击"预览"后，DocxCompareDialog 正确显示表单字段列表
- [ ] 字段类型（文本、数值、单选等）正确渲染为对应控件

## Definition of Done

- 根据调试结果定位并修复根因
- 验证多种 Word 文档格式的预览效果
- 无回归（导入流程的 step 1/2/3 不受影响）

## Out of Scope

- 左侧原始文档截图面板恢复（当前被 `ENABLE_LEFT_PREVIEW = false` 屏蔽，属独立任务）
- AI 建议展示优化

## Technical Notes

- DocxCompareDialog 左侧面板（原始文档截图）已被临时禁用，仅右侧面板（SimulatedCRFForm）活跃
- `SimulatedCRFForm` 使用 `renderCtrlHtml(field)` 渲染控件，依赖 `field_type`、`options`、`integer_digits` 等属性
