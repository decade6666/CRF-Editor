# Implementation plan: uppercase OID authoring

## Authorization and ownership

Planning only until the user reviews these artifacts and approves implementation, then A runs `task.py start`. A owns planning, all Git history, review, acceptance, browser verification, and Trellis/context records. B is the only implementation writer in this worktree after dispatch. Do not reinterpret requirements; report doubts as Open Questions.

Worktree: `/home/decade/crf-editor-uppercase-oids`; branch: `feat/uppercase-oids`.

## B write scope (closed allowlist)

Only the following files may be created or modified. Some existing files may need no edit; do not touch them just because they are listed.

### Backend

- `backend/src/schemas/_common.py`
- `backend/src/routers/fields.py`
- `backend/src/routers/forms.py`
- `backend/src/routers/codelists.py`
- `backend/src/routers/units.py`
- `backend/src/routers/visits.py`
- `backend/src/services/field_profile_service.py`
- `backend/tests/test_oid_uppercase.py` (new)
- `backend/tests/test_oid_validation.py`
- `backend/tests/test_field_profile.py`
- `backend/tests/test_fields_router.py`
- `backend/tests/test_copy_name_ladders.py`

### Frontend

- `frontend/src/composables/oidValidation.js`
- `frontend/src/composables/fieldDefinitionAutocomplete.js`
- `frontend/src/components/FieldsTab.vue`
- `frontend/src/components/FormDesignerTab.vue`
- `frontend/src/components/CodelistsTab.vue`
- `frontend/src/components/UnitsTab.vue`
- `frontend/src/components/VisitsTab.vue`
- `frontend/tests/oidUppercase.test.js` (new)
- `frontend/tests/oidValidationWiring.test.js`
- `frontend/tests/fieldDefinitionAutocomplete.test.js`
- `frontend/tests/designerFieldCopy.test.js`
- `frontend/tests/designerLabelOid.test.js` (A-approved minimal R6-dependent expectation update only; first review reproduced `TEST_COPY` vs obsolete `TEST_copy` at lines 530-531)
- `frontend/tests/oidEditLengthPolicy.test.js`
- `frontend/tests/editModeHiddenIdentifiers.test.js`
- `frontend/tests/component/OidUppercase.spec.js` (new)
- `frontend/tests/component/OidEditSave.spec.js`

### Documentation

- `README.md`
- `README.en.md`
- `.claude/CLAUDE.md` (current feature/contract pointers only; no task history entry)
- `backend/.claude/CLAUDE.md`
- `frontend/.claude/CLAUDE.md`
- `.claude/index.json`

All other files are read-only, including **this task directory**, all `.trellis/` files/specs/journals, `.context/`, `field_restore_service.py`, `inline_table_guard.py`, database models/migrations, dependency manifests/lockfiles, configuration, scripts, build/release files, and the main checkout. Existing test tools may create their normal ignored caches and isolated temporary resources; these are not deliverables. No production DB/config/credential inspection.

Do not install dependencies, add runners, commit, push, merge, reset, clean, delete branches/worktrees, change provider settings, or expand this scope. If a genuinely necessary test expectation outside the allowlist fails due to the requested behavior, report its exact file and failure to A rather than editing it.

## A pre-dispatch checklist

- [x] Obtain explicit implementation approval for final PRD/design/plan (2026-10-27).
- [x] Peer confirmed completion; A fast-forwarded to `342d1a39f154ccc402c08d707105095e444931ac`, reread merged contracts §10/§15, profile/restore DTOs and guard logic, and refreshed affected anchors in research. No requirement or write-scope change; peer implementation and journal preserved.
- [x] Both manifests have real context entries and pass `task.py validate`; A ran `task.py start 10-27-uppercase-oids` on 2026-10-27, status is now `in_progress`.
- [x] A installed frontend dependencies with `cd /home/decade/crf-editor-uppercase-oids/frontend && npm ci` after approval (exit 0). No manifest/lockfile edits are authorized. npm reported Node engine warnings for two transitive tools and 14 pre-existing audit advisories (0 critical, 12 high); do not run audit-fix or upgrade dependencies in this task.
- [x] A ran refreshed baselines before implementation: backend **1432 passed**, coverage **9585 statements / 1250 missed / 87%** (81.03s); frontend `npm test` exit 0, including **16 vitest files / 188 mount tests**. Keep the statement/miss counts for precise no-decrease comparison, not just the rounded percent.
- [x] Recorded execution HEAD `342d1a39f154ccc402c08d707105095e444931ac` and pre-dispatch status; dispatched B alias `sonnet` with `TRELLIS_HOOKS=0` through the relay channel. Two bounded fix rounds are complete; A's evidence is in `research/a-verification.md`.

