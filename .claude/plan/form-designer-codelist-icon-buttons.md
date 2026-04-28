## 实施计划：表单设计器字典按钮图标化

### 任务类型
- [x] 前端
- [ ] 后端
- [ ] 全栈

### 增强后的需求
- 将 `frontend/src/components/FormDesignerTab.vue` 属性编辑区中“选项”一行的“新增字典”“编辑字典”两个文字按钮改为更紧凑的图标按钮。
- 在不改动现有交互逻辑与 API 的前提下，尽量压缩右侧按钮占位，把更多横向空间让给左侧字典下拉框，提升长字典名称的可见文本长度。
- 保持现有禁用逻辑、弹窗入口、颜色语义不变。
- 图标按钮需保留可访问名称与悬停提示，避免只剩图标后语义丢失。

### 范围边界
- 仅修改以下文件：
  - `frontend/src/components/FormDesignerTab.vue`
  - `frontend/tests/quickEditBehavior.test.js`
- 不调整后端接口。
- 不重构属性编辑器结构。
- 不扩展到单位按钮、其他表单项或全局按钮样式。

### 验收标准
1. `新增字典`、`编辑字典` 变为图标按钮。
2. 左侧 `el-select` 相比现在获得更多可用宽度。
3. `openQuickAddCodelist`、`openQuickEditCodelist` 绑定不变。
4. `编辑字典` 在未选择字典时仍保持禁用。
5. 图标按钮具备 `aria-label` / `title` 等稳定可访问属性。
6. 对应前端测试同步更新并通过。

### 技术方案

#### Step 1：调整模板节点
**文件**：`frontend/src/components/FormDesignerTab.vue`

- 在 `@element-plus/icons-vue` 导入中补充 `Plus`、`EditPen`。
- 保留 `choice-codelist-row` 现有结构：左侧 `el-select` + 右侧操作区。
- 将两个文字按钮替换为图标按钮：
  - 新增字典：`Plus`
  - 编辑字典：`EditPen`
- 保留现有行为：
  - `@click="openQuickAddCodelist"`
  - `@click="openQuickEditCodelist"`
  - `:disabled="!editProp.codelist_id"`
- 为两个按钮增加：
  - `title="新增字典" / "编辑字典"`
  - `aria-label="新增字典" / "编辑字典"`

#### Step 2：压缩局部布局占位
**文件**：`frontend/src/components/FormDesignerTab.vue`

- 保持：
  - `.choice-codelist-select { flex: 1; min-width: 0; }`
  - `.choice-codelist-actions { flex-shrink: 0; }`
- 最小微调样式：
  - 收紧 `.choice-codelist-row` 的 gap
  - 收紧 `.choice-codelist-actions` 的 gap
- 若仅移除文字后仍不够紧凑，再只对该区域按钮增加局部紧凑样式，不影响全局按钮。

#### Step 3：同步测试
**文件**：`frontend/tests/quickEditBehavior.test.js`

- 保留现有结构与行为断言：
  - `choice-codelist-row`
  - `choice-codelist-actions`
  - `@click="openQuickAddCodelist"`
  - `@click="openQuickEditCodelist"`
  - `:disabled="!editProp.codelist_id"`
- 移除对按钮正文“新增字典”“编辑字典”的断言。
- 改为断言稳定特征：
  - `aria-label` 或 `title`
  - 图标名 `Plus`、`EditPen`
  - `choice-codelist-select` 仍存在

### 推荐实施顺序
1. 修改 `FormDesignerTab.vue` 图标导入与按钮模板。
2. 微调 `choice-codelist-*` 局部样式。
3. 更新 `quickEditBehavior.test.js`。
4. 运行相关前端测试做回归验证。

### 验证点
- 属性编辑区“选项”一行中，下拉框可见宽度增加。
- 两个图标按钮点击行为与原来一致。
- 未选择字典时“编辑字典”按钮禁用。
- 图标按钮悬停时提示正确，辅助技术可识别。
- `frontend/tests/quickEditBehavior.test.js` 通过。

### 风险与注意事项
- 图标按钮若无 `aria-label` / `title`，可用性会下降，必须补齐。
- Element Plus `small` 按钮默认仍有内边距；若空间改善不足，仅做局部样式压缩，不要改全局。
- 当前测试属于源码级正则断言，更新时应匹配稳定属性，避免对模板排版过度耦合。
