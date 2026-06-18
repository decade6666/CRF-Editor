# fix: Word 导出按单行文本=1cm 设置单元格上下间距（不裁切多行）

## Goal

让 Word 导出的表格单元格高度由「单行文本 = 1cm」来决定：用段落上下间距把单行撑到 1cm，并把行高规则从死锁裁切改为下限模式，使多行内容自然增高且不被裁切。

## What I already know

* 行高入口：`backend/src/services/export_service.py:1938` `_apply_exact_row_height`，当前 `WD_ROW_HEIGHT_RULE.EXACTLY` + `Cm(FORM_TABLE_ROW_HEIGHT_CM)`。
* 行高常量：`export_service.py:201` `FORM_TABLE_ROW_HEIGHT_CM = 1`。
* 调用点共 11 处：`:500, 824, 1551, 1676, 1771, 1812, 2013, 2048, 2083, 2264, 2314`。
* 正文字体：`FONT_EAST_ASIA = "SimSun"`（`:194`），各 cell run `Pt(10.5)`。
* 普通字段行段落间距：`space_before/space_after = Pt(5.25)`、`line_spacing = 1.0`（`:1579-1583`、`:1635-1645`）。
* 节级行网格：`docGrid linePitch = 312 twips = 15.6pt`（`:305`），影响单行净高。
* 换算：1cm = 28.3465pt = 567 twips。
* strict parity（`word_table_parity.py`）只比对文本，不比对高度——本任务不动文本，parity 应保持全绿。

## Assumptions (temporary)

* 单行文本净高取 `SINGLE_LINE_HEIGHT_PT = 15.6pt`（与 docGrid 对齐）；为消除 snapToGrid 不确定性，正文行距改为固定值 `EXACTLY 15.6pt`。
* 上下间距 `CELL_VPAD_PT = (28.3465 − 15.6) / 2 ≈ 6.37pt`，替换现有 `5.25`。
* 行高规则改 `AT_LEAST`（保留 1cm 下限）：单行恰好 1cm，多行增高不裁切。
* 封面表（`:500`）、目录矩阵表（`:824`）均为单行，改 `AT_LEAST` 视觉不变，可一并生效。
* `SINGLE_LINE_HEIGHT_PT=15.6` 是推算值，GPT 须在真实 Word 实测后微调 `CELL_VPAD_PT` 使量测行高=1cm。

## Open Questions

* 前端预览行高（`useRowResize.js` px 拖拽、`SimulatedCRFForm.vue`）是设计器独立特性，与导出几何非 strict-parity 项，本任务不动；若要预览同步呈现 1cm 另开任务。

## Requirements

### R1 行高规则改为下限模式
* `_apply_exact_row_height`（`:1938`）：`WD_ROW_HEIGHT_RULE.EXACTLY` → `WD_ROW_HEIGHT_RULE.AT_LEAST`，保留 `Cm(1)` 作为下限。
* 函数名保留原名只改实现，缩小 diff；11 处调用点无需改签名。

### R2 新增间距常量
* 类常量区（`:194-201` 附近）新增：
  ```python
  SINGLE_LINE_HEIGHT_PT = 15.6
  CELL_VPAD_PT = (FORM_TABLE_ROW_HEIGHT_CM * 28.3465 - SINGLE_LINE_HEIGHT_PT) / 2
  ```

### R3 统一段落上下间距 + 固定行距
* 全量替换表格 cell 段落的 `space_before/space_after = Pt(5.25)` → `Pt(self.CELL_VPAD_PT)`（搜索 `Pt(5.25)`）。
* 正文段落行距：`line_spacing = 1.0` → 固定值
  ```python
  para.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
  para.paragraph_format.line_spacing = Pt(self.SINGLE_LINE_HEIGHT_PT)
  ```
  需 `from docx.enum.text import WD_LINE_SPACING`（确认现有 import）。
* 涉及：`_add_unified_regular_row`（`:1579-1645`）、`_add_unified_full_row`、inline band、matrix/cover 同类段落。

### R4 多行单元格不裁切
* 保持 `vertical_alignment = CENTER`；因规则已 `AT_LEAST`，纵向单选/多选与多 `default_lines` 行随行数增高，每行净高 = `SINGLE_LINE_HEIGHT_PT`。

## Validation

```bash
cd backend && python -m pytest tests/test_export_paper_orientation.py tests/test_word_table_parity.py -q
```

* parity 应全绿（未动文本）。
* 新增回归用例：解析导出 `.docx`，断言表单字段行 `trHeight w:hRule="atLeast"` 且 `w:val≈567`（twips），单行段落 `space_before/after` = 新常量值。
* 人工确认：打开导出 Word，单行字段行实测 1cm；纵向多选行不被裁切。

## Out of scope

* 不改文本内容与 strict parity 契约；不改前端预览/设计器行高；不改纸张方向逻辑。

## Done checklist

* [ ] R1–R4 完成
* [ ] 新增行高/间距回归测试通过
* [ ] `test_export_paper_orientation.py`、`test_word_table_parity.py` 全绿
* [ ] 真实 Word 实测单行=1cm（必要时微调 `CELL_VPAD_PT`）
* [ ] 同步更新 `backend/.claude/CLAUDE.md` 导出小节与变更记录
