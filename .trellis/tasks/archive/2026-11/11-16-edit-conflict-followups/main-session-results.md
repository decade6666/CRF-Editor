# Main-Session Repair Results — 2026-11-17

## Current Outcome / Authority

This is the **previous verification checkpoint**, retained as evidence rather than the current acceptance verdict. The independent fable review has now returned two HIGH implementation findings (divergent designer snapshots and copied-form visibility), verified by code inspection. The user explicitly confirmed execution of those two repairs; A is implementing them RED-first in the same task/worktree, with current plan in `implement.md` and fresh evidence under `/tmp/crf-edit-conflict-high-qgotwi0t/`. Final acceptance remains BLOCKED pending repairs and fresh validation; status stays `in_progress`. Commands/results below predate this HIGH-repair phase and must not be described as fresh results on the repaired tree. No commit/archive/merge/push/deploy or destructive cleanup is authorized.

The user's `开始修复` released the records-only product/test freeze. A is the sole repair writer; B remains stopped and the original relay remains exhausted at **2/2**. Two later AskUserQuestion approvals permitted only (1) the minimal native Element string-identity correction in shared `setup.js` plus environment regressions and (2) disposable browser accounts/password/signing key with an empty database under the evidence root on a non-8888 port. These do not authorize runner/timeout/concurrency/dependency, clock/warning-gate, production or publication changes.

Worktree: `/home/decade/CRF-Editor/.claude/worktrees/edit-conflict-followups-plan`.
Base/HEAD: `2549ec69d39a69b9ad8841c35c60f1554d82cc9a`; no commits after base.
Evidence root (`E` below): `/tmp/crf-edit-conflict-main-7weFaz/`.
Historical relay evidence (`OLD` below): `/tmp/crf-edit-conflict-relay-nCefF5/`; preserve its original `final-review.md` and failed results.

## Repairs and Retained RED Evidence

- **R2 — originating dictionary lifetime:** the child passes its operation predicate through the awaitable add callback. Both parents compose it with editor/project/form/selection/auth/disposal checks, propagate it through coherent reads and recheck before installation/rebinding. Closed/reopened dialogs cannot receive the departed operation's selection, baseline, close or success feedback.
- **R2c — notes read freshness:** capture both host snapshot identities before a clean-editor synchronization read. A newer installed explicit/refresh read invalidates an older candidate, as do existing own-write/context/dirty guards. Revision labels remain opaque. Dirty input, drafts and stale history are not upgraded.
- **R2a — compatibility fallback:** FieldsTab's missing/malformed-transition `load({ isCurrent })` carries the original operation predicate plus auth/disposal/load-generation checks through the read and installation. No repeated POST.
- **F4 — actual environment root cause:** the unchanged default baseline still had three 5000ms component timeouts, without concurrent backend tests. Popper's window-identity check repeatedly called happy-dom's HTML-serializing `Element.toString`; isolated native Chrome returned object identity instead. Paired T5 profiles measured 1896.3ms serializer/encoder self samples versus 0, and 4.65s versus 2.99s command time. The temporary spec-local counterfactual was reverted byte-for-byte before formal approval. The approved permanent test-only spy returns native identity per test and is removed by existing `restoreAllMocks`; explicit `outerHTML`, clocks, warnings, runner and dependencies are preserved. Installed Vitest defaults to forks; the historical threads assumption was not used.
- **F5 — attributable warnings:** clear only the remaining task-hunk formatting warnings, without whole-file formatting or unrelated refactoring.

RED logs: `lifecycle-red.log`, corrected designer witnesses in `dictionary-red.log`, and `dom-environment-red.log`. The first dictionary RED run contained two wrong designer-label selectors; those harness failures were corrected before claiming the behavior witnesses. GREEN logs: `lifecycle-green.log`, `lifecycle-extended-green.log`, `default-focused-green.log`, `source-contract-green.log`.

The first full post-fix node run exposed four outdated source-pattern assertions. They were updated to the changed callback/load contracts, scoped to the actual relevant functions rather than incidental formatting; the failed `frontend-default-final-1.log` remains retained. No public behavioral assertion, warning gate or timeout was weakened. T5 has no retained per-spec environment special case or worker cap.

## Final Commands / Results

Frontend cwd is `<worktree>/frontend`. Backend commands use the existing wrapper `bash OLD/run-backend-check.sh ...`, which explicitly sets the task backend cwd, unsets proxy variables for that invocation and disables background jobs. The existing hermetic conftest redirects database/config/upload/temp paths before app import; no real configuration/database/upload data was read or copied.

