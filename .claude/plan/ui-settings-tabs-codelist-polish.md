## 📋 实施计划：设置弹窗 / 主标签 / 字典按钮 UI 微调

### 任务类型
- [x] 前端 (→ Gemini)
- [ ] 后端 (→ Codex)
- [ ] 全栈 (→ 并行)

### 增强后的需求
1. 在设置弹窗的“数据导出”区域，让 `导出所有项目`、`导出当前项目`、`导入项目` 三个按钮宽度一致、左右边界对齐，并占满该分区的可用宽度；保留现有点击、禁用态和 loading 行为。
2. 调整主内容区标签栏的左侧留白，让 `项目信息` 标签不要紧贴左侧项目列表/分隔边界，视觉上与内容区起始边距保持一致。
3. 在表单设计属性面板的“选项”一行中，保留下拉选择框，并把 `新增字典`、`编辑字典` 按钮并排放到右侧；恢复已有的快速编辑字典弹窗入口，`编辑字典` 在未选择字典时禁用。

### 多模型结论汇总
- **Codex 结论**：这是典型的“模板挂接 + 局部样式补位”问题，最小修复优先；不要上升到全局布局重构；`FormDesignerTab.vue` 里的 quick edit codelist 状态和保存逻辑仍在，应该直接复用。
- **Gemini 结论**：按钮与属性行都适合用局部 Flex 布局；tabs 间距应用 scoped 深度样式定点处理，避免影响其它 Element Plus tabs。
- **综合决策**：仅修改 `frontend/src/App.vue`、`frontend/src/components/FormDesignerTab.vue` 和现有前端结构测试；**不改 `frontend/src/styles/main.css`**，除非实施时确认 `App.vue` scoped 样式无法稳定覆盖当前 tabs 结构。

### 技术方案
1. **设置弹窗按钮区**
   - 给 `App.vue` 中“数据导出”按钮容器补语义 class，例如 `settings-transfer-actions`。
   - 去掉当前内联 `max-width:360px; margin:0 auto` 的收窄布局。
   - 在 `App.vue` 的 scoped 样式中新增局部规则：容器纵向排列、按钮 `width: 100%`、重置 Element Plus 相邻按钮默认 `margin-left`。

2. **主标签左侧间距**
   - 给主标签 `el-tabs` 增加语义 class，例如 `main-content-tabs`。
   - 通过 `App.vue` 的 `scoped + :deep(...)` 仅对这一组 tabs 增加 header/nav 的左侧 inset。
   - 目标值对齐 `frontend/src/styles/main.css:123` 中 `.content-inner` 的水平起始边距（当前为 `20px`），实现“标签头起点 ≈ 内容区起点”的视觉一致性。

3. **表单设计器字典操作区**
   - 在 `FormDesignerTab.vue` 的 choice field 属性行里，把 `el-select` 与按钮包进一个横向 flex 容器。
   - 左侧 `el-select` 占剩余宽度，右侧保留 `新增字典` 按钮，并恢复 `编辑字典` 按钮。
   - `编辑字典` 直接绑定现有 `openQuickEditCodelist()`，并使用 `:disabled="!editProp.codelist_id"`。
   - 把 `showQuickEditCodelist` 对应的弹窗模板重新接回当前组件，复用已有的 `quickEditCodelistName`、`quickEditCodelistOpts`、`quickEditAddOptRow()`、`quickEditDelOptRow()`、`quickSaveCodelist()`、`closeQuickEditCodelist()`。

### 实施步骤
1. **标记 `App.vue` 的两个 UI 入口**
   - 在 `frontend/src/App.vue:706-724` 的主标签 `el-tabs` 上增加局部 class。
   - 在 `frontend/src/App.vue:757-762` 的按钮区域上增加局部 class。
   - 预期产物：模板结构仅增加 class，不改行为绑定。

2. **收口设置弹窗按钮布局**
   - 把按钮容器改成“整列占满 + 子按钮全宽”的局部布局。
   - 保留 `:disabled="!selectedProject"`、`:loading="importProjectLoading"`、`@click` 逻辑不变。
   - 预期产物：三个按钮视觉等宽，左右边界对齐。

3. **补主标签头左侧 inset**
   - 在 `frontend/src/App.vue:955-1041` 的 scoped 样式区新增 `main-content-tabs` 局部样式。
   - 优先作用于该 tabs 实例的 header/nav 容器，而不是全局 `.el-tabs__header`。
   - 预期产物：`项目信息` 标签起点与内容区内边距一致，不影响其它 tabs。

4. **重排表单设计器“选项”一行**
   - 在 `frontend/src/components/FormDesignerTab.vue:738` 把当前 `el-select + +` 改为 `el-select + 新增字典 + 编辑字典`。
   - 给该行补局部 flex 样式，例如 `choice-codelist-row` / `choice-codelist-actions`。
   - 预期产物：下拉框在左，新增/编辑按钮在右并排显示。

5. **恢复 quick edit codelist 模板入口**
   - 在 `frontend/src/components/FormDesignerTab.vue:767-771` 附近保留 `showQuickAddCodelist` 弹窗，并补回 `showQuickEditCodelist` 对应弹窗。
   - 只复用当前脚本里已存在的 refs / methods，不新增新状态机。
   - 预期产物：点击“编辑字典”能打开已有编辑流，保存后继续刷新字典与字段数据。

