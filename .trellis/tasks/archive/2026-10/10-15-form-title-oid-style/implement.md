# Execution Handoff — Form Title OID Red Badge

## Status and Entry Gate

This is a lightweight frontend task with an explicit handoff plan; a separate architecture `design.md` is unnecessary. Planning artifacts are prepared for user review, not implementation authorization.

- Task: `.trellis/tasks/10-15-form-title-oid-style`
- Retained worktree: `/home/decade/CRF-Editor/.claude/worktrees/form-title-oid-style`
- Branch: `worktree-form-title-oid-style`; inspected base: `54649e0`
- Do not implement on `main`, discard another session's changes, or recreate this task.
- After the user authorizes execution: enter this existing worktree, inspect current status, read the curated JSONL specs, `prd.md`, and this file; load `trellis-before-dev`, validate the task, then run `task.py start`. Do not use `start` during the planning handoff.
- Commit/push/merge/deploy and destructive cleanup still require their applicable authorization. Keep `.trellis/` housekeeping separate from project-code commits.

## Ordered Checklist

### 1. Reconcile and establish RED

- [ ] Confirm the task is still `planning`, the worktree/branch still exist, and no concurrent session has changed the scoped files. If the base has advanced, recheck the evidence anchors instead of resetting/rebasing away other work.
- [ ] Read current project/module rules, `.context/prefs/`, and relevant frontend component/quality specs. The source and `frontend/package.json` are authoritative if an older guide describes a different test harness.
- [ ] If dependencies are absent, run `npm ci` in this worktree's `frontend/` using the existing lockfile. Do not add packages or edit dependency/build scripts.
- [ ] Update component expectations to value-only text in all three existing suites below. Retain literal-text, trimming, null/blank, main/fullscreen, full/brief, eCRF/aCRF, and authoritative-code-vs-domain checks.
- [ ] Add red-box decoration and safe normal-flow/wrapping checks; prefer extending `acrfViewToggle.test.js` for source/CSS contracts rather than adding a new test framework or micro-file. Include no reset button/annotation interaction on the title badge.
- [ ] Run the targeted tests against unchanged application code and record the expected failures before implementation (RED). This is an intentional expectation change requested by the user, not weakening a correct regression.

### 2. Minimal GREEN implementation

- [ ] Change `FormPreviewOid.vue` to interpolate only `displayCode`; do not replace strings inside the supplied value or mutate `form.code`.
- [ ] Reuse existing visual metrics/background from the pure `buildAnnotationStyle` helper and the exported palette constants in `acrfAnnotationGeometry.js`. Consume only decoration variables in the title component's scoped CSS. Do not modify shared annotation constants or introduce another palette/helper/style layer.
- [ ] Match field annotation border/text red, border width, translucent background, padding, and `2px` radius. Retain the title badge's existing SimSun/10.5pt typography, `min-width: 0`, and `overflow-wrap: anywhere`; include border/padding in its width budget (`box-sizing: border-box`, constrained to the host width).
- [ ] Keep the badge intrinsic-sized and in the title flex flow. Do not reuse the `.wp-acrf-annotation` root class or `DesignerAcrfAnnotation` component: those bring absolute positioning, fixed geometry, ellipsis, pointer events, and reset controls. Shared visual tokens are sufficient.
- [ ] Leave host gates, `.wp-form-title` raw text, domain reserve, preview handlers, field rendering, drag/persistence, and export code untouched unless a reproduced badge-specific layout failure requires a minimal host-CSS adjustment.
- [ ] Rerun targeted tests and confirm GREEN, then inspect the actual diff for scope and regressions.

### 3. Documentation, regression, and rendered acceptance

