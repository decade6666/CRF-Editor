# Implementation plan: legacy-cleanup

Follow the parent runbook `/home/decade/CRF-Editor/.trellis/tasks/10-08-review-remediation/implement.md` (RB). Read `design.md` and `research/current-state.md` first.

- Branch: `refactor/legacy-cleanup`
- Worktree: `/home/decade/CRF-Editor-legacy-cleanup`
- Task docs (untracked, main checkout): `/home/decade/CRF-Editor/.trellis/tasks/10-08-legacy-cleanup/`
- Gate before step 1: the Wave C ordering decision has been relayed (design.md "Interaction with sibling tasks").

## 1. Start (lead)

```bash
cd /home/decade/CRF-Editor
python3 ./.trellis/scripts/task.py start .trellis/tasks/10-08-legacy-cleanup
python3 ./.trellis/scripts/task.py set-branch .trellis/tasks/10-08-legacy-cleanup refactor/legacy-cleanup
git worktree add /home/decade/CRF-Editor-legacy-cleanup -b refactor/legacy-cleanup main
cd /home/decade/CRF-Editor-legacy-cleanup/frontend && npm ci
```

## 2. Baseline (implementer) — record in `verification.md` (task dir)

```bash
PY="env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY /home/decade/.venvs/crf-editor/bin/python"
cd /home/decade/CRF-Editor-legacy-cleanup/backend && $PY -m pytest -q
cd /home/decade/CRF-Editor-legacy-cleanup/backend && $PY -m pytest -q --cov=src --cov=main --cov-report=term-missing:skip-covered   # note per-file % of every file you will edit
cd /home/decade/CRF-Editor-legacy-cleanup/frontend && npm test && npm run lint && npm run build
```

- Every command carries its own `cd` (cwd resets between Bash calls). If the harness refuses `env -u`, put the `unset`s and the pytest line in a script under a fresh `/tmp/<dir>/` and run it with `bash`.
- `npm test` = `node --test tests/*.test.js` + vitest mount tests (any Vue warning fails a mount test).
- Before editing, save `ruff check --isolated --select F401,F841` output for every production file you will edit (`/home/decade/.venvs/crf-editor/bin/ruff`).

## 3. Work order (smallest blast radius first)

1. D4 — delete `shrimp-rules.md`.
2. R7 — `backend/tests/test_export_validation.py` dead fixture/helper/imports. Run that file + the full backend suite.
3. D5 backend — `FieldRepository`, `FieldProfileResult`. Zero-reference greps first (`git grep -nw FieldRepository`, `git grep -n FieldProfileResult`).
4. D5 CSS — re-grep each selector (design.md D5), then delete. Record per-selector evidence.
5. D1 + D2 backend — perf removal, script/test deletion. Then the perf-strip AST proof and the F401/F841 comparison (design.md D1), then the full backend suite.
6. D3 + D2 frontend — move the five designer tests into `tests/formDesignerAuxiliaryData.test.js` FIRST and run it against the untouched component (must pass), then remove the perf calls and delete the files. Then `npm test`, `npm run lint`, `npm run build`.
7. D6 docs.

Do not commit (the lead commits per design.md "Commits"). Keep each step's files disjoint so the lead can stage them by path.

## 4. Final checks (implementer, then lead re-runs)

```bash
cd /home/decade/CRF-Editor-legacy-cleanup
git grep -nE "perf_span|record_counter|record_payload_size|from src\.perf|from src import perf|src\.perf|CRF_PERF_BASELINE|attach_perf_sql_listeners|performance_baseline" -- backend frontend .claude/index.json   # expect only historical changelog lines in backend/.claude/CLAUDE.md (list them)
git grep -nE "usePerfBaseline|collectBuildMetrics|runBrowserPerfBaseline|markPerfStart|markPerfEnd|recordPerfEvent|clearPerfEvents|perfBaselineHelpers|browserPerfBaselineScript" -- . ':!.trellis/tasks/archive' ':!.context/history'   # expect only historical changelog lines (list them)
test ! -e shrimp-rules.md && git diff --quiet main -- AGENTS.md .trellis/.template-hashes.json .codex/config.toml && echo AC3-ok
git diff --quiet main -- backend/src/utils.py backend/src/services/ai_review_service.py && echo AC4-mask-untouched
git grep -nE "def session|auth_headers|login_as|create_project|sessionmaker" -- backend/tests/test_export_validation.py   # expect no output
git grep -n "def engine" -- backend/tests/test_export_validation.py                                                     # expect one hit
git diff --check main
```

- Full backend suite + coverage (same commands as baseline): passed count = baseline − tests in the 7 deleted perf files; no new failures, skips or xfails. `test_perf_fk_indexes.py` passes.
- `npm test`: node:test count = baseline − deleted perf tests; the five moved tests pass; vitest unchanged. `npm run lint` 0 errors, `npm run build` passes.
- Coverage of every edited production file: no drop (removing perf-only branches can only raise it).

## 5. Review gates (lead, RB §6)

- `trellis-check` (sonnet) on `git diff main...HEAD` plus the working tree.
- `code-review` skill on the branch diff.
- Haiku read-only review of the frontend diff (`App.vue`, `FormDesignerTab.vue`, `main.css`, the moved test).
- The lead reads the whole diff and reconciles `git status` against this plan's inventory before committing.

## 6. Report (implementer → lead)

Files deleted/edited per step; the perf-strip AST proof output; F401/F841 before/after; per-selector CSS evidence; suite counts vs baseline; coverage of edited files; anything kept-and-reported (side-effect RHS, helpers that became unreferenced, "默认值支持" not located).

## Rollback points

Each commit is independent (design.md "Commits"). If the AST proof fails on a file, restore that file from `main` and redo it.
