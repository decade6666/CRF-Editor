# Frontend AI Review Removal Boundary

## Baseline / Upstream Integration

The file:line anchors below refer to the task's inspected base `5e174865a777d7cc0f14c3a8ed6718233cdbe2db`. While planning, the independently authorized `settings-dialog-layout` session merged into shared `main` at `04df78169fcc1ae2e60a1e0c8dc81a3ab07a6668`. A inspected `git diff HEAD..main -- frontend/src/App.vue` plus related test/spec excerpts read-only; this task branch is not yet advanced. After execution approval, fast-forward to the latest verified main before measuring baselines/dispatch, reread affected current files and update the dispatch base. Never reconstruct the old settings markup from these earlier anchors.

The new settings UI keeps 账号 / 界面 / 项目与数据 cards, account-row logout, boolean segmented edit-mode/theme controls, compact accessible transfer actions, responsive dialog-root/body scrolling and admin-only footer. Delete only the dedicated `settings-ai-title` section, its form/test state and `.settings-ai-result` CSS; retain all other new layout behavior. The new frontend spec's `Settings Cards and Binary Preferences` section (`main:.trellis/spec/frontend/component-guidelines.md:144-157`) needs only its now-obsolete `global/AI configuration` phrase updated by A after implementation. `appSettingsShell.test.js` and `agentAccessWiring.test.js` contain no AI-specific positive assertion on this main revision, so remain read-only regression targets. No settings test file was added or renamed upstream.

## Evidence

| Surface | Verified code | Removal / preservation boundary |
| --- | --- | --- |
| Administrator settings | `frontend/src/App.vue:432-443,491-559,1131-1181` | Remove `ai_*` form fields, AI test state/call/result and review settings markup. Keep template-path read/save, account/theme controls and ordinary-user transfer controls. |
| Agent access sibling | `frontend/src/App.vue:561-568,1100-1112` | Adjacent but unrelated; keep project-bound entry and lifecycle. Run existing `AppAgentAccess` and `agentAccessWiring` regressions. |
| Wizard upload/selection/results | `frontend/src/components/WordImportDialog.vue:50-89,129-162,175-251` | Keep three steps, upload action/headers/10 MiB guard, form select-all, compare, import error/result display, and `open-designer` handoff. |
| Wizard AI surfaces | `frontend/src/components/WordImportDialog.vue:23-35,90-127,163-174,252-256,280-290` | Remove alerts/tags, global accept/cancel controls, AI compare props/events and dedicated CSS. `Loading` is still used for ordinary upload/import and must remain. |
| Comparison / evidence | `frontend/src/components/DocxCompareDialog.vue:11-29,74-89,139-142,187-243,329-348` | Keep left screenshot and right deterministic CRF preview, field-click forwarding, orientation, close behavior and responsive layout. |
| Comparison AI state | `frontend/src/components/DocxCompareDialog.vue:31-73,95,106-137,144-184,244-327` | Remove all suggestion UI/state/events and AI props on the simulated preview. |
| Per-dialog import state | `frontend/src/composables/useWordImport.js:14-43,272-395,412-452` | Keep visibility reset, upload/error guard, selection, execute payload `{temp_id, form_indices}`, cache refresh and results. Simplify only AI-related factories/wiring. |
| Polling / overrides | `frontend/src/composables/useWordImport.js:4-12,46-270,317-321,363-370,397-409` | Remove AI helper imports, status timers/GET, acceptance/reconciliation/payload generation, and AI-only disposal state. Do not expand into unrelated async race fixes. |
| Preview rendering | `frontend/src/components/SimulatedCRFForm.vue:8-44,76-83,97-134,207-213,238-242` | Remove AI badges/styles, `aiSuggestions` / `viewMode` and AI field expansion. Keep pure parsed-field preview, default normalization, labels/colors, paper orientation, planner and column-cache behavior. |
| Exclusive helper | `frontend/src/composables/docxAiSuggestionOverrides.js` | Candidate tracked-file deletion after explicit plan approval; consumers are the wizard and simulated preview only. |

