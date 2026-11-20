# Codelist Follow-ups — Technical Design

## Status and Baseline Gate

The user approved the reviewed plan for a Sonnet implementation relay followed by independent Fable review, explicitly authorized the current main model as A, and separately approved baseline integration, locked dependency installation and isolated test material. Only existing pytest-fixture self-cleanup is additionally authorized; other cleanup and ordinary commits/main merge/push/deployment remain gated. Requirement ownership and acceptance IDs are in [prd.md](./prd.md); execution/ownership gates are in [implement.md](./implement.md).

Planning inspected accepted source branch `docs/edit-conflict-followups-plan` at `3cddd4fa3f56a4f30c795f636e1cf8606e7de251`; the five proposed source files and four original component specs matched product/test commit `215a744e67b9b5f4d3c34cbce5ff14066e537a53`. Source-only generated coverage was neither read nor removed. The initially older planning tree is now integrated through authorized merge `23dfa7ff32f0e411a5dca44bb44eb2082244969e`, including accepted spec commit `5eca89a1faa6480d6b0494ca5db37faaefcad7f1`; scoped product/test equivalence, ancestry and preservation of pending planning materials were verified. Main remains `2549ec6`.

The archived source report remains `.trellis/tasks/archive/2026-11/11-16-edit-conflict-followups/two-risk-results.md` (archive commit `b394fc5d61ad619b5acabcfbb44506f860cc5cb1`). Inherited historical results are not fresh relay validation. Current runtime state/handles belong to `relay-state.md`, never an inferred activation or model-resolution claim.

## Required Context Loading

The first manifest validation exposed oversized full-file injection: `component-guidelines.md` and `cross-stack-contracts.md` exceed the 32768-byte per-file cap, and a truncated prefix omits the relevant later section 17. `state-management.md` is also close to that cap. The curated manifests therefore inject smaller indexes plus hook/quality guides, **not** these oversized/near-limit full files. Before start and again for any future implementation/check worker, locate the current component props/dialog sections, state refresh/history sections and complete cross-stack section 17 with a heading search followed by range Reads. Record that retrieval; a pointer, old excerpt or prefix injection cannot satisfy it. Revalidate context sizes after baseline integration without changing runtime settings or copying a stale contract into a new authority.

## Scope and Ownership

One native background implementer B owns the following approved, mutually exclusive code/test slice after task activation. A owns operational/task/spec/documentation records and final acceptance; A does not edit B's slice concurrently. Exact status/generated-artifact paths are assigned in `implement.md`.

| Product file | Responsibility |
| --- | --- |
| `frontend/src/App.vue` | Forward codelist visibility and its uninterrupted local context counter only; no requests, global refresh or editor authority. |
| `frontend/src/components/CodelistsTab.vue` | Own activation-triggered list reads and guarded local publication. |
| `frontend/src/components/CodelistQuickEditDialog.vue` | Separate POST commitment from host refresh outcome and finalize only the originating operation. |
| `frontend/src/components/FieldsTab.vue` | Explicit codelist-add read outcomes, deferred feedback and verified rebinding. |
| `frontend/src/components/FormDesignerTab.vue` | Same outcome policy for codelist add only; preserve default helper behavior for unit, copy and other callers. |

Existing tests to extend: `CodelistsTabBehavior.spec.js`, `AppWorkspaceBehavior.spec.js`, `CodelistQuickEditDialog.spec.js`, `FieldsTabTransitionBranches.spec.js`, `CoreEditorConflict.spec.js` under `frontend/tests/component/`, plus the directly coupled `frontend/tests/fieldsTabCodelistQuickEdit.test.js` if its source-signature assertions change. No new helper, fixture, runner, dependency, global state store or configuration is needed. The user's formal “同步单个用例（推荐）” answer on 2026-11-19 additionally permits only the named R2a fallback-read/auth-departure case in `DeferredResponseIdentity.spec.js` (original312–343) and necessary adjacent comments to adopt the already-approved deferred-notice policy. Preserve/strengthen real reads, auth departure, no late install/rebind and single POST; never delete/skip the case. All its other cases, all of `DeferredResponseIdentityT5.spec.js` and `NotesSyncFreshness.spec.js` remain read-only. Additional dependencies still require a reported reason and approval before writes.

## CL-1 — Consumer-owned Activation Refresh

### Existing flow

`App.vue:224-237,937-949` retains an activated options-tab child. `useLazyTabs.js:3-19` records activation, not a fresh mount on every return. `CodelistsTab.vue:44-59,120-123` observes mount/project/global refresh but not visibility. `useApi.js:119-153,216-243` can invalidate cached requests, but cannot replace the child's existing array. The producer therefore must not solve this by broadcasting another global editor reload.

