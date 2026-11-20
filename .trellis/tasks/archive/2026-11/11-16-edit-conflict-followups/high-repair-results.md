# Independent-Review HIGH Repairs — Historical Verification Report

> Superseded for current code by `reload-repair-results.md` after the user instructed `继续` for the separate toolbar-reload repair. The known baseline reload path described below was subsequently reproduced RED-first and repaired; its bounded independent follow-up is tracked in the new report. HIGH-2 selection-change and other backlog remain unmodified. The earlier over-size log was separately archived with formal log-only approval. Keep this checkpoint's original evidence/disposition, not its pending/unfixed statements as current status.

## Scope / Current Outcome

The user instructed `确认执行` after the full independent review. A repaired **HIGH-1 and HIGH-2 only**, in the existing task/worktree; original relay repair count remains 2/2. Product/test changes in this phase are exactly:

- `frontend/src/components/FormDesignerTab.vue`
- `frontend/tests/component/CoreEditorConflict.spec.js`
- `frontend/tests/component/designServerFixture.js`

Previous 48-file SHA256 inventory matched before the phase. Recovery snapshot, RED/GREEN logs, public browser evidence and final source snapshot: `/tmp/crf-edit-conflict-high-qgotwi0t/` (`E` below). Current source fingerprint inventory: `E/verified-code-manifest.json`. No backend, runner, package/lockfile, shared setup/clock/warning gate, schema, provider/config, Agent protocol or deployment changes. No commit/archive/merge/push/deploy or cleanup is authorized or performed.

A's automated and real isolated-browser validation PASS. The existing user-selected reviewer `followups-fable-review` has now returned its independent repair-only static report: **HIGH-1 closed; HIGH-2 warm-cache/incomplete-metadata branches closed, but HIGH-2 remains partially open for in-flight selection changes.** A retains the original selection guard and documents that limitation rather than broadening the lifecycle contract. The reviewer found no new blocking defect in the bounded repair delta, but reported nonblocking feedback/freshness gaps and a separate pre-existing toolbar-reload data-loss path. Full-task acceptance is withheld; task remains in_progress. Static review is not an executed reproduction or an independent rerun of A's tests.

## Reproductions and Minimal Fix

### HIGH-1 — Divergent projection baselines

The two component witnesses use a second form, external rename/domain change to the first form, and a field read on the second form while the first form's displayed list row remains old. After local unit/dictionary creation, editing that old row previously sent its old values with a newer tag. `high1-data-loss-red.log` proves both `name` and `domain` were overwritten with the stale values; `high1-red-corrected.log` additionally proves the required conflict confirmation was absent.

The first test draft searched for a Save button although the real edit dialog uses Confirm. Those two selector failures in `high-red.log` are not counted as HIGH-1 evidence; the corrected runs reached the actual missing-review/data-loss assertions before product edits.

Fix: post-write candidates use `cached: false`; form and field snapshots each independently prove reachability from their own old tag before advancement. One field projection can no longer relabel an older displayed form list. Dirty editor/draft/history baselines remain governed by the existing own-chain rules; there is no revision arithmetic or fresh-tag retry.

### HIGH-2 — Committed copy visibility / outcome

Seven component witnesses cover: warm cached list with no selection, nonselected source, legacy after-only metadata, malformed before-tag, no selection with after-only metadata, an external write before candidate read while field input is dirty, and a failed list read after committed copy. All reached their intended RED assertions in `high-red.log` before product edits.

The scripted-fetch fixture now recognizes any numeric copy source, copies the requested form/instances rather than always form 7, and preserves the existing legacy after-only behavior; malformed before metadata is selectable explicitly. The product API/client is not mocked.

Fix: immediately invalidate the original project's form-list cache after copy succeeds. Use a fresh proven candidate, or a fresh forms-only coherent read when adoption is unavailable. Install copied-form list values and their own baseline together, without reloading field rows or granting dirty editor/history eligibility across external gaps. Preserve originating project/auth/selection guards and a single POST. Post-copy list failure explicitly warns `表单已复制，但列表刷新失败，请刷新后核对，勿重复提交` rather than suggesting the copy should be repeated. Visibility and feedback require the originating selection context to remain current; the retained in-flight-selection limitation and independent disposition are detailed below, so this finding is not fully closed.

