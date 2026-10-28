# Final relay review and handoff

## Outcome

The uppercase-authoring feature passed the initial functional acceptance; the user subsequently accepted its 8888 behavior. A ran the implementation/behavior/security checks recorded in `a-verification.md`; independent R returned **PASS, no blocking defects** on 2026-10-28. R supplied eight non-blocking advisory items, retained below rather than automatically starting another implementation/fix round.

**Finalization blocker resolved:** a measured host wall-clock rollback and a deterministic ElButton-only reproduction confirmed an environmental event-discard mechanism. A test-only non-decreasing real `Date.now` wrapper fixes that mechanism without changing application code, dependencies, runner configuration or existing assertions. Final frontend suites pass **1056 node:test +207 mounts** in both serial/default modes; earlier failed runs remain in `research/finalization-blocker.md`. Fresh read-only review and the authorized bookkeeping/Git pipeline are recorded below when completed.

Review snapshot: worktree `/home/decade/crf-editor-uppercase-oids`, branch `feat/uppercase-oids`, reviewed base `342d1a39f154ccc402c08d707105095e444931ac`. At independent review there were no task commits, merge-to-main, push, or production-data changes.

**User acceptance (2026-10-28):** the user reported "测试没有问题，收尾" after testing on 8888 and confirmed "完整收尾（推荐）" through AskUserQuestion. This authorizes the separate work/bookkeeping commits, archival/journal, main-overlay reconciliation and merge, build/check, push and removal of this task's worktree/branch. Other tasks/worktrees and external backups remain outside cleanup scope. Work hashes and final validation are recorded in `a-verification.md`; subsequent main merge/push/cleanup are reported by the session journal and final terminal receipt.

**Follow-up (2026-10-28, user-requested):** the user asked for the remaining spec/comment cleanup and the 7 warnings, a lint rerun, and a service restart for their own testing before finalization. The main session did this inline (not a third relay round). Advisories 1–5, 7 and 8 are addressed by wording/format-only edits; advisory 6 stays open. The candidate is deployed for testing as a temporary uncommitted overlay of the 14 runtime files in the main checkout, with `frontend/dist` rebuilt. The user restarted the service; A verified its new process (MainPID 409234, start time 2026-10-28 13:08:56 CST), port 8888 and HTTP 200, plus runtime/build identity. Details, rollback and the finalization prerequisite are in `implement.md` "Follow-up phase".

## Relay identity and estimated cost

| Role | Alias passed | Reported identity | Completion estimate |
| --- | --- | --- | --- |
| B implementation | `sonnet` | Runtime prompt reported `claude-sonnet-5-5`; the channel metadata did not independently expose a resolved model ID | **$4.19881 cumulative** |
| R independent review | `fable` | Environment mapping and runtime prompt report `claude-opus-5-5[1M]`; no independent provider verification | **$7.61336** |

B used an initial implementation plus **two fix rounds**. Its cumulative done values were 3.1032188 -> 4.0886544 -> 4.19881, not amounts to add together. R ran once. Combined worker estimate: **$11.81217** (about $11.81), excluding the main session. These figures come from Claude Code's price table; they are not a verified provider invoice.

## Fixed during A review

- F1: updated the obsolete `TEST_copy` assertions to required `TEST_COPY` without weakening the definition/creation-seed checks.
- F2: translated the newly added root CLAUDE behavior clause into English while preserving every constraint.
- F3: added actual codelist-edit mount coverage, bringing real control coverage to all nine authoring surfaces.
- F4: corrected the helper's misleading omission/None/changed-value docstring and added a legacy lowercase codelist echo assertion. The last round changed a docstring only; A reran the 40 OID tests, formatting and diff checks.

## Independent review scope and read-only verification

R traced the nine controls and create/PUT/PATCH/profile/copy write routes against the approved PRD/design/specs. It checked that source imports, clones, restoration, annotation keys and option values do not call the authoring helpers, and that ownership/transaction/horizontal-table guard ordering is preserved. Installed Element Plus source independently confirms autocomplete emits `input` before `update:modelValue`.

Before review, A snapshotted **39 reviewed-file hashes plus HEAD and Git status**. After completion they were unchanged. No ESLint cache or reviewer-authored repository file was produced. R did not rerun tests/build/browser flows; those outcomes remain A's verified observations, not an independent execution claim. Both channel workers were subsequently stopped and their audit log retained.

