# Uppercase OID authoring

## Goal

Make newly authored or manually edited OIDs consistently uppercase: typing or pasting lowercase ASCII letters immediately changes the actual editor value and the saved identifier, not just its appearance. Original request: “所有的OID只允许大写，输入小写自动转大写”.

## Background and confirmed decisions

- **User decision (2026-10-27):** apply this to new/manual OID authoring, not a bulk rewrite of existing or imported identifiers.
- **User decision (2026-10-27):** codelist option codes remain case-preserving free text, even where the UI currently calls them “OID”. Their current contract is `.trellis/spec/guides/cross-stack-contracts.md:749-762`; misleading labels are visible at `frontend/src/components/CodelistsTab.vue:409,440,465`.
- **User authorization (2026-10-27):** planning and implementation are approved within `implement.md`'s closed scope; commit/push/deployment/production-data changes are not included. Relay A is the current `gpt-6.1-sol[1M]` session, explicitly approved by the user. B used alias `sonnet` (runtime prompt reported `claude-sonnet-5-5`, not independently exposed by channel metadata) and completed two bounded fix rounds. R used `fable` (environment mapping/runtime prompt `claude-opus-5-5[1M]`, no independent provider verification) and returned PASS with no blocking defects and eight advisory items. A's actual command/browser observations are in `research/a-verification.md`; identities, estimated worker costs, residual advisories and the 30-file list are in `research/final-review.md`.
- Worktree `/home/decade/crf-editor-uppercase-oids`, branch `feat/uppercase-oids`, initial evidence base `2048df2`; the reviewed execution base is now **`342d1a39f154ccc402c08d707105095e444931ac`**. After the peer completed `feat/single-table-guard`, A safely fast-forwarded this task branch and rechecked merged contracts/restore/profile/designer behavior. The original-base anchors below retain provenance; refreshed affected anchors are in research. Main, other worktrees, and shared journal/index remain outside this task's write scope.
- **User follow-up (2026-10-28):** "整理剩余规范／注释与 7 条格式警告，复跑 npm run lint，先重构然后重启服务，我测试完再收尾". This authorizes the comment/spec/format cleanup and deploying the candidate to the 8888 service for the user's testing — a scoped exception to the original no-main-write / no-restart boundary, implemented as a temporary uncommitted overlay in the main checkout plus rebuild and restart. Commit, merge, push, archive and worktree removal still wait for the user's explicit instruction after testing. Details: `implement.md` "Follow-up phase".

## Requirements and evidence

### R1 — All actual OID inputs normalize user edits

Cover these nine controls (paths below are under `frontend/src/components/`):

| Entity/surface | Bound value | Evidence at initial base |
| --- | --- | --- |
| Field library | `editProp.variable_name` | `FieldsTab.vue:330` |
| Designer field autocomplete | `editProp.variable_name` | `FormDesignerTab.vue:3608-3613` |
| Designer form creation | `newFormCode` | `FormDesignerTab.vue:3973` |
| Designer form edit dialog | `editFormCode` | `FormDesignerTab.vue:3983` |
| Designer inline form properties | `editFormProp.code` | `FormDesignerTab.vue:3575` |
| Codelist creation/editing | `clForm.code`, `editClForm.code` | `CodelistsTab.vue:427,452` |
| Unit properties | `unitEditProp.code` | `UnitsTab.vue:264` |
| Visit properties | `visitEditProp.code` | `VisitsTab.vue:406` |

Use one shared ASCII-only input helper. Preserve whitespace until the existing save-time normalization; do not rewrite programmatic loading or candidate hydration. Evidence for existing mixed-case acceptance: `frontend/src/composables/oidValidation.js:43-57`; `frontend/tests/oidValidationWiring.test.js:11-26`.

### R2 — Authoring API writes enforce the same casing

Direct create/update requests must follow the same authoring policy, so browser input handling is not the only enforcement. Omitted OIDs and an exact echo of an existing identifier must not rename legacy rows during unrelated edits. New/different identifiers are normalized before persistence and collision checks. Both form PUT and PATCH, field-profile new-definition creation, and ordinary field/form/codelist/unit/visit writes are covered.

