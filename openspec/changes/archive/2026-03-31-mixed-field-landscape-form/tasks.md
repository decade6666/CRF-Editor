# Tasks: 混合字段横向表单统一渲染

## 后端

- [x] 1.1 新增 `_classify_form_layout(form_fields)` 方法，返回 LayoutDecision（mode/column_count/label_span/value_span）
- [x] 1.2 新增 `_build_unified_segments(form_fields)` 方法，按 sort_order 扫描字段流输出 Segment 列表（regular_field / full_row / inline_block）
- [x] 1.3 新增 `_switch_section(doc, orientation, project)` 辅助方法，封装分节符 + 页面方向 + header/footer 复制
- [x] 1.4 新增 `_build_unified_table(doc, segments, layout)` 方法，创建 N 列表格并按 segment 顺序写入行
- [x] 1.5 新增 `_add_unified_regular_row(table, field, layout)` — 普通字段行（merge label/value 列）
- [x] 1.6 新增 `_add_unified_full_row(table, field, N)` — 全宽行（label/log，merge 0..N-1）
- [x] 1.7 新增 `_add_unified_inline_band(table, block_fields, N)` — inline block 表头 + 数据行，含窄 block 的 merge spans 计算
- [x] 1.8 修改 `_add_forms_content()` — 在 form 循环顶部调用 `_classify_form_layout()`，unified 走新路径；移除末尾无条件 page_break 改为条件性
- [x] 1.9 新增 `_compute_merge_spans(N, M)` 辅助函数，将 N 列分成 M 个区间返回 span 列表

## 前端

- [x] 2.1 修改 `renderGroups` 计算属性 — 检测 unified 触发条件，返回 `{ type: 'unified', fields, colCount }` 单组
- [x] 2.2 更新 `needsLandscape` 计算属性 — 增加 `g.type === 'unified'` 判断
- [x] 2.3 新增 unified 预览模板区域 — 在主预览面板和设计器对话框中增加 `v-if="g.type === 'unified'"` 分支
- [x] 2.4 实现 unified 表格 HTML 渲染 — 按 segment 类型输出对应 `<tr>` 行（普通字段 colspan / 全宽行 colspan / inline block th+td）
- [x] 2.5 新增/调整 CSS 样式 — `.unified-table`、`.unified-label`、`.unified-value` 等

## 测试

- [x] 3.1 纯 normal 表单导出回归测试 — 验证仍为 2 列表格 + portrait
- [x] 3.2 纯 inline 表单导出回归测试 — 验证 ≤4 列 portrait、>4 列 landscape 行为不变
- [x] 3.3 mixed + max_block_width ≤ 4 回归测试 — 验证仍为 split-table 行为
- [x] 3.4 unified 基本场景测试 — 混合表单 (max_block_width > 4) 输出单一表格 + landscape section
- [x] 3.5 unified 字段顺序测试 — 验证表格行顺序与 sort_order 一致
- [x] 3.6 unified 合并公式测试 — 穷举 N∈[5,12]，验证 label_span/value_span 正确
- [x] 3.7 unified label/log 行测试 — 验证 gridSpan = N
- [x] 3.8 unified 窄 block 测试 — M < N 时 merge spans 正确
- [x] 3.9 section 方向恢复测试 — landscape form 后续 form 为 portrait
- [x] 3.10 heading 位置测试 — 标题与表格在同一 landscape section 内
- [x] 3.11 merge 后样式保留测试 — 底纹/颜色在 merge 后的 cell 上保留
- [x] 3.12 前端 renderGroups unified 检测测试 — 验证触发条件和 colCount 计算
