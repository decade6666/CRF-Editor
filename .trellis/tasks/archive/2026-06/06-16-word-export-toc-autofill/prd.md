# feat: Word 导出目录预渲染（打开即见 + 点击跳转，页码 Word 更新后精确）

## Goal

让导出的 Word `.docx` 在**零点击**场景下就能看到目录条目，并可点击跳转到对应标题；在 **MS Word** 中执行一次更新域/更新目录后，页码应变为精确值。

本次目标不再是“依赖阅读器首次打开时自动生成整份目录”，而是把目录条目在导出阶段就写进文档，解决当前“目录区空白 / 不自动生成”的问题。

## Background / Root cause

### 已确认现状

* `backend/src/services/export_service.py` 中当前已具备两项正确的 OOXML 条件：
  * `_add_toc_placeholder()` 已写入合法 TOC 域（`begin → instrText → separate → result → end`）。
  * `_enable_update_fields_on_open()` 已写入合法顺序的 `w:updateFields=true`。
* 相关回归测试已能证明：域结构正确、`updateFields` 存在且位于 `w:compat` 之前。

### 为什么仍然“没有自动目录”

1. **原生 TOC 域不是静默生成机制**
   * Word 桌面版通常只会在打开时提示“是否更新域”，不会无提示自动生成。
   * WPS / LibreOffice / 网页 / 手机等兼容阅读器经常忽略 `updateFields`。
2. **精确页码必须依赖排版引擎分页**
   * 纯 `python-docx` 生成阶段拿不到最终页码。
   * 因此即使目录条目可预渲染，页码也只能通过 Word 更新域后精确。

### 结论

纯“TOC 域 + updateFields”方案永远做不到“打开即见完整目录”。

要满足当前需求，应改成**混合式方案**：

* 导出时就预渲染目录条目与跳转锚点；
* 继续保留 Word 原生 TOC / PAGEREF 域与 `dirty + updateFields`，用于 Word 后续刷新页码。

## Requirements

### R1 统一标题创建：打书签并收集 TOC 条目

文件：`backend/src/services/export_service.py`

新增统一 helper（建议名：`_add_toc_heading(doc, text, level=1)`）：

* 内部调用 `doc.add_heading(text, level)`。
* 继续复用 `_set_run_font()` 统一字体。
* 在标题段内插入唯一书签：`w:bookmarkStart / w:bookmarkEnd`，名称形如 `_Toc00000001`。
* 同时记录到实例级 `self._toc_entries`，元素至少包含：`text`、`level`、`bookmark_name`。

将当前 4 处 `Heading 1` 统一收口：

* 访视分布图标题；
* mixed_landscape 表单标题；
* unified_landscape 表单标题；
* legacy 表单标题。

### R2 改造 `_add_toc_placeholder()`：只预留外层 TOC 域壳与插入点

文件：`backend/src/services/export_service.py`

保留：

* 「目录」标题段；
* 空行；
* 外层 TOC 域指令：`TOC \o "1-3" \h \z \u`。

改造为：

* 起始段只写 `begin(dirty=1) → instrText → separate`；
* 保存该段落引用（如 `self._toc_field_paragraph`），供后续插入目录结果；
* 不立即写最终 `end`，而是在回填完最后一条目录结果后再补上；
* 可保留极简兜底占位，但不再依赖阅读器帮我们生成条目。

### R3 正文后回填目录结果：零点击可见、可点击跳转

文件：`backend/src/services/export_service.py`

新增 helper（建议名：`_populate_toc(doc)`），在 `_add_forms_content()` 执行完成之后调用。

对 `self._toc_entries` 中的每个条目生成一段目录项：

* 通过 `w:hyperlink w:anchor="_Toc..."` 指向对应标题书签；
* 显示标题文本；
* 使用右对齐制表位 + 点前导符；
* 页码区写入 `PAGEREF _Toc... \h` 域；
* 每个 PAGEREF 域的 `begin` 也带 `w:dirty="1"`。

最终效果：

* 不更新域时，目录条目已可见；
* 点击目录条目即可跳转；
* Word 更新域后，PAGEREF 页码刷新为精确值；
* 非 Word 阅读器至少不再出现“目录空白”。

### R4 保留 `updateFields=true`，但只把它视为“页码刷新提示机制”

文件：`backend/src/services/export_service.py`

