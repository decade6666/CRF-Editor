# 收拢已出过偏差的前端重复规则

## Goal

- 把三份各自维护、靠注释"保持一致"的 Word 预览纯函数合成一个共享模块，并顺手修好访视页预览多行默认值只显示第一行的缺陷。
- 把两份字典快捷编辑合成一份并统一刷新规则；把列宽 localStorage 键格式从 4 处收成 1 处。
- 补一个 aCRF 偏移常量的前后端一致性测试；把受影响的"源码文本匹配"测试改成"导入后直接调用"的行为测试。
- 前端改动完成后必须做 Haiku 只读评审和浏览器实测（预览与 Word 导出一致）。

## Evidence Re-verification (2026-10-09, main @ a4431b0)

逐条在当前 main 复核，全部成立；行号漂移与计数修正如下（正文保留 2026-10-08 历史值）：

| 项 | 历史（2026-10-08） | 当前（2026-10-09） | 备注 |
| --- | --- | --- | --- |
| FormDesignerTab 预览函数组 | `:1389` 起 | `getScopedDefaultValue:1381`、`renderCellHtml:1389`、`getInlineRows:1413`、`getInlineColumnCms:1447`、`getInlineFillChars:1457`、`computeMergeSpans:1461`、`computeLabelValueSpans:1468` | 一致 |
| VisitsTab 预览函数 | `renderCellHtml:427` 等 | `escapePreviewText:410`、`getScopedDefaultValue:418`、`renderCellHtml:427`、`getInlineRows:438`、`getInlineColumnCms:463`、`getInlineFillChars:473`、`readPersistedColRatios:477`、`computeMergeSpans:644`、`computeLabelValueSpans:651` | 一致；`escapePreviewText:130` 另有设计备注用途（保留在组件内） |
| TemplatePreviewDialog 预览函数 | `:203` 等 | `computeMergeSpans:203`、`computeLabelValueSpans:209`、`getInlineRows:215`、`getInlineColumnCms:236`、`getInlineFillChars:246`、`renderCellHtml:292` | 一致 |
| 多行默认值缺陷 | `useCRFRenderer.js:434` 等 | 全部行号一致（VT `renderCellHtml:431` 传 `singleLine=true`、`:433` 走 `escapePreviewText`；TP `:296` 多行） | 成立 |
| `useApi.js` cachedGet | `:142` | `:157`（`cachedGet(url, ttl = 30000)`） | 漂移 |
| 列宽键四处 | `useColumnResize.js:32/:16`、`VisitsTab.vue:482/:490`、`FormDesignerTab.vue:1706-1707`、`App.vue:303-320` | `buildKey:30-33`、容差 `1e-3:16`、VT `:482/:490`、FD `migrateLegacyKeyIfNeeded:1704-1719`、App `collectColumnWidthOverrides:308-342`（键前缀 `:315`） | 成立；VT 只读不写，写入方是设计器（`buildTableInstanceId` 产 `kind:fieldIds=` 实例 id）；VT 读取容差 `0.02`、边界 `>0 && <1`、无长度校验（长度由调用方 `:502/:512` 校验）vs 模块内 `>=0.02 && <=0.98` + `1e-3` + 长度校验 |
| aCRF 常量 | `export_service.py:176-177`、`acrfAnnotationGeometry.js:13-15` | 后端 `:169-178`（offset `:177`）、前端 `:8-15`；前端测试 `acrfAnnotationGeometry.test.js:30-50`；后端 `test_export_acrf.py:23-24` 仅引用后端常量；可模仿模式 `test_date_format_migration.py:110-125` `_read_frontend_date_format_options` | 成立，无跨端一致性测试 |
| 文本测试规模 | 37/69 用 readFileSync 断言 src/，26 读 FormDesignerTab.vue | 69 个 `tests/*.test.js` 中 **51** 个用 readFileSync 读 src/ 路径，**26** 个读 FormDesignerTab.vue（37 为历史口径） | 受影响模块的文本测试点名见 design.md §7 |
| 字典快捷编辑重复 | FieldsTab `:203-230`/`:295`/`:337`；FD `:2886-2967`/`:2970-3085`；单位 `:3090` | 完全一致（FD 单位快捷新增块 `:3087-3095`，不在本任务范围）；差异明细：FD 把 `normalizeQuickOptions` 内联、新增路径无成功 toast 且只刷 `loadCodelists`、快编路径失效 `codelists` + `forms/{id}/fields` 但**不失效 `field-definitions`**；FieldsTab 统一走 `reloadAfterCodelistChange`（失效 `codelists` + `field-definitions`） | 成立；设计器快捷新增同样不失效 `field-definitions` |
| frontend-mount-tests | 未合入（建议先行） | **已合入**：`package.json` 有 `test` / `test:component`，`tests/component/` 有 3 spec + setup.js | 新共享弹窗可直接获得挂载测试 |
| 等价清点新增证据 | — | 三组件的 `previewModelHelpers` 形状完全一致（FD `:1478`、VT `:715`、TP `:182`），`formDesignerPreviewModel.js` 的 helpers 注入接口就是共享模块的现成接缝；`TemplateFieldPreview` 为扁平形状（`field_definition` 仅日志行为 null，日志行任何路径都不进默认值分支） | 见 design.md §3 |

