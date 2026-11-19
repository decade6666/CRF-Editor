# Toolbar Reload — RED/GREEN and Verification Report

> Historical toolbar-pairing checkpoint. Current late-input code, verification and received independent review are governed by `reload-input-results.md`. The limitations and counts below are retained as measured at this phase, not current late-input acceptance or a direction to restart execution.

## Current Scope / Outcome

The user instructed `继续` after A recommended a separate RED-first repair of the baseline toolbar-reload data-loss path. Continue the existing `edit-conflict-followups` task/worktree; A remains sole writer and the original B relay stays2/2. No new task/delegate/runner/dependency/config/credential change. Formal AskUserQuestion separately approved **operation-log archival only**, not task archival, publication, deployment or evidence deletion.

This phase changes exactly two product/test paths relative to the prior 48-file verified manifest:

- `frontend/src/components/FormDesignerTab.vue`
- `frontend/tests/component/CoreEditorConflict.spec.js`

Recoverable pre-phase source/task state, RED/GREEN logs, verified source snapshot and manifest are under `/tmp/crf-edit-conflict-reload-a9zdmrs7/` (`E`). Current source fingerprints: `E/verified-code-manifest.json`. A's automated/browser checks PASS, and the same independent reviewer has returned its actual bounded static report: **the original toolbar-reload data/tag mismatch is fixed with high confidence; no new blocking defect in this delta.** This closes the bounded reload repair, not the entire task. Existing reload-in-flight input/freshness risks, HIGH-2(c), earlier MEDIUM/LOW and feedback/fallback-freshness backlog remain outside this repair; task stays in_progress and AC2 remains open.

## Root Cause and Minimal Fix

`reloadDesignerContext` previously advanced the complete `formsDesignSnapshot` while `mergeFormIntoState(form)` only replaced the selected row. The unchanged nonselected list rows then opened with a newer baseline, allowing their old name/domain to save without review.

The product delta adds `forms.value = snapshot.data.forms` beside the paired forms snapshot and replaces the selected-row-only merge with the existing `syncSelectionAfterFormsRefresh()`. That helper keeps the selected object identity, updates its metadata from the coherent list and maps its reference back into the list. No new helper/API/dependency or whole-file formatting. Existing leave/confirmation, read context/target checks, field/auxiliary installation, property resynchronization and history-clear ordering are retained.

## RED / GREEN Evidence

Three new real-component/real-useApi tests in the existing `CoreEditorConflict.spec.js` use form8 as selected reload target and form7 as the nonselected edit target, so the fixture's existing form7 writer requires no artificial extension.

1. External name/domain change to form7 → explicit reload while form8 selected → close designer → edit/save form7 without changing its fields. **RED proved actual server data loss:** expected external name/domain, received original `知情同意` / `dM`.
2. External deletion of nonselected form7 → reload. **RED showed two rows instead of one.**
3. Reload latest form7 → open editor → another external change → save/cancel review. This counterexample already passed before the fix and continues passing, preserving the independent external-change boundary and local input.

`E/reload-red.log`: two intended behavior failures, one passing counterexample; no selector error counted as RED. `E/reload-green.log`: all three pass; 56 cases skipped only by the explicit `RELOAD：` filter. Complete suites below skip/disable no regression cases.

## Actual Verification Commands / Results

Frontend cwd: `/home/decade/CRF-Editor/.claude/worktrees/edit-conflict-followups-plan/frontend`.

| Command | Actual result | Evidence under E |
| --- | --- | --- |
| `npm run test:component -- tests/component/CoreEditorConflict.spec.js --testNamePattern='RELOAD：'` before product edit | RED: 2 intended failures / 1 pass | `reload-red.log` |
| Same focused command after product edit | PASS: 3 tests / 56 unmatched skips | `reload-green.log` |
| `npm run test:component -- tests/component/CoreEditorConflict.spec.js tests/component/NotesSyncFreshness.spec.js tests/component/TemplateImportSelection.spec.js tests/component/SingleInlineTableGuard.spec.js tests/component/FormDesignerManagement.spec.js` | PASS: 104 tests / 5 files, 24.64s | `reload-focused.log` |
| `npm test` | PASS: 1117 node +888 component tests /53 files; component42.12s | `frontend-default.log` |
| `npm run test:component -- --coverage` | PASS: 888 tests, 54.55s | `frontend-default-coverage.log`, `coverage-default/` |
| `npm run test:component -- --maxWorkers=1 --coverage` | PASS: 888 tests, 172.23s; distinct diagnostic, not replacement for default | `frontend-serial-coverage.log`, `coverage-serial/` |
| `npm run lint` | PASS exit0: 0 errors /2790 existing warnings, no increase | `frontend-lint.log` |
| `npm run build` | PASS: 4.71s; ignored worktree dist only | `frontend-build.log` |
| `bash E/check-backend.sh` (existing venv `python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered --cov-report=json:E/backend-coverage.json`) | PASS: 1785 tests, 1508 warnings, 131.19s; includes design/Agent/auth/isolation/export regressions | `backend-full.log`, `backend-coverage.json` |
| `gitleaks dir E/verified-source --config <worktree>/.gitleaks.toml --redact=100 --no-banner --no-color` | PASS; task source/test snapshot only | `gitleaks.log` |
| `git diff --check` | PASS | A command output |

