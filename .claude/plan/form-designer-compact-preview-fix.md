## 📋 实施计划：表单设计器紧凑排布与预览显示修正

### 任务类型
- [x] 前端
- [ ] 后端
- [ ] 全栈

### 结构化需求增强

#### 目标
在不重写现有预览渲染链路的前提下，解决两个明确问题：
1. 表单设计器当前虽然已是全屏弹窗，但三栏布局、字段列表和编辑区占位偏松，整体不够紧凑；
2. 表单预览显示语义不一致，设计器预览、模板导入预览和全局样式之间存在灰底/表头/备注显示漂移，导致“预览效果存在问题”。

#### 范围
本次仅处理前端以下范围：
- `frontend/src/components/FormDesignerTab.vue`
- `frontend/src/components/TemplatePreviewDialog.vue`
- `frontend/src/styles/main.css`
- 与上述变更直接相关的现有前端测试

#### 非目标
- 不改后端接口
- 不重构 `designerPreviewFields` / `designerRenderGroups` / `word-page + scale` 预览模型
- 不新增复杂交互或拆分大组件
- 不扩展到其他无关预览页面

#### 验收标准
- 设计器三栏布局首屏更紧凑，可见字段数提升；
- 字段列表行高、间距、控件宽度更收敛，但不影响操作；
- 设计器预览备注显示与主预览逻辑一致；
- `FormDesignerTab` 与 `TemplatePreviewDialog` 的灰底、表头、日志行视觉规则一致；
- 相关前端测试通过，构建通过。

### 当前代码证据
- 设计器主弹窗在 `frontend/src/components/FormDesignerTab.vue:1190-1339`，已 fullscreen，但右侧预览固定 `520px`，见 `FormDesignerTab.vue:1573-1582`。
- 三栏 grid 目前为 `auto 4px minmax(360px, 460px) 4px auto`，见 `FormDesignerTab.vue:1460-1466`，中区偏宽、右区偏硬。
- 字段列表项密度来自 `FormDesignerTab.vue:1200-1205` 与样式 `1433-1437`，`gap/padding` 仍偏大。
- 设计器预览已经有即时模型与缩放逻辑：`FormDesignerTab.vue:392-470`、`502-538`、`547-570`，说明现有渲染模型可复用。
- 设计器预览备注被硬编码关闭：`FormDesignerTab.vue:501` 的 `designerHasPreviewNotes = computed(() => false)`。
- 全局预览样式 `frontend/src/styles/main.css:190-202` 使用 `#fafafa / #f5f5f5 / #d9d9d9`，而设计器/模板预览局部又使用 `background:#BFBFBF40;`，视觉规则不一致。
- 模板导入预览在 `frontend/src/components/TemplatePreviewDialog.vue:356-409` 维护了局部预览样式，需要一并收口。

### 实施方案

#### 1. 收紧设计器三栏布局
- 调整 `FormDesignerTab.vue:1460-1485` 的 grid 宽度策略：
  - 左栏字段库控制在 `220-240px`；
  - 中区保持自适应；
  - 右侧预览从固定 `520px` 收到 `440-480px` 或等效比例区间；
- 收紧 `designer-workspace-top/bottom` 与卡片标题区域的 padding。

预期结果：三栏占比更合理，编辑信息密度提升，右侧预览仍保留完整可读性。

#### 2. 收紧字段列表与编辑面板密度
- 调整 `FormDesignerTab.vue:1200-1205` 对应的字段行：
  - 行高控制在约 `32-36px`；
  - `gap` 从 8 收到 4-6；
  - 序号输入框宽度缩到约 `52-56px`；
  - 保留 checkbox、拖拽、横向标记、删除按钮，但减少空白；
- 收紧 `FormDesignerTab.vue:1433-1437` 相关样式中的 padding、margin-bottom、字体尺寸。

预期结果：相同窗口下可见字段更多，操作区不再显得松散。

#### 3. 修正设计器预览备注联动
- 将 `FormDesignerTab.vue:501` 的 `designerHasPreviewNotes` 从固定 `false` 改为基于 `previewDesignNotesText` 或 `previewDesignNotesHtml` 的布尔计算；
- 让设计器实时预览与主预览一样在存在备注时展示 `wp-notes` 相关布局；
- 保持现有 `formDesignNotes` 自动保存逻辑不变。

预期结果：设计器里看到的预览与外层主预览备注行为一致，不再出现“备注编辑了但设计器预览没有反映”的问题。

#### 4. 统一预览灰底与结构色语义
- 收口 `frontend/src/styles/main.css:190-202`：
  - 普通标签单元格、统一表格标签单元格、横向表头、日志行/整行表头使用统一视觉规则；
  - 避免 `#fafafa / #f5f5f5 / #d9d9d9 / #BFBFBF40` 混用；
- 同步清理 `FormDesignerTab.vue` 与 `TemplatePreviewDialog.vue` 中硬编码的结构性背景色，统一到同一规则；
- 保留 `getFormFieldPreviewStyle()` 的字段自定义底纹/文字色覆盖语义，不改 helper 契约。

预期结果：设计器预览、模板导入预览、全局 Word 预览的灰底、表头、日志行表现一致。

#### 5. 对齐模板导入预览样式
- 调整 `TemplatePreviewDialog.vue:356-409` 的局部 `.wp-label`、`.wp-inline-header`、`.unified-label` 等样式；
- 确保其视觉规则与 `FormDesignerTab` 保持一致，而不是保留一套漂移的 scoped 样式；
- 不修改导入预览的数据加载与勾选逻辑。

预期结果：模板导入预览和设计器预览在同类字段上的显示保持一致。

### 实施步骤
1. 先调整 `main.css`，统一预览结构色语义；
2. 再修改 `FormDesignerTab.vue` 的三栏宽度、字段列表密度和预览备注联动；
3. 然后同步 `TemplatePreviewDialog.vue` 的局部样式；
4. 最后更新相关测试并执行验证。

### 关键文件
| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/FormDesignerTab.vue` | 修改 | 收紧三栏布局、字段列表密度、预览备注联动 |
| `frontend/src/components/TemplatePreviewDialog.vue` | 修改 | 对齐模板导入预览的表头/灰底/标签样式 |
| `frontend/src/styles/main.css` | 修改 | 统一 Word/设计器预览结构色语义 |
| `frontend/tests/formFieldPresentation.test.js` | 修改 | 覆盖预览显示语义与备注联动 |
| `frontend/tests/quickEditBehavior.test.js` | 视需要修改 | 确认收紧后仍保留快编交互 |
| `frontend/tests/orderingStructure.test.js` | 视需要修改 | 确认字段列表结构契约未破坏 |

### 验证方案
1. 运行：
```bash
node --test frontend/tests/formFieldPresentation.test.js frontend/tests/quickEditBehavior.test.js frontend/tests/orderingStructure.test.js
```
2. 构建验证：
```bash
cd frontend && npm run build
```
3. 手工回归：
- 设计器打开后首屏字段列表是否更紧凑；
- 编辑备注时设计器实时预览是否同步出现备注区；
- 普通字段、横向表头、日志行在设计器与模板导入预览中是否呈现一致；
- 双击快编、拖拽排序、横向标记按钮是否正常。

### 实施原则
- 最小必要改动；
- 样式与绑定修正优先，不重构渲染链路；
- 保持现有测试契约与即时预览能力。