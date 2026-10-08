# Diagnosis: Word import screenshot fails with 「无可用的文档渲染后端」

Recorded 2026-10-08 by the Opus planning session. Every statement below comes from a command run in that session; items marked *inferred* are reasoning, not observation.

## Symptom

- The Word import compare dialog shows 「截图生成失败」 with the sub-text 「无可用的文档渲染后端，请安装 LibreOffice 或配置 Word 后端」 (`frontend/src/components/DocxScreenshotPanel.vue:22-25`; the text is `res.error` shown verbatim, `:231-234`).
- `backend/backend.log` (untracked, main checkout) shows `RuntimeError: 无可用的文档渲染后端…` after every `POST .../screenshots/start`, raised at `docx_screenshot_service.py:215` (`_select_pdf_backend`) from `_run` (`:221`).

## Pipeline and backend selection

- docx → PDF (MS Word COM or LibreOffice headless) → one PNG per page via PyMuPDF (`docx_screenshot_service.py:1-8`).
- `_select_pdf_backend()` (`:195-215`) reads `docx_screenshot.backend` (`auto|word|libreoffice`; env `CRF_DOCX_SCREENSHOT_BACKEND`; `config.py:27,143-153`). `auto` tries Word first (`importlib.util.find_spec("pythoncom")`), then `find_libreoffice()` (`toc_pagination.py:23-29`, only `shutil.which("soffice")` / `shutil.which("libreoffice")`), otherwise raises.
- Selection runs per task inside `_run`, and `shutil.which` reads the process PATH at call time, so installing LibreOffice needs no backend restart.
- `start()` (`:126-138`) reuses only `starting|running|done` tasks; a `failed` task is replaced and re-run. The panel calls `/screenshots/start` from an immediate `watch(() => props.tempId)` (`DocxScreenshotPanel.vue:95-102`), so closing and reopening the compare dialog retries.

## Runtime facts

| Check | Result |
|---|---|
| OS | Ubuntu 24.04.1 LTS on WSL2 (systemd is not PID 1) |
| Backend process | `~/.venvs/crf-editor/bin/python main.py` via nohup, dev mode (reload), cwd `backend/` |
| Process PATH | includes `/usr/local/bin:/usr/bin:/bin` |
| `which soffice libreoffice` | nothing |
| `dpkg -l \| grep libreoffice` | nothing |
| `/usr/lib/libreoffice`, `/opt/libreoffice*`, Windows `Program Files/LibreOffice` | absent |
| PyMuPDF in venv | 1.28.2, imports fine |
| `pythoncom` | unavailable on Linux by design |
| CJK fonts | `fc-match SimSun / SimHei / "Microsoft YaHei"` resolve to `/usr/share/fonts/win10` (directory created 2026-09-16) |

## Test evidence

- `pytest tests/test_docx_screenshot_service.py tests/test_export_service.py` → 64 passed, 2 skipped. The skips are exactly the LibreOffice-gated cases: `test_docx_screenshot_service.py:506` (real docx → PDF) and `test_export_service.py:765` (baked TOC page numbers).
- Change-log history: full-suite results before 2026-09 show no skips (e.g. 2026-08-28 "916 passed / 4 xfailed"); "2 skipped" first appears on 2026-09-29. *Inferred*: the WSL environment was rebuilt around 2026-09-16 (Windows fonts copied, LibreOffice not reinstalled).

## Collateral impact

- Word export TOC real page numbers (`toc_pagination.compute_heading_pages`) also depend on LibreOffice and currently fall back silently (INFO log only).

## Why it went unnoticed (gaps this task closes)

- `README.md:99` / `README.en.md:99` still say the screenshot panel only needs "Windows + MS Word". That has been out of date since commit `6bdbdf7` added the LibreOffice path for Linux. `README.md:47,98` describe LibreOffice only as the TOC page-number helper.
- The error text suggests 「配置 Word 后端」, which is impossible on Linux.
- There is no startup self-check, so the problem only surfaces when a user opens the panel.
- Neither `.env.example` nor `deploy/crf-editor.env.example` lists `CRF_DOCX_SCREENSHOT_BACKEND`.
- `pywin32` / `docx2pdf` are not in any requirements file (only referenced in `docx_screenshot_service.py:176,269-278`), so the Windows Word path needs a manual `pip install pywin32 docx2pdf`.

## Environment fix (stage A — user action, outside this task's code scope)

- `apt-cache policy`: `libreoffice-writer-nogui` candidate `4:24.2.7-0ubuntu0.24.04.6`.
- `apt-get -s install libreoffice-writer-nogui`: 143 packages (58 with `--no-install-recommends`), all resolvable from noble. 5 lines also list jammy, but at the identical version. No JRE is pulled in.
- Command: `sudo apt update && sudo apt install -y libreoffice-writer-nogui`.
- Side note: `/etc/apt/sources.list` also carries `mirrors.aliyun.com … jammy` lines on this noble system. This is harmless for this install; the user may clean it up separately.

## Existing contracts the implementation must keep

- `test_docx_screenshot_service.py:65-79`: no backend → task `failed`; the error contains 「无可用的文档渲染后端」 and does **not** contain 「MS Word」.
- `:82-104`: explicit `word` / `libreoffice` unavailable → the error equals exactly 「指定的 Word 文档渲染后端不可用」 / 「指定的 LibreOffice 文档渲染后端不可用」.
- `.trellis/spec/guides/cross-stack-contracts.md` §4 (`docx-screenshot-evidence`), contract 5 and the error matrix: an unsupported runtime → `status=failed` with a Chinese user-visible message.

## Unrelated observations (out of scope)

- The first upload of `通用表单_CRF.docx` returned 400 「Word文档解析失败」: python-docx raised `PackageNotFoundError`, i.e. the file is not a valid OOXML zip (a renamed `.doc` or an encrypted document).
- `import_docx.py:797` logs WARNING 「field_pages 为空！」 on every status poll, which is log noise.
- CI full-suite setup (`.github/workflows/ci.yml:42-75`) writes a root `config.yaml` and seeds `crf_editor.db`; a fresh worktree needs the same before running the full backend suite.
