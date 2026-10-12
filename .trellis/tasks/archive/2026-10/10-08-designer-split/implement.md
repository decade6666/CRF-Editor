# Implement — designer-split

Runbook: `.trellis/tasks/10-08-review-remediation/implement.md` (parent; §0–§8 apply). Design (binding):
`design.md`. PRD: `prd.md`. Evidence: `research/*.md`. Nothing here authorizes commit / merge / push / installs;
each needs explicit user authorization (parent §0).

## Execution status

| Step | Status | Evidence |
|---|---|---|
| 0 | Complete | 2026-10-11: `task.py start` done; worktree `/home/decade/CRF-Editor-designer-split`, branch `refactor/designer-split`, base `6090a81` (main moved from planning base `c40cb09` via backend-only `backend-dedup`; `git diff c40cb09 6090a81 -- frontend .trellis/spec/frontend cross-stack-contracts.md` empty → design anchors valid); node_modules copied offline. User authorized per-step commits on the task branch (merge/push still separately). S0-suites baseline: node:test 944/944 pass (exit 0); vitest 5 files / 26 tests pass; lint 0 errors / **3546 warnings** (warning ceiling for later steps); backend 1210 passed / 0 failed / 0 xfailed, TOTAL 87%; Node v24.14.1 / npm 11.11.0; logs `/tmp/designer-split-baseline/*.log`. S0-qa: harness in `research/qa/` (`run_qa.sh <label>`, `qa_compare.mjs`), build passed; seed = 6 forms (portrait controls, forced landscape, auto mixed landscape, inline-only ×2, empty); 24 captures/run (1600×1800, DPR 1) + fingerprints, forced-pseudo probes, preview JSON; behaviour 5/5 pass; console 0 errors; **baseline vs baseline2 identical** (24/24 PNG byte-identical). **Parity at baseline = 0.924 (73/79 cells, form order OK), 6 pre-existing mismatches** unrelated to this refactor (dropdown horizontal vs vertical ×1; empty-choice codelist ×1 — documented in cross-stack §5; adaptive fill-line ceil vs floor in mixed-landscape inline group ×2; empty form table ×2). PRD out-of-scope forbids rendering-rule changes → acceptance for AC6 = parity report field-identical to the frozen baseline (no regression); mismatches go to the final report as follow-up candidates. Unified preview branch unreachable via UI (render groups emit only normal/inline) → covered by the Step 2 mount spec + equivalence proof only. |
| 1 | Complete (`6a34721`) | S1-impl (sonnet): new `DesignerAcrfAnnotation.vue` (138 lines), spec (8 cases), `designerPreviewSplit.test.js` (6 cases); FormDesignerTab 5985 → 5523; `acrfViewToggle.test.js` re-pointed. RED: spec missing-component, guards 5/6 assertion failures → GREEN. Implementer gates: node:test 950/950 (944 + 6), vitest 6 files / 34 (26 + 8), lint 0 / 3350 (≤ 3546), build pass, prettier clean on new files, only script-region hunk = import (`@@ -47,0 +48 @@`). Lead diff review: DOM/class order/style/emit/reset markup match the original (reset text `R` on its own line in both → identical); 11 CSS rules verbatim. Lead findings: (1) title-row count `=== 2` deleted prematurely; (2) form-annotation regex lost its title-row anchoring — both weakenings violate §5.3; (3) `RESET_ARIA_LABEL` naming; (4) spec lacks a parent-listener exactly-once assertion. S1-check confirmed the two test weakenings + the missing parent-listener exactly-once check; Haiku found no runtime defect (naming/comment nits only). S1-qa on the initial tree passed: 24/24 PNGs byte-identical, fingerprints/probes/geometry all 0 differences, preview JSON/behaviour/parity identical, console 0. S1-impl fixed all 5 findings, restored the original title-row count and anchoring, renamed `resetAriaLabel`, and verified the parent listener by mutation: removing the `pointerdown` emit declaration made the spy fire **2** times instead of 1; restoration returned 8/8. Lead inspected the actual fixes and independently reran `npm test` (950 + 34), lint (0 / 3350), new-file prettier, and diff-check — all passed. Narrow S1-check confirmed all 5 findings closed; current-tree S1-qa passed again (same 24/24 exact screenshots and zero data/style/behaviour differences). Committed as `6a34721` after explicit-path staging and the live pre-commit gate (gitleaks + diff checks passed); no `.trellis/` changes included; task worktree clean before Step 2. |
| 2 | Complete (`8956090`) | `s2-implement` (sonnet) completed the frozen Step 2 tree: FormDesignerTab 5523→4548; new DesignerWordPreview 577 lines, mount spec 11 cases; 9 final wiring guards. Implementer gates: node:test953, vitest7 files/45, lint0/2884, build/prettier/diff-check passed. Actual 25 scope substitutions per old block (24 column-resizer +1 fill), row-resizer remains two args. Parent script diff is restricted to imports, handler object and the two deleted pure helpers. RED history: missing-component spec, **guard ENOENT before registration (deviation from intended assertion RED)**; migrated source assertions16 failures→green. Lead actual-diff review identified proof/test-quality concerns: normalizer can erase meaningful HTML whitespace; duplicate test segment-builder; contradictory empty fixture; loose cross-instance regex guards; behavior tests check counts rather than exact field/target arguments. S2-check independently confirmed AST equivalence (`/tmp/s2-check/parse_compare2.mjs`: semantic diff NONE for A/B) and compiled-render equivalence (`codegen_compare7.mjs`: IDENTICAL A/B), CSS identical, parent script allow-list preserved. Haiku found no runtime defect. S2-qa passed: 24/24 screenshots byte-identical, fingerprint/probe/geometry zero differences, preview JSON/behaviour/parity identical, no console errors. Verified protection gaps were returned to the sole S2 writer: bound each parent-instance guard to its own tag; assert exact quick-edit/annotation targets and row/column callback arguments; test snap-guide branches; use real segment helper/canonical target/empty fixture; replace the unsafe proof normalization; add assertion-level mutation checks without rewriting the original ENOENT RED history. S2 writer fixed the protection gaps in the two test files only (spec446 lines/18 cases, wiring308 lines/10 cases): per-tag props; real segment helper; canonical targets/empty fixture; exact field/target/event/row-key/boundary callbacks; snap-guide branches. Mutation matrix caught wrong second-column field, dropped row pointerdown, deleted guides, wrong field annotation target, missing per-instance props/dataset/scope. Missing component now reaches assertion failures; original ENOENT RED history remains recorded. Proof scripts copied to `/tmp/designer-split-s2-fixes/parse_compare2.mjs` and `codegen_compare7.mjs`, with non-zero mismatch exit codes; literal-text and handler-argument mutations failed as intended. Lead read the actual fixes and independently ran `npm test` (**954 +52**), lint (**0/2884**), build, prettier, diff-check, both proofs (**AST NONE / compiled IDENTICAL** A/B), and SHA256 source checks (**OK**, product unchanged). The first hash-check attempt used frontend cwd for root-relative paths and failed to read files; rerun from the worktree root passed. Narrow S2-check confirmed every protection gap closed (focused 10 guards /18 mount cases green); committed `8956090` with explicit 10-file staging and the live pre-commit gate (no leaks, clean diff). Worktree clean before Step 3. |
| 3 | Complete (`ecbcd6d`) | Initial S3 docs complete for `8956090` (6 files, node954, JSON/path/diff/40k checks green). Peer App split moved main to `dfb2007`; user explicitly authorized main→task synchronization and backup/rework of the task's unstaged docs. S3 acknowledged stopped. Draft patch + tar saved at `/tmp/designer-split-docs-before-main-sync.dK0xVA/`; only the six task-owned edits restored. `git merge --no-commit dfb2007` succeeded with no conflicts; merge commit waits for integration checks. Current-main frontend baseline + merged-tree frontend/backend checks dispatched; merged-tree final designer QA already passed (24/24 byte-identical screenshots, 5/5 behaviour including codelist, data/styles/parity identical, console0; 8 baseline/final JPEGs retained). Integration checks passed: current main `dfb2007` node954/vitest50; merged tree node964/vitest76 (exact designer +10/+26), lint0/2884, backend1210/TOTAL87%, build and final browser QA passed. Lead reran `npm test` (964/76), confirmed no conflicts/unstaged edits, then recorded the authorized synchronization merge as `b434ff0` (pre-commit passed). S3 resumed on the clean merged tree with explicit instructions to preserve App entries and recompute all touched frontend counts. Lead inspected the six-file actual diff and corrected 24+1 scope counts, CSS9/12 counting, mode/data bindings, baseline anchors/behavior counts and stable scenario references through the sole Sonnet writer. Final archive status accurately records all completed reviews and three bounded verification limitations, not new product defects. After spec commit `cd0488d` made the referenced scenario available, lead reran node:test964/0fail on the final docs tree, checked index JSON/root35,292chars/39,897bytes/diff cleanliness, explicitly staged only the six project-doc files and committed `ecbcd6d` with the live pre-commit gate (gitleaks no leaks; no `.trellis/` files mixed in). Task worktree clean; main remains `dfb2007`. |
| 4 | Complete (`cd0488d`) | Loaded `trellis-update-spec`; `s4-spec` (sonnet) owns only component-guidelines.md and cross-stack-contracts.md, disjoint from S3's six documentation files. Source is frozen on `b434ff0`. Added actual props/emits/style/cache ownership and semantic/codegen verification contracts; preserved geometry, storage, strict 1.0 requirements, accepted gaps and peer App contract updates. Lead corrected `textContent`, production-failure and raw-DOM-byte wording through the sole Sonnet writer, inspected the final actual diff, and accepted the independent S5-check. Commit order refined to spec before docs so the new stable scenario reference resolves immediately; authorization and file scopes unchanged. Committed only the two `.trellis/spec/` files as `cd0488d` with explicit-path staging, clean staged diff and the live pre-commit gate (gitleaks no leaks; Ruff unavailable/not run, no Python files in this commit). No merge/push/archive. |
| 5 | Complete on task branch; finish actions not authorized | Final product source frozen at `b434ff0`; lead independently reran SHA256 checks (OK), AST semantic comparisons (NONE for both old blocks) and compiled-render comparisons (IDENTICAL for both), with clean branch/working-tree whitespace checks. Installed review skill is `review-code` (the runbook's `code-review` label is stale); invoked on the frozen product diff, with Sonnet bounded code review and a separate read-only Haiku frontend review. Final full-scope Sonnet check and Haiku review passed with no blockers; S5-suites actually reran all five gates (node964/vitest76, lint0/2884, build/new-file prettier, backend1210/87%, 9435 statements/1251 misses). Lead read the actual log summaries and independently checked all eight retained JPEGs and the final wrapper/scope bindings. Final Sonnet product review found no confirmed must-fix; three MINOR verification-boundary findings are explicitly triaged in `verification.md` without claiming every proof/test protects every site. Dev-only inline table/tr compilation warning was verified in the pre-split source, not suppressed or misreported as a build failure. Spec committed `cd0488d`; final six-doc commit `ecbcd6d` passed the live hooks. Lead completed `verification.md` with per-step RED/GREEN history, all final commands/counts, minor finding dispositions, exact-parity failure and not-run scope. Final branch `git diff --check` and clean worktree checks passed; original exact-parity AC6=1.0 is explicitly unmet, while frozen-report/no-regression acceptance passes. Steps 0–5 complete on the task branch. Task metadata stays in_progress/untracked until separately authorized main merge/archive/cleanup; main remains `dfb2007`. No task→main merge, push, archive or cleanup authorized/performed. |

Inventory errata (2026-10-12): initial research/planning references to “11 CSS rules” are a counting error, not a migration exception: the annotation stylesheet contains **9 rule blocks / 12 selectors** (three blocks each have two selectors), all preserved. The Step 1 annotation component was initially 138 lines and is **133 lines** in the verified commit. Each old preview block has **25 scope substitutions in total: 24 `getResizer` calls + 1 `normalFillChars` call**; `getRowResizer` remains a two-argument shared-row-cache callback. Treat these measured counts as authoritative wherever older checklist text differs.

The lead (Opus) records each row from the agents' reports and from its own reruns. Agents never edit this table,
`verification.md`, or the PRD.

## Roles and dispatch

The lead orchestrates, reviews every actual diff, triages findings, and commits after authorization. Child work runs
on Sonnet / Haiku. **One writer per step**: only the step's implement agent edits repo files. Checkers, reviewers and
QA agents never touch repo files, except that the trellis-check agent may apply fixes when the lead explicitly
delegates them.

| Agent | Type / model | Writes |
|---|---|---|
| S0-suites | `general-purpose` / haiku | nothing (report only) |
| S0-qa, S1-qa, S2-qa, S5-qa | `general-purpose` / sonnet | `research/qa/**` (task dir) and `/tmp/designer-split-qa/**` only |
| S1-impl, S2-impl, S3-docs, S4-spec | `trellis-implement` / sonnet | the step's file list (design §8) |
| S1-check, S2-check, S5-check | `trellis-check` / sonnet | report; fixes only if the lead delegates them |
| S1-review, S2-review, S5-review | `Agent` / haiku, read-only | report only (frontend diff review, parent §6) |

Every dispatch prompt starts with `Active task: .trellis/tasks/10-08-designer-split`. Hook-injected spec excerpts are
truncated for large files, so agents `Read` the sections they rely on with offset/limit: `component-guidelines.md`
(Scoped CSS 215–227; Word preview parity 588–707), `state-management.md` §4 (68–127) and the leave-guard scenario
(344–473), `cross-stack-contracts.md` §5/§6 (§6 ≈ 491–571), and `quality-guidelines.md` (mount tests).

Constants used below:

```bash
WT=/home/decade/CRF-Editor-designer-split
BR=refactor/designer-split
TASK=/home/decade/CRF-Editor/.trellis/tasks/10-08-designer-split
PY="env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY /home/decade/.venvs/crf-editor/bin/python"
```

The Bash cwd resets every call, so every command embeds `cd "$WT/…" &&` or uses `git -C`.

## Formatting rule (verified 2026-10-10)

`FormDesignerTab.vue` and all 6 test files this task edits are **not** prettier-clean on the base. Never run
`npm run format` or `prettier --write` on an existing file. That would reformat thousands of unrelated lines. Edit
existing files by hand, matching the local style. Only the **new** files (`DesignerAcrfAnnotation.vue`,
`DesignerWordPreview.vue`, the two new specs, `designerPreviewSplit.test.js`) get `npx prettier --write <file>` and
must pass `npx prettier --check <file>`. Lint gate: 0 errors, and the total warning count is not above the Step 0
baseline.

## Step 0 — Activate, worktree, baselines (no code changes)

Lead:

1. [ ] `python3 ./.trellis/scripts/task.py start .trellis/tasks/10-08-designer-split`
2. [ ] `git -C /home/decade/CRF-Editor worktree add "$WT" -b "$BR" main` and
   `python3 ./.trellis/scripts/task.py set-branch .trellis/tasks/10-08-designer-split "$BR"`. Record the base SHA
   (planning base `c40cb09`). If `main` moved, diff `c40cb09..main -- frontend/src/components/FormDesignerTab.vue`
   and re-verify the design line anchors before Step 1.
3. [ ] Offline deps: `cp -a /home/decade/CRF-Editor/frontend/node_modules "$WT/frontend/node_modules"`. Verified
   2026-10-10: it matches the lockfile; the only missing entries are 49 other-platform optional packages. Never
   `npm ci` / `npm install` without authorization.

Then dispatch S0-suites and S0-qa in parallel.

S0-suites (haiku). Report counts and log paths; do not fix anything:

- [ ] `cd "$WT/frontend" && node --test tests/*.test.js`
- [ ] `cd "$WT/frontend" && npm run test:component`
- [ ] `cd "$WT/frontend" && npm run lint`: record errors and the total warning count.
- [ ] `cd "$WT/backend" && $PY -m pytest -q --cov=src --cov=main --cov-report=term-missing:skip-covered`: record
  passed / failed / xfailed and TOTAL. This task changes no backend file; the run is the AC7 baseline.
- Logs: `/tmp/designer-split-baseline/*.log`. No `npm run build` (S0-qa owns the build).

S0-qa (sonnet). Builds the harness per design §6 and captures the baseline:

- [ ] `cd "$WT/frontend" && npm run build`: the baseline dist, which also serves as the baseline build gate.
- [ ] Check ports 8911 / 9311 are free (`ss -ltnp`). If not, pick the next free pair and report it.
- [ ] Launch chrome-headless-shell on 9311 with its own profile under `/tmp/designer-split-qa/chrome-profile`. Binary:
  `/home/decade/.cache/browsers/chrome-headless-shell/linux-153.0.8010.47/chrome-headless-shell-linux64/chrome-headless-shell`
  with `--remote-debugging-port=9311 --headless --no-sandbox --disable-gpu --user-data-dir=… about:blank`. When
  probing it from Node, unset the proxy variables (memory note `browser-e2e-recipe`).
- [ ] Write `research/qa/seed_qa_db.py`, `research/qa/run_backend.sh`, `research/qa/qa_driver.mjs`,
  `research/qa/qa_compare.mjs`, and a `research/qa/README.md` stating the exact commands. Secrets go only in a mode-600
  file under `/tmp/designer-split-qa/`. Never print them or write them into `research/`.
- [ ] Run label `baseline`: the captures of design §6.2, the behaviour checks of §6.3 (including check 5), and the
  parity check of §6.4. Then run `baseline` a **second time** under the label `baseline2` and compare
  `baseline` vs `baseline2`. They must be identical; this proves the harness is deterministic. If they are not,
  fix the harness (waits, fixed viewport, mouse parked at 0,0, fonts ready) until they are. Never accept flakiness.
- [ ] Report: harness commands; the form list covered (which branches: unified / normal / inline / log row / 标签 /
  landscape); the number of screenshots; parity results; behaviour-check outcomes; and the determinism result.

Lead: record Step 0 in the status table. Stop if any baseline suite fails for a non-environmental reason, or if
parity at baseline is not 1.0 (report to the user first).

## Step 1 — R3 `DesignerAcrfAnnotation.vue` (S1-impl)

Scope: design §2 and §5.2 / §5.3 (Step 1 rows). Files: new `frontend/src/components/DesignerAcrfAnnotation.vue`,
new `frontend/tests/component/DesignerAcrfAnnotation.spec.js`, new `frontend/tests/designerPreviewSplit.test.js`;
modified `FormDesignerTab.vue` and `tests/acrfViewToggle.test.js`. Nothing else.

1. [ ] Re-verify the 16 site lines and the 11 CSS rule lines against `$WT` HEAD (`research/acrf-annotation-layer.md`
   §1 / §3b).
2. [ ] **RED**: write `DesignerAcrfAnnotation.spec.js` per design §5.2. Run
   `cd "$WT/frontend" && npx vitest run tests/component/DesignerAcrfAnnotation.spec.js`; it must fail because the
   component file is missing. Write the Step 1 guards in `designerPreviewSplit.test.js`:
   - the parent imports `DesignerAcrfAnnotation`;
   - exactly 16 `<DesignerAcrfAnnotation` tags (`kind="form"` ×2, `kind="field"` ×10, `kind="inline-header"` ×4);
   - every tag has `@pointerdown="(event) => onAnnotationPointerDown(` and `@reset="resetAnnotationPosition(`;
   - no `class="wp-acrf-annotation-reset"` markup and no `.wp-acrf-annotation` CSS rule left in the parent;
   - the child holds all 11 rules.
   Run `node --test tests/designerPreviewSplit.test.js`; it must fail on assertions, not on syntax. Record both RED
   outputs.
3. [ ] **GREEN**: create the component per design §2.2. Replace the 16 sites with the call-site shape, keeping
   `seg.fields[0]` vs `ff` and each site's `ANNOTATION_KIND_*`. Move the 11 rules verbatim. Add the import (keep the
   component import block alphabetical with the existing imports at the top of the script).
