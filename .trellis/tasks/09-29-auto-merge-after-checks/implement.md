# Implement

Run backend commands from `backend/` with the proxy variables unset:
`env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy -u HTTPS_PROXY -u https_proxy /home/decade/.venvs/crf-editor/bin/python -m pytest ...`

1. **RED**: add `backend/tests/test_ci_merge_gate.py`, one behavior per test, covering every PRD contract bullet. Run it and confirm it fails against the current workflows.
2. **GREEN**:
   - Edit `.github/workflows/ci.yml` as in `design.md`: triggers, concurrency, and the `merge-owner-pr` job.
   - Delete `.github/workflows/auto-merge-draft-to-main.yml` and `.github/workflows/sync-to-gitee.yml`.
   - Rerun the contract test and confirm it passes.
3. **Syntax**: run actionlint on `.github/workflows/`. If it can be downloaded to `/tmp`, run it and delete the binary afterwards; otherwise report that it was not run. Also `yaml.safe_load` every workflow file.
4. **Suite**: run the backend full suite. The expected baseline is 922 passed / 2 skipped / 4 xfailed plus the new tests.
5. **Docs**, as listed in `design.md`: root `.claude/CLAUDE.md`, `backend/.claude/CLAUDE.md`, `.claude/index.json`, and `.trellis/spec/guides/git-and-tooling-conventions.md` §1.
6. **Review gate**:
   - trellis-check on the full diff.
   - A security pass on token permissions, script injection, fork and other-author exclusion, and fail-closed behavior.
   - Lead review of the actual diff.
7. **Finish**, only after the user authorizes commit and PR:
   - Commit as `ci(workflows): merge owner PRs only after CI passes`.
   - Push and open the PR (ready for review).
   - Watch the run with `gh run watch` / `gh pr view` and report the live result. Do not run `gh pr merge` by hand.

Rollback point: until the PR merges, nothing is live. After the merge, revert the merge commit.
