# Verification — designer-split (Wave E)

Date: 2026-10-12. **Product extraction, final full-suite rerun, required reviews and both documentation commits are complete on the task branch (`ecbcd6d`), with no new regression found. Strict parity 1.0 remains unmet by the inherited baseline. Main merge/push/deploy/archive/cleanup have not been authorized or performed.**

## 1. Scope and ownership

- Task branch: `refactor/designer-split`; worktree: `/home/decade/CRF-Editor-designer-split`.
- Original implementation baseline: `6090a81`; latest main baseline: `dfb2007`.
- User approved the persisted design/implementation plan, activation, worktree and per-step task-branch commits for Steps 1–4. They separately approved main→task synchronization, not task→main merge or push.
- Opus owned planning, architecture choices, dispatch, actual-diff verification and authorized Git operations. Sonnet owned all product implementation, QA, documentation and specification edits. Haiku ran bounded suites and read-only frontend review.
- R1/R3/R5/R6 delivered: stateless shared preview and annotation components, parent-owned state/caches/save/undo/session, source-contract migration and mount/behavior coverage.
- R2 was already delivered by shared-rule-convergence. Existing shared-dialog contracts and final live codelist quick-add/selection evidence validate it; this task did not reimplement the dialog.
- R4 deliberately not performed. No save-flow merger, rendering-rule change, backend source change, dependency/build-script change, or global stylesheet edit.
- `FormDesignerTab.vue`: 5985 → 5523 → 4548 lines (−1437, approximately 24%). `DesignerWordPreview.vue`: 577 lines; `DesignerAcrfAnnotation.vue`: 133 lines.
- The parent renders the shared page twice: six explicit data/mode props plus one `v-bind="previewHandlers"` object containing 14 parent closures. The shared template has eight annotation sites.
- Old-template differences: landscape flag, no-fields condition, groups view, column-resizer scope and fill-character scope. Scope substitutions total 25 per old block: 24 column calls + one fill call. Row resizer keeps two arguments and the shared parent cache.
- Annotation CSS inventory: nine rule blocks / twelve selectors, all preserved. Earlier planning counts of eleven rules and the initial 138-line annotation component are superseded by the measured inventory errata in `design.md` / `implement.md`.

## 2. Commits and authorization boundaries

| Commit | Content |
|---|---|
| `6a34721` | Step 1: annotation marker extraction and regression tests |
| `8956090` | Step 2: shared Word-page extraction and strengthened tests |
| `b434ff0` | Separately authorized synchronization of main `dfb2007` into the task branch |
| `ecbcd6d` | Step 3: six project documentation files, standalone documentation commit after final review-status correction |
| `cd0488d` | Step 4: two `.trellis/spec/` files, standalone specification commit (before docs to keep scenario references resolvable) |

No task→main merge, push, deployment, task archival, journal commit, worktree removal or branch deletion has been performed. Those finish actions remain outside the granted authorization. Task artifacts remain untracked in the main checkout as required by the parent runbook.

## 3. RED → GREEN and review-driven test strengthening

### Step 1

- New annotation mount spec initially failed because the component/import did not exist; source guards failed at assertion level (five of six guards).
- Minimal extraction turned the suite green: original node baseline 944 → 950; vitest 26 → 34.
- Lead/Sonnet review found two weakened source guards (title-row count and form-title/style anchoring), a missing parent-listener exactly-once assertion, and naming/comment cleanup. The sole Sonnet writer corrected them.
- The parent-listener mutation removed the declared `pointerdown` emit: the listener fired twice instead of once and the test failed; restoration returned eight annotation tests to green.
- Current-tree live QA was repeated after those corrections before commit.

### Step 2

- New preview mount spec initially failed because the component/import did not exist. Migrated source tests produced sixteen expected assertion failures before extraction.
- **Historical deviation:** the first wiring-guard RED was ENOENT before test registration, not the planned assertion RED. The record is not rewritten. A later missing-component mutation verified that the final guard reaches assertion failures.
- Lead/Sonnet review found weak cross-instance regular expressions, count-only callback assertions, an empty-state fixture with groups, a copied segment builder, incorrect annotation target fixture, snap-guide/row-event gaps, and an unsafe whitespace normalizer.
- The Sonnet writer changed only the two new test files to use tag-bounded guards, real shared helpers, canonical targets, empty groups and exact field/target/native-event/row-key/boundary assertions. Product hashes stayed unchanged.
- Negative mutations caught missing per-instance props/dataset/scope, the wrong second-column field, removed row pointerdown, removed snap guides and incorrect annotation targets.
- Final new tests: ten wiring guards, eight annotation mount cases and eighteen preview mount cases. Six existing source-reading test files were migrated without weakening their protected behavior; `paneSplit.test.js` remained unchanged.

