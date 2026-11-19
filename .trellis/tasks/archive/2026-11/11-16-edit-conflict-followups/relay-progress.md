# Relay Progress (B)

Updated: 2026-11-17T09:07:51+08:00
State: ready_for_review (round 2 — FINAL permitted repair, complete; awaiting A review)
Task: .trellis/tasks/11-16-edit-conflict-followups · branch docs/edit-conflict-followups-plan · base 2549ec6 (all work uncommitted in the worktree)
Round-2 fix rounds used: 2 / 2 (preserved across resumes; no automatic third round)

## Current tree state (round-2 delta on top of round-1 delivery)

Product (3 files):
- `frontend/src/components/FieldsTab.vue` — R2a: adoption/fallback staged before auth/disposal/context checks; dialog-open-time `codelistDialogEditGeneration`; `disposed` + `getApiSessionGeneration` guards; R5: all in-hunk prettier warnings fixed (198 → 171 warnings; 0 inside task hunks; verified by diff-hunk ∩ eslint intersection).
- `frontend/src/components/FormDesignerTab.vue` — R2b: close-only/A→B→A/disposal/auth guards (`designerEditGeneration`, `designerDisposed`, `loadCodelists/loadUnits` isCurrent predicates); R2c: notes-sync freshness guard — landing candidate skipped when superseded along the own-write chain (`latestOwnAcceptedRevision` + `ownDesignChain.reaches`); a startRevision-equality guard was proven dead (unreachable in gap-TRUE flows) and replaced.
- `frontend/src/components/CodelistQuickEditDialog.vue` — R2b: child `operationCurrent` includes `modelValue === true`; confirm-add late-response closes only its own session.

Tests (round-2 new/changed):
- New vitest specs: `NotesSyncFreshness.spec.js` (2; RETAINED RED at `r2c-red.log` — without the guard the stale candidate reverts the committed name), `DesignEditorSessionBranches.spec.js` (5), `FieldsTabTransitionBranches.spec.js` (2), `VisitsTabListLifecycle.spec.js` (3), `DesignRevisionPureHelpers.spec.js` (13).
- Contract regex updates to match the guarded call/load shapes: `fieldsTabCodelistQuickEdit.test.js`, `formDesignerAuxiliaryData.test.js`.
- Hygiene: `ResizeComposableHelpers.spec.js` drag listeners now ended + detachment asserted; `SmallComposableBranches.spec.js` dead `onPersistedForTest?.()` + `useSessionTimerClear` removed; `DeferredResponseIdentityT5.spec.js` header comment corrected (dedicated-worker claim withdrawn); `CodelistsTabBehavior.spec.js` +3 delete-arm cases; `clipboardCopy.test.js` +1 body-guard case.
- Backend `test_design_revision_transition.py` — R6: genuine schema-invalid bodies for foreign/missing creation routes (owner-422 sanity first); copy-route scope-only test; NEW output-validation failure injection (serialize_response, pre-commit boundary) and NEW commit-failure injection (Session before_commit, listener removed in finally) — both prove rollback + BOTH headers absent + revision unchanged; unused imports (`main`, `create_access_token`) removed; 29 passed; whole-backend `ruff format --check` clean.

## Final verification results (each run's log preserved; default / 4-worker / serial kept distinct)

- TRUE serial coverage (`npx vitest run --coverage --maxWorkers=1`): PASS 863/863 (53 files); Statements 87.12%, Branches 80.19%, Functions 88.78%, Lines 90.74% — all ≥80% and nondecreasing vs round-1 cp15 (86.77/79.66/88.44/90.56). Log `final-serial-coverage.log`; report copy `coverage-serial-final/`.
- Normal `npm test` (node 1121 pass + vitest): FAIL — 8→7 timeouts (second sample) across CoreEditorConflict ×3 / DeferredResponseIdentity ×2+T5 ×1 / SingleInlineTableGuard ×2–3; the same load-graded default-parallel flake set A reproduced pre-repair (see R4 correction). Logs `final-normal-test.log`, `final-normal-vitest-sample2.log`.
- Unchanged default coverage (`npm run test:component -- --coverage`): FAIL retained — 25 failed / 838 passed. Log `final-default-coverage.log`.
- 4-worker measurement runs (`--coverage --coverage.reportOnFailure --maxWorkers=4`): last 862/863 (T5 flake), branches 80.16%. Logs `r3-cov-measure-*.log`.
- `npm run lint`: exit 0, 0 errors / 2797 warnings (pre-existing historical reflow; task-hunk warnings cleared). `npm run build`: exit 0.
- Backend design family: 102 passed (12.4s). Log `final-backend-design.log`.
- Round-2 R3 net: +61 covered branches on the 4-worker sample (5410 → 5471, 80.16%); serial final 80.19%. Node-suite additions to designRevision.test.js were moved to the vitest suite (node runs do not count toward vitest coverage).

## Honest limitations

- R2c RED is retained but narrow: the reverted guard passes the UNMOUNT case; only the overtaken-name case is RED (verified interleaving: own write → dialog freeze → external bump → reviewed notes write → sync read held at invoke-time → faster own write supersedes the chain tip → stale install reverts the name input).
- Normal-suite and default-coverage failures are NOT fixed (out of scope; runner/worker-cap remains the F4 Open Question — UNAPPROVED proposal in `r4-diagnosis.md`, no runner/config change made).

## Evidence log (all under ignored `frontend/node_modules/.cache/edit-conflict-followups-relay/`)

Round-1 history: cp1–cp15 checkpoints (71.47% → 79.66% branches), R4 matrix + `r4-diagnosis.md` (round-2 revised: three categorical claims corrected with cp2-at-4-workers and A-reported no-coverage default failures), R5 hunk/content attribution, R6 round-1 matrix, T5 split evidence — see the archived round-1 section in git history of this file and the log directory.
Round-2 evidence: `r2-red.log` (R2a/R2b 5/5 RED), `r2c-red.log` (R2c genuine RED), `r2c-green*.log`, `r3-cov-measure-1..9.log`, `final-*.log`, `coverage-serial-final/`.
