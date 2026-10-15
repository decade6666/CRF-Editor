# Compact Planning Evidence: Form Title OID

## Why This Context File Exists

`task.py validate` confirmed that the full component and cross-stack guides exceed the current 32 KiB per-file injection cap. Inject this task-local evidence note and compact frontend specs instead; do not rely on truncated large-guide injection. This note records inspected evidence, not a replacement authority for the original specs.

## Authoritative Spec Ranges to Read on Demand

- `.trellis/spec/frontend/component-guidelines.md:79` — Vue props conventions.
- `.trellis/spec/frontend/component-guidelines.md:811`–`:840` — stateless Word-preview contracts: separate `showFormOid` / `showAcrfAnnotations` gates, main/fullscreen prop wiring, scoped styles, parent-owned drag/persistence, mount-test warning gate.
- `.trellis/spec/guides/cross-stack-contracts.md:391`–`:438` (§5) — raw form-title identity and preview/export table-field parity must remain unchanged.
- `.trellis/spec/guides/cross-stack-contracts.md:498`–`:569` (§6) — annotation storage/geometry and the existing shared visual constants; this task changes none of these constants or export contracts.

Line numbers describe inspected base `54649e0`. If they move, locate the named headings before reading the corresponding ranges.

## Verified Application/Test Entry Points

- `frontend/src/components/FormPreviewOid.vue:12`–`:31` owns the current trimmed value, added prefix, literal-text rendering, dark-gray style, and long-code wrapping.
- `frontend/src/components/DesignerWordPreview.vue:75` and `frontend/src/components/VisitFormPreviewDialog.vue:437` already share that component. The designer's two host gates are at `frontend/src/components/FormDesignerTab.vue:3227` and `:3475`.
- Decoration reference: `frontend/src/components/DesignerAcrfAnnotation.vue:49`–`:72`; token/builder source: `frontend/src/composables/acrfAnnotationGeometry.js:6`–`:23` and `:136`–`:148`. Existing `buildAnnotationStyle` supplies custom properties; merely binding those properties does not require adopting the annotation root class or positioning.
- Existing prefix assertions: `frontend/tests/component/FormPreviewOid.spec.js:12`–`:34`, `frontend/tests/component/DesignerWordPreview.spec.js:448`–`:495`, and `frontend/tests/component/VisitFormPreviewDialog.spec.js:450`–`:508`. Keep the adjacent safety/visibility assertions.
- Layout owners: `frontend/src/components/DesignerWordPreview.vue:524`–`:538` and `frontend/src/components/VisitFormPreviewDialog.vue:793`–`:802`. Decoration-only implementation should not require changing these hosts.
- `frontend/package.json:6`–`:13` confirms the existing commands: `test` = node:test plus vitest, `test:component` = vitest, and separate lint/build scripts. Prefer current source/package/test setup over stale framework wording in older guides.

## Task-Specific Guardrails

Requirements and acceptance are authoritative in the sibling `prd.md`; execution steps and commands are in `implement.md`. This is planning only until later user authorization. Reuse decoration, not draggable annotation markup/behavior. Keep title typography/flow and visibility policy, do not alter actual OID values, and do not expand into backend, Word export, dependencies, or deployment. Real-browser layout verification is still required during implementation; no browser or code tests were run during planning.
