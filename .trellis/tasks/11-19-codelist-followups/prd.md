# 字典快捷新增后的跨页签刷新与结果反馈

## Goal and Authorization

Record two verified codelist quick-add follow-ups so users can see a newly created dictionary when returning to the options tab and can distinguish a committed creation from a failed subsequent refresh.

On 2026-11-19 the user requested: “创建新的trellis任务记录问题，然后完成之前任务的收尾工作”. This authorizes backlog records and source-task closeout, **not implementation of this task**. Keep `status=planning`; creation used `--no-start`. Do not select/start this task or dispatch an implementation agent. These requirements have not passed RED/GREEN or browser acceptance.

## Provenance and Baseline

- Source task: `11-16-edit-conflict-followups`, branch `docs/edit-conflict-followups-plan`.
- The inspected source tree is `/home/decade/CRF-Editor/.claude/worktrees/edit-conflict-followups-plan`, not this planning worktree. Source/test changes were uncommitted when this issue record was created; the user subsequently confirmed the five-batch commit plan and old-task closeout. The accepted source/test inventory is now commit `215a744e67b9b5f4d3c34cbce5ff14066e537a53`; its documentation, specs and task records are `ff0d9c0`, `5eca89a` and `8b559fc`. No merge into main or this planning branch has occurred.
- This planning branch was created from `main` at `2549ec69d39a69b9ad8841c35c60f1554d82cc9a`. It does **not** yet contain the source task's accepted repairs. In particular, `frontend/tests/component/FieldsTabTransitionBranches.spec.js` exists in the inspected source worktree but not this branch's older baseline; the other nine `relatedFiles` paths exist in both. Reconcile the accepted source-task commits before future implementation; do not test or patch the older local baseline as if it already included those repairs.
- The source task's `two-risk-results.md` governs accepted AC2-COPY / AC2-RELOAD outcomes and disclosed execution deviations. The broader original AC2 was not fully accepted. Moving the issues below to this task does not retroactively mark it passed, erase the original B2/2 limit or waive those deviations.
- Evidence below comes from read-only inspection of the source worktree and its existing tests. This recording phase ran no application, browser, code tests or security scans and accessed no credentials, private memory or production resources. Source line numbers are inspection anchors, not stable future locations.

## Confirmed Requirements and Evidence

### CL-1 — Refresh an already-mounted options tab on return (MEDIUM)

**Trigger:** open the options tab at least once; switch to the fields tab; create a dictionary through quick add; return to the options tab without another global refresh.

**Observed code path:** the producer updates its own host, while invalidating an API cache does not replace an array already held by another mounted component. Lazy tabs remain mounted after their first activation; returning to the tab currently performs no local re-read.

Source-worktree anchors:
- `frontend/src/App.vue:224-237,937-949`: tab activation and retained `CodelistsTab` host.
- `frontend/src/composables/useLazyTabs.js`: `activatedTabs` retains previously shown tabs.
- `frontend/src/components/CodelistsTab.vue:44-59,120-123`: load/reload and existing mount/project/selection/refresh watchers; no reactivation load.
- `frontend/src/composables/useApi.js:119-153,216-243`: cache invalidation is not a consumer-state broadcast.
- `frontend/src/components/FieldsTab.vue:379-405` and `frontend/src/components/FormDesignerTab.vue:3746-3782`: add branches do not broadcast `refreshKey`; edit branches still do.
- `frontend/tests/component/CodelistsTabBehavior.spec.js:148-155`: manually increasing `refreshKey` proves only the consumer's existing watcher, not the quick-add producer path.
- `frontend/tests/fieldsTabCodelistQuickEdit.test.js:49-55`: existing source contract intentionally distinguishes add-transition handling from edit-time global refresh.

**Required outcome:** return to the options tab with a local, guarded refresh; retain the existing selected dictionary if it still exists. Do not restore unconditional global `refreshKey++`, reload unrelated editors, clear drafts/history or advance their write baselines. This is an application-tab issue, not a general browser-multitab live collaboration requirement.

### CL-2 — Distinguish committed creation from failed refresh (MEDIUM)

**Trigger:** dictionary creation POST succeeds, then an awaited consistent/fallback read fails while the original operation is still current.

**Observed code paths:**
- `frontend/src/components/CodelistQuickEditDialog.vue:164-223`: POST and `afterChange('add', ...)` share one catch; a post-commit read error can look like a failed creation and leave a resubmittable creation dialog.
- `frontend/src/components/FieldsTab.vue:89-123,330-405`: some loaders catch read errors without returning a distinct failed-refresh outcome; the caller can continue binding/closing with ordinary success feedback. The fallback `cachedGet` branch can instead throw into the child's common catch.
- `frontend/src/components/FormDesignerTab.vue:528-532,3746-3782`: codelist fallback reads can throw; retain its selection/project/auth/input guards. This host is initially a read-only regression target, not an authorized product-write file.
- `frontend/tests/component/CodelistQuickEditDialog.spec.js:70-107,132-168`: existing cases cover waiting for `afterChange` and a failed POST, not a successful POST followed by a failed read.
- `frontend/tests/component/FieldsTabTransitionBranches.spec.js:36-64`: metadata-missing control covers a successful refresh, not this failure terminal state.

**Required outcome:** keep creation failure separate from refresh failure. For a still-current operation whose POST committed but refresh failed, give one unambiguous terminal message, for example: `字典已创建，但列表刷新失败，请刷新后核对，勿重复新增。` Do not silently bind an unverified candidate, automatically retry the POST, or leave the same committed creation available as an ordinary retry. A real POST failure still retains the original dialog/input for correction. Cancellation, project/auth changes, unmount or a replaced dialog must not close a newer dialog, clear its input or display the old operation's completion feedback. The identified risk is misleading manual resubmission, not an existing automatic duplicate POST.