Backend conftest isolation was checked before the run: config/database/upload/Word-temp paths are session-temporary, the existing test fixture uses its session-random test secret, inherited overrides are scrubbed and background jobs disabled. Proxy variables were unset inside the task-scoped `/tmp` shell wrapper. No live config/database/uploads/production or8888 access. No backend code changed.

### Same-Scope Raw Coverage

Both frontend modes cover the exact same64 source files as their corresponding pre-phase reports under `/tmp/crf-edit-conflict-high-qgotwi0t/coverage-{default,serial}/`. Counts were computed from retained coverage-final JSON (unique start-line maximum for lines), checked with integer cross-multiplication: every ratio >=80% and nondecreasing, no source exclusions/provider/reporting/runner changes.

| Metric | Current default | Previous default | Current serial | Previous serial |
| --- | --- | --- | --- | --- |
| Statements | 7372/8439 =87.35632184% | 7371/8438 | 7373/8439 =87.36817158% | 7372/8438 |
| Branches | 5520/6852 =80.56042032% | 5518/6852 | 5521/6852 =80.57501459% | 5519/6852 |
| Functions | 2197/2469 =88.98339409% | 2197/2469 | same | 2197/2469 |
| Lines | 6350/6979 =90.98724746% | 6348/6977 | same | 6348/6977 |

Fresh backend line coverage is9886/11071 =**89.29635986%**, identical to the prior raw baseline (11071 statements minus1185 missing =9886 covered) in `/tmp/crf-edit-conflict-main-7weFaz/backend-coverage-final.log`, >=80% and nondecreasing. This is a fresh full-suite result, not a reused historical claim.

## Real Isolated Browser — Executed

Reused only the previously authorized disposable account/config/storage under `/tmp/crf-edit-conflict-main-7weFaz/`; credential file presence/mode0600 checked without displaying values. No new credentials generated. Existing private UI login driver logged two independent contexts in against loopback8903; owned Chrome/CDP on9222 with new task-only profile. Browser verification started after the final build, with page reloads to use current chunks. Browser control code and screenshots never expose auth/token values.

- Primary selected form `FU_B`; secondary visibly edited `FU_A` name/domain and saved200 while primary retained its old list row.
- Primary clicked the actual toolbar Reload and confirmation. The entire list updated; `FU_B` stayed selected. After closing the designer, the visible `FU_A` edit dialog showed the new external name/domain. Saving unchanged values returned200 and retained those values.
- Primary then entered a local name; secondary made another real save. Primary's save returned409, review showed local/latest values, and real Cancel at390×844 preserved the local input. No stale overwrite accepted.
- Desktop1440×1000 and narrow390×844 screenshots personally inspected. Review Cancel/Confirm are visible/reachable; background horizontal overflow is not claimed fixed. Both contexts' error/unhandledrejection listeners observed zero product-JS failures; expected HTTP409 is the tested conflict, not a JavaScript crash. This listener evidence is not a complete console audit.
- Two initial driver attempts were corrected without product edits: the fixed action column covered the name cell (selection moved to the unobscured OID cell); then the confirmation-overlay exit transition briefly covered the close button. The final driver waits for hit-testable controls and ended animations, uses a distinct external test value and passes. Those partial attempts are retained, not presented as final acceptance.

Evidence: `browser-driver-stable.log`, `browser-reload-preservation.json`, `browser-reload-third-write.json`, `browser-reload-designer.png`, `browser-reload-other-form.png`, `browser-reload-third-write-review.png`, `browser-reload-narrow.png`. Private driver: prior authorized temporary root `reload-review-browser/verify.mjs` (not committed). Owned backend/browser tasks were stopped through TaskStop;8903/9222 then had no listeners. Profiles, test DB, evidence and prior unauthorized reviewer temp diff remain retained, not deleted.

## Independent Static Repair Review — Received

The same user-selected reviewer `followups-fable-review` returned the actual report and idle notification at `2026-11-17T14:30:13.691Z`. It independently regenerated the91-line before/current diff in memory, matched `E/reload-repair.diff`, verified all48 current fingerprints and verified the pre-phase backup equals the previously reviewed HIGH repair state. It inspected the two changed files plus directly relevant coherent-read, selection/identity, leave/property/history helpers and existing response-shape handling. It did not read validation logs, coverage, reports, `verified-source/`, private evidence or credentials; no tests/build/lint/browser execution or file writes, including `/tmp`, occurred in this review.