4. [ ] Re-point `acrfViewToggle.test.js` (tests at ~194 / ~272 / ~340) per design §5.3. CSS asserts read
   `DesignerAcrfAnnotation.vue`. Markup asserts check the parent call sites (`kind="form"` count 2 in Step 1,
   `ANNOTATION_KIND_FORM/FIELD/INLINE_HEADER` bindings next to the right host classes) and the child template (reset
   button markup and aria-labels). The VisitsTab half is untouched. Follow the §5.3 policy: re-point or replace,
   never weaken.
5. [ ] Gates: the targeted spec and test files; then `node --test tests/*.test.js`, `npm run test:component`,
   `npm run lint` (0 errors, warnings ≤ baseline), `npm run build`, and `npx prettier --check` on the 3 new files.
   Counts must equal baseline plus the new tests, with no other change.
6. [ ] Script allow-list (design §4): `git -C "$WT" diff -U0 -- frontend/src/components/FormDesignerTab.vue`. The
   only script-region hunk is the new import line.
7. [ ] Report: changed files, RED → GREEN evidence, suite counts versus baseline, lint numbers, line counts of the
   touched files, and any deviation from design §2 (with the reason).

Lead: read the full diff. Then dispatch in parallel:

- S1-check (`trellis-check`, sonnet) on `git -C "$WT" diff main`. Focus: design §2 conformance, §4 allow-list, §5.3
  policy, cross-stack §6 untouched.