| Command | Actual result | Evidence under E |
| --- | --- | --- |
| `npm test` | PASS: 1117 node tests; 876 component tests / 53 files; component phase 33.43s | `frontend-default-verified.log` |
| `npm run test:component -- --coverage` | PASS: 876 tests / 53 files, 44.12s; unchanged default runner | `frontend-default-coverage-verified.log`, `coverage-default-verified/` |
| `npm run test:component -- --maxWorkers=1 --coverage` | PASS: 876 tests, 156.11s; diagnostic/comparable serial mode, not a replacement for default | `frontend-serial-coverage-verified.log`, `coverage-serial-verified/` |
| `npm run lint` | PASS exit 0: 0 errors / 2790 warnings, versus prior A 2797; not warning-free | `frontend-lint-verified.log` |
| `npm run build` | PASS, 4.34s; ignored worktree build only, no deployment | `frontend-build-final.log` |
| Backend wrapper `-m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered` | PASS: 1785 tests, 1508 warnings, 120.53s; 9886/11071 statements = 89.296360%, equal to prior A baseline | `backend-coverage-final.log` |
| Backend wrapper `-m ruff format --check .` | PASS: 202 files already formatted | `backend-format-final.log` |
| Approved-interpreter Bandit availability probe | `bandit_available=False`; scanner NOT RUN, installation not authorized | `bandit-availability-final.log` |
| `gitleaks dir E/verified-source --config <worktree>/.gitleaks.toml --redact=100 --no-banner --no-color` | PASS: no leaks in the task-scoped 48-file source/test snapshot; not a history/private-data scan | `gitleaks-verified.log` |
| `git diff --check`, JSON/path/manifest checks | PASS at documentation handback; code manifest unchanged | Recorded below / final main-session output |

Default and serial failures from prior checkpoints remain evidence and are not relabeled passed. The final default normal and coverage commands independently passed after the approved correction. Backend suites were not run concurrently with these heavy frontend checks. No code tests were rerun for the final documentation-only phase.

### Coverage — Raw Counts, Not Rounded Claims

Final default, final serial and the old comparable serial baseline cover the **identical 64 source files**. Neither the runner, provider/reporting/collection scope nor package/lockfiles changed. Parse `coverage-final.json` for statements/branches/functions and Clover project metrics for lines.

| Metric | Old A serial baseline | Final default | Final serial |
| --- | --- | --- | --- |
| Statements | 7330/8413 = 87.12706526% | 7345/8425 = 87.18100890% | 7346/8425 = 87.19287834% |
| Branches | 5473/6825 = 80.19047619% | 5479/6832 = 80.19613583% | 5480/6832 = 80.21077283% |
| Functions | 2186/2462 = 88.78960195% | 2193/2467 = 88.89339278% | 2193/2467 = 88.89339278% |
| Lines | 6318/6962 = 90.74978454% | 6331/6971 = 90.81910773% | 6331/6971 = 90.81910773% |

Each final raw ratio is >=80% and individually nondecreasing versus the old serial baseline (checked by integer cross-multiplication). The old report is `OLD/a-review-2/a-serial-coverage-report/`. Backend scope remains `src + main` and is nondecreasing.

Final ESLint hunk attribution: CodelistQuickEditDialog 0 warnings, FieldsTab 169, FormDesignerTab 365, property editor 108, sortable table 28; **zero warnings within this task's changed hunks** across all five. Repository-wide legacy warnings remain. Evidence: `source-eslint-verified.json` and the main-session actual-diff/hunk review.

## Isolated Real-Browser Acceptance — Executed

The actual worktree build was served on loopback port 8903, with independent Chrome/CDP on 9222 and two separate browser contexts logged in through real UI. The build asset matched the worktree dist (`assets/index-B4BL2v1H.js`). All config/storage/Word-temp paths were redirected under E; no production service or port 8888 was accessed. Credentials/session material stayed in private 0600 files and private driver code; no values were displayed or added to the repository.

