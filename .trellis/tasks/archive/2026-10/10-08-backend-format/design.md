# Design: one-shot `ruff format` for the backend

Baseline: `main` after `legacy-cleanup` merges. Probe numbers below were measured on `f68ebe1` (pre-cleanup) with the scripts in `research/` and are expected to shrink slightly.

## Preconditions (hard)

- `legacy-cleanup` is merged.
- Inspect open backend branches with `git worktree list` / `git branch --list` before starting. The coordinated exceptions are `feat/shared-rule-convergence` (Wave C agreement relayed by `crf-editor-ad`) and `feat/reference-delete-guard` (owner `crf-editor-0d` explicitly agreed to land after LC/BF and use the pre-format-branch merge recipe). Neither owner may merge while the format branch is being finalized; announce the config/format/merge hashes. These are merge-coordination agreements, not permission for this session to edit or commit their branches. Any other unexpected backend writer must be investigated before formatting.

## Tool and configuration

- `ruff==0.16.10` (latest stable on 2026-10-09) pinned in `backend/requirements-dev.txt`; installed into `~/.venvs/crf-editor` (user decision 2026-10-09: venv only, NOT on PATH, so the hook's ruff gate stays dormant for concurrent sessions).
- New `backend/ruff.toml` — format-only, no `[lint]` section, no rule selection (user approved format only):

  ```toml
  # 仅用于 ruff format（代码格式化）；不启用任何 lint 规则。
  # 版本固定在 requirements-dev.txt；行宽与引号按 2026-10-09 实测选取，使格式化改动最小。
  target-version = "py310"
  line-length = 120

  [format]
  quote-style = "double"
  ```

  - `target-version = "py310"`: README requires Python 3.10+; the venv is 3.10.21.
  - `ruff.toml` (not `pyproject.toml`): single-purpose file; avoids a `backend/pyproject.toml` that packaging tools or pytest could pick up (`backend/pytest.ini` stays the pytest config).
  - Ruff discovers the closest config per file, so `ruff format --check -- backend/src/x.py` run from the repo root (the hook) uses this file.

### Why 120 / double (measured on `f68ebe1`, 154 tracked `.py` files under `backend/`)

| line-length | quote-style | files changed | +lines | −lines |
|---|---|---|---|---|
| 88 | double | 145 | 8639 | 3225 |
| 100 | double | 144 | 5435 | 2686 |
| **120** | **double** | **143** | **3495** | **2880** |
| 120 | preserve | 143 | 3095 | 2477 |
| 120 | single | 154 | 11287 | 10721 |

- 120 gives the smallest diff (the code already has many long signatures).
- Double quotes dominate (forcing single quotes rewrites every file). `preserve` saves ~800 changed lines but leaves mixed quoting permanently and departs from ruff's default; the task's goal is one unified style.
- Effect on blank-line inflation: 26% → 21% overall; e.g. `routers/import_docx.py` 905 → 646 lines, `services/export_service.py` 4360 → 3614, `main.py` 653 → 529.
- Scope: only `backend/` (`main.py`, `app_launcher.py`, `src/`, `scripts/`, `tests/`). Python under `.trellis/scripts`, `.claude/hooks`, `.codex/hooks`, `.gemini/hooks` is tooling and is NOT formatted (run ruff from `backend/` with path `.`).

## Semantic-equivalence proof (R3)

`research/ast_equivalence.py <before-dir> <after-dir>` compares, per file, the raw `ast.dump` and a docstring-normalized `ast.dump` (each docstring line stripped, then the whole string stripped — the same normalization black uses, because the formatter legitimately rewrites docstring whitespace).

- Probe result on `f68ebe1`: raw AST differs in exactly 1 file; normalized AST differs in 0 files.
- The one raw difference: `tests/test_export_service.py::test_export_toc_entries_immediately_follow_title_without_blank_line` — the docstring starts with `"`, so ruff inserts a leading space to avoid `""""`. A test docstring; no runtime effect.
- Gate: normalized differences must be 0. Every raw-only difference must be listed with its before/after docstring in `verification.md` and must be docstring-whitespace only. Anything else blocks the commit.
- Then the full backend suite must match the pre-format baseline exactly (same passed/xfailed counts).

## Hook follow-up (R5)

Gate 4 already exists (added by `pre-commit-gate`): `ruff format --check "$f"` when `ruff` is on PATH. The spec (`git-and-tooling-conventions.md` §6, "backend-format integration") asks this task to settle two points; probed with ruff 0.16.10:

- `--` end-of-options is accepted (a clean `-foo.py` exits 0) → call `ruff format --check -- "$f"`.
- Exit 1 = would reformat; exit 2 = error (missing file, syntax error, bad config) → separate messages:

  ```sh
  if [ "$have_ruff" -eq 1 ]; then
      ruff format --check -- "$f"
      ruff_status=$?
      if [ "$ruff_status" -eq 1 ]; then
          fail "ruff format --check 未通过：$f（请运行 ruff format 修正后重新暂存提交）"
      fi
      if [ "$ruff_status" -ne 0 ]; then
          fail "ruff format --check 运行出错（状态码 $ruff_status，详情见上方输出）：$f"
      fi
  fi
  ```

- No hook test suite exists. Verify in a throwaway git repo under `/tmp/<dir>/` that runs the branch's hook with `PATH="/home/decade/.venvs/crf-editor/bin:$PATH"`: a staged clean `-foo.py` passes; a staged unformatted file fails with the "未通过" message; an invalid `ruff.toml` next to a staged file fails with the "运行出错" message. Record outputs in `verification.md`.
- Activation stays a user choice: Gate 4 only runs when `ruff` is on PATH. Do not install ruff on PATH in this task.

## Blame hygiene (R4)

- New repo-root `.git-blame-ignore-revs`:

  ```
  # ruff format 一次性统一后端格式（只改格式不改语义），git blame 跳过此提交。
  # 启用：git config blame.ignoreRevsFile .git-blame-ignore-revs
  <full 40-char hash of the format commit>
  ```

- The format commit's hash must survive the merge: merge with `--no-ff`; never rebase, amend or squash the branch after recording the hash.
- AC4 check: `git blame --ignore-revs-file .git-blame-ignore-revs -- backend/src/routers/import_docx.py | grep -c <short-hash>` is 0, while plain `git blame` shows the hash.

## Commits (lead commits; explicit paths)

1. `chore(backend): 引入 ruff 格式化配置并固定版本` — `backend/ruff.toml`, `backend/requirements-dev.txt`.
2. `chore(backend): ruff format 统一后端代码格式（只改格式，不改语义）` — only the reformatted `backend/**/*.py`. Nothing else may be staged.
3. `chore: 登记格式化提交并补充格式化说明` — `.git-blame-ignore-revs`, `.githooks/pre-commit` (R5), README.md / README.en.md, `backend/.claude/CLAUDE.md`, root `.claude/CLAUDE.md` (Common Commands + one Change Log line), `.claude/index.json` (if it lists config/commands), `.context/history/archives/claudemd-changelog.md`.
4. `docs(spec): 记录 ruff 格式化与 blame 忽略约定` — `.trellis/spec/guides/git-and-tooling-conventions.md` (and `.trellis/spec/backend/quality-guidelines.md` if it states formatting rules). Standalone `.trellis/` commit.

If gitleaks blocks commit 2 because a reformatted line no longer matches an anchored allowlist entry, unstage, fix `.gitleaks.toml` in its own commit first, then redo commit 2 (never `--no-verify`).

## Docs content

- README.md / README.en.md, section 测试 → 提交前检查 (and the English mirror): how to format (`cd backend && python -m ruff format .`, check with `--check`), where the version/config live, `git config blame.ignoreRevsFile .git-blame-ignore-revs`, and that the hook's ruff gate activates only when `ruff` is on PATH.
- `git-and-tooling-conventions.md` §6: replace the "backend-format integration" bullet with the settled facts (separator, exit codes, activation), and add a "merging a branch that predates the format commit" recipe:

  ```bash
  git merge <format-commit>^                    # first take everything before the format commit
  (cd backend && python -m ruff format .)       # pinned ruff + backend/ruff.toml
  git commit -am "chore(<scope>): 按 ruff 格式化本分支改动"
  git merge -X ours <format-commit>             # both sides are now formatted; keep the branch's hunks
  (cd backend && python -m ruff format --check .) && <full backend suite>
  ```

## Interaction with sibling tasks

- Format merging is exclusive; already-open coordinated branches may continue implementation under the explicit exceptions above and merge afterward using the recipe.
- `export-layer-cleanup` and `backend-dedup` branch from the formatted `main`; their new code must pass `ruff format --check`.
- Wave C branches created after this merge start formatted; branches created before must use the recipe above.

## Rollback

Revert commits 4 → 1 in reverse order (`git revert -m 1 <merge>` if already merged). The format commit is semantics-free, so a revert is safe but re-introduces the old formatting for every later change.
