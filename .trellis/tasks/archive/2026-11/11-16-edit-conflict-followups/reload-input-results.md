# Reload Late-Input Protection — Main Acceptance Evidence

## Current Scope / Outcome

The user first instructed `继续` for the recommended RED-first late-input repair, then explicitly selected `使用sonnet执行，fable只负责审查` on2026-11-18. Main produced the original two-file RED/GREEN delta before that handoff. Requested-Sonnet executor completed remaining verification without changing product/tests; main inspected the actual returned diff, manifest, raw coverage and rendered evidence. Requested-Fable independent read-only review has returned: **the bounded model-input overwrite path is closed; no new CRITICAL/HIGH/MEDIUM defect was found**. Main verified its code anchors and records the LOW findings/test gaps below without implementing them. This is bounded acceptance, not full-task completion; task remains in_progress/AC2 open for the retained backlog.

Current code still matches all48 fingerprints in `/tmp/crf-edit-conflict-reload-input-4p2u7g_j/verified-code-manifest.json`. Only these two product/test paths differ from the preceding toolbar-pairing checkpoint:

- `frontend/src/components/FormDesignerTab.vue`
- `frontend/tests/component/CoreEditorConflict.spec.js`

Evidence roots:
- **E** `/tmp/crf-edit-conflict-reload-input-4p2u7g_j/`: pre-phase backup, valid RED/GREEN, current two-file120-line diff, source manifest/snapshot, original frontend full results and interrupted backend failure.
- **P** `/tmp/crf-edit-conflict-reload-a9zdmrs7/`: preceding accepted toolbar-pairing baseline and corresponding coverage modes.
- **S** `/tmp/crf-edit-conflict-sonnet-verify/`: executor's fresh backend results, raw-ratio comparison, public browser evidence and scan report. Main-owned documentation backup: `S/main-docs-before/`.
- Executor-owned report: `sonnet-execution.md`; main never edits that file. Requested alias sonnet; executor self-reports Claude Sonnet5.5, not independently resolved by parent runtime. Fable remains review-only, not implementation.

No commits/task archival/merge/push/deploy, new credentials, dependency/runner/schema/config/permission changes or main-owned destructive cleanup. The scan scope/report-path deviation is disclosed below; retained application/test/browser evidence remains. Original B relay remains2/2; this explicitly authorized execution handoff does not reset it.

## Reproduction / Minimal Implementation

The old explicit reload waited for a coherent read, then reset field/form editors and cleared history without checking input entered during the wait. Four real-component/real-useApi tests now retain valid RED evidence:

1. Late form name/domain replaced by the read result (RED actual name mismatch).
2. Late field label from a previously clean editor lost when the editor reset.
3. Late field label after explicitly discarding an earlier dirty edit lost as well; relying only on the dirty flag would miss this because preserveEditor discard clears its baseline.
4. A local new-field draft and its input deleted by result installation.

`E/input-red.log` has four intended behavior failures, not selector/setup errors. `E/input-green.log` passes all four;59 cases skip only under the explicit name filter, not in complete suites. `E/input-focused.log` passes126 related tests/6files.

`captureDesignerReloadInput()` captures raw form/field models, selected-field id/edit generation, draft presence and custom color buffers. After leave/reload confirmation, a persisted selected field whose baseline was cleared by explicit discard is rehydrated through existing `selectField` before capture. After the read, changed input rejects installation before data/tag assignment, editor reset or history clearing, with:

> 重新载入未应用：读取期间编辑内容已变化，当前输入和撤销记录已保留

The retained input stays saveable, old default/frozen baselines remain conservative and later external-state saves review. Clean reload still uses complete forms data+tag pairing and identity-preserving selection from the preceding repair. No global edit lock, mutation retry, fresh-tag adoption or complete unchanged-input/own-write supersession guard was added.

## Executed Commands / Results

Frontend cwd: `<worktree>/frontend`; backend uses the existing `/home/decade/.venvs/crf-editor/bin/python` with session-hermetic conftest/config/database/upload/Word-temp isolation and background jobs disabled.

