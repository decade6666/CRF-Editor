# Design: UI 序号只读化 / 访视预览下线 / 简要模式解锁 / Word 导出增强 / 预览列宽可调

## Multi-Model Analysis Synthesis

- **codex (Backend, R4)**：落位 `_add_visit_flow_diagram:783` 插入 `w:tblHeader` find-or-append；`_add_forms_content` 一次性重建 `form_to_visits` 反向索引；新增 helper `_add_applicable_visits_paragraph` 与段落样式 `ApplicableVisits`；统一排序 key `(Visit.sequence, Visit.id)`。
- **gemini (Frontend, R1/R2/R3/R5)**：7 处（含 CodelistsTab 第 266/322 两处）逐行 `el-input-number` → `<span class="ordinal-cell">`；保留 `inject('editMode')`（App.vue 顶层 Tab 仍用）；R5 以 pointer 事件驱动，`colgroup/col` + `.resizer-handle`，阈值 4px，localStorage 键 `crf:designer:col-widths:<form_id>:<table_kind>`。
- **Consolidated Approach**：前后端并行推进；R1/R3 同改 FormDesignerTab，需一次性完成；R4 helper 在 unified 与 legacy 两路共用；R5 仅覆盖 normal / inline-table，unified-table 明确出栈。

## Resolved Decisions

| # | 决策 | 值 | 出处 |
|---|------|-----|------|
| D1 | 适用访视分隔符 | `、`（中文顿号） | 用户确认 + spec 一致 |
| D2 | CodelistsTab 选项列表（line 322） | 一并改为只读 | 用户确认 |
| D3 | 列宽持久化 | localStorage | 用户确认 |
| D4 | 列宽 key 命名 | `crf:designer:col-widths:<form_id>:<table_kind>` | 提案默认 |
| D5 | unified-table 是否支持列宽调整 | 不支持（保持现状） | spec 明确 |
| D6 | 拖拽排序文案提示 | 不加 | 提案默认 |
| D7 | 简要模式 UI 徽标/颜色提示 | 不加 | 提案默认 |
| D8 | 访视/适用访视排序 tie-break | `(Visit.sequence, Visit.id) ASC` | codex 建议 |
| D9 | 多表单体 footer 插入位置 | 最后一张主体表之后、分页符之前 | codex 建议 |
| D10 | 空 `Visit.name` 处理 | verbatim 保留（不过滤） | spec 一致 |
| D11 | editMode 注入 | 保留（App.vue Tab 守卫仍使用） | gemini 验证 |
| D12 | R5 pointer 事件 | `pointerdown/move/up`（不扩展 touch） | gemini 默认 |
| D13 | 吸附锚点 | `[0.25, 0.33, 0.5, 0.67, 0.75]` × 容器宽 ∪ 其他列边界 | spec + 提案 |
| D14 | 吸附阈值 | ±4px | spec 明确 |
| D15 | footer 段落样式 | 新增 `ApplicableVisits`（10.5pt, SimSun + Times New Roman, 5.25pt 段前后） | codex 建议 |
| D16 | 适用访视前缀加粗 | `适用访视：` 加粗 run；名称 run 非粗体 | spec 明确 |

## Architecture

### 新增资产
- 后端：`backend/src/services/export_service.py::_add_applicable_visits_paragraph(doc, visits)` — helper；unified 与 legacy 两路共用。
- 后端：`ApplicableVisits` paragraph style — 在 `_apply_document_style` 尾部注册。
- 前端：`frontend/src/composables/useColumnResize.js` — 签名 `useColumnResize(formId, tableKind, initialRatios) -> { colRatios, onResizeStart, snapGuideX, resetToEven }`。
- 前端：CSS class `.ordinal-cell`（纯文本序号，`display:inline-block; width:80px; text-align:center; tabular-nums`）。
- 前端：CSS class `.resizer-handle`（列分隔线 overlay；`cursor:col-resize`；`z-index` 高于 drag-handle 低于 tooltip）。

### 不变资产（契约守护）
- `useCRFRenderer.js` / `formFieldPresentation.js` 渲染契约：列宽只通过容器层 `<colgroup>/<col>` 或 CSS 变量控制。
- `useOrderableList.js` 排序写入入口：拖拽 handler 仍是唯一写入路径。
- `_apply_grid_table_style`（export_service.py）：不写 `trPr`；`tblHeader` 保持在 `_add_visit_flow_diagram` 注入。
- Visit 模型：无新增字段；适用访视仅输出 `Visit.name`。
- 后端 API 契约：无新增路由，无新增 schema。

## PBT 不变量

| ID | 不变量 | 反例生成策略 |
|----|--------|--------------|
| P1 | 对任意 form/visit 关联矩阵，footer 文本 == 被关联 visits 按 `(Visit.sequence, Visit.id) ASC` 排序后以 `、` 连接 | Hypothesis：1..5 唯一 sequence + 随机 Unicode name + 随机关联 + 乱序 `VisitForm.sequence`；不等于预期即反例 |
| P2 | 无论 form_count/visit_count，`doc.tables[1].rows[0]` 恰好 1 个 `w:tblHeader[@w:val="true"]` | Hypothesis：form_count ∈ 0..8、visit_count ∈ 0..20；XPath count ≠ 1 即反例 |
| P3 | footer 段落数 == 被至少一个 visit 引用的 form 数；orphan form 无 footer | 稀疏关联矩阵 + 保底一个 orphan；paragraphs 计数不符即反例 |
| P4 | 列宽 ratios 总和 ∈ [1.0 − ε, 1.0 + ε]（ε = 1e-4） | 随机拖拽序列；sum 偏离即反例 |
| P5 | 从 localStorage 读回的每个 ratio ∈ [0.1, 0.9]；任意越界值触发 even 分布回退 | 写入 ratio=1.5 / ratio=0.05 / 长度错位；未回退即反例 |
| P6 | `ordinal` 列 UI 上无 `el-input-number`，拖拽是唯一排序入口 | 渲染 DOM 扫描；出现 `el-input-number[class*="order"]` 即反例 |
| P7 | 关闭完整模式后，FormDesignerTab 可完成 8 类操作（新建/删除/拖拽表单/字段库/字段拖入/属性编辑/批删/备注编辑） | 关 editMode 后脚本顺序触发 8 类操作；任一不响应即反例 |

## 并行策略

- **轨道 A（后端 R4）**：`backend/src/services/export_service.py` + `backend/tests/test_export_service.py`。
- **轨道 B（前端 R1/R2/R3）**：5 个 Vue 文件跨文件独立改动；R1 与 R3 在 FormDesignerTab 内聚合，建议同轨串行。
- **轨道 C（前端 R5）**：FormDesignerTab.vue + 新 composable `useColumnResize.js` + 样式；依赖轨道 B 内的 R3（简要模式解锁，使列宽调整在两种模式下都生效）。
- **串行点**：R1 + R3 在 FormDesignerTab 内（编辑器共用）→ 先 R3 解除守卫再 R1 改序号；R5 在 R3 完成后。

## 验证顺序

1. 单文件：`node --test frontend/tests/*.test.js`；`python -m pytest backend/tests/test_export_service.py -q`。
2. 全量：`cd frontend && npm run build`、`cd backend && python -m pytest`。
3. 手动：对照 proposal.md 验收标准 + Word 文档在 MS Word / WPS 中打开验证 tblHeader 与 footer。

## 参考
- `proposal.md` — 需求与约束集（已同步 Resolved Decisions）
- `specs/*/spec.md` — 按需求拆分的 spec delta（ui-ordinal-readonly 已补 Codelist-Options 枚举）
- `tasks.md` — 零决策任务拆分
