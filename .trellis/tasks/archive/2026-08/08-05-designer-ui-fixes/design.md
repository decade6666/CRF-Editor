# Design — 设计器 4 项交互与样式修复

## 架构与边界

全部改动集中在 `frontend/src/components/FormDesignerTab.vue`（6185 行共享巨型组件）+ 3 个小文件 + 1 个新脚本。**必须串行修改，不可并行**。

| 层 | 文件 | 改动 |
|----|------|------|
| 前端 composable | `frontend/src/composables/formDesignerPropertyEditor.js` | 抽出 `normalizeDateFormat` |
| 前端组件 | `FormDesignerTab.vue` | R1 对称化、R3 备注框、R4 点击空白 |
| 前端样式 | `frontend/src/styles/main.css` | R2 选中态 token 与规则 |
| 前端组件 | `CodelistsTab.vue` / `UnitsTab.vue` | R2 勾选行类名 |
| 后端 | `backend/src/services/docx_import_service.py` | R1 大写格式改规范 |
| 后端 | `backend/src/database.py` | R1 启动自动迁移 |
| 新脚本 | `backend/scripts/normalize_date_formats.py` | R1 离线模板库迁移 |

## 数据流与契约

### R1 脏态基线机制（关键契约）

```
selectField(ff)
  → isHydratingFieldProp = true
  → Object.assign(editProp, {…fd/ff 值…})        // 补 ?? null
  → syncFieldTypeSpecificProps(editProp, …)      // 新增：同步归一，watcher 变幂等
  → lastHydratedFieldPropDraftKey = …
  → syncFieldPropBaselineFromEditor()            // 基线 = currentEditorPropState()
  → isHydratingFieldProp = false
（异步 flush:pre）watch(editProp.field_type) → syncFieldTypeSpecificProps → 幂等空操作
```

- `currentEditorPropState()` 的 `date_format` 分支与 `normalizeDateFormat` 同源 → 基线与当前值口径永远一致。
- `normalizeDateFormat(fieldType, value, dateFormatOptions, defaultDateFormats)`：非日期类 → `null`；日期类且值不在选项 → 默认值；在选项 → 原值。`syncFieldTypeSpecificProps` 改为调用它，行为不变。
- `selectField` 的 `integer_digits` / `decimal_digits` / `date_format` / `codelist_id` 补 `?? null`，消除 JSON.stringify 比较下 `undefined` ≠ `null` 的假脏态。
- **不改** `sameFieldPropState` 的比较方式（改为结构比较超出本次范围）。

### R1 迁移契约

- `_migrate_normalize_date_formats(engine)`：查 `field_definition` 中 `field_type IN ('日期','日期时间','时间')` 且 `date_format IS NOT NULL`；对每行按 `field_type` 用「小写 → 规范写法」映射查找，命中且与原值不同则 UPDATE，未命中（非法值）原样保留。幂等。
- 映射表与前端 `DATE_FORMAT_OPTIONS`（`FormDesignerTab.vue:2099-2104`）逐项小写对齐；`时间` 的 `'hh:mm:ss'`/`'hh:mm'`（无 AP）映射到 `HH:mm:ss`/`HH:mm`（24 小时制是选项里的规范形）。
- 导出安全（已验证）：`export_service.py:3413,3423` 读取前 `.lower()`，`日期` 类型不读该字段 → 逐字节无影响。
- 离线脚本：仿 `migrate_template_db.py`（argparse + 复制输入到输出 + 报告），支持 `--dry-run`。

## 关键取舍

### R2 选中态

- **新 token，不动 `--color-primary-subtle`**：该变量是表格表头契约（`tableHeaderStyle.test.js:25,32,36` 钉死），复用它是"选中行像表头"的根因。
- token 用 `color-mix` 引用主题变量 → 一处声明明暗自适应，不复制两套色值。取值：`--color-selected-bg: color-mix(in srgb, var(--color-primary) 14%, var(--color-bg-card))`；`--color-selected-border: color-mix(in srgb, var(--color-primary) 35%, var(--color-border))`。
- 暗色 EP 变量覆盖：`html[data-theme="dark"]` 下重声明 `--el-color-primary-light-9: var(--color-selected-bg)` 与 `--el-color-primary: var(--color-primary)`。特异度与 `html.dark` 打平，`main.js:6` 中 `main.css` 在 EP 暗色变量之后引入 → 层叠顺序取胜。其余 `light-3/5/7/8` 不动（改全套有视觉漂移风险）。
- 选中行规则用「当前行 + hover 组合选择器」，特异度 (0,5,2)/(0,4,2) 且后置，压过 `:537-545` 的 (0,4,2)。
- 勾选行 `.is-selected-row` 规则与 current-row 规则合并选择器组，同一 token。
- `.ff-item.ff-selected`：全局 `main.css:200`（保留 `border-width:2px`）与 scoped `FormDesignerTab.vue:5613-5616` 都改指新 token，值一致消除死声明。

### R3 备注框

- 60 字上限保留 JS 兜底（用户选择"保留上限"）；CSS 省略号负责视觉收尾。
- `margin-right: var(--notes-reserve, 96px)` 对两个复用点同时生效：站点 1 在「共 N 个字段」（`margin-left:auto`）之前撑出空隙，站点 2 直接是标题栏右侧留白。后续加顶栏元素只改这一个变量。
- 不引入 `@media print`、不动导出层（无镜像需求，已验证）。

### R4 点击空白

- 抽出 `returnToFormProperties()` 单点实现守卫链；`onCanvasBlankClick` 变薄封装（保留函数名/绑定/`.ff-item` 判断/无 `stopPropagation`——`formDesignerFormPropertyEditor.test.js:185-195` 有断言，其中 `resolveFieldPropLeave` 与 `selectedFieldId|resetFieldPropAutoSaveState` 两条断言改挂到 `returnToFormProperties`）。
- `onDesignerBlankClick` 排除选择器：三卡片 `.designer-preview-pane`/`.designer-editor-card`/`.designer-notes-card`；控件 `button,input,textarea,.el-select,.el-input,.el-input-number,.el-radio,.el-checkbox,.el-switch`；条目 `.ff-item,.fd-item`；分隔条 `.pane-v-resizer,.fd-panel-resizer`；**`.fd-canvas-list`**（旧 handler 已覆盖，防双弹）。
- 设计器弹窗 `#header` 与 `.designer-shell` 两个绑定点；字段属性未保存时点空白仍先弹保存确认（数据安全底线）。

## 兼容与回滚

- 前端改动纯展示/交互，回滚 = 还原文件。
- 迁移幂等可重跑；回滚 = 停服 → 备份库覆盖 → 起服（备份命令见 prd 计划内教程）。
- 不引入新依赖、不动构建脚本、不动 API 契约。

## 风险

- `FormDesignerTab.vue` 6185 行，编辑需精确定位；测试多为源码断言（`functionBody` 抽取），改动后必须全量跑 `node --test tests/*.test.js`。
- 迁移脚本触碰生产库 → 先备份；`--dry-run` 先看再跑。
