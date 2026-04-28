# Spec: R2 — 隐藏前端所有 code 显示（不改变行为）

## Scope
纯前端展示调整。后端 schema、API、导出、引用逻辑完全不变。

## Functional Requirements

### FR-2.1 隐藏范围
以下页面/组件中的 code 相关展示必须隐藏：

| 组件 | 隐藏目标 |
|------|----------|
| CodelistsTab.vue | 选项列表中的 `code` 列（如有） |
| UnitsTab.vue | 单位列表中的 `code` 列（如有） |
| FieldsTab.vue | 字段列表中的 `Code（变量名）` 列 |
| FormDesignerTab.vue | 表单列表中的 `Code` 列与编辑对话框的 `Code` label |
| VisitsTab.vue | 访视列表中的 `code` 相关列（如有） |

### FR-2.2 隐藏方式
- 仅移除/隐藏 `el-table-column` 的 `label` 显示或 `el-form-item` 的 `label`
- **不得删除或重命名** v-model 绑定的 data 字段（`code`、`variable_name`、`domain` 等）
- **不得删除** 任何表单 input（可以设置 `type="hidden"` 或不渲染 label，但数据仍传递）
- 后端接口的请求/响应 JSON keys 保持不变

### FR-2.3 排除范围
- 导出逻辑（Word/DB）中的字段引用不受影响
- 编辑对话框中必填的 code 输入框在功能上保持可用，只隐藏 label 文案或将其移到 placeholder

## Acceptance Criteria
- [ ] 选项、单位、字段、表单、访视页面表格中不再显示 code 相关列头
- [ ] 创建、编辑、保存操作行为与之前一致（后端接收到的数据字段不变）
- [ ] 导出 Word/DB 内容与之前一致
- [ ] API 响应中所有 code/variable_name/domain 字段仍正常返回
