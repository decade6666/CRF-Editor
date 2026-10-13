# Translucent aCRF Float Backgrounds and Word Alignment

## Goal

Reduce opaque-box coverage of original CRF content by making only the existing annotation background translucent in previews and aCRF Word export, without changing the layout or annotation interactions.

## Parent and Evidence

Parent: `../10-13-acrf-readable-preview/` (R1, parent AC1–AC4 and AC6–AC7). Technical/public-source evidence: parent `research/acrf-practice.md` and `research/word-transparency.md`.

Current browser fill/text/outline are separate properties (`frontend/src/components/DesignerAcrfAnnotation.vue:49-79`), and Word writes shape fill, outline, and annotation text separately (`backend/src/services/export_service.py:902-925`). Position keys and relative-y units remain the shared contract (`.trellis/spec/guides/cross-stack-contracts.md:507-569`).

## Confirmed User Decision

The user selected **retain floating boxes; translucent background** on 2026-10-13 after being told that variable text can still overlap body text and that existing drag may be needed. The selected candidate is **75% transparency / 25% opacity**, with annotation text/outline opaque. Earlier added-whitespace permission is not used by this task; the interrupted per-field/page-side whitespace question was never answered.

## Requirements

- **R1.1:** Browser fill opacity 0.25 and equivalent Word fill opacity 25000. Keep original annotation text/value, text color/opacity, outline, and reset control unchanged; no whole-element opacity.
- **R1.2:** Do not change original text, values/options, fonts, filling lines, row heights, table widths, page settings, or pagination. Do not add annotation lanes/rows.
- **R1.3:** Apply the same background-only appearance to the existing form-domain, ordinary-field, and horizontal/log-header floats across designer canvas, fullscreen preview, visits preview, and aCRF Word export.
- **R1.4:** Preserve existing marker dimensions/anchors, mode gates, long-name display behavior, and the annotation-free eCRF path. No new sizing/truncation/placement feature is included.
- **R1.5:** Preserve drag/reset, saved offsets, keys, range, units, API schema, and copy/import handling unchanged. No migration, automatic position changes, or deleted user offsets.
- **R1.6:** Document the accepted residual text/outline-overlap limit. Do not present semitransparency as guaranteed collision avoidance or a regulatory-compliance solution.

## Acceptance Criteria

- **AC1 / R1.1:** Pure geometry/style and mounted-marker tests observe only background alpha; variable text and outline stay opaque, while reset retains its existing state-dependent opacity/visibility without a new inherited alpha.
- **AC2 / R1.1, R1.3:** Generated DOCX XML has `a:alpha val="25000"` only in the annotation shape fill color, not in its line/text color; field/header/domain markers share the same value.
- **AC3 / R1.2, R1.4:** Before/after controlled export comparison preserves original body content, typography, table geometry, page configuration and annotation geometry; eCRF output acquires no annotation alpha or other R1 changes.
- **AC4 / R1.3, R1.5:** Existing view-mode, drag/save/reset and stored-offset tests remain green across ordinary and horizontal/log markers, with both orientations represented.
- **AC5 / R1.6:** Browser/Word rendering is assessed on representative overlaps, with renderer limitations and remaining glyph overlap reported honestly. XML validity alone is not visual acceptance.

## Out of Scope

Form-OID title changes are owned by sibling `../10-13-word-preview-form-oid/`. Added whitespace, page expansion, automatic collision detection, two-axis drag, position migration, fixing existing name truncation, full SDTM/PDF submission, new dependencies, and unrelated rendering changes are excluded.

## Execution Boundary

Status remains `planning`. This turn creates the design/implementation/context artifacts only; execution waits for artifact review and explicit user continuation. No commits, merges, uploads, or cleanup are authorized by the appearance selection.
