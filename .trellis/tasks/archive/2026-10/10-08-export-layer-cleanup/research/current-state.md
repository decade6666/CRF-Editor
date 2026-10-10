# Research: export_service.py current state (HEAD a4431b0)

- **Query**: 纯重构前置调查 — 死分支 / 重复渲染 / DB 导出搬移 / 大函数拆分 / parity 金标
- **Scope**: internal（backend/src、backend/tests、docs）
- **Date**: 2026-10-09
- **Note**: 行号均为 HEAD `a4431b0`；`legacy-cleanup`（删 perf_span/record_counter，本文件共 6 处调用：`:23` import、`:403` `:412` `:413` `:419` `:516` `:1572`）与 `backend-format`（ruff format，本文件有大量空行会被压缩）先行合入后行号会漂移，一律以函数名为锚。

## 1. unified_landscape 死分支

### `_classify_form_layout`（:2097-2166）可返回值证明

代码路径穷举（`:2110-2166`）：
- `form_fields` 为空 → `LayoutDecision("legacy", 0, 0, 0)`
- 非空：`has_regular and has_inline and max_block_width > 4` → `LayoutDecision("mixed_landscape", N, 0, 0)`，否则 `LayoutDecision("legacy", 0, 0, 0)`
- 覆写段（`:2158-2166`）：`portrait` → `LayoutDecision("legacy", ...)`；`landscape` 且 mode==legacy → legacy+force_landscape；其余原样返回（legacy 或 mixed_landscape）

**结论：生产中 mode 只能是 `legacy` 或 `mixed_landscape`，`unified_landscape` 不可达。** 分支位于 `_add_forms_content` `:1867-1899`。

### 全部引用清单（除 width_planning 共享层）

| 位置 | 性质 |
|---|---|
| `export_service.py:200` | `LayoutDecision.mode` 注释列出该模式（R1 需收窄为 legacy \| mixed_landscape） |
| `export_service.py:1867-1899` | `_add_forms_content` 的 elif 分支（唯一生产入口） |
| `export_service.py:156` | `import plan_unified_table_width`（R1 后此 import 变冗余可删） |
| `_build_unified_segments` `:2200-2254` | 仅被死分支 `:1882` 调用（生产）；tests 另有直接调用（见下） |
| `_build_unified_table` `:2290-2395` | 仅被死分支 `:1884` 调用（生产）；tests 直接调用 |
| `_add_unified_regular_row` `:2399-2543` | 仅被 `_build_unified_table:2373` 调用 |
| `_add_unified_full_row` `:2546-2639` | 仅被 `_build_unified_table:2377` 调用 |
| `_add_unified_inline_band` `:2643-2797` | 仅被 `_build_unified_table:2381` 调用 |
| `_compute_merge_spans` `:2172-2196` | 仅被 `_add_unified_inline_band:2657` 调用；测试无直接引用 |
| `width_planning.plan_unified_table_width` | 保留（前端契约 + fixtures）；R1 后生产仅剩死分支一个调用者 |
| `.trellis/spec/guides/cross-stack-contracts.md` §316-317、§324 | 明示 `_build_unified_table` 不可达 / `_add_unified_full_row` 保持 log-vs-label 拆分 — AC8 需同步 |
| `planner_cases.json` kind:"unified" 4 例 + `test_width_planning.py` | 保留不动（审查明确） |

### unified-only 调用图（export_service.py 内）

```
_add_forms_content(unified elif :1867)
├── _build_unified_segments (:2200)   [Segment 构造 :2230/:2240/:2244/:2250]
└── _build_unified_table (:2290)
    ├── plan_unified_table_width (width_planning, 保留)
    ├── build_inline_table_model / build_inline_column_demands / build_field_control_weight / compute_text_weight (field_rendering, 共享)
    ├── _build_table_instance_id / _get_column_width_override_by_instance_id (共享: normal/inline 同用)
    ├── _add_unified_regular_row (:2399)
    ├── _add_unified_full_row (:2546)
    └── _add_unified_inline_band (:2643)
        └── _compute_merge_spans (:2172)
共享底层（勿删）：_apply_exact_row_height / _apply_grid_table_style / _apply_cell_paragraph_metrics /
_apply_cell_shading / _set_run_font / _render_vertical_choices / _render_choice_field /
_render_field_control / _field_annotation_text / _add_oid_annotation_box
```