## 4. Suite counts and commands

| Tree | node:test | vitest | Lint | Backend / coverage |
|---|---:|---:|---|---|
| Original baseline `6090a81` | 944 | 5 files / 26 | 0 errors / 3546 warnings | 1210 passed / 87% |
| Step 1 final | 950 | 6 files / 34 | 0 / 3350 | Backend unchanged |
| Step 2 final | 954 | 7 files / 52 | 0 / 2884 | Backend unchanged |
| Current-main baseline `dfb2007` | 954 | 6 files / 50 | Not separately rerun | Backend unchanged |
| Synchronized task tree `b434ff0`, prior to final text edits | 964 | 8 files / 76 | 0 / 2884 | 1210 passed / 87%, 0 failed / 0 xfailed |
| Final S5 rerun | 964 | 8 files / 76 | 0 errors / 2884 warnings | 1210 passed / 87%, 9435 statements / 1251 missed, 0 failed / 0 xfailed |

Designer-specific delta relative to latest main: **+10 node tests / +26 vitest tests**. Identical Step 2 and latest-main node totals (954) refer to different trees, not a missing test.

Commands below were run on the synchronized tree and repeated successfully by S5-suites after the final specification/documentation corrections; all five commands exited 0. The lead independently inspected their log summaries (964 node / 76 vitest, 1210 backend / 87%, lint 0/2884, build and new-file formatting passed):

```bash
cd /home/decade/CRF-Editor-designer-split/frontend && npm test
cd /home/decade/CRF-Editor-designer-split/frontend && npm run lint
cd /home/decade/CRF-Editor-designer-split/frontend && npm run build
cd /home/decade/CRF-Editor-designer-split/frontend && ./node_modules/.bin/prettier --check \
  src/components/DesignerAcrfAnnotation.vue src/components/DesignerWordPreview.vue \
  tests/component/DesignerAcrfAnnotation.spec.js tests/component/DesignerWordPreview.spec.js \
  tests/designerPreviewSplit.test.js
cd /home/decade/CRF-Editor-designer-split/backend && \
  env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  /home/decade/.venvs/crf-editor/bin/python -m pytest -q \
  --cov=src --cov=main --cov-report=term-missing:skip-covered
```

Coverage is **87% for the unchanged backend**, unchanged from baseline. No numeric frontend coverage is claimed: the coverage plugin is not installed, and installing dependencies was not authorized. `.claude/index.json` scan-coverage metadata is file-discovery metadata, not test coverage.

Log limitation: vitest's Vite transform emitted an HTML-nesting warning for the inline header `<tr>` directly under `<table>` (`DesignerWordPreview.vue:423`). The lead verified the same markup in pre-split `6a34721` at parent lines 3546/4237; semantic/codegen proofs and live screenshots also preserve it. This inherited markup was not silently changed or the warning suppressed. The mount/unmount Vue-warning gate does not cover pre-mount compiler-plugin warnings. The production build passed without warnings; future SSR/hydration support should fix this structure in a separately authorized change.

## 5. Independent equivalence and browser evidence

Lead independently reran the following on the frozen synchronized product tree:

```bash
cd /home/decade/CRF-Editor-designer-split && \
  sha256sum -c /tmp/designer-split-s2-fixes/product-hashes-after.txt
node /tmp/designer-split-s2-fixes/parse_compare2.mjs
node /tmp/designer-split-s2-fixes/codegen_compare7.mjs
git -C /home/decade/CRF-Editor-designer-split diff --check main...HEAD
git -C /home/decade/CRF-Editor-designer-split diff --check
```