## Non-blocking advisories and follow-up status

Status after the 2026-10-28 follow-up: **1–5, 7, 8 addressed** (wording/format only, no executable change); **6 open** (not requested). The original advisory text is kept below for provenance.

- 1 → `component-guidelines.md:1413` and the §10 suffix example now document `_COPY`, `_COPY1`; Quick Reference lists the full backend/frontend file set; a Tests Required row was added.
- 2 → the Label placeholder paragraph is back directly after the Common Mistake list; `#### Uppercase OID authoring` sits at the end of §10.
- 3 → the `fields.py` copy docstring now describes the uppercase `_COPY` ladder.
- 4 → `oidValidation.js`, `oidUppercase.test.js` and `_common.py` now distinguish new copy minting from hydration and call the validators case-preserving.
- 5 → the 7 warnings were fixed by hand (four `el-input` children moved onto their own lines, semicolons on three new imports); `npm run lint` is back to 0 errors / 2720 warnings. No `npm run format` / `--fix`.
- 7 → documented, not changed: cross-stack §10 gained a case-sensitivity contract bullet and a matrix row; README zh/en tell users that `ae01` and `AE01` stay distinct and to pick the legacy candidate to reuse it.
- 8 → `design.md` and the §10 autocomplete bullet now say the raw query may keep the typed case, which is harmless because `searchRanking` case-folds.

1. **Old specification references:** `.trellis/spec/frontend/component-guidelines.md:1413` still documents `X_copy`/`X_copy1`. The cross-stack placeholder examples and Quick Reference omit the new uppercase suffix / expanded file set. Main source inspection confirmed the old component-guideline wording.
2. **Specification heading structure:** the new subsection in cross-stack §10 leaves the older Label placeholder paragraph nested under its last subheading. Give that paragraph its own heading or move the new subsection when polishing the spec.
3. **Old copy endpoint docstring:** `backend/src/routers/fields.py:471` still says `_copy`; implementation and tests correctly mint uppercase `_COPY`. A confirmed the stale docstring.
4. **Comment clarity:** distinguish newly minted copy identifiers from hydration of existing copy seeds; describe mixed-case validators as case-preserving rather than case-insensitive. These are wording improvements, not additional normalization changes.
5. **Formatting warnings:** lint passes with zero errors, but not all 2727 warnings predate this change. A independently compared old/current source with no-cache ESLint: **2720 baseline + 7 newly added prettier warnings** (CodelistsTab +2, UnitsTab +2, VisitsTab +2, fieldDefinitionAutocomplete +1). No suppression or automatic formatting was added after review.
6. **Optional test strengthening:** add ordinary-route normalized-collision/no-write assertions and inspect the exact profile definition field rather than searching the whole JSON string. Current profile collision status coverage and full regression suite pass.
7. **Case-sensitive legacy identities:** the approved design deliberately keeps `ae01` and `AE01` distinct. Typing a legacy lowercase spelling now produces uppercase and may create a separate case-variant definition; explicitly selecting the old candidate preserves its identity, while subsequently editing its OID takes the existing fork path. No migration, case-folded merge or silent rebinding was introduced. Surface this limitation to users; a case-insensitive/migration policy would require a separate product decision.
8. **Autocomplete query wording:** the raw search query can retain its typed case before the controlled setter updates displayed state. Existing `searchRanking` normalizes case and candidate selection restores exact source identity, so behavior is unaffected. Clarify the design wording if it is later polished; no search behavior was changed here.

These items are advisory, not permission to expand code scope, bypass the relay's fix-round bound, or commit/push. R's suggestion that A fix them is a review recommendation, not user authorization. The 2026-10-28 cleanup ran on the user's explicit instruction. After context compaction the main session was `claude-opus-5-5[1M]` rather than A's original `gpt-6.1-sol[1M]`; that is the same model R resolved to. The follow-up has **self-review only, no independent review**.

## Verification and environment limitations

