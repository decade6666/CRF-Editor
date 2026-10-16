# Execution plan and task board

## Authorization and ownership

The user authorized planning, Sonnet execution, automatic display of the first newly imported form, and the additive `imported_form_ids` response. Execute only in `/home/decade/crf-editor-template-import-refresh` on `fix/template-import-refresh`, after task status is `in_progress`. One Sonnet worker writes the implementation slice; the main session reviews and accepts it. The user subsequently authorized local commits, local merge into `main`, and rebuild/restart of the existing local service for manual testing; no remote push/deployment or deletion is authorized.

## Task board

- [x] Investigate the existing producer/consumer refresh chain and import response.
- [x] Resolve post-import selection behavior and additive API scope with the user.
- [x] Converge PRD; persist design, execution plan, research, and context manifests.
- [x] Validate planning artifacts, activate the task, and dispatch Sonnet (`template-import-refresh` channel; `sonnet-impl`; provider `claude`; requested model `sonnet`; launched 2026-10-16 14:39 +08:00).
- [x] RED: reproduce missing imported-id contract and missing visible import-to-selection behavior; reproduce draft/dirty guard interactions before editing production code.
- [x] GREEN: minimally add actual created ids, response serialization, guarded frontend selection, and necessary refresh-state protection.
- [x] Run targeted and related regressions, coverage, lint/build, security review, and feasible browser validation.
- [x] Update the bounded docs/index scope; record exact commands/results/blockers in `verification.md`.
- [x] Main session inspects the actual diff and runs acceptance checks; report status without committing or publishing.

## Ordered implementation

1. Read curated `implement.jsonl`, then `prd.md`, `design.md`, this file, project/module rules, and prefs. Load `trellis-before-dev` and TDD guidance. Confirm branch/status and establish baseline using existing isolated test infrastructure.
2. Write backend tests for actual target ids/order/count, multi-import + renamed collision, zero imports, schema compatibility, and HTTP serialization. Reuse existing fixtures; do not mock the service behavior under test.
3. Write frontend behavior tests using actual App/designer components or the existing real-composable harness conventions, mocking only network/SortableJS boundaries. Assert the new preview title/fields, not merely a call to a stubbed selection method. Cover empty/existing project, first of multiple forms, guards/cancel, rejected import, absent ids, stale target project, and honest post-write UI errors.
4. Run the new tests against the baseline and record meaningful RED failures. Test failures caused by harness/setup mistakes do not count as reproduction.
5. Implement within the exclusive scope from `design.md`. Reuse `requestFormSelection` and existing selection guards; preserve refresh notifications for other activated tabs. Check all response-model constructors/mocks before changing schema. No speculative lifecycle refactor.
6. Run narrow GREEN tests and relevant history/draft/property/reorder/import regressions. Inspect actual `git diff`; fix only task-related findings incrementally.
7. Run broader backend/frontend tests and coverage where available, lint, build, and scoped formatting checks. Perform an import-security review and synthetic-data browser validation if tools permit; otherwise state the blocker. Do not generate new throwaway credentials or inspect real credentials/config/database without formal approval.
8. Make minimal behavior/contract documentation updates and report exact changed-file inventory plus command/results in task `verification.md`. Do not update planning artifacts or mark acceptance on behalf of the main session.

## Validation commands

Check executable/tool availability first. Every command must explicitly `cd` into this worktree; never accidentally validate the main checkout.

```bash
cd /home/decade/crf-editor-template-import-refresh/frontend && npm ci
cd /home/decade/crf-editor-template-import-refresh/frontend && npx vitest run tests/component/TemplateImportSelection.spec.js
cd /home/decade/crf-editor-template-import-refresh/frontend && node --test tests/templateImportSelection.test.js tests/useDesignerFormSelection.test.js tests/importRenameFeedback.test.js tests/formDesignerAuxiliaryData.test.js tests/designerHistory.test.js tests/designerNewFieldDraft.test.js tests/quickEditBehavior.test.js
cd /home/decade/crf-editor-template-import-refresh/frontend && npm test
cd /home/decade/crf-editor-template-import-refresh/frontend && npm run lint
cd /home/decade/crf-editor-template-import-refresh/frontend && npm run build
cd /home/decade/crf-editor-template-import-refresh/backend && /home/decade/.venvs/crf-editor/bin/python -m pytest tests/test_template_import_selection.py tests/test_import_service.py tests/test_import_template_error_mapping.py -q
cd /home/decade/crf-editor-template-import-refresh/backend && /home/decade/.venvs/crf-editor/bin/python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered -q
cd /home/decade/crf-editor-template-import-refresh/backend && /home/decade/.venvs/crf-editor/bin/python -m ruff format --check src/services/import_service.py src/schemas/template_import.py tests/test_template_import_selection.py
cd /home/decade/crf-editor-template-import-refresh && git diff --check
```

Use the actual test filenames if the worker chooses a minimal extension of existing tests instead of a new optional file. For localhost-bound pytest, unset the six proxy variables only for that invocation (a `/tmp` runner script is the established fallback if an inline guard rejects `env -u`); the hermetic conftest must remain in use. Do not mask failures with `|| true`. Do not install/add a coverage provider or change package/build/test scripts; if frontend coverage cannot be measured with installed tools, state this explicitly and provide the best available scoped evidence.

## Risk/check points

- Success refresh can remove draft state before the selection guard: real regression required.
- API response-model filtering can silently discard a service-only new field: HTTP assertion required.
- Source ids and duplicate names are not target ids: verify persisted rows/project scope.
- Selection may fail after a successful import: do not misreport transaction failure.
- Existing same-form identity and busy/history/reorder behavior must remain unchanged.
- Keep all generated artifacts out of Git, do not touch the running production/local-user service or real database, and do not remove temporary artifacts without the applicable approval.