Keep existing validation semantics rather than globally replacing snapshot validators: `backend/src/schemas/_common.py:17-19,38-58`; mixed-case schema compatibility tests at `backend/tests/test_oid_validation.py:30-40,75-77`; shared profile schema `backend/src/schemas/field_profile.py:17-46`. Unit/visit schemas currently have no charset validator (`backend/src/schemas/unit.py:6-19`; `backend/src/schemas/visit.py:6-19`); do not add unrelated character restrictions there.

Preserve current transactional conflicts and exact identity semantics; never silently merge, rename-on-collision, or rebind. Per-project unique constraints: `backend/src/models/form.py:23-24`, `codelist.py:25`, `unit.py:23`, `visit.py:23-25`.

### R3 — Existing editing and free-text behavior remains compatible

Retain required/optional/blank semantics, current charset checks, Saimeisi field/form 8/10-character caps and unchanged-value exemptions, length-at-entry controls, field-library selection, save/cancel, dirty-leave guards, and exact rename/fork behavior. The current Saimeisi policy is implemented in `frontend/src/composables/oidValidation.js:7-40` and exercised by `frontend/tests/component/OidEditSave.spec.js:120-178`.

Names, labels, unit symbols, form domain, search text, and option values must not be uppercased. ASCII-only conversion must not turn non-ASCII characters such as `ß` into allowed ASCII. Existing invalid-input validation still applies where present.

### R4 — Preserve historical/source/snapshot identity

No read-time casing, startup migration, live-data rewrite, or import normalization. Template import preserves source OIDs and reuse behavior (`backend/.claude/CLAUDE.md:97`; `backend/src/services/import_service.py:496-520`); whole-project clone preserves field identifiers and annotations (`backend/src/services/project_clone_service.py:244,267-278`).

Pure binding and shared definition updates must retain unchanged lowercase candidates. Explicit history restores/replay retain their exact snapshot/ownership/conflict semantics (`backend/src/services/field_profile_service.py:99-126`; the pending `field_restore_service.py:52-68,108-142`, to reverify after merge). Global uppercase validators are unsuitable because these schemas also carry snapshots.

Field OIDs are annotation-position keys (`.trellis/spec/guides/cross-stack-contracts.md:754`); do not migrate keys or transform annotations/preview/export values. Unchanged identifiers and their annotation maps remain unchanged. Actual manual renames keep existing application behavior rather than introducing a new migration mechanism.

### R5 — Verification, security, documentation, and isolation

Follow TDD, retain regression coverage, perform a dedicated input/ownership security review, inspect the actual diff, and obtain the relay's independent read-only review after A's review passes. A reruns all approved validation commands rather than accepting B's claims. Coverage must remain >=80% and not decrease; do not add a coverage gate to project runner configuration.

Update README zh/en, root/module CLAUDE current feature notes, and `.claude/index.json`. A separately owns task/spec/context/history records. No commit, merge-to-main, push, dependency expansion, production access/restart, or branch/worktree removal is authorized by planning approval.

### R6 — Newly minted field-copy OIDs are uppercase

New field copies use uppercase source plus `_COPY`, `_COPY1`, etc., consistently in frontend draft creation and the backend field-copy endpoint. Preserve the smallest-free numeric collision ladder, exact existing-name identity, human-readable copy names, whole-project source-copy semantics, and snapshot restoration. Existing lowercase suffixes must not be rewritten.

Evidence: `frontend/src/composables/fieldDefinitionAutocomplete.js:94-107`; `backend/src/routers/fields.py:429-459`. Other fresh generated OIDs already use uppercase (`frontend/src/composables/useApi.js:232-251`; `backend/src/utils.py:13-22`) and need no generator refactor.

## Acceptance criteria

