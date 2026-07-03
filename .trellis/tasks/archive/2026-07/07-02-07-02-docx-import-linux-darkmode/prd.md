# PRD：修复 Word 导入两处问题（Linux 截图支持 + 暗色模式预览）

> Task: 07-02-07-02-docx-import-linux-darkmode
> 状态：Planning（PRD）
> 来源：用户反馈「word文档导入存在问题」；codex(gpt-5.4) + antigravity(gemini-3.1-pro-low) 双模型独立分析 + 用户决策确认。

## 1. 背景与问题

Word 导入流程：上传 docx → 左侧展示原始文档截图（人工核对证据面板）+ 右侧展示导入解析后的 CRF 表单预览。当前两处缺陷：

- **P1 原始文档截图仅支持 Windows**：`docx_screenshot_service.py` 通过 `docx2pdf`→MS Word COM（`pythoncom`）完成 docx→PDF，仅 Windows 可用。Linux 服务器上 `import pythoncom` 直接抛错，界面显示「当前环境不支持 Word 截图，请在安装了 MS Word 的 Windows 环境中使用该功能」，无任何 fallback。
- **P2 右侧预览暗色模式显示异常**：`SimulatedCRFForm.vue` 的 scoped CSS 全部硬编码浅色值（`#1a1a1a`/`#d4d4d4`/`#fafafa` 等），未接入主题变量。暗色模式下右侧成为「浅色孤岛」，与整体界面割裂。

## 2. 目标

- P1：在 Linux 服务器上启用原始文档截图能力，用 LibreOffice headless 替代 MS Word COM 完成 docx→PDF；PDF→PNG/文本定位逻辑（PyMuPDF）保持不变。
- P2：右侧导入效果预览在暗色模式下正确渲染，视觉上与「导入模板效果」保持一致（白纸质感）。

## 3. 已确认的关键决策（用户拍板）

| 决策项 | 结论 |
| --- | --- |
| 中文字体 | **本任务内安装**（`fonts-noto-cjk` 类）；当前系统 0 个中文字体，否则 LibreOffice 中文渲染为方块，截图失去核对价值 |
| docx→PDF 后端选择 | **auto 探测 + 可显式配置**：默认按平台自动探测（Windows→MS Word，Linux→LibreOffice），并提供后端 YAML/env 配置项 `word/libreoffice/auto`；不暴露到前端设置页 |
| Linux 截图定位 | **参考渲染，可接受细微差异**：允许与 MS Word 有少量版式/分页差异；字段点击定位基于生成的 PDF 自洽，不影响对应关系。**不加 UI 提示文案** |
| 暗色模式修复方向 | **方向 B：保持白纸预览**：表单区强制白底黑字（纸质隐喻），对齐现有 `.word-page`/`TemplatePreviewDialog`；仅外围容器/滚动区/阴影适配暗色 |

## 4. 需求范围

### 4.1 P1 — Linux Word 截图

- 保留 Windows MS Word COM 路径不变，新增 LibreOffice headless 路径。
- 平台无关部分（PyMuPDF 的 PDF→PNG、PDF→文本页定位 `_detect_form_pages`/`_detect_field_pages`）完全复用，不重写。
- LibreOffice 调用必须**每次转换使用独立 `UserInstallation` profile**，避免共享 profile 锁冲突导致「无输出文件」；复用项目现有 `toc_pagination.py` 的 LibreOffice 调用模式（`find_libreoffice` + subprocess），不复制两套命令。
- 并发保持现有 `_semaphore=2`；LibreOffice 单次 docx→PDF 设 90–120s 硬超时，超时/失败写日志（stderr/stdout 摘要）并进入 `failed`。
- 失败错误信息去掉写死的「MS Word」，改为中性描述（如「无可用的文档渲染后端」/「文档渲染失败」）。
- 部署环境安装中文字体（宋体/黑体/仿宋/楷体覆盖）。

### 4.2 P2 — 暗色模式白纸预览

