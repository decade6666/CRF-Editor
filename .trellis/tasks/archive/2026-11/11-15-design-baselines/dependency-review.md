# C2 Dependency and Design Review — 2026-11-20

## Authority and Scope

The user requested C2 only, then confirmed continuation of the prerequisite evidence review. A formal AskUserQuestion separately approved existing isolated tests/coverage, session-random pytest signing material and temporary accounts, and existing fixtures' cleanup of only their newly created temporary roots. Logs and review evidence remain retained. No C4 product/test edits, new task, production/8888 access, real database/config/secret/upload inspection, commits, merges, pushes, archival or worktree removal are authorized.

Worktree: `/home/decade/crf-editor-c2`; branch: `task/crf-c2`; base: local main `a9dc0e4`. After the explicit scoped prerequisite approval and artifact validation, `task.py start` selected only C2 and changed it to `in_progress` on2026-11-20.

## Board

- [x] Load parent PRD/implementation map and C2 manifests/PRD/design/implementation plan.
- [x] Verify C1 `c4ce7e2`, C4 `b6c4a8f`, and C4 followup `215a744` are ancestors of local main.
- [x] Inspect current source/spec boundaries for coherent revisions, admin authorization, frozen export, private exchange and commit-before-unlink.
- [x] Use the specifically requested C2 worktree; no nested worktree.
- [x] Receive and assess the independent read-only C4 AC2 evidence map. The late-delivered report is material-only review, not a code audit, test rerun or original-AC2 closure.
- [x] Run fresh isolated prerequisite regression and comparable coverage checks.
- [x] Record explicit user-approved scoped C2 prerequisite disposition below, without closing archived C4 AC2.
- [x] Obtain formal approval for the private storage/admin API/manual-layout proposal and internal renderer/resource budgets; task start remains separately gated.

## Existing Evidence, Not New Test Results

C4 followup original AC2 is unchecked (`../archive/2026-11/11-16-edit-conflict-followups/prd.md:71`). Its AC2-COPY/RELOAD subcriteria have bounded acceptance, but administrative completion explicitly does not waive broader AC2 (`closeout-handoff.md:7-17`). The codelist followup preserves this distinction (`../archive/2026-11/11-19-codelist-followups/implement.md:37`). These facts alone neither prove a new source defect nor authorize a blanket prerequisite waiver.

The dependency review separates C4 contracts actually consumed by C2 from residual feedback/test/compliance items. Historical backend/frontend/browser/static-review results remain historical; they are not fresh execution or independent test results.

## Explicit C2 Prerequisite Disposition

After receiving the fresh automated results and being told that archived AC2 remains unchecked and no independent report had arrived, the user formally chose **continue under C2's required contracts** in AskUserQuestion. This specifically allows C2 task start after artifact synchronization. Preserve original C4 AC2/backlog and do not edit C4 product code or call its acceptance complete. The scoped handoff uses the integrated coherent revision, real SQLite concurrent/stale-write, Agent replay/fingerprint and atomic profile/undo contracts exercised by the targeted/full suites. New C2 completeness/auth/file/race tests remain mandatory; any actual direct blocker stops work. The independent evidence map was delivered after the earlier handback and confirms the bounded disposition below; its delivery does not retrospectively broaden the user's scoped approval or count as original-AC2 acceptance.

## Late Independent Material-Review Disposition — 2026-11-21

`c4-ac2-evidence` delivered its complete evidence map after the earlier C2 report had correctly noted nonreceipt at that time. This supersedes that delivery-status statement only. The reviewer used Read/targeted search on existing archived reports, without new source audit, tests, browser execution, private evidence or writes.

- Original C4 followup AC2 remains unchecked; administrative archival is not all-AC acceptance (`../archive/2026-11/11-16-edit-conflict-followups/prd.md:71–81`, `closeout-handoff.md:5–17`). COPY/RELOAD have bounded historical acceptance, not replacement of original AC2 (`two-risk-results.md:175–194`).
- Transferred CL-1 and both hosts of CL-2 have bounded historical acceptance in the later codelist task, and must not be called pending (`../archive/2026-11/11-19-codelist-followups/prd.md:89–99`, `relay-state.md:54–62`). UNIT-DEFERRED remains explicitly unfixed (`prd.md:56–60`).
- Recorded static limitations (general loader/copy catch and cross-target dictionary edit risk), witness/test debt (old history immediately after cancellation or receipt identity isolation), and unverified IME hypotheses are distinct; none is silently promoted to a new confirmed C2 defect or repaired here.
- The prerequisite271/1785/1117 and later component/coverage results belong to the main session's executed checks, not the material reviewer. They do not close original AC2. The already-approved C2-specific prerequisite gate remains unchanged; no C4 reopening, code/test changes or new task is authorized.

