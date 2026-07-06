# Implementation Plan: Migrate Trellis to v0.6.5

## Checklist

1. Review current migration diff and task artifacts.
2. Activate the Trellis task with `task.py start`.
3. Run migration/update validation:
   - check Trellis version file
   - run `trellis update` after current migration state
   - scan for retired command references
   - scan for bare `implement` / `check` / `research` sub-agent references
   - scan for removed Multi-Agent Pipeline dependencies
4. Inspect any remaining anomalous diffs, especially files that should have been deleted but are only modified.
5. Run targeted workflow validation:
   - `python3 ./.trellis/scripts/task.py validate <task-dir>`
   - `python3 ./.trellis/scripts/task.py current`
   - import/compile checks for changed Python scripts where practical
6. Update `prd.md` status checkboxes with evidence.
7. If validation passes, report migration status and remaining risks. Do not commit unless explicitly requested.

## Validation Commands

```bash
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-02-migrate-to-0.6.5
python3 ./.trellis/scripts/task.py start .trellis/tasks/07-02-migrate-to-0.6.5
trellis update
python3 -m py_compile <changed-trellis-python-files>
```

## Review Gates

- Do not accept migration if `trellis update` still proposes additional required migration actions.
- Do not accept migration if current hooks reference removed scripts such as `ralph-loop.py` or `.trellis/scripts/multi_agent/*`.
- Do not accept migration if active task context manifests reference removed skill/agent paths.

## Rollback Points

- Before any commit, the migration can be reviewed and reverted by path from Git.
- Avoid `git reset --hard` or `git clean` unless the user explicitly confirms destructive cleanup.
