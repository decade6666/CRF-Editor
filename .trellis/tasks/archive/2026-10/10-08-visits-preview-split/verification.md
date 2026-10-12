# Verification — visits-preview-split

Date: 2026-10-12. The split, the F1 fix, both review rounds, mutation evidence and the browser QA run are complete
on the task branch worktree (`/home/decade/CRF-Editor-visits-preview-split`, no commits yet — main is still
`0d111a1`). Merge / push / archive / journal / worktree cleanup have NOT been authorized or performed.

## 1. Scope and ownership

- Task: `.trellis/tasks/10-08-visits-preview-split` (child of `10-08-review-remediation`). Base: `main` @ `0d111a1`.
- Design (binding): `design.md` D1–D9 + amendments A1 (probe retained as integration spec) and A2 (annotation glue
  extracted to a composable after the dialog exceeded 800 lines). Runbook: parent `implement.md` §0–§8.
- Opus (lead) owned planning, dispatch, every actual-diff review, mutation verification and the QA judgment.
  Sonnet executed: V1-probe, V2a-impl (two rounds), V2b-impl, V2c-check, V2d-review (haiku), V2e-mutations,
  V3a-qa, V4-docs. Haiku ran the V0 baseline suites. One writer per file at all times; every step's diff reviewed
  by the lead before acceptance.
- Product change: `VisitFormPreviewDialog.vue` (new, 796 lines) + `useVisitPreviewAnnotation.js` (new, 122) +
  `VisitsTab.vue` (1545 → 552, now only the `showFormPreview` / `formPreviewFormId` / `openFormPreview` bridge and
  one unconditional `<VisitFormPreviewDialog>`). No backend, schema, dependency, `main.css`, `useApi.js`,
  `FormDesignerTab.vue` or `DesignerWordPreview.vue` change (design §6 scope; verified by `git status`).

## 2. RED → GREEN

- **F1 RED (V1-probe, `0d111a1`)**: `frontend/tests/component/visitsPreviewF1Probe.spec.js` mounted the real
  VisitsTab (flow workspace → 列表 switch → visit row → 预览) and failed **4/4** for the right reasons: design-notes
  aside absent; no `landscape` class for `paper_orientation='landscape'`; no form-domain annotation; field
  annotation top `-0.0748cm` (default position) instead of the persisted `1.9252cm`-derived value. Raw output:
  `research/f1-red-evidence-2026-10-12.txt` (231 lines, exit 1; also captured 5× `Failed to resolve component:
  Loading` — the D6 defect). The entry point exists only in `workspace="flow"` → 列表 (single) view — design §3.1
  was amended accordingly during step 1.
- **A1**: the probe was retained (rename + header rewrite only) as `frontend/tests/component/visitsPreviewIntegration.spec.js`
  — permanent RED→GREEN witness; it must stay green and must never be deleted.