| ID | Requirement | Testable outcome |
| --- | --- | --- |
| AC1 | R1 | Each of the nine controls converts typed/pasted `ae_01.a-b` to actual state/DOM value `AE_01.A-B`; its authoring save payload agrees. |
| AC2 | R2 | Direct API creates and genuinely changed OID updates store uppercase; both form update methods and new field-profile definitions are tested. Omitted/exact-echo legacy updates preserve identity. |
| AC3 | R2/R3 | Invalid characters, required/optional blanks, case-only normalized conflicts, and transaction rollback behave correctly; no implicit candidate binding or data overwrite occurs. |
| AC4 | R3 | Option codes and other non-OID text preserve case; non-ASCII invalid OIDs cannot become valid through Unicode uppercase expansion. |
| AC5 | R3 | Saimeisi maxlength/save caps, long unchanged legacy values, real candidate selection, draft/persisted saves, and cancelled edits retain their contracts. |
| AC6 | R4 | Loading, pure binding, metadata-only shared updates, snapshot replay/restoration, imports, and project clone do not case-migrate legacy identifiers or annotation maps. The merged horizontal-table guard/atomic restoration regressions remain green. |
| AC7 | R6 | Frontend/backend field copies mint the same uppercase `_COPY` ladder under collisions, without changing copied human-readable names or existing rows. |
| AC8 | R5 | A records real command results, baseline/final coverage, reviewed scope/diff, security check, independent-review result/cost, and live-browser observations or explicit blockers. |
| AC9 | R5 | Current behavior docs/index match the implementation; final reporting separates passed, failed, not-run, and environment-blocked checks. |

## Out of scope

- Unrelated refactoring, architecture/release/deployment changes, new dependencies/runners, global API/ORM normalization, case-insensitive indexes, and database/schema migrations.
- Broader authorization, import/export rendering, annotation geometry, or horizontal-table behavior changes. Their relevant contracts are regression boundaries, not new features.
- Writes to the main checkout, peer-owned files, or shared journal/index; live DB/config/credential inspection.

## Implementation and validation references

- `design.md` closes the data-flow, write/snapshot exception, collision, and rollback decisions.
- `implement.md` defines B's exact write allowlist, ordered TDD steps, A/B ownership, executable verification commands, review gates, and escalation/report format.
- `research/oid-boundaries.md` records source evidence, the baseline caveat, and verified runtime availability. Backend pytest is hermetic (`backend/tests/conftest.py:23-30,51-57`; `.trellis/spec/backend/quality-guidelines.md:275-314`). A installed the existing frontend lockfile after implementation approval (`npm ci`, exit 0); engine warnings and existing dependency audit advisories are recorded in `implement.md`, with no automatic upgrade authorized.
- Browser verification uses only a throwaway instance/database/page; required temporary-credential generation needs separate explicit confirmation. If blocked, report the unverified live scope rather than claiming DOM verification.

## Planning board

- [x] Obtain planning consent and relay-A approval; check tool prerequisites; create isolated branch/worktree/task.
- [x] Inventory OID inputs and write/import/copy/snapshot paths; persist source evidence.
- [x] Resolve user decisions one at a time and incorporate them losslessly.
- [x] Produce design/implementation plan and real curated implement/check contexts; converge this PRD into one requirements/acceptance structure.
- [x] Validate artifacts, context sizes/paths, text completeness, and unchanged planning status; ready for user review.
- [x] Receive implementation approval (2026-10-27).
- [x] Receive peer completion, safely synchronize/recheck the baseline, and activate the approved task (`in_progress`).
- [x] Dispatch B and complete implementation plus two bounded fix rounds; A inspected actual diffs/new files, reran the approved checks, and completed input/security plus isolated live-browser verification.
- [x] Complete independent read-only R review: PASS/no blocking defects; retain its eight non-blocking advisories without an automatic extra fix round. Functional acceptance evidence is complete.
- [x] User-requested follow-up (2026-10-28): spec/comment cleanup and the 7 net-new lint warnings fixed (lint back to the 2720 baseline); tests/build re-verified; candidate overlaid into main and its dist rebuilt for 8888.
- [x] Service restarted by the user (2026-10-28 13:08:56 CST); A verified the new process, listening port, HTTP 200 and served/build/runtime file identity.
- [x] User testing on 8888 passed (2026-10-28): "测试没有问题，收尾".
- [x] Explicit authorization for full Git/Trellis finalization, including push and task-worktree/branch cleanup, confirmed through AskUserQuestion ("完整收尾（推荐）"). Finalization results are recorded in `research/a-verification.md` and the session journal.
- [x] Subsequent user continuation authorized the fourth component spec/shared test-environment investigation. Host clock rollback was measured and deterministically reproduced; a test-only non-decreasing real-clock guard and four regressions resolved the gate. Both serial/default full frontend runs now pass1056 node:test +207 mounts, without business/dependency/runner changes. Full evidence: `research/finalization-blocker.md`.
