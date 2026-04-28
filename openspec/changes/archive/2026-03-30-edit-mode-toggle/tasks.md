# Edit Mode Toggle — Tasks

## App.vue 改动

- [x] 1.1 添加 editMode ref，从 localStorage 初始化（默认 false）
- [x] 1.2 添加 watch(editMode) 持久化到 localStorage
- [x] 1.3 添加 provide('editMode', editMode)
- [x] 1.4 设置弹窗第一项添加 el-switch 控制 editMode
- [x] 1.5 为选项/单位/字段三个 el-tab-pane 添加 v-if="editMode"
- [x] 1.6 添加 watch(editMode) activeTab 守卫：OFF 时跳回 info

## FormDesignerTab.vue 改动

- [x] 2.1 添加 inject('editMode', ref(false))
- [x] 2.2 "新建表单" 按钮添加 v-if="editMode"
- [x] 2.3 "设计表单" 按钮添加 v-if="editMode"

## 验证

- [x] 3.1 手动验证：初次加载 editMode=OFF，三标签+两按钮不可见
- [x] 3.2 手动验证：开启编辑模式后三标签+两按钮可见
- [x] 3.3 手动验证：关闭编辑模式且当前在隐藏标签时，自动跳回 info
- [x] 3.4 手动验证：刷新页面后 editMode 状态持久化
