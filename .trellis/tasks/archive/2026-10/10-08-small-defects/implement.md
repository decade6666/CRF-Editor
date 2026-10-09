# Implementation plan: six small defect fixes

Follow the parent runbook `/home/decade/CRF-Editor/.trellis/tasks/10-08-review-remediation/implement.md` (RB).

- Branch: `fix/small-defects`
- Worktree: `/home/decade/CRF-Editor-small-defects`

## 1. Start

```bash
cd /home/decade/CRF-Editor
python3 ./.trellis/scripts/task.py start .trellis/tasks/10-08-small-defects
python3 ./.trellis/scripts/task.py set-branch .trellis/tasks/10-08-small-defects fix/small-defects
git worktree add /home/decade/CRF-Editor-small-defects -b fix/small-defects main
cd /home/decade/CRF-Editor-small-defects/frontend && npm ci
```

- Use the throwaway backend config (RB §3) only if `test-isolation` has not merged yet.
- Record the baselines:
  - the full backend suite;
  - `node --test tests/*.test.js`;
  - `npm run lint`;
  - backend coverage of the touched files, if `pytest-cov` is available.

## 2. Per defect, in this order: F6 → F5 → F1 → F2 → F4 → F3

Smallest and lowest-risk first; the frontend and contract change goes last.

For each defect:

1. Write the RED test from design.md and run it. Confirm it fails for the stated reason.
2. Apply the minimal fix from design.md.
3. Run the targeted tests, then the full backend suite (and the frontend suite for F3).
4. Update the docs that belong to this defect (F3: contract §3).
5. Ask the user for commit authorization, or batch the six authorizations if the user prefers. Then commit with the message from design.md, staging only this defect's files.

Defect-specific notes:

- **F1**:
  - Before writing `_NON_COPIED`, read `backend/src/models/form_field.py` and both existing copy sites.
  - If either copies a column that the model-derived list would treat differently, stop and report the difference instead of guessing.
- **F2**: the existing test asserting `ok is False` is the bug's lock-in. Changing it is the RED step, not a weakening.
- **F4**:
  - confirm `get_plain_session` is overridden in the conftest `client` fixture;
  - confirm the admin route's guards (404 / 400) still run before any write.
- **F3**:
  - read every request path in `useApi.js` before editing, and keep the generation-guard semantics of `cachedGet` intact;
  - then run the read-only Haiku review on the frontend diff (RB §6).

## 3. Final checks (RB §6)

- `git diff --check`.
- Full backend suite against the baseline.
- `node --test tests/*.test.js`, `npm run lint`, `npm run build`.
- Coverage of the touched backend files: no drop.
- `trellis-check` (sonnet) on the whole branch diff.
- The `code-review` skill.
- The `security-review` skill on the F3 diff (auth flow).
- Haiku review of the frontend diff, if not already done in step 2.
- Browser smoke test (RB §4), focused on what changed. Report anything not verified.
  1. Copy a form whose fields have colors and font sizes, and confirm the copy keeps them in the designer preview.
  2. Trigger an aCRF export with corrupt annotation positions, if reproducible through the UI. Otherwise rely on the API test and say so.
  3. Log out and in as another user while a slow request is in flight. This is optional: the timing is hard to reproduce, and the node:test covers it.

## 4. Docs (RB §7)

- `.trellis/spec/guides/cross-stack-contracts.md` §3, in the F3 commit.
- `backend/.claude/CLAUDE.md` and `frontend/.claude/CLAUDE.md`: Change Log entries.
- Root `.claude/CLAUDE.md`: one Change Log line. Append the full narrative to `.context/history/archives/claudemd-changelog.md`.
- README: no user-facing change expected. Re-check that the export failure text does not appear there.

## 5. Finish

Follow RB §2 and RB §8.

## Rollback points

- Each defect is its own commit and can be reverted independently.
- If F4's switch to `get_plain_session` causes unexpected behavior in the admin route, fall back to unlinking via a FastAPI `BackgroundTasks` callback. Verify with the same after-commit listener test that it runs after `get_session` commits, and record the reason.
