# Readable aCRF Float Backgrounds and Word-Preview Form OID

## Goal

Reduce the opaque annotation background hiding original CRF content while preserving the current floating annotations and original layout; show the actual form OID beside the form name in Word-like previews.

## Background and Confirmed Decisions

- The user requested variable-name readability and form OID beside the name in the Word preview, then explicitly required the variable annotations in the exported Word document too.
- On 2026-10-13 the user first allowed added whitespace, but interrupted the whitespace-placement question and proposed retaining the current floating boxes instead. They subsequently selected **retain floats, translucent background**: 75% background transparency, opaque annotation text/outline, existing drag for remaining text overlaps. This appearance-only decision supersedes the proposed added-whitespace layout; no annotation rows, expanded pages, or automatic collision avoidance are planned.
- Current preview markers are opaque absolute overlays (`frontend/src/components/DesignerAcrfAnnotation.vue:49-79`). Word already emits actual annotation text in floating boxes with no text wrapping/reflow and overlap allowed (`backend/src/services/export_service.py:869-930`). The task changes fill appearance, not placement.
- Form OID is nullable `FormResponse.code`, not the form domain (`backend/src/schemas/form.py:123-132`).
- Public aCRF guidance supports readable, printable annotations without obscuring CRF text, but primarily concerns PDF. Source details and limits: `research/acrf-practice.md`. Word fill-transparency support and the residual-overlap limit: `research/word-transparency.md`.

## Task Map

| Requirement | Child | Deliverable |
| --- | --- | --- |
| R1 | `../10-13-acrf-annotation-space/` | Background-only translucency in existing aCRF preview/Word floats; the stable task slug does not imply whitespace is still planned |
| R2 | `../10-13-word-preview-form-oid/` | Actual form OID beside the paper title in the current designer and visits Word-preview surfaces |

The parent owns integration and final acceptance. Children can be verified independently; execute sequentially with one writer. Neither requires the other's implementation, but the combined aCRF title/OID/domain appearance needs a final check.

## Requirements

### R1 — Background-only translucency

- Set the existing pale-red annotation **background to 75% transparency / 25% opacity** consistently in the browser and aCRF Word export.
- Keep annotation text and outline opaque and legible. Preserve the reset control's existing hover/focus/disabled visibility and opacity; do not apply additional inherited translucency. Do not apply whole-element opacity or text-color alpha.
- Keep annotation text/value, dimensions, anchors, drag/reset behavior, `annotation_positions` keys/units, and existing stored positions unchanged.
- Do not add annotation whitespace, change original content, reduce fonts, alter table widths/row heights, or change page settings/pagination to accommodate R1.
- Apply the appearance consistently to form-domain and field/header markers that share the current rendering helper; do not introduce separate styles or geometry systems.
- Preserve the annotation-free eCRF path. Existing truncation/overlap limits are not expanded into a new layout feature.
- Accepted limitation: translucency improves background visibility but does not guarantee zero text/outline overlap. Existing manual movement remains the way to avoid those cases; do not describe the result as guaranteed collision-free or regulator-certified.

### R2 — Actual form OID in preview paper titles

- Display the actual form code adjacent to the form name in designer canvas, fullscreen preview, and visits form preview paper titles.
- Follow the existing advanced-identifier policy: show in **full editing mode**, in both eCRF and aCRF previews; omit in brief mode. The title identifier must not depend on the aCRF overlay toggle.
- Omit absent/blank OIDs; do not substitute domain, field variable name, or a fake identifier. Keep form name and any form-domain overlay distinguishable.
- Render identifier text safely as text, not HTML. Preserve the title's left alignment and expose the original form-name identity separately from its additional OID for preview/export parity readers.
- Keep the R2 scope at the original preview request: do not add OID to exported Word titles/TOC, surrounding toolbars, import screenshots, or unrelated previews without a new user request.

## Acceptance Criteria

- **AC1 / R1:** Browser background alpha is 0.25 and generated Word shape fill contains the equivalent `a:alpha` value 25000. Annotation text, border, and reset control have no inherited translucency.
- **AC2 / R1:** Original body content, fields/values/options, typography, table geometry, page settings, and annotation dimensions/positions are unchanged; R1 introduces no layout whitespace or position/schema migration.
- **AC3 / R1:** Existing drag/save/reset and stored offsets retain their behavior across all three preview surfaces, ordinary fields, horizontal/log headers, and both orientations.
- **AC4 / R1:** The annotation-free eCRF output is unaffected. Representative rendered aCRF overlays are reviewed for reduced opaque coverage; remaining text-overlap cases are honestly documented rather than marked as eliminated.
- **AC5 / R2:** Each agreed full-mode preview paper title shows the correct code beside its name in both view modes; brief mode and missing/blank-code cases show no OID. Long values and aCRF domain markers remain usable.
- **AC6 / R1 + R2:** Combined name/OID/domain presentation does not introduce a new title collision or change the form identity used by strict table-field parity tooling.
- **AC7 / Integration:** Targeted tests and an actual-diff review pass; if independent review is used, distinguish it from self-review. Coverage must be at least 80% and not lower than the measured pre-change baseline; unmeasured scopes cannot be reported as a passed coverage gate. Browser and rendered-document checks must distinguish actual runs from blocked/unavailable environments.

## Out of Scope

- Guaranteed collision-free annotation placement, added annotation lanes/rows, wider pages, automatic whitespace search, two-dimensional drag, or annotation-position migrations.
- Full SDTM mapping, PDF regulatory submission generation/compliance certification, new variable/domain inference, or changing original clinical content.
- Fixing unrelated long-name clipping, changing identifier generation, broad refactoring, new dependencies, or build/release changes.
- Business-code implementation, commits, merges, publication, and cleanup in this planning-only turn. The user will compact/switch their execution session after reviewing the artifacts.

## Planning and Review Boundary

Status remains `planning`. Produce child design/execution documents and real implement/check context manifests, perform the PRD convergence/validation pass, and present the resulting plan for review. Do not run `task.py start` or begin implementation until the user explicitly proceeds. R2's preview-only/full-mode interpretation is a stated scope default derived from the request and project policy, not a claim that the user separately authorized Word-title changes.