## Actual Commands / Results

Frontend cwd: `/home/decade/CRF-Editor/.claude/worktrees/edit-conflict-followups-plan/frontend`.

| Command | Result | Evidence under E |
| --- | --- | --- |
| `npm run test:component -- tests/component/CoreEditorConflict.spec.js --testNamePattern='HIGH-[12]'` before implementation | RED; seven HIGH-2 behavior failures plus two initial HIGH-1 selector errors, followed by corrected HIGH-1 RED runs | `high-red.log`, `high1-red-corrected.log`, `high1-data-loss-red.log` |
| Same focused HIGH command after implementation | PASS: 9 tests; 47 unmatched cases skipped only by this explicit filter | `high-green-1.log` |
| `npm run test:component -- tests/component/CoreEditorConflict.spec.js tests/component/DeferredResponseIdentity.spec.js tests/component/DeferredResponseIdentityT5.spec.js tests/component/FieldsTabTransitionBranches.spec.js tests/component/NotesSyncFreshness.spec.js tests/component/TemplateImportSelection.spec.js tests/component/SingleInlineTableGuard.spec.js` | PASS: 108 tests / 7 files, 25.44s | `focused-green.log` |
| `npm test` | PASS: 1117 node tests + 885 component tests / 53 files; rerun after final whitespace-only edits also PASS | `frontend-default.log`, `frontend-default-final.log` |
| `npm run test:component -- --coverage` | PASS: 885 tests, 53.95s; unchanged default runner | `frontend-default-coverage.log`, `coverage-default/` |
| `npm run test:component -- --maxWorkers=1 --coverage` | PASS: 885 tests, 168.90s; independent serial result, not a replacement for default | `frontend-serial-coverage.log`, `coverage-serial/` |
| `npm run lint` after local formatting cleanup | PASS exit 0, 0 errors / 2790 existing warnings, equal to pre-repair total; no whole-file formatter | `frontend-lint-final.log` |
| `npm run build` after formatting cleanup | PASS, 4.73s; ignored task build only, no deployment | `frontend-build-final.log` |
| `gitleaks dir E/verified-source --config <worktree>/.gitleaks.toml --redact=100 --no-banner --no-color` | PASS, task source/test snapshot only; no history/private-data scan | `gitleaks.log` |
| `git diff --check`, JSON/path/manifest/inventory checks | PASS; exactly three authorized source/test paths differ from pre-phase snapshot | Main-session final checks |

The full normal and both coverage suites have no skipped/disabled regression cases. The two final source edits after coverage only reflowed the arrow helper and awaited fallback for existing Prettier rules; lint/build and the full default suite were rerun on that final source. No timeout, worker cap, collection/provider/reporting scope, dependencies or warning-gate change was made.

### Same-Scope Raw Coverage

All final and pre-phase reports cover the identical **64 source files**. Compare default against the previous default and serial against previous serial under `/tmp/crf-edit-conflict-main-7weFaz/coverage-{default,serial}-verified/`; each raw final ratio is >=80% and individually nondecreasing, checked with integer cross-multiplication.

| Metric | Final default | Final serial |
| --- | --- | --- |
| Statements | 7371/8438 = 87.35482342% | 7372/8438 = 87.36667457% |
| Branches | 5518/6852 = 80.53123176% | 5519/6852 = 80.54582604% |
| Functions | 2197/2469 = 88.98339409% | 2197/2469 = 88.98339409% |
| Lines | 6348/6977 = 90.98466390% | 6348/6977 = 90.98466390% |

Backend was not modified or rerun in this phase. The previous 1785 tests / 89.296360% result remains historical, not fresh validation of the current frontend. Bandit is still unavailable and was NOT RUN; no installation is authorized. Separate Agent adapter stdio E2E and standalone type checker were not run; no new tooling was added.

## Real Isolated Browser — Executed

Reuse only the previously formally authorized disposable accounts/config/storage under `/tmp/crf-edit-conflict-main-7weFaz/`; no new credentials, live configuration, production service, real database/uploads or port8888 access. Two separate browser contexts logged in through real UI using the existing private driver; credentials/token values were never displayed. The actual final build (`assets/index-D73Sweyx.js`) was served on loopback8903 with an owned Chrome/CDP on9222.

