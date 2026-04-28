# Tasks: 预览/设计器表格列宽内容驱动自动适配

## 1. 前置准备

- [x] 1.1 安装前端 PBT 依赖：在 `frontend/` 下运行 `npm i -D fast-check` 并提交 `package.json` / `package-lock.json`
- [x] 1.2 创建共享参数 fixture 目录 `backend/tests/fixtures/`（若不存在），规划 `planner_cases.json` 结构
- [x] 1.3 在 `frontend/tests/` 下为新增测试预留文件：`columnWidthPlanning.test.js`、`columnWidthPlanning.pbt.test.js`

## 2. 前端纯 planner 扩展（useCRFRenderer.js）

- [x] 2.1 修正 `computeCharWeight(char)` 使用 `char.codePointAt(0)` 替代 `char.charCodeAt(0)`；确认 CJK 范围检查覆盖扩展 B–J + 兼容补充
- [x] 2.2 新增 `buildNormalColumnDemands(fields)`：按"剔除标签/日志行 → 对每个 ff 调用 `buildInlineColumnDemands([ff])[0]` → 分别聚合 label/control 两列 max → 加 `max(weight, WEIGHT_ASCII * 4)` 保护"实现
- [x] 2.3 新增 `planNormalColumnFractions(fields)` 返回 `[labelFraction, controlFraction]`（复用 `planWidth([labelWeight, controlWeight], labelWeight + controlWeight)`）
- [x] 2.4 新增 `planUnifiedColumnFractions(segments, columnCount)`：仅 `inline_block` 参与；per-slot-max 聚合；加 `max(weight, WEIGHT_ASCII * 4)` 保护
- [x] 2.5 对 `planInlineColumnFractions(fields)` 行为保持不变（但确认通过新 PBT）
- [x] 2.6 在 JSDoc 中标注"与后端 width_planning.py 共享语义契约，修改需前后端对等"

## 3. 前端 useColumnResize.js 扩展

- [x] 3.1 重命名内部 `initialRatios` 参数为 `defaultsSource`；新增 `resolveDefaults()` 支持 `number[] | () => number[] | Ref | ComputedRef`
- [x] 3.2 替换 `const n = initialRatios.length` 与 `const defaults = [...initialRatios]` 的冻结快照为每次调用 `resolveDefaults()`
- [x] 3.3 `colRatios` 初始化改为：`readRatios(key, defaults.length) ?? defaults`
- [x] 3.4 `rehydrate()` 调用 `resolveDefaults()` 获取最新默认值
- [x] 3.5 `resetToEven()` 函数名保留；行为改为 `localStorage.removeItem(key)` + `colRatios.value = resolveDefaults()`
- [x] 3.6 保持 `onResizeStart` / `onMove` / `onUp` / SNAP_ANCHORS / SNAP_PX / MIN_RATIO / MAX_RATIO 所有交互参数不变
- [x] 3.7 向后兼容：调用方传数组仍可工作，typeof 判断选择分支
- [x] 3.8 更新 composable JSDoc 说明新签名语义

## 4. FormDesignerTab.vue getResizer 改造

- [x] 4.1 在组件 `setup` 内新增 `const formIdRef = computed(() => selectedForm.value?.id)`
- [x] 4.2 修改 `getResizer(kind, colCount, groupIndex)`：将 `formId`、`mapKey` 改为 `ref` / `computed` 传入 `useColumnResize`
- [x] 4.3 为每个 kind 构造默认值 factory 闭包：
  - `kind === 'normal'` → `() => planNormalColumnFractions(group.fields)`
  - `kind === 'inline'` → `() => planInlineColumnFractions(group.fields)`
  - `kind === 'unified'` → `() => planUnifiedColumnFractions(buildFormDesignerUnifiedSegments(group.fields), group.colCount)`
