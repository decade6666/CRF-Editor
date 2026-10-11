# Design — app-word-import-split

PRD: `prd.md`. Shared execution runbook: `.trellis/tasks/10-08-review-remediation/implement.md` (§0–§8).

Evidence is re-verified against `main` @ `6090a81` (2026-10-11). The PRD's source line numbers are stale; the anchors below use the current checkout. The two research maps are current read-only audits: `research/app-vue-wizard-map.md` and `research/source-reading-tests.md`.

## 0. Re-baseline

- `frontend/src/App.vue`: 1,913 lines. Script: lines 1–1040; template: 1042–1698; scoped style: 1700–1913. The regular-user branch begins at 1083. Within it, the selected-project content gate is at 1221–1278; the Wizard and compare mount at 1355–1556 are after that gate, so they are inside the regular-user branch only and remain mounted with `projectId === null`.
- Wizard script boundary: refs at 677–693; computed / watchers / helpers / handlers at 695–977; post-import designer navigation at 979–992. App's `onBeforeUnmount` is 177–180; `refreshKey` is provided at 183–184. The existing project, tab, and designer-ref owners are at 130–133.
- Wizard-only scoped style range: 1711–1778. Shared settings styles stay at 1861–1871; global dialog styles stay at 1902–1912.
- The settings `导入Word` action and its disabled state are App-owned at 1578–1584. `FormDesignerTab` is async at App.vue:50; its lazy mount and ref are at 1257–1264. Its public `selectFormById` is defined by `defineExpose` at `FormDesignerTab.vue:3068–3080`; `useLazyTabs.js:3–19` shows first activation is lazy and activation is retained until reset.
- `useApi.js:32–46` defines `apiUrl`; `api.js` requests pass through it at 151–229. The current App bypass requests are Word export (`App.vue:300`), `_blobDownload` (`340–341`), project import (`412`), and Wizard `el-upload` (`1364`). Only the last moves. `basePathDeployment.test.js:97–107` and its recursive scan at 117–125 guard these paths.
- The compare child is currently dynamically imported at App.vue:54 and mounted at 1541–1555. The Wizard action icon imports are at App.vue:18–28; `UploadFilled` is Wizard-only, while `Loading` also serves App's auth and template-import views.
- Locked Vue version is 3.5.29 (`frontend/package-lock.json:3638–3639`); `package.json:6–13, 15–33` has no coverage script or coverage provider. Do not add a dependency for frontend coverage.
- Current frontend inventory is 17 components, 33 composables, and 79 test/support files: 71 node `.test.js` files + `testProperty.js` + 7 component-test files (5 `.spec.js`, `setup.js`, `vueWarnGate.js`). Root `.claude/CLAUDE.md` still says 16/32/77. `.claude/index.json` lists 16 component paths and omits the existing `CodelistQuickEditDialog.vue`, although that file exists and the frontend module doc counts 17.

## 1. Target structure

```text
App.vue
├─ showImportWordDialog + openImportWordDialog()             App shell / entry button
├─ <WordImportDialog v-model ... :project-id ... />           Wizard UI + per-instance wizard state
│  ├─ useWordImport({ projectId, visible, refreshKey })       upload / AI / execute state machine
│  └─ defineAsyncComponent(DocxCompareDialog.vue)             keyed compare and screenshot evidence
└─ formDesignerTabRef + useDesignerFormSelection(ref)         queued post-import form selection
```

`WordImportDialog` is statically mounted at the former Wizard location inside the regular-user branch, but outside the selected-project content gate. It remains mounted when `projectId` is `null`; the entry button remains disabled with no project. Session reset closes it and then unmounts the regular-user branch. No backend, `FormDesignerTab.vue`, API route, or package dependency changes.

## 2. Binding contracts (D1–D10)

### D1 — `useWordImport`