### Visibility contract and read ownership

1. Add optional `active` (Boolean, default `true`) and `contextVersion` (Number, default `0`) props to `CodelistsTab`. App forwards visibility and a local monotonic context counter at the existing lazy host. That counter observes App's own project id and codelist enter/leave synchronously, including intermediate values that render batching collapses; unrelated tab hops do not increment it. It is UI lifetime evidence, never an HTTP revision/tag or write authority. Keep lazy mounting and existing leave guards unchanged.
2. Use one batched, immediate read-trigger watcher for project id, visibility, context counter and injected `refreshKey`, replacing overlapping triggers. Vue's batching coalesces the read; do not add an unnecessary unowned `nextTick` read queue or a second `onMounted(load)`. A hidden consumer defers work until active. No queued callback may start a GET after disposal.
3. Keep synchronous context invalidation separate from reading. A review confirmed that a child-only sync prop watcher cannot observe intermediate values already collapsed by the parent's render. The minimal existing-App producer counter therefore records those departures; the child invalidates its read ticket on counter/net-context change before awaiting a candidate. No fetching, large-array watching or global store in the producer. Original-A→B→A and hide→show must invalidate departed reads even when final id/visibility is unchanged; test the real producer as well as counter-consuming child behavior.
4. Each actual read captures project, context counter/ticket, monotonically increasing read generation and `getApiSessionGeneration()`. Every local write/reorder read participates in that generation. Require current visibility, unchanged context, auth, latest generation and non-disposal before publication/feedback and deferred sortable work; no post-disposal read may be newly dispatched. Read lifecycle state through existing helpers, never credential values.
5. Reactivation invalidates only the target project's codelist URL before `api.cachedGet`; initial loading retains cached-read semantics. No polling, event bus, forced remount, `KeepAlive` hook or `useApi.js` change. Existing edit/write `reload()` broadcasts remain outside this read-only activation path.

### Publication and failure

Stage the result locally. At installation, preserve the **currently selected** dictionary id if present in the result, rather than restoring a selection captured before the user changed it. If it disappeared, use the existing empty-selection behavior; do not select the new dictionary automatically. Preserve search text, unsubmitted dictionary/option inputs and unrelated editor state. Check table `current-change` behavior so replacing rows cannot silently select a different dictionary by old row index.

A current failed read retains the old list and selection and emits one local refresh error. A hidden, superseded, departed-project/auth or disposed read produces no late publication or feedback. Deferred `nextTick` sortable initialization must recheck lifetime; do not refactor sortable lifecycle or repair unrelated existing issues.

This list has no authority to advance field/designer snapshots, frozen save baselines or history. Existing App refreshes when entering fields/designer are not newly redesigned here; test the absence of **additional** activation/add broadcasts against those existing effects.

### Framework basis

The installed project declares Vue `^3.5.25`. Official watcher documentation, checked through Context7 on 2026-11-19: <https://vuejs.org/guide/essentials/watchers>. Immediate callbacks own initial loading; default callbacks batch updates; `flush: 'sync'` callbacks do not batch and should be restricted to lightweight invalidation. Watcher disposal stops future callbacks, not an already pending Promise, so explicit settled-response guards remain necessary. No framework upgrade is proposed.

## CL-2 — Committed Creation and Refresh Are Different Outcomes

### State machine and local callback compatibility

Keep POST and post-commit refresh as separate phases:

| State / event | Current originating operation | Departed or replaced operation |
| --- | --- | --- |
| Validation / reminder cancellation | Preserve input; no POST. | Ignore late reminder acceptance. |
| Real POST rejection | Original error, original dialog/input retained; no refresh callback. | No old completion/error feedback or changes to a newer dialog. |
| Parsed POST success | Record commitment once, invalidate both original-project caches, then await host refresh. | Keep original-project cache invalidation; no rebinding or newer-dialog effects. |
| Host refresh succeeds | Verified host binding, original close, then existing optional success toast. | No stale rebinding or completion toast. |
| Host read fails | Original dialog reaches a non-resubmittable terminal state; close it and warn once: `字典已创建，但列表刷新失败，请刷新后核对，勿重复新增。` | Suppress late feedback and newer-session finalization. |
| Read succeeds but created id is absent | Do not bind; close original dialog and warn once: `字典已创建，但当前列表尚未显示新字典，请刷新后核对，勿重复新增。` | Same lifetime protection. |

