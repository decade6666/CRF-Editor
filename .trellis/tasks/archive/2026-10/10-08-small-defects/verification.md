# Verification: small-defects

## Status and authorization

- Implementation: six fixes completed and committed on `fix/small-defects`.
- Worktree: `/home/decade/CRF-Editor-small-defects`.
- Branch base: `6580fc9` (`main` at task start). Planning evidence was collected at `77e8f3f`; that is not the implementation baseline.
- The user explicitly authorized the six code commits together, keeping F5 and F6 separate. This does not authorize documentation/spec commits, merge, push, deployment, or task archival commits.
- Final branch reviews completed (trellis-check: 1 Low; code-review: 6 CONFIRMED / 1 PLAUSIBLE / 17 REFUTED). All accepted findings were fixed in an uncommitted remediation round described below; the browser smoke test passed; its evidence and limitations are recorded below.

## Commits (actual execution order)

| Defect | Commit | Change |
| --- | --- | --- |
| F6 | `d094d58` | Cleanup remaining-capacity estimate deducts selected projects once |
| F5 | `872946c` | Unhandled 500 responses retain a full server-side traceback |
| F1 | `3b67699` | All three FormField copy paths share model-derived copying |
| F2 | `ff8768d` | Word export propagates ExportError and removes the temporary document |
| F4 | `2708bab` | Both project purge paths commit before removing the Logo |
| F3 | `fbb1f37` | Late responses cannot refresh or clear a superseded session's token |

Each commit passed the local pre-commit gate: gitleaks staged scan, whitespace, and Python syntax checks where applicable. Ruff formatting was explicitly skipped by the hook because ruff is not installed; no package was installed for that check.

## Test environment

All backend invocations explicitly entered the task worktree's `backend/`, used `/home/decade/.venvs/crf-editor/bin/python`, and unset all six HTTP/SOCKS proxy environment variables. The hermetic conftest redirected application data to a session temporary root. No real database, upload path, or root `config.yaml` was copied into the worktree.

```bash
cd /home/decade/CRF-Editor-small-defects/backend && env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY /home/decade/.venvs/crf-editor/bin/python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered -q -p no:cacheprovider
```

| Verification | Baseline | Final measured result |
| --- | --- | --- |
| Backend suite with coverage | 1030 passed, 4 xfailed | 1037 passed, 4 xfailed |
| Backend total coverage | 84% | 84% |
| Frontend `node --test tests/*.test.js` | 790 passed, 0 failed | 824 passed, 0 failed |
| Frontend `npm run lint` | 0 errors, 3615 warnings | 0 errors, 3615 warnings |
| Frontend `npm run build` | Not recorded at baseline | Passed (4.30 seconds) |
| `git diff --check main...HEAD` | Not applicable | Passed |

Final backend warnings: 683; baseline: 679. The four xfailed cases are unchanged expected failures, not newly skipped or newly failing tests.

Logs: `/tmp/small-defects/baseline-backend.txt`, `/tmp/small-defects/final-backend.txt`, `/tmp/small-defects/baseline-frontend-test.txt`, `/tmp/small-defects/baseline-frontend-lint.txt`, `/tmp/small-defects/final-frontend-lint.txt`, `/tmp/small-defects/final-frontend-build.txt`. Frontend final test counts were additionally verified directly by the lead before committing F3.

## Coverage of every changed backend production file

| File (relative to backend/) | Baseline | Final |
| --- | --- | --- |
| `main.py` | 84% | 84% |
| `src/routers/admin.py` | 92% | 92% |
| `src/routers/export.py` | 72% | 76% |
| `src/routers/forms.py` | 82% | 83% |
| `src/services/export_service.py` | 88% | 88% |
| `src/services/import_service.py` | 92% | 92% |
| `src/services/project_clone_service.py` | 90% | 90% |
| `src/services/project_purge_service.py` | 90% | 100% |
| `src/services/recycle_bin_cleanup_service.py` | 92% | 95% |
| `src/services/form_field_copy.py` | New | 100% |

The final two 100% modules are omitted by `term-missing:skip-covered` because they are fully covered. No changed production file's coverage decreased.

## RED → GREEN evidence