### 引用 unified 的测试逐个裁决

| 测试 | 状态 | 断言 | 与共享路径重叠？ |
|---|---|---|---|
| `test_export_unified.py::test_export_unified_field_order_matches_order_index` (:347, xfail@:344) | xfail | unified 表格首行字段顺序 = order_index | 字段顺序行为已由 mixed 路径 `test_phase0_ordering_contracts` 系列覆盖 → 可删 |
| `test_export_unified.py::test_export_unified_full_row_span_equals_N` (:408, xfail@:405) | xfail | full_row 合并跨全 N 列 + 「以下为log行」文本 | log 行文本/底纹由 `_add_log_row` 路径测试覆盖 → 可删 |
| `test_export_unified.py::test_export_unified_multi_blocks_share_table_level_width` (:886, xfail@:883) | xfail | 多 inline block 共享单表级宽度 | 宽度语义保留在 `plan_unified_table_width`（test_width_planning 覆盖）→ 可删 |
| `test_export_column_width_override.py::test_export_unified_table_column_width_override` (:343, xfail@:340) | xfail | unified 列宽覆盖落到 tcW | 覆盖机制本身由 normal/inline 两条活路径的同类测试覆盖 → 可删 |
| `test_export_acrf.py::_build_unified_fixture`(:363-381)+`_save_unified_doc`(:383)+`test_unified_annotation_helpers_only_emit_boxes_for_annotated_output`(:486) | **通过**（直接调 `_build_unified_table:400`，不走分类） | 注记盒只在 annotated 文档出现 | **共享行为**：所有行类型都经 `if annotated` 调 `_add_oid_annotation_box` → 应改写为走 mixed_landscape 导出而非删除 |
| `test_export_service.py::test_build_unified_table_sets_all_rows_to_at_least_one_centimeter` (:1089, 构造 `LayoutDecision("unified_landscape",4,1,3)`@:1150) | **通过**（直接调 `_build_unified_table:1143`） | 每行 trHeight ≥ 1cm (AT_LEAST) | **共享行为**：`_apply_exact_row_height` 为全表格共用 → 应改为对 mixed_landscape 输出断言后删除 |
| `test_phase0_ordering_contracts.py` :496 / :813 / :983 | **通过** | order_index 排序、inline_block 分段、快捷编辑属性 | 把 `_build_unified_segments` 当纯分段工具用 → 改用 `_group_form_fields`（或保留一个纯分段 helper）后删函数 |
| `test_export_unified.py` 其余 23 例（:124/:176/:216/:253/:298/:460/:504/:558/:602/:650/:729/:770/:815/:965/:1001/:1049/:1097/:1169/:1217/:1277/:1351/:1360/:1367） | **通过** | 名带 unified 但实际触发 mixed_landscape/legacy inline 表格（种 1 normal + N inline 或纯 inline），断言 5/8 列 inline 表的 landscape、tblBorders、shading、gridcol 对齐、选项渲染等 | **全部保留**（建议 R1 时更名去 "unified"，防误导） |

## 2. 重复渲染

### (a) 日志行 / 标签行判定与「以下为log行」渲染

判定点（R1 后剩两处 + 共享 helper）：

| 站点 | 判定 | 渲染 |
|---|---|---|
| `_build_form_table:2900-2906`（活） | `is_log_row or field_type=="日志行"` → `_add_log_row`；`field_type=="标签"` → `_add_label_row`；否则 `_add_field_row` | `_add_log_row :2918-2960`、`_add_label_row :2964-3002` |
| `_build_unified_segments:2238`（随 R1 删） | `is_log_row or field_type in ("日志行","标签")` → full_row | `_add_unified_full_row:2569-2602`(log) / `:2606-2639`(label) |

`_add_log_row` vs `_add_unified_full_row` log 分支逐行对照：文本（`label_override or "以下为log行"`）、字体（`resolve_label_font_pt`/`resolve_label_bold`）、`_apply_cell_paragraph_metrics`、LEFT 对齐、垂直居中、`bg_color or 'D9D9D9'` 底纹、text_color 重染、注记盒 —— **完全一致**；唯一差异是取行方式（`table.rows[row_idx]` vs `table.add_row()`）与合并到 `cells[1]` vs `cells[N-1]`。

