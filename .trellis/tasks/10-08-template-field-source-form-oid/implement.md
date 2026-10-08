# Implementation Plan and Task Board

## Authorization and isolation

User requested plan -> Sonnet execution and approved product decisions/task creation. Implementation started after planning review and `task.py start`. After verification on 2026-10-08, the user authorized separate code/Trellis commits, a local merge into main, and cleanup of this task's worktree and branch. Remote push is NOT authorized. Preserve all unrelated tasks and worktrees.

Authoritative root: `/home/decade/CRF-Editor/.claude/worktrees/template-field-source-form-oid`.
Branch: `worktree-template-field-source-form-oid` (base `main`, initially `03a2c31`).
Task: `.trellis/tasks/10-08-template-field-source-form-oid` in this worktree. The original main checkout contains only the initial planning stub; do not edit code or run tests there. Do not touch other pending tasks/worktrees.

## Ownership

- Lead Opus: plan/architecture, task metadata, cross-stack final review and browser verification coordination.
- Sonnet `trellis-implement`: the four production files from design.md, existing backend/frontend template-search tests, related documentation updates below, and the task verification log/checklist. Implement directly, do not recursively delegate.
- Sonnet `trellis-check`: full-diff code-reviewer/spec review after implementation; may make narrow fixes with rerun tests. No concurrent writers.
- Haiku read-only frontend review: after code stabilizes, report defects without writes.
- Documentation is sequential with implementation, not a separate concurrent writer.

## Ordered checklist