- Add `frontend/src/composables/useWordImport.js`, exporting `useWordImport({ projectId, visible, refreshKey })`; each argument is a Ref, and `projectId.value` may be `null`. All mutable state is per invocation. Keep `aiReviewPollTimer` and `disposed` as closure-local state, never module-level state.
- Move all Wizard refs except the App-owned visibility ref (explicit D3 exception), all computed values, functions, and watchers from App.vue:676–977. All request/project checks change from `selectedProject.value.id` to `projectId.value`; all open-state checks change from `showImportWordDialog.value` to `visible.value`.
- On `visible === true`, run the complete body of the existing `openImportWordDialog()` (App.vue:862–875) except its final visibility assignment. On false, preserve the close watcher at 714–721 exactly: stop the poll timer, clear `importWordAiTaskId`, close compare, null compare data, and reset accepted overrides. Do not clear `tempDocxId`, step, preview, selected forms, results, error text, or AI status/error on close; they are reset on the next open.
- Preserve back-step behavior at 877–887, including that it does not explicitly clear `importedResults`. On execute success, keep `api.clearAllCache()` then `refreshKey.value++` (962–963). Replace App's timer cleanup call (179–180) with per-invocation disposal handling: `let disposed = false; onScopeDispose(() => { disposed = true; stopAiReviewPolling(); })`.
- The disposed guard is required because `stopAiReviewPolling()` only clears an existing timeout (723–728); an in-flight GET must not reschedule after unmount. `pollAiReview` bails out when disposed before issuing the request and after it settles, before any state write/reschedule in both success and error paths. `scheduleAiReviewPoll` also bails out when disposed. This is the approved D8 unmount behavior, not module-level state.
- Preserve the 10 MiB upload limit; upload/execute error messages; `toggleSelectAll`; API routes and payload shape; AI acceptance helpers; comparison-data replacement; and the 3-second poll schedule, stale-task checks, 404 message, and stop-on-done/failed/close/unmount semantics. AI suggestions remain default-off; include `ai_overrides` only for a non-empty payload. Keep server `temp_id` byte-for-byte from preview response through execute body and compare `temp-id`; never substitute the separate `ai_task_id`.
- Keep every function below 50 lines and nesting at most four. If the composable's setup body becomes too long, extract cohesive per-invocation private factories for AI polling and suggestion acceptance (and only the minimum additional cohesive seams); do not create shared mutable module state. Record each function's final line count in the implementation report and keep the new file under 800 lines.

**Ownership clarification R1:** D1 says “every Wizard ref” moves, while D3 explicitly keeps `showImportWordDialog` in App and D2 supplies it as `modelValue`/`visible`. Treat the App-owned visibility Ref as the sole exception; the composable owns the operational Wizard state. This specificity-based clarification is necessary for the given API shape.

### D2 — `WordImportDialog.vue`

- Add `frontend/src/components/WordImportDialog.vue` with required Boolean `modelValue`, nullable Number `projectId` defaulting to `null`, and emits `update:modelValue` and `open-designer(formId)`.
- Call `useWordImport` with `projectId: toRef(props, 'projectId')`, `visible: toRef(props, 'modelValue')`, and `inject('refreshKey')`. Use the project-id Ref as `projectId` in the template/action.
- Move the App.vue Wizard `<el-dialog>` (1355–1538) and `DocxCompareDialog` mount (1540–1556) verbatim except: the main dialog forwards `:model-value="modelValue"` and `@update:model-value="emit('update:modelValue', $event)"` and nothing else (do NOT also forward `@close`: Element Plus 2.13.2 emits `close` in `beforeLeave` but `update:modelValue(false)` only in `afterLeave`, so forwarding `close` would move the close-branch cleanup to the start of the leave transition, an undeclared timing change); footer close/cancel controls emit false; replace `selectedProject.id` with `projectId`; and make “打开设计页” emit `open-designer` with `row.form_id`.
- Keep the compare child async with the same `v-if="compareFormData"`, key, model, props, events, and `temp-id` expression. The component has a multi-root template (dialog + compare child); App passes only the declared props/events.
- Move Wizard-only styles from App.vue:1711–1778 unchanged. Import `Loading` and `UploadFilled` from `@element-plus/icons-vue`; App retains its own `Loading` import for non-Wizard views.

