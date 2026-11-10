# Settings UI Contract Excerpts

Task-scoped reading guide, not a replacement for the source specs. Keeps required context below the 32 KiB per-file injection bound; no shared spec is changed.

## Dialogs and styles

Source: `.trellis/spec/frontend/component-guidelines.md`, sections Props Conventions / Lazy-Mounted v-model Dialogs (lines 98–142), Teleported Dialog Root Styling (231–265), CSS Variables for Theming (267–283), Accessibility (304–341).

- Preserve visibility round trips and lazy dialog lifecycle; do not add duplicate close handlers when update:modelValue already owns state changes.
- Prefer the Element Plus public `width` prop to size the actual rendered dialog. Scoped descendant rules can miss a teleported dialog root; root-only layout rules, if needed, use a unique dialog class and a selector that actually reaches that element. Local content styles stay scoped.
- Reuse existing theme variables; do not recolour unrelated components. Decorative icons are not accessible action labels. Preserve keyboard interaction, group names and focus visibility.
- For this task, use existing segmented controls and existing settings handlers. Do not extract a new settings component or invent new state management.

## Current Agent host contract

Source: `.trellis/spec/guides/cross-stack-contracts.md:1157` (section 16 Owner UI); verified against `frontend/src/App.vue:561–580`, `:1209–1215` and `frontend/tests/component/AppAgentAccess.spec.js` at task base `5e17486`.

- Settings contains the regular-user `agent-access-entry` button, disabled without a validated selected-project id and absent for admins. Opening settings alone does not request Agent data.
- Exactly one `AgentAccessDialog` is lazily mounted as a sibling of settings, never inside it. Preserve validated numeric project-id and the existing model-value / update:model-value wiring; do not add @close forwarding.
- Settings close, project id switch/delete, logout and expiry unmount the Agent context and invalidate late responses. Same-id project metadata updates keep it open. No new API/storage boundary or credential handling is introduced by this restyle.

## Tests

Source: `.trellis/spec/frontend/quality-guidelines.md:233–267`.

- Use real App / Element Plus mounts with the shared API-boundary harness and Vue-warning gate. Do not suppress warnings or replace the code under test with mocks.
- happy-dom establishes DOM structure and state, not browser geometry. Validate real widths, scrolling, header × close and keyboard focus separately in the authorized disposable browser environment.
- Settings' inline default dialog content is queried through the mount wrapper. Preserve behaviour assertions when replacing switch/form-item selectors and text-based action labels.
