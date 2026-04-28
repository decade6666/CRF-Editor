# Spec: R5 — 修复项目列表左侧折叠按钮

## Scope
纯前端功能补全。后端无任何变更。

## Functional Requirements

### FR-5.1 折叠状态管理
- 在 `App.vue` 中维护 `isCollapsed` 响应式变量（布尔值，默认 `false`）
- 点击 Fold 图标按钮切换 `isCollapsed`
- `isCollapsed = true`：侧边栏收起（宽度缩小或隐藏项目名称，仅显示图标模式）
- `isCollapsed = false`：侧边栏展开（恢复完整宽度）

### FR-5.2 折叠与现有功能的兼容
- 折叠状态下仍可切换选中项目（点击项目图标或列表项）
- 折叠状态不影响新增、复制、删除按钮的可用性
- 折叠时与现有 `sidebarWidth` 拖拽逻辑做互斥处理（收起态禁用手动拖拽宽度）

### FR-5.3 不涉及持久化
- `isCollapsed` 状态不持久化到后端或 localStorage（本轮不要求，刷新后恢复展开）

## Acceptance Criteria
- [ ] 点击折叠按钮可在展开/收起之间切换
- [ ] 收起/展开后，项目列表与主内容区布局正常
- [ ] 项目新增、复制、删除、选中行为不受影响
- [ ] 后端无任何新接口或参数变化