- **GREEN after step 2 (A2)**: integration spec 4/4 (lead's independent rerun), dialog spec F1 matrix cases pass
  with concrete values (see §4).
- **F2 RED → GREEN (review-driven, round 2)**: see §3.

## 3. Review findings and resolutions

Two independent review passes were run (V2c-check: sonnet, read-only + `/tmp` mutation sandbox; V2d-review: haiku,
read-only diff review). Lead judgment on each finding:

| # | Finding | Verdict | Action |
|---|---|---|---|
| F2 | `useVisitPreviewAnnotation.js` captured `projectId` by value while `formId` was a ref. Old code read `props.projectId` per call (`0d111a1` VisitsTab:542,552); after the split, a project switch that keeps VisitsTab mounted (App.vue `selectedProject.value = p` in `onProjectUpdated` / copy paths, `resetLazyTabs('info')` re-activates visits) stamps targets with the OLD projectId, so the PATCH cache invalidation hits `/api/projects/{old id}/forms`. PATCH itself targets the correct form (URL uses `snapshot.formId`); impact is one missed invalidation (30 s TTL or refresh converges) — a real regression, fixed. | Confirmed (independently re-verified against both old and new sources) | Fixed: `projectId: toRef(props, 'projectId')` + `currentProjectId()` in the two target builders; RED witness + two lifecycle guards added (below). Declared in design §3.4 **amendment A3**. |
| G | Deleting the dialog's `onBeforeUnmount(() => { void disposeAnnotationDrag(); })` was invisible to all 99 vitest cases — real unmount drops a queued PATCH | Confirmed by V2c | New spec case C (unmount → queued PATCH still sent) |
| I | Deleting the dialog's `watch(() => props.projectId, …)` flush was invisible to all 99 cases | Confirmed by V2c (redundant insurance, but the impact-map §5-5 asked for the guard) | New spec case B (project switch flushes the queued PATCH before debounce) |
| b2 | Removing the `{ ...foundForm }` shallow clone alone (keeping `onPersisted` immutable) is invisible to every test | Confirmed; the aliasing gap | **Recorded, not fixed**: single-point aliasing has no user-visible symptom today (the dialog and the alias share one object and every write is a full logical merge of that same object), and b2 (clone removal) or b (single in-place write) are both individually unreachable by any current observable. The combination that produces real cross-session cache corruption (aliasing + in-place write) IS caught: lead-verified §4 (e). Fixed the F2/lifecycle items first; this stays a declared residual (design §3.4(e) promised only the combination). |
| Obs | `normalColumnCm(group, groupIndex)` / `getPreviewRowResizer(gv)` in the dialog carry an unused extra argument (behavior-equivalent to the old two-arg call, brittle coupling with `columnWidthPlanning.test.js` 16.1.5i) | Non-defect (both reviewers agreed) | Not changed (scope discipline; no style churn) |

Nothing else was found: URL byte-equality with the old implementation, `@closed` / `update:modelValue` timing,
template token-level equivalence (8 annotation sites, 11 row-resizer handles, `.word-page` / `wp-body` / `wp-notes`),
no dangling symbols in VisitsTab, warning gate intact, no `console.warn` silencing.

## 4. Mutation matrix (design §3.4, plus review-driven additions)

Runs were performed on `/tmp` copies by V2e-mutations, V2c-check and the lead; the real worktree was never
mutated. Restores were verified byte-for-byte after every run. Two wrinkles, recorded for honesty rather than
smoothed over: (1) the lead's early (e) runs disagreed with V2e's; the kill above was re-established only after
grepping the two mutation sites directly in the file being run. (2) The lead's `/tmp/vp-mut-lead` copy was later
re-synced with the F2-fixed sources, so its earlier README/mtime evidence belongs to the pre-F2 revision — the
suite semantics the mutations target are unchanged by F2.

| # | Mutation | Expected killer | Result |
|---|---|---|---|
| a | Remove `await flushAnnotationPositionSave()` from the open path | close→instant-reopen ordering case | Killed: `expected 2 to be 1` (spec:395) — reopen fetched before the queued PATCH |
| b | Resolve the form from matrix row data (`{id,name}`) instead of the full FormResponse | F1 matrix + integration | Killed: 11 cases (integration 4/4 + spec 7) |
| c | Drop one `DesignerAcrfAnnotation` call site (8→7) | `visitPreviewSplit` 8-site guard | Killed: `7 !== 8` |
| d | Remove the `Loading` import | warning-gate case 1, amplified to the whole spec file | Killed: 19/19 (Vue warning gate) |
| e | Aliasing + in-place write: `formPreviewForm.value = foundForm` (line 320) AND `Object.assign(form, updatedForm)` (glue line 48) | drag case's `fixture.annotation_positions === null` | **Killed** — lead-verified on a copy with both mutation sites grepped present (`/tmp/vp-mut-lead`): 1 failed with `expected { EDC_OID_A: { y: 15 } } toBe null`. (An earlier run of the same mutation had reported all-pass under an unverified setup; the kill was re-established with the mutation's presence directly confirmed in-file before the run.) |
| e′ | Two-point corruption short of full aliasing: `alias` (clone removed) + `optimistic in-place write` (glue `applyFormAnnotationPositions` rewrites `form.annotation_positions` directly), keeping `onPersisted` immutable | drag case immutability + save-failure re-resolve case | **Killed** — lead-verified: 2 failed (`expected { EDC_OID_A: { y: 15 } } toBe null`; failure path `expected '0.0452cm' to be '-0.0748cm'` — the hidden mutation poisons later cases via shared fixture objects). |
| e″ | Single-point variants: `Object.assign` alone; alias alone; clone removal alone; single optimistic in-place write alone | — | **Not killed — declared residual** (see §3 b2). Written up honestly; no assertion pretends to cover it. |
| f | Remove `onPersisted` merge (no-op) | annotation top after PATCH | Killed: 1 case (`0.0752cm` vs `0.2252cm`) — merge logic itself is covered |
| n | Glue writes `visitForms.value = []` (crosses into parent collections) | acrfViewToggle negative guard | Killed by `/visitForms|allForms|matrixData/` guard |
| k/l/m | Remove an annotation site / re-add annotation CSS to the dialog / re-add `viewMode` to VisitsTab | the three new guards | All killed |

## 5. Browser QA (task-local harness, `research/qa-visits/`)

- Harness: `run_qa.sh` (242 lines, dynamic ports 8911/9311 upward, own `setsid` process groups only, seed copy of
  `/tmp/designer-split-qa/seed.db` + one byte-identical `design_notes` UPDATE, `QA_ALLOW_FINAL=1` fail-fast gate),
  `qa_driver.mjs` (985 lines, CDP-driven, 7 scenarios, screenshot + DOM fingerprint + annotation probe + console /
  network capture), `qa_compare.mjs` (329 lines, byte compare + canvas pixel diff + scenario / behaviour / console
  comparison). Credentials reused from `/tmp/designer-split-qa/secrets.env`; none minted.
