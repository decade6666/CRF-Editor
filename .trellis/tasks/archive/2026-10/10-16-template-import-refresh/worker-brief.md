Active task: .trellis/tasks/10-16-template-import-refresh

You are the single Sonnet implementation worker requested by the user. Work only in `/home/decade/crf-editor-template-import-refresh`, branch `fix/template-import-refresh`. The main dispatcher already obtained explicit user approval for task creation/planning, implementation by Sonnet, immediately displaying the first newly imported template form, and the additive `imported_form_ids` response field. Do not ask those questions again or create another task. The dispatcher will activate this existing task before sending this brief.

Read context in order: `implement.jsonl` (all listed specs/research), `prd.md`, `design.md`, `implement.md`, then relevant root/module instructions and `.context/prefs/`. Load `trellis-before-dev` and follow TDD. Read the current task status and current branch before production edits.

Deliver the complete bounded implementation, tests, and minimal docs from the approved plan. Existing source already clears caches and broadcasts refresh; the missing handoff is authoritative created ids -> existing designer selection bridge -> actual new-form preview. Do not add another redundant refresh as the whole fix.

Important safety trap to reproduce: `FormDesignerTab`'s refresh watcher reloads `formFields` independently of `selectForm`'s draft/dirty guards. An early broadcast can erase local work before a canceled switch. Preserve local work and existing busy/history/reorder semantics with the smallest direct task-related change. Do not force refs/remounts or duplicate guard logic.

Exclusive writer scope is exactly the implementation/test/docs files enumerated in `design.md`, plus task-local `verification.md` and the task branch's `.context/.../session.log` if root-cause decisions need logging. Do not edit `prd.md`, `design.md`, `implement.md`, manifests, research, `worker-brief.md`, global rules, runtime configuration, or unrelated files. If a different production file is actually necessary, report a concrete dependency before expanding. The main session will not write your slice concurrently.

Execution expectations:
1. Write and run meaningful backend + frontend regressions RED before production changes. Real rendered title/field assertions must prove the handoff; a stub-call assertion alone is insufficient. Exercise HTTP serialization, actual target-project ids, multi/empty/collision cases, and guard/error/project-race/legacy cases from the PRD.
2. Implement minimally, run GREEN and relevant regressions, inspect the actual diff, then run broader suites/lint/build and coverage with existing tools. No dependency/package-lock/build-script/test-runner changes. `npm ci` inside this fresh worktree is allowed as existing dependency installation, not dependency expansion.
3. Use `/home/decade/.venvs/crf-editor/bin/python` (verified Python 3.10.21), explicit absolute `cd` in EVERY shell command, hermetic pytest fixtures, and locally-scoped proxy unsetting. A temporary `/tmp` shell runner is allowed when inline env guards require it. No `|| true` to hide errors. Do not run repository-wide formatters.
4. Run an import-security review. Check required import/export sync sites in the project AI guide for actual impact, but do not rewrite unrelated consumers.
5. Browser validation is required if feasible, using only synthetic/isolated data. Do NOT inspect a real database/config/credential, generate new throwaway credentials without formal user approval, or replace the existing running local-user service. If tools/login prevent live validation, report the blocker and exactly what alternative was verified; do not claim browser E2E based on happy-dom alone.
6. Update only bounded docs/index for user-visible behavior and additive response. Record all commands, RED/GREEN failures/passes, skipped/environment-blocked checks, coverage measurements/limits, security review, and exact changed-file inventory in `verification.md`.
7. Send concise progress and final results back on this channel. Final output should distinguish implementation status from independent main-session acceptance.

Forbidden: git commit/push/merge/rebase/reset/clean; deletion of files/branches/worktrees; deployment; external publication; real credential/private-data access; new secrets; changing gateway/provider/model settings; subdelegation; expanding dependencies or build/release workflows. Do not auto-fix unrelated issues. No independent worker may write concurrently.

After finishing, leave the worktree recoverable with uncommitted changes for the main session's actual-diff review. You may self-review, but do not label it independent review. Use Chinese for channel progress/final summaries; code/project conventions and LLM-facing notes remain as established.