- S1-review (haiku, read-only) on the same diff: defects, edge cases, DOM/class-order or CSS-scope regressions.
- S1-qa (sonnet): `npm run build` in `$WT/frontend`, fresh run DB, run label `step1`, compare with `baseline` per
  design §6.5.

Triage findings and send fixes to S1-impl. Re-run the affected gates. When everything is green, run
`git -C "$WT" status --short` and reconcile it against the Step 1 file list. **Commit only with authorization**:

```bash
git -C "$WT" add frontend/src/components/DesignerAcrfAnnotation.vue frontend/src/components/FormDesignerTab.vue \
  frontend/tests/component/DesignerAcrfAnnotation.spec.js frontend/tests/designerPreviewSplit.test.js \
  frontend/tests/acrfViewToggle.test.js
git -C "$WT" commit -m "refactor(designer): 抽出 aCRF 注释标记组件"
```

Rollback point: `git -C "$WT" reset --hard <base>` is NOT allowed without authorization. Before the commit, use
`git -C "$WT" checkout -- <modified files>` and delete the new files. After the commit, use `git revert`.

## Step 2 — R1 `DesignerWordPreview.vue` (S2-impl)

Scope: design §3, §4, §5.2 / §5.3. Files: new `frontend/src/components/DesignerWordPreview.vue` and
`frontend/tests/component/DesignerWordPreview.spec.js`; modified `FormDesignerTab.vue`, `designerPreviewSplit.test.js`,
`acrfViewToggle.test.js`, `formDesignerPreviewModel.test.js`, `formFieldPresentation.test.js`,
`orderingStructure.test.js`, `quickEditBehavior.test.js`, `rowHeightResize.test.js`. Nothing else.