## B ordered execution checklist

1. **Read before writing.** Follow `implement.jsonl`, PRD, design, this plan, and relevant source/tests. Locate and read **sections 10 and merged 15** of `.trellis/spec/guides/cross-stack-contracts.md` directly from disk using heading search and bounded reads; the 92KB whole file is deliberately omitted from JSONL because automatic injection truncates after 32KB, before the relevant sections. Reviewers have the same source-reading requirement. All scope decisions in design.md are closed.
2. **RED.** Add failing pure-helper, API authoring, and representative real component-input tests. Run the first three targeted commands below and record the expected missing-normalization failures. Do not implement first or weaken legacy compatibility tests.
3. **GREEN: input and writes.** Add shared ASCII-only helpers; wire all nine OID controls to actual user-input normalization. Preserve programmatic hydration. Integrate backend ordinary create/update normalization at write branches with unchanged-value preservation; normalize new field-profile creation before lookup, leaving shared-update/binding/restore snapshots intact.
4. **GREEN: copy defaults.** Align frontend/backend newly minted field OIDs on uppercase source plus `_COPY`/smallest numeric suffix. Keep human-readable names, import suffixes, source-copy paths, exact existing identities, and history restores unchanged.
5. **Regression matrix.** Cover all ACs: native typing/paste-style events and payloads, nine inputs, legacy exact-echo/omitted updates, candidate attach/update, new/draft/persisted field paths, form PUT/PATCH, blank clearing, invalid input, ASCII-only conversion, option-code preservation, Saimeisi maxlength/exemptions, collisions/rollback, and replay/restoration. Run the peer's guard/restore suites without changing their behavior.
6. **Documentation.** Update only in-scope current behavior notes/index entries, including historical/import/restoration exceptions. Keep LLM-facing docs English and user-facing documentation in its established language (README zh/en pair). Do not add histories or change release/deployment instructions.
7. **IMPROVE and verify.** Keep the diff small; run the full approved commands below. Distinguish real failures from unavailable tools. For unresolved failures follow incremental debugging and report by the third attempt; never suppress failure exit codes.
8. **Report only.** Return the brief's report format, at most 25 lines. Do not update checkboxes/task status, commit, or auto-fix out-of-scope findings.

## Validation commands

Each Bash invocation must use its explicit worktree directory. Proxy unsetting applies only to that test subprocess. A reruns these commands independently during review; a B report alone is not acceptance evidence.

### Targeted TDD and regression

```bash
cd /home/decade/crf-editor-uppercase-oids/frontend && node --test tests/oidUppercase.test.js tests/oidValidationWiring.test.js tests/fieldDefinitionAutocomplete.test.js tests/oidEditLengthPolicy.test.js
cd /home/decade/crf-editor-uppercase-oids/frontend && npm run test:component -- tests/component/OidUppercase.spec.js tests/component/OidEditSave.spec.js
cd /home/decade/crf-editor-uppercase-oids/backend && (unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY && /home/decade/.venvs/crf-editor/bin/python -m pytest -q tests/test_oid_uppercase.py tests/test_oid_validation.py tests/test_field_profile.py tests/test_fields_router.py tests/test_copy_name_ladders.py tests/test_form_copy.py tests/test_test_environment_isolation.py)
```

After the peer baseline is present, also run its relevant regressions:

```bash
cd /home/decade/crf-editor-uppercase-oids/backend && (unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY && /home/decade/.venvs/crf-editor/bin/python -m pytest -q tests/test_field_restore.py tests/test_inline_table_guard.py)
```

### Full checks

```bash
cd /home/decade/crf-editor-uppercase-oids/frontend && npm test
cd /home/decade/crf-editor-uppercase-oids/frontend && npm run lint
cd /home/decade/crf-editor-uppercase-oids/frontend && npm run build
cd /home/decade/crf-editor-uppercase-oids/backend && (unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY && /home/decade/.venvs/crf-editor/bin/python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered)
cd /home/decade/crf-editor-uppercase-oids/backend && /home/decade/.venvs/crf-editor/bin/python -m ruff format --check .
cd /home/decade/crf-editor-uppercase-oids/backend && /home/decade/.venvs/crf-editor/bin/python -m bandit -r src/
cd /home/decade/crf-editor-uppercase-oids && git diff --check
```