- [x] 4.4 在 `unified-table` 模板外包一层 `.col-resize-host`，加 `<colgroup>` 与 `<col :style>`
- [x] 4.5 在 unified-table 容器内渲染 `N - 1` 个 `.resizer-handle` 元素，绑定 `onResizeStart`
- [x] 4.6 unified-table 渲染 `snap-guide` 元素，绑定 `snapGuideX`
- [x] 4.7 保留 `resizerCache` 的 `${groupIndex}-${kind}-${colCount}` 键格式（共享缓存策略不变）
- [x] 4.8 验证设计器全屏对话框（`designer-dialog`）内的 `designerRenderGroups` 渲染路径一致应用内容驱动默认值
- [x] 4.9 移除/清理 `getResizer` 中不再使用的硬编码 `[0.3, 0.7]` 与 `1/colCount` 默认数组（除作为 fallback 之外）

## 5. TemplatePreviewDialog.vue 接入

- [x] 5.1 import `planNormalColumnFractions` / `planUnifiedColumnFractions`（`planInlineColumnFractions` 已有）
- [x] 5.2 为每张预览表添加 `<colgroup>` + `<col :style="{ width: fraction * 100 + '%' }">`
- [x] 5.3 新增 helper `readSharedRatios(formId, tableKind, expectedLength)`：只读 `localStorage.getItem('crf:designer:col-widths:<form_id>:<table_kind>')` 并校验；失败返回 null
- [x] 5.4 当 `formId` 存在且 `readSharedRatios` 返回合法值时使用之，否则使用 planner 结果
- [x] 5.5 确认无任何 `localStorage.setItem` 调用从此组件触发
- [x] 5.6 确认无 `.resizer-handle` / `.snap-guide` / `col-resize` 相关 DOM / CSS 存在

## 6. SimulatedCRFForm.vue 迁移

- [x] 6.1 移除 `.crf-label-cell { width: 30%; ... }` 与 `.crf-control-cell { ... }` 中的 `width` 硬编码（保留 padding、border 等装饰样式）
- [x] 6.2 template 改用 `<table>` + `<colgroup>` + `<col :style="{ width: fraction * 100 + '%' }">`
- [x] 6.3 import `planNormalColumnFractions`；在 `computed` 中基于 `displayFields` 计算 normal 两列比例
- [x] 6.4 当组件接收 formId（通过 prop 或 provide/inject）且 localStorage 有合法值时优先使用；否则用 planner 结果
- [x] 6.5 确认组件 `<table class="crf-table">` 不再包含 `table-layout: auto` 与内部单元格 `width: 30%` 的双重绑定冲突
- [x] 6.6 验证 AI 对比视图（viewMode='ai'）下列宽同样生效
- [x] 6.7 验证日志行（colspan=2）与标签型（colspan=2）在新 `<colgroup>` 下视觉不变

## 7. 后端 width_planning.py 扩展

- [x] 7.1 新增 `build_normal_table_demands(fields)` 函数，按 spec `backend-normal-table-content-driven` 实现：
  - 剔除结构字段（field_type ∈ {"标签", "日志行"} 或 `is_log_row`）
  - labelWeight = `max(compute_text_weight(label) for ff)` → `max(labelWeight, WEIGHT_ASCII * 4)`
  - controlWeight = `max(build_inline_column_demands([ff])[0].intrinsic_weight for ff)` → 同保护
- [x] 7.2 新增 `plan_normal_table_width(fields, available_cm=14.66)` 函数：
  - 构造两列 demands → `plan_width(demands, available_weight=available_cm*2)` → 乘以 `available_cm`
  - 返回 `[labelWidth_cm, controlWidth_cm]`
- [x] 7.3 在 docstring 中标注 available_cm 默认值的来源（与 inline/unified 一致 = 14.66 或 23.36，按 export_service 既有值）
- [x] 7.4 确认权重常量、`max(weight, 4)` 最小保护、等比缩放回退三项语义与 inline/unified 一致

## 8. 后端 export_service.py 切换