- **Unselected copy:** visible form rows 3→4 after one real POST201.
- **Nonselected-source copy:** a different form stays selected; visible rows 4→5 after one POST201.
- **After-only compatibility:** visible rows 5→6. This uses the real current backend and a browser fetch-boundary adapter that removes only the before-header while preserving response bytes/status/other headers; it is a compatibility simulation, not an old-backend deployment.
- **Divergent snapshots:** primary retains the old first-form list; secondary UI changes its name/domain and saves200; primary loads another form's fields and quick-adds a unit201. Editing the stale first-form row then returns409 and opens explicit review showing external values; no stale PUT was accepted. An initial programmatic probe opened the background list action while the designer modal was present; this was not treated as visible-control acceptance. It was canceled, the edit/designer dialogs were closed, then the actually visible table edit control was used again with no overlay covering it; the same409/review was observed and captured. No duplicate unit creation or stale overwrite was performed.
- **Desktop/narrow:** 1440×1000 and390×844 screenshots personally inspected. Conflict buttons are reachable; narrow Cancel closes review and retains the old local form name. This is not a claim of no background horizontal overflow.
- **Console:** primary has only the two expected HTTP409 resource errors from the two review attempts; secondary has no error/warning messages. No product JavaScript exception confirmed.

Evidence: `browser-copy-no-selection.json`, `browser-copy-nonselected.json`, `browser-copy-after-only.json`, `browser-divergent-snapshots.json`, `browser-high1-visible-control.json`, `browser-high1-cancel.json`, `browser-high1-narrow-geometry.json`, `browser-high1-desktop.png`, `browser-high1-narrow.png`. Initial page loading overlapped a rebuild, making a lazy chunk stale; the pages were explicitly reloaded after final build before acceptance. This was an environment/driver correction, not a product edit.

Both tracked backend/Chrome processes were stopped through TaskStop. `ss -ltn '( sport = :8903 or sport = :9222 )'` returned only its header afterward. All temporary profiles, test DB/evidence, private drivers/credentials and the previous reviewer's unauthorized `/tmp/fdt-review-diff.txt` are retained; no cleanup was performed.

## Pre-report Records-Only Audit — Historical Checkpoint, 2026-11-17

- All 48 current source/test SHA256 values still match `E/verified-code-manifest.json`; the changed source/test inventory is exact. Only the three authorized repair paths differ from the pre-phase manifest. HEAD remains `2549ec69d39a69b9ad8841c35c60f1554d82cc9a`; runner, dependencies, lockfile and backend isolation configuration remain unchanged.
- Task/index JSON, all six context JSONL records and their paths pass validation. All 237 indexed test paths exist, including the 19 added entries from the broader task. Fourteen relevant Markdown documents have balanced code fences; root context is 28,781/40,000 characters.
- Final normal-suite log confirms 1117/1117 node tests with zero failed/skipped/cancelled cases, plus 885/885 component tests across 53 files (52.86s component command). Final lint remains 0 errors/2790 warnings; final build is 4.73s. No code tests were rerun for this records-only audit; prior automated results remain tied to the unchanged verified source.
- `git diff --check` passes. Ports8903/9222 have no listeners. Corrected the current safe-action pointer while preserving the superseded API503 text as historical evidence. Independent repair follow-up is still pending; no verdict is inferred and the task stays in_progress.

## Independent Repair Follow-up — Received / Disposition

The same reviewer returned the actual report, with idle notification `2026-11-17T13:09:40.815Z`. Its review was static and read-only: it regenerated the three-file before/current diff in memory, matched the provided diff and manifest inventory, and read the repair plus direct call chains. It did not run tests/build/lint/coverage/browser, read validation logs or private evidence, or write any file (including `/tmp`) during this follow-up. Requested alias: `fable`; reviewer context self-reports Opus5.5 (`claude-opus-5-5`); parent runtime exposes no independent resolution/usage/cost telemetry. The earlier unauthorized temporary diff remains a separate retained historical artifact, not a new write in this follow-up.