1. [ ] Re-verify the block boundaries (word-page roots A / B), the 5 declared differences, the identifier list and the
   style lines against the Step 1 HEAD (`research/preview-template-diff.md` §1–§5; lines shifted after Step 1).
2. [ ] **RED**: write `DesignerWordPreview.spec.js` per design §5.2. Every template branch renders at least once with
   annotations on, and there are `scope` cases for both `'main'` and `'designer'`. It must fail because the
   component is missing. Extend `designerPreviewSplit.test.js` with the Step 2 guards of design §5.2; they must fail
   on assertions. Record both RED outputs.
3. [ ] **GREEN** in sub-steps. Run the targeted spec and `node --test tests/designerPreviewSplit.test.js` after each:
   - a. Create `DesignerWordPreview.vue` from root A, applying exactly the 5 declared substitutions (`groupsView`,
     `noFields`, `landscapeMode`, and the original scope literals; count the sites on Step 1 HEAD rather than
     relying on planning counts). Declare the props per design §3.3. Move `cumRatio` and
     `getRowHeightStyle` into the child script. Import the template-only pure helpers listed in §3.3. Move the
     §3.4 CSS. Follow component-guidelines order: imports → props → computed/helpers.
   - b. Add `previewHandlers` to the parent script (after the last referenced definition, with a one-line comment
     that state and caches stay in the parent). Replace root A with the component.
   - c. Replace root B with the component (`scope="designer"` and the designer data props).
   - d. Remove parent imports that became unused (per design §3.3; confirm with grep that each has zero remaining
     parent uses). Delete the moved CSS from the parent. Delete `.unified-table-host` after
     `grep -rn unified-table-host "$WT/frontend/src"` shows only the rule itself.
   - e. Equivalence proof. Using the Step 1 commit's `FormDesignerTab.vue` (`git -C "$WT" show HEAD:…`), extract
     root A and root B. Token-normalize them and the child template: strip whitespace and trailing commas, join
     wrapped lines (method: `research/preview-template-diff.md` §2; write the script under
     `/tmp/designer-split-equiv/`). Diff A→child and B→child. The only differences allowed are the declared
     substitutions. Attach the two diff outputs to the report.
