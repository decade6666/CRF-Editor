# feat/settings-dialog-layout — Decision Snapshot

> Source: `.context/current/branches/feat/settings-dialog-layout/session.log`, captured during the user-authorized 2026-11-10 wrap-up. Entries below preserve the original decision chronology, including then-pending review and deployment states. Final verification and user acceptance are recorded in `.trellis/tasks/archive/2026-11/11-10-settings-dialog-layout/verification.md`; the narrative index is `claudemd-changelog.md`.

## 2026-11-10T11:17:21+08:00
**Decision**: Keep this task lightweight and presentation-only. Combine Ref A's flat cards/segmented controls/data verb rows with Ref B's project-data grouping and sun/moon icons. User-confirmed cards are 账号 / 界面 / 项目与数据; logout sits at the end of the account row; mode copy becomes 基础 / 完全; theme remains 浅色 / 深色. Final consolidated PRD is pending implementation approval.
**Alternatives**: Full Gemini glass/gradient design; project context in the account card; footer logout; a third follow-system theme option; extracting settings or changing backend logic.
**Reason**: The confirmed combination fits the existing visual system, places context next to dependent actions and removes redundant UI without adding capabilities. The user explicitly chose project-data grouping, user-row logout and no follow-system feature.
**Risk**: Logout remains immediate and now neighbours password change; use red text and separation without changing its handler. Preserve role/no-project guards and Agent lazy-sibling lifecycle. Validate actual dialog width, scrolling, header × close, keyboard use and both themes in the authorized fresh disposable environment, never on 8888. Keep implementation and tests untouched until PRD approval.

## 2026-11-10T11:17:21+08:00
**Decision**: Replace the oversized component-spec entry in both task context manifests with a bounded task-local excerpt that links exact source sections; leave the shared spec and injection settings unchanged.
**Alternatives**: Ignore the 98,619-byte spec truncation warning, raise injection limits, or duplicate the entire guide.
**Reason**: task.py validate showed the shared component guide exceeds the 32,768-byte injection ceiling. A narrow source-linked excerpt preserves this task's actual dialog/accessibility/lifecycle contracts without losing content to truncation or changing project infrastructure.
**Risk**: The excerpt is task-local guidance, not a new authoritative spec. Consult the original referenced sections for any question beyond it.

## 2026-11-10T12:51:46+08:00
**Decision**: Keep all original business script text unchanged; implement only the confirmed settings markup, existing boolean controls, icon imports and local styles. Use an instance-specific public width plus root/body flex-scroll rules; preserve the existing Agent sibling/watch contract and role/project disabled conditions.
**Alternatives**: Extract settings/state into new files, introduce string-valued mode/theme storage, restyle the global palette, or change backend/auth/import algorithms.
**Reason**: The existing implementation already supplies the needed behaviour. Browser measurements confirmed 560/366/296px widths, safe long-name wrapping, keyboard focus, real header close with Agent unmount and reachable admin footer in a 390×320 viewport. Script normalization against the task base proved byte equality for existing behaviour.
**Risk**: Logout is still immediate; regular users now rely on header ×/Escape, verified separately from happy-dom public-model close tests. The first full concurrent test run failed in unchanged designer suites; isolated and later standalone full runs passed, but no root-cause fix is claimed. Preserve that failed evidence and the 2814-warning backlog rather than weakening tests or formatting unrelated files.

## 2026-11-10T12:51:46+08:00
**Decision**: Add meaningful missing admin-close, safe-username and real template-tree import regressions to retain and improve all App coverage metrics; make only the one necessary Agent source-locator whitespace adjustment. Record the new presentation contract in the existing frontend spec, not the cross-stack API bodies.
**Alternatives**: Lower coverage requirements, exclude template code, stub tested behaviour, or broaden production changes for coverage.
**Reason**: Final App-only statements/branches/functions/lines are 97.19/94.29/98.53/98.33%, above the comparable baseline. Full frontend regression passed 1081 source + 359 mount cases. No dependency, timeout, runner or backend change was needed.
**Risk**: App.vue remains over the file-size review threshold by the explicitly approved no-extraction scope. Coverage is scoped to App.vue, not an aggregate frontend figure. Independent review has not yet returned a usable report and is not counted as an independent PASS.

## 2026-11-10T13:17:33+08:00
**Decision**: Following the user's explicit rebuild/restart request, deploy only the rebuilt worktree frontend/dist to the existing crf-editor service's ignored static directory, back up its old static tree outside Git, copy assets before replacing index and retain old asset files. Restart the existing systemd unit without changing its configuration.
**Alternatives**: Commit/merge before acceptance, copy tracked sources onto main, redirect the service to a worktree, change systemd/environment/database settings or launch another listener.
**Reason**: Live systemctl and HTTP-index comparison confirm the service uses /home/decade/CRF-Editor/frontend/dist; the only main-to-task production-source difference is App.vue. The user authorized browser acceptance deployment, not commits or merging. Fresh build succeeded with the same reviewed index-B9ERgT1W.js entry.
**Risk**: Restart causes a brief interruption. Keep an external /tmp/crf-settings-deploy-20261110-131733/previous-dist rollback copy and old hashed chunks for cached clients; verify HTTP asset bytes and service state after restarting. Do not read private configuration/credentials or directly operate on the database; no tracked main sources are changed.

## 2026-11-10T14:10:38+08:00
**Decision**: After user browser acceptance and explicit commit/finish authorization, group the product code/tests/docs, standalone frontend spec and standalone context evidence into separate work commits, then archive the current task and record its journal before main merge/push/task-worktree cleanup under the existing section 8 pipeline.
**Alternatives**: Archive with uncommitted product files, mix Trellis bookkeeping with product code, stop at a code commit, or include unrelated planning tasks/worktrees. Rejected.
**Reason**: User confirmed 「没有问题了，收尾」 and then 「提交，然后收尾」. Current dirty paths match this session's inventory; main is still 5e17486. An independent reviewer has now delivered no blocking findings for its reviewed snapshot. A fresh pre-commit check passed all 37 source wiring cases and 107 affected mounts, without source changes since full regression.
**Risk**: The final HTML-literal username test is outside the independent review snapshot but is covered by main review and passing tests. Static deployment succeeded with HTTP/byte identity; sudo restart failed for lack of authentication and is not claimed complete. Preserve external backup/screenshots/failed-run logs and all unrelated worktrees. Do not bypass hooks, amend history, force-push, retry sudo through another route or alter private configuration/database state.