## Background（2026-10-08 初核；权威锚点集 = 上方 Evidence Re-verification 表，本节只留事实不再重复行号）

> 表头注：`f68ebe1`（当前 main）仅新增挂载测试相关文件，本表组件 / composable 锚点在其上仍然有效；历史行号只在表内保留（仅在增加信息量时）。

- 三份 Word 预览纯函数（`renderCellHtml` / `getInlineRows` / `getInlineColumnCms` / `computeMergeSpans` / `computeLabelValueSpans` 及配套 `getScopedDefaultValue` / `getInlineFillChars`）在设计器、访视页、模板预览三个组件里各持一份，靠注释「保持一致」。
- 访视页普通布局单元格多行默认值只显示第一行（`normalizeDefaultValue` 的 `singleLine` 分支 + 组件本地 `escapePreviewText`），而设计器、模板预览、Word 导出均显示全部行——本任务唯一的已声明缺陷修复（R2）。
- 字典快捷增/改在 `FieldsTab` 与 `FormDesignerTab` 各实现一份；设计器快增/快编后不失效 `field-definitions` 缓存，`cachedGet` 默认 30 秒 TTL 内左侧字段库显示旧字典名（FieldsTab 侧本就双缓存失效）。
- 列宽 localStorage 键的拼装/解析/校验分散四处且阈值不一致（模块 `1e-3` vs 访视 `0.02`）；`buildTableInstanceId` 产出的 `kind:fieldIds=…` 是新实例 id 拼法，legacy 拼法是 `<groupIndex-kind-colCount>`；App 导出收集器是只读的（对列宽键零删除）。
- aCRF 默认纵向偏移常量两端同值（`-26940`，历史上改过一次）但没有任何跨端一致性测试；可模仿 `test_date_format_migration.py` 读前端源码的现成模式。
- 源码文本匹配测试规模大（现值 51/69 个文件用 `readFileSync` 断言 `src/`，26 个读 `FormDesignerTab.vue`；历史口径 37），会把「挪动代码」误判为故障；本任务只转换受影响模块。
- 复用约束（根 `.claude/CLAUDE.md` 已有规定）：字段渲染统一走 `useCRFRenderer.js`，字段展示属性与预览显示逻辑统一走 `formFieldPresentation.js`——新共享模块必须复用它们，不得再抄一份。

## Requirements

