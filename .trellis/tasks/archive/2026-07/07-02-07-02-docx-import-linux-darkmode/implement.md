# 执行简报（codex 实现用 / 兼 implement.md）

Active task: .trellis/tasks/07-02-07-02-docx-import-linux-darkmode

> 前置已由主控完成：Linux 中文字体已安装（30 个 Noto CJK，`fc-list :lang=zh` 已验证）。你无需再装字体。
> 需求与决策见同目录 `prd.md`。以下是有序执行清单与文件边界，严格遵守。

## 一、允许修改的文件（不得越界）

后端：
- `backend/src/services/docx_screenshot_service.py`（主改：抽象 docx→PDF 后端）
- `backend/src/config.py`（新增后端配置项，仅 YAML/env，见下）
- `backend/tests/test_docx_screenshot_service.py`（改失败语义 + 补测试）
- 可新增 `backend/tests/` 下的测试文件（如需）

前端：
- `frontend/src/components/SimulatedCRFForm.vue`（paper token 白纸化）
- `frontend/src/components/DocxCompareDialog.vue`（右侧暗色画布/留白）
- `frontend/src/components/DocxScreenshotPanel.vue`（中性文案）
- 可新增 `frontend/tests/` 下的源级契约测试

**禁止修改**：`toc_pagination.py`（只读复用其 `find_libreoffice`）、PyMuPDF 相关的 `_convert_to_images`/`_refresh_page_ranges` 主逻辑、`main.css` 全局主题变量、`TemplatePreviewDialog.vue`、import_docx 接口 schema、数据库/导入解析/AI 链路。

## 二、P1 后端：docx→PDF 跨平台抽象

现状锚点（`docx_screenshot_service.py`）：
- `_semaphore = threading.Semaphore(2)`（L25，保留不变）
- `_load_pythoncom()`（L126）Windows COM import
- `_run()`（L136）后台线程：`CoInitialize` → `_convert_to_pdf` → `_convert_to_images` → `_refresh_page_ranges`
- `_convert_to_pdf(docx_path, output_dir)`（L176）**← 平台相关，重构目标**
- `_convert_to_images` / `_refresh_page_ranges`：PyMuPDF，平台无关，**保留**

要求：
1. 抽出「docx→PDF 后端选择」。定义后端枚举 `auto | word | libreoffice`，从 config 读取（默认 `auto`）。`auto` 逻辑：优先探测 MS Word（`pythoncom` 可 import 即 Windows COM 可用）；否则探测 LibreOffice（`toc_pagination.find_libreoffice()` 非 None）。显式 `word`/`libreoffice` 强制指定，不可用则 fail。
2. **仅在选中 Word 后端时**执行 `_load_pythoncom()` + `CoInitialize/CoUninitialize`；LibreOffice 路径不得触碰 pythoncom。当前 `_run` 无条件 `CoInitialize` 的逻辑要按后端分支。
3. LibreOffice docx→PDF：复用 `toc_pagination.find_libreoffice()` 找 soffice；命令形态对齐 `toc_pagination._render_pdf`：
   ```
   soffice -env:UserInstallation=file://<独立临时profile> --headless --norestore --convert-to pdf:writer_pdf_Export --outdir <output_dir> <docx_path>
   ```
   - **每次转换必须用独立 `UserInstallation` profile**（`tempfile.mkdtemp`），转换后清理，避免共享 profile 锁冲突导致「无输出文件」。
   - `subprocess.run(..., capture_output=True, timeout=<90~120s>)`；捕获 `TimeoutExpired`/`SubprocessError`/`OSError`。
   - 转换后校验输出 PDF 存在且非空；不存在则视为失败（LibreOffice 锁冲突常表现为无输出而非报错）。
   - 失败时把 stderr/stdout 摘要写日志（用项目现有 logging，不用 print）。
4. 失败错误信息去掉写死的「MS Word」。区分：
   - 无任何可用后端 → 「无可用的文档渲染后端」类中性信息。
   - 指定后端不可用 → 指出该后端不可用。
   - 渲染超时/失败 → 「文档渲染失败」类。
5. 保留并发 `_semaphore=2` 与现有任务状态机（idle/starting/running/done/failed）不变。

`config.py`：新增后端配置（如 `docx_screenshot.backend` 或等价），默认 `auto`，支持 `CRF_*` env 覆盖，遵循现有 config 结构与校验风格。仅后端，不暴露前端。

## 三、P2 前端：暗色模式白纸预览（方向 B）

`SimulatedCRFForm.vue`：
1. 现有 scoped CSS 硬编码浅色（`.crf-form-wrap{color:#1a1a1a}`、`.crf-table{border:#d4d4d4}`、`.crf-label-cell{background:#fafafa}`、`.field-row:hover{background:#f0f9ff}`、`.crf-log-row{background:#f5f5f5;color:#666}` 等）。
2. 引入组件内 paper token（在组件根作用域定义，不进 main.css），亮/暗主题下值不变，保持白纸语义：
   - `--crf-paper-bg:#fff` / `--crf-paper-text:#1a1a1a` / `--crf-paper-border:#d4d4d4` / `--crf-paper-hover:#f0f9ff` / `--crf-paper-structure-bg:#fafafa`（结构底如 label/log 行）。
3. 把上述硬编码替换为对应 token；`.crf-form-wrap` 明确 `background: var(--crf-paper-bg)`。表单区不受全局 `data-theme="dark"` 影响。

`DocxCompareDialog.vue`：
4. 右侧滚动区（包裹 SimulatedCRFForm 的容器）接入全局暗色变量作「画布」：暗色下用 `var(--color-bg-*)` 深背景 + 适当 padding，让白纸凸显（可加轻阴影/边框）。参考 `.word-page`「暗背景中的白纸」观感，但不复制其全部 CSS。

`DocxScreenshotPanel.vue`：
5. 加载态文案（如「正在调用 Word 渲染原始文档」）改中性（如「正在渲染原始文档」）；失败兜底文案去掉「请确认已安装 MS Word」，改不绑定引擎的中性提示。

## 四、测试要求

后端：
- 改 `test_docx_screenshot_service.py` 失败语义：从「pythoncom 缺失→failed」改为「无可用后端 / 指定后端不可用→failed」。
- 补：后端选择逻辑（auto 探测优先级、显式指定）、LibreOffice 超时、无输出文件→failed。
- LibreOffice 真机集成测试用 `@pytest.mark.skipif(find_libreoffice() is None, ...)`，参考 `test_export_toc_bakes_real_page_numbers_with_libreoffice`。
- 用 mock 覆盖平台分支，避免单测强依赖具体 OS。

前端（`node --test`）：
- 补 `SimulatedCRFForm` paper token 存在 + `.crf-form-wrap` 白纸背景的源级契约。
- 补 `DocxScreenshotPanel` 中性文案（不含「MS Word」）契约。

## 五、验证命令（实现后必须运行并附结果）

```bash
cd backend && python -m pytest tests/test_docx_screenshot_service.py -q
cd backend && python -m pytest -q            # 全量，不得回归
cd frontend && node --test tests/*.test.js
cd frontend && npm run lint
```

真机冒烟（LibreOffice 已装、字体已装）：可选，用 `docs/通用表单_CRF.docx` 走一次 `/screenshots/start`→`/screenshots/status` 到 `done`，确认中文非方块。

## 六、交付

- 不要 git commit（由主控 review diff 后决定）。
- 完成后输出：改动文件清单、关键决策、测试运行结果（pass/fail 数）、未跑项与原因。
