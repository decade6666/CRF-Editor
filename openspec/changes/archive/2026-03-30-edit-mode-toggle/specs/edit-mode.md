# Edit Mode Toggle — 功能规格

## 1. editMode 状态定义

- **类型**：`Ref<boolean>`
- **默认值**：`false`（只读模式）
- **持久化 key**：`crf_edit_mode`
- **持久化策略**：`watch(editMode, v => localStorage.setItem('crf_edit_mode', String(v)))`
- **初始化策略**：`localStorage.getItem('crf_edit_mode') === 'true'`

## 2. editMode = OFF 时隐藏的元素

### App.vue

| 元素 | 方式 | 说明 |
|------|------|------|
| `<el-tab-pane label="选项" name="codelists">` | `v-if="editMode"` | 整个 tab-pane 不渲染 |
| `<el-tab-pane label="单位" name="units">` | `v-if="editMode"` | 整个 tab-pane 不渲染 |
| `<el-tab-pane label="字段" name="fields">` | `v-if="editMode"` | 整个 tab-pane 不渲染 |

### FormDesignerTab.vue

| 元素 | 方式 | 说明 |
|------|------|------|
| "新建表单" 按钮 | `v-if="editMode"` | 按钮不渲染 |
| "设计表单" 按钮 | `v-if="editMode"` | 按钮不渲染 |

## 3. activeTab 守卫

**触发条件**：`editMode` 从 `true` 变为 `false`
**行为**：若 `activeTab` 当前值为 `codelists`、`units` 或 `fields`，则自动设为 `'info'`
**实现**：`watch(editMode, ...)`

## 4. 设置弹窗 — 编辑模式开关

- **位置**：设置弹窗 `<el-form>` 第一个 `<el-form-item>`
- **控件**：`<el-switch v-model="editMode" />`
- **标签**：`"编辑模式"`
- **行为**：立即生效，不需要点击"保存"按钮

## 5. provide/inject 传递

- **App.vue**：`provide('editMode', editMode)`
- **FormDesignerTab.vue**：`const editMode = inject('editMode', ref(false))`
- **先例**：与现有 `provide('refreshKey', refreshKey)` 模式一致

## 6. 成功判据

1. 初次加载 → 三个标签（选项/单位/字段）不可见，新建表单/设计表单按钮不可见
2. 设置弹窗 → 开启编辑模式 → 三个标签、两个按钮立即出现
3. 关闭编辑模式 → 三个标签、两个按钮立即消失
4. 刷新页面 → editMode 状态持久化
5. 当前在"选项"标签 → 关闭编辑模式 → 自动跳转到"项目信息"