Dialog rules: `.trellis/spec/frontend/component-guidelines.md:125–140` requires immediate consumption when an initially-open lazy dialog depends on `modelValue`; this composable watcher must therefore handle an initial `true`. The parent `v-model`, child `:model-value`/update emit, and no-empty-setter rule are at `component-guidelines.md:484–534` (correct binding example at 519–523 and 568–573). Do not wrap `modelValue` in a computed with an empty setter.

### D3 — App shell after extraction

- Keep `showImportWordDialog` at App.vue:677 and reduce `openImportWordDialog()` at 862–875 to only `showImportWordDialog.value = true`. Keep the settings entry at 1583 unchanged. In `resetSessionState()` (71–82), add `showImportWordDialog.value = false` next to `showSettings.value = false` so logout/session reset closes the Wizard before the regular-user branch unmounts.
- Statically import `WordImportDialog` and mount it at the old Wizard position inside the regular-user branch, after the selected-project content gate has closed:
  `<WordImportDialog v-model="showImportWordDialog" :project-id="selectedProject?.id ?? null" @open-designer="openDesignerForImportedForm" />`.
  `projectId` may therefore be null while the child is mounted. The component unmounts with the regular-user branch; the composable uses the approved disposed guard and `onScopeDispose` to stop an in-flight poll as well as any scheduled timer.
- Remove Wizard state/functions/watchers, `stopAiReviewPolling()` from App's `onBeforeUnmount`, compare mount/import, Wizard-only styles, and imports proven to be Wizard-only. Keep App's shared `ref`/`computed`/`watch`, auth `onBeforeUnmount`, `nextTick`, `api`, `getAuthHeaders`, `apiUrl`, `Loading`, and `defineAsyncComponent` when still used elsewhere. Remove `UploadFilled`, `toggleSelectAll`, the five `docxAiSuggestionOverrides` imports, and the App-local `DocxCompareDialog` declaration after confirming no other use.
- Keep the Word-export fetch, `_blobDownload`, and project `.db` import fetch untouched. Keep `.settings-transfer-actions*` and `:deep(.el-dialog*)` in App. Because the main dialog has no `append-to-body`, verify in a real browser that App's dialog styles still compute on the moved dialog.

### D4 — event-driven designer readiness bridge

- Add `frontend/src/composables/useDesignerFormSelection.js`, exporting `useDesignerFormSelection(designerRef)` → `{ requestFormSelection(formId) }`. Store at most one pending form id per invocation; try immediately if the ref already exposes `selectFormById`, otherwise watch `designerRef` for the instance. The latest still-pending request wins. Read and clear the pending id before awaiting `designer.selectFormById(formId)`, so a later designer remount cannot replay a consumed selection. No timer, polling, or module state.
- In App, `openDesignerForImportedForm(formId)` keeps this order: close Wizard, `activateTab('designer')`, set `activeTab.value = 'designer'`, `await nextTick()`, `await requestFormSelection(formId)`. Do not change `FormDesignerTab.vue`.
- Rationale: `FormDesignerTab` is a `defineAsyncComponent` (App.vue:50) mounted only after `isTabActivated('designer')` (1257–1264). With locked Vue 3.5.29, an unresolved async wrapper does not expose its ref yet; the resolved inner component forwards the ref, and its `defineExpose` is available when that ref becomes non-null. `selectFormById` itself awaits `loadForms()` (FormDesignerTab.vue:3072–3079), so instance availability is the readiness condition. This replaces the old 20 × 50 ms silent-drop loop at App.vue:984–991. This is an explicit, non-exclusive implementation of PRD R3's readiness examples; do not add a ready event or edit the concurrently split designer.