- [ ] Update the current `FormPreviewOid` and test descriptions in `frontend/.claude/CLAUDE.md`. Make minimal corresponding preview-description updates in `README.md` and `README.en.md`; review `.claude/index.json` and update only affected descriptions/catalog entries if needed. Keep LLM-facing documentation English and audience text Chinese per project rules; do not rewrite history/archive text.
- [ ] Run frontend source and component tests, lint, and build using the existing commands below. No backend implementation or backend test-suite run is required for this decoration-only change; if backend/table rendering becomes necessary, stop and confirm the broader scope.
- [ ] Run the app from the task worktree and validate in a real browser using authorized data: main designer, fullscreen designer, visits preview; full-mode eCRF/aCRF; brief mode; blank code; distinct form code/domain; long name plus 80-character unbroken code; portrait/landscape; light/dark themes.
- [ ] Compare computed decoration values to an existing field OID box and inspect bounding rectangles/wrapping against the domain reserve. Capture representative screenshots. DOM-under-happy-dom/source assertions do not replace real-browser layout verification.
- [ ] Do not use production data, inspect existing credentials, restart the shared server, or sync this build into a running deployment without authorization. If a throwaway login is needed, obtain explicit tool-mediated consent before generating temporary credentials; otherwise report the login/environment blocker and exact alternative verification.
- [ ] Report measured coverage using an existing supported mechanism when available: target at least 80% with no decrease. Do not install a coverage provider/change scripts without approval; if measurement is unavailable, state that explicitly and do not claim a percentage.
- [ ] Perform final actual-diff review and report each command/result, intentional RED failure, remaining failure, not-run item, and browser/coverage limitation. Do not claim implementation acceptance while required checks remain blocked or failing.

## Expected File Scope

| Role | Paths |
| --- | --- |
| Primary implementation | `frontend/src/components/FormPreviewOid.vue` |
| Existing prefix and behavior tests | `frontend/tests/component/FormPreviewOid.spec.js`, `frontend/tests/component/DesignerWordPreview.spec.js`, `frontend/tests/component/VisitFormPreviewDialog.spec.js` |
| Decoration/layout contract coverage | `frontend/tests/acrfViewToggle.test.js` (preferred extension) |
| Read-only visual reference | `frontend/src/components/DesignerAcrfAnnotation.vue`, `frontend/src/composables/acrfAnnotationGeometry.js` |
| Read-only host/layout references | `frontend/src/components/DesignerWordPreview.vue`, `frontend/src/components/VisitFormPreviewDialog.vue`, `frontend/src/components/FormDesignerTab.vue` |
| Minimal documentation synchronization | `README.md`, `README.en.md`, `frontend/.claude/CLAUDE.md`, applicable `.claude/index.json` entries |
| Task bookkeeping only | This task directory and the branch decision log; keep separate from project-code commits |

No API/prop signature change, database migration, dependency, shared rendering refactor, or release-process change is planned.

## Verification Commands for the Execution Session

Run from this worktree root. These commands are a future execution checklist; they have **not** been run in the planning session.

```bash
# Planning/context gate; does not activate the task
python3 ./.trellis/scripts/task.py validate .trellis/tasks/10-15-form-title-oid-style

# Only after explicit execution authorization and artifact review
python3 ./.trellis/scripts/task.py start .trellis/tasks/10-15-form-title-oid-style

# RED first, then GREEN: real component mount regressions
cd frontend && npm run test:component -- tests/component/FormPreviewOid.spec.js tests/component/DesignerWordPreview.spec.js tests/component/VisitFormPreviewDialog.spec.js tests/component/DesignerAcrfAnnotation.spec.js

# Source-level contracts; run from the worktree root in a fresh shell
cd frontend && node --test tests/acrfViewToggle.test.js tests/acrfAnnotationGeometry.test.js tests/acrfAnnotationPersistence.test.js tests/wordPageGeometry.test.js tests/designerPreviewSplit.test.js tests/visitPreviewSplit.test.js

# Final frontend regressions / lint / build, each from the worktree root
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build

git diff --check
git diff --stat
git diff -- frontend/src frontend/tests README.md README.en.md frontend/.claude/CLAUDE.md .claude/index.json
```

Use a fresh shell or the full worktree path for commands that start with `cd frontend`; do not accidentally nest `frontend/frontend`. Browser launch details should follow the current `run` skill and verified local setup, not hardcoded live-server assumptions.

## Risks and Rollback Boundary

- Adding border/padding can expose long-code overflow: validate the entire box, not text alone.
- Reusing the full annotation class/component would move the title OID or introduce behavior; reuse decoration only.
- Old prefix expectations occur in three suites, so update all together without removing visibility/safety assertions.
- Dark app themes still show white paper; do not use theme-swapped text colors or whole-element opacity.
- Rollback only this task's component/test/doc changes using a user-approved recoverable method; never reset/clean other work or remove the retained planning artifacts without confirmation.
