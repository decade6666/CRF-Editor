# Implementation handoff: Word 填写线最长 20 个字符

## Phase gate and ownership

- The user confirmed the final requirements on 2026-09-30; the task remains **planning**. This session only prepares artifacts. Do not run `task.py start` or edit application code until the user switches to Sonnet and requests implementation.
- Implement on `feat/word-underline-limit` in `/home/decade/CRF-Editor-word-underline-limit`, not on `main`. Confirm `python3 ./.trellis/scripts/task.py current --source` from that worktree; read both context manifests, `prd.md`, `design.md`, and the research files. Do not touch the two unrelated untracked tasks in the main worktree.

## Ordered work (after approval)

1. **Baseline and RED**: consult backend/frontend module docs and relevant specs. Run existing targeted backend/frontend fill-line tests, then add failing regressions: backend width helper caps at 20 (20 at and above boundary, narrower columns retain computed count); normal/inline exported `.docx` text never exceeds 20; frontend helper caps at 20, generated HTML does not stretch beyond the equivalent 10em in a wide `.word-page` flex cell, manually entered underscores/default values are not capped. Assert fixed 16, unit suffix, `|__|` slot patterns and narrow-column behavior stay intact. Verify new tests fail for the *old* implementation before writing production code.
2. **GREEN backend/frontend**: change only the two matching `FILL_LINE_MAX_CHARS` constants to 20. Add the smallest renderer change that caps **only auto-generated** fill-line span display width in preview; keep the shared `.fill-line` class/base style and `toHtml` for manually entered text unchanged. Do not modify data models, form values, exported numeric/date slots, or build scripts. Rerun targeted tests.
3. **Parity and documentation**: run `node frontend/scripts/generatePlannerFixtures.mjs`, inspect fixture diff, keep only meaningful fixture changes. Sync `.trellis/spec/guides/cross-stack-contracts.md` §5 and applicable `README.md` / `README.en.md` / module `.claude/CLAUDE.md` descriptions of the old 80-character limit; update `.claude/index.json` only if the index is impacted. Check both portrait and landscape and standalone inline width overrides; do not widen scope to pre-existing empty-choice or date-format divergences.
4. **Visual and comprehensive check**: use a temporary local app/database to measure actual DOM widths of generated fill lines in designer/visit previews for wide and narrow columns; compare to the equivalent of 20 characters (10em under the existing preview renderer), and confirm manual-underscore spans retain prior behavior. Inspect exported `.docx` text and strict preview/export parity for the same form. Run relevant suites and coverage, lint/build, then request a `trellis-check` / code-reviewer pass on the full diff. If browser or DOCX comparison cannot run, report the blocker and narrower evidence; do not assert visual parity from source-only tests.
5. **Finish gate**: inspect `git diff --check`, full diff, and context/spec synchronization. Return for PRD revision if implementation reveals a product-scope conflict. Only commit/push/open a PR after the user's explicit authorization; never push `main` or merge directly.

## Suggested validation commands

Run commands **from the isolated worktree**; backend interpreter is the verified local venv. The local `frontend/node_modules` directory is currently absent in this worktree, so install dependencies from the existing lockfile only when necessary and authorized by the implementation phase; do not add or upgrade dependencies.

```bash
cd backend && env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY /home/decade/.venvs/crf-editor/bin/python -m pytest tests/test_fill_line_width.py tests/test_export_service.py tests/test_export_unified.py tests/test_word_table_parity.py
cd frontend && node --test tests/columnWidthPlanning.test.js tests/wordPageGeometry.test.js tests/fillLineMaxLength.test.js
cd frontend && node --test tests/*.test.js && npm run lint && npm run build
cd backend && env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY /home/decade/.venvs/crf-editor/bin/python -m pytest --cov=src --cov-report=term-missing
```

`tests/fillLineMaxLength.test.js` is a *planned* new test, not an existing file. If the case belongs more naturally in `columnWidthPlanning.test.js`, use that file instead and adjust the targeted command. Frontend coverage must not decrease; document tools/metrics available. Check `backend/scripts/compare_word_table_parity.py` inputs before running it on disposable local preview/export evidence.

## Rollback points

- If count parity breaks, restore **both** front/back shared constants together before retrying; do not ship one-sided counts.
- If the preview cap changes user-authored underscores or causes narrow-cell overflow, revert only the generated-HTML cap and redesign the scoped styling while keeping count tests green.
- No schema migration, configuration rollout, or persistent data rewrite is part of this task.