### D5 — subpath contract

Keep `apiUrl()` semantics unchanged. Move the exact `el-upload :action="apiUrl('/api/projects/' + projectId + '/import-docx/preview')"` boundary into `WordImportDialog.vue`; use `getAuthHeaders()` there. Re-point `basePathDeployment.test.js`'s upload-action assertion to the new component, without weakening it. Its recursive no-bare-fetch/action scan must continue to scan all of `frontend/src`, including all three new files.

Update only the bypass ownership in the API Base Path entries of root `.claude/CLAUDE.md`, `frontend/.claude/CLAUDE.md`, and `.trellis/spec/guides/cross-stack-contracts.md`: the Word `el-upload` action moves from App.vue to WordImportDialog.vue. The verified inventory is **nine** wrapped bypass call sites: LoginView (1); App (4: Word export fetch, `_blobDownload`, `/import/auto`, Wizard upload action); ProjectInfoTab (3: project-logo GET, project-profile PUT, org-preset logo GET); DocxScreenshotPanel (1: `pageUrl()`). After the move, App owns three and WordImportDialog owns the upload action; the other eight sites and the separate `useApi.js` six-fetch-boundary count remain unchanged (`cross-stack-contracts.md:575–589`, especially rule 3 at 588).

### D6 — import and AI identity

No API or state-machine semantic changes beyond D8. The uploaded `temp_id` is server-minted, 32 lowercase hex, uploader/project-bound, and echoed verbatim; compare screenshot routes use it as a path id. AI review uses the separate `ai_task_id` response field. The server currently sets that field to the same value as `temp_id` when the AI task starts (`backend/src/routers/import_docx.py:333–334`), but the client must still read each field for its own purpose and never substitute one for the other (`cross-stack-contracts.md:169–248`, especially 196–198; current data flow is also mapped in `research/app-vue-wizard-map.md` §(f)).

### D7 — tests

1. Add `frontend/tests/component/WordImportDialog.spec.js`. Spy on the real exported `api` object's methods before mount; provide a real `refreshKey` Ref; use fake timers only in timer cases. Use the global Element Plus registration and Vue-warning gate from `tests/component/setup.js`. Keep the real teleport and query teleported UI through `new DOMWrapper(document.body)`.
2. Stub only async `DocxCompareDialog` with `vi.mock('../../src/components/DocxCompareDialog.vue', …)`; Vitest must intercept the dynamic import inside `defineAsyncComponent`. The mock component declares every passed prop and all three emitted events (`update:modelValue`, `toggle-suggestion`, `toggle-form`); do not stub `el-dialog`, teleport, or Element Plus. The spec asserts the stub receives `temp-id` and `accepted-suggestions`, emits both toggle events, and observes the resulting acceptance update through the composable (including payload or updated prop); the shared Vue-warning gate must pass without suppressing warnings.
3. The mount spec covers: open resets after a completed session (step 1, no stale preview/results); >10 MiB rejected; upload success reaches step 2; AI status URL uses `ai_task_id`, polls each 3 seconds only while open, merges suggestions and reconciles accepted state, stops on close/done/failed, preserves the 404 message, and (per S2) does not re-schedule if an in-flight response settles after unmount; execute sends exact `temp_id` and selected `form_indices`, includes `ai_overrides` only when non-empty; success reaches step 3, clears cache, increments injected `refreshKey`; failure stays on step 2 with the error; “打开设计页” emits the form id; upload action uses `apiUrl()` and headers come from `getAuthHeaders()`.
4. Add `frontend/tests/useDesignerFormSelection.test.js` under `node:test` (not vitest): it needs Vue `ref`/`watch` only, no DOM or Element Plus. Use an `effectScope` so watchers are disposed. Cover null ref → no call until assigned → exactly one call; already-ready ref → immediate call; two queued requests → latest id only; after consumption, null/remount → no replay.
5. Re-point `docxBimodalPreview.test.js:57–73`: state/close/open/back/upload/reconcile/payload checks now read `useWordImport.js`; step-2 controls and compare bindings/events read `WordImportDialog.vue`; keep each existing assertion's semantic strength. Add negative guards that App no longer owns Wizard-only refs/functions or the 20×50 ms loop, and that `WordImportDialog.vue`, `useWordImport.js`, and `useDesignerFormSelection.js` contain no bare `fetch(`.
6. Re-point `basePathDeployment.test.js:97–107`: its `:action="apiUrl(...)"` assertion reads WordImportDialog.vue; App's three remaining bypass assertions stay. Keep the recursive guard unchanged.
7. `appSettingsShell.test.js:69–83` retains the App-owned settings button/order/layout assertions; do not move or weaken them. Also extend its existing `resetSessionState` assertion (the logout/auth-expiry test around line 125) to require `showImportWordDialog.value = false` alongside the existing dialog closes. The mount spec proves the unchanged entry opens the moved component through `v-model`.
Mount-test rules are at `.trellis/spec/frontend/quality-guidelines.md:233–248`: warning gate fails any Vue warning, real `api` object spies precede mount, and the shared setup owns cleanup. Source-test re-point policy is in `.trellis/tasks/10-08-designer-split/design.md:269–295`.