**关键差异（字节级风险）**：legacy `_add_label_row` **不写底纹、不重染 text_color**；unified label 分支额外有 `if bg_color: shading` + `if text_color: recolor`。合并时必须采用 legacy 语义（无底纹），否则带 bg_color 的标签行导出会变化。合并方案：提取 `_fill_structure_row_cells(cell, form_field, *, is_log: bool)`（写文本 run + 字体 + metrics + 对齐 + 垂直对齐 + log 才有默认底纹/两色重染 + 注记盒），`_add_log_row`/`_add_label_row` 只保留取行与 merge。R1 后 unified 副本整体消失，风险归零。

### (b) 选项标签函数

| 维度 | `export_service._get_option_data` (:3687-3725) + `_get_option_labels` (:3676-3683) | `field_rendering._get_option_labels_for_width` (:224-234) |
|---|---|---|
| 前置检查 | `hasattr(codelist)`+truthy → `hasattr(options)`+truthy → `[]` | 相同 |
| 排序 | `(order_index or inf, id or 0)` | 相同（逐字符一致） |
| 过滤 | `if not opt.decode: continue` | `if opt.decode`（语义相同） |
| 取值 | **`opt.decode`**（非 label/code） | `opt.decode`（相同） |
| `复选` | 不处理（复选无 codelist，走 `resolve_checkbox_label`） | 相同（无 codelist → `[]`，`build_field_control_weight` 在此之前用 `resolve_checkbox_label` 特判） |
| None 处理 | `order_index None → inf`；`id None → 0` | 相同 |
| 返回类型 | `List[str]` | `List[str]` |

**语义完全等价。** 调用者：`_get_option_data` → `_render_choice_field:3618`、`_render_vertical_choices:3520`；`_get_option_labels`（= `list(_get_option_data())`）→ `_render_single_choice:3452`、`_render_single_choice_vertical:3466`、`_render_multi_choice:3480`、`_render_multi_choice_vertical:3494`；tests：`test_import_service.py:692/743/905/997`（4 处 `ExportService(session)._get_option_labels`）。`_get_option_labels_for_width` 调用者仅 `build_field_control_weight:173`（tests 不直接调）。收敛方案：field_rendering 暴露公共 `get_option_labels(field_def)`（改名去下划线），export_service 删 `_get_option_data`/`_get_option_labels` 改调之；`test_import_service.py` 4 处断言 `["男","女"]`/`["男_"]` 照旧成立（decode 语义不变）。字节风险：无（纯读路径、返回值逐元素相等）。

### (c) 控件分派（「○/□ 符号 vs 占位符」外层分派，共 4 处而非 3 处）

| 站点 | 默认值渲染 | fill_line_chars | 纵向对齐（文本/标签填写线） |
|---|---|---|---|
| `_add_field_row:3053-3113`（活，legacy/mixed normal 表） | `extract_default_lines` 原地多 run + `add_break()` | `compute_fill_line_char_count(widths[1])` | **BOTTOM**（`:3110-3113`） |
| `_add_unified_regular_row:2463-2513`（随 R1 删） | 同上逐字符相同 | 不传（固定 16 下划线） | CENTER |
| `_add_inline_table:3287-3339`（活，inline 表） | 值来自 `build_inline_table_model` 的 `row_values`（每格单 run） | `compute_fill_line_char_count(col_widths[col_idx])`（越界 None） | CENTER |
| `_add_unified_inline_band:2735-2775`（随 R1 删） | 同 inline_table | 不传 | CENTER |

四处的分派梯子逐字符相同：`cell_value/default_lines 为空` → `单选（纵向）/多选（纵向）`→`_render_vertical_choices(cell,...)`；`单选/多选`→`_render_choice_field(para,...)`；else→`_render_field_control(field_def[, fill_line_chars])` + `_set_run_font(run, 10.5)`。

