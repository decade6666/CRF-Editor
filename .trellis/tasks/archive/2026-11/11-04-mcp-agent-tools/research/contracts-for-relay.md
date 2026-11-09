# Bounded Contract Navigation for Relay

Planning evidence at worktree baseline `73e4dd559fda053bc7033568ff6308f84cc1bf50`. This index avoids truncating three oversized specs during context injection; it neither replaces those contracts nor authorizes editing them. Before implementing/reviewing a listed responsibility, locate its heading in the original file and read the indicated range. The role's read-only access to original specs remains required.

## Why a Research Index Is Necessary

`task.py validate` reported a 32,768-byte per-file injection cap. The database guide is 35,841 bytes, component guide 98,619 bytes, and cross-stack guide 105,459 bytes. Do not raise the global cap, inject truncated heads as complete context, duplicate the whole specifications, or modify workflow/runtime code to bypass this warning.

## Required Source Ranges and Task Implications

### Database/session compatibility

Original: `.trellis/spec/backend/database-guidelines.md:132`–224; runtime evidence is also in `sdk-and-integration.md`.

- Existing write/read dependency examples do not establish the new agent's physical SQLite snapshot by themselves. Agent authoritative reads need the explicit transaction boundary in design.md; shared helpers must not commit a savepoint/proposal early.
- New tables are registered models created at startup (`:220`–223); existing-column changes would require the existing migration mechanism and are outside the reviewed implementation plan.
- External template `.db` reads are immutable (`:160`–188): validate existence/path, read-only compatibility probing and memory fallback; never migrate or create the input file.
- Export compatibility operates on its disposable output copy, never the live source. Existing project purge remains an existing caller-owned transaction/file-lifecycle responsibility, not an MCP tool or reason to change unrelated deletion flows.

### Lazy dialog and real parent binding

Original: `.trellis/spec/frontend/component-guidelines.md:125`–140 and `:484`–544; mount-test conventions remain in the separately injected frontend quality guide.

- Populate the project/target before opening; consume initial `modelValue=true` using immediate initialization. Test the actual load, not only a source string.
- Maintain real parent `v-model` open/close/reopen and clear per-project state. Do not hide a prop behind a computed empty setter.
- Element Plus close timing matters: follow the explicit contract at `:534`, forwarding `@update:model-value` only; do not copy an older example's double forwarding from `@close`. Close-time secret cleanup must not invent a second parent visibility transition.
- design.md additionally requires request-generation/disposal guards on close, project change and unmount, plus one-time masked token state and no localStorage persistence. A late response must not repopulate a cleared secret or authorize another project.

### Cross-stack source navigation

All ranges below refer to `.trellis/spec/guides/cross-stack-contracts.md`. The sections are not stored in numeric file order; use headings, not assumed adjacency.

| Section / range | Required task behavior |
| --- | --- |
| §2 `:86`–129 | Submit a complete form-field permutation (including log rows) to the existing two-phase order implementation and validate final structure in the transaction. Existing browser reorder returns 204/no body; the new tool's typed result is an additional contract, not a changed browser response. |
| §3 `:133`–167 | Browser JWT verifies ID/username/auth_version; password changes invalidate it. Preserve request-session-scoped refreshed-token writeback and late-401 behavior in useApi. New scoped opaque agent credentials are separate, not an extension granting all browser access. |
| §8 `:651`–692 | Single 复选 is codelist-free, default text is ✔, label overrides do not replace checkbox control text, and defaults are forbidden even when inline. Reuse existing type-switch cleanup/normalizers; do not change renderers/planners or the Word-import AI type list. |
| §9 `:577`–593 | Frontend uses raw `/api/...` paths through useApi, which applies the deployment prefix at fetch boundaries. Backend stays prefix-unaware; the adapter preserves its host-configured `/crf/...` base. No new bypass fetches or deployment changes. |
| §10 `:739`–807 | Machine OID charset differs from free-text option codes. Apply only ASCII uppercase to newly authored OIDs, preserving selected legacy identity, case-sensitive uniqueness and shared/snapshot/import values. No global validator/case-folded rebinding. Keep Saimeisi manual length caps and unchanged/automatic exemptions. |
| §13 `:951`–991 | dateFormatOptions.js remains the literal single option source; backend/frontend contract tests must agree. New authoring validation does not silently rewrite untouched imported date formats or alter accepted preview/export divergences. |
| §14 `:995`–1033 | Codelist/unit reference scope includes library-only definitions when completeness is needed. Existing edit-impact endpoints retain their default placed-only response; do not globally change that behavior. Resolve caller/project authorization before foreign membership/reference data; existing delete guards remain intact and no delete tool is added. |
| §15 `:1038`–1082 | Preserve exact per-form inline-block baseline policy, final normalization/flush validation and full rollback. New agent shared changes additionally protect every affected form; do not globally change the existing shared-only/import/copy exclusions. |

### Horizontal-block acceptance details

From §15 `:1048`–1055:

- Count contiguous truthy/nonzero inline markers in actual `(order_index, numeric id)` order. Disabled label/log rows are separators; ordinary two-column sections do not count.
- Accept `after_count <= max(1, before_count)`. Capture the current baseline at each edit, not a historical maximum; a repaired legacy form cannot grow back to the old count.
- Preserve noncanonical markers where the existing API promises snapshot compatibility; do not silently migrate/repair legacy rows or claim renderer parity for noncanonical values.
- Normalize, flush and validate the final state inside the owning transaction; services do not independently commit.
- Existing plain deletion, shared-definition-only updates, imports and whole-form/project copies retain their own behavior. The new agent's stronger all-reference shared-approval command is a scoped new boundary, not an ORM-wide guard.
- Violations retain the established Chinese business detail. Keep `backend/tests/fixtures/inline_table_block_cases.json` authoritative rather than reproducing another policy implementation.

## Verification Meaning

This file addresses context-size and contract-navigation correctness only. It does not demonstrate passing application tests, SDK installation, browser behavior, authorization enforcement or an independent review. Both implementation and review must inspect original applicable source ranges and actual changed/new files before making those claims.
