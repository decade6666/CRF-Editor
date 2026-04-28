# Optimize Dark Mode and Project List UI

## Goal

Optimize the CRF-Editor frontend display quality by making dark mode darker, more professional, and lower-saturation, while fixing the project list display issue found during browser inspection. The CRF/form preview rendering must remain unchanged.

## Background

- The frontend uses Vue 3, Vite, and Element Plus.
- Existing dark mode is too bright and visually feels generic / AI-template-like.
- Theme switching logic is in `frontend/src/App.vue`.
- Global theme variables are in `frontend/src/styles/main.css`.
- CRF preview rendering and styling are handled by:
  - `frontend/src/styles/main.css` (`.word-preview`, `.word-page`, preview table styles)
  - `frontend/src/components/SimulatedCRFForm.vue`
  - `frontend/src/composables/useCRFRenderer.js`
- Browser inspection reproduced the project list issue: long project names can expand `.project-item` beyond the sidebar width because the item is a `button` with `display: flex` and no explicit width constraint.

## Requirements

### R1: Improve dark mode visual quality

- Dark mode should use genuinely darker surfaces.
- Reduce the current bright / saturated blue feeling.
- Use a professional low-saturation clinical tool palette instead of vivid AI-like colors.
- Header, sidebar, content background, cards, borders, hover states, and active states must have clear visual hierarchy.
- Element Plus components must remain readable and interactive states must remain distinguishable.
- Avoid large bright gradients, glowing blues, excessive glassmorphism, and generic AI-template color treatment.

### R2: Preserve form preview rendering

- Do not change CRF preview rendering logic.
- Do not change `.word-page` paper preview internals, table borders, typography, fill lines, or column width behavior.
- Do not modify `useCRFRenderer.js` output behavior.
- Do not modify `SimulatedCRFForm.vue` paper-form simulation styles.
- Theme improvements should affect the application shell, workspace, sidebar, and generic UI surfaces, not the preview document itself.

### R3: Fix project list display

- Each project list row must be constrained to the sidebar width.
- Long project names must be truncated with ellipsis instead of expanding the row.
- Drag handle, project icon, project name, copy button, and delete button must stay aligned.
- Hover and active states must not change row width or cause layout shift.
- Copy and delete actions must remain accessible.
- Existing project selection, copy, delete, and drag-to-reorder behavior must continue to work.

## Acceptance Criteria

- [ ] Dark mode background and surfaces are visibly darker than the current implementation.
- [ ] Primary and accent colors are lower-saturation and feel professional / clinical rather than AI-template-like.
- [ ] Header, sidebar, content area, cards, tables, and dialogs remain readable in dark mode.
- [ ] Form preview paper, tables, borders, fonts, fill lines, and column widths remain unchanged.
- [ ] Long project names no longer expand project rows beyond the sidebar.
- [ ] Project list works at the default sidebar width (`220px`).
- [ ] Project list works at the minimum sidebar width (`120px`).
- [ ] Project list works at the maximum sidebar width (`400px`).
- [ ] Project copy, delete, drag sorting, and selection interactions still work.
- [ ] Relevant frontend lint/build/tests pass, or any limitation is documented.

## Out of Scope

- No backend API changes.
- No database/schema changes.
- No replacement of Element Plus.
- No new UI dependency.
- No full redesign of the application information architecture.
- No mobile-specific redesign beyond preserving current responsiveness.
- No changes to Word/CRF preview output.

## Technical Notes

### Files likely involved

- `frontend/src/styles/main.css`
  - Dark theme tokens.
  - Global shell/sidebar/content styles.
  - Project list base styles.
- `frontend/src/App.vue`
  - Project list markup and scoped sidebar action styles.
  - Theme toggle remains here.
- `frontend/tests/themePalette.test.js`
  - Existing theme token tests may need updates.
- `frontend/tests/sidebarCollapseBehavior.test.js` or `frontend/tests/sidebarCopyButtonScope.test.js`
  - Existing sidebar/project-list structure tests may need updates.

### Files that should not be changed for preview preservation

- `frontend/src/composables/useCRFRenderer.js`
- `frontend/src/components/SimulatedCRFForm.vue`
- Preview-specific `.word-page` rendering rules unless strictly required and proven not to affect preview output.

### Suggested implementation direction

- Prefer semantic CSS token changes over component-level hardcoded colors.
- Use darker body/sidebar/header surfaces with low-saturation blue-gray accents.
- Keep preview document surfaces white / paper-like as they are today.
- Constrain project list layout with CSS such as:
  - `.project-item { width: 100%; min-width: 0; }`
  - Project label container: `min-width: 0; flex: 1 1 auto;`
  - Project text: `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`
  - Project actions: `flex-shrink: 0;`
- Avoid hover styles that change horizontal padding or row width.

## Browser Inspection Finding

Observed with mocked project data in the Vite app:

- Sidebar width: `220px`.
- Long English project name row rendered around `545px` wide.
- Long Chinese project name row rendered around `262px` wide.
- Cause: project row shrink-wrapped to content instead of being constrained to sidebar width.

## Definition of Done

- Implementation remains focused on visual/theme and project-list layout only.
- No unrelated refactor.
- No change to CRF preview rendering behavior.
- Browser verification includes at least:
  - Dark mode shell visual inspection.
  - Project list with long English and Chinese names.
  - Sidebar default/min/max width checks.
  - A form preview screen or preview component sanity check showing preview remains unchanged.
- Relevant checks are run and results reported.
