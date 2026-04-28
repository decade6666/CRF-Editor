# Proposal: Align Word export widths and underlines with preview semantics

## Summary

Improve Word export so that exported tables and fill lines more closely match the existing preview behavior.

This change addresses three user-visible mismatches:

1. Horizontal table column widths in exported Word documents do not match the preview's visual allocation.
2. Some exported choice options show an extra circle or abnormal symbol between the option label and the trailing underline.
3. Text field underline lengths in exported Word documents are fixed and do not reflect the preview's visual semantics.

The goal is not pixel-perfect parity between browser preview and Word, but a stable, testable approximation driven by the same visible-content semantics.

## Problem

The current preview and export pipelines describe similar CRF content, but they do not derive layout from the same rendering semantics.

### Column widths

The frontend preview uses browser table auto layout for both inline and unified tables, so actual visible content strongly influences final widths. In contrast, the backend export path uses a simplified width-planning model and then applies fixed Word column widths within a fixed page-width budget.

As a result, long Chinese labels, long option labels, and fields with visible fill-line semantics can receive widths that differ noticeably from the preview.

### Choice option rendering

The export path renders choice content using multiple Word runs and appends trailing underline content using `NBSP + "_" * 6`. This construction can produce visual artifacts between the option label and underline in Word output.

### Text fill-line length

The preview renders fill lines as visual elements (`border-bottom` with minimum width semantics), while the export path still renders many fill lines as fixed underscore strings. This causes exported Word output to lose the preview's visual distinction between different content contexts.

## Goals

- Make exported horizontal table widths track visible-content demand more closely.
- Remove abnormal symbols between choice labels and trailing underlines in exported Word output.
- Replace fixed underscore-only fill-line behavior with a semantic length strategy that better matches preview intent.
- Preserve existing unified/inline layout classification and current page-width budgets.
- Keep the implementation minimal and centered on the existing export pipeline.

## Non-Goals

- Pixel-perfect reproduction of browser layout in Word.
- Replacing the current unified/inline grouping strategy.
- Redesigning frontend preview behavior.
- Changing database schema, import pipeline, or form data semantics.

## Constraints

### Hard constraints

1. Existing layout classification remains the boundary for export behavior.
   - `backend/src/services/export_service.py:460` already determines when forms use `unified_landscape`.
   - This change should refine rendering within existing layout modes rather than invent new modes.

2. Word export must remain within fixed width budgets.
   - The export path currently allocates widths within existing page-width constraints for portrait and landscape layouts.
   - Any width strategy must normalize into those existing budgets rather than changing page geometry.

3. Width planning must build on existing backend semantics rather than duplicating them.
   - `backend/src/services/width_planning.py` already defines text, Chinese, ASCII, fill-line, and choice-atom weighting.
   - Follow-up implementation should extend or retarget this model, not add a separate competing heuristic layer.

4. Preview width behavior is driven by browser auto layout.
   - `frontend/src/styles/main.css` uses `table-layout: auto` for preview inline/unified tables.
   - Therefore, export can only approximate preview by modeling visible content demand; it cannot reproduce the browser's full layout engine.

5. Visible-content semantics are the best common approximation layer.
   - `backend/src/services/field_rendering.py` already contains logic closer to what users actually see, especially for choice-aware width demand.
   - Export width planning should prefer that semantic layer over raw header/value-only inputs.

6. Choice artifact fixes must stay localized to choice atom export paths.
   - The issue is centered on the choice rendering flow in `backend/src/services/export_service.py`, not the entire paragraph/font system.

7. Fill-line length semantics must be unified across export contexts.
   - Text fields, label fields, unit-appended fields, and trailing underscores in choice options must derive from a consistent semantic rule source rather than each using unrelated fixed underscore counts.

8. Existing tests remain authoritative constraints.
   - Current width-planning and unified-export tests must continue to pass.
   - Test execution should use `python -m pytest` in this repo context because plain `pytest` is path-sensitive here.

### Soft constraints

- Prefer the smallest viable fix.
- Reuse existing shared rendering semantics where possible.
- Avoid widening the scope beyond the three reported mismatches.
- Preserve current naming, layout concepts, and export structure unless directly required by the fix.

## Proposed Direction

### 1. Make width planning visible-content-driven

Refine the export-side width planning so it consumes semantic demand that more closely reflects rendered content:

- prefer choice-aware and fill-line-aware demand signals derived from shared rendering semantics,
- preserve existing total-width normalization,
- keep the current inline/unified layout modes intact.

This will allow long labels, long options, and fields with visible fill-line demand to claim more width in exported Word tables.

### 2. Treat choice label + trailing underline as one stable export atom

Refine Word export of choice options so the option symbol, label, spacing, and trailing underline are represented as a stable visual unit, avoiding constructions that can introduce stray circle-like artifacts.

The implementation should stay inside the existing choice rendering path and avoid unrelated paragraph-wide changes.

### 3. Introduce semantic fill-line length mapping

Replace fixed underscore-only fill-line generation with a rule set derived from preview semantics:

- short/default text contexts may use shorter lines,
- visually wider contexts should receive longer lines,
- choice trailing underlines and standalone text-field underlines should come from the same semantic source, even if rendered differently in Word.

This does not require identical rendering technology across frontend and Word; it requires consistent intent.

## Risks

1. Browser preview and Word layout are fundamentally different.
   - Mitigation: define success as closer visual allocation, not pixel-perfect equality.

2. Choice rendering changes could affect spacing, wrapping, or ordering.
   - Mitigation: keep changes localized to choice atom construction and cover them with focused tests.

3. Unified fill-line semantics may alter several field types at once.
   - Mitigation: define explicit semantic categories and test them separately.

4. Existing tests do not fully capture visual parity.
   - Mitigation: follow-up implementation should add behavior-level tests for width demand, choice trailing underline rendering, and fill-line length selection.

## Success Criteria

1. In exported horizontal Word tables, columns with clearly larger visible-content demand receive more width than columns with shorter visible content.
2. Long labels and long option content in unified landscape export are no longer compressed to widths that visually resemble short labels.
3. Exported choice labels with trailing underlines no longer show an extra circle or abnormal separator between the label and underline.
4. Exported text fill lines are no longer all represented by the same fixed underscore length regardless of context.
5. Existing relevant export and width-planning tests still pass, and follow-up implementation adds targeted regression coverage for the three reported issues.

## Implementation Notes for Planning Phase

The most likely implementation surface is:

- `backend/src/services/export_service.py`
- `backend/src/services/width_planning.py`
- `backend/src/services/field_rendering.py`

The preview remains the behavioral reference, especially:

- `frontend/src/composables/useCRFRenderer.js`
- `frontend/src/components/FormDesignerTab.vue`
- `frontend/src/styles/main.css`

Planning should explicitly avoid unnecessary frontend changes unless a shared semantic constant or mapping must be aligned.