### D8 — declared behavior changes only

1. Imported-form selection becomes event-driven rather than a ~1-second blind wait.
2. AI polling stops when the regular-user branch unmounts (for example, session reset/logout), including an in-flight response that settles afterwards.
3. `resetSessionState()` sets `showImportWordDialog.value = false` next to `showSettings.value = false`, so logout/session reset closes the Word Wizard instead of re-opening it after re-login with stale state. The wizard refs previously remained in App while `selectedProject` was null.

No other behavior change is approved.

### D9 — verification

Baseline and final use identical commands: `npm ci`, `node --test tests/*.test.js`, `npm run test:component`, `npm run lint`, `npm run build`, and the full backend pytest suite (runbook §3; proxy variables unset). Run the backend suite last in the final gate. Record counts against the baseline. `package.json` has no frontend coverage provider/script; do not add dependencies, and report frontend coverage as unavailable/not run. Browser E2E follows the provided `browser-e2e-recipe.md` with a throwaway backend on port 8901 and a generated DOCX with the two scaffolding tables from `backend/tests/test_word_table_parity.py::_write_docx_with_forms` (verified at lines 15–33). Exercise upload → step 2 → compare dialog → execute → step 3 → open designer and select the imported form. Repeat from a fresh page where designer was never activated to prove the delayed async chunk path. Capture matched before/after step-2 screenshots and compare computed styles for the moved Wizard selectors and App-scoped dialog/header styles. Run AI review only if a usable AI config exists; otherwise report it as not run.

### D10 — documentation and worktree

- Docs per runbook §7: `frontend/.claude/CLAUDE.md`, root `.claude/CLAUDE.md`, `.context/history/archives/claudemd-changelog.md`, `.trellis/spec/guides/cross-stack-contracts.md`, and `.claude/index.json`. Keep README pair semantically aligned only if a listed README item changes; otherwise record unchanged.
- Expected post-change counts: 18 Vue components, 35 composables, 81 frontend test/support files (72 node `.test.js` + `testProperty.js` + 8 component files: 6 `.spec.js` + setup + warning gate). Root counts currently lag; update them to the verified inventory. Add new entries for `WordImportDialog.vue`, `useWordImport.js`, `useDesignerFormSelection.js`, and both new tests.
- Refinement R2: `.claude/index.json` currently omits existing `CodelistQuickEditDialog.vue` while listing 16 of the 17 real components. Add that existing path together with the new component so the index's component list is complete; do not treat this pre-existing omission as an additional new component.
- Record architecture choices and any resolved STOP items in `.context/current/branches/refactor/app-word-import-split/session.log` per `.context/prefs/workflow.md`.
- Worktree: `SLUG=app-word-import-split`, `BR=refactor/app-word-import-split`, `WT=/home/decade/CRF-Editor-app-word-import-split`.

