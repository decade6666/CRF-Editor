# fix: 表单设计器属性面板文案和标签字号调整

## Goal

微调表单设计界面右侧属性编辑窗口的字段属性文案与展示样式，使属性标签更清晰，并避免 `OID(变量名)` 在右侧面板中换行；同时补齐字段实例标签样式（加粗、字号）在设计器预览、快速编辑、后端保存和 Word 导出之间的可追溯记录。

## User Requirements

1. 表单设计界面右侧属性编辑窗口中，文本框左侧的标签宽度略微调大，让 `OID(变量名)` 不换行。
2. `变量标签` 统一改为 `字段标签`。
3. 字段的 `选项` 属性改为 `字段选项`。
4. `标签字号` 选择 `大` 时，对应字号再略微增大。

## Actual Scope

### In scope

- `FormDesignerTab.vue` 属性编辑窗口与快速编辑弹窗文案。
- 表单设计属性编辑窗口 Element Plus `label-width`。
- 标签字号展示映射中的 `large` 档位。
- 字段实例标签样式控制：`label_bold` 与 `label_font_size` 的前端编辑、快编、预览和保存链路。
- 后端字段实例 schema / router 对 `label_bold` 与 `label_font_size` 的接收、返回与保存。
- `SimulatedCRFForm.vue`、`VisitsTab.vue`、`TemplatePreviewDialog.vue` 等预览路径的标签样式 helper 收敛。
- 前后端标签字号档位映射记录到跨栈契约。
- 相关前端源码结构测试与后端字段路由测试。

### Out of scope

- 选项字典管理 Tab 的主导航文案。
- `FieldsTab.vue` 字段库维护弹窗文案。
- 浏览器实机截图验证（本轮未运行）。
- Git commit（按项目规则需用户明确授权）。

## Implementation Summary

- 将 `FormDesignerTab.vue` 右侧属性编辑窗口的 `label-width` 从 `70px` 调整为 `88px`。
- 将属性编辑窗口与快速编辑弹窗中的 `变量标签` 改为 `字段标签`。
- 将表单设计器字段实例的选择类属性 `选项` 改为 `字段选项`。
- 将 `formFieldPresentation.js` 中 `label_font_size === 'large'` 的预览字号从 `15px` 调整为 `16px`。
- 新增/串联 `label_bold` 与 `label_font_size`：属性面板、快速编辑、快照/撤销回放、PATCH `/form-fields/{ff_id}/colors`、后端 schema/router、预览 helper、Word 导出字号/加粗解析。
- 将标签样式聚合到 `getFormFieldLabelPreviewStyle()`，并提供 `includeBackground: false` 供 `SimulatedCRFForm.vue` 复用同一字重/字号逻辑但保留组件自有单元格底色。
- 将快速编辑中的 `label_bold` 内存态统一为 `1/0`，与属性面板 `el-switch` 的 `active-value/inactive-value` 一致。
- 将后端 `/colors` 端点内部模型和函数命名更新为字段样式语义，docstring 同步说明其同时处理底纹、文字颜色和标签样式。
- 在 `.trellis/spec/guides/cross-stack-contracts.md` 记录前端 px 与后端 pt 的标签字号档位对应关系。

## Relevant Files

- `frontend/src/components/FormDesignerTab.vue`
- `frontend/src/components/SimulatedCRFForm.vue`
- `frontend/src/components/VisitsTab.vue`
- `frontend/src/components/TemplatePreviewDialog.vue`
- `frontend/src/composables/formFieldPresentation.js`
- `frontend/tests/formFieldPresentation.test.js`
- `frontend/tests/quickEditBehavior.test.js`
- `backend/src/schemas/field.py`
- `backend/src/routers/fields.py`
- `backend/src/models/form_field.py`
- `backend/src/services/export_service.py`
- `backend/tests/test_fields_router.py`
- `.trellis/spec/guides/cross-stack-contracts.md`
- `.trellis/tasks/06-21-designer-property-label-copy/prd.md`

## Validation

```bash
cd frontend && node --test tests/formFieldPresentation.test.js tests/quickEditBehavior.test.js
cd frontend && node --test tests/*.test.js
cd frontend && npm run lint -- --quiet
cd backend && python -m pytest tests/test_fields_router.py -q
```

Results:

- RED step: targeted tests failed before implementation on old `15px` large字号 and old labels.
- Initial targeted frontend tests: 54/54 passed.
- Initial full frontend source-level tests: 276/276 passed.
- Initial lint errors-only check: passed with no errors.
- Initial code review (`code-review low`): `(none)`.
- Follow-up review found task-record scope mismatch and minor consistency issues; this file now records the actual expanded scope.
- Second-pass review found `label_bold=null` could reach non-null database columns through API schemas; create, PUT, and PATCH `/colors` now reject null and `test_fields_router.py` covers all three paths.
- Follow-up validation after review fixes is recorded in `task.json` and final session output.

## Done Checklist

- [x] 读取 Trellis frontend/backend 相关规范与 shared guide。
- [x] 补充/更新测试断言并先确认 RED。
- [x] 完成属性面板标签宽度、文案和字号映射修改。
- [x] 串联 `label_bold` / `label_font_size` 前后端保存与预览路径。
- [x] 同步 `/colors` 端点样式语义说明。
- [x] 记录前后端标签字号档位跨栈映射。
- [x] 更正任务记录，使其覆盖实际 diff 范围。
- [ ] 浏览器实机截图验证（本轮未运行）。
- [ ] Git commit（按项目规则需用户明确授权）。
