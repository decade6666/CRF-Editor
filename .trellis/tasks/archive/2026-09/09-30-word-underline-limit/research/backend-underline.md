# Research: Backend Word 导出下划线生成 / 上限与下限规则 / 宽度规划 / 测试与 parity

- **Query**: backend Word .docx export underline generation, max/floor rules, width planner, affected field types, tests/fixtures, parity constraints, implementation risks
- **Scope**: internal（worktree `/home/decade/CRF-Editor-word-underline-limit`）
- **Date**: 2026-09-30
- 所有路径相对 worktree 根；行号以该 worktree 当前 HEAD 为准。

---

## 1. 导出 `.docx` 中下划线的全部来源（backend/src/services/export_service.py）

### 1.1 整格填写线（whole-cell fill line）— `_render_field_control` (L3358-3457)

核心行 L3371：

```python
fill_line = "_" * fill_line_chars if fill_line_chars else "________________"  # 16 根 legacy 回退
```

`fill_line_chars=None` 时回退固定 **16** 根。分支（L3367-3457）：

| field_type | 输出 | 行号 | 是否含可变长下划线 |
|---|---|---|---|
| 复选 | `□{checkbox_label}` | L3368-3369 | 否 |
| 单选 / 多选 / 单选（纵向）/ 多选（纵向）/ 下拉框 | 选项串；**无选项时回退 16 根下划线** | L3385-3399；回退见 L3467-3469、L3495-3497、L3509-3511、L3535-3541（纵向 cell 级）、L3633-3641（`_render_choice_field`） | 回退固定 16 |
| 日期 | 固定 `\|__\|__\|__\|__\|年\|__\|__\|月\|__\|__\|日` | L3401-3403 | 否（固定字面量） |
| 日期时间 | 固定字面量（有无 `ss` 两种） | L3405-3413 | 否 |
| 时间 | 固定字面量（有无 `ss` 两种） | L3415-3423 | 否 |
| 数值 | `\|__\|` × integer_digits（默认 10）+ `"."` + `\|__\|` × decimal_digits（默认 2）+ 单位 | L3425-3449 | **长度随位数配置增长，无宽度上限** |
| 文本 / 标签 | `fill_line + unit_text` | L3451-3453 | 是（整格填写线） |
| 其他（默认分支） | `fill_line` | L3455-3457 | 是（整格填写线） |

### 1.2 `_render_field_control` 的 4 个调用点 — 两种制度

| 调用点 | 宿主方法 | fill_line_chars | 制度 |
|---|---|---|---|
| L2490 | `_add_unified_regular_row`（def L2392） | 未传 → 固定 16 | legacy |
| L2756 | `_add_unified_inline_band`（def L2636） | 未传 → 固定 16 | legacy |
| L3082-3084 | `_add_field_row`（def L2999，normal 表） | `compute_fill_line_char_count(widths[1])` | 宽度自适应 |
| L3311-3317 | `_add_inline_table`（def L3139，inline 表） | `compute_fill_line_char_count(col_widths[col_idx])` | 宽度自适应 |

unified 路径可达性：`_build_unified_table`（L2283）仅在 `layout.mode == "unified_landscape"`（L1860-1884）时调用，但 `_classify_form_layout`（L2090-2157）只返回 `"legacy"` / `"mixed_landscape"` → **unified 固定 16 路径当前为休眠代码**（与 `.trellis/spec/guides/cross-stack-contracts.md` L304 记载一致）。

### 1.3 其他含下划线的输出

- 死代码：`_add_fill_line_run(paragraph, length=6)`（L3742-3752）全仓库无调用方。
- 纵向/横向选项**尾部填写线已于 2026-08-05 移除**（backend/.claude/CLAUDE.md change log L132）；`_render_vertical_choices`（L3517-3612）与 `_render_choice_field`（L3615+）现只输出 `符号 + 选项文本`，方法 docstring（L3527、L3625）仍残留「尾部填写线」字样（stale 注释）。
- normal 表中 标签/日志行 不走 `_render_field_control`：`_build_form_table` 路由 标签→`_add_label_row`（L2897-2899）、日志行→`_add_log_row`（L2893-2895）。因此实际产生整格填写线的是 **文本 + 未识别类型的默认分支**；L3103 `is_plain_fill_line` 中的 `"标签"` 分支在现行由路由下不可达（防御性）。

## 2. 最大 / 下限规则（backend/src/services/width_planning.py）

常量（L17-36，与前端逐字同名同值，跨栈契约）：

| 常量 | 值 | 行号 |
|---|---|---|
| `UNDERSCORE_CHAR_CM` | 0.19 | L29 |
| `CELL_HPAD_CM` | 0.4 | L30 |
| `FILL_LINE_SAFETY_CM` | 0.2 | L31 |
| `FILL_LINE_MIN_CHARS` | **6**（下限） | L32 |
| `FILL_LINE_MAX_CHARS` | **80**（现行上限） | L33 |
| `FILL_LINE_EPSILON` | 1e-9 | L36 |

公式 `compute_fill_line_char_count`（L39-50）：