* 保留 `_enable_update_fields_on_open()` 当前合法顺序实现；
* 外层 TOC 域与各 PAGEREF 域统一带 `dirty=1`；
* 在实现和文档中明确：`updateFields` 主要用于 Word 打开后刷新页码，不再承担“生成整份目录”的主职责。

### R5 文档同步

文件：

* `backend/.claude/CLAUDE.md`
* `README.md`
* `README.en.md`（如中文 README 变更对用户可见行为有影响）

需要同步说明：

* 目录由“纯域占位”升级为“预渲染条目 + 书签跳转 + PAGEREF 页码，外层仍包 TOC 域”；
* 零点击保证的是“目录条目可见 + 可点击跳转”；
* 页码在 Word 更新目录/字段后精确。

## Acceptance Criteria

* [ ] 导出的 `.docx` 在不更新域的情况下，目录条目已经可见。
* [ ] 目录条目点击后可跳转到访视图标题或对应表单标题。
* [ ] 在 MS Word 中更新目录/字段后，页码变为精确值。
* [ ] 仍不新增 section / table。
* [ ] `extract_form_headings(doc)` 结果不被目录区污染。
* [ ] `word_table_parity.FORM_HEADING_RE` 不误命中目录条目。

## Non-goals / Known limitation

### 本次不做

* 不引入 LibreOffice headless / Word COM / 商业布局引擎来回灌精确页码。
* 不改前端。
* 不改标题层级（继续使用 `Heading 1` 作为目录数据源）。
* 不改 strict parity、列宽规划、纵向选项 `snapToGrid` 等既有契约。

### 已知限制（必须如实说明）

* **零点击可保证**：目录条目可见、可点击跳转。
* **零点击不能精确保证**：页码仍需 Word 更新域后才精确。
* 如果未来需求升级为“导出即带精确页码且完全零更新”，必须单独引入真实排版/自动化引擎，这超出本次范围。

## Tests

文件：`backend/tests/test_export_service.py`

新增/调整测试建议：

1. `test_export_headings_have_unique_toc_bookmarks`
   * 每个目录源标题都带唯一 `_Toc...` 书签。
2. `test_export_toc_prerendered_entries_match_headings`
   * 目录区超链接条目数与标题数一致；
   * 每个 `w:hyperlink@anchor` 指向真实书签。
3. `test_export_toc_entries_have_pageref`
   * 每条目录项都有 `PAGEREF _Toc... \h` 指令。
4. `test_export_toc_field_well_formed`
   * 外层 TOC 域 `begin(dirty=1) / instrText / separate / ... / end` 顺序合法；
   * `end` 位于最后一条目录项之后。
5. 保留现有：`test_export_sets_update_fields_on_open`
   * 继续断言 `updateFields` 存在且位于 `compat` 之前。
6. 回归：
   * `extract_form_headings(doc)` 不变；
   * tables / sections 数量不变。

## Validation

```bash
# 新增测试先 RED 后 GREEN
cd backend && python3 -m pytest tests/test_export_service.py -q

# 导出 + parity 全量回归
cd backend && python3 -m pytest tests/test_export_service.py tests/test_export_paper_orientation.py tests/test_export_unified.py tests/test_export_validation.py tests/test_word_table_parity.py -q
```

人工验收（必须）：

1. 导出一个包含访视图和多个表单的项目；
2. 直接打开 `.docx`，不做任何更新；
3. 验证目录条目已可见；
4. 验证点击目录项能跳转到对应标题；
5. 在 Word 中执行一次更新目录/字段；
6. 验证页码变为精确值；
7. 再用 WPS / LibreOffice 抽查：确认至少条目可见、跳转可用。

## Critical files

* `backend/src/services/export_service.py`
* `backend/tests/test_export_service.py`
* `backend/src/services/word_table_parity.py`（只读核对，必要时最小改动）
* `backend/.claude/CLAUDE.md`
* `README.md`
* `README.en.md`

## Done checklist

* [ ] 标题 helper 收口完成（书签 + TOC 条目收集）
* [ ] `_add_toc_placeholder()` 改为 TOC 域壳
* [ ] `_populate_toc()` 预渲染目录条目完成
* [ ] TOC / PAGEREF 域统一加 `dirty=1`
* [ ] 自动化测试补齐并通过
* [ ] 导出 / parity 回归通过
* [ ] 文档同步完成
* [ ] Word / WPS / LibreOffice 人工验收完成