## Direct Test Consumers

- `frontend/tests/component/WordImportDialog.spec.js`: replace AI-only cases with absence/no-poll/no-override assertions; retain upload, three steps, failure paths, initial-open, host v-model round trip, cache refresh, compare identifiers and designer event.
- `frontend/tests/component/AppSettingsBehavior.spec.js:106-221`: replace administrator AI tests with absence and template-only request assertions; preserve other settings behaviors.
- `frontend/tests/docxBimodalPreview.test.js:54-94`: retire positive AI source contracts, assert deterministic preview wiring instead; retain screenshot locator/left-panel assertions and App/wizard ownership contracts.
- `frontend/tests/docxAiSuggestionAcceptance.test.js`: AI-only helper suite, candidate tracked-file deletion with its helper.
- Proposed `frontend/tests/component/DocxCompareDialog.spec.js`: real comparison/simulated-preview behavior regression; mock only screenshot API boundary when needed, not the preview under test. Prove screenshot + effect panels remain, parsed field types remain, field click reaches evidence panel, and no accept/status controls exist.
- Existing read-only regression scope: `frontend/tests/agentAccessWiring.test.js`, `tests/component/AppAgentAccess.spec.js`, `tests/component/AppWorkspaceBehavior.spec.js`, `tests/basePathDeployment.test.js`, `tests/checkboxFieldType.test.js`, `tests/columnWidthPlanning.test.js` and `tests/useDesignerFormSelection.test.js`.

## Contracts / Documentation

- `.trellis/spec/guides/cross-stack-contracts.md:171-205,248-250,347-359` currently mentions AI poll/task lifecycle and the fourth temp-id route. Remove only those obsolete references while retaining screenshot status polling, 32-hex validation, owner/project non-disclosure, upload expiry, exclusive streaming and cancellation draining.
- `.trellis/spec/frontend/component-guidelines.md:125-140`: initial-open lazy-dialog watchers remain required. Existing `App`/Agent lifecycle sections stay unchanged.
- `.trellis/spec/frontend/quality-guidelines.md:233-267`: use real Element Plus mount tests, existing warnings gate/clock, API spies, proper teleports and host v-model round trips. No new runner/polyfill/dependency is needed.
- Update active feature descriptions in `README.md`, `README.en.md`, root and both module `.claude/CLAUDE.md`, plus `.claude/index.json`. Preserve archives/history rather than erase prior feature provenance.

## Validation Entry Points

Run from this task worktree, using explicit absolute working directories:

```bash
cd <worktree>/frontend && node --test tests/docxBimodalPreview.test.js tests/agentAccessWiring.test.js tests/appSettingsShell.test.js tests/basePathDeployment.test.js tests/checkboxFieldType.test.js tests/columnWidthPlanning.test.js tests/useDesignerFormSelection.test.js
cd <worktree>/frontend && npx vitest run tests/component/WordImportDialog.spec.js tests/component/DocxCompareDialog.spec.js tests/component/AppSettingsBehavior.spec.js tests/component/AppAgentAccess.spec.js tests/component/AppWorkspaceBehavior.spec.js
cd <worktree>/frontend && npm test
cd <worktree>/frontend && npm run lint
cd <worktree>/frontend && npm run build
```

`frontend/node_modules` is absent in the new worktree; A must restore the existing lockfile environment with `npm ci` before execution, without changing dependency declarations/lockfile. Node `v24.14.1` and npm `11.11.0` are available. Native background implementer/reviewer invocation supports `sonnet` / `fable` model inputs; actual resolved model/usage may not be exposed.

## Browser Acceptance (A-owned, after implementation)

Use an isolated backend/database/upload root and synthetic DOCX, not production data or port 8888. Check administrator settings with no AI config; regular settings retain Agent entry; Word upload → select → real comparison/evidence → import → open designer; browser requests contain no AI-review status/connection-test call or AI overrides. A must obtain any additional credential/process authorization actually required by host guards, avoid exposing credential values, and report blockers rather than claiming live DOM verification from mount tests. Do not change column-width algorithms or unrelated renderers.
