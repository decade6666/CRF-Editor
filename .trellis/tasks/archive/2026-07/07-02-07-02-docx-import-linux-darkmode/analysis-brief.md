# 分析任务：Word 导入两处问题

## 背景
CRF-Editor：FastAPI + SQLAlchemy + SQLite 后端，Vue 3 + Vite + Element Plus 前端。
运行环境：Linux 服务器（已确认安装 `/usr/bin/soffice` LibreOffice）。
Word 导入流程：上传 docx → 左侧展示原始文档截图（证据面板）+ 右侧展示导入解析后的 CRF 表单预览，供用户对比核对。

## 问题 1：Word 原始文档截图仅支持 Windows

### 现状机制（已确认）
- `backend/src/services/docx_screenshot_service.py`：截图转换链
  - docx → PDF：使用 `docx2pdf`，内部调用 **MS Word COM 接口（Windows 专属）**，通过 `pythoncom` 在后台线程初始化 COM（CoInitialize/CoUninitialize）。
  - PDF → PNG：使用 PyMuPDF（fitz，跨平台），150 DPI。
  - PDF 文本提取：用于定位每个 form/field 出现在哪一页。
- 任务状态机：idle→starting→running→done/failed，`threading.Semaphore` 限制并发为 2。
- 非 Windows 环境：import `pythoncom` 直接抛 `ImportError` → 捕获后 status=failed，返回硬编码错误「当前环境不支持 Word 截图，请在安装了 MS Word 的 Windows 环境中使用该功能」。
- **无操作系统检测，无任何 fallback。**
- 前端 `DocxScreenshotPanel.vue` 轮询 `/screenshots/status`，failed 时显示「截图生成失败」+「请确认已安装 MS Word 并重试」。

### 目标
在 Linux 服务器上启用原始文档截图能力。候选方案：LibreOffice headless（`soffice --headless --convert-to pdf`）替代 MS Word COM 完成 docx→PDF，复用现有 PyMuPDF 完成 PDF→PNG。

### 需要分析
1. LibreOffice headless 转换的可行性、命令行细节、并发安全（多个 soffice 实例/用户 profile 隔离问题）、超时与失败处理。
2. 如何设计跨平台抽象：保留 Windows COM 路径，新增 LibreOffice 路径，运行时探测选择后端。是否需要配置项显式指定后端。
3. PDF 文本页定位逻辑是否与转换后端无关（PyMuPDF 读 PDF），复用是否安全。
4. LibreOffice 渲染的 docx 版式是否与 MS Word 一致（截图用于人工对比核对，版式差异可接受度）。
5. 风险：字体缺失导致中文乱码/版式错乱（Linux 需装中文字体）、soffice 首次启动慢、临时目录清理、僵尸进程。
6. 现有测试 `backend/tests/test_docx_screenshot_service.py` 的失败语义契约是否需要调整。

## 问题 2：右侧导入效果预览暗色模式显示异常

### 现状机制（已确认）
- 右侧预览由 `frontend/src/components/SimulatedCRFForm.vue` 渲染，模拟 CRF 表单外观（宋体、表格）。
- 该组件 scoped CSS **全部硬编码浅色值**，未接入 CSS 变量系统：
  - `.crf-form-wrap { color: #1a1a1a }`
  - `.crf-table { border: 1px solid #d4d4d4 }`
  - `.crf-label-cell { background: #fafafa }`
  - `.field-row:hover { background-color: #f0f9ff }`
  - `.crf-log-row { background: #f5f5f5; color: #666 }` 等
- 左侧 `DocxScreenshotPanel.vue` 和容器 `.compare-panel` 正确用了 `var(--color-bg-hover)`、`var(--color-border)`。
- `main.css` 有完整 `html[data-theme="dark"]` 变量集（`--color-bg-hover:#17242d`、`--color-border:#253845` 等）。
- 暗色模式下右侧成为「浅色孤岛」，与整体割裂。

### 用户诉求
「右侧的导入效果在暗色模式下显示存在问题，显示内容应尽量与导入模板的效果保持一致。」

### 关键设计决策（需要分析给出建议）
CRF 表单本质是纸质文档模拟。两种修复方向：
- **方向 A**：让 SimulatedCRFForm 适配暗色模式（暗背景+浅文字），用 CSS 变量替换硬编码。缺点：与「纸质表单/导入模板效果」不一致。
- **方向 B**：保持白纸表单外观（模拟真实打印 CRF/Word 输出），像 `TemplatePreviewDialog.vue` / `.word-page` 那样把预览区做成明确的「白纸」，无论主题；只修外围容器/hover 等，让白纸成为有意设计而非破损孤岛。
- 参考：`TemplatePreviewDialog.vue` 和 `.word-page`（Word 预览）在暗色模式下如何渲染？如果它们是干净白纸，则 SimulatedCRFForm 应对齐（方向 B）。

请判断哪个方向更符合「与导入模板效果保持一致」，并给出具体 CSS 修改策略。

## 输出要求
请输出结构化分析，包含：
1. 两个问题各自的推荐方案（技术选型 + 理由）。
2. 关键风险与缓解措施。
3. 建议的实现边界（改哪些文件、不改哪些）。
4. 验收标准建议（如何验证 Linux 截图成功、暗色模式一致）。
5. 需要向用户澄清的开放问题（如有）。

不要写完整代码，只给高层设计与关键决策。