```python
count = clamp(floor((column_cm - 0.4 - 0.2) / 0.19 + 1e-9), [6, 80])
```

必须用 `math.floor`（非 `//`）以与前端 `Math.floor` 逐位一致（边界案例 8.77 → 43，`test_fill_line_width.py` L46-49）。

**现行上限的物理含义**（实现侧事实，供产品定标参考）：
- portrait `available_cm=14.66`（`PORTRAIT_CONTENT_WIDTH_CM`，export_service L243）：control 列理论最大 ≈14.66cm → 原始根数 74 ≈ 14.06cm，**portrait 下 80 上限永不触发**。
- landscape `available_cm=23.36`（`LANDSCAPE_CONTENT_WIDTH_CM`，L245）：列宽 >15.8cm 后原始根数 >80，被钳到 80 ≈ **15.2cm**（超 portrait 内容宽，但仅 landscape 可达）。
- 即「下划线太长」的现行最坏值 = 80 根 ≈ 15.2cm（landscape 宽列整格填写线）。

宽度来源：normal 表 `plan_normal_table_width(fields, available_cm)`（width_planning L437-455）→ `_build_form_table` L2867；拖拽列宽覆盖经 `_get_column_width_override_by_instance_id` 替换 `normal_widths`（L2870-2875），填写线根数随覆盖后宽度变化。inline 表 `plan_inline_table_width`（width_planning L233-274）+ `build_inline_column_demands`（field_rendering L160-193，`INLINE_HEADER_FLOOR=8` width_planning L58）→ `_add_inline_table` L3183-3184。

## 3. 前端预览对应物（parity 另一侧）

`frontend/src/composables/useCRFRenderer.js`：
- 常量同 backend：L30-37（`LEGACY_FILL_LINE = '________________'` 16 根，L37）。
- `computeFillLineCharCount`（L45-49）与 backend 同公式。
- `buildFillLineHtml`（L365-370）：`min-width = 根数 × 0.5em`；`toHtml`（L445-460）把 `_{4,}` 连续段替换为 fill-line span（L451）。`|__|` 段只有 2 连下划线，不命中该正则，按原文字渲染。
- `renderCtrl`（L494-559）：L496 fillLine 重复/16 根回退；数值 boxes（L500-509）与 backend 逐字同构；**日期/日期时间/时间由 `date_format` 动态生成**（L511-551，backend 为固定字面量，仅默认格式与 ss 变体一致）；单选/多选空选项前端默认 `○是 ○否`（L553-554）而导出为 16 根下划线（spec L304 记载的预存分歧）；`标签 → ''`（L557，预览把标签渲染为 colspan-2 结构行）。
- 预览路径线程 fillLineChars：`FormDesignerTab.vue`（`normalColumnCm`/`normalFillChars` L1411-1423、`getInlineRows` L1425-1447）、`VisitsTab.vue`（L436-454、`getInlineFillChars` L465-474）、`TemplatePreviewDialog.vue`（L225-246、L285-298）、`SimulatedCRFForm.vue`（L149）。
- available_cm 解析：`frontend/src/composables/visitPreviewLandscape.js` L3-4（14.66 / 23.36）、`resolveNormalTableAvailableCm` L38-41、`resolveInlineTableAvailableCm` L55-60。
- CSS 红线：`.fill-line` 类名与样式逻辑不可改（`frontend/src/styles/main.css` L488 C-01 注释；L411-428 整格唯一内容时 flex 填满仅视觉修正，parity 仍按根数）。

## 4. 既有测试与 fixtures

| 文件 | 覆盖点 |
|---|---|
| `backend/tests/test_fill_line_width.py`（7 例） | 下限 6（L19-26）、单调（L29-32）、**上限 80 钳制**（L35-36）、不换行不变式 `count×0.19 ≤ cm`（L39-43）、floor 边界 8.77→43（L46-49）、portrait control > 16（L52-55） |
| `backend/tests/test_export_service.py` | normal 文本填写线 == `compute_fill_line_char_count(widths[1])` 且 >16（L237-269）；`_render_field_control` 无宽度参数时保持 16 根（L312-327，注释称 inline/unified/空占位沿用旧行为——inline 部分已过时） |
| `backend/tests/test_export_unified.py` | inline 各列填写线随列宽自适应、界内 [6,80]、不换行（L176-211）；inline 单选无尾线（L731） |
| `backend/tests/test_width_planning.py` | 短表头 demand 必须 > `FILL_LINE_WEIGHT`（L648-694） |
| `backend/tests/fixtures/planner_cases.json` | 单一权威生成器 `frontend/scripts/generatePlannerFixtures.mjs`（含 `normal_short_label_fill_line` L104、FILL_LINE_WEIGHT 兜底 L172）；改 planner 需重跑生成器并双端测试通过（backend/.claude/CLAUDE.md L87） |
| `backend/tests/test_word_table_parity.py` | 严格比对器机制（合并单元格折叠、精确率分母） |
| `frontend/tests/columnWidthPlanning.test.js` | 9.3e/9.3e2/9.3f/9.3f2（L134-157：夹取 [6,80]、不换行、16 根回退、min-width 放大）、16.1.5j fillLineChars 转发守卫（L745-754） |