**Verdict:** original stale nonselected-row data/tag mismatch fixed with high confidence; no new blocking defect in the bounded delta. Complete forms membership/name/domain now comes from the same coherent read as its tag. Existing selection helper preserves selected identity without triggering the shallow selected-form watcher or another selection; missing selected targets still fail before installation. Leave/confirmation, property-baseline/history reset and subsequent-external-write review remain unchanged.

**Test-evidence limits:** the reviewer statically accepts the first two new cases as valid REDs and the third as a pre-existing passing guard. Current-row UI assertions do not directly prove JavaScript object identity; identity preservation is established by the helper/code review, not claimed as a direct test assertion. Actual executed results remain A's evidence above, not the reviewer's rerun.

**Pre-existing residuals, not introduced or fixed here:**

- A reload read does not hold a loading/edit lock. New field/form input entered after the original leave check but before installation can be replaced by `resetFieldPropAutoSaveState` / `syncFormPropEditor`. A checked the unchanged reset/sync call chain; this is a static interleaving finding, not an executed reproduction.
- Installation has no newer-own-write/snapshot-supersession guard. A read overtaken by another local save can temporarily replace the visible state with an older, still data/tag-paired snapshot. The next save remains revision-checked and reviews instead of silently overwriting; no execution witness or broader freshness repair was added.

Both are explicitly documented as known limitations in README zh/en and §17: wait for reload completion before typing/saving. They remain backlog along with HIGH-2(c), duplicate refresh messages, fallback-read freshness, cross-tab refresh and original LOW items. This review does not waive AC2 or grant further implementation/commit/task archival/deployment/cleanup.

Commands disclosed by the reviewer were read-only listing, `git rev-parse`/scoped status, `rg`, Read and `python3 -I` for in-memory difflib/hashes; no file writes. Requested alias remains `fable`; reviewer context self-reports Opus5.5 (`claude-opus-5-5`), while parent runtime provides no independent resolution/usage/cost telemetry.

## Review / Remaining Limits

- A's actual-diff/security self-review and the separate independent static report are complete for the bounded reload repair. The passing executed frontend/backend/browser evidence applies to the exact unchanged source manifest, not the unexecuted residual interleavings.
- Remaining unfixed: reload-in-flight late input and superseding own writes; HIGH-2(c) in-flight copy selection visibility/feedback; MEDIUM cross-tab dictionary refresh; LOW committed-unit dialog, codelist fallback reporting and duplicate refresh messages; static copy-fallback freshness interleaving. No expansion into those branches.
- Bandit scan NOT RUN (not installed; no install authorized); separate adapter stdio E2E NOT RUN (adapter/wire unchanged); standalone type checker NOT RUN/not configured for this JS delta. No production/history/private-data scan.
- README zh/en, root/frontend notes and §17 synchronize the verified reload behavior and distinguish in-flight limitations. No new test file/command, so index inventory remains the same and is validated rather than rewriting historical scan counts. Bounded repair acceptance is complete, but AC2/task remain open; no commit/task-archive/merge/push/deploy or cleanup.
- No product/test changes or new code-test executions followed the independent report. Records-only verification below confirms that all48 fingerprints still match; old pending statements in prior checkpoints are historical, not the current reviewer state.

## Final Records / Inventory Audit

`python3 -I` checks pass for all48 source fingerprints and the exact changed-source inventory, exactly two repair deltas, unchanged protected runner/dependency/conftest paths and unchanged HEAD. Task/index JSON, six context JSONL/path records,237 indexed test paths and15 Markdown fence checks pass. The exact approved archive matches its pre-phase backup and SHA256; active log4073/20000 characters and root context28898/40000. Bandit availability recheck reports false; scan remains NOT RUN. `git diff --check` passes and8903/9222 have no listeners. These are records/source-evidence checks, not additional test-suite executions. At the earlier pre-report checkpoint the verdict was pending; the actual received report/disposition is now recorded above. Post-report `python3 -I` verification again passes all48 source fingerprints, task/index JSON, six context JSONL paths,237 test references and15 Markdown fence checks; `git diff --check` passes, approved archive bytes remain exact, active log5774/20000 characters and root context28898/40000. Ports8903/9222 have no listeners. No code tests/lint/build/browser were rerun for this records-only disposition; prior executed results remain tied to the unchanged verified code.

## Log-only Archive Authorization

The user formally selected log-only archival. The previous active log is preserved byte-for-byte as `.context/history/archives/edit-conflict-followups-session-2026-11-17.log`, SHA256 `3ae6b1c8a7dba7d53d3acda60e7130f47a10f233dd088180ee838444164e161e`, matching the retained pre-phase backup. The active path now keeps a provenance/index plus this repair's decision. No task was archived/closed and no evidence removed. This resolves the earlier log-size housekeeping blocker only; all commit/merge/push/deploy/cleanup restrictions remain.