The existing awaitable callback arguments remain `afterChange('add', { codelist, transition, isCurrent })`. Its planned local return contract is `undefined` (legacy success), `{ status: 'refreshed' }`, `{ status: 'cancelled' }`, or `{ status: 'not-visible' }`; a current read failure rejects. Both in-scope hosts return explicit cancellation when their composed editor lifetime has ended. Undefined remains success only for compatibility with existing consumers, not a way for these hosts to hide a failed read. No HTTP body/header schema or MCP contract changes.

`cancelled` carries no success/error notice. Existing quiet finalization may close the **original** still-owned modal after context departure, but must never close/reset a reopened or replaced session. If an original modal is retained, its committed submission remains non-resubmittable. A per-session committed marker prevents a second POST while closure is propagating; a per-operation saving owner prevents an older `finally` from enabling/disabling a newer submission. A fresh user-opened dialog is a distinct session, not an automatic retry.

Use the originating project/dialog/mode/target/auth/disposal identity throughout POST, callback, catch and finally. Compose the parent's `isCurrent` with its original editor/selection/project lifetime; a visible dialog alone is insufficient. Preserve pending-option reminders, free-text option codes, host-specific normalization, current POST-failure input retention and normal close→success-toast order. Generic ambiguous transport or unreadable successful-response bodies are existing separate debt, not proof of a committed creation in this design.

### Host outcome propagation and feedback ownership

- **FieldsTab:** add a narrowly scoped caller-managed read-error policy to `load` / `adoptAddTransition`, used only by the quick-add callback. Normal mount/project/global/edit loads retain their current notification and cancellation behavior. A quick-add read failure must escape the existing catches rather than resolving as success. Existing source-signature assertions may be updated, but the project/auth/disposal/read-generation checks remain mandatory.
- **Designer:** give `adoptOwnTransition` an opt-in codelist-add error/notice policy. Its default behavior and all unit/copy/other callers stay unchanged. The codelist callback opts in so an actual candidate-read failure is propagated, not toasted then treated as an unproven transition. A normal unproven/missing-metadata outcome may still use the existing guarded codelist-only fallback.
- In both hosts, defer any existing unproven/foreign-gap notice until the needed codelist reads succeed. If a read fails or the created id is unavailable, discard that pending notice and let the child emit the one truthful terminal warning. Do not emit a host load error and then another child warning for the same failure. Successful external-gap paths keep their existing conservative warning and later-review semantics; missing metadata alone is not an error.
- Stage fallback rows before publication and check the composed lifetime after every await and immediately before binding. Never bind `created.id` merely because POST succeeded; require it in the verified current codelist array. Failure/cancellation does not advance or relabel an editor baseline. Already acknowledged own transition edges need not be rolled back, but are not a substitute for a verified candidate.
- Do not add new automatic read retries to hide failure. Existing bounded coherent-read retry semantics are unchanged, and no branch ever retries the POST.

## Invariants, Compatibility and Rollback

Cross-stack §17 remains authoritative: opaque revisions; exact body/tag pairing and own-chain proof; frozen `If-Match`; nineteen strict writers, nine consistent reads and three metadata-only POST registrations unchanged. CL-1 is display-list refresh only. CL-2 preserves exact-candidate adoption and conservative external/legacy gaps, including independently proven designer projections. It never upgrades an older default/editor/history snapshot solely to make a save succeed.

The generic `state-management.md:280-340` broadcast guidance predates the accepted quick-add exception. For these management-add paths, current §17 and the accepted no-broadcast producer contract take precedence; ordinary dictionary edit broadcasts are not removed. Future spec synchronization should state this narrow exception, not rewrite the global refresh system.

The later separately authorized S1/S2 compatibility repair keeps an edit reopened on the same pending target non-submittable until its committed save refreshes/broadcasts and closes that stale-seeded modal. Submitted description, like name/options, is fixed before any await. This is a component-local pending-target guard, not a global lock/revision advance; another-target/mode reopen retains isolated ownership. The add cancellation outcomes above do not remove ordinary edit refresh.

No database/schema/API migration, backend/adapter modification, release/build-script change, production service or deployment is part of this design. Review the actual implementation diff with security attention to project/auth/disposal boundaries and duplicate writes. Future behavioral documentation updates are limited to the relevant README sections/module notes/index and the narrow spec clarification, without rewriting historical acceptance records.

Rollback points are CL-1 and CL-2 separately. Reverting a failed, uncommitted local slice must preserve baseline snapshots, tests/evidence and unrelated work and still needs approval for destructive removal/reset. Do not roll back the source task, online revision schema, deployed data or credentials. Beyond the completed authorized baseline merge, ordinary commits, main merge, push, worktree removal and branch deletion remain separately gated. Fresh isolated test material is authorized without value disclosure; existing pytest-fixture self-cleanup is the only cleanup exception, not permission to delete backups/reports/browser resources.