- **Baseline determinism**: `baseline` vs `baseline2` on `/tmp/visits-qa-baseline` (@0d111a1, built dist):
  **PASS** — 7/7 screenshots byte-identical, 0 differing pixels; behaviour / console / network identical.
- **Baseline behaviour**: 3/7 pass + 4 `knownRed` (the four F1 symptoms, recorded as failing, no assertion bent).
- **Final (task worktree build)**: **7/7 pass, 0 known-red**. Highlights: `landscape` class appears; notes aside
  renders the two seeded lines; form-domain `DM` annotation top `0.1752cm` (= y25) and `GOLD_TEXT_UNIT`
  `-0.4748cm` (= y-40); drag → PATCH `/api/forms/1` body
  `{"annotation_positions":{"_form":{"y":57},"GOLD_TEXT_UNIT":{"y":-40}}}` (25+32=57, px→0.01cm consistent; body
  shape identical to baseline), reopen shows `0.4952cm`.
- **baseline↔final differences (5 scenes, each mapped to D8)**: s1 byte-identical; s2/s5 = form-domain annotation
  added (+1, fields shift by one), reset button enabled, aria wording, field offsets applied (D8.1 + D8.3); s3/s4 =
  `landscape` class + notes aside + whole-page reflow bands (D8.1); s6 = persisted offset `-0.0748 → 0.4952cm` and
  annotation-box pixels (D8.1 + D8.3). No difference unmapped to D8.
- **console / network**: baseline and final both 0 messages / 0 errors / 0 warnings / 0 network failures.
- **D6 evidence caliber**: the `Loading` warning is NOT observable in either tree's production build — Vue strips
  dev-only warnings from `dist` (`grep` found no `Failed to resolve component` / `Vue warn` strings in either
  build), so the harness's console counts cannot show it. The equivalent source-level evidence is recorded instead:
  baseline `VisitsTab.vue` renders `<Loading />` with no `Loading` import; final `VisitFormPreviewDialog.vue:4`
  imports it, and the dialog spec's loading-branch case passes under the Vue-warning gate (mutation d kills it).
- **parity**: not run — the visits preview dialog produces no extractable preview JSON (the designer's
  `capturePreview` DOM path is unavailable there). Recorded as not-run; `--allow-mismatch` was not used, nothing
  was faked.
- Hygiene: harness processes stopped (ports re-checked), Chrome profile temp dirs cleaned, main checkout and the
  task worktree both zero-write (git status unchanged before/after every run).
- **QA revision note**: the final run predates the F2 fix. F2 only changes annotation-target `projectId` stamping
  in the in-place-project-switch window (plus flush-on-switch/unmount) — a path the harness never enters (its 7
  scenarios keep one project). All 7 scenarios are unaffected by the delta; the post-F2 tree was re-built and the
  full suites rerun (see §6). No QA rerun was performed, deliberately.

## 6. Suite numbers

| Tree | node:test | vitest | Lint | Build | Backend |
|---|---:|---:|---|---|---|
| Step-0 baseline @ `0d111a1` | 964 | 8 files / 76 tests | 0 errors / 2884 warnings | pass (4.26s) | 1210 passed / 0 failed |
| After V2a round 1 | 948 pass / 16 fail (the predicted re-point list) | 9 files / 80 tests (integration 4/4) | 0 / 2675 | pass (4.24s) | — |
| After V2a round 2 (A2) | 948 pass / 16 fail (same 16) | 9 / 80 | 0 / 2675 | pass (4.66s) | — |
| After V2b (re-points + new tests) | **973 / 973** (test count 964 → 973: +9 guards) | **10 files / 99 tests** | 0 / 2675 | pass | — |
| After F2 fix + lifecycle guards (final freeze candidate) | see row below | see row below | see row below | see row below | see row below |

Final freeze-candidate row (V2f + lead full rerun, 2026-10-12): node:test **973 / 973** (25 suites), vitest
**10 files / 102 tests** (99 + the three new lifecycle/F2 cases), lint **0 errors / 2675 warnings** (≤ baseline
2884, exactly the post-split count), build **pass (4.14s)**, backend `pytest -q` **1210 passed / 0 failed**.
Two-commit note: the F2 fix above is part of the step-2 content on the branch. The re-pointed files were verified
individually (16/16 MOVE blocks re-homed, one DELETE/REPLACE replaced by named substitutes: behavior case +
negative guard; no weakened captures — lead read each diff).

## 7. Limitations / not-run scope

- Single-point cache aliasing (mutations b2 / e′ variants) is not distinguishable by the current suite; declared
  residual, see §3.
- Frontend coverage percentage: not measured (no coverage provider installed) — consistent with the repo baseline.
- Word parity: not run, see §5.
- Browser QA covers the seeded fixture set (portrait, landscape, notes, annotation offsets, drag); it does not
  enumerate every form in the seeded library.
- The pre-existing vite compile warning (`<tr> cannot be child of <table>`) appears in both baseline and final
  builds; not a regression (present in the pre-split RED run too).
