# Verification Record — designer-reference-preservation

All numbers below were produced on the task worktree `/home/decade/CRF-Editor-designer-reference-preservation` (branch `fix/designer-reference-preservation`, fast-forwarded to `main@e591f83` before finalization) and re-run by the lead on the frozen merged tree. Backend production code was untouched by design; the backend suite was re-run after merging `main` (which carried backend work from other tasks).

## Final merged-tree gates (2026-10-10, working tree == HEAD for all involved files)

| Item | Result |
|---|---|
| node:test (`node --test tests/*.test.js`) | **922 passed / 0 failed** (pre-merge branch: 893; main added 29 reference-delete tests, disjoint files) |
| vitest mount tests (`npm run test:component`) | **11 passed (4 files)** |
| Lint (`npm run lint`) | **0 errors** (3679 prettier-style warnings, pre-existing class) |
| Build (`npm run build`) | **success** |
| Coverage (baseline command from `research/verification-baseline.md`, re-run on final tree) | `fieldDefinitionAutocomplete.js` **100.00** line / 85.37 branch; `formDesignerPropertyEditor.js` **98.09** line / 84.83 branch (baselines 95.20 / 97.40, not lowered) |
| Backend full suite (post-merge; untouched by this task) | **1098 passed** (46.8s, hermetic conftest) |
| Targeted backend sanity | `test_field_profile.py` 26 passed (pre-merge run) |

## Browser evidence (throwaway db :8906, re-run on the final tree, cleaned up)

- Pick LIB after 标签字号 大 → the size stays 大; a default-size field keeps showing 默认.
- Pure rebind + style save → **no impact dialog**, zero confirm; persists `binding=1` / `fontSize=large`; the shared definition untouched (defCount 2).
- Genuine shared rename → dialog lists 表单A / 表单B; 取消 writes nothing; 确定 propagates; undo restores 血压 with the binding intact; redo keeps the same definition id (no duplicate definition).
- First implementation round (pre-review) additionally covered: draft pick keeps 大 with no `definition_operation` in the body; presentation-only `none` + `keep`; R5 candidate threshold listing 表单A; label switch forks without confirm; `日期` empty-format candidate produces no phantom update.
- All throwaway processes (backend PIDs, chrome) stopped; `/tmp` scratch dirs removed; ports 8906/9222 closed.

## Review rounds

- Implementation review (3 read-only reviewers, findings cross-verified) accepted: frozen `commandArgs`/`candidateBeforePayload`, save-in-flight mutex across all conflicting entries (candidate pick, same-row re-click, delete, batch delete, copy, quick edit, inline toggle, reorder drag + keyboard, add-log-row, form switch, designer leave), structural-key propagation through `buildDefinitionPayloadFromTarget` (shared update / OID fork / draft fork / fork-redo with `remapId`), `DRAFT_DEFINITION_DIFF_KEYS` derived from payload keys, `help_text` in history snapshots, `definitionUpdated` fail-closed, date-clear watch normalization, unconditional post-save editor rebuild (`selectField(fresh, { fromSave: true })`), reload-failure fallback from the endpoint's `form_field`. Two intermediate self-changes were reverted: swallowing reload failures in `replayBindingProfile` (double-undo risk) and suppressing same-row re-click re-hydration (covered by the entry guard).
- Review v4: `snapshotFieldPropState.fd` derived from the exported `DEFINITION_PAYLOAD_KEYS`. A proposed confirmation-threshold switch (row count vs distinct-form count) was retracted after live verification proved `uq_form_field (form_id, field_definition_id)` (database.py:940) makes a same-form double binding impossible; `countDistinctForms` is exact.
- Final read-only Haiku review of the frontend diff: see the session log entry; no accepted findings outstanding in-tree.

## Known limitations (documented in prd.md)

- Concurrent same-owner `update_shared` is last-writer-wins (no version column; pre-existing platform limitation).
- Legacy rows with type-inapplicable stale FKs or non-canonical stored date formats are healed only by a definitional-key edit, not by a presentation-only none-save.
- No history entry is recorded when the saved row vanishes between PUT and post-save snapshot (concurrent delete); a half-broken undo entry would be worse.
- FieldsTab keeps its own distinct-forms impact check (duplication documented).

## Not run

- No browser run was repeated after the last doc-only/AC-checkbox edits (code frozen since the browser re-run; the two edits were `prd.md` acceptance markers and changelog/spec text).
