# PRD — 修复 docx 导入页码匹配与缓存

## Goal
修复 Word(docx) 导入截图证据面板的两个缺陷，使每个表单定位到**真实内容起始页**，并让重复打开预览面板不再重复计算页码。用户价值：截图证据面板页码正确、预览响应更快。

## Background
- 功能链路：`preview_docx_import`（解析 docx → 启动截图任务）→ 后台 `DocxScreenshotService._run`（docx→PDF→PNG，检测表单/字段页码）→ 前端打开截图面板调用 `start_docx_screenshot` → `get_screenshot_status` 返回 `page_ranges`/`field_pages`。
- `page_ranges` 形如 `{表单名: [start, end]}`，是 `(PDF, form_names)` 的纯函数，前端按表单名消费；本次修复保持该契约不变，仅让取值正确、避免重复计算。
- 运行服务器为 Linux + LibreOffice；截图 PNG 与页码检测来自**同一次** LibreOffice 渲染的 PDF，故大纲页号与 PNG 页号严格一致（无 Word/LibreOffice 分页 ±1 问题）。

## Confirmed Facts (ground truth)
实测 `image/标准eCRF.docx`（LibreOffice 渲染，PyMuPDF 读取）：

**缺陷1 — 无缓存（`docx_screenshot_service.py:109-111`）**
- `start()` 在 `status=="done"` 时无条件调用 `_refresh_page_ranges()`（`:126`），重跑 `_detect_form_pages`（`:377`）+ `_detect_field_pages`（`:466`）：每次重开 PDF、提取全部页文本、O(表单数×页数) 子串匹配。
- 前端每次打开截图/预览面板都调用 `start_docx_screenshot`（`routers/import_docx.py:604`）→ 命中该分支，重复白算。
- `page_ranges` 仅依赖 `(PDF, form_names)`，无按签名的记忆化。

**缺陷2 — 全部表单匹配到索引页（`docx_screenshot_service.py:420` `if len(text) < 400: return False`）**
- p2/p3 是真目录：3067/2420 字，命中 29/25 个表单名 → `is_toc_page=True`（正确跳过）。
- p4/p5/p6 是紧凑"表单访视分布图"索引页：各命中 11/14/12 个表单名，但仅 238/295/211 字 → 被 `<400` 提前判为内容页。
- 后果：前约 35 个表单的"首个非目录命中"全部坍缩到 p4/p5/p6。例：`知情同意` 被判为 `[4,4]`，真值应为 **p7**。
- 根因：目录/索引页判据被长度前置一票否决；长度是密度的反指标，不能凌驾于命中数信号之上。

**可复用的根本解法证据 — PDF 大纲精确可用**
- `doc.get_toc()` 返回 55 条大纲，含精确页号：`L1 p4 '表单访视分布图'`、`L2 p7 '1. 知情同意'`、`L2 p8 '2. 访视日期'`、`L2 p10 '4. 受试者特征'`、`L2 p19 '10. 体重'` …
- 大纲条目标题带序号前缀（`1. `、`7.1. `）；去前缀后与 `form_name` 精确匹配可避开子串冲突（`体重` vs `身高体重`）。
- `toc_pagination.py` 已有同类"读 PDF 大纲页号"模式（用 pypdf），本任务用 PyMuPDF `get_toc()` 更简洁。

## Requirements

### R1 — 缺陷2：大纲优先 + 文本兜底的表单页码检测
- R1.1 `_detect_form_pages` 优先读取 PDF 大纲（`doc.get_toc()`）：对每个 `form_name`，将大纲条目标题**去除序号前缀**（`^\s*\d+(\.\d+)*\.?\s*`）后与 `form_name` 归一化精确匹配，命中则起始页取该条目页号。
- R1.2 起止页：末页 = 排序后下一个大纲条目页号 - 1；最后一个表单末页 = 总页数；`end >= start` 兜底。
- R1.3 兜底：大纲缺失、为空、或某表单未在大纲命中时，回退到文本匹配路径；文本路径的目录判据必须已按 R1.4 修正。
- R1.4 修正 `is_toc_page`：以**独立命中表单名数量/占总表单比例**为主判据，长度仅作 2–3 命中灰区的次要 tiebreaker；删除 `len(text) < 400` 的前置一票否决。子串去重按标题长度降序处理（`体重` 不吞并 `身高体重`）。
- R1.5 `field_pages` 逻辑不变，但因 `page_ranges` 现在正确，字段将在正确的表单范围内匹配（受益方，不单独改算法）。

