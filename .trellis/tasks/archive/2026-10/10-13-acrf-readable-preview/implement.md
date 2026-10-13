# Integration Task Board and Execution Plan

> Planning output only. Appearance selection authorizes this plan, not code execution or Git publication.

## Task Board

- [x] Investigate existing preview/Word float behavior and public aCRF practices.
- [x] Confirm R1: retain floats, 75% translucent fill only, residual text overlap handled manually; no added whitespace.
- [x] Create isolated task worktree, parent/children, requirements, technical designs and leaf execution plans.
- [x] Curate/validate all implement/check manifests and complete PRD convergence/document scope checks (3 task validations, 6 nonempty manifests, exact source excerpts, bounds/paths/fences/whitespace passed; oversized-source injection warnings resolved).
- [ ] User reviews the delivered plan and explicitly requests execution.
- [x] Activate and complete R1 with TDD, rendering/coverage gates and actual-diff review (translucent fill verified: XML alpha-stripped byte-identical, backend 1212/87%, frontend exit 0, LibreOffice smoke 5 pages; independent trellis-check passed with zero fixes).
- [x] Activate and complete R2 with TDD, rendering/coverage gates and actual-diff review (FormPreviewOid + 7th prop wired on both designer scopes and visits; npm test exit 0 / vitest 115, lint 0 errors, build ok, parity 4 passed; independent check dispatched).
- [ ] Run combined title/OID/domain/field acceptance, strict table parity and full regression.
- [ ] Synchronize feature docs/spec/inventory; report run/not-run/failure status and residual limits.
- [ ] Only if separately authorized: specific-file commits, standalone Trellis commits, local merge/cleanup and publication under current Git rules.

## Execution Entry and Ownership

Worktree: `/home/decade/CRF-Editor/.claude/worktrees/acrf-word-annotations`.
Branch: `worktree-acrf-word-annotations`, based on `main` at `20e8ee5` when planning began. Recheck current heads/peer worktree ownership before resuming; other sessions may advance main or archive/move tasks.

Current focus is the **parent in planning**. The first coding target is `.trellis/tasks/10-13-acrf-annotation-space/`, then `.trellis/tasks/10-13-word-preview-form-oid/`. Neither is a prerequisite for the other's code; the recommended order just simplifies integration. Do not code on the parent or run `task.py start` during this planning turn.

For each child after explicit continuation:

1. Read current rules/prefs and the manifests → PRD → design → implementation plan, in that order.
2. Validate context/artifact readiness; load phase 1.4 review/activation guidance, then start the actual child only after the user-approved boundary is clear.
3. Load the listed project pre-development workflow/Skill; implement the child's RED→GREEN steps with one writer.
4. Review the actual diff and report the real verification results. Delegate only for a bounded benefit; missing independent review is not disguised as self-review.

The leaf plans contain production/test file scopes and exact targeted commands. Parent owns shared documentation, final checks and any later separately authorized Git wrap-up.

## Combined Acceptance Walk

- [ ] Full-mode designer canvas, fullscreen and visits: show original form name + actual code as separate metadata in eCRF and aCRF.
- [ ] Brief or null/blank code: no title OID; existing mode normalization unchanged.
- [ ] aCRF form-domain/ordinary-field/inline-header markers: same 0.25 background alpha; text/outline retain original strength and reset retains its state opacity.
- [ ] Existing saved offsets, vertical drag/save/reset, resizers, default values, notes, orientation and opening/closing paths remain unchanged.
- [ ] Short/long title/code plus domain reserve: safe flow and readable contrast; raw `.wp-form-title` identity remains name only.
- [ ] Word aCRF: only annotation-fill alpha 25000 changes; original body/table/page/annotation geometry and heading/TOC behavior remain unchanged. eCRF has no R1 changes.
- [ ] Browser fixture/authorized app and Word checks are recorded with renderer/version and scope; no claims of full E2E or Word appearance when only mount/XML tests ran.

## Mandatory Cross-Stack Check Scope

The root context requires synchronized checks for Word-preview/export work. During execution inspect only the relevant call-site/contract portions of:

- Backend `src/routers/import_docx.py`, `src/routers/projects.py`, `src/services/import_service.py`, `project_import_service.py`, `export_service.py`, `word_table_parity.py`.
- Frontend `TemplatePreviewDialog.vue`, `DocxCompareDialog.vue`, `DocxScreenshotPanel.vue`, `SimulatedCRFForm.vue` plus the actual designer/visits hosts in the child scopes.

Purpose: confirm this display-only change does not alter import/field content or stored annotation contracts, and that non-aCRF/import screenshots are not silently expanded. A required check is not permission to edit those unrelated paths. Column-width planners/fixtures must remain unchanged; run their existing regression gates rather than modifying them.

## Final Validation Commands

Examples below are separate checks run in the indicated worktree directory, not a single copy/paste script. Read the leaf plans for baseline and RED commands. No listed implementation check has run in planning.

```bash
# <worktree>/frontend:
npm test
npm run lint
npm run build

# <worktree>/backend:
/home/decade/.venvs/crf-editor/bin/python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered
/home/decade/.venvs/crf-editor/bin/python -m ruff format --check .
/home/decade/.venvs/crf-editor/bin/python scripts/compare_word_table_parity.py <synthetic-preview.json> <synthetic-export.docx>

# <worktree>:
git diff --check
python3 ./.trellis/scripts/task.py validate .trellis/tasks/10-13-acrf-readable-preview
python3 ./.trellis/scripts/task.py validate .trellis/tasks/10-13-acrf-annotation-space
python3 ./.trellis/scripts/task.py validate .trellis/tasks/10-13-word-preview-form-oid
```

Coverage is >=80% with no like-for-like baseline decrease. Existing Node JS coverage is available; a numerical SFC provider is not in the checked-in dependencies. Do not invent a percentage, weaken tests, or auto-install a provider; stop at an unmeasured coverage gate and ask for the needed decision. Likewise, unresolved tests/build or blocked real Word/browser validation must be reported rather than marked complete.

## Documentation and Wrap-Up

- Update user docs in README.md/README.en.md and applicable module/root context for actual implemented behavior; `.claude/index.json` reflects any new component/test files.
- Update cross-stack §6 appearance constants and the stateless-preview extra data prop. Trellis docs/specs and code must not be mixed in the same commit.
- Root/module changelog narratives follow the latest archive-pointer rules; no historical timeline rebuild.
- No proactive commits/pushes or unconfirmed cleanup. If a later Git wrap-up is requested, review actual diff, stage specific files, respect hooks, merge locally only after checks, and obtain the required deletion/publication permissions.
- Hand back this board plus evidence paths and pending items; compression/model switch does not grant hidden execution or publication authority.