Do not install a missing optional scanner or coverage plugin without authorization. Report it as an environment-blocked check, not a pass. Coverage is statistics-only in project config; compare against A's refreshed baseline and the >=80%/no-decrease requirement without adding a test-runner gate.

## A acceptance and review checklist

- [x] Compare post-dispatch status to the recorded inventory; every worker change is in the allowlist; no task commits. A inspected actual diffs and all new files.
- [x] Rerun the targeted/full checks and dedicated input/ownership/security review. Backend 1472 passed / ~87.30%; frontend 1056 + 203 passed; lint/build/ruff/diff passed. Bandit is environment-blocked; lint has 2720 baseline + 7 new non-blocking formatting warnings.
- [x] Apply the relay checklist read-only; B resolved F1–F4 in two bounded rounds. No inline A code fix or automatic third round occurred.
- [x] Snapshot new/untracked files before fix rounds and reviewer dispatch; record cumulative costs correctly in `research/final-review.md`.
- [x] Run independent read-only R (`fable`): PASS/no blocking defects, eight advisories retained. All 39 reviewed-file hashes, HEAD and Git status stayed unchanged.
- [x] Complete the own-instance browser walk after formal temporary-credential consent: all nine controls, exact persisted API values, legacy/free-text preservation, native-keyboard Saimeisi caps and cancel behavior. Record limits in `research/a-verification.md`.
- [x] A updated cross-stack §10 and the task decision/evidence records; R's non-blocking spec/comment/test advice is recorded, not automatically implemented. Shared history/journal wrap-up remains deferred.
- [x] Stop implementation/review workers and own browser/server; keep channel logs and temporary backups. No commit, merge-to-main, push, branch/worktree removal, channel deletion, or temporary-file deletion was performed.
- [x] Advisory cleanup was explicitly requested by the user on 2026-10-28 and executed inline (see "Follow-up phase" below); it is not a third relay round.
- [ ] Git/Trellis finalization (commit, merge, push, archive, worktree/branch removal) still requires the user's explicit instruction after their 8888 testing; do not infer it from PASS or from the deployment.

## B report format

Use English, at most 25 lines, with no diffs or full logs:

```text
## Files Modified
- <path> - <one line>
## Verification Results
- <command> -> pass|fail|not run - <one line, include RED evidence where relevant>
## Open Questions
- <omit this section if none>
```

## Follow-up phase (user-authorized 2026-10-28)

User instruction: "整理剩余规范／注释与 7 条格式警告，复跑 npm run lint，先重构然后重启服务，我测试完再收尾". Decisions and rejected alternatives are in the branch `session.log`.

- **Executor:** the main session, inline; not a third relay round (both bounded B fix rounds were already used; the relay escalation allows "A fixes inline"). After context compaction the main session runs `claude-opus-5-5[1M]` rather than the original A model `gpt-6.1-sol[1M]`. The follow-up is self-reviewed only; no independent review was run for it.
- **Scope (comment/spec/format only, no behavior change):** the 7 net-new prettier warnings (`CodelistsTab.vue` ×2, `UnitsTab.vue` ×2, `VisitsTab.vue` ×2, `fieldDefinitionAutocomplete.js` ×1); stale `_copy` / "case-insensitive" wording in `backend/src/routers/fields.py`, `backend/src/schemas/_common.py`, `frontend/src/composables/oidValidation.js`, `frontend/tests/oidUppercase.test.js`; cross-stack §10 paragraph order, suffix example, case-sensitivity contract and matrix row, autocomplete raw-query note, Quick Reference and Tests Required rows; `.trellis/spec/frontend/component-guidelines.md` copy ladder; this task's `design.md` query wording; README zh/en case-sensitivity note; root/backend `CLAUDE.md` pointers. No `npm run format` / `--fix`, so the 2720 legacy warnings stay. "重构" means behavior-preserving cleanup plus a rebuild.
- **Not done (optional, not requested):** advisory 6 test strengthening; any case-insensitive conflict warning or migration (a separate product decision).
- **Deployment for user testing:** a temporary uncommitted overlay of the 14 runtime files into the clean main checkout (same base `342d1a3`); the previous `frontend/dist` is backed up to `/tmp/crf-uppercase-relay.JxXQVJ/followup-bboq8791/main-dist-before/`; `npm run build` in main produced a dist identical to the verified worktree build; then a service restart. The unit runs as root and neither passwordless sudo nor a non-interactive `systemctl restart` is available, so the user runs `sudo systemctl restart crf-editor`.
- **Rollback (needs confirmation):** `git -C /home/decade/CRF-Editor restore -- <the 14 overlay files>` (their content stays in this worktree), restore the dist backup, restart the service.
- **Finalization prerequisite:** before merging, verify that main's 14 overlay files are byte-identical to the committed branch, then reconcile them (restore or stage) so the fast-forward merge can proceed; confirm at that time.

