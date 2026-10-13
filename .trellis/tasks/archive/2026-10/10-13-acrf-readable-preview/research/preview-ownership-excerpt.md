# Bounded Source Excerpt — Stateless Preview Ownership

> Context-injection snapshot from `.trellis/spec/frontend/component-guidelines.md:778-848` at planning base `20e8ee5`, 2026-10-13. The ~94KB original is truncated by the 32KB injection limit. This is a task research excerpt, not an independent spec. The original remains authoritative: read the cited ranges if changed/needed and refresh this snapshot after the approved R2 prop update. The baseline below has six data/mode props; R2 intentionally adds one Boolean while keeping fourteen handlers and existing ownership.

## Exact Source Baseline

## Scenario: Stateless Word-Preview Extraction (`DesignerWordPreview`)

### 1. Scope / Trigger

- Trigger: extracting the duplicated `word-page` markup out of `FormDesignerTab.vue` into a presentational child the
  same parent renders twice — `scope="main"` / `scope="designer"` — including the per-marker annotation spans (task
  `designer-split`, 2026-10-11). Cache keys/rehydrate stay in `state-management.md` §4; annotation spec in §6.

### 2. Signatures

```javascript
// frontend/src/components/DesignerWordPreview.vue
defineProps({
  selectedForm: { type: Object, default: null }, groupsView: { type: Array, required: true },
  scope: { type: String, required: true, validator: (v) => v === 'main' || v === 'designer' },
  landscapeMode: { type: Boolean, required: true }, noFields: { type: Boolean, required: true },
  showAcrfAnnotations: { type: Boolean, required: true },
  showFormOid: { type: Boolean, required: true },
  // 14 required { type: Function, required: true } props bound via v-bind="previewHandlers":
  // getResizer, getRowResizer, renderCellHtml, normalFillChars, openQuickEdit, getFormDomainAnnotationText,
  // getFieldOidAnnotationText, getFormAnnotationTarget, getFieldAnnotationTarget, isAnnotationDraggable,
  // hasAnnotationOverrideForTarget, getAnnotationStyle, onAnnotationPointerDown, resetAnnotationPosition
})
// no emits, no provide/inject, no defineExpose

// frontend/src/components/DesignerAcrfAnnotation.vue
defineProps({ text: { type: String, required: true },
  kind: { type: String, required: true, validator: (v) => ['form', 'field', 'inline-header'].includes(v) },
  interactive: { type: Boolean, default: false }, hasOverride: { type: Boolean, default: false },
  annotationStyle: { type: Object, required: true } });
defineEmits(['pointerdown', 'reset']); // pointerdown($event) unconditional; reset() from the reset button
```

### 3. Contracts

