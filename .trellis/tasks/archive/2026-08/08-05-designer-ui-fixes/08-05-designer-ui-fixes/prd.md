# 设计器 4 项交互与样式修复

## Goal

修复表单设计器四类用户可见问题：切换字段误报「修改未保存」、列表选中态配色不清晰、Word 预览顶栏备注框过窄、点击空白不能回到表单属性编辑。

## Background / Confirmed Facts

### 问题 1：切换字段误报「修改未保存」

- 根因：`FormDesignerTab.vue:2106-2111` 的 `watch(() => editProp.field_type, ...)` 走 Vue 默认 `flush:'pre'`（异步）；`selectField()`（`:2343-2402`）同步赋值后立刻在 `:2400` 拍基线；监听器随后才触发，调 `syncFieldTypeSpecificProps()`（`composables/formDesignerPropertyEditor.js:9-14`）把不在选项列表里的 `date_format` 改写为默认值。
- `currentEditorPropState()`（`FormDesignerTab.vue:2148`）对 `date_format` 原样透传，与 `syncFieldTypeSpecificProps` 的归一逻辑不对称 —— 其他字段（`codelist_id`/`unit_id`/`checkbox_label`/`integer_digits`/`decimal_digits`）两边都归一为 `null`，唯独 `date_format` 是「填默认值」。
- 数据佐证（`database/crf_editor.db`）：日期字段 551 条存 `YYYY-MM-DD`（大写，不在下拉选项内）、57 条存 `yyyy-MM-dd`；`时间/HH:mm` 在合法选项内不受影响。复现需要「新选中字段类型与上一个不同」+「日期类字段」，因此表现为"有时候"。
- 源头：`backend/src/services/docx_import_service.py:472,479` 一直产出大写 `YYYY-MM-DD`。
- `sameFieldPropState`（`:763-765`）用 `JSON.stringify` 比较，`undefined` 键会消失，与显式 `null` 不等；`selectField`（`:2383-2387`）对 `integer_digits`/`decimal_digits`/`date_format`/`codelist_id` 裸拷贝，未补 `?? null`。
- 导出安全：`backend/src/services/export_service.py:3413,3423` 读取时先 `.lower()` 再判断是否含 `"ss"`；`日期` 类型不读该字段。统一大小写对 Word 导出零影响。

### 问题 2：列表选中态配色不清晰

- 亮色：选中行底色 `--color-primary-subtle`（#edf4f7）与卡片底 #fff 对比度约 1.11:1；该变量**同时是表格表头底色**（契约 `frontend/.claude/CLAUDE.md:73`，`tableHeaderStyle.test.js:25,32,36` 钉死）。
- 暗色：EP `theme-chalk/dark/css-vars.css` 在 `html.dark`（0,1,1）声明 `--el-color-primary-light-9`，压过 `main.css:100` 的 `:root`（0,1,0）→ 项目配色被绕开，退回 EP 原厂 rgb(24,34,43)，对比度约 1.07:1。
- `main.css:537-545` hover 规则特异度 (0,4,2) 高于 EP current-row 规则 (0,3,2) → 悬停抹掉选中色。
- `.ff-item.ff-selected` 在 `main.css:200`（全局）与 `FormDesignerTab.vue:5613-5616`（scoped）重复定义取值不同，scoped 胜出。
- 选项列表（`CodelistsTab.vue:355-364`）与单位列表（`UnitsTab.vue:145-150`）只有 `type="selection"` 勾选列，EP 不给勾选行任何底色。
- 已有可复刻配方：`.matrix-cell.checked`（`main.css:280-295`）的「底色 tint + inset 1px 描边环」；`color-mix(in srgb, var(--color-primary) N%, var(--color-bg-card))` 自动适配明暗。

### 问题 3：Word 预览顶栏备注框过窄

- `.fd-canvas-header-notes` 类在两处复用：表单页 Word 预览顶栏（`FormDesignerTab.vue:3271-3287`）与设计器「实时预览」卡片标题栏（`:4141-4155`）。
- 两道宽度限制：CSS `max-width:240px`（`:5932-5948`）；JS `HEADER_NOTES_MAX_LENGTH = 20`（`:1777-1784`）。只改 CSS 无效。
- 项目无任何 `@media print` 规则；`export_service.py` 不导出 `design_notes` → 改动纯预览层，无镜像。
- 测试钉点：`formFieldPresentation.test.js:454,456` 断言字面量 20；`data-test="canvas-notes-summary"` / `data-test="designer-canvas-notes-summary"` 钩子（`:457-458`、`orderingStructure.test.js:336`）须保留。

### 问题 4：点击空白回到表单属性

- `onCanvasBlankClick`（`FormDesignerTab.vue:647-663`）只绑在字段列表容器 `.fd-canvas-list.designer-field-list`（`:4056`）；设计器无任何全局 outside-click 基础设施。
- 面板切换状态即 `selectedFieldId`（`:2042`）：null → 表单属性，否则字段属性（`:4861-4862`、`:4907`）。
- 测试钉点：`formDesignerFormPropertyEditor.test.js:185-195` 断言 `onCanvasBlankClick` 函数名、`:4056` 的 `@click` 绑定、函数体含 `closest?.('.ff-item')` / `resolveFieldPropLeave` / `selectedFieldId|resetFieldPropAutoSaveState`、无 `stopPropagation`。

