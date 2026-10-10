# Implementation plan: backend-dedup

Follow the parent runbook `/home/decade/CRF-Editor/.trellis/tasks/10-08-review-remediation/implement.md` (RB). Read `design.md` and `research/current-state.md` first (re-anchor by name; the research predates formatting).

- Branch: `refactor/backend-dedup`
- Worktree: `/home/decade/CRF-Editor-backend-dedup`
- Task docs (untracked, main checkout): `/home/decade/CRF-Editor/.trellis/tasks/10-08-backend-dedup/`
- `PY` as in RB §3; `RUFF=/home/decade/.venvs/crf-editor/bin/ruff`.

## 1. Start (lead)

```bash
cd /home/decade/CRF-Editor
python3 ./.trellis/scripts/task.py start .trellis/tasks/10-08-backend-dedup
python3 ./.trellis/scripts/task.py set-branch .trellis/tasks/10-08-backend-dedup refactor/backend-dedup
git worktree add /home/decade/CRF-Editor-backend-dedup -b refactor/backend-dedup main
```

Announce the branch and file list to the Wave C session (`crf-editor-ad`) before the first edit.

## 2. Baseline (implementer) — record in `verification.md`

```bash
cd /home/decade/CRF-Editor-backend-dedup/backend && $PY -m pytest -q
cd /home/decade/CRF-Editor-backend-dedup/backend && $PY -m pytest -q --cov=src --cov-report=term-missing:skip-covered   # note % of every file you will edit
```

Plus McCabe complexity of `_migrate_add_order_index`, `_heal_reserved_admin_account` and each `OrderService` method (AST counter under `research/`).

## 3. Items — STOP after each one and report to the lead

The lead reviews and commits each item (design.md "Commits"), then tells you to continue. Never stage or commit. Never start the next item early.

| # | Item | Test-first step | Done when |
|---|---|---|---|
| 1 | R4b admin healing move | characterization tests for all 10 branches, green on current code | moved; tests import the new module; full suite green |
| 2 | R4a backfill helper | old-schema sample + double-`init_db` idempotency test, green on current code | 6 blocks via helper; cx ≤ 10; migration tests green |
| 3 | R2 copy-name helper | per-site ladder tests (0/1/2 collisions), green on current code | sites switched (or kept-and-reported); tests green |
| 4 | R3 template-import errors | missing 404 / 400 / `TEMPLATE_INCOMPATIBLE` cases per endpoint | one function; tests green |
| 5 | R5 OrderService twins | sequence-family characterization + init-asymmetry test | twins share private impls; all ordering tests green |
| 6 | R1 batch-delete limits | RED: `[]` and 501 ids → 422 on both endpoints (fail now) | GREEN; empty-list test rewritten; admin 400 tests unchanged |
| 7 | R6 model moves | `app.openapi()` builds before and after | models in `schemas/`; full suite green |
| 8 | Docs (+ spec in `.trellis/spec/**` only) | — | `git diff --check` clean |

For every item: `cd backend && $RUFF format --check .` passes (format your edits with `$RUFF format <files>`), and the full backend suite passes before you report.

## 4. Final checks

- Full suite + coverage vs baseline: no new failures; coverage of edited files does not drop.
- `git grep -n "class BatchDeleteRequest" -- backend` → exactly one hit (`schemas/__init__.py`).
- `git grep -n "_heal_reserved_admin_account\|def heal_reserved_admin_account" -- backend/src` → only the new module + the `init_db` call.
- Complexity table: `_migrate_add_order_index` and the new helpers ≤ 10.
- `git diff --check main`.
- `git diff main --stat -- frontend` is empty.

## 5. Review gates (lead, RB §6)

- `trellis-check` (sonnet) on the full branch diff.
- `code-review` skill.
- Security review (read-only sonnet sub-agent applying the `security-review` checklist) on item 1 (admin bootstrap) and item 6 (input bounds). No Critical/High may remain.
- No frontend diff → no Haiku review (state it).

## 6. Report (implementer → lead, per item and final)

Changed files, tests added (and which were characterization vs RED → GREEN), suite counts, complexity numbers, anything kept-and-reported (e.g. a ladder that did not match the table).

## Rollback points

One commit per item; item 6 is the only behavior change.
