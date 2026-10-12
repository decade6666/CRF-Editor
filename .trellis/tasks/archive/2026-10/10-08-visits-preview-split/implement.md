# Implement — visits-preview-split

Runbook: `.trellis/tasks/10-08-review-remediation/implement.md` (parent; §0–§8 apply). Design (binding):
`design.md`. PRD: `prd.md`. Evidence: `research/planning-notes-2026-10-11.md`,
`research/test-impact-map.md`. Nothing here authorizes commit / merge / push / installs; each needs explicit user
authorization (parent §0).

Base: `main` @ `0d111a1`. Baseline suites for this task: re-measure all of them in step 0 on the new worktree —
as reference, the designer-split archive recorded the merged tree at node:test **964**, vitest **8 files / 76
tests**, lint 0 errors with a recorded warning count, build OK, backend 1210 passed; those numbers are stale
(recorded before `app-word-import-split`'s counts were folded in) and must not be copied into this table as if
measured here.

## Execution status

| Step | Status | Evidence |
|---|---|---|
| 0 | Complete | 2026-10-12: `task.py start` + `set-branch refactor/visits-preview-split` done; worktree `/home/decade/CRF-Editor-visits-preview-split` at base `0d111a1`; `node_modules` copied offline (`cp -a`, no installs). V0-suites (haiku): node:test **964/964**, vitest **8 files / 76 tests**, lint **0 errors / 2884 warnings** (ceiling for later steps), build pass **4.26s**, backend `pytest -q` **1210 passed / 0 failed** (893 dependency warnings). Anchors re-verified in the worktree: `VisitsTab.vue` 1545 lines; `showFormPreview` 116, `formPreviewTitle` 118, `formPreviewFormId` 122, `formPreviewForm` 123; dialog 989–1451; `<style scoped>` 1454–1545 — all match the map. |
| 1 | Complete | 2026-10-12: V1-probe (sonnet) wrote `frontend/tests/component/visitsPreviewF1Probe.spec.js` and ran it on `0d111a1`: **4 failed / 4**, all four F1 symptoms, exit 1; raw output at `research/f1-red-evidence-2026-10-12.txt` (231 lines). Findings: the 预览 entry point only exists in `workspace='flow'` → 列表(single) view (design §3.1 amended); `sortablejs` mock must be `{ default: { create: () => ({ destroy() {} }) } }`; the same run captured the D6 warnings ("Failed to resolve component: Loading" ×5). Lead reviewed the file, confirmed the failure kinds, and per amendment **A1** retained + renamed it to `frontend/tests/component/visitsPreviewIntegration.spec.js` (header rewritten as the permanent F1 acceptance guard; assertions unchanged; prettier-clean via the pinned `node_modules/.bin/prettier`; re-run still 4 failed / 4 on the unmodified tree). |
| 2 | Complete | **V2a-impl (sonnet, files: `VisitFormPreviewDialog.vue` + `VisitsTab.vue` only)** — landed in two rounds. Round 1: dialog + rewritten VisitsTab (dialog 854 / VisitsTab 552). Lead review: integration spec **4/4 green** (independent rerun), vitest 9 files / 80 tests green, node:test **16 failed / 948 passed / 964** — the exact 16 predicted re-point targets, no unexpected failures; the pre-existing `<tr> cannot be child of <table>` vite compile warning (present in the pre-split RED run too) confirmed not a regression. **Blocker found: 854 > 800-line limit → design amendment A2** (recorded in design.md §1/§0/§6 + branch session.log): annotation target/style/drag glue extracted to new `frontend/src/composables/useVisitPreviewAnnotation.js`; the two annotation TEXT helpers stay top-level in the dialog for `compileFunction`. Round 2 (A2): dialog **796 lines**, composable **122**, VisitsTab **552**; lead independently re-ran: vitest **9/80 green** (integration 4/4), node:test **16 fail / 948 pass / 964** (same 16), lint **0 errors / 2675 warnings** (≤ 2884), build **4.66s**. `git status`: only the three intended files + the integration spec. **V2b-impl** (test re-points + `visitPreviewSplit.test.js` + `VisitFormPreviewDialog.spec.js`) — complete: all 16 failures re-homed (16/16 MOVE blocks, 1 DELETE/REPLACE with named substitutes), node:test **973/973**, vitest **10 files / 99 tests**, lint 0 / 2675, build pass; lead read every re-point diff (no weakened captures). |
| 3 | QA + reviews + F2 round complete; final suite rerun pending | **V3a-qa**: harness `research/qa-visits/` (run_qa.sh 242 / qa_driver.mjs 985 / qa_compare.mjs 329); baseline×2 deterministic (7/7 screenshots byte-identical), baseline behaviour 3/7 + 4 known-red, **final 7/7 pass / 0 known-red**, 5 scene diffs all mapped to D8, console+network 0/0/0/0 both trees; parity not-run (no extractable preview JSON — recorded); D6 Loading warning not observable in production builds (dev-only warnings stripped) — source-level equivalent recorded. **Reviews**: V2c-check (sonnet, /tmp mutation sandbox) + V2d-review (haiku, read-only) — no runtime defects; findings triaged by lead: F2 projectId value-capture regression (FIXED, round 2), lifecycle guards g/i (FIXED, new cases B/C), cache-aliasing single-point gap (recorded residual, verification.md §3). **Mutations** (a)–(e): all killed as specified; (e) lead-verified on a confirmed-applied copy. |
| 4 | Done (pending commit) | V4-docs (sonnet): 6 doc files (`frontend/.claude/CLAUDE.md` 20→21/35→36/84→87 + new entries + D7 `main.js` icons correction; root `.claude/CLAUDE.md` counters + aCRF contract §6 ownership; `.claude/index.json` 5 paths; changelog narrative; README pair test-count lines). Lead diff-review: counts consistent, diff --check clean. **V4b-docs-fix** after the F2 round: spec case count 19→22, composable 122→126 lines, vitest 99→102 in both CLAUDE.md files + the changelog entry, plus the `toRef(props, …)` rule clause. Lead verified no stale count remains (grep over all 5 doc files). |
| 5 | Done (pending commit) | V5-spec (sonnet): `component-guidelines.md` +140 (new scenario `Dialog Extraction from a Tab into a Presentational Child`, 7-part template, F2 rule included); `cross-stack-contracts.md` ±14 (§5 files/checklist/test-list, §6 annotation owner swap incl. glue + CSS single owner, §7 orientation rows, Quick Reference). Lead reviewed the full diff; referenced files all exist; no invented APIs. |
| 6 | Complete | V2f-fix (sonnet): F2 fixed (`projectId: toRef(props, 'projectId')` + `currentProjectId()` in both target builders) + 3 new spec cases (22 total) + guard assertions; RED witness `expected "invalidateCache" to be called with '/api/projects/99/forms'` → GREEN; mutation-verified (deleting each guarded code path fails its case). Lead full rerun on the freeze candidate: node:test **973/973**, vitest **10 files / 102 tests**, lint **0 errors / 2675 warnings**, build **4.14s**, backend `pytest -q` **1210 passed**. `verification.md` written (incl. the mutation matrix, the two recorded residuals, and the honest notes on the QA/mutation wrinkles). |

The lead (Opus) orchestrates, reviews every actual diff, triages findings, and commits after authorization. Child
work runs on Sonnet / Haiku. One writer per step.

| Agent | Type / model | Writes |
|---|---|---|
| V0-suites | `general-purpose` / haiku | nothing (report only) |
| V1-probe | `trellis-implement` / sonnet | the temporary probe spec only |
| V2-impl | `trellis-implement` / sonnet | the step file list (design §6) |
| V2-check | `trellis-check` / sonnet | report; fixes only if the lead delegates them |
| V2-review | `Agent` / haiku, read-only | report only (frontend diff review, parent §6) |
| V2-qa | `general-purpose` / sonnet | `research/qa-visits/**` + `/tmp/visits-preview-qa/**` only |
| V4-docs / V5-spec | `trellis-implement` / sonnet | the docs/spec files of design §5 |

## Constants

```bash
WT=/home/decade/CRF-Editor-visits-preview-split
BR=refactor/visits-preview-split
TASK=/home/decade/CRF-Editor/.trellis/tasks/10-08-visits-preview-split
PY="env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY /home/decade/.venvs/crf-editor/bin/python"
```

The Bash cwd resets every call; embed `cd "$WT/…" &&` or use `git -C` in every command.

- Start (needs authorization, no installs): `python3 ./.trellis/scripts/task.py start .trellis/tasks/10-08-visits-preview-split` then `set-branch … refactor/visits-preview-split`, from the main checkout.
- Worktree: `git -C /home/decade/CRF-Editor worktree add "$WT" -b "$BR" main`. Fresh worktrees need `npm ci`
  before node:test files that import Vue or before any build/QA (memory `browser-e2e-recipe`).
- Pre-commit gate is live in every worktree (`gitleaks` + whitespace; memory `pre-commit-gate-live`); fix
  findings, never `--no-verify`.
- Formatting rule (designer-split §formatting, still in force): existing files here are not prettier-clean —
  **never** run `npm run format` / `prettier --write` on `VisitsTab.vue` or any existing test file; hand-edit in
  local style. Only the new files get `npx prettier --write` and must pass `--check`.
- A dev server may be running from the main checkout; never stop it. QA uses its own ports (the archived harness
  scans 8911/9311 upward and only signals its own process groups).
- Do not commit `.trellis/` files with project code; task docs stay untracked in the main checkout until archive.

## Step 0 — start, worktree, baselines

1. `task.py start` + `set-branch` (from the main checkout); create the worktree; `npm ci` in `$WT/frontend`.
2. V0-suites records into this table: node:test / vitest / lint (0 errors + warning count) / build on `$WT` at
   base, plus `node_modules` readiness; and one backend `pytest -q` sanity run.
3. Confirm the four anchors from `design.md` §0 still match `$WT` (line numbers are from `0d111a1`; if main moved
   before the worktree is created, re-verify with `grep -n` and update the map — do not trust stale lines).

## Step 1 — F1 RED evidence (DONE 2026-10-12)

- The probe ran RED on `0d111a1` (4/4 F1 failures; evidence in `research/f1-red-evidence-2026-10-12.txt`) and per
  amendment A1 (design §3.1) was retained as `frontend/tests/component/visitsPreviewIntegration.spec.js` — it is
  the RED→GREEN witness for the F1 fix and must stay green after step 2 and must never be deleted.
- Step 2 must make these four cases pass without weakening them (authoritative-form resolution, D2).

## Step 2 — the split + fixes (single writer)

V2-impl (sonnet) implements `design.md` D1–D7 exactly, in this order:

1. Create `frontend/src/components/VisitFormPreviewDialog.vue` per D1/§1: three props, one emit, `@closed` reset,
   the moved script blocks verbatim (D3), D2's authoritative resolution + error matrix, D4's
   `DesignerAcrfAnnotation` sites, D6's `Loading` import, the moved template + `.wp-form-title-row` CSS.
2. Rewrite `VisitsTab.vue`: keep `showFormPreview` + `formPreviewFormId` + `openFormPreview(row)` (set id, open);
   mount the dialog at the old position with `v-model` + `:project-id` + `:form-id`; delete every item in the
   map's DELETE list (design D5), including `mergeFormIntoState` / `getFormStateById` /
   `applyFormAnnotationPositions` / the `load()` preview block / the watcher cleanup / `onBeforeUnmount`; trim
   now-unused imports (map §2 MOVE list). Nothing else in the component changes.
3. Move the 17 MOVE blocks + replace the 1 DELETE/REPLACE block per `design.md` §3.3 (exact files/lines in
   `research/test-impact-map.md` §1). Replace — never weaken — each assertion; MOVE targets read the dialog source
   via `readFileSync` like the rest of the suite.
4. Add the two new test files per design §3.2 (`VisitFormPreviewDialog.spec.js`,
   `visitPreviewSplit.test.js`).
5. Gates inside the worktree: `node --test tests/*.test.js`, `npx vitest run`, `npm run lint` (0 errors, warning
   count ≤ step-0 number), `npm run build`, `npx prettier --check` on the three new files.
6. Report back: files touched, per-file line counts (`wc -l`), suite numbers, every re-pointed assertion with its
   replacement, and any deviation from design.md (stop before deviating on D1–D8; ask the lead).

V2-check (trellis-check, sonnet) then audits against this file + design: ownership boundaries (negative guards),
F1 behavior, lifecycle table, re-point completeness vs the map (no deleted-without-replacement, no weakened
captures), and the new specs' assertions. V2-review (haiku, read-only) reviews the diff for runtime defects and
wiring slips. The lead reads the actual diff before accepting anything.

## Step 3 — QA + mutation checks + final suites

- V2-qa builds `research/qa-visits/` (thin wrapper over the archived designer-split harness, retargeted to `$WT`
  and `/tmp/visits-preview-qa/`; reuse `/tmp/designer-split-qa/secrets.env` + `seed.db` when present — if they are
  missing, stop and ask the user rather than minting credentials, memory `throwaway-credential-policy-block`).
  Seed adds: a visit with the seeded forms; `design_notes` on one form; `paper_orientation='landscape'` on one;
  preset `annotation_positions` for one field. Runs **baseline** (main build in a scratch checkout or the main
  checkout's dist — never modify the main checkout) and **final**, same seed, capturing visit page → preview
  (eCRF + aCRF), switch toggle, annotation drag + reopen, landscape form, notes form, console log, network log.
  Acceptance: every baseline/final difference maps to a declared D8 change; else stop.
- Mutation checks per `design.md` §3.4 (a)–(e), each recorded with the observed failure and the restore.
- Final suites on the freeze candidate: node:test / vitest / lint / build / backend `pytest -q`; record exact
  numbers in this table. Then the lead may authorize the step-2 commit (single commit; the probe was deleted in
  step 1).
- Optional: `backend/scripts/compare_word_table_parity.py` on the visit-preview preview JSON + exported docx if
  the QA harness captures both; if it does not, record "not run (frontend-only diff; parity owner unchanged)" —
  do NOT fake it or use `--allow-mismatch`.

## Step 4 — docs sync

V4-docs (sonnet) updates: `frontend/.claude/CLAUDE.md` (components 20→21, composables unchanged, tests 84→86,
VisitsTab description, new `VisitFormPreviewDialog.vue` entry, the D7 `main.js` icons correction) — and the root
`.claude/CLAUDE.md` only where counts/entries change (mermaid 20→21, tests 84→86, Change Log one line), plus
`.claude/index.json` (new component + two test paths) and
`.context/history/archives/claudemd-changelog.md` (full narrative); README pair only if user-visible behavior text
changed (F1 is user-visible: check). Commit only after the lead's diff review.

## Step 5 — spec sync

V5-spec (sonnet) adds a `component-guidelines.md` scenario for this split shape (presentational dialog + parent
bridge; the designer-split "rendered twice" scenario does not apply) and updates
`cross-stack-contracts.md` §5/§6 owner lists (`VisitsTab.vue` → `VisitFormPreviewDialog.vue` for preview
markup). Standalone `.trellis/` commit; never mixed with project code.

## Finish (each separately authorized)

1. `git -C "$WT" merge main` if main moved; re-run §3/§4 checks after any conflict resolution.
2. `git -C /home/decade/CRF-Editor status --short` — no unexpected modified files; untracked `.trellis/tasks/`
   + `backend/backend.log` expected.
3. `git -C /home/decade/CRF-Editor merge --no-ff "$BR"` → `push origin main` → `worktree remove "$WT"` →
   `branch -d "$BR"`.
4. Archive: `python3 ./.trellis/scripts/task.py archive .trellis/tasks/10-08-visits-preview-split` as its own
   `.trellis/` commit, then the journal entry (`add_session.py`) as the next one. Note for the archive commit:
   the parent runbook's archive step once hit a pre-commit whitespace error ("new blank line at EOF") — fix the
   whitespace, don't skip the hook.