注意 `_render_field_control:3365-3444` 内部的 `单选/多选/单选（纵向）/多选（纵向）` 分支（`:3392-3406`）从生产调用点不可达（外层梯子先拦截），**但 `下拉框` 只在此处渲染**（外层不拦）→ 合并分派时必须保留 `_render_field_control` 全部分支。

R1 后仅剩 `_add_field_row` 与 `_add_inline_table` 两条活路径。收敛方案：提取 `_render_control_into_cell(cell, para, field_def, form_field|cell_value, fill_chars, *, plain_fill_bottom: bool)`；字节风险点：① fill_chars 仅在字段类型为 文本/标签（含 unit 后缀）时影响输出；② BOTTOM 对齐只许保留在 `_add_field_row` 语义；③ inline 的 `space_before/after` 组合（`:3333-3334` 两者皆绑 `not is_vertical_choice`）与 field_row（`:3098-3106` 先 after=False 再对末段 after=`not is_vertical_choice`）的最终 XML 相同但写序不同，合并时以最终属性为准。

## 3. 数据库导出函数

四个模块级函数位于文件末尾：`export_full_database :4255-4283`、`_vacuum_sqlite_file :4289-4295`、`export_project_database :4298-4322`、`export_user_projects_database :4325-4360`；另有仅服务它们的 `_validate_form_field_schema :49-101` 与 `_EXPORT_ERROR_CODES :43-46`。

- **依赖的模块级 import**：`sqlite3`（`:13`，全部 5 处使用都在这五个函数内 → 搬移后从 export_service 删除）、`tempfile`（`:15`，唯一使用 `:4259` → 同上）。Word 路径仍用 `os`（`:550`）、`Path`（`:772`），不可删。
- **`ExportError` 定义于 `:33-40`**；搬移后仍被 Word 路径使用：`_validate_form_field_schema` 抛出（若随迁则新模块需要它）、`export_project_to_word` `:528 except ExportError`、注记校验 `:1045 raise ExportError`。注册点：`main.py:482` `from src.services.export_service import ExportError` + `:485-492` exception_handler。若把 ExportError 留在 export_service，新模块反向 import 即可，main.py 不动。
- **调用方全集**（grep 复核）：
  - `src/routers/export.py:19-25`（一次性 import `ExportService, ExportError, export_full_database, export_project_database, export_user_projects_database`；调用 `:116` `:133` `:154`；`except ExportError :90`）
  - `main.py:482`（仅 ExportError）
  - `backend/scripts/`：无
  - tests：`test_export_validation.py:17-19` import 三函数（`:201/:220/:251` 三例）；`test_project_import.py:1250` 函数内 `from src.services.export_service import export_project_database`（`:1309` 调用）→ **此 import 路径搬移后会 ImportError，必须同步改**
  - **patch 目标**：`test_perf_contracts.py:23-24` patch 的是 `src.services.export_service.ExportService.export_project_to_word` / `.ExportService._validate_output`（Word 路径，不受 DB 搬移影响）；未发现针对四个 DB 函数的 patch/monkeypatch。

## 4. `_add_forms_content`（:1755-2013，259 行，cx=34）

实测（AST McCabe，radon 口径）：`_add_forms_content` cx 34 / `_add_inline_table` cx 27 / `_build_unified_table` cx 27 / `_add_unified_regular_row` 18 / `_add_field_row` 18 / `_add_unified_full_row` 18 / `_add_unified_inline_band` 21 / `_classify_form_layout` 11 / `_render_field_control` 18 / `_add_log_row` 7 / `_add_label_row` 6 / `_get_option_data` 9。全文件 76 函数 total cx 492。