### R2 — 缺陷1：页码检测结果记忆化
- R2.1 在 `ScreenshotTask` 记录上次检测所用的 `form_names` 签名（`tuple(sorted(form_names))` 或其哈希）。
- R2.2 `start()` 的 `done` 分支：仅当传入 `forms_data` 的签名与已存签名**不同**时才调用 `_refresh_page_ranges`；相同则直接复用缓存结果。
- R2.3 线程安全：签名比较与写入在现有 `_tasks_lock` 保护下进行，不引入新的全局锁竞争。
- R2.4 首次 `_run` 完成后写入签名，保证 `_run` 与 `_refresh` 两条写入路径签名口径一致。

### R3 — 契约与回归
- R3.1 `page_ranges`/`field_pages` 的形状与 `ScreenshotStatusResponse` 契约不变，前端 `DocxScreenshotPanel.vue` 无需改动。
- R3.2 检测函数重构为可注入纯输入（页文本列表 + 大纲条目），使单测不依赖 LibreOffice。
- R3.3 现有 `tests/test_docx_screenshot_service.py`（后端选择/转换/失败语义）全部保持通过。

## Acceptance Criteria
- AC1（缺陷2 真值）：对 `标准eCRF.docx`，`知情同意` 起始页 = 7、`访视日期` = 8、`人口学资料` = 9、`受试者特征` = 10（与 `doc.get_toc()` 一致）；**没有任何表单**的起始页落在 p2–p6（目录/索引区）。
- AC2（紧凑索引页判定）：单测中，一个约 250 字、命中 12 个独立表单名的合成页文本被判为索引/目录页（`is_toc_page=True`）。
- AC3（内容页不误伤）：一个约 1500 字、仅交叉引用 2 个其他表单名的合成内容页被判为非目录页。
- AC4（子串去重）：表单集合含 `体重` 与 `身高体重` 时，仅出现 `身高体重` 的页对 `体重` 不计独立命中。
- AC5（缓存）：`start()` 在 `done` 且 `form_names` 签名不变时不重跑检测（以 mock 计数断言 `_detect_form_pages` 调用次数为 0）；签名变化时重跑一次。
- AC6（无 LibreOffice 单测）：R1.4/R2 的核心断言可在纯 pytest 下运行，不启动 LibreOffice。
- AC7（回归）：`cd backend && python -m pytest tests/test_docx_screenshot_service.py -q` 全绿；完整后端套件不因本改动新增失败。

## Out of Scope
- 不改 docx→PDF→PNG 转换、后端选择、失败语义。
- 不改前端截图面板组件（契约不变）。
- 不改 Word 导出侧 TOC/`toc_pagination.py`。
- 不处理"源 docx 完全无标题样式且无大纲"以外的排版异常（此类走文本兜底即可，不追加更复杂结构解析）。
- 不引入持久化/跨进程缓存（仅进程内、按 temp_id + 签名）。

## Technical Notes
- 大纲标题匹配优先级：去序号前缀后归一化**精确**匹配 > 归一化 `contains`（取最长标题）> 交由文本兜底。`L1 表单访视分布图` 不匹配任何表单名，天然被忽略。
- 大纲页号与截图 PNG 同源（同一 PDF），页号可作为精确断言，无需 ±1 容差。
- 签名口径：`_run` 与 `_refresh_page_ranges` 都基于 `forms_data` 中的 `name` 列表按 `sorted` 取签名，避免两条路径口径漂移。
- 多 CLI 协作记录：Antigravity(gemini-pro-agent) 独立复核，结论一致（密度/占比主导、子串降序去重、依赖注入单测）；Codex 本次超时无输出（exit 143），按 fallback 规则由 Claude 直接完成，本会话不再重试。
