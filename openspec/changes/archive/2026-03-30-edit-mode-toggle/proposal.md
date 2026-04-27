# Edit Mode Toggle — Proposal

## 需求（增强后）

**目标**：在设置区域增加"编辑模式"开关，默认关闭（只读模式）。关闭时隐藏高级编辑入口，简化界面；开启时恢复当前完整显示状态。

**触发场景**：多用户环境中，普通查阅人员不需要看到选项/单位/字段等配置入口，也不应能进入表单设计器。

**Edit Mode = OFF（默认）**：
- 隐藏标签页：选项、单位、字段
- 在"表单"标签内隐藏："新建表单"按钮、"设计表单"按钮
- 若当前 activeTab 是 codelists/units/fields，自动切换到 info

**Edit Mode = ON**：当前完整显示状态，所有功能可见。

**持久化**：localStorage `crf_edit_mode`，纯前端，无需后端存储。

---

## 发现的约束集

### 硬约束

- `editMode` 状态必须在 `App.vue` 层管理（控制 el-tabs tab-pane 的 `v-if`）
- `FormDesignerTab.vue` 必须通过 `inject('editMode')` 消费（已有 `inject('refreshKey')` 先例）
- 标签页隐藏用 `v-if`，不用 `:disabled`（避免残留导航状态）
- editMode 默认 `false`（OFF）
- 无后端改动

### 软约束

- localStorage key 命名规范：`crf_edit_mode`（与 `crf_theme`、`crf_sidebarWidth` 保持一致）
- 开关放在设置弹窗内，作为 `el-switch`，立即生效，不经过"保存"按钮
- 不破坏现有功能

### 依赖关系

- `App.vue` → `FormDesignerTab.vue`：通过 `provide/inject` 传递 `editMode`
- 修改顺序：先 `App.vue`（provide + tabs 控制），再 `FormDesignerTab.vue`（inject + 按钮控制）

### 风险

- 当 editMode 切换为 OFF 时，若 `activeTab` 正在 codelists/units/fields，需强制跳回 info（否则 UI 卡死）

---

## 涉及文件

| 文件 | 改动 |
|------|------|
| `frontend/src/App.vue` | +editMode ref、+provide、+watch(activeTab guard)、设置弹窗+switch、三个 tab-pane 加 v-if |
| `frontend/src/components/FormDesignerTab.vue` | +inject editMode、两个按钮加 v-if |

---

## 成功判据（可验证）

1. 初次加载时三个标签（选项/单位/字段）不可见，新建表单/设计表单按钮不可见
2. 打开设置弹窗 → 开启"编辑模式"开关 → 三个标签立即出现，按钮立即可见
3. 关闭"编辑模式"→ 三个标签立即消失，按钮立即隐藏
4. 刷新页面后 editMode 状态与上次一致（localStorage 持久化）
5. 当前在"选项"标签 → 关闭编辑模式 → 自动跳转到"项目信息"标签
