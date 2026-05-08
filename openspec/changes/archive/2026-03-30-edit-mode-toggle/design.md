# Edit Mode Toggle — Design

## 架构概览

纯前端状态切换，零后端改动。利用 Vue 3 `provide/inject` 实现跨组件状态传递。

```
App.vue (provide editMode)
├── el-tabs → 3 个 tab-pane 通过 v-if="editMode" 控制可见性
├── 设置弹窗 → el-switch 控制 editMode
└── FormDesignerTab.vue (inject editMode)
    ├── "新建表单" 按钮 → v-if="editMode"
    └── "设计表单" 按钮 → v-if="editMode"
```

## 状态管理

| 属性 | 类型 | 默认值 | 持久化 |
|------|------|--------|--------|
| `editMode` | `Ref<boolean>` | `false` | `localStorage('crf_edit_mode')` |

### 初始化

```js
const editMode = ref(localStorage.getItem('crf_edit_mode') === 'true')
```

### 持久化

```js
watch(editMode, v => localStorage.setItem('crf_edit_mode', String(v)))
```

### 跨组件传递

```js
// App.vue
provide('editMode', editMode)

// FormDesignerTab.vue
const editMode = inject('editMode', ref(false))
```

## UI 变更

### App.vue — 设置弹窗

在设置弹窗 `<el-form>` 最前面添加编辑模式开关：

```html
<el-form-item label="编辑模式">
  <el-switch v-model="editMode" />
</el-form-item>
```

- 立即生效，不经过"保存"按钮
- 位于设置弹窗第一项

### App.vue — Tab 可见性

```html
<el-tab-pane v-if="editMode" label="选项" name="codelists">
<el-tab-pane v-if="editMode" label="单位" name="units">
<el-tab-pane v-if="editMode" label="字段" name="fields">
```

### App.vue — activeTab 守卫

```js
watch(editMode, (on) => {
  if (!on && ['codelists', 'units', 'fields'].includes(activeTab.value)) {
    activeTab.value = 'info'
  }
})
```

### FormDesignerTab.vue — 按钮隐藏

```html
<el-button v-if="editMode" type="primary" size="small" @click="openAddForm">新建表单</el-button>
<!-- "设计表单" 按钮同理 -->
<el-button v-if="editMode && selectedForm" size="small" type="primary" @click="showDesigner = true">设计表单</el-button>
```

## 不变量 (PBT Properties)

1. **幂等性**：连续两次设置 editMode=false，UI 状态与一次设置完全相同
2. **往返一致性**：`localStorage.setItem('crf_edit_mode', 'true')` → 刷新 → `editMode.value === true`
3. **Tab 守卫不变量**：`editMode === false` 时，`activeTab` 永远不在 `['codelists', 'units', 'fields']` 中
4. **单调性**：editMode 切换不影响已有数据（无副作用）

## 边界条件

- 首次访问（无 localStorage）→ `editMode = false`
- `localStorage('crf_edit_mode')` 值为非 'true' 的任意字符串 → `editMode = false`
- 设置弹窗关闭后 editMode 状态仍保持（不受弹窗生命周期影响）