## 3. Exact move / stay map

All App.vue source ranges below were checked at `6090a81`; names and boundaries match the current file.

| Current symbol/site | Current lines | Destination / action |
|---|---:|---|
| `showImportWordDialog` | 677 | Stay in App; becomes the `WordImportDialog` `v-model` source. |
| `importWordStep`, `importWordLoading`, `importedFormsPreview`, `selectedFormsToImport`, `tempDocxId`, `importWordErrorMessage`, `importWordAiTaskId`, `importWordAiReviewStatus`, `importWordAiReviewError` | 678–686 | Move to `useWordImport.js`, unchanged names. |
| `aiReviewPollTimer` | 687 | Move to a closure-local `let` inside the composable. |
| `showDocxCompare`, `compareFormData` | 689–690 | Move to `useWordImport.js`. |
| `importedResults`, `acceptedAiOverrides` | 692–693 | Move to `useWordImport.js`. |
| `getFormAiSuggestions`, `resetAcceptedAiOverrides` | 695–701 | Move to `useWordImport.js`. |
| `hasAnyAiSuggestions`, `allAiSuggestionsAccepted`, `allAiSuggestionsIndeterminate`, `compareFormAcceptedSuggestions` | 703–712 | Move to `useWordImport.js`. |
| `watch(showImportWordDialog, …)` | 714–721 | Move to `watch(visible, …)` in `useWordImport.js`; preserve close-only reset semantics. |
| `stopAiReviewPolling`, `resetImportWordAiReview`, `replaceImportedFormsPreview`, `mergeAiSuggestions` | 723–755 | Move to `useWordImport.js`. |
| `toggleAiSuggestionAcceptance`, `toggleAiSuggestionsForForm`, `toggleAiSuggestionsForAll`, `clearAllAiSuggestions` | 757–821 | Move to `useWordImport.js`. |
| `scheduleAiReviewPoll`, `pollAiReview`, `startAiReviewPolling` | 823–860 | Move to `useWordImport.js`; replace selected-project/open reads with `projectId`/`visible`. |
| `openImportWordDialog` | 862–875 | Stay in App as visibility setter only; move its reset body into the composable's open watcher. |
| `goBackToImportWordStep1`, `beforeDocxUpload`, `handleDocxUploadSuccess`, `handleDocxUploadError`, `toggleSelectAllImportWordForms`, `executeImportWord`, `openDocxCompare` | 877–977 | Move to `useWordImport.js`. |
| `openDesignerForImportedForm` | 979–992 | Stay in App; replace the fixed `tries` loop with D4 bridge. |
| App `onBeforeUnmount` | 177–180 | Keep auth listener removal; remove only `stopAiReviewPolling()`. |
| `resetSessionState` | 71–82 | Add `showImportWordDialog.value = false` next to `showSettings.value = false`; guard in the existing appSettingsShell reset assertion. |
| `DocxCompareDialog` async declaration | 54 | Move to `WordImportDialog.vue`; keep `defineAsyncComponent` there. |
| Wizard `<el-dialog>` + compare mount | 1355–1556 | Move to `WordImportDialog.vue` with the D2-only edits. |
| `导入Word` settings button | 1578–1584 | Stay in App, unchanged. |
| Wizard scoped styles | 1711–1778 | Move verbatim to `WordImportDialog.vue`. |
| shared settings / dialog styles | 1861–1871; 1902–1912 | Stay in App. |

### Identifier / owner changes