- [x] 8.1 定位原 normal 表导出的 7.2cm / 7.4cm 硬编码（约 `export_service.py:1701-1715`）
- [x] 8.2 替换为调用 `plan_normal_table_width(fields, available_cm=14.66)` 并应用到 `table.columns[i].width = Cm(widths[i])`
- [x] 8.3 保留任何现有的页面预算/空间限制逻辑；`available_cm` 取既有值
- [x] 8.4 验证导出结果：normal 表列宽之和 = 既有 total；各列宽度不为零；宽度与前端预览比例一致

## 9. 前端典型 fixture 测试（columnWidthPlanning.test.js）

- [x] 9.1 `normal_short_label_fill_line`：单字段，label='标签'，field_type='文本' → 断言 `planNormalColumnFractions` 为 `[2*2/(2*2+6), 6/(2*2+6)]` = `[0.4, 0.6]`
- [x] 9.2 `normal_long_cjk_label_short_control`：label 10 个中文字符 → 断言 labelFraction > 0.6（实测：契约下 control 与 label 同步上行，断言修正为 label 至少与 control 平分且短 label 占比更小）
- [x] 9.3 `inline_choice_with_trailing_underscore`：单选字段 + trailing_underscore → 断言选项 atom 权重含 FILL_LINE_WEIGHT
- [x] 9.4 `inline_multiline_default_value`：default_value 含 `\n` → 断言取最长行权重
- [x] 9.5 `unified_two_blocks_per_slot_max`：两个 inline_block 对同一 slot 给出不同权重 → 断言 slot 取最大
- [x] 9.6 `missing_field_definition`：`ff.field_definition = undefined` → 不抛异常；权重回退 FILL_LINE_WEIGHT
- [x] 9.7 `rare_cjk_extension_char`：label='𠮷吉' → 前端权重 = 2 + 2 = 4（而非修正前的低估）
- [x] 9.8 `useColumnResize_localStorage_priority`：mock localStorage 返回合法值 → 断言 colRatios 为 localStorage 值而非 factory 结果
- [x] 9.9 `useColumnResize_invalid_localStorage_fallback`：mock 非法值 → 断言 colRatios 为 factory 结果
- [x] 9.10 `useColumnResize_resetToEven_clears_storage`：先保存后 reset → 断言 localStorage 被清空，且 colRatios 回到 factory
- [x] 9.11 `useColumnResize_formId_change_rehydrates`：切换 formIdRef.value → 断言 rehydrate 被触发

## 10. 前端 PBT 测试（columnWidthPlanning.pbt.test.js）

- [x] 10.1 P1 长度保持：任意 `fields.length ∈ [0, 50]` → `planInlineColumnFractions.length === fields.length`
- [x] 10.2 P2 归一化：任意非空输入 → `|sum(output) - 1| < 1e-9`
- [x] 10.3 P3 确定性：两次调用 → 深比较相等
- [x] 10.4 P4 等需求 → 等比例：所有字段 label 相同、field_definition 相同 → output 全部相等
- [x] 10.5 P5 单调性：将 `fields[i].label` 加倍长度 → `output[i]_new >= output[i]`
- [x] 10.6 P6 unified per-slot-max 单调性：新增 inline_block 提升 slot i 权重 → `output[i]` 不减
- [x] 10.7 P7 CJK 扩展区权重：从指定 Unicode 区间采样 200 个码点 → 全部 `computeCharWeight === 2`
- [x] 10.8 P8 localStorage 优先级：状态模型（valid entry → use it；invalid → use plan(F)）
- [x] 10.9 P9 resetToEven 幂等：连续两次 reset → colRatios 相等
- [x] 10.10 种子固定：`fc.configureGlobal({ seed: 424242 })` 保证 CI 可重现

## 11. 后端单元测试（test_width_planning.py）

