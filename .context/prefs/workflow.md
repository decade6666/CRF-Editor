# Development Workflow Rules

> This file defines mandatory rules for the LLM development workflow.
> All LLM tools must follow these rules while executing tasks, and must not skip key validation steps.

## Full Flow (MUST follow, no exceptions)

### feat (new feature)

1. Understand the requirement and impact scope; read the root-level and module-level `CLAUDE.md` first.
2. Search existing implementations and prefer reusing existing router / service / composable / test patterns.
3. Write a failing test first (RED) and confirm the new behavior is not implemented yet.
4. Write the minimal implementation (GREEN), avoiding opportunistic unrelated refactoring.
5. Add necessary regression tests and make them pass together.
6. If the change affects entry points, commands, contracts, or user-visible behavior, update documentation in sync.
7. For code changes over 30 lines, perform additional quality validation and change review.

### fix (bug fix)

1. Reproduce the issue and confirm symptoms and impact scope.
2. Locate the root cause; when needed, inspect along the `router -> service/repository -> model/schema` chain or the `App/component -> composable -> API` chain.
3. Write a failing test first (RED).
4. Fix the code while keeping the change minimal.
5. Run targeted tests and related regressions; confirm they turn green (GREEN).
6. If the fix touches key paths such as authentication, permissions, import/export, column widths, or project isolation, add dedicated regressions.

### refactor

1. Ensure existing tests pass first.
2. Refactor in small steps, and every step should be verifiable.
3. Do not change external behavior or bundle functional changes into the refactor.
4. After refactoring, rerun related tests and check for security or contract regressions.

## Verification Rules

- Backend changes must run at least the corresponding `pytest` cases.
- Frontend changes must run at least the corresponding `node --test` cases; if UI behavior is involved, prefer launching the app and validating the main path manually.
- New features / bug fixes target at least 80% coverage.
- When a single change exceeds 30 lines, prefer running `/verify-change` and `/verify-quality`.
- For security-sensitive changes involving authentication, authorization, input validation, import/export, secrets, uploads, and similar areas, run `/verify-security`.

## PR Rules

- PRs are written for project maintainers. Titles may keep the Conventional Commits format, and the PR body must be in Chinese.
- The PR description must include: summary, changes, test plan, and follow-ups; the test plan must list commands run and pass/fail status.
- Keep `🤖 Generated with [Claude Code](https://claude.com/claude-code)` at the end of the PR body.

## Context Logging (decision records)

When making any of the following decisions, MUST append to `.context/current/branches/<current-branch>/session.log`:

1. **Solution choice**: when choosing A instead of B, record the reason.
2. **Bug discovery and fix**: record symptoms, root cause, fix approach, and lessons learned.
3. **API / architecture decision**: interface design, directory responsibilities, cross-stack contract adjustments.
4. **Rejected approach**: why it was rejected.
5. **Context correction**: when `.context/prefs`, documentation indexes, or project context are found inconsistent with the real code.

Append format:

```
## <ISO-8601 time>
**Decision**: <what you chose>
**Alternatives**: <rejected options>
**Reason**: <why>
**Risk**: <potential risks>
```
