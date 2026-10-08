# Implementation plan: owner-bound Word import uploads

Follow the parent runbook `/home/decade/CRF-Editor/.trellis/tasks/10-08-review-remediation/implement.md` (referred to as RB below). This file lists only task-specific steps.

- Branch: `fix/docx-temp-ownership`
- Worktree: `/home/decade/CRF-Editor-docx-temp-ownership`
- Priority: **urgent**. The multi-user server is live.

## 1. Start

```bash
cd /home/decade/CRF-Editor
python3 ./.trellis/scripts/task.py start .trellis/tasks/10-08-docx-temp-ownership
python3 ./.trellis/scripts/task.py set-branch .trellis/tasks/10-08-docx-temp-ownership fix/docx-temp-ownership
git worktree add /home/decade/CRF-Editor-docx-temp-ownership -b fix/docx-temp-ownership main
```

- If `test-isolation` is not merged yet, create the throwaway config and seed DB (RB §3).
- Record the baseline: run the full backend suite and note the passed / failed / skipped / xfailed counts.

## 2. RED

1. Write `backend/tests/test_docx_temp_isolation.py` (design.md D5/T1).
   - For path-parameter cases, use only ids that survive URL normalization. A bare `..` segment may be collapsed by the HTTP client before routing; if so, drop it and keep it in the body cases.
2. Update the existing tests in design.md T2 **only where the new tests force it**: signatures, names, ids. Do not weaken any existing assertion.
3. Run the new file and confirm each test fails for the stated reason:
   - malformed ids are currently accepted (no 422);
   - user B's `execute` currently succeeds, then deletes A's file;
   - B currently sees A's screenshot status;
   - the new service functions do not exist yet (acceptable for the unit tests only).

## 3. GREEN — commit 1: security core

- Implement design.md D1, D2, D3, plus `cleanup_temp`, `discard_upload`, and both dead-branch removals (D4 first two bullets).
- Run the targeted tests, then the full backend suite.
- **Security checkpoint**: apply RB §6 security review to the commit-1 diff. Fix every Critical or High finding.
- **Early-ship checkpoint**: report to the user with the RB §8 template, and ask whether to commit, merge, and push now so the fix can be deployed before the sweep lands.
  - With authorization, follow RB §2 finish. Keep the worktree and branch for commit 2.
  - Suggested message: `fix(docx): Word 导入临时文件改用 32 位编号并校验上传者归属`

## 4. GREEN — commit 2: expiry sweep

- Implement the rest of design.md D4:
  - `UPLOAD_TTL_HOURS`;
  - `purge_expired_uploads`;
  - the sweep loop in `background_jobs.py`.
- Run the targeted tests, then the full suite.
- Suggested message: `feat(docx): 过期的 Word 导入上传每小时自动清理`

## 5. Docs (RB §7)

- `.trellis/spec/guides/cross-stack-contracts.md` §4 (Word import screenshot evidence):
  - temp id format (32 lowercase hex);
  - 422 on malformed ids;
  - ownership rule: user + project; a foreign id is answered like a missing one, with the per-endpoint table from prd.md R3;
  - 24 h expiry and the hourly sweep.
  
  Keep the existing render-backend text intact.
- `backend/.claude/CLAUDE.md`:
  - the `docx_import_service.py` service entry;
  - the security behavior section, if any;
  - a Change Log entry.
- Root `.claude/CLAUDE.md`: one Change Log line. Append the full narrative to `.context/history/archives/claudemd-changelog.md`.
- `README.md` / `README.en.md`: add one sentence on the 24 h expiry only if they describe the Word import flow; check first.
- `.claude/index.json`: update only if it describes `docx_import_service` behavior.

## 6. Checks (RB §6)

- `git diff --check`.
- Full backend suite against the baseline.
- Coverage of `docx_import_service.py`, `routers/import_docx.py`, and `background_jobs.py`, if `pytest-cov` is available. Do not install it here without asking; `test-isolation` owns that.
- `trellis-check` (sonnet) on the full branch diff.
- The `code-review` skill.
- A **final security review** of the whole branch diff. This is mandatory.
- Frontend: `git diff --stat main -- frontend/` must be empty, so no Haiku review is needed.

## 7. Browser / API verification

Follow the memory note `browser-e2e-recipe`. Use a throwaway backend on port 8901 with `/tmp` DB and uploads, build the frontend in the worktree, and use `httpx` for API scripts.

1. In the browser, as user A: upload a `.docx` that has two scaffolding tables, wait for the original-page screenshots, then execute the import. The flow must work end to end. LibreOffice is installed, so screenshots should render.
2. Via the API, as user B with A's temp id: `execute`, `screenshots/start`, `screenshots/status`, `screenshots/pages/1`, and `ai-review/status` must each return exactly the "missing id" response from prd.md R3. A's file must still be on disk.
3. Check that the stored file name matches `{32hex}_u{A}_p{project}_*.docx`.
4. Record what was and was not verified.

## 8. Finish

- Follow RB §2 and RB §8, with authorization for every step.
- After the merge and push, remind the user of the production steps in the parent `prd.md` 「线上事项」:
  - deploy and restart;
  - in-flight imports must re-upload;
  - audit the access logs.
- Archive this task in a separate `.trellis/` commit **after** the production deploy. The task docs describe the exploit path.

## Rollback points

- Commit 1 and commit 2 can be reverted independently. Commit 2 only adds the sweep.
- If `Path(pattern=...)` misbehaves on this FastAPI version, fall back to a single dependency function that validates `temp_id` and raises `RequestValidationError`-compatible 422s. Record the reason.
