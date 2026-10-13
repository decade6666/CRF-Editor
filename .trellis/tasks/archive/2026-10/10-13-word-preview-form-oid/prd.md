# Form OID Beside the Word-Preview Paper Title

## Goal

Let users identify the form by seeing its actual OID beside the form name in the current designer and visits paper-preview titles.

## Parent and Evidence

Parent: `../10-13-acrf-readable-preview/` (R2, parent AC5–AC7). Scope and code/test evidence: parent `research/form-oid-scope.md`.

Form OID is nullable `FormResponse.code`, not domain or field variable (`backend/src/schemas/form.py:123-132`). Paper titles are owned by `DesignerWordPreview.vue:70-87` and `VisitFormPreviewDialog.vue:434-451`; both existing title rows reserve space for the separate domain marker.

## Scope

This implements the original **preview-interface** request. It covers designer canvas, fullscreen designer, and visits preview paper titles. Full editing mode shows OID in both eCRF/aCRF; brief mode hides it under existing identifier policy. Word export/TOC titles, surrounding toolbars, template-import previews and original DOCX screenshots are unchanged. These are stated minimal-scope defaults, not a claim of extra user approval for Word-title changes.

## Requirements

- **R2.1:** Show the actual form code adjacent to the original form name on all three scoped paper-preview surfaces.
- **R2.2:** Omit null/empty/whitespace-only code without a placeholder or empty badge. Do not substitute domain, a field variable, or an invented identifier.
- **R2.3:** Keep the original name's text and left-aligned typography. Keep `.wp-form-title` as raw name text; render OID as separate text metadata so identity/parity readers are not contaminated.
- **R2.4:** Gate by full editing mode independently from the aCRF marker gate. Designer remains stateless; preserve its 14 parent-owned handlers, both scopes, resizer/cache ownership and visits lifecycle.
- **R2.5:** Short values appear next to the name; long values may wrap in the same title area without entering the existing domain-marker reserve. Preserve readable contrast on white paper in both app themes.
- **R2.6:** Use text interpolation, not `v-html`; add no API call, storage write, identifier generation, or editing control.

## Acceptance Criteria

- **AC1 / R2.1–R2.2:** A code distinct from name/domain/field variable appears correctly on both designer scopes and visits paper title; null/empty/whitespace code renders no OID element.
- **AC2 / R2.3–R2.4:** Full-mode eCRF and aCRF show title OID; brief mode hides it, without changing annotation-mode behavior. Raw `.wp-form-title` text remains the original name.
- **AC3 / R2.5:** Real-browser short/long name/code cases, portrait/landscape and aCRF domain presence remain readable, wrap safely, and do not alter table widths or the name's alignment/font. happy-dom alone is not geometric proof.
- **AC4 / R2.6:** HTML-like test input is displayed as literal text; existing form loading/error handling and API calls remain unchanged.
- **AC5 / Integration:** Combined translucent domain/field floats and title OID are checked together; strict table-field identity/parity is preserved and exported Word titles remain unchanged.

## Out of Scope

R1 background translucency belongs to sibling `../10-13-acrf-annotation-space/`. OID in exported Word, changing identifier generation or API/database shape, new field/domain annotations, broad title/editor refactoring, new dependencies, and unrelated views are excluded.

## Execution Boundary

Status remains `planning`. This turn writes planning artifacts only; no business-code implementation, tests pretending to validate an implementation, commits, merges, upload, or cleanup. Start this child only after the user reviews the plan and explicitly proceeds.
