# Existing dependency audit — execution prerequisite

## Finding and verification

On 2026-10-26, A ran approved `npm ci` in the task worktree. Installation succeeded, but npm reported 14 existing vulnerable dependency entries and transitive engine warnings. A paused dispatch and invoked `security-review`, then performed a bounded structured `npm audit --json` triage.

- Audit exit **1** (not clean): **0 critical, 12 high, 1 moderate, 1 low**.
- Verification command: A used Python subprocess to invoke `npm audit --json`, print severity/direct/dev-only/advisory summaries, and propagate the actual audit exit status. No failure was hidden.
- `git diff --quiet HEAD -- frontend/package.json frontend/package-lock.json` passed: dependency manifests are unchanged. These findings come from the existing lockfile, not newly added dependencies.
- Runtime-marked/transitive entries include Vue/server-renderer, lodash/lodash-es, nanoid, PostCSS and source-map-js. Some are bundled tooling transitive dependencies; `dev_only=false` alone is **not** proof that an affected operation is reachable in the deployed app.
- Development/test entries include Vite, happy-dom, brace-expansion, flatted, js-yaml and selector tooling; esbuild's reported issue is low. No claim of complete exploitability/reachability analysis is made.
- Node is `v24.14.1`; installed transitive `abbrev@5`/`nopt@10` advertise `^24.15.0` (or other supported major versions). Installation succeeded with warnings; actual test/build execution will determine whether this is a blocker. Do not silently upgrade Node/dependencies.

## Response and boundaries

- There are no reported Critical findings requiring a Critical-first fix before continuing under project rules. Existing High findings remain unresolved and must be disclosed in the final report; the dependency audit must never be described as passing/clean.
- Continue only the approved isolated development/test task, using trusted repository fixtures and disposable local data. No production deployment, exposed dev server, existing production credentials/config/data, or externally supplied untrusted documents.
- Do not run `npm audit fix`, `npm update`, change lockfiles/manifests, add tools/plugins, or alter build/release/security configuration. Dependency remediation is a separately authorized task.
- Prefer the built app on an unused loopback-bound test backend for browser validation, not a publicly exposed Vite dev server. Keep temporary test credentials private and outside the repository.
- The new restore API still requires an independent actual-diff security pass after implementation: ownership, bounded schema input, link scoping, no bypass, atomic failure and no private logging. This dependency triage does not substitute for that pass.
