# CSS Scope Verification

## Scope & Revisions
- **Scope**: Local differential proof between pre-extraction inline styles and post-extraction scoped styles.
- **Before**: `02eff57` (`f1f7379^`), pre-extraction baseline.
- **After**: `47ac218` (frontend sources unchanged since code commit `4be74c1`).
- **Harness**: Actual `App.vue` mount with real Element Plus components under happy-dom.

## Pairwise Selector Match Results
| Selector Target | Before (`02eff57`) | After (`47ac218`) | Notes |
|---|---|---|---|
| `[App scope] .el-dialog` | false | false | Legacy unmatched rule (no ancestor carries the owning App scope ID; `data-v-app` is mount marker only) |
| `[App scope] .el-dialog__header` | false | false | Legacy unmatched rule (no ancestor carries the owning App scope ID) |
| `[owner scope] .docx-form-checkbox` | true (App) | true (WordImportDialog) | Correctly matches inside owning scope |
| `.form-select-header[data-v-owner]` | true | true | Matches in owning scope |

*AFTER-only note*: `.docx-form-item`, `.docx-form-name`, and `.docx-form-actions` carry and match child scope in `WordImportDialog.vue` (no fabricated BEFORE measurements beyond the pairwise rows).

## Evidence Artifacts & Architecture
- Proof paths: `/tmp/scope-proof/specs/finalDifferential.spec.js`, `/tmp/scope-proof/out/result7.log`, `/tmp/scope-proof/out/result8.log`.
- Wizard has `append-to-body="false"` / default target so teleport is disabled and renders inline; dialog root lacks App scope attribute.
- **Limitation**: Local happy-dom selector match only; real browser rendering and full compare flow unverified.
- **Decision**: Preserve historical CSS rules as-is; do not refactor or fix unrelated legacy scoping anomalies.