4. [ ] Re-point the 6 test files per design §5.3. For every assertion that went red, record in the report: file:line,
   old target, new target or replacement guarantee. `paneSplit.test.js` must pass without edits.
5. [ ] Gates as in Step 1 step 5: targeted, then full `node --test`, `npm run test:component`, lint, build, and
   prettier on the new files.
6. [ ] Script allow-list (design §4): the only script-region hunks are imports, `previewHandlers`, and the deletion of
   `cumRatio` / `getRowHeightStyle`.
7. [ ] Report as in Step 1, plus the line counts: `FormDesignerTab.vue` before/after, `DesignerWordPreview.vue`, and
   `DesignerAcrfAnnotation.vue`.

Lead: read the full diff (template moves are checked against the equivalence proof). Then dispatch S2-check,
S2-review and S2-qa (label `step2`, compared with `baseline`), as in Step 1. S2-qa must also run behaviour check 3
(column-width round-trip main ↔ fullscreen), because the resizer closures now cross a component boundary.

Triage, fix, re-gate, reconcile `git status`. **Commit only with authorization**:

```bash
git -C "$WT" add frontend/src/components/DesignerWordPreview.vue frontend/src/components/FormDesignerTab.vue \
  frontend/tests/component/DesignerWordPreview.spec.js frontend/tests/designerPreviewSplit.test.js \
  frontend/tests/acrfViewToggle.test.js frontend/tests/formDesignerPreviewModel.test.js \
  frontend/tests/formFieldPresentation.test.js frontend/tests/orderingStructure.test.js \
  frontend/tests/quickEditBehavior.test.js frontend/tests/rowHeightResize.test.js
git -C "$WT" commit -m "refactor(designer): 两套 Word 预览模板合并为 DesignerWordPreview"
```

