# Show the imported template form immediately

## Goal

After importing forms from the template library, the current form workspace must immediately display the first form created by that import, without a browser reload, tab switch, or manual row click.

## Background and confirmed facts

- User report: importing template forms does not refresh the currently displayed form interface.
- The success path already clears caches and broadcasts `refreshKey` (`frontend/src/App.vue:649-668`); the designer consumes that signal (`frontend/src/components/FormDesignerTab.vue:424-432`). Therefore a missing refresh broadcast is not the cause supported by the source evidence.
- The canvas uses independent selected-form state and guarded switching (`frontend/src/components/FormDesignerTab.vue:1754-1814,3246-3251`), but template import never requests a new selection. Word import already uses a reusable ready bridge (`frontend/src/App.vue:677-683`; `frontend/src/composables/useDesignerFormSelection.js:3-36`).
- Template import creates new forms, including renamed collisions, and currently returns counts without their ids (`backend/src/services/import_service.py:656-663,779-821`). Its typed response is `ImportExecuteResponse` (`backend/src/schemas/template_import.py:31-37`), serialized by `backend/src/routers/import_template.py:109-140`.
- The refresh watcher reloads fields independently of the selection guard, so unsaved draft/property state must be explicitly covered by the regression before choosing the exact refresh/selection ordering (`frontend/src/components/FormDesignerTab.vue:400-432,1779-1807`).
- No runtime reproduction has run during planning. Source evidence and reusable patterns are in `research/template-import-refresh.md`; implementation must establish RED before editing production code.

## Approved decisions and constraints

- The user explicitly requested task creation, persistent planning, then execution by one Sonnet worker.
- The user chose: display the first newly imported form, while honoring existing save/discard/cancel guards.
- The user explicitly approved an additive `imported_form_ids` response field. Request parameters, existing response fields, database structure, import naming/ordering, and authorization semantics stay unchanged.
- Worktree: `/home/decade/crf-editor-template-import-refresh`; branch: `fix/template-import-refresh`; baseline: `229afe0`.
- The main session owns planning artifacts and final acceptance; the Sonnet worker is the sole implementation writer. The user subsequently authorized local commits, local merge into `main`, and rebuilding/restarting the existing local service for manual testing. No push, remote deployment, or destructive cleanup is authorized.

## Requirements

- **R1 — Authoritative import identity:** append `imported_form_ids` to the existing response as a list of actual target-project form ids, in the existing creation order. Its length equals `imported_form_count`; zero imports yield `[]`. Use a fresh per-response default for compatibility with existing callers/mocks.
- **R2 — Visible post-import selection:** after confirmed successful import, invalidate stale data and reuse `requestFormSelection` / `selectFormById` to show `imported_form_ids[0]`. Keep shared refresh for other activated tabs; do not use timers, full-page reload, component-remount hacks, guessed ids, name matching, or before/after list subtraction.
- **R3 — Preserve local work:** selection and refresh must not erase local drafts or dirty field/form properties before the existing guards run. Save/discard/cancel and busy checks retain their current meanings. Canceling the post-import switch keeps the original form/editor intact; the completed import remains visible in the list.
- **R4 — Scope and compatibility:** capture the target project at request start; a late success after project/session change must not select a form in another workspace. Failed requests, canceled dialogs, and empty selection do not run success-only selection. Zero imports or an older response without ids do not guess a target and still support ordinary refresh.
- **R5 — Truthful failures:** distinguish an import-write failure from a later failure to refresh/open an already-imported form; do not tell users that the import failed after its database write succeeded.
- **R6 — Verification and documentation:** add failing backend contract/service tests and frontend behavior regressions first, then the minimal implementation. Record RED/GREEN, related regressions, coverage, lint/build, actual diff review, import-security review, and feasible browser evidence. Update the bilingual READMEs, affected module notes, and `.claude/index.json` minimally for the new response/user-visible behavior.

## Acceptance criteria

- [x] **AC1 (R1):** service and HTTP response tests show ids for actual newly persisted target-project rows, never source/pre-existing ids; count/order agree, renamed collisions work, zero imports return an empty list, and legacy response construction remains compatible.
- [x] **AC2 (R2):** a real mounted App/designer flow proves successful template import refreshes the list and renders the first imported form's title and fields. Cover an empty project and a project with an existing selected form, plus multi-form import.
- [x] **AC3 (R3):** dirty/draft save/discard/cancel protection is exercised against the real designer; canceled switching retains the old selection and unsaved content even after shared refresh. Busy/undo/reorder contracts remain green.
- [x] **AC4 (R4/R5):** failure/cancel/empty/zero/legacy-id-missing cases do not select a guessed form; a late response cannot navigate another project/session; a post-write UI failure is reported as such.
- [x] **AC5 (R6):** targeted regressions are RED before production edits and GREEN afterwards; related backend/frontend suites, lint, build, security review, and main-session actual-diff review are reported with commands/results. Coverage must not decrease and must remain at least 80%; if tooling prevents a measurement, state the limit rather than asserting coverage.
- [x] **AC6 (R6):** browser validation exercises a running app when feasible. Use only synthetic/isolated data; no real database/config/credentials. If environment/login/tool limits block it, record the exact blocker and alternative validation without claiming browser E2E.

## Out of scope

- Rewriting Word/database import, adding source-template mutations, changing authentication/ownership/rate limits, renderer/layout/column-width changes, generic sorting lifecycle fixes, global cache redesign, new dependencies, and build/release-script changes.
- Real production or developer database/config access, credential inspection or new throwaway-credential generation without formal approval, external publication, commits/merges/pushes, and deployment.

## Planning status

Requirements and API scope are resolved. `design.md`, `implement.md`, and curated `implement.jsonl` / `check.jsonl` define the execution handoff; implementation starts only after `task.py start`.
