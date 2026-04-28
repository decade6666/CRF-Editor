# Spec: R6 — 表单界面文案统一为「Code（域名）」

## Scope
纯前端文案调整。后端不变。

## Functional Requirements

### FR-6.1 文案替换范围
以下位置的 `Code` 文案统一改为 `Code（域名）`：

| 组件 | 位置 |
|------|------|
| FormDesignerTab.vue | 表单列表表格列头 |
| FormDesignerTab.vue | 创建/编辑表单对话框的 `Code` label |

### FR-6.2 排除范围
- 后端字段名（`code`、`domain`）不得修改
- 不涉及其他 tab 的文案（其他 tab 已在 R2 处理）

## Acceptance Criteria
- [ ] 表单界面可见的相关 `Code` 文案统一为 `Code（域名）`
- [ ] 表单创建、编辑、保存逻辑不变
- [ ] 后端字段名与 API 响应不变
