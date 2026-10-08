# Word 导入截图：渲染后端缺失时的提示与启动自检

## Goal

当运行环境缺少把 docx 转成 PDF 的工具时，要让问题"说得清、发现早、文档里查得到"：
- 报错直接指出缺什么、该装什么；
- 后端启动时就给出提示；
- README 与环境变量样例如实写明 Linux 下的依赖。

本任务不改变截图功能本身的行为，也不改前端交互。

## Background

- 用户反馈：Word 导入对比弹窗左侧显示「截图生成失败 / 无可用的文档渲染后端，请安装 LibreOffice 或配置 Word 后端」。
- 根因在环境，不在代码：
  - 后端运行在 Ubuntu 24.04（WSL2）上，没装 LibreOffice；Linux 上又不可能使用 Word。
  - `_select_pdf_backend()` 按设计直接报错失败。
- 恢复功能靠安装 LibreOffice。这一步由用户执行（见 `research/diagnosis.md` 的 stage A），不属于本任务的代码范围。
- 问题长期没人发现，是因为几处缺口：
  - README 仍说截图面板只需 Windows + MS Word；
  - Linux 上的报错指向走不通的「配置 Word 后端」；
  - 启动时不检查；
  - 环境变量样例里没有 `CRF_DOCX_SCREENSHOT_BACKEND`。
- 证据与行号见 `research/diagnosis.md`。

## Requirements

- **R1 — 按平台给出报错**：
  - 在 `auto` 模式下找不到任何渲染后端时，非 Windows 平台的提示要明确指出缺少 LibreOffice（`soffice`），并建议在服务器安装后重试，不再提 Word 后端。
  - Windows 平台保持现有文案。
  - 两种文案都以「无可用的文档渲染后端」开头，且都不出现「MS Word」。
  - 显式配置为 `word` / `libreoffice` 但该后端不可用时，现有的两条文案一字不改。
  - 面向用户的文案里不放 shell 命令。
- **R2 — 启动自检**：
  - 后端启动时检查一次渲染后端，规则与截图任务相同（包括 `docx_screenshot.backend` 配置）。
  - 不可用时记录一条 WARNING 日志，内容包括 R1 的原因；非 Windows 平台再附上安装提示（如 `sudo apt install libreoffice-writer-nogui`）。
  - 可用时记录一条 INFO 日志，写明选中的后端，不出现 WARNING。
  - 自检不能抛异常，不能阻断或明显拖慢启动。
- **R3 — 文档如实描述**：
  - README 中英文的「可选运行时」和「环境要求」改为如实描述：
    - Linux/macOS 上，Word 导入原文截图依赖 LibreOffice；
    - LibreOffice 同时用于目录真实页码；
    - Windows 可以用 MS Word（需另装 `pywin32` 和 `docx2pdf`），也可以用 LibreOffice。
  - 生产部署章节的「前置准备」补充 LibreOffice 和中文字体的安装命令（没有 Windows 字体的服务器需要 CJK 字体）。
- **R4 — 环境变量样例**：
  - `.env.example` 和 `deploy/crf-editor.env.example` 加入 `CRF_DOCX_SCREENSHOT_BACKEND`（默认 `auto`，可选 `word` / `libreoffice`）。
  - 不改变任何现有的默认行为。
- **R5 — 同步上下文文档**：按项目约定同步以下内容：
  - `backend/.claude/CLAUDE.md`；
  - 根目录 `.claude/CLAUDE.md`：变更日志只写一行，完整叙述追加到 `.context/history/archives/claudemd-changelog.md`；
  - 跨栈契约 §4 中关于不支持运行时的描述；
  - `.claude/index.json`（如果涉及）。

## Acceptance Criteria

- [ ] **AC1（R1）**：新增回归测试，先在旧实现上失败，改完后通过：
  - 非 Windows 文案包含「无可用的文档渲染后端」和「LibreOffice」，不包含「Word 后端」和「MS Word」；
  - Windows 文案包含「无可用的文档渲染后端」，不包含「MS Word」。
- [ ] **AC2（R1）**：
  - 现有的 `test_start_marks_task_failed_when_no_render_backend_available` 和"显式后端不可用"的参数化测试继续通过，文案断言不放宽；
  - 任务仍然进入 `failed`；
  - 前端零改动。
- [ ] **AC3（R2）**：新增回归测试，先失败后通过：
  - 渲染后端不可用时，启动过程记录一条包含原因的 WARNING；
  - 可用时记录 INFO，没有该 WARNING；
  - 启动流程确实调用了自检；
  - 自检不抛异常。
- [ ] **AC4（R3、R4）**：
  - README 中英文的对应段落、两份环境变量样例按 R3/R4 更新，中英文内容一致；
  - diff 里没有与本任务无关的文档改动。
- [ ] **AC5（R5）**：模块和根目录的 CLAUDE.md、归档变更日志、跨栈契约 §4、`.claude/index.json`（如涉及）都已同步。
- [ ] **AC6（回归）**：
  - 后端全量 pytest 没有新增失败（开工时先记录基线；上次记录为 978 passed / 2 skipped / 4 xfailed）；
  - `docx_screenshot_service.py` 的覆盖率不下降。
- [ ] **AC7（环境验证，依赖用户先完成 stage A）**：
  - 如果实现时本机已装好 LibreOffice：2 个依赖 LibreOffice 的测试从 skipped 变为 passed，并且在浏览器里打开 Word 导入对比弹窗能看到原文截图；
  - 如果还没装：在报告中明确写「未运行：LibreOffice 未安装」，不能声称已验证。

## Out of Scope

- 不安装、不打包任何系统软件，不新增 Python 依赖。
- 不扩展 `find_libreoffice()` 的路径查找，不新增 `CRF_LIBREOFFICE_PATH` 之类的覆盖配置。
- 不改前端：不加重试按钮，不改失败态的显示逻辑。
- 不改 `deploy/install-service.sh` 等部署脚本。
- 以下问题不在本任务处理：
  - `import_docx.py:797` 轮询时的 WARNING 日志噪音；
  - 非标准 docx 文件导致的 400 解析错误；
  - apt 源混用 22.04 的问题。