6. **补结构回归测试**
   - 扩展 `frontend/tests/appSettingsShell.test.js:11-20`：断言设置区三个按钮仍存在，且导入按钮仍保留 loading 绑定。
   - 扩展 `frontend/tests/quickEditBehavior.test.js:21-48`：断言 `openQuickEditCodelist` 入口存在、`编辑字典` 按钮带禁用条件、`showQuickEditCodelist` 模板已挂回。
   - 预期产物：最小测试覆盖当前回归点，不引入新测试框架。

7. **验证与收尾**
   - 运行结构测试与前端构建。
   - 手工确认三个 UI 点在实际界面上的视觉表现。
   - 预期产物：测试通过，构建通过，视觉需求满足。

### 伪代码
```vue
<!-- frontend/src/App.vue -->
<el-tabs class="main-content-tabs" v-model="activeTab">
  ...
</el-tabs>

<div class="settings-transfer-actions">
  <el-button @click="exportFullDatabase">导出所有项目</el-button>
  <el-button :disabled="!selectedProject" @click="exportProjectDatabase">导出当前项目</el-button>
  <el-button :loading="importProjectLoading" @click="triggerImportProject">导入项目</el-button>
</div>

<style scoped>
.settings-transfer-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.settings-transfer-actions :deep(.el-button) {
  width: 100%;
  margin-left: 0;
}
.main-content-tabs :deep(.el-tabs__header /* or nav-wrap */) {
  padding-left: 20px;
}
</style>
```

```vue
<!-- frontend/src/components/FormDesignerTab.vue -->
<el-form-item v-if="isChoiceField(editProp.field_type)" label="选项">
  <div class="choice-codelist-row">
    <el-select v-model="editProp.codelist_id">...</el-select>
    <el-button @click="openQuickAddCodelist">新增</el-button>
    <el-button :disabled="!editProp.codelist_id" @click="openQuickEditCodelist">编辑</el-button>
  </div>
</el-form-item>

<el-dialog v-model="showQuickEditCodelist" title="编辑选项字典">
  <!-- 复用 quickEditCodelistName / quickEditCodelistOpts / quickSaveCodelist -->
</el-dialog>
```

### 关键文件
| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/App.vue:706-724` | 修改 | 给主标签 `el-tabs` 增加局部 class，作为 header inset 的作用域 |
| `frontend/src/App.vue:757-762` | 修改 | 重排设置弹窗“数据导出”按钮容器与按钮宽度 |
| `frontend/src/App.vue:955-1041` | 修改 | 增加 scoped 局部样式，处理按钮全宽与 tabs 左侧 inset |
| `frontend/src/components/FormDesignerTab.vue:566-622` | 复用 | 现有 quick add / quick edit codelist 状态与保存逻辑，实施时不重写 |
| `frontend/src/components/FormDesignerTab.vue:738` | 修改 | 将“选项”行改为下拉框 + 新增/编辑按钮布局 |
| `frontend/src/components/FormDesignerTab.vue:767-771` | 修改 | 保留 quick add dialog，并补回 quick edit dialog 模板入口 |
| `frontend/src/components/FormDesignerTab.vue:776-797` | 修改 | 增加属性行局部 flex 样式 |
| `frontend/tests/appSettingsShell.test.js:11-20` | 修改 | 扩展设置弹窗按钮结构断言 |
| `frontend/tests/quickEditBehavior.test.js:21-48` | 修改 | 扩展 quick edit codelist 入口与禁用态断言 |

### 风险与缓解
| 风险 | 缓解措施 |
|------|----------|
| Element Plus 相邻按钮默认 `margin-left` 导致纵向按钮看似未对齐 | 在 `settings-transfer-actions` 作用域内重置按钮 margin，仅影响该区域 |
| tabs 深度样式误伤其它标签组件 | 只在 `App.vue` 主标签实例上加 class 并配合 `:deep` 作用域，不改全局 `main.css` |
| 恢复编辑按钮后，弹窗模板与当前状态字段不一致 | 只复用 `FormDesignerTab.vue:586-622` 已存在的 state/method，不引入新字段 |
| 当前前端没有统一 `npm test` 脚本，验证容易遗漏 | 延续已有 `node:test` 方式运行目标测试文件，并补 `npm run build` |

### 验证计划
1. 结构测试：
   - `cd frontend && node --test tests/appSettingsShell.test.js tests/quickEditBehavior.test.js`
2. 构建验证：
   - `cd frontend && npm run build`
3. 手工验收：
   - 打开设置弹窗，确认 3 个按钮等宽且铺满该分区可用宽度。
   - 检查主界面 `项目信息` 标签左侧不再贴边，和内容区起点对齐。
   - 进入表单设计器，选择单选/多选字段，确认“选项”行显示“新增/编辑”按钮；未选字典时“编辑”禁用；点击“编辑”能打开并保存已有字典。

### 范围边界
- **做**：局部模板 class、局部 scoped 样式、恢复已有 quick edit codelist 模板入口、补最小结构测试。
- **不做**：后端接口修改、数据结构调整、全局样式重构、CodelistsTab 功能扩展、trailing underscore UI 补完、公共组件抽象。

### SESSION_ID（供 /ccg:execute 使用）
- CODEX_SESSION: `019d8f28-9ead-71f3-8a30-4008c10a1f2e`
- GEMINI_SESSION: `f7282f11-6669-4317-90ee-a18b7a502c78`
