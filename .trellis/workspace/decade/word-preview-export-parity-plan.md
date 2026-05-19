# Word 预览与导出换行一致性修复计划

## 背景

当前问题：表单界面的 Word 预览与导出的 DOCX 显示仍不一致。导出文档的横向比例已经正确，并且内容会按导出列宽换行；但浏览器中的 Word 预览仍出现不换行或换行位置不同的问题，尤其影响横向 inline / mixed 表格和手动调整列宽后的预览。

本计划来自双模型调试结果：

- codex 后端诊断：后端 DOCX 宽度计算与固定表格写入路径基本正确，当前更像契约基准。
- gemini 前端诊断：主要问题在前端预览的表格布局与换行策略没有完整模拟 DOCX fixed-width 语义。

## 诊断结论

### 最可能根因

1. 前端 Word 预览仍有 `table-layout: auto` 路径，浏览器会按内容撑开列，而不是按导出文档的固定列宽断行。
2. `VisitsTab.vue` 的表单预览仍是简化旧渲染路径，没有应用设计器保存的列宽比例，也没有统一的 `colgroup` 固定列宽契约。
3. choice 选项渲染使用 `&nbsp;&nbsp;` 和 `white-space: nowrap`，会让浏览器把选项片段当成不可断行内容，导致即使单元格宽度固定也可能看起来“不换行”。

### 关键证据

| 证据 | 文件 |
|---|---|
| 后端 inline 导出关闭 autofit，并写入固定列宽 | `backend/src/services/export_service.py:2204` |
| 后端将手动列宽 override 转为 `available_cm` 比例宽度 | `backend/src/services/export_service.py:2218-2224` |
| 后端将列宽写入 column 与 cell | `backend/src/services/export_service.py:2226-2235` |
| 横向导出可用宽度为 `23.36cm` | `backend/src/services/export_service.py:200` |
| 前端 `.inline-table` / `.unified-table` 仍有 `table-layout: auto` | `frontend/src/styles/main.css:207`, `frontend/src/styles/main.css:211` |
| 设计器只在 `.col-resize-host` 下强制 fixed layout | `frontend/src/components/FormDesignerTab.vue:3219-3224` |
| VisitsTab 预览 inline 表格缺少 `colgroup` / 手动列宽读取 | `frontend/src/components/VisitsTab.vue:517-526` |
| choice 渲染使用不可断行空格和 nowrap | `frontend/src/composables/useCRFRenderer.js:391`, `frontend/src/composables/useCRFRenderer.js:396-402` |
| choice CSS 也强制 nowrap | `frontend/src/styles/main.css:220` |

## 修复范围

优先修复前端预览一致性，不优先改后端导出。

涉及文件预计包括：

- `frontend/src/styles/main.css`
- `frontend/src/composables/useCRFRenderer.js`
- `frontend/src/components/VisitsTab.vue`
- `frontend/src/components/FormDesignerTab.vue`（如需抽取或复用现有列宽读取/渲染逻辑）
- `frontend/tests/wordPageGeometry.test.js`
- 必要时补充/调整相关前端契约测试

## 实施计划

### 1. 先补前端回归测试

目标：先用源码级测试锁住本轮一致性要求。

计划：

- 扩展 `frontend/tests/wordPageGeometry.test.js`。
- 断言 Word 预览中的 inline / unified 表格不应继续被全局 `table-layout: auto` 破坏。
- 断言 `VisitsTab.vue` 预览需要具备固定列宽契约，例如 `colgroup` 或等价的列宽应用逻辑。
- 断言横向 choice 选项不再使用不可断行的 `&nbsp;&nbsp;` 作为选项间隔。

验收：

- 修改前测试应能暴露当前不一致风险。
- 修改后测试通过。

### 2. 统一 Word 预览表格固定布局契约

目标：浏览器预览按 DOCX 导出的 fixed-width 语义布局，避免内容撑列。

