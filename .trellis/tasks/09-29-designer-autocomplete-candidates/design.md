# Design

## Changes

1. `frontend/src/composables/fieldDefinitionAutocomplete.js`: each candidate returned by `buildAutocompleteCandidates` gains `value: String(keyword ?? '')`, the raw keyword without trimming. Document it in the module header. `el-autocomplete` writes `item[valueKey]` (default `value`) back into `v-model` before it emits `select`, so echoing the typed text means a pick never changes the input by itself. `selectAutocompleteCandidate` still rejects 「已添加」 candidates and rehydrates selectable ones, which overwrites the echoed text.
2. `frontend/src/components/FormDesignerTab.vue`: import `CANDIDATE_STATE_CURRENT` next to `CANDIDATE_STATE_ADDED`. No template or handler change.

## Rejected

- Replacing `v-model` with a handler that ignores non-string values: Vue validates the emit before the handler runs, so the warnings would remain.
- Trimming the echoed value: it would alter what the user typed.
- Hiding 「已添加」 candidates: they are shown on purpose, to tell the user the definition is already on this form.
- Adding `value` inside the component's `fetchFieldDefSuggestions`: it would work, but it could only be tested at source level. The pure composable can be unit-tested.

## Known Edge (accepted)

Suggestions are fetched with a debounce. If the user clicks a 「已添加」 item from a list fetched for an older keyword, the input reverts to that older keyword. Selectable picks are unaffected because hydration overwrites the text.

## Tests

- `frontend/tests/fieldDefinitionAutocomplete.test.js`: `value` echoes the raw keyword for all three states; the empty-keyword case is unchanged.
- A source guard, in the most fitting existing wiring test or a new small test file: every `CANDIDATE_STATE_*` identifier used in `FormDesignerTab.vue` is imported, and neither designer `el-autocomplete` sets `value-key`.

## Spec

Add a short "FormDesignerTab Field-Library Autocomplete Candidates" scenario to `.trellis/spec/frontend/component-guidelines.md` covering the `value` echo contract, the 「当前字段」 / 「已添加」 states, and the tests that lock them.