## Current-Source Findings for C2 Design Review

- `backend/src/dependencies.py:16-43`: browser identity/auth_version and current admin are separate checks; global owner helpers must not be widened.
- Cross-stack contract section 17 requires a physical coherent transaction before authorization/graph reads and preserves the nineteen strict writer registry, Agent protocol and online-state export boundaries.
- `backend/src/services/export_service.py:296` loads the project graph; `:583-597` resolves the live Logo path. Formal originals need frozen graph/assets and a narrowly scoped resolver injection, not ordinary live rendering twice.
- `backend/src/services/project_clone_service.py:31-129` covers current definitions and unplaced library entries but does not include the registered legacy `field` model. C2 needs an explicit legacy classification/capture-or-reject policy, not silent omission.
- `backend/src/services/database_export_service.py:98-123` strips online/Agent state in product exports; it is not a faithful recovery-set producer. C2 history must join product-private stripping without changing C7's future faithful-backup contract.
- `backend/src/services/project_purge_service.py:16-27` and its two callers preserve commit-before-file-removal; new archive cleanup must retain that ordering and report post-commit failures.
- `frontend/src/App.vue:755-790` separates admin and ordinary designer workspaces. The C2 admin host must not create a global ownership bypass or claim access to another user's browser-only drafts/widths.

The user formally selected the proposed private tables/root/admin interface and service-internal standard-library renderer with finite budgets through AskUserQuestion. `implementation-review.md` records the reviewed technical choices. The existing parent/C2 design/implementation artifacts still require synchronization after the prerequisite disposition, before task start. No product schema, dependency declaration, runner, release or deployment changes have been made.

## Fresh Verification

Evidence root: `/tmp/crf-c2-gate-DKaBNT` (retained).

- Verified runtime availability: Python 3.10.21, Node 24.14.1, npm 11.11.0.
- Backend isolation source/spec reviewed and exercised by the isolation suite; background jobs were explicitly disabled in both test processes.
- `npm ci --ignore-scripts --no-audit --no-fund`: PASS, 239 packages from the existing lockfile; no manifest/lockfile changes. Existing deprecated-package warnings and `abbrev`/`nopt` Node-engine warnings (Node24.14.1 versus their24.15.0 requirement) remain disclosed; no upgrade was performed.
- Targeted pytest (C1/C4/Agent/export/profile/restore/isolation): 271 passed, 441 warnings,29.72s (`backend-prerequisites.log`).
- Full pytest with `--cov=src --cov=main`: 1785 passed,1508 warnings,133.42s; raw9886/11071=89.29635985909133%,100 source files (`backend-baseline.json`).
- `node --test tests/*.test.js`:1117 passed,0 failed/skipped (`frontend-node.log`).
- `npm run test:component`:981 passed in53 files,56.48s (`frontend-component.log`).
- Default and `--maxWorkers=1` Vitest coverage:981 passed each; identical64 source paths and exact raw totals in both modes: statements7627/8639; branches5715/7028; functions2235/2488; lines6554/7140. All four exceed80%; these are the pre-C2 implementation baselines, not final C2 coverage.
- Task manifest validation: PASS after correcting the command cwd to this worktree. Large-file injection warnings persist; relevant original section ranges were read, no hook/config/cap workaround used. The first absolute-path invocation from the main cwd was refused and changed nothing.
- Tracked diff/whitespace check: PASS. Only this task's two new review documents are visible in status; the required branch decision log is ignored by Git. No product/test/config files changed.
- Build, lint/type checks, new browser/Word visual validation, parity and C2 feature/security tests: NOT RUN in this prerequisite-only phase. Existing tests are fresh automated evidence, not new browser evidence or completed C2 functionality.
