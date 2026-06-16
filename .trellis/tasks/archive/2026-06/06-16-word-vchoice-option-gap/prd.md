# fix: Word 导出纵向选项关闭 snapToGrid，消除选项首项间距不均

## Goal

让 Word 导出的纵向单选/多选字段，每个选项之间的纵向间距一致（消除「首项到第二项间距偏大」），且不破坏单行 1cm 行高、EXACTLY 15.6pt 行距与前端 3pt 预览契约。

## What I already know（实测确认）

* 渲染入口：`backend/src/services/export_service.py` `_render_vertical_choices`（约 `:2585` 循环），所有横/纵选项共用，仅此函数对首项做 `before=0` 特殊处理。
* 段落实测：临床意义 cell 段落数 = 选项数（无多余空段落），间距 `before=0/3/3`、`after=0`、`line=EXACTLY 15.6pt`。gap(项1→项2)=项2.before=3pt，gap(项2→项3)=项3.before=3pt——**存储值本就对称**。
* 行网格：节级 `w:docGrid type=lines linePitch=312`（=15.6pt，`export_service.py` `:344`），全文无 `snapToGrid` 覆盖 → Word 默认 `snapToGrid=1` 生效。
* 跨栈契约常量：`VERTICAL_OPTION_GAP_PT=3`、`SINGLE_LINE_HEIGHT_PT=15.6`、`CELL_VPAD_PT`；前端 `.choice-group--vertical .choice-atom + .choice-atom { margin-top: 3pt }` 与 `formFieldPresentation.test.js` 锁 3pt。
* strict parity（`word_table_parity.py`）只比对文本不比对间距，本任务不动文本，parity 保持全绿。
* 排除项：合并空段落假设不成立——最大 inline block `M==N` 不触发列 merge，cell 无残留空段落。

## Root cause

`docGrid` 行网格 + Word 默认 `snapToGrid=1` 把段落 `space_before` 吸附到整行网格：首项 `before=0`（正落网格线）与其余项 `before=3pt`（被吸附到下一条网格线）在 Word 中渲染为「首间距偏大」，而段落存储间距其实一致。属 Word 渲染层产物，非存储值不均、非空段落。

## Requirements

### R1 关闭纵向选项段落的网格吸附 ✅
* 新增 helper `_disable_snap_to_grid(paragraph)`（`export_service.py:235`）：向 `pPr` 写 `<w:snapToGrid w:val="0"/>`，用 `pPr.insert_element_before(...)` 按 CT_PPr 合法顺序插入（spacing/ind/jc 等之前），有/无 spacing 均合法、幂等。
* 在 `_render_vertical_choices` 选项循环中对**每个**选项段落（首项与非首项一致）调用。
* 不改 `before=0/3/3`、`after=0`、EXACTLY 15.6pt：关闭吸附后精确间距原样呈现 → 各选项均匀 3pt。

### R2 回归测试锁定契约 ✅
* `tests/test_export_paper_orientation.py::test_export_vertical_choice_rows_can_expand_without_extra_option_padding`：在原 before/after/line 断言外，新增「每个选项段落 `w:pPr/w:snapToGrid` val=0」。
* `tests/test_export_unified.py::test_export_vertical_choice_options_have_inter_option_gap`：保留 before=0/3 断言（存储值本就正确），新增所有选项段落 `snapToGrid=0`。

### R3 文档同步（待办）
* 更新 `backend/.claude/CLAUDE.md` 导出小节：补「纵向选项段落 `snapToGrid=0` 以抵消 docGrid 行网格吸附」一句及变更记录。

## Validation

```bash
cd backend && python3 -m pytest tests/test_export_paper_orientation.py tests/test_export_unified.py -q
cd backend && python3 -m pytest -q
```

* 已执行：窄测试 **29 passed, 3 xfailed**；全量 **479 passed, 4 xfailed**。
* XML 级核验：三个选项段落均带 `snapToGrid w:val="0"` 且位于 spacing 前；helper 在「有 spacing / 仅 jc / 空 pPr」三态顺序合法且幂等。
* 人工（必须，环境内无 Word 无法代替）：导出同类数据 `.docx`，确认「临床意义」「异常有临床意义」等列首 1、2 项间距与后续一致、行高可增不裁切、相邻普通单元格 1cm 单行外观未破坏；建议 LibreOffice 抽查一次。

## Out of scope

* 不改文本内容与 strict parity 契约；不改前端预览/3pt CSS 契约；不改横向选项（不走多段落间距模型）；不动 `docGrid` 与其余段落的网格行为。
* GPT 评审指出的 `doc.tables[2]` 硬编码与文本作 dict key 为低优先级测试脆弱点，非阻塞，本任务暂不重构。

## Done checklist

* [x] R1 helper + 调用落地（有序插入，幂等）
* [x] R2 两处 XML 级回归断言
* [x] 窄测试 + 全量回归全绿
* [x] R3 同步 `backend/.claude/CLAUDE.md` 导出小节与变更记录
* [x] 真实 Word 视觉验收（首 1、2 项间距与后续一致、不裁切）— 用户确认无问题
* [x] 验收后按 `fix(export): ...` 提交 — `2bd838c`