结构大纲：
- 序言 `:1759-1781`：空 forms 走 `_build_form_table(doc, [], form_id=None)`；排序 forms（order_index None→999999）；`sorted_visits` + `form_to_visits` 映射。
- 每表单循环 `:1785-2013`：
  - `:1786-1791` 装载/清空 `self._current_annotation_offsets`（读 `form.annotation_positions`）
  - `:1793-1799` 排序字段、读 `paper_orientation`、`_classify_form_layout`、`is_last_form`
  - mixed_landscape 分支 `:1803-1865`：`_switch_section(LANDSCAPE)` → `_add_toc_heading` → `_group_form_fields`（`[[]]`→`[]` 归一）→ 逐组 inline(`_add_inline_table`)/normal(`_build_form_table`)，可用宽恒 `LANDSCAPE_CONTENT_WIDTH_CM` → 空 groups 兜底表 → 适用访视段 → 非末表切回 PORTRAIT
  - unified_landscape 分支 `:1867-1899`（死，R1 删）
  - legacy 分支 `:1901-2011`：`force_landscape` 时切 LANDSCAPE → 同一 `_add_toc_heading` → 同一 groups 归一 → 逐组：inline 组按 `len(group)>4 and not force_portrait` 临时横切（进入/退出成对），可用宽二选一；normal 组宽随 `force_landscape`；空 groups 兜底 → 适用访视段 → 非末表切回 PORTRAIT（`:2003-2011` 的 if/else 两支**代码相同**，纯冗余）
  - `:2013` 清空注记偏移
- 跨分支局部变量：`doc/project/annotated`（参数）、`idx/form/form_fields/layout/is_last_form/groups/first_field`、`form_to_visits`、`self._current_annotation_offsets`。
- 共享片段：三个分支重复 `_switch_section + _add_toc_heading + groups 归一 + 适用访视段 + 末表判断`，仅宽度和临时横切策略不同。

建议拆分（每片 ≤50 行 / cx≤10；纯搬移）：
1. `_add_forms_content`（编排）：序言 + 循环 + 分派，预计 ~30 行 cx≈4。
2. `_prepare_form_layout(doc, idx, form, form_fields, project, annotated) -> layout`：注记偏移 + 分类（或并入编排）。
3. `_add_form_heading(doc, idx, form, annotated)`：`_add_toc_heading` 封装（三分支共用一行，收敛 3 份重复实参）。
4. `_render_mixed_landscape_form(...)`：cx≈5，~45 行。
5. `_render_legacy_form(...)`：内含 groups 循环；再抽 `_render_legacy_group(doc, group, form, layout, project, annotated)` 承载临时横切成对切换（cx≈6）。legacy 分支末尾 `:2003-2011` 的等值 if/else 直接合并（字节无差）。

## 5. Parity 与金标 harness

- 输入侧：`word_table_parity.load_preview_table_fields`（`word_table_parity.py:100-110`）接受 JSON 文件或内存 list/dict，形状 `{forms:[{name, tables:[[[cell]]]}]}`；`extract_docx_form_table_fields`（`:113+`）从 .docx 抽表并跳过含域代码段落（TOC）。「浏览器预览 JSON」生产上来自前端预览导出；**测试无需浏览器**：`test_word_table_parity.py`（4 例）全部手工内联/写 JSON 构造预览，`test_export_acrf.py` 也 import 了 `extract_docx_form_table_fields` 做断言。CLI：`python scripts/compare_word_table_parity.py <preview.json> <export.docx>`（`--allow-mismatch` 放行；退出码 0 要求 exact_cell_ratio==1.0 且表单顺序一致）。
- **确定性实测**（探针 `/tmp/export-probe/probe_determinism.py`，种 3 表单覆盖 legacy+mixed_landscape+force_landscape、log/label 行、复选、单双选横纵、单位、默认值，双跑 + 间隔 3 秒双跑）：
  - 同 2 秒窗口内两次导出：31 个 zip entry 内容 SHA256 全等、zip 元数据（date_time/external_attr/顺序）全等、**文件字节全等**（首次误报是探针比较了两个 `Path` 对象，已修正为逐字节）。
  - 间隔 3 秒两次导出：**31/31 entry 内容全等；唯一差异是每个 entry 的 zip `date_time`**（本地时间，2 秒粒度）。
  - `docProps/core.xml` 时间戳为 python-docx 模板固定值 `2013-12-23T23:15:00Z`，**非导出时刻**，确定性。
  - 未发现 rsid/随机 id 注入；aCRF 注记 docpr id 来自实例计数器 `_annotation_docpr_counter`（`:1006-1010`），生产每次请求新建 `ExportService`（`routers/export.py:69`），harness 每次导出新建实例即可对齐；annotated 双跑亦字节全等。