## Step 3 — Docs sync (S3-docs)

Parent runbook §7. Edit only what describes the touched area; keep `README.md` and `README.en.md` semantically
identical if either changes.

- [ ] `frontend/.claude/CLAUDE.md`: add the component entries for `DesignerWordPreview.vue` and
  `DesignerAcrfAnnotation.vue`, the FormDesignerTab description, the test inventory (new specs / test file), and the
  test counts.
- [ ] Root `.claude/CLAUDE.md`:
  - the module navigation counts (components, frontend tests);
  - the aCRF cross-stack bullet (add the two new component files as markup owners);
  - one Change Log line;
  - the full narrative appended to `.context/history/archives/claudemd-changelog.md`.
  Keep the root file under 40k chars (`wc -c`).
- [ ] `.claude/index.json`: the component / test entries that describe the designer.
- [ ] README pair: change it only if it lists components, test counts or test entry points that changed; otherwise
  record "README unchanged: no listed item changed".
- [ ] Gates: `node --test tests/*.test.js` (some tests read docs), `git -C "$WT" diff --check`, and JSON validity of
  `index.json` (`python3 -m json.tool`).
- Commit (authorization): `docs(frontend): 同步设计器拆分文档`, with explicit paths.

## Step 4 — Spec sync (S4-spec; Trellis 3.3)