计划：

- 调整 `frontend/src/styles/main.css` 中 `.word-page .inline-table` / `.word-page .unified-table` 的 `table-layout: auto` 规则。
- 优先让 Word 预览中的 inline / unified 表格默认走 `table-layout: fixed`。
- 保留设计器拖拽时现有 `.col-resize-host` 的 fixed 约束，但避免只有设计器路径生效。

验收：

- DevTools 中受影响预览表格 computed `table-layout` 为 `fixed`。
- 表格宽度不再因长内容超出页面内容宽度。

### 3. 让 VisitsTab 预览读取并应用同一套列宽比例

目标：访视预览与设计器预览、导出 DOCX 使用同一套列宽比例。

计划：

- 在 `VisitsTab.vue` 中补 read-only 的列宽读取逻辑。
- 读取设计器写入的 localStorage 键：`crf:designer:col-widths:<form_id>:<table_kind>`。
- 为 inline 表格渲染 `colgroup`，按保存的 ratio 设置 `<col style="width: ...%">`。
- 对没有手动列宽的表格，继续使用现有默认比例或内容规划结果。
- VisitsTab 只读，不写 localStorage。

验收：

- 同一个表单在设计器手动调列宽后，VisitsTab Word 预览使用相同列宽比例。
- 导出请求体中的 `column_width_overrides` 与预览读取的 table instance / ratio 语义一致。

### 4. 修复 choice option 的可断行策略

目标：允许横向选项在列宽受限时按 Word 类似行为换行。

计划：

- 将横向选项之间的 `&nbsp;&nbsp;` 改为可断行间隔，例如普通空格或 CSS margin。
- 避免把整个 option 序列或整段选项内容设为不可断行。
- 保留必要的局部原子性，例如选择符号与其文本不要过度拆散。
- 不修改 `.fill-line` 的核心类名和样式逻辑。

验收：

- choice 字段在窄列中可以在选项之间换行。
- 下划线显示不回退到断续字符效果。

### 5. 必要时沉淀共享渲染/列宽读取逻辑

目标：避免 `FormDesignerTab.vue` 与 `VisitsTab.vue` 继续各自维护不一致的预览路径。

计划：

- 如果只需少量逻辑，先在 `VisitsTab.vue` 最小补齐。
- 如果重复逻辑明显增加，再抽到 composable，例如复用 table instance id、列宽读取和 ratio 校验逻辑。
- 不做大范围重构，不改变后端导出契约。

验收：

- 不引入超过本问题所需的抽象。
- 两个预览面列宽行为一致。

## 验证计划

### 前端测试

```bash
cd frontend && node --test tests/wordPageGeometry.test.js
cd frontend && node --test tests/columnWidthPlanning.test.js tests/visitPreviewLandscape.test.js
```

### 后端回归

```bash
cd backend && python -m pytest tests/test_export_column_width_override.py tests/test_export_paper_orientation.py -q
```

### 手工浏览器验证

1. 启动前后端开发服务。
2. 打开一个横向表单，包含 inline / choice 字段。
3. 在设计器中手动调整列宽。
4. 验证设计器实时预览会按窄列换行。
5. 验证访视 Word 预览使用同一列宽并按相近位置换行。
6. 导出 DOCX，对比预览与导出文档的列宽比例、换行位置和横向页面比例。

## 风险与边界

- 浏览器排版与 Word 排版引擎不可能做到逐像素完全一致，本轮目标是列宽比例、页面内容宽度和可断行策略一致。
- choice option 的 `nowrap` 放宽可能改变部分选项的视觉排列，需要重点验证含下划线、单位和长中文选项的字段。
- `unified` / `mixed` 命名存在历史漂移，本轮先修用户可见的一致性问题，不优先恢复或重构后端 unified 分支。
- 不主动修改后端导出逻辑，除非前端修复过程中发现导出请求体或 table instance id 契约仍不一致。