Results: product hashes OK; A/B semantic comparisons **NONE**; A/B compiled-render comparisons **IDENTICAL**; whitespace checks clean. Both proof scripts return nonzero on a mismatch; literal-text and handler-argument mutations were rejected. The earlier whitespace-stripping script is not used as the acceptance proof. Equivalence preserves semantic markup/text/attributes/callbacks; Vue scope IDs and component boundaries may legitimately differ.

Live-browser recipe and commands: `research/qa/README.md`. Runtime artifacts: `/tmp/designer-split-qa/`; retained representative evidence: eight JPEGs in `research/qa/evidence/`.

- Own backend/Chrome: ports 8911 / 9311; fixed viewport 1600×1800, DPR 1. Separate throwaway database and existing task-only secret file; no production config/database copying.
- Six golden-seed forms × main/fullscreen × eCRF/aCRF = **24 captures per label**.
- `baseline` vs `baseline2`: deterministic, 24/24 PNGs byte-identical.
- `baseline` vs corrected `step1`, `step2`, and synchronized `final`: **24/24 PNGs byte-identical**, zero DOM-fingerprint, style/pseudo-state probe or geometry differences; preview JSON identical; no console errors.
- Baseline/baseline2/final behavior: **5/5 passed** — annotation drag/PATCH/reload/reset, quick edit, column-width round-trip, row-height dragging, codelist quick-add immediately selectable. Step 1/2 ran the four common checks (4/4), as planned.
- Real UI covered normal/inline/log/label/control/landscape/empty cases. **Unified is not reachable through the real group builder**; its regular/full-row/inline-block branches are covered by real-helper mount fixtures plus semantic/codegen proof, not live DOM evidence.
- Harness processes exited; own ports were confirmed free. Other sessions' processes were not stopped.

## 6. Strict parity: original target remains unmet

Reproduction command with an explicit venv interpreter (the QA harness recorded the equivalent invocation with `python`; no `--allow-mismatch`):

```bash
cd /home/decade/CRF-Editor-designer-split/backend && \
  /home/decade/.venvs/crf-editor/bin/python scripts/compare_word_table_parity.py \
  /tmp/designer-split-qa/final/preview.json /tmp/designer-split-qa/final/export.docx
```

**Exit 1: 73/79 cells = 0.9240506329113924; form order matches; six mismatches.** This exact-parity command fails its 1.0 target. It is not described as passing.

The complete report is field-identical across baseline/baseline2/step1/step2/final. Thus the refactor adds no parity regression, but does not establish exact preview/export parity. Existing mismatches: dropdown direction (1), empty-choice fallback (1, already accepted in cross-stack §5), mixed-landscape adaptive fill-line rounding (2), and empty-form cells (2). The user was informed and asked to continue; rendering-rule fixes remain outside scope. The normative specification's strict 1.0 requirement and accepted-gaps table were not weakened. `qa_compare`'s parity-pass flag means **unchanged baseline report**, not exact parity.

## 7. Final reviews and documentation