- R1：在 `frontend/src/composables/` 新建一个共享纯函数模块（命名在 design 阶段定），收纳 `getInlineRows`、`computeMergeSpans`、`computeLabelValueSpans`、`getInlineColumnCms`、`renderCellHtml` 及配套填充线辅助函数；三个组件全部改为从该模块导入；模块内部按约束复用 `useCRFRenderer.js` / `formFieldPresentation.js`，不复制其逻辑。
  - 等价清点（合并前必须做）：三份拷贝并不完全相同——`TemplatePreviewDialog.vue` 的 `getInlineRows`（`:215`）把 `isDefaultValueSupported(type, true)` 写死、默认值列回退用 `renderCtrlHtml`；`FormDesignerTab.vue`（`getScopedDefaultValue` `:1381`）与 `VisitsTab.vue`（`:418`）走 `getScopedDefaultValue`、回退用 `renderCtrlTextHtml`；`getInlineColumnCms` 各自读组件内状态（渲染分组 / 纸张方向）。逐条归类：参数化（保持行为不变）或统一（属于行为变更，必须声明、加测试并浏览器实测）。
  - 等价性验证复用 `frontend/tests/formDesignerPreviewModel.test.js` 的「黄金参考」模式（逐字保留原函数副本），为每个组件的现有行为做对照；获用户批准的 R8 横向选项间距偏差单独以 renderer 行为测试 + strict parity 锁定，不作为无声明的等价变化。
- R2：修复访视页普通布局单元格的多行默认值显示，使其与设计器、模板预览、Word 导出一致（全部行可见）；加行为测试锁定。
- R3：字典快捷新增/快捷编辑合并为一个 composable（或一个可复用弹窗组件），`FieldsTab.vue` 与 `FormDesignerTab.vue` 共用；统一编辑成功后的刷新规则，至少做到设计器快捷编辑后失效 `field-definitions` 相关缓存（`useApi.js` 的 `invalidateCache`）。
- R4：列宽 localStorage 键的拼装、读写、校验阈值全部收进 `useColumnResize.js`；`FormDesignerTab.vue`、`VisitsTab.vue`、`App.vue` 的迁移/解析逻辑改为调用该模块（保留 legacy 键兼容读取，不丢用户已有数据）。
- R5：新增后端一致性测试：解析 `acrfAnnotationGeometry.js`，断言其常量与 `export_service.py` 的 `ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU` 相等（模仿 `test_date_format_migration.py` 的读文件模式）。落在新独立文件 `backend/tests/test_acrf_offset_consistency.py`，不进 `test_export_acrf.py`——并行任务 BF 会重排版、ELC 会重写该文件，新文件零文本重叠；按目标 ruff 风格书写（双引号、≤120 列）。
- R6：对每个抽出的纯模块，把对应的"源码文本匹配"测试改成导入后直接调用的行为测试；本任务不要求全仓库存量文本测试改造（当前 51 个测试文件用 `readFileSync` 断言 `src/`，历史口径 37），只处理受影响模块。
- R7：前端改动完成后走 Haiku 只读评审（报告问题，不改代码），并在浏览器实测设计器预览、访视页预览与 Word 导出一致。
- R8（2026-10-09 用户批准）：修复横向选项控件的预览 / Word 文本契约偏差——前端 HTML 渲染器横向选项目前以一个 ASCII 空格分隔，后端 Word 导出 `_render_single_choice` 已用两个 ASCII 空格；按 `.trellis/spec/guides/cross-stack-contracts.md` §5 对齐为两个可断 ASCII 空格。普通控件 HTML 与内联纯文本回退都必须用 `white-space: pre-wrap` 保留两个空格、允许换行，且 `word-spacing: normal` 不叠加间距；纵向选项保持无 HTML 分隔符、正常空白处理与 3pt 选项间距。

## Acceptance Criteria

