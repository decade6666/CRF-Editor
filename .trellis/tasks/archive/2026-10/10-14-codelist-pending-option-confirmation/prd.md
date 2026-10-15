# Confirm Pending Codelist Option Before Saving

## Goal and Authorization

Prevent a typed option label from being silently omitted when the user clicks the codelist dialog's final confirmation without first clicking the option-row `添加` button.

The user requested an implementation plan for later execution and approved creating this Trellis task. This session is planning-only: do not modify application code, run `task.py start`, dispatch an implementer, commit, merge, or push. Task status remains `planning` until the plan is reviewed and implementation is authorized.

## Background and Confirmed Evidence

Baseline: `6d9f377` on `main`, inspected on 2026-10-14.

- The screenshot corresponds to the shared `CodelistQuickEditDialog.vue`, not the standalone option-maintenance dialog in `CodelistsTab.vue`. The title and input/footer structure match `frontend/src/components/CodelistQuickEditDialog.vue:35`, `:269`, and `:280`; the two consumers are documented in `frontend/.claude/CLAUDE.md:59` and wired at `frontend/src/components/FieldsTab.vue:363` / `:372` and `frontend/src/components/FormDesignerTab.vue:4030` / `:4041`.
- `addOptRow()` is currently the only operation that transfers the pending input (`optCode`, `optDecode`) into `opts`. It trims the label, provides a fallback `C.<n>` code, appends a local row, and clears the label (`frontend/src/components/CodelistQuickEditDialog.vue:74`).
- Final confirmation calls `confirmAdd()` or `confirmSave()` directly; both validate and submit only `opts`, so a populated `optDecode` is absent from the request (`frontend/src/components/CodelistQuickEditDialog.vue:115`, `:145`, `:188`, `:235`). Existing component tests submit a newly typed option only after `addOptionRow()` explicitly clicks `添加` (`frontend/tests/component/CodelistQuickEditDialog.spec.js:50`, `:63`). This is a source-level finding; no live-browser reproduction has been run in this planning phase.
- Successful save ordering, reference-impact confirmation, dual cache invalidation, and host refresh already have regression coverage in `frontend/tests/component/CodelistQuickEditDialog.spec.js:63`, `:159`, `:217`, and `:261`. The new behavior must preserve these contracts.

## Requirements

- **R1 — Trigger:** In the shared add/edit codelist dialog, final confirmation detects a pending label whose trimmed text is non-empty. Empty or whitespace-only labels do not trigger the reminder. A default/generated or manually edited code by itself is not pending option content.
- **R2 — User decision:** Show a reminder with actions `添加并保存` and `返回编辑`. Accepting adds the pending option locally once, then saves the complete codelist through the existing add/edit path. Selecting `返回编辑`, closing the reminder, or dismissing it with Escape leaves the original dialog open, preserves all entered content, and performs no save. The user approved the return-to-edit policy on 2026-10-14. There is no discard-and-save action.
- **R3 — Compatibility:** Preserve option-code free text, trimming/fallback behavior, append order, name/row validation, reference-impact confirmation, request endpoints, both cache invalidations, `afterChange`, success-message order, and existing add/edit failure behavior. A reminder rejection is an ordinary user decision, not an error toast or a failed-save refresh.
- **R4 — Scope and presentation:** Use the shared dialog so FieldsTab and FormDesignerTab receive the behavior in both add and edit modes, including hidden-code configurations. Keep the existing layout and the footer button text `确定`. Present reminder content as plain text, not executable HTML.
- **R5 — Single operation and context:** An unresolved reminder must not allow repeated final confirmations to create multiple reminders, rows, or requests. Cancel/dismiss releases the operation guard. If the dialog closes/reopens or its project/mode/codelist target changes while awaiting the reminder, the expired decision must not append to the new draft or submit against the new context.

## Acceptance Criteria

| ID | Requirements | Observable result |
| --- | --- | --- |
| AC1 | R1, R2 | With a valid codelist draft and pending label `其他`, clicking `确定` opens the reminder before reference lookup or a write. The prompt shows `添加并保存` and `返回编辑`. |
| AC2 | R2, R3 | Accepting includes the trimmed pending label exactly once in the existing add/edit request, after the existing rows. Explicit codes remain free text; a blank code uses the same `C.<n>` fallback as manual addition. |
| AC3 | R1, R3 | Empty/whitespace-only labels and code-only input keep the existing direct-save flow and create no extra option or reminder. |
| AC4 | R1, R3 | Clicking `添加` first clears the pending label; subsequent `确定` creates no reminder or duplicate. After accepting a pending row and then canceling the existing reference-impact confirmation, retrying does not append it twice. |
| AC5 | R2, R3 | Returning to edit or dismissing the reminder preserves the label/code/name/description/rows, keeps the dialog open, and makes no reference lookup, write, cache invalidation, host callback, or error/success toast. |
| AC6 | R3 | Existing validation warnings still prevent writes. In edit mode, accepting the pending-option reminder does not bypass the subsequent reference-impact confirmation. Existing add/edit success and failure regressions stay green. |
| AC7 | R5 | A deferred reminder plus repeated confirmation opens only one reminder; accepting yields one appended row and one write. After cancel/dismiss, a later confirmation can proceed normally. |
| AC8 | R5 | Closing/reopening or changing project/mode/codelist while the reminder is deferred makes the old result inert: no new-draft mutation, wrong-target request, callback, or success toast. |
| AC9 | R4 | Shared component tests cover add/edit and both host-style configurations; host source-wiring regressions remain green. A real-browser check, when an authorized local environment is available, verifies the screenshot flow and both actions; blocked checks are reported as not run. |
| AC10 | R4 | Reminder content uses text rendering with no HTML-execution option. Chinese text, button focus/keyboard use, and light/dark theme remain usable without redesign. |

## Out of Scope

- Backend/API/schema/database changes, option uniqueness policy, OID validation of option codes, and code-generation redesign.
- General dirty-close warnings, autosave, Enter-to-add shortcuts, or layout/theme redesign.
- Standalone option management in CodelistsTab and unrelated dialogs.
- New dependencies, test runners, build scripts, or release-process changes without separate approval.
- Implementation or publication during this planning session.

## Planning State

The product decision is resolved. Implementation awaits review of this document and `implement.md`, followed by explicit authorization in the future execution session. No remaining blocking product questions are known.