| Rule | Why |
|---|---|
| `state-management.md` §4 (Column Width Persistence Contract) stays the single source for storage keys, rehydrate rules, and the export collector | Duplicating key formats or algorithms here would drift from the cache contract |
| Child holds no `ref` state and no cache instance. The 7 explicit data props carry the view models (`showFormOid` added 2026-10-13, task `word-preview-form-oid`: full-mode paper-title form-OID gate rendered through the shared `FormPreviewOid.vue`, independent of `showAcrfAnnotations`); the 14 function props (one `previewHandlers` object, `v-bind` on both instances) only grant access to the parent's state/caches | Resizer caches and `rehydrate` must stay single-owned — a child-owned cache would read the same keys but desync the parent's rehydrate flow |
| Both instances get `v-bind="previewHandlers"` plus their own data props: `scope` (`'main'` / `'designer'`), `groupsView` (`renderGroupsView` / `designerRenderGroupsView`), `landscapeMode` (`landscapeMode` / `designerLandscapeMode`), `noFields` | Declared difference set = exactly the per-instance data props |
| Child root replaces the original `div.word-page` 1:1; parent keeps `.fd-canvas` / `.word-preview` (main) and `.designer-preview-pane` / `-viewport` / `-stage` / `-page` (fullscreen) wrappers | Keeps blank-click exclusion, responsive CSS and `paneSplit` assertions in place |
| Scoped CSS: only rules matching **inside** the moved subtree move to the child's `<style scoped>`. A parent scoped rule reaches only the child root, so descendant rules (`__text`, `-reset`, the `:hover` / `:focus-within` reveal) must move or they silently stop applying | The gotcha that breaks previews invisibly; global `main.css` `.word-page …` rules still reach the child (e.g. `.word-page .wp-form-title { text-align: left }`) |
| Parent signatures keep `scope` threaded through: `getResizer(kind, colCount, groupIndex, group, scope)` (24 template sites per block) and `normalFillChars(groupIndex, group, scope)` (1 site per block). The **shared row cache** stays two-arg: `getRowResizer(kind, group)` | Guarding the row cache with a scope argument changes persisted row heights |
| Emits are declared (`defineEmits`), not native fallthrough; the annotation reset button uses `@pointerdown.stop` | A declared emit is removed from `$attrs`, so one DOM event fires the parent handler exactly once, not twice |
| Parent keeps annotation drag gate (`isAnnotationDraggable`) and persistence; children stay presentational | Preserves cross-stack §6 geometry/clamp/PATCH contract |
| The child is pure markup + the two view-only helpers (`cumRatio`, `getRowHeightStyle`); algorithms and storage keys do NOT move | The extraction must not change the rendered semantics — see §8 |

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| Typed prop validation fails in dev (wrong type / missing required prop) | Vue emits a warning; the mount-test warning gate fails the suite — do not silence it; fix the call site or the fixture |
| A template identifier is missing from the child's imports | Depends on the expression: a Vue render/dev-mode warning, or a runtime render failure / invalid output — never assume a graceful production fallback. Mount every template branch under the warning gate so the identifier is exercised |
| Regression test asserts rendered content | Descendant text is still readable via `textContent`, but it cannot prove markup structure, escaping, or classes; for `v-html` cells and class-carrying rows assert `innerHTML` / element selectors **alongside** text |
| Source-level guard written across both instances | Each instance's props must be checked **inside its own tag** (segment bounded by `scope="main"` vs `scope="designer"`); a file-wide regex matches either tag and hides a real deletion |
| Per-instance counts asserted (`renders twice`) | Meaningless if both tags can be the same instance; assert the two distinct `scope` values and each instance's declared prop set instead |

### 5. Good/Base/Bad Cases

- **Good**: the same `<DesignerWordPreview>` markup serves both scopes; changing the page changes both previews; the mount spec renders every template branch (no form, no fields, normal / inline / unified groups) with `showAcrfAnnotations: true` so every annotation call site is exercised.
- **Base**: `showAcrfAnnotations: false` renders zero annotation spans, including form and inline-header sites.
- **Bad**: a parent-only CSS rule such as `.wp-acrf-annotation-reset { … }` left in place after the markup moved — the reset button loses its styling with no error.
- **Bad**: a guard asserting "`DesignerWordPreview` appears in the file" or "rendered twice" — it passes even if the second instance lost its `scope`.

### 6. Tests Required

| Test / Check | Assertion |
|---|---|
| `frontend/tests/component/DesignerWordPreview.spec.js` | Every template branch renders with real fixtures (`formDesignerPreviewModel.js` / `formFieldPresentation.js` / `previewCellRender.test.js` shapes); `getResizer` / `normalFillChars` receive `scope`; `getRowResizer(kind, group)` stays two-arg; dblclick carries the exact clicked column's field; pointerdown carries the exact row-key / boundary index and the same event; `snapGuideX` toggles; annotation target / event / reset values point at the exact field |
| `frontend/tests/component/DesignerAcrfAnnotation.spec.js` | Class order per `kind`, `--interactive` toggle, style passthrough, aria-label per kind, `disabled` from `hasOverride`, root pointerdown exactly-once, reset-button pointerdown does not bubble |
| `frontend/tests/designerPreviewSplit.test.js` | Each parent instance checked inside its own tag; `previewHandlers` has all 14 closures and `v-bind` is on both instances; the parent holds no moved markup/CSS; the child holds the moved selectors; `main.css` keeps the parity title rule |
| `frontend/tests/component/vueWarnGate.js` (shared gate) | Any Vue warning during mount **or unmount** fails the case — this turns "every template identifier resolves" into a real assertion |

## Visits Ownership — Bounded Summary with Source Anchors

The other title host is deliberately **not** the same extraction shape: original component guidelines at `894-950` describe a self-contained modal preview, while the designer child stays presentational. The dialog resolves authoritative form data and keeps its own annotation glue/lifecycle; `VisitsTab` stays a switch bridge. The dialog must reuse `DesignerAcrfAnnotation` and hold no annotation CSS; only its actual moved title-row style belongs locally (`component-guidelines.md:942-944`). Current direct evidence and test seams are in sibling `form-oid-scope.md`. Read original `894-950` if changing those ownership boundaries; this R2 changes only readonly title metadata and does not authorize a lifecycle/state refactor.