- [ ] `.trellis/spec/frontend/component-guidelines.md`:
  - line ~598, the Word-preview consumer list: `FormDesignerTab.vue` → `DesignerWordPreview.vue` (designer preview
    rendered twice) + `DesignerAcrfAnnotation.vue`;
  - a short scenario capturing this task's reusable conventions: an extracted child's descendant styles move to the
    child's scoped sheet; parent-owned caches are passed as function props; `v-bind` handler object; declared
    difference set; mount spec with full branch coverage as the split gate.
- [ ] `.trellis/spec/guides/cross-stack-contracts.md` §6 synchronization checklist (and §5 if it names the designer
  preview file): add the new component files.
- [ ] Gates: `git -C "$WT" diff --check` and the `node --test` files that read spec docs, if any.
- Commit (authorization; standalone `.trellis/` commit): `docs(spec): 记录设计器预览拆分约定`.

## Step 5 — Final full-scope gates (lead orchestrates)

Lead: if `main` moved since the base, run `git -C "$WT" merge main` (authorization covers the task branch only),
resolve conflicts, and re-run everything below. Then dispatch in parallel:

- S0-suites again (haiku) as **S5-suites**: the full frontend (`node --test`, `test:component`, lint) and the full
  backend suite with coverage. Compare with the Step 0 counts.
