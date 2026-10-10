# Planning-turn verification baseline

Date: 2026-10-09. Worktree: `/home/decade/CRF-Editor-designer-reference-preservation`, branch `fix/designer-reference-preservation`, source baseline `bfbd00d`.

## Scope and authorization

The user requested an evidence-backed modification plan, then conversation compaction and execution by Sonnet. They approved creation and persistence of this Trellis planning task. No business code changes, dependency installation, database writes, commit, merge, push, or implementation activation are authorized in this turn.

## Executed checks

### Existing frontend tests without installed packages: PASS

```bash
cd /home/decade/CRF-Editor-designer-reference-preservation/frontend && node --test --test-reporter=dot tests/formDesignerPropertyEditor.runtime.test.js tests/designerNewFieldDraft.test.js tests/fieldProfileCommands.test.js tests/fieldDefinitionAutocomplete.test.js tests/designerLabelOid.test.js
```

Result: exit 0; all dot-reporter cases passed across the five selected files. These are baseline regressions, not new tests proving the reported bug is fixed. Production code remains unchanged.

### Existing history suite: BLOCKED / FAILED TO LOAD

An initial combined run of the five files above plus `tests/designerHistory.test.js` exited 1. A targeted diagnostic confirmed the environment cause:

```bash
cd /home/decade/CRF-Editor-designer-reference-preservation/frontend && node --test --test-reporter=spec tests/designerHistory.test.js
```

Result: exit 1, before test execution:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vue' imported from .../frontend/src/composables/useDesignerHistory.js
Node.js v24.14.1
```

The new worktree does not yet have its npm dependencies installed. Do not weaken tests or claim history validation passed. During authorized implementation, install existing locked dependencies with `npm ci` (no new dependency or package-manifest change), then rerun history and the full frontend suite.

### Read-only behavior reproduction: DEFECTS CONFIRMED

A stdin Node module imported the unmodified `fieldDefinitionAutocomplete.js`, `formDesignerPropertyEditor.js`, and `dateFormatOptions.js` from `frontend/`. Output and interpretation are recorded in `research/root-cause.md` (pending presentation reverts, `'default'` font sentinel becomes `null`, pure rebind and presentation-only saves emit `update_shared`, and the date-format phantom diff). This confirms the defects. It is not a regression test.

### Coverage baseline for the touched composables: MEASURED

```bash
cd /home/decade/CRF-Editor-designer-reference-preservation/frontend && node --experimental-test-coverage --test-coverage-include='src/composables/fieldDefinitionAutocomplete.js' --test-coverage-include='src/composables/formDesignerPropertyEditor.js' --test --test-reporter=spec tests/formDesignerPropertyEditor.runtime.test.js tests/designerNewFieldDraft.test.js tests/fieldProfileCommands.test.js tests/fieldDefinitionAutocomplete.test.js tests/designerLabelOid.test.js
```

Result: 107 tests, 107 pass.

| File | Line % | Branch % | Funcs % |
| --- | --- | --- | --- |
| `fieldDefinitionAutocomplete.js` | 95.20 | 64.86 | 90.91 |
| `formDesignerPropertyEditor.js` | 97.40 | 80.73 | 90.91 |
| All measured | 96.82 | 76.71 | 90.91 |

After the change, rerun the same command with the same file list. Line coverage must not drop, and the new branches must be exercised.

### Delegated investigation status

Two read-only sub-agents were dispatched. The frontend root-cause agent (Sonnet) reported before the user stopped both agents. The backend/spec contract agent (Haiku) was stopped before reporting. The parent session therefore verified the backend schema, service, router, and contract-test facts directly; anchors are in `research/root-cause.md`.

### Task-state check: PASS

```bash
cd /home/decade/CRF-Editor-designer-reference-preservation && python3 ./.trellis/scripts/task.py current --source
```

Result: the session points to `.trellis/tasks/10-09-designer-reference-preservation`. `task.json` remains `planning`; `task.py start` was not run.

## Not run in the planning turn

- New RED/GREEN regression tests or any implementation.
- `npm ci`, full `npm test`, vitest component mount tests, lint, build, coverage measurement.
- Backend pytest suite or any production-data operation.
- Browser/live DOM validation; it belongs to the implementation acceptance gate and must use isolated test data.

Source-level and task-artifact checks do not substitute for the implementation's behavioral tests or live browser validation.