| Command/check | Actual result | Evidence |
| --- | --- | --- |
| `npm run test:component -- tests/component/CoreEditorConflict.spec.js --testNamePattern='RELOAD-INPUT：'` before product edit | RED:4 behavior failures | E/input-red.log |
| Same focused command after product edit | PASS:4 /59 unmatched filter skips | E/input-green.log |
| `npm run test:component -- tests/component/CoreEditorConflict.spec.js tests/component/NotesSyncFreshness.spec.js tests/component/TemplateImportSelection.spec.js tests/component/SingleInlineTableGuard.spec.js tests/component/FormDesignerManagement.spec.js tests/component/DeferredResponseIdentity.spec.js` | PASS:126 /6files,26.98s | E/input-focused.log |
| `npm test` | PASS:1117node+892components/53files; component43.95s | E/frontend-default.log |
| `npm run test:component -- --coverage` | PASS:892,56.05s | E/frontend-default-coverage.log; coverage-default/ |
| `npm run test:component -- --maxWorkers=1 --coverage` | PASS:892,178.76s; does not replace default | E/frontend-serial-coverage.log; coverage-serial/ |
| `npm run lint` | PASS exit0:0errors/2790existing warnings, no increase | E/frontend-lint.log |
| `npm run build` | PASS:4.77s; ignored worktree dist only | E/frontend-build.log |
| Original `bash E/check-backend.sh` | **FAILED**:1784passed/1setupERROR; unauthorized unit fixture at test_fields_router.py:52;32529.18s | E/backend-full.log retained |
| `bash S/backend-narrow.sh tests/test_fields_router.py -q` | PASS:25,2.58s; fresh narrow run, not a reproduction of host suspension | sonnet-execution.md command/result |
| `bash S/backend-full.sh` (`pytest --cov=src --cov=main --cov-report=term-missing:skip-covered --cov-report=json:S/backend-coverage.json`) | PASS:1785,1508warnings,127.13s | S/backend-full.log / backend-coverage.json |
| Read-only retained-artifact raw coverage comparison | PASS:exact64-file scope and each ratio>=80%/nondecreasing in corresponding modes; main independently recalculated | S/coverage-comparison.json; main command output |
| Actual diff/manifest/inventory and `git diff --check` | PASS;48hashes/exact source inventory, no further executor code changes or commit | main checked current diff against E/input-repair.diff |

Complete frontend suites have no disabled/skipped regression cases. Frontend suites were not rerun merely because Sonnet took ownership: all48 source hashes stayed identical to the executed E tree. Main does not duplicate delegated execution; post-handback checks read retained artifacts and inspect actual source/evidence.

### Same-Scope Raw Coverage

Each current/previous mode covers exactly the same64 effective source/helper paths. Ratios use integer cross-multiplication, not rounded percentages; lines use maximum hit per unique statement start line. Totals legitimately increase with the added allowlisted helper/guard; scope/provider/reporting/runner did not change.

| Metric | Current default | Previous default | Current serial | Previous serial |
| --- | --- | --- | --- | --- |
| Statements | 7387/8448 =87.44081439% | 7372/8439 | 7388/8448 =87.45265152% | 7373/8439 |
| Branches | 5532/6861 =80.62964582% | 5520/6852 | 5533/6861 =80.64422096% | 5521/6852 |
| Functions | 2198/2470 =88.98785425% | 2197/2469 | same | 2197/2469 |
| Lines | 6363/6987 =91.06912838% | 6350/6979 | same | 6350/6979 |

Fresh backend raw9886/11071 =89.29635986%, identical to the preceding accepted baseline. Main independently checked the fresh backend JSON and actual1785-pass log. No auth TTL, configuration or fixture alteration was made to obtain that pass.

### Interrupted Unauthorized Run — Evidence Limits

Observed: the interrupted full run lasted approximately9hours rather than the prior131s/fresh127s; a project fixture creation succeeded but a subsequent unit creation returned401; the default test-login TTL is30minutes. Execution report's timeline/expiry analysis supports **an environmental pause/elapsed-time expiration hypothesis with high confidence**, not an exclusive proven host-suspension root cause. Host suspension, wall-clock changes or another delay were not independently reproduced or discriminated by a controlled experiment. Main requested narrowing the executor's stronger original wording and did not re-read/decode tokens or credential values. Fresh narrow/full passes verify the present tree under uninterrupted execution; they do not erase or reproduce the original failure. No auth/product/test workaround was applied.

## Isolated Real Browser — Executed by Sonnet / Evidence Inspected by Main