- **推荐 harness**：脚本内用 `create_engine("sqlite+pysqlite:///:memory:")` + `Base.metadata.create_all` 直接种数据（模板见探针），`ExportService(session).export_project_to_word(pid, path)`（默认 `bake_toc_page_numbers=False`，避免 LibreOffice 依赖），在改动前后各导一次，按 `zipfile` 逐 entry 比较**解压内容**（或 rezip 固定 `date_time=(1980,1,1,0,0,0)` 后逐字节比），并叠加 `compare_word_table_parity` 语义报告。可复用的种子工具：`test_export_service.py` 头部自带 in-memory fixture 与 `create_project/create_form/create_field_definition/create_form_field`（文件内定义）、`test_export_acrf.py` 的 codelist/option 种子、`tests/helpers.py`（API 级）。

## 6. 测试清单

| 文件 | 用例数（`def test_` 计） | 本次实跑 |
|---|---|---|
| `tests/test_export_unified.py` | 26 | 23 passed + 3 xfail |
| `tests/test_export_column_width_override.py` | 8 | 7 passed + 1 xfail |
| `tests/test_export_acrf.py` | 7 | 7 passed |
| `tests/test_export_service.py` | 43 | 43 passed |
| 合计（命令：四文件一起 `-q -ra`） | 84 | **82 passed, 4 xfailed, 9.58s**（exit 0） |
| `tests/test_export_validation.py` | 8（含 DB 导出 3 例） | 未跑（本次只读） |
| `tests/test_export_paper_orientation.py` | 12 | 未跑 |
| `tests/test_word_table_parity.py` | 4 | 未跑 |
| `tests/test_export_word_errors.py` | 4 | 未跑 |
| `tests/test_phase0_ordering_contracts.py` | 3 处 `_build_unified_segments` 直调 | 未跑 |
| `tests/test_import_service.py` | 4 处 `_get_option_labels` 直调 | 未跑 |
| `tests/test_perf_contracts.py` | 2 个 patch 目标指向 export_service.ExportService | 未跑 |

xfail 明细（reason 均注明 "unified_landscape rendering disabled by 786aaa4"）：`test_export_unified_field_order_matches_order_index`、`test_export_unified_full_row_span_equals_N`、`test_export_unified_multi_blocks_share_table_level_width`、`test_export_unified_table_column_width_override`（均为 `strict=False`）。

## 7. 风险

- **标签行底纹差异**（§2a）：legacy 标签行无 bg_color/text_color 处理，unified 副本有；合并必须以 legacy 为准，否则字节级输出变化。
- **`_render_field_control` 的 `下拉框` 分支**只有它处理；外层分派合并不可丢。其内部单/多选分支生产不可达（防御性），可留可删但删需注明。
- **`test_phase0_ordering_contracts` 3 例**依赖 `_build_unified_segments` 作为纯分段工具 —— 删函数前必须先改造这三个非 xfail 用例，否则套件假红。
- **`test_project_import.py:1250`** 的函数内 import 与 `routers/export.py:19-25` 的模块级 import 是 DB 函数搬移的必改点；`main.py:482` 是否改取决于 ExportError 去留。
- **跨栈契约触及面**（AC8 需同步 `.trellis/spec/guides/cross-stack-contracts.md`）：§316-317 填写线/`_build_unified_table` 不可达注记、§324 结构行底纹（提及 `_add_unified_full_row`）、§334/§339/§947 引用 `test_export_unified.py` 文件名；列宽常量与 `planner_cases.json` 不动；`checkbox_label`（`resolve_checkbox_label`）、日期占位（`render_date_time_placeholder`）、aCRF 注记几何（`ACRF_*` 常量 + `_load_annotation_offsets`）均不在改动路径上，但 `_add_field_row`/`_add_inline_table` 合并会重排 run/对齐写序，须以最终 OOXML 属性为准。
- **`backend-format` 将压缩本文件大量连续空行**，上面所有行号在开工时必须按函数名重锚；`legacy-cleanup` 删除 `:23/:403/:412/:413/:419/:516/:1572` 的 perf 包装还会使 `_add_forms_content`/`export_project_to_word` 各少 1-2 行。
- `_build_unified_table` 内 `table._tbl.remove(table.rows[0]._tr)`（`:2365`）删除模板首行的手法未被其他活路径使用；随分支整体删除，无外溢。