- [ ] AC1（对应 R1）：三处重复函数删除，单一共享模块被三个组件导入；`grep` 确认仓库内不再有第二份实现；各组件行为与合并前等价（或差异已按 R1 归类声明并用黄金参考测试锁定）。
- [ ] AC2（对应 R2）：多行默认值在访视页预览显示全部行，与模板预览/导出一致；有行为测试。
- [ ] AC3（对应 R3）：字典快捷编辑只剩一份实现；设计器快捷编辑后字段库立即拿到新数据（缓存失效有测试或可复现验证）。
- [ ] AC4（对应 R4）：键拼装与校验阈值只有 `useColumnResize.js` 一份；旧键数据仍可读取（兼容测试）。
- [ ] AC5（对应 R5）：新增的前后端常量一致性测试通过；人为改动一端数值时测试失败（先写失败测试再验证）。
- [ ] AC6（对应 R6）：受影响模块的文本断言测试已转换为行为测试且通过。
- [ ] AC7（对应 R7）：Haiku 评审完成，发现的问题已处理或明确记录；浏览器实测预览与 `backend/scripts/compare_word_table_parity.py` 导出对比一致。
- [ ] AC8（回归门禁）：前端 `cd frontend && node --test tests/*.test.js` 与 `npm run test:component` 均无新增失败；后端全量测试（父任务执行手册 §3 的命令，在任务 worktree 内运行）无新增失败（因新增一致性测试）。
- [ ] AC9（文档同步）：若共享模块改变了根/前端 `.claude/CLAUDE.md` 中 composables 的描述，同步更新。
- [ ] AC10（对应 R8，用户批准的范围扩展）：横向选项的结构化 HTML 与内联纯文本回退均输出恰好两个可断 ASCII 空格；相应 `.choice-group` / `.choice-text` 使用 `white-space: pre-wrap` 保留空格、`word-spacing: normal` 不额外加宽；纵向路径仍无分隔符、`white-space: normal` 且选项间距 3pt。renderer 行为测试通过，严格预览/Word 对照 `exact_cell_ratio = exact_row_ratio = 1.0`、`mismatches = []`。

## Out of Scope

- 不拆 `FormDesignerTab.vue` 的模板与状态（那是 `designer-split`）；本任务只抽纯逻辑与修缺陷。
- 不改列宽规划算法与任何共享常量（`WEIGHT_CHINESE` 等）；不改 aCRF 注记几何行为，只补一致性测试。
- 不做状态管理重写，不引入新依赖。
- 全局非目标：不做重写 / 换技术栈 / 微服务 / TypeScript 迁移；不引入 Alembic 或版本表迁移；不合并不同的数据库会话类型、排序规则或撤销保护；不做通用 CRUD 列表组件；不做大范围"防御性代码"清理；不重写 Word 导入解析器；不引入 Redis/Celery。

## Dependencies and Order（2026-10-09 并行波改版）

- Wave C/D 并行：SRC 从开工时点的 main 拉分支（规划时为 `f68ebe1`，含挂载测试 Vue 警告门禁）；`legacy-cleanup`（LC）同时在 `refactor/legacy-cleanup` 上实现。并行约束与真实重叠（LC 将删除的 perf 代码块、`main.css` 禁改、frontend 模块文档冲突归合并解决）见 design.md §1。
- `backend-format`（BF，ruff 重排版）与 `export-layer-cleanup`（ELC，重写 `test_export_acrf.py`）可能在 SRC 存续期间合入；R5 一致性测试放在新独立文件 `backend/tests/test_acrf_offset_consistency.py`，与之零文本重叠，天然规避冲突。
- 合并规则：后合并的一方把 main 合入自己分支解决冲突（预期 `App.vue` / `FormDesignerTab.vue` import 块冲突），并重跑全部检查门；合并由主协调者在用户授权后执行。
- 阻塞：`designer-split`、`visits-preview-split`（它们依赖本任务抽好的共享模块）。
- 一个任务 = 一个 worktree + 一个分支，检查通过后本地合入 `main`。

## Before Starting

这是范围文档。开工前必须基于当时最新的 main 补写 design.md 和 implement.md（Trellis 对复杂任务的要求），并重新核实上面的行号。执行流程见父任务 `implement.md`（公共执行手册）。