| Before | After |
|---|---|
| Wizard code reads `selectedProject.value.id` | `useWordImport` reads `projectId.value`; the dialog action/compare prop uses its `projectId` prop Ref. |
| Wizard open checks read `showImportWordDialog.value` | Composable checks `visible.value`; child dialog uses `modelValue`; App alone retains `showImportWordDialog`. |
| Template row directly calls `openDesignerForImportedForm(row.form_id)` | Child emits `open-designer(row.form_id)`; App receives it and requests selection through the bridge. |
| App cleanup calls `stopAiReviewPolling()` | Composable registers `onScopeDispose(stopAiReviewPolling)`. |
| Base-path test reads upload action from App.vue | It reads the unchanged `apiUrl()` action from WordImportDialog.vue. |

## 4. Wizard template / style contract

Move the wizard's 3-step markup and `DocxCompareDialog` mount as a single ownership boundary; do not alter Element Plus tree, v-if/v-for branches, labels, ordering, dimensions, or dialog mount conditions. The compare mount remains keyed by `compareFormData?.index`; it remains mounted while compare data exists even when its own `modelValue` is false. Preserve the exact screenshot `temp-id`, project id, all-form names/data, AI review props, accepted suggestions, and event payloads.

| Selector(s) | Current lines | Action |
|---|---:|---|
| `.form-select-header` | 1711–1717 | Move verbatim. |
| `.form-select-meta`, `.form-select-prompt` | 1719–1728 | Move verbatim. |
| `.docx-ai-global-actions`, `.docx-ai-global-label` | 1730–1740 | Move verbatim. |
| `:deep(.docx-form-checkbox.el-checkbox.is-bordered)`, `:deep(.docx-form-checkbox .el-checkbox__label)` | 1742–1754 | Move verbatim, including the Wizard comment. |
| `.docx-form-item`, `.docx-form-name`, `.docx-form-actions` | 1756–1778 | Move verbatim. |
| `.settings-transfer-actions`, `.settings-transfer-actions :deep(.el-button)` | 1861–1871 | Keep in App; styles still apply to the moved non-append-to-body dialog and require browser computed-style verification. |
| `:deep(.el-dialog)`, `:deep(.el-dialog__header)` | 1902–1912 | Keep in App; verify radius/header background/border on the moved dialog. |

## 5. Source-test re-point table

| File | Current test / anchor | New owner | Strength preserved |
|---|---|---|---|
| `frontend/tests/docxBimodalPreview.test.js` | `App wires accepted AI overrides…`, lines 57–73; current assertions bind all acceptance, reconciliation, payload, step-2 controls, compare props/events to App | `useWordImport.js` for state/watchers/handlers/payload; `WordImportDialog.vue` for step-2 controls and compare wiring | Keep every existing regex's semantic claim, split by the new owning file; add the negative App ownership and no-bare-fetch guards. |
| `frontend/tests/basePathDeployment.test.js` | `bypass fetch sites…`, lines 97–107; App `:action="apiUrl(...)"` assertion at 102 | `WordImportDialog.vue` | Same `apiUrl` action assertion, now against the owning component. App Word-export / blob / project-import assertions stay; recursive scan remains. |
| `frontend/tests/appSettingsShell.test.js` | Settings entry/layout test lines 69–83; existing logout/auth-expiry `resetSessionState` assertion around line 125 | No re-point; the entry stays App-owned. Extend the existing reset assertion | Preserve the entry/button/layout checks and add an assertion that `resetSessionState()` sets `showImportWordDialog.value = false`. The mount spec still proves the bound child opens. |

## 6. Declared risks and mitigations

