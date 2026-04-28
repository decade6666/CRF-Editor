# Spec: R3 — 为核心列表补齐拖拽排序，拖拽后自动重排序号

## Scope
前端：FieldsTab、FormDesignerTab（表单主列表）、VisitsTab 补充 vuedraggable。
后端：复用现有 OrderService，不新增排序算法。
**本轮不含 visit_form 嵌套排序。**

## Functional Requirements

### FR-3.1 已具备 vs 待补充

| 页面 | 当前状态 | 本轮动作 |
|------|----------|----------|
| CodelistsTab（选项列表） | 已支持拖拽 | 无需改动 |
| UnitsTab | 已支持拖拽 + useOrderableList | 无需改动 |
| FieldsTab | 手工输入序号 | **补拖拽** |
| FormDesignerTab（表单主列表） | 手工输入序号 | **补拖拽** |
| VisitsTab（访视主列表） | 手工输入序号 | **补拖拽** |

### FR-3.2 前端实现规范
- 复用 `useOrderableList.js` 的现有拖拽持久化协议
- 拖拽完成后提交排序后的完整 ID 数组至对应 reorder 接口
- **过滤/搜索态禁用拖拽**（通过 `:disabled` 或 `v-if` 控制 vuedraggable 的启用状态）
- 拖拽 handle 样式与 UnitsTab 保持一致（drag icon）

### FR-3.3 后端 reorder 接口
复用现有接口（均已存在），确认鉴权一致：

| 资源 | 现有接口 | 排序字段 |
|------|----------|----------|
| field_definition | PATCH /api/fields/reorder | order_index |
| form | PATCH /api/forms/reorder | order_index |
| visit | PATCH /api/visits/reorder | order_index |

- 接口要求：接收完整作用域 ID 列表；不完整则 400
- OrderService 保证同一作用域内 order_index 为 1..n 稠密排列

### FR-3.4 排序作用域
- 字段：同一 project 下
- 表单：同一 project 下
- 访视：同一 project 下

## Acceptance Criteria
- [ ] FieldsTab、FormDesignerTab（表单主列表）、VisitsTab 支持拖拽排序
- [ ] 拖拽后序号自动更新，无需手动填写
- [ ] 刷新页面后顺序保持一致
- [ ] 导出/预览顺序与拖拽结果一致
- [ ] 过滤/搜索状态下拖拽功能禁用
- [ ] 提交不完整 ID 列表时后端返回 400
