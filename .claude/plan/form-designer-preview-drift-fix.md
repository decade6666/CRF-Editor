## 📋 实施计划：表单设计器预览串表与错位修复

### 任务类型
- [x] 前端
- [ ] 后端
- [ ] 全栈

### 结构化需求增强

#### 目标
修复 `frontend/src/components/FormDesignerTab.vue` 中表单切换后的两类问题：
1. 选中新的表单后，字段列表与实时预览会短暂保留旧表单内容，导致“预览效果与实际表单不对应”；
2. 快速连续点击多个表单时，较早发出的字段请求晚返回后会覆盖当前状态，造成内容“漂移到其他表单”。

#### 范围
本次仅处理前端最小必要范围：
- `frontend/src/components/FormDesignerTab.vue`
- 与该缺陷直接相关的前端测试

#### 非目标
- 不修改后端接口与缓存协议
- 不调整预览布局、灰底样式、备注区视觉
- 不重构 `useCRFRenderer.js` / `formFieldPresentation.js`
- 不扩展到 `VisitsTab.vue`、`SimulatedCRFForm.vue` 等其他预览入口

#### 验收标准
- 单次从表单 A 切到表单 B 时，字段列表与实时预览只显示 B 的内容；
- 快速连续点击 A → B → C 时，最终页面只能落在 C 的字段与预览上，旧请求不能回写；
- 切换表单后不再沿用上一表单的字段选中态；
- 现有设计备注自动保存保护逻辑保持不变；
- 相关前端测试通过，前端构建通过。

### 当前代码证据
- `selectedForm` 与 `formFields` 是设计器的核心状态：`frontend/src/components/FormDesignerTab.vue:37-39`
- 当前通过 `watch(selectedForm, loadFormFields)` 在表单切换后异步加载字段：`frontend/src/components/FormDesignerTab.vue:78-83`
- `loadFormFields()` 直接用当前 `selectedForm.value.id` 发请求，并在返回后直接覆写 `formFields.value`，没有做请求收敛：`frontend/src/components/FormDesignerTab.vue:78-82`
- 点击表单行时，`selectForm()` 仅切换 `selectedForm`，不会先清空旧字段状态：`frontend/src/components/FormDesignerTab.vue:555-564`
- 实时预览最终依赖 `designerPreviewFields` / `designerRenderGroups`，其源头仍是 `formFields`：`frontend/src/components/FormDesignerTab.vue:462-469`
- 切换项目时已经有字段属性自动保存的 flush/reset 逻辑，但切换表单时未复用：`frontend/src/components/FormDesignerTab.vue:762-787,1072-1083`

### 根因判断
1. **切换瞬间沿用旧数据**：`selectedForm` 已切换，但 `formFields` 未立即清空，导致界面在新请求返回前仍展示旧表单字段。
2. **异步请求竞态**：旧表单的 `/api/forms/{id}/fields` 请求如果晚于新表单返回，仍会直接回写 `formFields`，导致当前选中表单与字段/预览错位。
3. **字段选择状态未收口**：表单切换后没有同步清理 `selectedFieldId`、`selectedIds` 及字段编辑上下文，容易让旧表单的编辑态残留在新表单视图中。

### 实施方案

#### 1. 收敛字段加载请求，只允许最新选择回写
- 为 `loadFormFields()` 增加“请求序号”或“目标 formId 快照”；
- 请求发起时记录当前目标表单 ID；
- 响应返回时同时校验：
  - 该响应仍对应最新一次加载；
  - `selectedForm.value?.id` 仍等于目标表单 ID；
- 任一条件不满足则丢弃响应，不更新 `formFields`。

预期结果：快速点击多个表单时，旧请求不会把内容写回当前界面。

#### 2. 表单切换时立即清空旧表单字段视图状态
- 在表单切换确认成功后，先清空或重置：
  - `formFields`
  - `selectedIds`
  - `selectedFieldId`
  - 字段属性编辑态（复用现有 reset helper）
- 然后再触发新表单字段加载。

预期结果：用户点到新表单后，不再短暂看到上一表单的字段和预览。

#### 3. 保留现有备注自动保存保护逻辑
- 继续保留 `selectForm()` 里对 `flushDesignNotesSave()` 的调用；
- 仅在其成功后进入“清状态 + 发新请求”流程；
- 若保存失败，仍回滚当前行选中状态，不改变现有交互。

预期结果：本次修复只处理字段/预览串表，不破坏备注自动保存的保护边界。

#### 4. 视现有 helper 收敛字段属性自动保存上下文
- 评估是否在表单切换时复用 `flushFieldPropSaveBeforeReset()` / `resetFieldPropAutoSaveState()`；
- 目标不是新增复杂交互，而是避免上一表单字段的编辑上下文残留到新表单。

预期结果：属性面板与当前表单字段保持一致，不再滞留旧选中项。

### 实施步骤
1. 修改 `FormDesignerTab.vue` 的表单切换与字段加载逻辑，引入“最新请求才能回写”的保护；
2. 在切换表单时同步清理旧字段显示与选中状态；
3. 补充/更新前端测试，锁住竞态与切换行为；
4. 运行测试与前端构建验证。

### 关键文件
| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/FormDesignerTab.vue` | 修改 | 修复表单切换时的旧数据残留与异步请求竞态 |
| `frontend/tests/orderingStructure.test.js` | 修改 | 增加表单切换与字段加载收敛的源码结构断言 |
| `frontend/tests/quickEditBehavior.test.js` | 视需要修改 | 锁住切换表单时的 flush/reset 保护逻辑 |

### 测试建议
1. **结构断言**
   - 断言 `loadFormFields` 带有目标 formId 或请求序号收敛逻辑；
   - 断言表单切换时会先清理旧字段状态，再加载新表单字段。
2. **交互保护断言**
   - 断言 `selectForm()` 仍保留 `flushDesignNotesSave()` 失败回退逻辑；
   - 如复用字段属性 flush/reset helper，补对应源码断言。
3. **验证命令**
```bash
node --test frontend/tests/orderingStructure.test.js frontend/tests/quickEditBehavior.test.js frontend/tests/formFieldPresentation.test.js
cd frontend && npm run build
```

### 实施原则
- 最小必要修复；
- 优先收敛状态与竞态，不扩展样式或其他预览逻辑；
- 保持现有自动保存与预览计算链路不被重构。