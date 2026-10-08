# Design: render-backend diagnostics for Word import screenshots

## Boundaries

- Touch only: `backend/src/services/docx_screenshot_service.py`, one call in `backend/main.py` `lifespan`, backend tests, and the docs listed in B3.
- Do not touch: routers, frontend, `toc_pagination.py`, the config model, or deploy scripts.
- Runtime semantics stay the same: backend selection order, the explicit-backend error texts, the task state machine, caching, and page detection.

## B1 — Platform-aware "no backend" message

- Add a module-level environment probe and a pure message builder:

  ```python
  def _is_windows() -> bool: ...            # sys.platform == "win32"
  def _no_backend_message(is_windows: bool) -> str: ...
  ```

  - Non-Windows: `无可用的文档渲染后端：服务器未检测到 LibreOffice（soffice），请安装 LibreOffice 后重试`
  - Windows: unchanged, `无可用的文档渲染后端，请安装 LibreOffice 或配置 Word 后端`
- The last line of `_select_pdf_backend()` becomes `raise RuntimeError(_no_backend_message(_is_windows()))`.
- Invariants:
  - Both texts start with 「无可用的文档渲染后端」.
  - Neither contains 「MS Word」 (existing assertion at `test_docx_screenshot_service.py:79`).
  - The two explicit-backend texts (`:200`, `:206`) stay byte-identical.
- User visibility:
  - Path: `task.error` → `/screenshots/status` → shown verbatim by `DocxScreenshotPanel.vue`.
  - No frontend change.
  - No shell commands in the user-facing text; install commands go only into logs and docs.
- Testing:
  - Test `_no_backend_message` directly for both branches. Never monkeypatch `sys.platform` globally, because `shutil.which` and other stdlib code read it at call time.
  - Monkeypatch `_is_windows` (an environment probe) where an end-to-end path needs a fixed platform.

## B2 — Startup self-check

- Add to `DocxScreenshotService`:

  ```python
  @classmethod
  def log_render_backend_status(cls) -> None:
      """启动自检：记录 Word 导入截图渲染后端是否可用；不抛异常。"""
  ```

  - Call `cls._select_pdf_backend()` and reuse its rules. Do not duplicate the selection logic.
  - On `RuntimeError` (the only documented failure), log `logger.warning(...)` with:
    - the exception text (B1 reason, or an explicit-backend reason);
    - on non-Windows (`_is_windows()` is False), an extra hint: `Ubuntu/Debian 可执行 sudo apt install libreoffice-writer-nogui`.
  - On success, log `logger.info(...)` with the selected backend value (`word` / `libreoffice`).
  - Catch only `RuntimeError`. Do not add defensive catch-alls: config is already loaded and validated earlier in `lifespan`.
- `main.py` `lifespan`: call `DocxScreenshotService.log_render_backend_status()` once, right after `init_db()` and before `start_background_jobs(app)`. `DocxScreenshotService` is already imported in `main.py` (it is used by the shutdown cleanup).
- Cost: one `importlib.util.find_spec` plus at most two `shutil.which` calls, so milliseconds.
- Log levels follow `.trellis/spec/backend/logging-guidelines.md` (WARNING = unexpected but handled; INFO = normal operation). The logger is the existing module logger `src.services.docx_screenshot_service`.
- Testing:
  - Unit-test `log_render_backend_status` with `caplog`:
    - unavailable → one WARNING containing the reason, plus the apt hint when `_is_windows` is False;
    - available → INFO and no WARNING.
  - Wiring test: spy on `DocxScreenshotService.log_render_backend_status` and run the app lifespan. Follow the existing lifespan test pattern (look at `tests/test_background_jobs_flag.py` / `conftest.py`). Assert the spy is called exactly once.

## B3 — Documentation

| File | Change |
|---|---|
| `README.md` / `README.en.md` | 「可选运行时」/"Optional Runtime" (line 47) and 「环境要求」/"Requirements" (lines 98-99): Linux/macOS screenshot panel needs LibreOffice; LibreOffice also bakes TOC page numbers; Windows may use MS Word (`pip install pywin32 docx2pdf`, not in requirements) or LibreOffice. Production deployment 「前置准备」 (around line 305): add step 3, `sudo apt install -y libreoffice-writer-nogui fonts-noto-cjk`, and note that a missing LibreOffice disables the screenshot panel and falls back on TOC page numbers. Mention that installing needs no service restart for screenshots. |
| `.env.example` | Add `CRF_DOCX_SCREENSHOT_BACKEND=auto`. |
| `deploy/crf-editor.env.example` | Add `CRF_DOCX_SCREENSHOT_BACKEND=auto`, plus one comment line in the header block (`auto`=Word COM first, then LibreOffice; Linux needs LibreOffice). |
| `backend/.claude/CLAUDE.md` | Update the `docx_screenshot_service.py` Service Overview entry (platform-aware message, startup self-check); add a Change Log entry. |
| Root `.claude/CLAUDE.md` | Change Log: one line only. Append the full narrative to `.context/history/archives/claudemd-changelog.md` (current convention, see the root file's Development Conventions). Update the backend test-count cells only if the file count changes (it should not: tests are added to existing files). |
| `.trellis/spec/guides/cross-stack-contracts.md` §4 | Contract 5 and the error matrix: name missing LibreOffice on Linux as an unsupported runtime; document the platform-aware message invariants and the startup self-check log. |
| `.claude/index.json` | Sync only if it describes `docx_screenshot_service` behavior or README runtime requirements. |

## Compatibility / rollout / rollback

- No data migration, no API or config schema change, no frontend change. Only log and message text change.
- B1 and B2 are independent; each can be reverted on its own by restoring the touched lines.

## Tradeoffs

- No `apt` command in the UI text: regular users cannot run it, and it does not fit desktop or Windows deployments.
- No `/opt/libreoffice*` probing or path override: an apt install lands in `/usr/bin`, which the existing `shutil.which` already covers. Revisit only on a real request (official `.deb` installs use versioned binary names).
- The self-check only logs; it does not expose a capability API. The frontend already receives the precise reason through the existing failed-task path.
