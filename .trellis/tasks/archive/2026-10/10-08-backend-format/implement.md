# Implementation plan: backend-format

Follow the parent runbook `/home/decade/CRF-Editor/.trellis/tasks/10-08-review-remediation/implement.md` (RB). Read `design.md` first.

- Branch: `chore/backend-format`
- Worktree: `/home/decade/CRF-Editor-backend-format`
- Task docs (untracked, main checkout): `/home/decade/CRF-Editor/.trellis/tasks/10-08-backend-format/`
- `RUFF=/home/decade/.venvs/crf-editor/bin/ruff` (0.16.10). `PY` as in RB §3.

## 1. Start (lead)

```bash
cd /home/decade/CRF-Editor
git worktree list && git branch --list          # reconcile writers with the coordinated exceptions in design.md
python3 ./.trellis/scripts/task.py start .trellis/tasks/10-08-backend-format
python3 ./.trellis/scripts/task.py set-branch .trellis/tasks/10-08-backend-format chore/backend-format
git worktree add /home/decade/CRF-Editor-backend-format -b chore/backend-format main
```

## 2. Baseline (implementer) — record in `verification.md`

```bash
cd /home/decade/CRF-Editor-backend-format/backend && $PY -m pytest -q
```

## 3. Config commit content

1. Create `backend/ruff.toml` exactly as in design.md.
2. Append `ruff==0.16.10` to `backend/requirements-dev.txt` under a `# Formatting` comment.
3. `cd backend && $RUFF format --check . | tail -1` — note the "N files would be reformatted" count.
4. Stop and report: the lead makes commit 1 before any file is reformatted.

## 4. Format (after commit 1)

```bash
SNAP=$(mktemp -d /tmp/backend-format-snap.XXXXXX) && mkdir -p "$SNAP/before" "$SNAP/after"  # record this unique path in verification.md
cd /home/decade/CRF-Editor-backend-format/backend && git ls-files '*.py' | while read f; do mkdir -p "$SNAP/before/$(dirname "$f")"; cp "$f" "$SNAP/before/$f"; done
cd /home/decade/CRF-Editor-backend-format/backend && $RUFF format .
cd /home/decade/CRF-Editor-backend-format/backend && $RUFF format --check .            # 0 files would be reformatted (also proves the result is stable)
cd /home/decade/CRF-Editor-backend-format/backend && git ls-files '*.py' | while read f; do mkdir -p "$SNAP/after/$(dirname "$f")"; cp "$f" "$SNAP/after/$f"; done
/home/decade/.venvs/crf-editor/bin/python /home/decade/CRF-Editor/.trellis/tasks/10-08-backend-format/research/ast_equivalence.py $SNAP/before $SNAP/after
cd /home/decade/CRF-Editor-backend-format && git status --short | grep -v '\.py$'            # must print nothing: only .py files changed
```

- Gate: `normalized_ast_diff=0`; list every raw-only file with its docstring before/after (design.md R3).
- Full backend suite: identical counts to the baseline.
- Record per-file line counts before/after for the files named in the PRD Background.
- Stop and report: the lead makes commit 2 (format only).

## 5. Follow-up (after commit 2)

1. `.git-blame-ignore-revs` with the full hash of commit 2 (`git -C /home/decade/CRF-Editor-backend-format rev-parse HEAD`), formatted as in design.md. AC4 check from design.md.
2. Hook change (design.md R5) in `.githooks/pre-commit`, then the three throwaway-repo scenarios; record outputs. `sh -n .githooks/pre-commit` must pass.
3. Docs (design.md "Docs content" + RB §7): README.md / README.en.md (semantically identical), `backend/.claude/CLAUDE.md`, root `.claude/CLAUDE.md` Common Commands + one Change Log line, `.context/history/archives/claudemd-changelog.md`, `.claude/index.json` if relevant.
4. Spec: `.trellis/spec/guides/git-and-tooling-conventions.md` §6 (+ backend quality-guidelines if it states formatting rules). Keep spec edits in separate files from the rest so the lead can commit them separately.
5. `git diff --check main` (working tree included) clean; `cd backend && $RUFF format --check .` clean; full backend suite unchanged.

## 6. Review gates (lead, RB §6)

- `trellis-check` (sonnet) on commits 1, 3, 4 and the hook change (commit 2 is verified by the AST proof, `ruff format --check` and the suite — reviewers must not hand-edit it).
- `code-review` skill on the non-format commits.
- No frontend diff → no Haiku review; `node --test` not run (state it in the report).

## 7. Report (implementer → lead)

Ruff version/config, files reformatted, AST proof output, suite counts vs baseline, line-count deltas, hook scenario outputs, docs touched, anything unexpected.

## Rollback points

- Before commit 2: delete the worktree; nothing else changed.
- After merge: `git revert -m 1 <merge-commit>`; see design.md.