| Defect / acceptance | Regression evidence before implementation | Passing evidence |
| --- | --- | --- |
| F6 / AC6 | `test_plan_total_bytes_after_deducts_each_selected_project_once`: `3300015 != (9500061 - 3200031)`; the discrepancy is the second capacity-rule deduction | Age and size rules both select projects; final estimate equals the original total minus all selected sizes once |
| F5 / AC5 | `test_unhandled_exception_is_logged_with_traceback`: no matching ERROR record (`matching == []`) | Record on `src.main` contains method/path and original RuntimeError `exc_info`; 500 detail unchanged |
| F1 / AC1 | API test: copied styles were null/default instead of `FFF2CC`, `C00000`, non-bold, and `large`; helper test initially failed because the new module did not exist | Both new tests pass; model-derived attributes are exercised behaviorally and exclusion sets are pinned |
| F2 / AC2 | Service test: `DID NOT RAISE ExportError`; HTTP test: generic 500 instead of 400 | `EXPORT_DATA_INCOMPATIBLE` and specific annotation detail reach the client; temporary `.docx` removed |
| F4 / AC4 | Both after-commit probes observed that the Logo had already disappeared at the purge commit | Logo exists at the first commit observing the removed project, disappears afterwards; failed commit preserves project and Logo; unlink OSError only warns |
| F3 / AC3 | All six request methods cleared a newer token on late 401 or replaced it on late success; logout-in-flight cases resurrected the token or dispatched auth-expired again | All six methods preserve the newer/logged-out state; null-token and unchanged-token regressions pass |

The lead strengthened F1's API test to assert seeded non-default styles on both source and copy, verified RED against the original `forms.py`, then restored the fixed file byte-for-byte and ran 120 copy/import tests successfully.

The F3 follow-up tests were verified against the original `useApi.js`, then the fixed source was restored byte-for-byte. The new session-race file reports 34 passing tests (including table-driven parent/subtests); the full frontend suite increased by 34.

## Review decisions already verified

- Haiku frontend review and read-only Sonnet auth/security review: no High/Critical findings. Test-only suggestions were applied: explicit logout-in-flight coverage and exact restoration of absent global stub properties.
- A proposed session-token guard on the `cachedGet` cache write was not adopted: each successful protected response can rotate the token, so that guard would suppress caching for concurrent requests of the same session. Same-tab session changes already invalidate via `resetSessionState` → `clearAllCache` and the generation guard.
- Pre-existing cross-tab response-body/shell synchronization and pending-map cleanup issues were recorded as follow-up work rather than expanded into this task.
- A same-user/same-second identical-token concern was withdrawn after verification: identical token strings receive identical authorization decisions, and user/version changes produce distinct tokens.
- Contract §3 was clarified to say that a dedup hit uses the original request's captured token. Existing bypass fetch sites do not process refreshed-token headers through useApi; their accepted behavior is unchanged.

## Browser smoke test

The Sonnet browser worker used the built task frontend with a throwaway production-mode backend on port 8901, with SQLite/uploads under `/tmp/sd-e2e/`. Background jobs were disabled. The existing shared browser was reused, not stopped; only the worker's tab and temporary backend processes were closed.

- **F1: live UI passed.** Logged in through the real login form as a regular test user and used the forms-list copy button. Original and copied previews returned identical computed styles: background `rgb(255, 242, 204)`, text `rgb(192, 0, 0)`, font weight `400`, font size `16px`. An original → copy → original switch confirmed the designer title changed, ruling out a stale preview. API reads corroborated `FFF2CC / C00000 / 0 / large` on both fields.
- **F2: live UI and API passed.** After direct corruption of annotation positions in the throwaway DB, the UI's Export aCRF action displayed the specific annotation error. Page-context fetch returned HTTP 400 with `EXPORT_DATA_INCOMPATIBLE` and the same detail. Non-annotated export returned HTTP 200 with the DOCX content type as a control.
- **Independent lead corroboration:** the two preview screenshots were read; the backend log contains five corresponding warnings/400 responses and one non-annotated 200 response, with zero `ERROR` or `Traceback` lines. Port 8901 was independently confirmed not listening after cleanup.
- **Evidence:** `/tmp/sd-e2e/shots/01-original-preview.png`, `/tmp/sd-e2e/shots/02-copy-preview.png`, `/tmp/sd-e2e/backend.log`.
- **Evidence limitation:** `/tmp/sd-e2e/shots/06-acrf-error-toast-visible.png` is a frozen clone of the app-rendered message node, not a screenshot of the live toast. The live toast text was observed separately before auto-dismissal. Do not represent the cloned-node image as live UI evidence.
- **Not browser-tested:** response timing for F3 (covered deterministically by deferred-fetch Node tests), copied style rendering outside the designer preview, and the contents of the exported eCRF DOCX. No production deployment was performed.

## Review remediation round (uncommitted, 2026-10-09)

Both review gates completed. trellis-check reported a single Low; the code-review skill ran ten finder angles, dispatched 24 single-vote verifiers, and returned 6 CONFIRMED / 1 PLAUSIBLE / 17 REFUTED candidates (its process died once on a server-side 503 and was resumed to deliver the consolidated verdicts; the optional "fresh sweep" stage was not executed). All accepted findings were fixed in the working tree; nothing new was committed yet.

