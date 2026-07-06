# Implement — 修复 docx 导入页码匹配与缓存

## 执行清单（按序）

1. **测试先行（RED）** — `backend/tests/test_docx_screenshot_service.py` 追加纯函数用例（不启动 LibreOffice）：
   - `test_is_toc_page_flags_compact_index`（AC2）：~250 字 + 12 个独立表单名 → True。
   - `test_is_toc_page_ignores_content_cross_reference`（AC3）：~1500 字 + 2 个交叉引用 → False。
   - `test_is_toc_page_substring_dedup`（AC4）：`{体重, 身高体重}`，页仅含 `身高体重` → `体重` 不计独立命中。
   - `test_map_forms_via_outline_uses_true_pages`（AC1 纯函数版）：喂合成 outline（`[('1. 知情同意',7),('2. 访视日期',8),('4. 受试者特征',10),...]`）→ 起始页 7/8/10，无表单落在 ≤6。
   - `test_start_skips_redetect_when_signature_unchanged`（AC5）：mock/monkeypatch `_detect_form_pages` 计数；done 任务同签名再 `start` → 计数为 0；改一个 name → 计数 +1。
   - 确认新用例先失败。

2. **实现 R1.4** — 修正 `is_toc_page`（`docx_screenshot_service.py:411-`）：删除 `:420` 的 `len(text) < 400` 前置返回，改为 D3 密度/占比判据 + 子串降序去重。抽为可独立测试的形态（接收 `text` 与 `form_names`）。

3. **实现 R1.1/R1.2/R1.3** — 重构 `_detect_form_pages`（`:377`）：
   - 新增 `_read_pdf_outline(pdf_path)`（`doc.get_toc(simple=True)` → `[(title,page)]`，异常/空返回 `[]`）。
   - 新增纯函数 `_map_forms_via_outline(form_names, outline, total_pages)`（去序号前缀 → 归一化精确/contains 匹配 → 边界用全部 outline 页号）。
   - 新增/抽出 `_map_forms_via_text(targets, page_texts, total_pages)`（现有主体，仅处理 unresolved，使用修正后的 `is_toc_page`）。
   - `_detect_form_pages` 变薄编排：outline 优先 → unresolved 或空则文本兜底 → 合并、按起始页排序、重算 end。

4. **实现 R2** — 缓存签名：
   - `ScreenshotTask` 增 `detect_signature`（`:41-45` 附近 dataclass）。
   - 加 `_forms_signature(forms_data)`。
   - `_run`（`:204-207`）检测后写签名。
   - `start()` done 分支（`:109-111`）改为签名比较后再决定是否 `_refresh_page_ranges`。

5. **GREEN + 回归**：
   - `cd backend && python -m pytest tests/test_docx_screenshot_service.py -q`（新用例 + 原有全过，AC2-AC7）。
   - LibreOffice 存在时的集成断言（AC1 真值）：可加 `@pytest.mark.skipif(find_libreoffice() is None)` 的用例，用 `image/标准eCRF.docx` 断言 `知情同意`≥7 且无表单落在 p2-6；CI 无 LibreOffice 时自动跳过。

6. **完整后端套件**：`cd backend && python -m pytest -q`，确认无新增失败（AC7）。

7. **文档同步**：更新 `backend/.claude/CLAUDE.md` 服务概述中 `docx_screenshot_service.py` 一行（补"大纲优先页码检测 + 按表单签名的检测结果缓存"），及根 `.claude/CLAUDE.md` 变更日志。

## 验证命令
```bash
cd backend && python -m pytest tests/test_docx_screenshot_service.py -q
cd backend && python -m pytest -q
```

## 风险与回滚点
- 风险1：某些 docx 大纲标题与 form_name 差异大（如手工编号、空格差异）→ 由 contains 兜底与文本兜底兜住；单测覆盖精确/contains/未命中三路。
- 风险2：`is_toc_page` 阈值误伤 → AC3 内容页用例 + AC2 索引页用例双向锁定；灰区 2-4 命中用 `len<500` 兜底。
- 风险3：缓存签名口径漂移（`_run` vs `_refresh`）→ 统一走 `_forms_signature`，R2.4 强制两路一致；AC5 用例锁定。
- 回滚：改动集中于 `docx_screenshot_service.py` 单文件，`git checkout -- backend/src/services/docx_screenshot_service.py` 即可，无迁移/契约变更。

## 完成前检查
- [ ] 新增单测全部 RED→GREEN
- [ ] `tests/test_docx_screenshot_service.py` 全绿
- [ ] 完整后端套件无新增失败
- [ ] 前端未改动、契约未变
- [ ] 文档同步（backend + root CLAUDE.md）
