# Thinking Guides

> **Purpose**: Expand your thinking to catch things you might not have considered.

---

## Why Thinking Guides?

**Most bugs and tech debt come from "didn't think of that"**, not from lack of skill:

- Didn't think about what happens at layer boundaries → cross-layer bugs
- Didn't think about code patterns repeating → duplicated code everywhere
- Didn't think about edge cases → runtime errors
- Didn't think about future maintainers → unreadable code

These guides help you **ask the right questions before coding**.

---

## Available Guides

| Guide | Purpose | When to Use |
|-------|---------|-------------|
| [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md) | Identify patterns and reduce duplication | When you notice repeated patterns |
| [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md) | Think through data flow across layers | Features spanning multiple layers |
| [Cross-Stack Contracts](./cross-stack-contracts.md) | Backend-frontend shared contracts | Changing shared constants/fixtures |
| [Git & Tooling Conventions](./git-and-tooling-conventions.md) | PR auto-merge ownership + codeagent-wrapper path | Opening any-branch→main PRs; multi-CLI dispatch |

---

## Quick Reference: Thinking Triggers

### When to Think About Cross-Stack Contracts

- [ ] Changing a constant used in both backend and frontend
- [ ] Modifying shared test fixtures
- [ ] Changing API request/response schema
- [ ] Updating authentication token structure

→ Read [Cross-Stack Contracts](./cross-stack-contracts.md)

### When to Think About Cross-Layer Issues

- [ ] Feature touches 3+ layers (API, Service, Component, Database)
- [ ] Data format changes between layers
- [ ] Multiple consumers need the same data
- [ ] You're not sure where to put some logic

→ Read [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md)

### When to Think About Code Reuse

- [ ] You're writing similar code to something that exists
- [ ] You see the same pattern repeated 3+ times
- [ ] You're adding a new field to multiple places
- [ ] **You're modifying any constant or config**
- [ ] **You're creating a new utility/helper function** ← Search first!

→ Read [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md)

### When to Think About Local vs Shared Config

- [ ] Changing `.gitignore`, IDE settings, AI tool settings, or local harness files
- [ ] A file contains developer-local state, absolute paths, secrets, or per-machine preferences
- [ ] A generated evidence or baseline file changed only because reproducible metadata was refreshed

→ Treat developer-local settings as ignored/local-only; commit only shared configuration or reproducible evidence outputs.

### When to Finish an any-branch → main PR / Dispatch Multi-CLI

- [ ] Opening or updating a PR from any head branch to `main`
- [ ] Tempted to run `gh pr merge` after creating the PR
- [ ] Calling Codex / Antigravity / other backends via `codeagent-wrapper`

→ Read [Git & Tooling Conventions](./git-and-tooling-conventions.md): auto-merge owns the merge after checks; wrapper path is `/usr/bin/codeagent-wrapper`.

---

## Pre-Modification Rule (CRITICAL)

> **Before changing ANY value, ALWAYS search first!**

```bash
# Search for the value you're about to change
grep -r "value_to_change" .
```

This single habit prevents most "forgot to update X" bugs.

---

## How to Use This Directory

1. **Before coding**: Skim the relevant thinking guide
2. **During coding**: If something feels repetitive or complex, check the guides
3. **After bugs**: Add new insights to the relevant guide (learn from mistakes)

---

## Contributing

Found a new "didn't think of that" moment? Add it to the relevant guide.

---

**Core Principle**: 30 minutes of thinking saves 3 hours of debugging.