| Risk | Mitigation |
|---|---|
| Session reset destroys child state | S1 closes `showImportWordDialog` in `resetSessionState()`; the existing appSettingsShell reset assertion guards it. |
| App-scoped styles no longer reach the moved dialog as expected | Keep shared CSS in App and compare computed styles in a real browser at the same viewport/theme. |
| Ref remains null while async designer chunk resolves | Pending-id watcher, clear-before-await, latest-pending-wins test, and fresh-page browser case where designer was never activated. |
| Late AI response or close/unmount leaves a timer/task active | `disposed` guard before request, after both resolve/reject, and before scheduling; close and in-flight-unmount tests with fake timers. |
| `temp_id` is accidentally normalized or confused with `ai_task_id` | Exact test token in execute body and compare prop; assert status URL uses `ai_task_id` separately. |
| Async compare child leaks screenshot work or emits Vue warnings in mount tests | Mock only that child with `vi.mock`, declare all props/emits, and assert prop/event wiring; real `el-dialog`/teleport and the warning gate stay active. |
| `apiUrl()` bypass is lost during component move | Re-point only the action assertion; retain recursive full-src bare-action/fetch guard. |
| Function/factory growth violates quality limits | Keep each function <50 lines, nesting ≤4, every new file <800 lines; report function sizes and `wc -l`. |
| Ambient worktree changes contaminate the task | At each gate reconcile status against the explicit file list; preserve pre-existing untracked task dirs and `backend/backend.log`. |

## 7. Resolved decisions (lead, 2026-10-11)

- **S1 — Session reset:** add `showImportWordDialog.value = false` next to `showSettings.value = false` in `resetSessionState()` (App.vue:71–82). The Wizard closes on session reset/logout; this is D8 behavior change #3. Extend the existing logout/auth-expiry `resetSessionState` source assertion in `frontend/tests/appSettingsShell.test.js` (around line 125).
- **S2 — In-flight AI poll:** approved per-invocation `let disposed = false`; register `onScopeDispose(() => { disposed = true; stopAiReviewPolling(); })`. `pollAiReview` bails before the request and after settlement, before writes/rescheduling on both success and error; `scheduleAiReviewPoll` also bails. Mount-test a pending GET → unmount → resolve `running` → advance ≥3 seconds → no additional GET and no Vue warning.
- **S3 — RED exception:** current runbook §5 step 4 permits import-resolution RED when the test subject is a new function/file. Apply it to both new composables and the new `WordImportDialog` mount spec. Re-pointed source assertions must fail by assertion, not file/module resolution.
- **S4 — Bypass inventory:** nine wrapped call sites are authoritative: LoginView (1); App (4: Word export fetch, `_blobDownload`, `/import/auto`, Wizard upload action); ProjectInfoTab (3: project-logo GET, project-profile PUT, org-preset logo GET); DocxScreenshotPanel `pageUrl()` (1). Update the three API Base Path doc sentences being touched to say nine and list these owners; after the move, App has three and WordImportDialog owns the upload action. Do not rewrite historical changelog entries or the separate `useApi.js` six-fetch-boundary statement.

## 8. Refinements / verified facts for lead review

- R1: visibility Ref stays in App as the explicit D3/modelValue exception; other Wizard state moves.
- R2: keep settings entry/order/layout assertions in App; extend the existing `resetSessionState` assertion for the new session-close behavior.
- R3: latest-request-wins applies to requests still queued before the designer ref becomes ready. Once the pending id is consumed, clear it before invoking the exposed method so later remounts do not replay it.
- R4: `.claude/index.json` omits existing `CodelistQuickEditDialog.vue`; add it together with the new component so the index matches the actual inventory.
- R5: a pending selection has no expiry (the old loop gave up after ~1 s). This is accepted without a cancel API: `selectFormById` returns on a null id and on an id absent from the current project's freshly loaded list (`FormDesignerTab.vue:3071–3075`), so a stale id applied after a project switch or re-login is a no-op.
- R6: `watch(visible, …, { immediate: true })` runs the close branch once at mount (initial `false`); that branch is idempotent on initial state, matching the old App watcher, which never ran at mount.
- R7: `designer-split` (concurrent) leaves `App.vue` and the three re-pointed tests out of scope; overlap is docs only (`.claude/index.json`, module/root `CLAUDE.md`, changelog). Whichever task merges second merges `main` first (runbook §2) and re-counts the inventory.
- Verified: Vue lockfile is 3.5.29; frontend coverage tooling is absent, so D9 coverage is not run without a dependency change.
