# Designer field-library autocomplete candidate fixes

## Background

The fullscreen designer's 字段标签 and OID inputs are `el-autocomplete` controls fed by `buildAutocompleteCandidates` (`frontend/src/composables/fieldDefinitionAutocomplete.js`). The PR #87 browser check surfaced two defects that date back to `56f77b3` (2026-08-13):

1. The template compares `item.state === CANDIDATE_STATE_CURRENT`, but `FormDesignerTab.vue` never imports `CANDIDATE_STATE_CURRENT`. The 「当前字段」 badge therefore never renders, and Vue warns `Property "CANDIDATE_STATE_CURRENT" was accessed during render but is not defined on instance`.
2. Candidate items are `{ definition, state, selectable }` with no `value` key. Element Plus 2.13 `el-autocomplete` writes `item[valueKey]` (default `value`) into `v-model` and emits `input` before it emits `select`, so every pick writes `undefined`, and Vue warns `Invalid event arguments: event validation failed for event "input"` and `... "update:modelValue"`. `selectAutocompleteCandidate` then rehydrates the editor for selectable candidates, but it returns early for 「已添加」 candidates, which leaves the label or OID input empty. The composable header states that such candidates are rejected by both keyboard and mouse; today only the editor hydration is rejected.

## Requirements

- The 「当前字段」 badge renders for the selected field's own definition in both autocomplete dropdowns.
- Picking a 「已添加」 candidate (mouse or keyboard) leaves the input text as typed and does not change the editor state.
- Picking a selectable candidate behaves as today: the editor is hydrated from the candidate.
- Picking a candidate produces no Vue warning about `CANDIDATE_STATE_CURRENT` or about invalid `input` / `update:modelValue` event arguments.

## Acceptance Criteria

- [x] Unit test: every candidate carries `value` equal to the raw keyword string (untrimmed) for the current, added, and plain states; an empty or whitespace-only keyword still returns `[]`.
- [x] Source guard: every `CANDIDATE_STATE_*` identifier referenced in `FormDesignerTab.vue` is imported from `fieldDefinitionAutocomplete`, and the designer's autocompletes keep the default `valueKey` (no `value-key` attribute).
- [x] The frontend full suite, lint, and build pass.
- [x] Browser check when the environment allows it: the badge is visible, a 「已添加」 pick keeps the typed text, and the pick logs no console warning. Otherwise the blocker is reported. (Checked on a development build, since production builds strip Vue warnings.)

## Out of Scope

- Disabled styling or a toast for 「已添加」 picks.
- Backend changes. `buildAutocompleteCandidates` has no other consumer.
