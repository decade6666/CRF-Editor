# 修复 docx 截图页码匹配后续边界问题

## Goal

记录并后续修复 docx screenshot 页码匹配修复后的残余边界问题，确保截图页码匹配、字段定位缓存与 outline 页范围计算在泛化文档下保持正确。

## Requirements

- 修复短表单名与长表单名的子串冲突，避免 `体重/身高体重` 这类名称在 outline 匹配和文本 fallback 中把短名错误映射到长名页面。
- 修复 outline boundary 计算，只允许真正参与表单起始页判断的页码进入页范围截断逻辑，不能被表单内子标题或无关 outline 条目提前截断。
- 修复 screenshot 缓存签名与 `field_pages` 复用契约不一致的问题；当表单名不变但字段标签或字段顺序变化时，不能返回陈旧字段定位结果。
- 评估并收敛 `_refresh_page_ranges` 在 `_tasks_lock` 内执行的阻塞风险，至少明确是否需要把重计算移出锁区或拆分缓存刷新路径。
- 为上述修复补充最小可复现回归测试，并保留对 `标准eCRF.docx` 当前成功路径的保护。

## Acceptance Criteria

- [ ] `_map_forms_via_outline()` 与 `_map_forms_via_text()` 对 `体重/身高体重` 等子串冲突场景能返回不同且正确的起始页，不再把短名误映射到长名页面。
- [ ] 含有表单内子标题的 PDF outline 不会把父表单页范围提前截断；字段页检测仍能在完整表单范围内搜索。
- [ ] 当 `forms_data` 的表单名集合不变、但字段标签或字段顺序变化时，`field_pages` 不会复用陈旧缓存。
- [ ] 新增回归测试覆盖：outline 子串冲突、text fallback 子串冲突、outline 子标题截断、same-formnames-different-fields 缓存刷新。
- [ ] 原有 `标准eCRF.docx` 浏览器验证结论不回退：`知情同意` 仍指向第 7 页，`体重` 仍指向真实内容页而非目录/索引页。

## Notes

- 本任务是当前 `07-03-docx-page-match-cache` 的后续收尾任务，计划在新窗口继续处理。
- 当前已知证据来源：本轮 codex/agy 审查结论，以及主会话中的最小复现脚本。