Only previously formally authorized temporary account/config/database/uploads under `/tmp/crf-edit-conflict-main-7weFaz/` were reused; no new credentials generated or values displayed. The existing launcher was guarded by credential-file presence, with loopback8903/owned Chrome CDP9222, task-only profile and two owned contexts. No real configuration/data/production/8888 access. Final E build was used and source hashes remained unchanged.

A page-level wrapper held response delivery for the five coherent-read GETs while preserving genuine bodies/status/headers. This is deliberate network-delay simulation, not claimed as an executed backend race reproduction. Real visible controls, dirty-discard/reload confirmation and subsequent API/review/cancel were driven in the browser.

- Field save200 established history; after explicit old-field discard, late input during held reload survived rejected installation. Warning visible, field editor/Save/undo remain; later save409 opened actual review;390×844 Cancel preserved input.
- A new local draft typed during a held reload survived with 未保存 row/editor and zero creation POSTs.
- Late form name/domain survived another held reload; later save409 displayed local/latest values and Cancel kept input.
- Session write summary: own PUT200, two PUT409 reviews; no stale overwrite accepted. Error listeners recorded zero product-JS errors in both contexts; this is not an exhaustive console audit.

Main personally read all five screenshots: `S/browser-lateinput-field-abort.png`, `browser-lateinput-draft.png`, `browser-lateinput-review.png`, `browser-lateinput-form-review.png`, `browser-lateinput-narrow.png`; JSON `browser-lateinput-result.json` corroborates input/Save/undo/Cancel and request outcomes. Narrow review buttons are reachable; no claim of fixing background horizontal overflow. Driver issues (stale pages, actual mouse events for confirmations, existing shared-definition impact prompt and overlay transitions) were corrected in temporary automation, not product/tests. They are disclosed in the executor report.

Executor stopped its own processes; main confirmed8903/9222 have no listeners. Profiles/DB/private drivers/evidence remain retained; no cleanup.

## Review / Security / Scope Deviations

Main inspected the actual120-line diff and all48current hashes after execution. Execution self-review reports no new data-integrity issue and no backend/wire/Agent/export/runner/config changes. Main's acceptance checks and Sonnet's execution self-review are distinct from the received independent static review below.

### Independent Static Review / Main Disposition — 2026-11-18

Requested alias `fable`, reviewer `followups-fable-input-review`: actual report received, not inferred from idle. Reviewer self-reports Opus5.5 (`claude-opus-5-5`), not the requested alias; parent runtime does not independently expose resolved model/usage/cost. No provider/model setting was changed to disguise that difference. The report compared the two-file before/current delta and hashes, direct editor/transport/fixture/contract paths and installed input-number source. It ran no tests/build/lint/browser/scans and wrote no files. It discloses occasional shell range reads (`head -c`/`sed`/`awk`) instead of the preferred Read tool; this routing deviation is recorded, not presented as fully compliant.

**Conclusion:** model-committed late input is compared at `FormDesignerTab.vue:1313` before the first install at1319; no await intervenes through history clearing. Rejection changes no snapshots/session/history/own chain, and cached:false does not publish a GET cache entry. Rehydration pairs the displayed field with its old baseline, keeping subsequent input saveable without blessing external state. Previous clean reload data/tag pairing stays unchanged. No new CRITICAL/HIGH/MEDIUM finding. Main checked the cited implementation/leave/reset/test ranges; this is not an independent test rerun.

| Item | Evidence/classification | Disposition |
| --- | --- | --- |
| LOW-1: overlapping reload feedback | Static, new conservative false-positive. Two confirmed reloads can overlap; the first installation increments edit generation (`resetFieldPropAutoSaveState`,2825), making the second report changed input even when only reload1 changed state. Button4221 has no pending-read guard. A delayed own-write editor resync may similarly reject safely. No data-loss claim. | Retain as nonblocking wording/redundant-rejection backlog; no fix or new test execution. |
| LOW-2: discard then cancel reload | Static, pre-existing/outside this delta. Leave uses preserveEditor and clears the field baseline (2751–2755,2815–2825,2962–2978,3906); cancel at1293–1301 bypasses rehydration1302–1305, leaving abandoned text with disabled save/cancel and later changes untracked. `canLeaveTab`3915–3929 already rehydrates its analogous path. | Retain as a separately scoped RED-first follow-up; not a regression fixed or runtime-reproduced here. Review does not authorize moving the rehydration or modifying code. |
| LOW-3: unfinished IME composition | Reviewer explicitly did not verify repository/browser composition behavior; possible unfinished composition interruption is based on general experience, not a confirmed defect. | Record only as an unverified hypothesis/validation gap, not a verified finding or blanket input-method guarantee. |
| Test gaps | No discard-before-clean-reload witness; no raw-color-buffer-only or selection/generation-only witness; undo is asserted enabled but not actually replayed after abort. | Retain as LOW test debt, not failed executed tests or authorization for expansion. |

