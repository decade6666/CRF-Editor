# Compression-Safe Handoff

## Current State

- User asked for Trellis tasks and a plan; implementation is deferred until their later execution session after compression/model switching.
- Worktree: `/home/decade/CRF-Editor/.claude/worktrees/acrf-word-annotations`.
- Branch: `worktree-acrf-word-annotations`; planning base was `main` at `20e8ee5`.
- Active task is parent `.trellis/tasks/10-13-acrf-readable-preview/`, status `planning`.
- Children: `.trellis/tasks/10-13-acrf-annotation-space/` (retained slug, now translucency, **not whitespace**) and `.trellis/tasks/10-13-word-preview-form-oid/`, both `planning`.
- Only task artifacts/metadata and the required ignored decision log were written. No business source, README/spec implementation update, tests, build output, commit, merge, push or cleanup was performed.

## Authoritative Decisions

1. **R1 confirmed by AskUserQuestion**: keep existing aCRF floating boxes, geometry, saved offsets and vertical drag/reset; only pale-red background becomes **75% transparent / 25% opaque**. Text and outline remain opaque; reset keeps its existing state opacity. Browser and exported aCRF Word must agree. Residual text/outline overlaps are accepted and can still be moved manually. Do not add annotation lanes/rows, expand pages, change body content/fonts/widths, introduce two-axis drag or migrate positions.
2. **R2 minimal scope** from the original preview request and project policy: actual `form.code` beside the name on designer canvas/fullscreen and visits **paper titles**, only in full edit mode, in both eCRF/aCRF. Null/blank codes are omitted. Word titles/TOC and surrounding toolbars are not expanded. This stated default can be changed by a new user request; do not claim they authorized an exported Word OID.
3. No automatic model-specific dispatch or hidden execution approval. Main owns implementation/tests/review; optional delegated work must have a bounded benefit and scope. Read latest global/project rules: another session changed some rules/context during planning.

## Read Order

1. Current global/project/module instructions and `.context/prefs/` relevant to the code target.
2. Parent manifests → `prd.md` → `design.md` → `implement.md`.
3. Actual coding child's manifests → PRD → design → implementation plan.
4. Parent `research/word-transparency.md` and `research/form-oid-scope.md` for exact supported alpha, code/domain distinction and remaining limitations. `research/acrf-practice.md` is source research, not an instruction to implement a regulatory PDF or whitespace layout.

The parent implementation file is the task board. Final planning checks passed: 3 task validations, 6 nonempty manifests, reciprocal task links, artifact paths/bounds, Markdown fences/whitespace and exact quoted source sections. Oversized-source injection warnings were resolved. Manifests use short source-backed research excerpts for the oversized cross-stack/component specs so injection does not truncate the needed rules. Original specs remain authoritative: read their cited ranges if changed and refresh the snapshots after relevant spec edits. These are documentation/context checks, not code-test or renderer acceptance results.

## Minimal Technical Shape

- R1: mirror `ACRF_ANNOTATION_BACKGROUND_OPACITY = 0.25` in shared JS/Python; emit a CSS background variable and consume it in `DesignerAcrfAnnotation.vue`; put `a:alpha val="25000"` only beneath the existing Word **shape fill** color. No text/line alpha or root-container opacity.
- R2: tiny shared `FormPreviewOid.vue`; sibling of raw `.wp-form-title`, separate full-mode prop passed to both designer instances; visits uses its authoritative form's code. Shared title-row wrapping preserves the domain-marker reserve and raw name identity. Existing 14 handlers and state/cache ownership stay unchanged.
- Production source has not been edited. Do not mistake the new component/test filenames mentioned in plans for existing implementation files.

## Before Executing

From the task worktree, recheck actual status and ownership. Do not continue from the original checkout or use a destructive reset to resolve an unexpected state.

```bash
git status --short
git branch --show-current
git worktree list
python3 ./.trellis/scripts/task.py current --source
python3 ./.trellis/scripts/task.py validate .trellis/tasks/10-13-acrf-readable-preview
python3 ./.trellis/scripts/task.py validate .trellis/tasks/10-13-acrf-annotation-space
python3 ./.trellis/scripts/task.py validate .trellis/tasks/10-13-word-preview-form-oid
```

After the user explicitly asks to execute, load phase 1.4 review/activation guidance and start **R1 child** first, not the parent. R2 is independent but recommended second. Follow the listed project pre-development workflow, then the leaf RED→GREEN→regression/rendering/diff-review gates.

## Verification / Permission Caveats

- Checked runtime only: project venv Python 3.10.21 and Node 24.14.1. No code tests or coverage measurements were run; fresh worktrees may need existing-lockfile `npm ci` before tests.
- Word fill transparency is supported by Microsoft documentation, not yet visually tested in Word/WPS/LibreOffice. Use synthetic local fixtures; a LibreOffice view is not Word evidence.
- Browser fixtures can validate actual component/CSS rendering without touching clinical data; they are not complete authenticated E2E. Do not invent live test credentials or inspect secret values. If authorized app/viewer access is blocked, report exactly what remains not run.
- Numeric SFC coverage provider is not in the checked-in dependencies. Do not auto-install optional peers or claim an unmeasured >=80% gate; ask if the gate requires additional authorized tooling.
- Existing parity fixture mismatches must be baselined rather than hidden; opaque-fill change is not a license to weaken table-text or geometry checks.
- Uncommitted planning artifacts are needed for continuation. Do not remove the worktree/branch, reset/clean, commit, merge or publish without the required user authorization. Trellis updates stay in separate commits from code if committing is later requested.
