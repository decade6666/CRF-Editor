# Design: Word 预览与导出填写线长度上限

## Boundaries and existing behavior

- Backend normal and standalone inline export paths pass their planned column width into `compute_fill_line_char_count` (`backend/src/services/export_service.py:3082-3084,3311-3317`); the helper currently clamps `[6,80]` (`backend/src/services/width_planning.py:29-50`). The legacy no-width path produces 16 `_` (`export_service.py:3371`).
- Frontend preview callers share `computeFillLineCharCount` and `renderCtrlHtml` (`frontend/src/composables/useCRFRenderer.js:30-49,475-480`); the same helper currently clamps `[6,80]`. Designer, visit, template, and import-effect previews use this renderer (`research/frontend-underline.md:62-73`).
- The `.word-page` preview stretches an only-child `.fill-line` across the entire cell with flex and overrides its inline `min-width` (`frontend/src/styles/main.css:411-423`). Therefore reducing the generated `_` count alone does not solve the visual-preview request. The common `.fill-line` class and its base styling are a project red line (`main.css:487-495`).
- `toHtml` converts any run of four or more `_` into a span, including user-entered default values (`useCRFRenderer.js:445-460`). A global `.fill-line` cap would change manual content and is prohibited by R1.

## Data flow and proposed approach

1. **Export character count**: change the backend and frontend `FILL_LINE_MAX_CHARS` from 80 to **20** in lockstep; keep the shared floor 6, the width-dependent calculation, rounding, and the 16-character no-width fallback. Do not change `|__|` digit/date/time boxes or user-entered text. No API/schema/storage changes.
2. **Preview generated-vs-manual boundary**: distinguish the leading automatically generated fill-line when `renderCtrlHtml` converts a text/default-type control. Extend its HTML generation with an **auto-only maximum width of `FILL_LINE_MAX_CHARS * 0.5em` (10em)**. Leave `toHtml(defaultValue)` and later underscore runs in user-authored suffix text unbounded. Preserve the existing `.fill-line` class, border style, and general underscore conversion; do not apply a global CSS rule or clip the containing cell.
3. **Visual behavior**: the existing flex fill can continue to occupy narrow cells, but an auto-generated line cannot expand past 10em in a wide `.word-page` cell. A generated line followed by a unit already uses its inline width; ensure it also stays within the cap. If the browser's flex sizing does not honor a per-generated-span maximum width, use a marker scoped only to auto-generated spans and a narrowly scoped override; never cap user-authored default-value spans.
4. **Parity**: the plain string rendered by `renderCtrl` remains the same shape as `_render_field_control` (only the adaptive count changes). Keep the front/back formula and constants aligned; verify normal, standalone inline, portrait/landscape, and fixed-16 paths through existing parity tests. The HTML-only visual cap must not alter preview JSON text or `.docx` contents.

## Compatibility and trade-offs

- A fixed count of 20 is deterministic and testable. The length is **approximately** 3.8 cm using the existing 0.19 cm/character estimate, not an exact measurement in every font or browser zoom level. The browser cap of 10em follows the renderer's established 0.5em/character approximation.
- The 16-character legacy/no-width and empty-choice placeholders remain unchanged because they already satisfy the 20-character text cap. Numeric/date/time boxes are format slots, not fill-lines; they retain the configured number of slots.
- The cap belongs to a cross-stack constant rather than a per-form setting; adding persistence or a configuration UI would enlarge the contract without a user requirement.
- Reject a backend-only change (would desynchronize preview/export), a shared CSS `.fill-line` cap (would change manually entered underscores), and data truncation (would change user content).
- No database migration or rollout step is needed. Rollback is limited to restoring both shared constants and the auto-only visual cap together; do not revert one side alone.

## Verification risks

- A text field's unit suffix could itself contain user-authored `_`; only the generated leading line should receive the auto width cap. A default value consisting solely of `_` may match the existing flex selector but must remain untouched.
- An inline column may be narrower than the minimum 6-character estimate; preserve the existing flex `min-width:0` no-overflow safeguard when limiting only the maximum width.
- Use an actual browser DOM width check, not just string/source tests, to establish that the `.word-page` line no longer fills wide cells. Export a representative `.docx` and inspect the text run/strict parity separately from the visual measurement.
