# Implementation handoff: render-backend diagnostics for Word import screenshots

## Phase gate and ownership

- On 2026-10-08 the user confirmed the scope (B1–B4 hardening) and agreed to create this task. Status is **planning**. The Opus session only produced artifacts.
- After the user reviews them, Sonnet executes: run `python3 ./.trellis/scripts/task.py start .trellis/tasks/10-08-docx-screenshot-render-backend` from the main checkout, then follow the steps below.
- Implement in the worktree `/home/decade/CRF-Editor-docx-render-backend` on branch `fix/docx-screenshot-render-backend`, based on the latest `main`. Never edit code on `main`.
- Task files stay untracked in the main checkout (project practice). Read them by absolute path: `/home/decade/CRF-Editor/.trellis/tasks/10-08-docx-screenshot-render-backend/`.
- Read before coding:
  - every entry in `implement.jsonl`;
  - `prd.md`, `design.md`, `research/diagnosis.md`;
  - `backend/.claude/CLAUDE.md`;
  - `.context/prefs/coding-style.md` and `.context/prefs/workflow.md`.
- Stage A (installing LibreOffice) is the user's action and is independent of this task. Do not run `sudo` or install system packages.

## Ordered work

1. **Worktree and baseline**
   - From the main checkout:

     ```bash
     git -C /home/decade/CRF-Editor fetch origin main && git -C /home/decade/CRF-Editor worktree add /home/decade/CRF-Editor-docx-render-backend -b fix/docx-screenshot-render-backend origin/main
     ```

   - Mirror the CI backend setup in the worktree (`.github/workflows/ci.yml:42-75`): write the CI `config.yaml` at the worktree root and run the "Initialize test database file" script from `backend/`. Do **not** copy the main checkout's `config.yaml`, which points at real data. Confirm with `git status` that the generated `config.yaml` and `crf_editor.db` are ignored or untracked, and never stage them.
   - Run the full backend suite once and record the baseline (last recorded: 978 passed / 2 skipped / 4 xfailed).

2. **RED** — add tests to `backend/tests/test_docx_screenshot_service.py`, reusing its helpers (`_patch_backend_config`, `_ImmediateThread`, the autouse task-table fixture):
   - `_no_backend_message(False)`: contains 「无可用的文档渲染后端」 and 「LibreOffice」; contains neither 「Word 后端」 nor 「MS Word」.
   - `_no_backend_message(True)`: contains 「无可用的文档渲染后端」; does not contain 「MS Word」.
   - The `start()` path with `_is_windows` patched to `False`, `auto` config, and no backends: the task is `failed` and the error equals `_no_backend_message(False)`. Keep the existing `:65-79` test and the explicit-backend parametrized test **unchanged**.
   - `log_render_backend_status()` with no backends and `_is_windows` → `False`: exactly one WARNING whose message contains 「无可用的文档渲染后端」 and `apt install libreoffice-writer-nogui`.
   - `log_render_backend_status()` with explicit `libreoffice` config and no `soffice`: a WARNING containing 「指定的 LibreOffice 文档渲染后端不可用」.
   - `log_render_backend_status()` with `find_libreoffice` → `"/usr/bin/soffice"` and no Word: an INFO record mentioning `libreoffice`, and no WARNING.
   - Lifespan wiring: spy on `DocxScreenshotService.log_render_backend_status`, run the app lifespan the way existing startup tests do (inspect `tests/test_background_jobs_flag.py` and `conftest.py` first; keep `CRF_DISABLE_BACKGROUND_JOBS` semantics), and assert one call.
   - Run them and confirm the new tests fail for the right reason on the current code.

3. **GREEN** — implement design.md B1 and B2 with minimal changes:
   - module-level `_is_windows()` and `_no_backend_message()`;
   - the last `raise` in `_select_pdf_backend()`;
   - the classmethod `log_render_backend_status()`;
   - one call in `main.py` `lifespan` after `init_db()`.

   Keep functions under 50 lines and add type hints. Rerun the targeted tests.

4. **Docs (B3)** — apply the design.md B3 table:
   - Before writing the Windows sentence, re-check that `pywin32` / `docx2pdf` are still absent from every requirements and packaging manifest.
   - Keep README.md and README.en.md semantically identical.
   - Root CLAUDE.md change log: one line only. The full narrative goes to `.context/history/archives/claudemd-changelog.md`.
   - Do not rewrite unrelated sections.

5. **Checks**
   - Run the full backend suite and coverage, and compare with the baseline.
   - Run `git diff --check`.
   - Dispatch `trellis-check` (model `sonnet`) on the full diff. Address its findings, then run a code-reviewer pass.
   - External CLI review is optional (simple task).

6. **Environment verification (AC7)**
   - Run `command -v soffice`.
   - If found:
     - run the two gated tests and confirm they pass instead of being skipped;
     - do a browser check of the Word import screenshot panel, following the memory recipe `browser-e2e-recipe` (throwaway db, headless shell, DOCX import API chain with two scaffolding tables).
   - If not found: report "not run: LibreOffice not installed". Do not claim visual verification.

7. **Finish gate** (git workflow revised 2026-10-08: direct merge into `main`, no PR / no CI merge gate)
   - Trellis 3.3 spec update: confirm that cross-stack-contracts §4 is final.
   - Commit on the task branch, merge into `main` locally, push `main` — **only after explicit user authorization**:
     - commit message: `fix(docx): 渲染后端缺失时给出平台化提示并在启动时自检`;
     - no `Co-Authored-By` trailer (user git rule overrides the harness attribution default);
     - project code commit and `.trellis/` updates (task archive / journal) are separate commits, never mixed.
   - After the code merge, remove the worktree and delete the task branch; archive the task via `task.py archive` in a standalone `.trellis/` commit.

## Validation commands

All commands run from the worktree. The backend interpreter is the verified local venv.

```bash
cd /home/decade/CRF-Editor-docx-render-backend/backend
PY="env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY /home/decade/.venvs/crf-editor/bin/python"
$PY -m pytest tests/test_docx_screenshot_service.py -q
$PY -m pytest -q
$PY -m pytest --cov=src --cov-report=term-missing -q | grep -E "docx_screenshot_service|main.py|TOTAL"
# AC7 (only when soffice exists):
$PY -m pytest "tests/test_docx_screenshot_service.py::test_libreoffice_converts_real_docx_to_nonempty_pdf" "tests/test_export_service.py::test_export_toc_bakes_real_page_numbers_with_libreoffice" -rs -q
```

The frontend is unchanged. `cd frontend && node --test tests/docxBimodalPreview.test.js` is the contract check for §4. Run it if it works without `node_modules`; otherwise report it as not run (frontend untouched).

## Rollback points

- B1 and B2 are independent: revert either by restoring its lines in `docx_screenshot_service.py` / `main.py` together with its tests.
- If the lifespan wiring test cannot isolate `init_db()` side effects cleanly, keep the unit tests. Replace the wiring test with a minimal source-level assertion that `lifespan` calls `log_render_backend_status()` after `init_db()`, and record the reason in the PR.
- No schema migration, persistent data rewrite, dependency change, or config default change is part of this task.