| Finding | Verified status / disposition |
| --- | --- |
| HIGH-1 divergent form/field snapshots | Independently closed with high confidence. Per-projection reachability keeps stale displayed forms on their own old baseline; both unit/dictionary RED/GREEN witnesses remain in the executed suite. |
| HIGH-2(a/b) warm cache, after-only or malformed metadata | Independently closed for unchanged originating context. Fresh reads/cache invalidation and paired forms-only fallback resolve these branches. |
| HIGH-2(c) selection changes while copy/read is pending | Still a known limitation, not fully closed. A verified `copyForm:811–831` rejects a changed selection session after cache invalidation and selection commit `:2395` changes that session without refreshing forms. A retains the approved `design.md` §2.3 lifecycle guard rather than introducing project/auth-only feedback. README zh/en, design and §17 now state that a committed copy can remain invisible/silent; preserve input, reload the entire page and verify before resubmitting. No new execution witness was added for this static finding. |
| LOW-A duplicate/mixed refresh feedback | New nonblocking static finding. `adoptOwnTransition:389–391` may emit a red read error before `copyForm` emits success after fallback or an already-copied/refresh-failed warning. A confirmed the code path, not an executed occurrence. Retained as backlog; no error-option API or source change. |
| Forms-only fallback may install an older result after a newer own save | Reviewer residual static interleaving; fallback has context checks but no own-write/snapshot-freshness check equivalent to adoption. No executed reproduction or repair here; existing load/reload paths reportedly share the pattern. Track for targeted reproduction, not as a passed freshness guarantee. |
| Pre-existing designer toolbar reload data/tag mismatch | Unresolved data-integrity risk, outside the bounded repair. A checked both current `reloadDesignerContext:1298–1305` and baseline `2549ec69` (`git show HEAD`, `:1129–1136`): the full forms snapshot advances, but `mergeFormIntoState` replaces only the selected row. `openEditForm:847–855` captures that new baseline with old row values; `persistFormProps:924–933` sends the old name/domain. This is a statically verified data-loss path, not an executed reproduction, new regression or established authorization bypass. README zh/en and §17 warn to preserve input and reload the entire page before editing another form after toolbar reload. No automatic fix is authorized by this report; AC2/full-task acceptance remain open. |

No new blocking issue was found in the three-file repair delta. That conclusion does not close HIGH-2(c), waive the pre-existing data-loss risk or authorize broader repairs. A's limited security/data-integrity check preserves backend authorization, nineteen strict writers, Agent/export boundaries and dirty/history eligibility; it is self-review, distinct from the independent static report.

## Reviews / Residual Scope

- A reviewed the actual bounded three-file repair delta and security/data-integrity boundaries. The independent reviewer separately inspected that delta and its direct callers; neither activity substitutes for execution evidence outside the nine new witnesses.
- Earlier MEDIUM cross-tab dictionary refresh, LOW invalidated committed-unit dialog and LOW post-commit codelist fallback reporting remain unfixed. Closed-dialog success-toast suppression remains a feedback-policy decision. Newly reported LOW-A/fallback freshness and the baseline reload risk are retained above; no product/test changes followed this report.
- README zh/en, executable §17, design and task records now include the copy-selection limitation, partial closure and baseline reload risk. No new file/command entry was added, so index test paths remain unchanged.
- Prior passing automated/browser evidence remains valid for the exact unchanged 48-file manifest, not for unexecuted residual interleavings. No code tests were rerun for this report/documentation-only disposition. Backend/Bandit/adapter/type-checker not-run limitations above remain unchanged.
- Post-report records-only verification passed: `python3 -I` checked task/index JSON, six context JSONL/path records, 237 indexed test paths, fourteen Markdown fence pairs, unchanged branch/HEAD and all 48 source fingerprints; `git diff --check` passed. Ten document/record paths changed from the recoverable `E/review-followup-before/` backup. Root context remains 28,781 characters. **Log housekeeping not completed:** the active decision log is now 21,966 Unicode characters, above the 20,000 archive threshold. The current no-archive/no-removal boundary takes precedence over automatic rotation, so the original log is retained; do not claim the archival rule passed or archive/move/truncate it without separate authorization.
- Task remains in_progress; HIGH-2 is partial and AC2/full-task acceptance is withheld. No commit/archive/merge/push/deploy, tooling/permission change, new credentials or cleanup. Recommended next separately authorized work: RED-first reproduction and repair of the baseline toolbar-reload data-loss path, followed by the retained lifecycle/freshness backlog.
