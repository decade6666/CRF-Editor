## 实施计划：表单设计器新增选项弹窗对齐编辑弹窗

### 任务类型
- [x] 前端
- [ ] 后端
- [ ] 全栈

### 增强后的需求
- 将 `frontend/src/components/FormDesignerTab.vue` 中表单设计界面的快捷“新增选项”弹窗，调整为与现有“编辑选项字典”弹窗保持一致的布局和交互。
- 在不修改后端接口、不重构整体结构的前提下，统一新增/编辑两种弹窗的表单项、选项编辑方式和底部操作体验。
- 保持新增语义不变：仍然是创建新字典并自动关联到当前字段，不变更现有 API 调用链。
- 保持最小改动原则，只修改快捷新增字典相关实现，避免影响已存在的编辑字典流程。

### 范围边界
- 仅修改以下文件：
  - `frontend/src/components/FormDesignerTab.vue`
  - `frontend/tests/quickEditBehavior.test.js`
- 不修改后端 API、数据库结构与接口契约。
- 不抽离新组件、不重构为通用 composable。
- 不改动常规字典管理页 `frontend/src/components/CodelistsTab.vue`。

### 现状定位
- 快捷新增弹窗：`frontend/src/components/FormDesignerTab.vue:928`
- 快捷编辑弹窗：`frontend/src/components/FormDesignerTab.vue:935`
- 当前主要差异：
  1. 新增弹窗缺少“描述”字段。
  2. 新增弹窗的选项列表不可行内编辑，仅显示只读表格 + 底部输入行。
  3. 新增弹窗缺少“后加下划线”列。
  4. 新增弹窗缺少逐行删除操作。
  5. 新增弹窗缺少保存中的 loading / disabled 状态。
  6. 新增弹窗宽度与关闭行为未与编辑弹窗统一。

### 验收标准
1. 新增弹窗宽度、关闭行为、整体布局与编辑弹窗一致。
2. 新增弹窗新增“描述”字段。
3. 新增弹窗的选项表格支持行内编辑编码/标签。
4. 新增弹窗支持“后加下划线”勾选与逐行删除。
5. 新增弹窗底部新增行方式与编辑弹窗一致。
6. 新增保存过程具备防重复提交能力，并在按钮上体现 loading / disabled。
7. 新增保存后仍沿用现有创建并自动关联逻辑。
8. 对应源码级测试同步更新并通过。

### 技术方案

#### Step 1：补齐新增态状态字段
**文件**：`frontend/src/components/FormDesignerTab.vue`

- 为快捷新增字典补充：
  - `quickCodelistDescription`
  - `quickAddCodelistSaving`
- 统一新增侧选项行结构为：
  - `{ id: null, code, decode, trailing_underscore }`
- `openQuickAddCodelist` / `closeQuickAddCodelist` 同步初始化和重置上述字段。
- 保留现有：
  - `showQuickAddCodelist`
  - `quickCodelistName`
  - `quickCodelistOpts`
  - `quickOptCode`
  - `quickOptDecode`
- `quickOptTrailing` 可移除，改为和编辑态一致地通过表格中每行 `trailing_underscore` 管理。

#### Step 2：对齐新增弹窗模板
**文件**：`frontend/src/components/FormDesignerTab.vue`

- 将新增弹窗改为接近编辑弹窗的结构：
  - 宽度改为 `560px`
  - 增加 `:close-on-click-modal="false"`
  - 增加 `:close-on-press-escape="false"`
  - 表单区包含“名称”“描述”
  - 选项区改为可编辑 `el-table`
  - 列包含：
    - 编码
    - 标签
    - 后加下划线
    - 操作（删除）
  - 底部保留新增一行输入区：
    - `quickOptCode`
    - `quickOptDecode`
    - 添加按钮
- 复用 `toggleTrailingLine(row)` 与 `quickDelOptRow(idx)` 风格，不新增额外抽象。

#### Step 3：增强新增保存逻辑
**文件**：`frontend/src/components/FormDesignerTab.vue`

- 在 `quickAddCodelist` 中增加：
  - `if (quickAddCodelistSaving.value) return`
  - 名称非空校验
  - 每一行 `code/decode` 完整性校验
  - 保存态开始/结束控制
- 创建字典时带上 `description`：
  - `POST /api/projects/${props.projectId}/codelists`
- 创建选项仍沿用当前逐条 `POST /options` 的方式。
- 保存成功后继续：
  - `loadCodelists()`
  - `editProp.codelist_id = created.id`
  - `closeQuickAddCodelist()`
- 不改为 snapshot 接口，不改编辑流程。

#### Step 4：补充源码级测试
**文件**：`frontend/tests/quickEditBehavior.test.js`

- 新增断言覆盖：
  1. 新增弹窗模板已对齐：
     - `quickCodelistDescription`
     - `v-model="row.code"`
     - `v-model="row.decode"`
     - `trailing_underscore`
     - 删除操作
     - `quickAddCodelistSaving`
     - `:loading="quickAddCodelistSaving"`
  2. 新增弹窗初始化/关闭会重置状态。
  3. 新增保存逻辑带有：
     - 防重复提交
     - 行完整性校验
     - `description` 提交
     - 成功后刷新字典并回填 `editProp.codelist_id`

### 推荐实施顺序
1. 修改 `FormDesignerTab.vue` 中快捷新增字典状态与方法。
2. 修改新增弹窗模板，使其与编辑弹窗结构对齐。
3. 更新 `quickEditBehavior.test.js`。
4. 运行相关前端测试验证回归。

### 验证点
- 新增弹窗打开后，界面结构与编辑弹窗一致，仅标题和提交语义不同。
- 新增弹窗中可直接编辑已加入的选项行。
- 勾选“后加下划线”后，提交 payload 包含 `trailing_underscore`。
- 点击删除可移除对应选项行。
- 保存中按钮禁用且显示 loading。
- 保存成功后，当前字段自动选中新创建字典。

### 风险与注意事项
- 当前 `frontend/src/components/FormDesignerTab.vue` 与 `frontend/tests/quickEditBehavior.test.js` 已有未提交改动，实施时仅触达快捷新增字典相关片段。
- 由于测试是源码级正则匹配，应优先断言稳定结构与关键字段，避免对换行/格式过度耦合。
- 本次不处理常规字典管理页 `CodelistsTab.vue`，避免扩大范围。