- Backend full suite: **1472 passed**, 8401/9623 covered statements, **about 87.30%**, up from about 86.96%.
- Frontend: **1056 node:test + 203 mount tests passed**; lint exit 0 / 0 errors; build passed.
- A verified all nine authoring controls in its own rendered browser and persisted API state, historical metadata-only preservation, free-text exclusions, actual keyboard 8/10 caps and overlong-baseline loading/cancel behavior.
- Bandit scan could not execute: the environment lacks the module. No aggregate frontend coverage percentage, real IME or OS-clipboard paste was measured. Paste-style native input events were exercised; dedicated browser import/export/restore flows were not claimed.
- Existing dependency audit: 14 advisories (12 high, 1 moderate, 1 low, no critical) plus two transitive engine warnings. Dependency files were unchanged; no upgrade/audit-fix was performed.
- Follow-up rerun (2026-10-28): lint 0 errors / 2720 warnings; backend 1472 passed, ~87.30%; serial `npm test -- --maxWorkers=1` 1056 + 203 passed; build passed in the worktree and in main (identical dist). Default-concurrency vitest is intermittently flaky (timeouts or elements not yet rendered, in varying files including the untouched `CodelistQuickEditDialog.vue`; base main also failed 1 of 4 runs), so the serial run is the verification of record. No test or runner change was made. Data: `a-verification.md` "Follow-up verification".
- Own browser page, Chrome process and test server were stopped. Ports 8912/9222 were confirmed closed. Temporary acceptance/backup files remain under `/tmp/crf-uppercase-relay.JxXQVJ/`; credentials are protected by 0600 permissions and were never displayed. No manual deletion of repository/worktree/acceptance artifacts was authorized or performed; existing tests retain their normal fixture cleanup.

## Changed implementation/test/documentation/spec files

Thirty-six files, excluding task records and the ignored decision log (30 at R review; later additions are the component/quality guidance, narrative archive and three shared-clock test files):

```text
.claude/CLAUDE.md
.claude/index.json
.context/history/archives/claudemd-changelog.md
.trellis/spec/frontend/component-guidelines.md
.trellis/spec/frontend/quality-guidelines.md
.trellis/spec/guides/cross-stack-contracts.md
README.md
README.en.md
backend/.claude/CLAUDE.md
backend/src/schemas/_common.py
backend/src/services/field_profile_service.py
backend/src/routers/codelists.py
backend/src/routers/fields.py
backend/src/routers/forms.py
backend/src/routers/units.py
backend/src/routers/visits.py
backend/tests/test_copy_name_ladders.py
backend/tests/test_fields_router.py
backend/tests/test_oid_uppercase.py
frontend/.claude/CLAUDE.md
frontend/src/composables/oidValidation.js
frontend/src/composables/fieldDefinitionAutocomplete.js
frontend/src/components/CodelistsTab.vue
frontend/src/components/FieldsTab.vue
frontend/src/components/FormDesignerTab.vue
frontend/src/components/UnitsTab.vue
frontend/src/components/VisitsTab.vue
frontend/tests/designerFieldCopy.test.js
frontend/tests/designerLabelOid.test.js
frontend/tests/fieldDefinitionAutocomplete.test.js
frontend/tests/oidValidationWiring.test.js
frontend/tests/oidUppercase.test.js
frontend/tests/component/OidUppercase.spec.js
frontend/tests/component/setup.js
frontend/tests/component/testClock.js
frontend/tests/component/testClock.spec.js
```

## Final clock-patch review and work commits

A fresh session-default `general-purpose` read-only reviewer found no confirmed blocker in the three shared-clock files and confirmed installed fake-timer replacement and cleanup ordering. It did not run tests/build/browser flows or review other feature/Git changes. Its advisory about recovery when an earlier unmount skips cleanup is retained in `a-verification.md`; no automatic extra fix was made. The initial independent R review and its original alias/cost record remain separate from this focused review; the additional review's model resolution/cost are not independently exposed.

Work commits: **`2b82644`** (feature30 paths), **`41a3a7d`** (clock3 paths), **`7ae30c0`** (spec3 paths). All passed the local pre-commit gates without attribution trailers or bypasses. Full final verification and earlier failures are in `a-verification.md`.

Next action: complete archive/journal, reconcile main's identical14-file overlay, merge/build/check/push and remove this task's worktree/branch. Keep unrelated tasks/worktrees and external backups intact. The journal captures the pre-merge state and planned sequence; the final response reports the subsequent actual receipts.