- Installed skill `review-code` was invoked (the runbook's `code-review` name is stale). Final bounded Sonnet product review completed: no confirmed must-fix defects; parent script/state/cache/lifecycle ownership, pure children, event semantics, moved styles, private props and unchanged renderer trust boundaries verified. Three minor verification-strength limits are triaged below; no product code change was requested.
- Final whole-branch Sonnet `trellis-check`: conditional GO, no High/Medium blockers; ten guards and twenty-six new mount cases rerun, both proofs and baseline/final QA artifact comparison independently passed. Its pre-commit documentation-state finding was corrected by the sole documentation writer and the lead verified the exact final footer before commit.
- Final read-only Haiku frontend review: no confirmed defects; parent script boundaries, scope threading, native-event/reset semantics, CSS/DOM structure and preserved test protections verified.
- The known README backend inventory drift (63/61 written vs actual 76/74 files) predates this task. It remains a docs-sync follow-up, not an excuse to expand this frontend refactor.
- Commit ordering refinement: specification first, project documentation second. Both batches were already authorized; this low-risk reorder prevents the new stable scenario reference from briefly pointing at an uncommitted section. The batches remain separate, with no `.trellis/` content mixed into the project-documentation commit.
- Lead document/spec review corrected misleading `v-html`/`textContent` claims, unsupported production-failure assumptions, callback/cache ownership wording, 24+1 scope counts, unstable task links and raw-DOM-byte equivalence claims. Sonnet retained sole writer ownership.
- Six project docs: root/frontend `.claude/CLAUDE.md`, `.claude/index.json`, `README.md`, `README.en.md`, `.context/history/archives/claudemd-changelog.md`.
- Two specification docs: `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/guides/cross-stack-contracts.md`.
- Latest-main App/wizard/ready-bridge entries and API-prefix/cross-stack contracts are preserved. Inventory/path/JSON checks passed, including root context size **35,292 characters / 39,897 bytes**, below both interpretations of the 40k limit. Specification committed as `cd0488d`; project documentation committed as `ecbcd6d`. Final documentation wording was followed by a lead rerun of all node tests (**964 passed / 0 failed / 0 skipped**, `/tmp/designer-split-s5-suites/post-doc-node.log`), JSON/size/diff checks, explicit six-file staging and live hooks. The task worktree is clean; branch whitespace checks passed and main remains `dfb2007`. Pure final status-text changes did not require another backend/build/component run; those gates had already passed with unchanged product source.

### Final minor findings — resolution and bounded evidence

| Finding | Decision / reason |
|---|---|
| Mode-normalized equivalence proofs cannot detect a systematic scope swap in their inputs | Accepted limitation, not a product defect. The proofs intentionally normalize the declared mode differences to verify one shared subtree; they do not prove parent wiring. The lead independently read the actual main wrapper at `FormDesignerTab.vue:3194–3204` (`scope="main"`, main data) and fullscreen wrapper at `:3431–3440` (`scope="designer"`, designer data), corroborated by tag-bounded prop contracts and live resize round-trip evidence. A literal-only scope swap conflicts with those prop contracts; swapping complete instances between wrappers is not an explicitly automated wrapper-position guard. No stronger proof claim is made. |
| A single child resizer scope hardcoding is rejected by the mount spec but not the node wiring guard | No change: this is a valid division of responsibility. The mount test detects the demonstrated mutation; duplicating the same internal-child check in the parent-wiring source guard is unnecessary. Both suites are required gates. |
| Exact annotation event/target/reset interaction test samples the first unified field marker rather than every marker site | Accepted bounded coverage, not a product defect. Source guards protect all site bindings, semantic/codegen proof preserves their original arguments, the reviewer manually verified the remaining bindings, the shared marker's event semantics have eight unit cases, and live QA exercises form/normal-field drag/reset in both surfaces. Per-site interaction expansion is a possible follow-up; this task does not claim independent runtime interaction coverage of every site. |

The reviewer used only a `/tmp` sandbox for negative mutations and rechecked product hashes afterward; no repository source/test edits were introduced by final review. Earlier inaccurate aggregate CSS counts in review prose are not adopted: the measured annotation inventory remains **9 blocks / 12 selectors**. The inherited Vite HTML-nesting warning is a test-transform warning, not a production-build failure.

## 8. Not run / deliberately excluded

- Numeric frontend coverage: plugin unavailable; no unauthorized installation.
- Unified live-browser coverage: unreachable via the actual group builder; mount/proof alternative used.
- Word/WPS GUI visual comparison, mobile/dark-theme browser matrix and the peer App's new Word-import lifecycle E2E: not covered by this designer-only harness; no claim made.
- R4 editor-state/save-flow extraction, parity-gap fixes, legacy whole-file formatting and lint-warning cleanup: outside approved scope.
- Separate security-review: not a security-sensitive change; renderer trust boundaries and authentication/authorization remain unchanged and are included in ordinary product review.
- Main merge/push/deploy/archive/cleanup and dependency installs: not authorized, not performed.

Logs: `/tmp/designer-split-baseline/`, `/tmp/designer-split-s1-fixes/`, `/tmp/designer-split-s2-fixes/`, `/tmp/designer-split-main-sync/`, `/tmp/designer-split-s5-suites/`, `/tmp/designer-split-s5-check/`, `/tmp/designer-split-s5-review/`, plus browser comparisons under `/tmp/designer-split-qa/`. Temporary logs/proofs are session artifacts, not permanently archived assets. Live pre-commit gitleaks and whitespace gates passed for both final commits; the hook reported Ruff unavailable, so no Ruff check is claimed (no Python files were staged).