## Requirements

### R1. 修复切换字段误报「修改未保存」（三层）

- 前端对称化：`normalizeDateFormat()` 从 `syncFieldTypeSpecificProps` 抽出并导出；`currentEditorPropState()` 的 `date_format` 分支与之一致；`selectField()` 在拍基线前同步跑一次类型专属属性归一；`selectField` 补 `?? null`。
- 导入器：`docx_import_service.py:472,479` 输出 `yyyy-MM-dd`；`test_docx_import_rules.py:172` 同步。
- 迁移：`database.py` 启动自动迁移 `_migrate_normalize_date_formats`（幂等，大小写不敏感匹配，匹配不上的原样保留）；`backend/scripts/normalize_date_formats.py` 离线脚本（argparse + `--dry-run`，仿 `migrate_template_db.py`）。

### R2. 列表选中态配色

- 新增语义 token `--color-selected-bg` / `--color-selected-border`（color-mix 配方，明暗自适应），**不改 `--color-primary-subtle`**（表头契约）。
- `html[data-theme="dark"]` 下重新声明 `--el-color-primary-light-9` 与 `--el-color-primary`（特异度打平，靠 `main.js:6` 的引入顺序取胜）。
- 选中行规则覆盖 hover 态（当前行 + 勾选行两个场景），压过 `:537-545`。
- `.ff-item.ff-selected` 全局与 scoped 两条规则统一指向新 token。
- 选项列表（CodelistsTab）与单位列表（UnitsTab）勾选行补 `is-selected-row` 底色。

### R3. 备注框自适应

- `HEADER_NOTES_MAX_LENGTH` 20 → 60（保留上限兜底；换行折叠逻辑保留）。
- `.fd-canvas-header-notes`：`flex: 1 1 auto`、`max-width: none`、保留 `min-width:0` + 省略号三件套；新增 `margin-right: var(--notes-reserve, 96px)` 预留位（后续加元素只改这一个变量）。
- 两处复用点同时生效；`data-test` 钩子与 `.fd-canvas-form-title` 声明不动。

### R4. 点击空白回到表单属性

- 抽出共用内核 `returnToFormProperties()`（原守卫链：busy/reordering/draft 短路 → 上下文校验 → `resolveFieldPropLeave` → `confirmDiscardDraft` → `resetFieldPropAutoSaveState` → `syncFormPropEditor`）。
- 新增 `onDesignerBlankClick(event)` 绑 `.designer-shell` 与弹窗 `#header`；排除三张卡片、各类控件（button/input/textarea/.el-*）、字段条目、分隔条、`.fd-canvas-list`（防与旧 handler 双弹）。
- `onCanvasBlankClick` 保留函数名、`:4056` 绑定、`.ff-item` 判断、无 `stopPropagation`，改为薄封装。

## Acceptance Criteria

- [ ] AC1: 点「文本」字段后再点「日期」字段、不做编辑直接切走，不弹「字段属性修改尚未保存」；`date_format` 下拉显示合法选项；`formDesignerPropertyEditor.runtime.test.js` 有 `normalizeDateFormat` 回归用例。
- [ ] AC2: docx 导入的日期字段存 `yyyy-MM-dd`；启动迁移把存量大小写归一、非法值原样保留、重复执行结果不变（幂等用例）。
- [ ] AC3: 明暗两主题下字段/字典/选项/单位/表单/访视列表选中行一眼可辨；悬停在选中行上选中色不消失；`--color-primary-subtle` 表头契约测试仍绿。
- [ ] AC4: 选项与单位列表勾选行有可见底色。
- [ ] AC5: 备注框随卡片宽度伸展、右侧有预留位、超长出省略号、悬停 tooltip 全文；两处复用点一致；`HEADER_NOTES_MAX_LENGTH` 断言更新为 60。
- [ ] AC6: 设计器内点字段库空白/卡片间隙/弹窗顶部标题栏空白切回表单属性；点三张卡片与任意控件不切换；字段属性有未保存改动时先弹保存确认；`onDesignerBlankClick` 排除选择器有测试。
- [ ] AC7: 前端 `node --test tests/*.test.js` + `npm run lint` + `npm run build`、后端 `pytest` 全绿；不跑 `npm run format`。
- [ ] AC8: 浏览器手动验证 R1-R4 交互（含明暗主题切换）。

## Out of Scope

- `VisitsTab.vue:1415-1418` 右侧 `wp-notes` 侧栏（独立布局，与顶栏备注框无关）。
- `.ai-row`（`SimulatedCRFForm.vue:207`）与 `.page-highlight`（`DocxScreenshotPanel.vue:386`）的硬编码色。
- `TemplatePreviewDialog.vue` 的 `.selection-item` 选中态（无选中样式，非本次列表）。
- 项目无 Alembic，不引入迁移框架；迁移只做大小写规范化，不猜值、不置空。
