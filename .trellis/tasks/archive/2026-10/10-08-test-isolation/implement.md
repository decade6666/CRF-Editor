# Implementation plan: hermetic backend test session

Follow the parent runbook `/home/decade/CRF-Editor/.trellis/tasks/10-08-review-remediation/implement.md` (RB).

- Branch: `test/test-isolation`
- Worktree: `/home/decade/CRF-Editor-test-isolation`

## 1. Start and two baselines

```bash
cd /home/decade/CRF-Editor
python3 ./.trellis/scripts/task.py start .trellis/tasks/10-08-test-isolation
python3 ./.trellis/scripts/task.py set-branch .trellis/tasks/10-08-test-isolation test/test-isolation
git worktree add /home/decade/CRF-Editor-test-isolation -b test/test-isolation main
```

1. **Zero-setup baseline (expected to fail).** In the fresh worktree, with no `config.yaml` and no DB, run the full backend suite (RB §3 command). Record the failure mode. Expected: an import or collection error because the secret key is empty, or a failing export test.
   - Everything this creates stays inside the worktree, so it is harmless.
   - Run it inside the worktree only. Never in the main checkout.
2. **Functional baseline.** Create the throwaway config and seed DB (RB §3), run the full suite, and record the passed / failed / skipped / xfailed counts.
3. **Restore zero setup.** Delete the throwaway artifacts you created, by explicit path only:
   - `config.yaml`, `crf_editor.db` (plus any `-wal` / `-shm`), `uploads/` at the worktree root;
   - `backend/uploads/` inside the worktree.

   Run `git -C "$WT" status --short --ignored` first and look at the targets. Never use `git clean`.
4. Snapshot `git -C "$WT" status --porcelain --ignored` for AC3.

## 2. RED

- Add the guard test from design.md T5. It must fail now: paths resolve into the worktree, not a temp root.
- The zero-setup baseline from step 1.1 is the RED evidence for AC2.

## 3. GREEN

Implement design.md T1–T4. Then:

- run the guard test;
- run the full suite in the **zero-setup** worktree. It must pass with counts ≥ the functional baseline;
- compare `git status --porcelain --ignored` with the snapshot: only `__pycache__/` and `.pytest_cache/` may be new (AC3);
- `git diff --stat main -- backend/src backend/main.py` must be empty (AC4).

## 4. Coverage (design.md T6)

1. Pin and install `pytest-cov`.
2. Update `.gitignore`.
3. Run the coverage command.
4. Record the TOTAL percentage and the 10 lowest-covered modules in the task notes (`task.py set-meta … coverage_baseline=<pct>`) and in the final report. Later children compare against it.

## 5. Docs (RB §7)

- Root `.claude/CLAUDE.md`: the Common Commands block gets the coverage command; add a note to Testing Strategy:
  - tests are hermetic;
  - a fresh worktree needs no `config.yaml`.

  Add one Change Log line, and the archive narrative.
- `backend/.claude/CLAUDE.md`: the test section and a Change Log entry.
- `README.md` / `README.en.md`: the testing commands section.
- `.trellis/spec/backend/quality-guidelines.md`, testing conventions:
  - tests must not touch repo paths;
  - use the conftest `TEST_ROOT`, or `tmp_path`;
  - never stat-guard real files.
- Parent runbook `implement.md` §1 / §3: note that the throwaway config is no longer needed once this is merged. This is a Trellis file, so commit it separately.

## 6. Checks (RB §6)

- `git diff --check`.
- `trellis-check` (sonnet).
- The `code-review` skill.
- No frontend change, so no Haiku review is needed.

## 7. Finish

- Follow RB §2 and RB §8.
- Suggested message: `test(backend): 测试会话隔离真实数据库与上传目录，并引入覆盖率统计`

## Rollback points

- If T3's `create_all` seeding is insufficient, fall back to `init_db()` against the temp file (design.md T3, last bullet). Record the reason.
- If the `CRF_ENV` pop breaks a test that silently relied on an inherited value, set the value explicitly in that test. Never re-export it globally.