- [x] Requirements settled; PRD convergence pass completed (requirements, evidence, ACs, exclusions; no blocking questions).
- [x] Isolated worktree created.
- [x] Lead plan review, context-manifest validation, and task activation; independent narrow ranking review passed.
- [x] Read context manifests -> PRD -> design -> this plan; relevant `.context/prefs/` and module notes before edits.
- [x] Set up isolated test resources; record targeted baselines/coverage. (ignored worktree config.yaml + seeded DB from the previous session verified; RED reproduced on an isolated base snapshot `/tmp/tfs-red` — original session logs not persisted)
- [x] RED: add backend source-code and legacy tests; run and record expected missing-feature failures. (reproduced: 5 failed / 13 passed on base snapshot)
- [x] GREEN: backend additive schema, optional-column load, source plumbing; rerun targeted suite. (18 passed)
- [x] RED: add frontend formatting/ranking/wiring tests; run and record expected failures. (reproduced on base snapshot; final replay at the 45-case phase: 25 pass / 20 fail — the final 48-case file was not re-RED'd, see verification.md)
- [x] GREEN: search composition and inline source UI; rerun template/shared-ranking/clipboard tests. (final targeted 74 passed — historical phase runs 68/71; one wrong test expectation corrected — typo-tolerance-aware, production unchanged by the implement agent)
- [x] Synchronize documentation; log the chosen approach/API contract in the ignored branch session log.
- [x] Full feasible frontend/backend regression, lint/build, and changed-module coverage with no decrease; investigate any failure versus baseline. (backend 986 passed / 4 xfailed, targeted 18; frontend full 790 passed, targeted 74 — final snapshot, intermediate phases 784/787; lint 0 errors; build OK; frontend scoped coverage 100% line / 91.53% branch / 100% functions — 85.96% branch at the 45-case phase; backend via stdlib trace: both changed modules 100% vs base 100%, no decrease)
- [x] Sonnet full-scope check/code review and Haiku read-only frontend review; fix confirmed issues and reverify. (final immutable-array/candidate-helper refinement, 48 template tests and optional-source boundaries checked; Haiku final small-diff review passed)
- [x] Browser verification and final AC audit; record passed/failed/not-run distinctly. (DM/VS/alias search, inline sources, fallbacks, copy/paste, reopen state, clear/reset, refresh, 1450px light/dark + 600px narrow; final compiled asset index-BG2BlfWG.js checked and DM/metadata-exclusion reverified; console clean. Not performed: native touch, 10+-source performance, browser login-form flow)
- [x] Present diff/verification summary and worktree/task paths; obtain explicit Git authorization. User selected local commit/merge/own-worktree cleanup only (no push).
- [ ] Commit code and Trellis work separately; integrate the latest main in the task worktree and reverify before local main merge.
- [ ] Archive task and record session bookkeeping in separate Trellis commits; remove only this task's worktree and branch; do not push.

## Test environment safety

Python: `/home/decade/.venvs/crf-editor/bin/python` (3.10.21 verified); node 24.14.1. Unset all six proxy environment variables for Python tests. Do not use the system Python to run app tests.

Check whether `backend/tests/conftest.py` redirects runtime data to a temporary root. If not, create an ignored worktree-root `config.yaml` with absolute worktree-local database/upload paths and freshly generated auth/bootstrap values (never print/commit secrets). Do not copy main's config/data. Run init_db, then seed a user with id=1 and a project owned by id=1 if absent: a legacy permission-guard export test reads that configured DB. Disable background jobs during tests. Ensure all generated paths are ignored before running the suite. The known test-isolation task has not merged at the initial base.

Install existing locked frontend dependencies with `npm ci` only if absent; do not change package files or scripts. Do not run whole-project formatting. Large logs belong under `/tmp` or ignored worktree-local paths; report concise summaries and necessary failures.

## Validation commands (from worktree)

```bash
cd frontend
node --test tests/templateFieldSearch.test.js tests/searchRanking.test.js tests/searchRankingWiring.test.js tests/clipboardCopy.test.js
node --test tests/*.test.js
npm run lint -- --quiet
npm run build
node --test --experimental-test-coverage --test-coverage-include=src/composables/templateFieldSearch.js tests/templateFieldSearch.test.js
```

```bash
cd backend
env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY CRF_DISABLE_BACKGROUND_JOBS=1 /home/decade/.venvs/crf-editor/bin/python -m pytest tests/test_template_field_index.py -q
env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY CRF_DISABLE_BACKGROUND_JOBS=1 /home/decade/.venvs/crf-editor/bin/python -m pytest -q
# If pytest-cov is already installed, record changed-module coverage before and after:
env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY CRF_DISABLE_BACKGROUND_JOBS=1 /home/decade/.venvs/crf-editor/bin/python -m pytest tests/test_template_field_index.py --cov=src.services.template_field_index_service --cov=src.routers.template_fields --cov-report=term-missing -q
```

Do not install coverage tooling/dependencies without approval. If unavailable, report the exact limitation instead of claiming >=80%. Aim for >=80% on changed logic and no measured decrease. Source-level component tests are not runtime browser coverage.

## Browser checklist

Use a throwaway app DB/upload directory with background jobs disabled and the worktree's built frontend. Use a regular account (admins cannot access the workbench). No production service restart or real-project mutations.

Check: source OID/name already visible; no source popover; all lines for a multi-source field and a long form name readable; `仅字段库`/missing OID fallbacks; field-vs-form four-group ordering with a deterministic fixture; form-OID and label/alias search; blank search/page reset; paging and non-source click-to-copy; dialog reopen state; light/dark and narrow viewport. Record browser/environment blockers. A browser mock fixture must be labeled as such and supplemented by real API tests.

## Documentation scope

Update current behavior in `README.md`, `README.en.md`, root and both module `.claude/CLAUDE.md`, `.claude/index.json`, and `.trellis/spec/guides/cross-stack-contracts.md` section 12. Check other spec references to the old source-popover semantics and update only directly affected text. Keep LLM-facing docs English; preserve the established English counterpart README language. Avoid recounting unrelated inventories or rewriting historical changelogs. Root changelog entries stay one-line indexes.

Record verification in this task's `verification.md` with commands, RED/GREEN evidence, coverage, review outcomes, and any unrun checks. If commits are subsequently authorized, project-code/documentation changes and `.trellis/` changes must be separate commits, followed by local merge and confirmed cleanup; no PR/CI workflow.