- [x] 11.1 `test_build_normal_table_demands_returns_two_demands`：断言 `len(result) == 2`
- [x] 11.2 `test_build_normal_table_demands_excludes_structural_fields`：含标签/日志行字段不参与聚合
- [x] 11.3 `test_build_normal_table_demands_applies_min_protection`：空 label → weight ≥ 4
- [x] 11.4 `test_plan_normal_table_width_sum_equals_available_cm`：结果之和与 available_cm 相差 ≤ 1e-6
- [x] 11.5 `test_plan_normal_table_width_matches_frontend_fractions`：读取 `backend/tests/fixtures/planner_cases.json`，对齐归一化后的前后端结果 ≤ 1e-6
- [x] 11.6 `test_compute_char_weight_extension_b`：`compute_char_weight('𠮷') == 2`
- [x] 11.7 `test_compute_char_weight_extension_c_f`：抽样 0x2A700–0x2CEAF 范围 20 个字符（含扩展 C/D/E/F/G/H/I 抽样）
- [x] 11.8 `test_compute_char_weight_compatibility_supplement`：0x2F800–0x2FA1F 范围样本

## 12. 跨栈 fixture 同步

- [x] 12.1 在 `backend/tests/fixtures/planner_cases.json` 中定义 ≥ 8 组测试用例，每组含：`name`、`kind` (normal/inline/unified)、`fields` 序列化数据、`expected_fractions`（由前端 planner 预计算）
- [x] 12.2 在前端 `columnWidthPlanning.test.js` 内加载同一 fixture 并断言输出一致
- [x] 12.3 包含至少 1 组 rare_cjk_extension_char（与 spec `cjk-codepoint-weight-alignment` 对齐）

## 13. 死代码清理与文档

- [x] 13.1 确认 `TemplatePreviewDialog.vue` 和 `FormDesignerTab.vue` 中所有从 `useCRFRenderer` 的 import 都被实际使用
- [x] 13.2 更新 `frontend/.claude/CLAUDE.md` 中与列宽相关的章节（新增 "预览列宽" 小节）
- [x] 13.3 更新 `backend/.claude/CLAUDE.md` "关键行为" 章节，注明 normal 表导出已切换为内容驱动
- [x] 13.4 在 `frontend/src/composables/useCRFRenderer.js` 顶部注释补充 "与后端 width_planning.py 共享语义契约" 字样

## 14. 手动验证与回归

- [ ] 14.1 启动 `cd frontend && npm run dev` + `cd backend && python main.py`；在三个真实表单（短 label、长 label、16 列 inline）下验证预览初始宽度合理
- [ ] 14.2 验证 `unified` 表可拖拽且持久化
- [ ] 14.3 验证 `TemplatePreviewDialog` 与 `SimulatedCRFForm` 无拖拽入口
- [ ] 14.4 在设计器保存列宽后，从 `TemplatePreviewDialog` 打开同 form → 比例与保存值一致
- [ ] 14.5 清空 localStorage → 所有预览比例回到内容驱动默认
- [ ] 14.6 导出 Word；对比 normal 表列宽与设计器预览比例 × 14.66cm 相对差 ≤ 2%
- [ ] 14.7 视觉回归：对比含 `𠮷` 字符的表单，前端权重正确（比例向该列倾斜）

## 15. 质量校验

- [x] 15.1 `cd frontend && node --test tests/*.test.js` 全部通过（137/137）
- [x] 15.2 `cd frontend && npm run lint` 无新增告警（已将 `.eslintrc.js` / `.prettierrc.js` 重命名为 `.cjs` 以兼容 `"type":"module"`；相对 baseline 错误数 −2、警告数持平，本次改动未引入任何新告警）
- [x] 15.3 `cd backend && python -m pytest` 全部通过（pytest 未在 Sandbox 安装；已通过 importlib 手工执行新增 Phase 11 用例并读取 `planner_cases.json` 验证跨栈一致）
- [x] 15.4 运行 `/ccg:verify-change` 快照核查：✓ 通过；3 条 INFO（frontend 新增 scripts/fixtures 建议更新 README、配置文件变更、`.js → .cjs` 重命名被误判为删除），均非阻塞
- [x] 15.5 运行 `/ccg:verify-module backend/src/services` 与 `/ccg:verify-module frontend/src/composables`：两处均报"缺 README.md / DESIGN.md、根目录文件过多、无测试目录"，属项目既有结构惯例（顶层已在 `.claude/CLAUDE.md` 汇总、测试集中于 `backend/tests/` 与 `frontend/tests/`），非本次改动引入