## 5. Parity 约束（.trellis/spec/guides/cross-stack-contracts.md §5，L271-341）

- L279 共享常量：min **6** / max **80**、legacy 固定 **16**、`UNDERSCORE_CHAR_CM=0.19` 等；触发面包括「fill-lines、numeric/date placeholders」。
- L302 normal 填写线契约：两栈常数与公式必须**逐字节一致**，floor 语义、available_cm 按 14.66/23.36（mixed_landscape 双侧 23.36）。
- L303 inline 契约：仅独立 inline 组自适应；**unified inline band 保持 16**；拖拽覆盖宽度的 inline 用 planner fractions（已知 minor gap）。
- L304 unified / 无宽度调用方 = 固定 16；`_build_unified_table` 不可达；空选项占位预览 `○是 ○否` vs 导出 16 根为**预存分歧**。
- L305-306 数值框 `|__||__|.|__|`、日期时间两空格分隔为逐字契约。
- L336 检查单：改填写线 → 两栈公式逐字节同步 + 跑 `test_fill_line_width.py` + 前端 9.3e/9.3f；L338-339 需跑的测试清单；L340 发布证据基线 **54/54 forms, 480/480 rows, 1181/1181 cells, mismatches 0**。
- backend/.claude/CLAUDE.md L84-88（宽度/填写线契约）、L110（改列宽规划需同步后端测试、前端契约测试与文档）。

## 6. 实现风险 / 边界观察（仅描述，不做建议）

1. **上限常量是跨栈契约**：调小 `FILL_LINE_MAX_CHARS` 必须同步 `width_planning.py` L33 ↔ `useCRFRenderer.js` L34、spec §5 L279/L302/L336、两侧测试（含 80 字面断言：`test_fill_line_width.py` L35-36、`columnWidthPlanning.test.js` L137）并重生成 planner fixtures；否则预览/导出根数失配即破坏严格 parity。
2. **以 cm 定上限需换算一致**：0.19cm/根是 10.5pt SimSun 半角 `_` 的近似；若产品按 cm 定上限，两侧需同一换算（cm→根数 floor），且不得突破「不换行」不变式 `count×0.19 ≤ column_cm`（`test_fill_line_width.py` L39-43）。
3. **`|__|` 框链不受任何宽度上限约束**：数值框长度随 `integer_digits` 增长；schema 无上界（`backend/src/schemas/field.py` L37-38 为裸 `Optional[int]`），前端 UI 仅输入钳制 1-20（`frontend/src/components/FieldsTab.vue` L475）。20+2 位 ≈ 89 字符 ≈ 16.9cm，在 portrait control 列（≤14.06cm 可用）会折行——这是「显示太长/换行」的现存真实来源之一；日期/时间固定字面量较短。spec L305 将数值框列为逐字契约，改动需双端字面量同步。
4. **用户内容不得动（PRD R3）**：默认值文本原样导出（export_service L3056-3066），预览 `toHtml` 会把默认值里 `_{4,}` 段渲染成任意长 fill-line span（useCRFRenderer L451）——上限只应作用于生成的占位填写线，不应改写默认值/存储文本。
5. **固定 16 的休眠/分歧路径**：unified 固定 16 为不可达代码（见 §1.2）；空选项占位 16 根 vs 预览默认选项是预存分歧（spec L304）。若上限规则想覆盖「16 根」这类占位，会触碰预存分歧面，需产品决定是否收敛。
6. **CSS 红线**：预览侧不能靠改 `.fill-line` 样式实现上限（main.css L488 C-01）；只能通过根数/入参传导。
7. **列宽覆盖交互**：拖拽列宽覆盖同时改变两栈列宽 → 改变自适应根数（export L2874-2875、FormDesignerTab L1411-1418）；上限钳制需在覆盖宽度下依然成立（inline 拖拽覆盖已知 minor gap，spec L303）。

## 7. 已确认事实 vs 未决产品决策

**已确认（代码/spec 证据）**
- 下划线三种形态：① 整格填写线（文本/默认分支，宽度自适应，clamp [6,80]）；② 固定 16 根占位（无宽度调用方 / 各类空选项回退）；③ `|__|` 框链（数值/日期/时间，随位数配置或固定字面量，无宽度钳制）。
- 现行唯一 max/floor 规则 = `compute_fill_line_char_count` 的 [6, 80]，仅覆盖形态①；最坏物理长度 80×0.19≈15.2cm（仅 landscape 宽列可达）。
- 预览与导出通过共享公式+常量逐字 parity；改动面与测试清单已由 spec §5 固定。

**未决（PRD Open Questions，需用户/主 Agent 定夺）**
- 范围：只限形态①，还是也含 ②固定 16 与 ③数值/日期框链？（PRD R1「需求范围内的下划线」未定）
- 上限单位与默认值：underscore 根数（现 80）还是 cm？目标值？
- 达到上限后的呈现：现行即「固定长度不换行不截断」；PRD 问「固定 / 换行 / 其他」是否要改变现行为。
- 形态②③是否引入同一上限（涉及预存预览/导出分歧与逐字契约的破坏面）。