The four added behavior witnesses genuinely discriminate old/new behavior; discardFirst=true's Save-enabled assertion specifically guards rehydration. Fixture requests capture real state at request time and hold only delivery. Review and main inspection support the bounded fix; broader unchanged-input/newer-own-write supersession, HIGH-2(c) and earlier backlog remain open. No follow-up implementation is dispatched from this review.

Executor reports a local Gitleaks stdin scan of the working diff/new files with no leaks. **Scope/report-path deviations disclosed:** its first command accidentally scanned Git history, outside the intended task-diff scan, then was corrected to stdin. The later final stdin result overwrote the same report path; the history scan has no separately retained JSON report. Its no-leak result is only the executor's recorded observation, not the authorized check target. Main did not repeat/authorize history scanning, did not delete retained application/test/browser evidence and does not expose values. Do not claim no history scan or no report overwrite occurred. This does not authorize broader security/private-data exploration.

Not run: Bandit (unavailable, no install); standalone type checker (no new JS checker configured); backend ruff format check in this executor session (backend unchanged); separate Agent adapter stdio E2E (adapter/wire unchanged). No production scan, deployment or publication. Existing broad no-new-credential/permissions/tooling/cleanup limits remain.

Remaining backlog is not repaired by this slice: HIGH-2(c) copy selection-change visibility/feedback; complete unchanged-input newer-own-write supersession; copy-fallback freshness; duplicate refresh messages; cross-tab dictionary refresh and original LOW items. Full-task AC2 remains open even if this bounded late-input review passes.

## Documentation / Final Record-only Verification

README zh/en, root/frontend module notes, task design/status and executable §17 now describe input-changed rejection, retained baselines, the separately unfixed discard→cancel-confirmation path and redundant overlapping-reload feedback. No new source/test file or command entry was added, so existing index inventory was validated rather than adding speculative fields or rewriting historical scan counts. Previous reports remain historical, with current pointers corrected. Operation-log-only archival remains the sole approved archival action; task is neither closed nor archived.

Executed main read-only inline `python3` checks and `git diff --check`:

- Task JSON valid, status in_progress, completedAt/commit null, exact branch/base unchanged; all related paths exist.
- All48source/test hashes and exact changed-code inventory match E; protected runner/dependency/clock/warning-gate/conftest/schema/auth/config paths unchanged.
- Index JSON valid:237application test paths plus6existing adapter test paths exist;6task JSONL references and all governing reports resolve. Optional module-document entries legitimately null for agent_bridge/assets/deploy.
- Fifteen public/task report Markdown fences balanced; root context below40000characters, active operation log below20000, archived log's exact SHA256 unchanged.
- Literal route registry remains19strict writers/9coherent reads/exactly3metadata-only POSTs.
- `git diff --check` clean; task ports8903/9222 show no listener. No product tests/build/lint were rerun in this docs-only phase; this relies on the verified identical source hashes, not assumed freshness.

The first inline validator stopped on a TypeError because it incorrectly required every optional module-document field to be a path. Its task/branch/source/protected-path checks had already passed. Main corrected only the read-only validator to accept legitimate null entries and ran the remaining checks successfully; no index/product/config change was made. This validation-script failure is distinct from the retained original backend failure, not a failed product regression.

**Final disposition:** bounded late-input repair accepted after executed verification, main actual-diff/evidence checks and the received independent static report. AC1/3/4/5/6/7 have documented evidence/explicit tooling limits; AC2 and task remain open for the retained backlog. No follow-up LOW fix, task closure/archive, commit/merge/push, deployment, new credential or cleanup is authorized or performed by this final records phase. Any separately authorized code continuation remains Sonnet-executed and Fable-read-only.