- `SimulatedCRFForm.vue` 引入组件内「paper token」（如 `--crf-paper-bg/#fff`、`--crf-paper-text/#1a1a1a`、`--crf-paper-border/#d4d4d4`、`--crf-paper-hover/#f0f9ff`、`--crf-paper-structure-bg/#fafafa`），纸面语义在亮/暗主题下保持白纸不变。
- `DocxCompareDialog.vue` 右侧滚动区提供暗色画布/留白，让白纸成为「被展示的对象」。
- 不修改 `main.css` 全局主题变量、不修改后端表单数据接口、不大改 `TemplatePreviewDialog.vue`（仅作样式对齐参考）。

### 4.3 前端文案

- `DocxScreenshotPanel.vue`：加载态/失败兜底文案从「正在调用 Word 渲染」「请确认已安装 MS Word」改为不绑定具体引擎的中性文案。

## 5. 非目标（Out of Scope）

- 不改 PyMuPDF 的 PDF 渲染/文本提取主逻辑。
- 不改 import_docx 接口 schema（除非需返回 backend 名称做调试，另议）。
- 不改数据库、导入解析规则、AI 复核链路。
- 不做多 worker 部署改造（当前单 worker，进程内任务状态无风险）。
- 不做前端引擎选择设置页。

## 6. 验收标准

### P1 Linux 截图
- [ ] Linux 上传含中文/多表单/分页的 `.docx`，`/screenshots/start` 后状态从 `starting/running` 到 `done`，`page_count>0`，PNG 可正常访问。
- [ ] 截图中文正常显示（非方块），版式可供人工核对。
- [ ] 跨页表单 `page_ranges` 正确收窄；点击右侧字段（覆盖中文字段名、日志行、标签行三类）左侧滚到正确页。
- [ ] 同时发起 2 个截图任务均成功，第 3 个等待而非 silent failure；无 `soffice.bin` 僵尸进程残留，临时 profile 目录转换后清理。
- [ ] 隐藏/移除 `soffice` 或制造超时 → 状态进入 `failed`，错误信息不再误导到「请安装 MS Word」。

### P2 暗色模式
- [ ] 切换暗色主题时，右侧「导入效果」呈现为暗色容器中的白纸页面，语义接近模板预览，而非整块浅色面板铺满。
- [ ] 表格文字、边框、日志行底色、hover 高亮在白纸上清晰可读；hover 不产生压在白纸上的深色块。
- [ ] 左右双屏对比时，左侧截图与右侧白纸背景亮度/对比度协调，无刺眼白边。
- [ ] 亮色模式外观不回归。

### 测试契约
- [ ] `test_docx_screenshot_service.py` 失败语义从「pythoncom 缺失→failed」改为「无可用后端/指定后端不可用→failed」，补后端选择/超时/无输出文件测试。
- [ ] 前端补 `SimulatedCRFForm` 白纸 token / `DocxScreenshotPanel` 中性文案的源级契约测试。
- [ ] 后端 LibreOffice 集成测试参考 `test_export_toc_bakes_real_page_numbers_with_libreoffice` 的 `skipif(find_libreoffice() is None)` 模式。

## 7. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| Linux 中文字体缺失（当前 0 个）→ 方块乱码 | 本任务安装 `fonts-noto-cjk`；用含宋/黑/仿宋/楷样本文档验收 |
| 多 soffice 共享 profile → 无输出文件 | 每次转换独立 `UserInstallation` profile + 保留 semaphore=2 |
| soffice 冷启动慢/超时残留进程 | `subprocess.run(timeout=...)`；线上若观察残留再升级为进程组 kill |
| LibreOffice 与 Word 版式差异 | 定位为「参考渲染」，字段定位基于生成 PDF 自洽 |
| 直接用全局暗色变量染黑纸面 → 更不像 Word | 用组件内 paper token，纸面语义与主题解耦 |

## 8. 待办交接

复杂任务需在 `task.py start` 前补 `design.md`（跨平台后端抽象、paper token 契约、LibreOffice 命令与 profile 隔离细节）与 `implement.md`（有序执行清单 + 验证命令）。字体安装为系统级前置步骤，需 sudo/apt 网络可用。

## 附：双模型分析产物
- codex 完整分析：`/tmp/codex_analysis.out`（尾部结论段）
- antigravity 完整分析：`/tmp/agy_analysis.out`
- 分析输入 brief：`analysis-brief.md`