| Flow | Observed result | Public evidence under E |
| --- | --- | --- |
| F1 local dictionary add / unit add / whole-form copy → protected field/form save | Each management POST201 had both tags; each follow-up save200 had no false review/409 | `browser-f1-checkpoint.json` |
| F2 external edit → reviewed notes save → clean property save | Notes409 → explicit review → 200; clean pane displays external latest name; next property save200 without extra review | `browser-f2-clean-checkpoint.json` |
| Dirty property pane and another write during review | Local draft preserved through notes success; property save requires its own review; a third write makes confirmation conflict again; cancel keeps input | `browser-dirty-third-write-checkpoint.json` |
| Dictionary close/reopen while post-commit read is delayed | Real POST committed; only real GET delivery delayed at fetch boundary; header ×, alternate selection and reopened draft remain intact after release and old loading completion | `browser-dictionary-lifetime.json` |
| Old notes read released after a newer complete reload | Secondary UI commits a new name; primary explicitly reloads; releasing the old notes candidate does not revert the new name/baseline | `browser-notes-newer-read.json` |
| Desktop / narrow conflict controls | 1440×1000 and 390×844 screenshots personally inspected; confirm/cancel reachable; narrow cancel keeps input | `browser-narrow-geometry.json`, `browser-narrow-cancel-checkpoint.json`, `browser-desktop-conflict.png`, `browser-narrow-conflict.png`, `browser-desktop-restored.png` |
| Own presentation save and atomic Undo | Save200 and undo200; bold restored to initial true with no false review | `browser-own-undo.json` |

Browser driver corrections are not hidden: initial login observation raced a temporarily absent `document.body`; a field-selection-preserving reopen required using the real form-edit dialog rather than assuming the clean pane was visible. The own-undo driver's first wait held a replaced Save DOM node, although the save had succeeded; it was corrected to query current DOM, and only the outstanding Undo was executed, without repeating Save. These were driver failures, not product changes.

Console: primary contained the expected HTTP409 resource-error group from conflict tests (five), secondary had no console errors, and no product JavaScript exception was confirmed. Narrow acceptance proves conflict interaction reachability, not a claim that the pre-existing designer background has no horizontal overflow. This is manual/scripted isolated browser evidence, not a newly installed E2E runner.

Both tracked processes were stopped successfully. `ss -ltn '( sport = :8903 or sport = :9222 )'` then returned only its header. No evidence, database, private credential/session file or browser profile was deleted.

## Reviews, Documentation and Remaining Gate

- A inspected the actual task diff and the final repair delta, and performed the structured security-review path. No new blocking defect was confirmed by A. This is **self-review**, not independent acceptance.
- Existing independent reviewer: `followups-final-review` (native agent; requested `fable`). Actual resolved model/usage/cost are not exposed. Files remained quiescent. Three subsequently delivered `idleReason=failed` notifications, timestamped `2026-11-17T08:51:49.776Z`, `2026-11-17T09:42:38.214Z` and `2026-11-17T10:02:35.636Z`, all report `API Error: 503 All providers circuit breaker open (1 providers)`. This confirms an infrastructure-blocked review, not an idle success or a product/test failure. **No usable report reached A; independent review completion is not established.** Stop repeated retries; do not replace the reviewer, switch model/provider/settings or infer a verdict.
- README zh/en, root/module notes, `.claude/index.json` (19 new test entries), executable §17 and frontend DOM compatibility guidance are synchronized to the verified implementation. Nineteen strict writers and Agent DTO/fingerprint/approval/replay, export stripping and C6 boundaries remain unchanged. `src/templates/markdown/spec` does not exist in this application; framework template synchronization is not applicable, and no directory was created.
- `verified-code-manifest.json` and `verified-source/` retain all **48** task product/test files. A rechecked every SHA256 and the complete changed-code path set after documentation changes: no drift, no extra/missing code path, no protected runner/package/lockfile/conftest/clock/warning-gate change and no commit after base. Shared setup is the sole formally approved test-infrastructure exception.
- **Not run:** Bandit (uninstalled, no install permission); separate Agent adapter stdio E2E (adapter/wire unchanged); additional TypeScript checker (existing JS stack, no new tooling); production/private-data/history scans. Backend Agent regression tests ran within full pytest; they are not adapter E2E.
- **Next safe action:** after review service recovery, resume the existing read-only implementation review against the unchanged verified files and record its actual report; no repeated automatic retries now. Any necessary same-scope code fix remains RED-first and requires fresh relevant verification. Until then keep final acceptance infrastructure-blocked and task `in_progress`; do not change model/provider/settings, commit/archive/merge/push/deploy or clean up evidence/worktrees/branches without separate authorization. This notification-handling phase changes task records only; code tests were not rerun.
