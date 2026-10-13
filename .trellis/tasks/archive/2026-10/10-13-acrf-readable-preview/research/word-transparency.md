# Feasibility: Retain Floating Annotations with Translucent Backgrounds

## Status

Planning research only. The user subsequently selected retaining the existing floating boxes with 75% background transparency / 25% opacity, and accepted remaining text overlap handled through existing drag. This is the active R1 decision; earlier whitespace permission is not used, and the per-field/page-side whitespace question was interrupted rather than answered. Implementation and commit/merge authorization remain withheld.

## Verified Documentation

- Microsoft Support explicitly supports Word shape/text-box fill transparency from 0% (opaque) to 100% (transparent), independently of text/outline formatting:
  https://support.microsoft.com/en-us/office/graphics-visuals/add-a-fill-or-effect-to-a-shape-or-text-box
- Microsoft Learn documents DrawingML `a:alpha` as a color-opacity transform; `a:srgbClr` is an allowed parent:
  https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.alpha?view=openxml-3.0.1
- Microsoft Learn gives `<a:alpha val="50000"/>` inside a solid-fill RGB color as 50% opaque:
  https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.positivefixedpercentagetype.val?view=openxml-3.0.1
- Context7 resolved `/dotnet/open-xml-sdk` but returned no matching documentation for the targeted alpha query; official Microsoft documentation was used as the alternative. This is documentation research, not a proposal to introduce an SDK/dependency.

## Project Applicability

- Preview background and text/border are currently separate CSS properties (`frontend/src/components/DesignerAcrfAnnotation.vue:61-66`). Apply alpha to the background only, not whole-element opacity, so variable text, borders, and reset control do not fade together.
- Current Word export writes a shape fill and outline separately, and annotation text separately (`backend/src/services/export_service.py:902-925`). A fill-color alpha transform can target only the box background without altering anchor geometry, original body content, or stored relative-y offsets.
- Current shared preview geometry includes separate background/text/border colors (`frontend/src/composables/acrfAnnotationGeometry.js:18-20`). A later implementation must centralize opacity and check browser/export consistency, without changing the geometry/persistence contract by accident.

## Selected Appearance

- Keep floating geometry, existing positions, drag/reset, original rows/columns/page settings, and the current full/aCRF mode gate.
- Use background opacity **25%** (75% transparency); keep variable text and border opaque. Existing reset hover/disabled opacity is preserved, not forced to 1.
- Apply an equivalent fill-only alpha in aCRF Word export. Do not claim a browser-only CSS change solves Word output.

## Acceptance Limitation

Background translucency reduces the opaque rectangle hiding the underlying content. It does not move variable-name glyphs or borders away from original glyphs/lines. Therefore it improves visibility but does **not** prove zero overlap or guaranteed readability for all dense forms. The user explicitly accepted this narrower appearance-improvement boundary; existing manual drag may still be needed.

## Validation Still Needed

No new implementation or sample DOCX was produced. No browser, desktop Word, WPS, LibreOffice, printing, or PDF-conversion compatibility was tested. Format support is established; identical rendered appearance across applications is not. A future plan must distinguish an XML/CSS contract test from actual visual confirmation.
