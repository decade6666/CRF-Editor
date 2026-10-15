# Word Preview Form OID: Value-Only Red Badge

## Goal

Make the form OID beside the Word-preview form name concise and visually consistent with field OID red boxes, without changing how forms or annotations work.

## Authorization and Delivery Boundary

The user explicitly requested a task and an execution plan, to be handed to a later execution session. This planning session must not start the task, change application code/tests, commit, merge, deploy, or publish. Keep task status `planning` until the user authorizes execution after reviewing the artifacts.

## Confirmed Background

Evidence was inspected at base commit `54649e0`; these are source/test observations, not browser verification.

| Evidence | Confirmed current behavior |
| --- | --- |
| `frontend/src/components/FormPreviewOid.vue:12`, `:16`, `:22`; `frontend/tests/component/FormPreviewOid.spec.js:12`, `:26`, `:33` | The badge trims `code`, prepends `OID:`, uses unboxed dark-gray text, and renders input as literal text. Existing tests explicitly require the prefix. |
| `frontend/src/components/DesignerWordPreview.vue:75`; `frontend/src/components/FormDesignerTab.vue:3227`, `:3475`; `frontend/tests/component/DesignerWordPreview.spec.js:448`, `:476`, `:487` | Main and fullscreen designer previews already share the badge and gate it by full editing mode, independently of the eCRF/aCRF view toggle. |
| `frontend/src/components/VisitFormPreviewDialog.vue:437`; `frontend/tests/component/VisitFormPreviewDialog.spec.js:450`, `:478`, `:503` | Visits preview uses the same badge with the authoritative form's `code`, not `domain`, and has equivalent visibility rules. |
| `frontend/src/components/DesignerAcrfAnnotation.vue:49`; `frontend/src/composables/acrfAnnotationGeometry.js:8`, `:18`, `:23`, `:136`; `.trellis/spec/guides/cross-stack-contracts.md:558` | Field OID boxes use red border/text, a translucent pale-red background, `2px` corners, and shared border/padding metrics. Their absolute positioning, fixed geometry, and drag/reset controls belong to annotations, not title metadata. |
| `frontend/src/components/DesignerWordPreview.vue:524`; `frontend/src/components/VisitFormPreviewDialog.vue:793`; `frontend/tests/component/DesignerWordPreview.spec.js:454`; `frontend/tests/component/VisitFormPreviewDialog.spec.js:483` | Title rows use wrapping flex layout with a `4.8cm` domain-marker reserve. `.wp-form-title` remains the raw name, separate from the OID. |

## Requirements

- **R1 — Value-only content:** Display exactly the trimmed `form.code` value. Remove the added `OID:` prefix; do not add a replacement label or strip characters from the actual OID value.
- **R2 — Red-box decoration:** Match field OID border color/width, text color, translucent background, corner radius, and padding. Keep border/text fully opaque; background opacity is `0.25`. Preserve the title badge's existing font sizing and normal-flow, content-sized layout rather than inheriting annotation positioning, fixed width/height, or ellipsis.
- **R3 — Existing visibility:** Apply the change consistently in designer main/fullscreen and visits preview. Full editing mode shows a nonblank code in both eCRF and aCRF views; brief mode hides it. Missing, `null`, empty, and whitespace-only values produce no badge or empty red frame.
- **R4 — Layout and identity:** Preserve long-code wrapping and the domain-marker reserve in portrait/landscape and light/dark themes. OID and form name stay separate siblings; `.wp-form-title` contains only the unmodified form name.
- **R5 — Read-only safety:** Continue literal-text interpolation, whitespace trimming, and the existing `code` prop. Add no API calls, storage, emits, editing, dragging, reset controls, or annotation persistence.
- **R6 — Regression and documentation:** Update the old prefix assertions, add verifiable decoration/layout coverage, retain existing visibility/safety/integration regressions, and synchronize directly affected documentation descriptions during implementation.

## Acceptance Criteria

| ID | Requirement | Testable acceptance |
| --- | --- | --- |
| AC1 | R1 | `code = '  F-001  '` renders exactly `F-001`, with no presentation prefix. A literal `OID:` inside the supplied value is not rewritten. |
| AC2 | R2 | Browser-computed border color/width, text color, background alpha, radius, and padding match an existing field OID box. The title badge is not an absolutely positioned annotation and has no reset control. |
| AC3 | R3 | Main/fullscreen designer scopes and visits preview show identical value-only badges in full-mode eCRF/aCRF; brief mode and blank/missing values render none. |
| AC4 | R4 | A long form name plus an unbroken 80-character code wrap within the available title area without clipping, horizontal overflow, or intrusion into the domain-marker reserve; verify both orientations and themes. Raw title text remains the name only. |
| AC5 | R5 | HTML-like values render as text, not child HTML; no new requests/storage/events/drag behavior are introduced. Existing field/domain annotation interactions and saved offsets are unchanged. |
| AC6 | R6 | First demonstrate failing new expectations on the existing implementation; then affected component/source tests, frontend tests, lint, build, diff review, and authorized browser checks pass. Report coverage evidence honestly: it must not decrease, the target is at least 80%, and unavailable measurement must be disclosed rather than claimed. |
| AC7 | R6 | `frontend/.claude/CLAUDE.md` no longer describes the old prefix/dark-gray appearance; `README.md`, `README.en.md`, and `.claude/index.json` receive only the minimal applicable synchronization. No historical archive is rewritten. |

## Out of Scope

- Backend/API/schema/database changes and generated Word `.docx` export changes; this is an on-screen preview adjustment only.
- New OID displays in template/import/simulated preview surfaces that do not already use this badge.
- Changes to field OID styling, eCRF/aCRF mode policy, annotation geometry/constants, saved offsets, renderers, table widths/heights, or preview/export table-field parity.
- Dependencies, script runners, build/release/deployment workflows, production data, and unrelated refactoring.

No blocking product questions remain. The execution checklist, file scope, verification commands, and handoff instructions are in `implement.md`.