- S5-check (`trellis-check`, sonnet): the full branch diff `main...HEAD` plus the working tree. Last-iteration
  full-scope check: spec conformance, all design sections, docs consistency, no stray files.
- S5-review (haiku, read-only): the full frontend diff.
- S5-qa (sonnet): label `final`, compared with `baseline`, including behaviour check 5 (AC2). Copy the 8 JPEG
  evidence views to `research/qa/evidence/`. Stop the harness's own processes (recorded PIDs only).

Then the lead:

- [ ] Invoke the `code-review` skill on the branch diff. Resolve or explicitly reject each finding with a reason.
- [ ] `git -C "$WT" diff --check main...HEAD` is clean.
- [ ] Write `verification.md`: the per-step RED → GREEN evidence, suite counts versus baseline, QA comparisons,
  parity, behaviour checks, review findings and their resolution, and the not-run items with reasons. Frontend
  coverage tooling is not installed, so no frontend coverage figure is recorded. The backend is unchanged, so its
  coverage is recorded for the AC7 run only.
- [ ] Append the decisions to `$WT/.context/current/branches/refactor/designer-split/session.log` (git-ignored):
  Option A annotation boundary, function props over emits / provide-inject, the `div.word-page` root, the
  `.unified-table-host` deletion, and the R2 delivered-by-SRC verdict.
- [ ] Report to the user (parent §8). Stop.

## Finish (each item separately authorized)

```bash
git -C /home/decade/CRF-Editor status --short     # only untracked .trellis/tasks/ and backend/backend.log expected
git -C /home/decade/CRF-Editor merge --no-ff refactor/designer-split
git -C /home/decade/CRF-Editor push origin main
git -C /home/decade/CRF-Editor worktree remove /home/decade/CRF-Editor-designer-split
git -C /home/decade/CRF-Editor branch -d refactor/designer-split
python3 ./.trellis/scripts/task.py archive .trellis/tasks/10-08-designer-split   # standalone .trellis/ commit
```

If the archive auto-commit fails with a pathspec error (task dir never tracked), finish with
`git commit -m "chore(task): 归档设计器拆分任务" -- .trellis/tasks/archive/2026-10/10-08-designer-split`
(memory note `pre-commit-gate-live`). Strip whitespace-only lines from the task docs first.
