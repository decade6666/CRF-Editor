# Implementation plan: export-layer-cleanup

Follow the parent runbook `/home/decade/CRF-Editor/.trellis/tasks/10-08-review-remediation/implement.md` (RB). Read `design.md` and `research/current-state.md` first (re-anchor by function name; the research predates formatting).

- Branch: `refactor/export-layer-cleanup`
- Worktree: `/home/decade/CRF-Editor-export-layer-cleanup`
- Task docs (untracked, main checkout): `/home/decade/CRF-Editor/.trellis/tasks/10-08-export-layer-cleanup/`
- `PY` as in RB §3; `RUFF=/home/decade/.venvs/crf-editor/bin/ruff`.

## 1. Start (lead)

```bash
cd /home/decade/CRF-Editor
python3 ./.trellis/scripts/task.py start .trellis/tasks/10-08-export-layer-cleanup
python3 ./.trellis/scripts/task.py set-branch .trellis/tasks/10-08-export-layer-cleanup refactor/export-layer-cleanup
git worktree add /home/decade/CRF-Editor-export-layer-cleanup -b refactor/export-layer-cleanup main
```

Announce the branch and its file list to the Wave C session (`crf-editor-ad`) before the first edit.

## 2. Baseline (implementer) — record in `verification.md`

```bash
cd /home/decade/CRF-Editor-export-layer-cleanup/backend && $PY -m pytest -q
cd /home/decade/CRF-Editor-export-layer-cleanup/backend && $PY -m pytest -q --cov=src --cov-report=term-missing:skip-covered   # note export_service.py / field_rendering.py %
cd /home/decade/CRF-Editor-export-layer-cleanup/frontend && npm ci && node --test tests/columnWidthPlanning.test.js
```

Plus: McCabe complexity of `_add_forms_content`, `_add_field_row`, `_add_inline_table`, `_add_log_row`, `_add_label_row` (AST counter script under `research/`).

## 3. Steps — STOP after each one and report to the lead

The lead commits each step separately (design.md "Commits"), then tells you to continue. Never start the next step before the lead's go-ahead, and never stage or commit.

| Step | Work | Checks before reporting |
|---|---|---|
| 0 | Write the golden harness (design.md Step 0); capture `/tmp/export-golden/before`; show the layout-mode coverage printout | harness runs twice with identical output |
| 1 | R1 — convert the 3 live test groups first, run them green against the untouched code, then delete the unified path and the 4 xfail tests | golden compare = identical; export test files; full suite: passed unchanged except converted tests, xfailed −4 |
| 2 | R3 — option labels | golden; `test_width_planning.py`, `test_import_service.py`, export tests; `node --test tests/columnWidthPlanning.test.js` |
| 3 | R2 — structure-row helper | golden; export tests |
| 4 | R4 — control-dispatch helper | golden; export tests; full suite |
| 5 | R5 — `database_export_service.py` | `test_export_validation.py`, `test_project_import.py`, `git grep -n "export_full_database\|export_project_database\|export_user_projects_database\|_vacuum_sqlite_file" -- backend` shows only the new module + updated imports; F401/F841 no new findings |
| 6 | R6 — split `_add_forms_content` | golden; complexity table (every new/changed function ≤ 50 lines, cx ≤ 10); full suite |
| 7 | Docs + spec (keep spec edits in `.trellis/spec/**` only, so they commit separately) | `git diff --check` |

For every step: `cd backend && $RUFF format --check .` must pass (format your edits with `$RUFF format <files>`).

## 4. Final checks

- Full backend suite + coverage vs baseline: no new failures; `export_service.py` / `field_rendering.py` / new module coverage not lower than the moved code's baseline.
- Golden: final `after/` identical to `before/` for both plain and annotated exports.
- Parity CLI on the golden project (design.md "Parity evidence"); `test_word_table_parity.py` green.
- `git grep -n unified_landscape -- backend` → no hits.
- `git diff --check main`.

## 5. Review gates (lead, RB §6)

`trellis-check` (sonnet) on the full branch diff; `code-review` skill; no frontend diff → no Haiku review (state it). The lead reads every step's diff before committing it.

## 6. Report (implementer → lead, per step and final)

Changed functions, golden verdict, test counts, complexity numbers, anything kept-and-reported.

## Rollback points

One commit per step; the golden `before/` snapshot stays valid for the whole branch.
