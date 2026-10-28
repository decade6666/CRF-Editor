# Design: uppercase OID authoring

## Decisions and boundaries

The user chose **new/manual authoring only** and explicitly excluded **codelist option codes**. Do not migrate existing rows, normalize imports/whole-project clones, or uppercase identifiers on read. Preserve the existing field OID rename/fork and history contracts.

Use two small, pure normalization helpers in the existing shared files, not a new component, global API interceptor, ORM hook, migration, dependency, or script runner:

- Frontend: extend `frontend/src/composables/oidValidation.js` with an ASCII-letter uppercase input helper.
- Backend: extend `backend/src/schemas/_common.py` with a pure ASCII uppercase write helper and, if useful, a tiny unchanged-value preservation wrapper. Existing charset validators remain snapshot-safe and case-preserving.

### Why normalization is not a global validator change

`FieldDefinitionCreate` and `DefinitionPayload` are reused by history restoration. Unconditionally uppercasing inside their existing validators would rename historical snapshots before exact identity checks. It can also break a legacy candidate's shared update. Apply casing at the actual authoring write branch instead, after existing input validation and before collision lookup/persistence. See `research/oid-boundaries.md`.

## Frontend data flow

`user input event -> shared ASCII uppercase helper -> bound editor value -> existing validation/length/dirty/fork decisions -> useApi -> backend`