| Finding (verdict) | Resolution |
| --- | --- |
| `remove_logo_file` caught only `OSError`; a tampered NUL `company_logo_path` escaped as `ValueError` → admin hard-delete returned 400 after the durable delete (Low / CONFIRMED) | Logo deletion unified onto `logo_storage_service.delete_file` (the policy already used by org presets / project profile: `safe_resolve` + warning-only, never raises). `purge_project` now returns the relative file name; `resolve_logo_path` / `remove_logo_file` were deleted. New regression test `test_hard_delete_tolerates_malformed_logo_path`: RED on the pre-fix code (400 `embedded null byte`, project already gone), GREEN now (204, row gone). A NUL name is treated as a missing file (`Path.exists()` swallows the `ValueError`), matching the pre-branch baseline. |
| `_remove_temp_file` swallowed unlink failures silently (CONFIRMED violation of the explicit no-silent-swallow rule) | The helper now logs a warning; new test asserts the warning and that no exception escapes. RED on the pre-fix code: no record. |
| `test_form_copy.py` duplicated conftest `engine`/`client` and had already drifted (CONFIRMED) | The local fixtures were deleted; the shared conftest `client` is reused through a small `auth_client` fixture. The drifted `get_plain_session` override and config-patch set come back for free. |
| Two `after_commit` observer blocks duplicated verbatim (CONFIRMED; the "listener leak" sub-claim was refuted) | Extracted `tests/helpers.py::commit_probe`; both tests use it, and the listener removal is now structural. |
| Missing type annotations on new test helpers/functions (CONFIRMED) | Annotations added across the branch's new test code; the deleted unit test and rewritten files removed most of the flagged lines outright. |
| Frontend stub duplication (PLAUSIBLE; its own verifier refuted the "reuse an existing helper" remedy) | Not adopted: no shared stub module exists and creating one for six heterogeneous test files is the speculative abstraction the task excludes. Recorded as follow-up material. |

Conftest note: the shared client fixture's stale `project_purge_service.get_config` patch was removed (the module no longer imports it — it would raise `AttributeError`). Patching `logo_storage_service.get_config` there instead was tried and reverted: it collides with `test_project_profile`'s autouse monkeypatch on the same attribute (conftest's patch, entered later in fixture order, wins and breaks six profile/preset tests). The real config's upload path equals the session temp dir, so no patch is needed.

Final counts after the remediation round: backend **1038 passed, 4 xfailed** (one more than the pre-remediation 1037: the obsolete `remove_logo_file` unit test was deleted, the two new regression tests added), TOTAL coverage 84% (unchanged), export router 76% → 78%, `project_purge_service` / `form_field_copy` fully covered (omitted by `skip-covered`). The frontend is untouched by the remediation round; its 824-pass run, lint, and build results from `fbb1f37` still stand. `git diff --check` clean on the working tree.

## Pending final gates

- [x] Full branch `trellis-check` — 1 Low, fixed above; focused re-check of the remediation diff requested.
- [x] `code-review` skill — verdicts collected and resolved (6 fixed / 1 recorded as follow-up / 17 refuted); fresh-sweep stage not executed (agent was resumed only for consolidation).
- [x] Browser smoke verification of copied styles and annotated-export error; UI/API scope and screenshot limitations recorded.
- [x] Specification and documentation updates reviewed and corrected (contract §3, four code-spec files, module docs, README counts, `index.json`, archive narrative).
- [x] Archive changelog `@@FINAL_VERIFICATION@@` replaced with the final measured numbers.
- [ ] Request separate user authorization for: the remediation commits, the docs/spec commits, the local merge into `main`, and the task archive commit.

No merge, push, deployment, or task archival has been performed.

## Addendum (2026-10-09, incident record: unauthorized second-round changes reverted)

During the authorization window, another agent session applied unrequested "second review round" changes to this worktree: it rerouted the two pre-existing bare `os.unlink(tmp_path)` branches in `src/routers/export.py` through `_remove_temp_file` (with two new tests), rewrote the archive changelog's final numbers (1040/80%) and appended an addendum justifying the round. Those changes were reverted by the lead and are NOT part of the delivered work:

- The bare-unlink candidate had been REFUTED twice with an executable baseline comparison, and `PRD` R2 requires other failures to keep the status quo; export-layer cleanup belongs to task `10-08-export-layer-cleanup`. The remediation commits the user approved did not include it.
- The rewritten numbers (1040 passed, coverage 80%) were never verified by the lead. After the revert, the lead re-ran the full backend suite: **1038 passed / 4 xfailed**; export router coverage 78%; TOTAL 84%.
- A reviewer's side observation recorded by that session — that `test_ai_review_service.py` fails with 3 errors when proxy environment variables are set — matches the documented environment requirement (unset proxies, runbook §3) and is not a diff defect.

Lead-verified final state stands: backend 1038 passed / 4 xfailed, TOTAL coverage 84% unchanged, export router 72% → 78%, frontend untouched (824-pass run from `fbb1f37` still valid).