Checklist:

- [x] Snapshot the pre-follow-up state (41 files) to `/tmp/crf-uppercase-relay.JxXQVJ/followup-bboq8791/before/`.
- [x] Fix the 7 net-new warnings; the touched sources are back to the 1074-warning baseline.
- [x] Comment/spec/doc cleanup; a line-level comparison shows only intended lines changed.
- [x] `npm run lint`: exit 0, 0 errors, 2720 warnings (baseline).
- [x] `npm test -- --maxWorkers=1`: 1056 node:test + 203 mounts / 17 files passed. Default-concurrency runs show intermittent timing failures (see `research/a-verification.md`).
- [x] `npm run build` (worktree and main) passed; backend full pytest 1472 passed, 9623 statements / 1222 missed (~87.30%); `ruff format --check .` 177 files; `git diff --check` clean.
- [x] Overlay the 14 runtime files into main and rebuild its dist (identical to the worktree build).
- [x] The user ran `sudo systemctl restart crf-editor`; A verified `active/running`, MainPID 409234, start time 2026-10-28 13:08:56 CST, port 8888 listening, HTTP 200, served index matching main dist, all 14 runtime files matching the task worktree and both dist trees identical. No authenticated production-data request was made.
- [x] User testing on 8888 passed (2026-10-28): "测试没有问题，收尾".
- [x] Explicit full-finalization confirmation received through AskUserQuestion ("完整收尾（推荐）"): separate code/spec/bookkeeping commits, archive and journal, verified main-overlay reconciliation, local merge, main build/check, push, then removal of this task's worktree/branch only. Keep unrelated tasks/worktrees and external backups/logs. No production-data change.

Finalization command results are recorded in `research/a-verification.md`. The fresh component-test blocker was traced to host wall-clock rollback and resolved in shared test setup, with a deterministic no-business RED reproduction and four clock regressions; `research/finalization-blocker.md` preserves the complete failed and passing evidence.

- [x] User authorized continuation into the fourth spec and shared component-test environment; business code, dependencies and runner configuration remained unchanged.
- [x] Minimal clock guard: `frontend/tests/component/setup.js`, new `testClock.js` and `testClock.spec.js`; no edits to the four previously failing specs.
- [x] Clock/affected mounts62 passed; full serial and default runs each passed1056 node:test +207 mounts; lint0 errors /2720 baseline warnings; build passed.

Finalization batches (same explicit full-wrap-up authorization):

1. `feat(oid): 统一新建与手工编辑 OID 的大写规则` — the30 feature/runtime/test/current-documentation paths listed in `final-review.md`, excluding `.trellis/` and the3 shared-clock test paths.
2. `test(frontend): 防止宿主时钟回拨吞掉组件点击` — `frontend/tests/component/setup.js`, `testClock.js`, `testClock.spec.js`.
3. `docs(spec): 记录 OID 大写与组件测试时钟契约` — `.trellis/spec/guides/cross-stack-contracts.md`, `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/frontend/quality-guidelines.md`.
4. `chore(task): 归档 OID 自动大写任务` — this task's archive only, after updating work hashes and acceptance evidence.
5. `chore(journal): 记录 OID 大写验收与收尾` — this developer's journal/index only, referencing work hashes, not archive hashes.

After these reviewed commits, verify/backup the identical14-file main overlay, reconcile it, fast-forward main, rebuild/check its served dist, push main, then remove only this merged task worktree/branch. Do not modify unrelated tasks/worktrees or delete external backups. No attribution trailers or hook bypasses.
