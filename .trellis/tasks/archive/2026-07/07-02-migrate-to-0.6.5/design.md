# Design: Migrate Trellis to v0.6.5

## Scope

Upgrade the repository's Trellis installation from v0.4.0-era layout to v0.6.5 while preserving project-specific customizations and keeping CRF-Editor application code unchanged.

## Boundaries

- In scope: Trellis-managed files under `.trellis/`, `.claude/`, `.gemini/`, `.codex/`, `.agents/`, `AGENTS.md`, and task artifacts required to drive this migration.
- Out of scope: backend/frontend CRF application behavior, release packaging, database schema, and product documentation unless the migration changes user-facing workflow commands that must be documented.

## Migration Contracts

1. Retired commands must be removed or replaced:
   - `/record-session` -> `/trellis:finish-work`
   - `/check-cross-layer` -> `/trellis:check`
   - `/parallel` -> platform-native parallel/worktree support
   - `/onboard` -> auto-generated onboarding tasks
   - `/create-command` and `/integrate-skill` removed unless v0.6.5 still ships a supported replacement.
2. Core sub-agents must use prefixed names:
   - `implement` -> `trellis-implement`
   - `check` -> `trellis-check`
   - `research` -> `trellis-research`
3. Removed Multi-Agent Pipeline files must not be depended on by current workflow configuration.
4. Hook and settings updates must preserve local Claude/Codex/Gemini integration semantics.
5. Migration must be verifiable by a clean follow-up `trellis update` and targeted workflow checks.

## Data Flow

`trellis update --migrate` applies template-hash-aware renames/deletes/updates -> repository working tree records changed Trellis files -> validation checks scan for stale command/agent references and missing replacement files -> Trellis task is archived only after workflow checks pass.

## Compatibility

Existing CRF-Editor source code should remain untouched. Existing task files may need refreshed context manifests only if they reference old skill or agent paths.

## Rollback Shape

Before accepting the migration, review `git diff --stat` and targeted file diffs. If migration output is incomplete or unsafe, revert only Trellis-managed paths from Git rather than using destructive clean/reset commands without explicit confirmation.