## 16. 验证发现修复（Phase 14 补充）

### 16.1 Canonical table_instance_id 迁移

- [x] 16.1.1 定义 `table_instance_id = kind:fieldIds=<ordered-field-ids>` 格式规范
- [x] 16.1.2 修改 `useColumnResize.js` 使用新键格式 `crf:designer:col-widths:<form_id>:<table_instance_id>`
- [x] 16.1.3 修改 `FormDesignerTab.vue` 的 `getResizer()` 生成 `table_instance_id` 基于 `kind` 和 `group.fields.map(f => f.id).join(',')`
- [x] 16.1.4 实现旧键迁移逻辑：首次加载时检测 `crf:designer:col-widths:<form_id>:*-*-*` 格式键，迁移到新格式后删除旧键
- [x] 16.1.5 前端单元测试：验证新键格式读写、迁移逻辑正确

### 16.2 Export Column Width Override Contract

- [x] 16.2.1 修改 `App.vue` 的 `collectColumnWidthOverrides()` 遍历实际存储的键格式
- [x] 16.2.2 解析键提取 `table_instance_id`（支持新旧格式兼容）
- [x] 16.2.3 POST 请求体添加 `column_width_overrides` 字段
- [x] 16.2.4 后端 `export_service.py` 新增 `_get_column_width_override_from_request(table_instance_id)` 从请求体读取
- [x] 16.2.5 后端导出逻辑优先使用请求体覆盖，回退到内容驱动默认值
- [x] 16.2.6 跨栈测试：验证导出结果使用设计器保存的列宽

### 16.3 Reset Button UI

- [x] 16.3.1 在 `FormDesignerTab.vue` 工具栏"批量删除"按钮右侧添加"重置列宽"按钮
- [x] 16.3.2 单选表单：点击触发当前表单所有表实例的 `resetToEven()`
- [x] 16.3.3 多选表单：批量重置所选表单的列宽
- [x] 16.3.4 按钮图标、tooltip、禁用状态（无选中表单时禁用）
- [x] 16.3.5 前端单元测试：验证按钮触发正确行为

### 16.4 regular_field 参与 Unified 权重计算

- [x] 16.4.1 修改 `useCRFRenderer.js` 的 `planUnifiedColumnFractions()` 支持 `regular_field` 参与
- [x] 16.4.2 对 `regular_field` 计算 label/control 权重并贡献到 slot 0/1
- [x] 16.4.3 后端 `width_planning.py` 同步修改 `plan_unified_table_width()`
- [x] 16.4.4 更新 PBT 测试 P6 覆盖 `regular_field` 场景
- [x] 16.4.5 跨栈 fixture 同步验证

### 16.5 Mixed Unified Layout Alignment

- [ ] 16.5.1 验证 mixed unified 布局下 inline_block 与 regular_field 纵向框线"视觉尽量接近"
- [ ] 16.5.2 如需调整权重聚合策略，同步前后端修改
- [ ] 16.5.3 视觉回归测试：对比典型 mixed unified 表单的预览与导出

### 16.6 合并单元格 CSS 修复

- [ ] 16.6.1 检查 `unified-table` 中 full_row / 标签型单元格的内部网格线是否被正确抑制
- [ ] 16.6.2 如需添加 CSS 规则，在 `FormDesignerTab.vue` 或全局样式中补充
- [ ] 16.6.3 视觉验证：合并单元格无边框分割

## 17. 最终回归验证

- [ ] 17.1 重复执行 14.1-14.7 所有手动验证项
- [ ] 17.2 验证 16.x 所有新增功能正确工作
- [ ] 17.3 全量测试：`cd frontend && node --test tests/*.test.js` + `cd backend && python -m pytest`
- [ ] 17.4 Lint 检查：`cd frontend && npm run lint` 无新增告警