### UNIT-DEFERRED — Created-unit dialog finalization (LOW; explicitly deferred)

- `frontend/src/components/FormDesignerTab.vue:3793-3836,5025-5031`: an invalidated operation correctly avoids binding the created unit to the wrong field/session and invalidates the original project's unit cache, but may leave the original dialog without an explicit committed-but-no-longer-bound terminal state.
- `frontend/tests/component/DeferredResponseIdentity.spec.js:187-230,345-385`: existing stale/cancel/reopen tests prove no incorrect rebinding and no clearing/closing a newer dialog.
- Preserve those protections. This remains a recorded UI-finalization issue; real-browser reachability was not verified in the recording phase.
- The user selected planning for CL-1 and CL-2 only. Do not implement this unit item without separate approval.

## Proposed Minimal Approach — Not Implemented

Preserve the previously discussed four-source/four-test boundary:

| Source file | Proposed responsibility |
| --- | --- |
| `frontend/src/App.vue` | Pass whether the codelist tab is currently shown. |
| `frontend/src/components/CodelistsTab.vue` | Locally reload on reactivation, avoid duplicate first-mount reads, reject stale project/auth/disposal/read-generation results. |
| `frontend/src/components/CodelistQuickEditDialog.vue` | Separate POST commitment from subsequent refresh outcome and finalize only the original current dialog. |
| `frontend/src/components/FieldsTab.vue` | Propagate the quick-add refresh failure distinctly without changing unrelated ordinary-load/cancel behavior. |

Existing tests to extend:
- `frontend/tests/component/CodelistsTabBehavior.spec.js`
- `frontend/tests/component/AppWorkspaceBehavior.spec.js`
- `frontend/tests/component/CodelistQuickEditDialog.spec.js`
- `frontend/tests/component/FieldsTabTransitionBranches.spec.js`

`FormDesignerTab.vue`, `DeferredResponseIdentity.spec.js` and `CoreEditorConflict.spec.js` are read-only regression targets initially. If the four-source boundary cannot safely satisfy the requirements, report the concrete dependency and obtain approval before broadening writes. These suggestions are not an approved detailed implementation plan; finish/review `design.md` and `implement.md` before any future start.

## Future Acceptance Criteria — All Pending

- [ ] **CL-1a:** a real consumer mount shows the new dictionary after options → fields quick add → options, with an App-host activation wiring witness. App's mocked workspace tabs alone are not full cross-component proof.
- [ ] **CL-1b:** initial activation is not loaded twice; return refresh preserves a still-existing selection and rejects responses for a departed project/auth session or an unmounted/replaced consumer.
- [ ] **CL-1c:** no global editor refresh, input/draft/history reset or unproven revision-baseline advancement is introduced.
- [ ] **CL-2a:** after a successful POST and a failed awaited read, the current dialog reaches an explicit committed-but-refresh-failed terminal state with one warning and exactly one POST, for both propagated and previously swallowed failure branches.
- [ ] **CL-2b:** a genuine POST failure retains the original input/dialog; successful normal and metadata-fallback flows still work.
- [ ] **CL-2c:** cancel/reopen, selection changes, project A→B→A, auth changes and unmount do not rebind stale data or finalize a newer dialog; no automatic write retry occurs.
- [ ] Existing codelist/unit transition continuity, conflict cancellation, copy visibility, explicit reload and own-write/history regressions remain green.
- [ ] Keep §17's opaque revisions, frozen `If-Match`, paired payload/header publication, 19 strict writes, 9 consistent reads and 3 metadata-only POST registrations unchanged; do not change Agent contracts or import/export privacy boundaries.
- [ ] Complete targeted RED/GREEN, the existing frontend suites, same-scope default/serial coverage with all four metrics ≥80% and nondecreasing, lint/build, actual-diff review and the applicable backend design-revision/Agent regressions. Re-establish the accepted source-task baseline first; its last verified frontend checkpoint was 1117 node tests + 923 component tests over the same 64 coverage source paths.
- [ ] Perform real-browser validation only using separately authorized reusable isolated resources; otherwise report the blocker and NOT RUN scope. Component mounts are not browser/geometry evidence. No new credential generation is authorized.
- [ ] Obtain an independent read-only review of the actual authorized implementation diff; report honestly if independent review is unavailable.

## Out of Scope and Execution Guards

- No implementation, code-test execution or task activation in this recording phase.
- No unit-dialog repair, generic list-loader rewrite, copy/reload changes or broad feedback/test-debt cleanup.
- No shared fixture/helper/setup/clock/warning-gate changes, new test runner, dependencies, configuration, schema or release-process changes.
- No real database, private credentials/memory, production service/port 8888, deployment or external publication. Credential generation requires its separate formal confirmation.
- Commits, local merge, push, worktree removal and branch deletion retain their separate explicit authorization gates. Do not inherit permission from source-task agent messages or a successful check.
- Do not reset the source relay counter, restart the source task or edit its historical evidence to make this backlog appear already fixed. This is an independent continuation, not an unfinished child that blocks source-task archival.

## Next Planning Gate

The backlog scope is recorded; there is no unresolved factual question blocking this record. Future implementation still requires an integrated accepted baseline, a reviewed detailed plan, appropriate curated context manifests if delegated, explicit implementation approval and `task.py start`. Empty creation-time context manifests are intentionally not execution-ready.