1. Wire all nine controls in the research inventory to the shared helper on user typing/paste events. The DOM value, Vue state, and eventual payload must agree. (Clarified 2026-10-28 after independent review: the autocomplete's raw `fetch-suggestions` query may still carry the typed case; this is harmless because `searchRanking.js` case-folds and selecting a candidate restores the exact source identity, so search behavior is unchanged.) Use existing Element Plus input events or an equivalent controlled setter; prove the real interaction in mount tests.
2. Do not implement CSS-only `text-transform`. Do not attach a watcher to every loaded OID, normalize API responses, or normalize all candidate definitions.
3. Preserve whitespace at the input layer; existing save-time trimming/optional-empty semantics continue to own that behavior.
4. Convert **ASCII a–z only**. Non-ASCII characters must not be expanded into apparently valid ASCII (for example, `ß` must not become `SS`). Existing charset validation remains authoritative where currently present.
5. Opening a legacy lowercase record or selecting an existing lowercase candidate must preserve its identity. User typing into that OID control is an actual edit and produces uppercase. Candidate-select hydration remains a direct copy of the selected definition.
6. Retain Saimeisi maxlength, edit-session baselines, exact candidate identity checks, explicit save/cancel, dirty-leave checks, fork semantics, and undo/redo guards. Unchanged overlong legacy values remain exempt; genuinely changed values still follow the existing length policy.
7. Newly minted field-copy OIDs use an uppercase source plus `_COPY`, `_COPY1`, `_COPY2`, etc. Search the existing **exact** target values for collisions; do not case-fold or rewrite the existing-name set. Human-readable copy names retain their current spelling/suffix.

## Backend write policy

Keep schemas' existing charset/type/empty handling intact. Unit/visit code fields gain ASCII casing at the write boundary, **not** new charset restrictions.

| Path | Required behavior |
| --- | --- |
| Ordinary field/form/codelist/unit/visit create | Uppercase ASCII in the submitted OID before storing; retain existing generated fallback for optional empty code. |
| Ordinary update with OID omitted | Do not touch the existing OID. |
| Ordinary update echoing the exact existing OID | Preserve it, including legacy lowercase, so changing another property is not a hidden rename. |
| Ordinary update with a different OID value | Uppercase the new ASCII value before storage/uniqueness enforcement; keep current optional clearing and error behavior. |
| Field-profile `none` / pure binding | Do not modify any definition OID. |
| Field-profile `update_shared` | Preserve the exact-identity/no-rename check and the target's existing OID; lowercase legacy snapshots must not fail merely because of this feature. |
| Field-profile new `create_or_restore` without a preferred definition | Normalize the new authored OID **before** exact lookup/uniqueness checks and creation; do not silently bind on collision. |
| Explicit history restore/replay with a preferred definition/snapshot | Preserve the existing exact snapshot semantics, owner/project checks, conflict rules, and transaction behavior. This is restoration, not new OID authoring. Do not turn it into a general case-insensitive identity lookup. |
| Field-definition copy endpoint | Mint uppercase `_COPY` identifiers with the same smallest-free numeric ladder as the frontend. |
| Template/project imports; whole-project clones | Preserve source identifiers and reuse rules verbatim. |
| Reads/serialization/previews/exports/annotation keys | No casing transformation. |

Implementation should modify only local payload copies, not incoming shared schema objects. Reuse one backend helper across the ordinary routes rather than copying conversion algorithms. New profile normalization must not bypass or reorder the incoming horizontal-table guard.

### Collisions and identity

- Keep current database uniqueness constraints and case-sensitive identity semantics. A new normalized OID colliding with an existing uppercase OID fails through the existing transactional error path; the old rows remain unchanged.
- Do not merge `ae01` and `AE01`, silently rebind a field, append an import suffix for ordinary CRUD, or add a case-insensitive index.
- A user-initiated rename retains the application's existing rename/fork behavior. This task does not introduce annotation-key migrations. Unchanged identifiers, source snapshots, and their annotation maps must remain byte/value-equivalent through unaffected operations.

## Documentation

Update README zh/en, root/module CLAUDE feature notes, and `.claude/index.json` to explain the nine uppercase-authoring controls, backend write behavior, historical/import/restoration exceptions, preserved option codes, and unchanged Saimeisi policy. Document `_COPY` as an OID-only change; do not alter human-readable copy-name ladders.

A owns task artifacts, the decision log, the eventual cross-stack §10 update, and completion/history records. B must not edit `.trellis/`, `.context/`, shared journal/index, or task status.

## Verification strategy

TDD first on helper semantics and representative API/component behavior, then expand across the full input/write matrix. Retain existing mixed-case charset tests: they verify snapshot compatibility, not the absence of authoring normalization.

- Pure helpers: mixed case, punctuation/digits, whitespace, blanks/null, idempotence, ASCII-only conversion, and `_COPY` collision ladders.
- API integration: all five ordinary entities, both form PUT/PATCH, changed/omitted/exact-echo updates, field-profile creation/shared updates/binding/restoration, normalized conflicts with rollback, free-text option codes, and project/owner isolation.
- Component mounts: all nine controls, typing and paste-style native input, save payloads, candidate selection, legacy no-op saves, blank clearing, invalid characters, Saimeisi 8/10 limits/exemptions, and cancelled edits.
- Regression: frontend full suites/lint/build; backend targeted suites and full coverage; keep the new horizontal-table guard/restore regressions intact after baseline synchronization.
- A reruns the commands, inspects the actual diff and new files, performs the security-input/ownership review, then obtains one independent read-only review (relay R alias `fable`).
- A runs a real browser walk on a throwaway database if feasible. Browser/server startup is not delegated to B; any required temporary credential generation needs its separate explicit confirmation. Never use the live 8888 service/database or peers' browser pages. If blocked, report exactly which interactions were not verified live.

## Operational safety and rollback

No migration, deployment, service restart, dependency expansion, or production data access is needed. This task remains in the dedicated worktree. Before dispatch, wait for the peer's `single-table-guard` completion notice, fast-forward the uncommitted task branch to the updated local main when safe, reread its relevant contract/spec/code, and refresh evidence anchors. If that changes the approved behavior or write scope, return to planning.

Rollback of code is a normal task-branch diff review, never a destructive reset of the user's checkout. Do not commit, merge the task to main, push, or remove any worktree/branch unless separately authorized.
