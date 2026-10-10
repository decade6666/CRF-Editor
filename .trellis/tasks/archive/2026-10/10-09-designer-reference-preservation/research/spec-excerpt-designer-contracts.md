# Spec excerpt: designer label-OID and autocomplete contracts

> Verbatim copy of `.trellis/spec/frontend/component-guidelines.md` lines 1050-1117 at `bfbd00d` (the full file is ~50 KB and exceeds the 32 KB context-injection limit, which would truncate these sections). Phase 3.3 must edit the original file, not this excerpt. Planned additions: in "Field-Library Autocomplete Candidates" add rows that a pick replaces only the 9 editable definition keys while instance values (incl. the `default` font sentinel and pending edits) are kept and type-normalized; and that persisted/draft saves write `update_shared` only on a normalized 9-key diff, with the impact target derived from the same command. Row 1071 (placeholder-OID field switched to `标签` converts in place via `update_shared`) must stay true: the `field_type` change is a genuine diff.

## Scenario: FormDesignerTab Label OID Is System-Managed

### 1. Scope / Trigger

- Trigger: changing label (`标签`) field handling in
  `frontend/src/components/FormDesignerTab.vue` or the label OID helpers in
  `frontend/src/composables/formDesignerPropertyEditor.js`.
- A label's `variable_name` is a system placeholder, never user input: labels
  are hidden from the field library, yet `FieldDefinition` enforces a
  project-wide unique `variable_name`, so a user OID kept on a label blocks
  that OID invisibly.

### 2. Contracts

| Rule | Why |
|---|---|
| The designer type selector is controlled (`:model-value` + `@update:model-value="onDesignerFieldTypeChange"`); the OID transition runs only in that handler | Hydration (`selectField`), candidate picks, and editor resets assign `editProp` directly and must never run the label transition |
| `selectField` and `resetFieldPropAutoSaveState` rebuild `labelOidSession = buildLabelOidSession(...)` on every (re)selection; `selectField` seeds via `resolveLabelOidSeedDefinition(ff)`; `selectAutocompleteCandidate` never assigns the session | The seed comes only from the definition the field was loaded with (a label, or a system-placeholder OID), never from the live editor OID — otherwise a picked library candidate would be re-bound and silently converted into a hidden label |
| Drafts carry a creation-time `__labelOidSeed` (`{ variable_name, field_type }`): `newField` wraps its draft in `withLabelOidSeed`, `buildCopyDraft` builds the same object inline (its test harness evaluates it with a fixed set of injected identifiers); only `__draft === true` rows use the seed | `applyEditorToDraft` mirrors the editor (including a picked candidate's OID) into the draft's `field_definition`, so re-selecting a draft must not seed from it |
| Entering `标签` remembers the current OID and swaps in the session label OID (generating one on first use); leaving restores the remembered value (including `''`) | `文本 → 标签 → 文本` round-trips the typed OID; user OIDs never reach a label payload |
| `saveSelectedFieldProp` and `saveDraftField` run `ensureLabelVariableName` for labels before building the request; non-label drafts fail fast with `OID_ERROR` | Historical empty/invalid label OIDs must not block saving; non-label OID validation stays client-side |
| A loaded user-OID field switched to `标签` forks via `create_or_restore`; a loaded placeholder-OID field converts in place via `update_shared` | A named library definition must not silently become a hidden label; forking placeholder conversions would litter the library with orphan definitions |

### 3. Validation

- `frontend/tests/designerLabelOid.test.js` locks the pure helpers, the
  `buildBindingProfileCommand` routing (round trip / in-place / fork /
  no-candidate-rebind), and the component wiring (controlled select, session
  resets, save guards), plus the draft seed snapshot (`withLabelOidSeed`,
  `resolveLabelOidSeedDefinition`, the `newField` / `buildCopyDraft` seeds),
  the draft re-selection flow after a candidate pick, and the guard that
  `selectAutocompleteCandidate` never assigns `labelOidSession`.
- The placeholder prefix `^FIELD_\d{14}_[A-Z0-9]{6}` is a cross-stack contract
  with `backend/src/database.py::_LABEL_PLACEHOLDER_RE`; see
  `.trellis/spec/guides/cross-stack-contracts.md` §10.

## Scenario: FormDesignerTab Field-Library Autocomplete Candidates

### 1. Scope / Trigger

- Trigger: changing the OID / 字段标签 `el-autocomplete` pair in
  `frontend/src/components/FormDesignerTab.vue` or
  `buildAutocompleteCandidates` in
  `frontend/src/composables/fieldDefinitionAutocomplete.js`.
- Both inputs share one candidate list; Element Plus writes
  `item[valueKey]` (default `value`) back into `v-model` and emits `input`
  before it emits `select`, so the item shape decides what a pick does to the
  input text.

### 2. Contracts

| Rule | Why |
|---|---|
| Every candidate carries `value` equal to the raw (untrimmed) keyword string | `el-autocomplete` writes `item[valueKey]` into `v-model` before `select`; echoing the typed text keeps a rejected 「已添加」 pick from emptying the input, and a string value satisfies the emit validators (`undefined` triggers "Invalid event arguments" warnings) |
| Neither designer `el-autocomplete` sets `value-key` | The default `valueKey='value'` is what the echo relies on; an override would reintroduce `undefined` writes |
| Every `CANDIDATE_STATE_*` identifier referenced in `FormDesignerTab.vue` is imported from `fieldDefinitionAutocomplete` | An unimported constant makes the 「当前字段」/「已添加」 badge silently not render (Vue only logs a render warning) |
| 「已添加」 candidates keep `selectable: false` and `selectAutocompleteCandidate` returns early for them | The definition is already on this form; the pick must leave input text and editor state untouched |
| Selectable candidates rehydrate the editor (`hydrateEditorFromCandidate`), overwriting the echoed text | Picking a definition means binding it, not keeping what was typed |
| Empty and whitespace-only keywords return `[]` | No candidates on empty input (matching uses the trimmed query, the echo uses the raw keyword) |

### 3. Validation

- `frontend/tests/fieldDefinitionAutocomplete.test.js` locks the `value` echo
  across the current / added / plain states, the empty and whitespace-only
  keyword behavior, and (source guard) that every `CANDIDATE_STATE_*`
  referenced in `FormDesignerTab.vue` is imported from the composable and that
  neither designer `el-autocomplete` sets `value-key`.
