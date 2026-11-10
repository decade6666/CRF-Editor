# Settings Dialog Grouped-Card Layout

## Goal

Make settings easy to scan by replacing the cluttered single-column form with three clearly labelled cards. Combine the user's first reference (Ref A: flat bordered cards) with the useful information grouping and theme icons in the Gemini reference (Ref B). This is a presentation change, not a new settings capability.

## Confirmed Decisions and Authorization

- **C1 — Workflow**: the user approved a lightweight Trellis task with PRD-only planning. Implementation requires review of this final PRD and `task.py start`. No commit, merge, push or production deployment is authorized.
- **C2 — Edit-mode copy**: replace 「简要 / 完全」 with 「基础 / 完全」. Explain both modes: 「基础：仅保留浏览与设计入口」 and 「完全：显示全部编辑能力」. Synchronize README terminology.
- **C3 — Browser validation**: the user formally authorized fresh random disposable service/admin/user credentials, a new private `/tmp` test root, an isolated database and a temporary loopback backend. Do not read real credentials or touch the 8888 service/database. Never display credential values. Temporary-resource handling is limited to resources created by this task.
- **C4 — Visual direction**: use Ref A's flat bordered cards and existing application colours, with small section labels above the cards. No glassmorphism, backdrop blur or new gradient background. Preserve app-wide dialog styling.
- **C5 — Grouping**: the user chose 「账号 / 界面 / 项目与数据」, in that order. The current-project row belongs with data actions, not with account information. Both roles share the account-card structure; password-change visibility remains role-specific.
- **C6 — Logout**: the user chose the right end of the user row, after 修改密码, for both roles. Use red text styling and additional spacing from 修改密码. Regular users have no footer; admins retain only 关闭 / 保存 in the footer. Header × remains available to both roles.
- **C7 — Theme scope**: the user declined 「跟随系统」 for this task. Keep only 浅色 / 深色, with sun/moon icons. Header theme-toggle behaviour and saved preferences remain unchanged.

## Reference Evaluation

| Aspect | Adopted | Rationale |
| --- | --- | --- |
| Flat cards and small external section labels | Ref A | Fits the existing design system without a separate glass/dark-theme treatment. |
| 基础 / 完全 segmented selector | Ref A | Both modes permit editing; an on/off switch suggests editing is disabled in the basic mode. |
| Description below its row title, left-aligned | Ref A | Keeps the explanation attached to its subject. |
| Two verb-labelled data rows, with compact object buttons | Ref A | Clear 导出 / 导入 grouping without four competing large icon buttons. |
| Full accessible action names | Ref B's self-describing-action principle | Visible labels stay compact, while assistive technology receives names such as 导出当前项目. |
| Current-project row in 项目与数据 | Ref B, confirmed in C5 | Project context sits immediately above actions that depend on it. |
| Sun/moon icons beside theme options | Ref B | Improves recognition without adding a feature. |
| Initial-letter avatar, with an empty-username fallback | Ref A | Communicates identity better than an always-generic silhouette. |
| Agent entry as an outlined button, without a dropdown chevron | Ref A | It opens the existing dialog, not a menu. |
| Logout in user row; no regular-user footer | Ref A, confirmed in C6 | Consolidates account actions and removes a redundant footer. |
| No follow-system theme option | C7 | Ref B depicts a capability that does not currently exist. |

## Verified Background

Line anchors refer to the unchanged task base `5e17486`.

| ID | Verified fact | Evidence |
| --- | --- | --- |
| E1 | Settings is an inline 560px dialog containing role-gated content inside one form. | `frontend/src/App.vue:1090-1207` |
| E2 | Logout is immediate, with neither confirmation nor a leave guard. | `frontend/src/App.vue:97-101` |
| E3 | Theme stores only `dark` / `light` in `crf_theme`; there is no `prefers-color-scheme` handling. The header has a separate toggle. | `frontend/src/App.vue:721-741`, `:786-790`; `frontend/index.html`; `frontend/tests/component/AppSettingsBehavior.spec.js:224-274` |
| E4 | Boolean `editMode` persists through `crf_edit_mode`. Leaving full mode resets advanced tabs and closes template field search. | `frontend/src/App.vue:183-189`, `:609-611`; `frontend/tests/component/AppWorkspaceBehavior.spec.js:545-566` |
| E5 | Installed Element Plus 2.13.2 includes a segmented control with named radio-group semantics, boolean option values, a custom-content slot and instance-level colour variables. | `frontend/node_modules/element-plus/es/components/segmented/src/segmented.mjs`, `segmented.vue2.mjs`, `frontend/node_modules/element-plus/theme-chalk/el-segmented.css` in the main checkout; installed version matches `frontend/package-lock.json` |
| E6 | The settings entry lazily opens one sibling Agent dialog with a validated project id; context changes unmount it. | `frontend/src/App.vue:561-580`, `:1100-1112`, `:1209-1215`; `.trellis/spec/guides/cross-stack-contracts.md:1157`; `frontend/tests/component/AppAgentAccess.spec.js` |
| E7 | Admins have no self-service password action, project row, edit-mode control or transfer actions; they retain template-path and AI-review configuration, connection testing and 保存. | `frontend/src/App.vue:1097`, `:1100`, `:1113`, `:1124`, `:1131-1181`, `:1203`; `frontend/tests/component/AppSettingsBehavior.spec.js:106-222` |
| E8 | Four test files pin old markup, labels or closure controls and need corresponding updates, not weaker assertions. | `frontend/tests/appSettingsShell.test.js:12-107`; `frontend/tests/component/AppSettingsBehavior.spec.js:238-249`, `:283-287`, `:396`, `:444`; `frontend/tests/component/AppWorkspaceBehavior.spec.js:134-135`, `:706`; `frontend/tests/component/AppAgentAccess.spec.js:63` |
| E9 | The source's only visible 「简要」 is the edit-mode switch. README feature labels are 「简要 / 完全编辑模式」 and "Simple / Complete Edit Modes". | `frontend/src/App.vue:1114`; `README.md:18`; `README.en.md:18` |
| E10 | Existing dialog styling supplies card background and radius; theme tokens have light/dark variants. | `frontend/src/styles/main.css:511-520`, `:597-646`; `frontend/src/App.vue:1392-1402`; `.trellis/spec/frontend/component-guidelines.md:231-283` |

## Requirements

- **R1 — Shared structure**: cards use restrained borders, rounded corners and existing theme variables. Rows consistently place identity/title information on the left and controls on the right, with subtle dividers between rows. Do not redesign unrelated dialogs or extract new component/composable responsibilities.
- **R2 — Regular-user content**:
  - 「账号」: initial-letter avatar; 当前用户 caption and username; 修改密码; 退出登录 per C6.
  - 「界面」: 编辑模式 with C2's descriptions and a 基础 / 完全 segmented selector; 主题 with a sun/moon 浅色 / 深色 selector. Descriptions may wrap, never collide with controls.
  - 「项目与数据」: current-project row (folder visual, 当前项目 caption, project name or 「请先选择项目」, Agent 授权); 导出 row with 当前项目 then 所有项目; 导入 row with 项目文件 then Word 文档.
  - No footer; users can close through × or the existing Escape behaviour. Preserve the current backdrop-click restriction.
- **R3 — Admin content**: use the same account row without 修改密码; 「界面」 has only 主题; retain 「全局设置」 with 模板路径 and 「AI 复核」 with the existing enable switch, three inputs, 测试连接 and result. Only admins have the 关闭 / 保存 footer. No project, edit-mode or transfer controls.
- **R4 — Existing behaviour and privacy**: retain handlers, role conditions, disabled/loading conditions, confirmations, hidden `.db` picker and accessible picker name. Current-project export and Word import remain disabled without a selected project; Agent entry retains its stricter validated-id guard. Keep storage values, API payloads, lazy dialog mounting, sibling placement and all context/late-response cleanup unchanged. Settings open alone must issue no Agent requests. This work does not change password/logout or import/export algorithms.
- **R5 — Accessibility and resilience**: named segmented radio groups, complete accessible names for compact action buttons, decorative icons hidden from assistive technology, visible keyboard focus and usable keyboard interaction. Empty usernames and long usernames/project names must not break layout. Retain the stable `data-test="agent-access-entry"` hook.
- **R6 — Geometry and themes**: retain the 560px desktop maximum while bounding actual dialog width by the viewport. At narrow widths, let rows/action groups wrap without horizontal overflow; keep × and all actions reachable. In short viewports, content must scroll rather than clip the last controls. Use existing light/dark variables for text, dividers, backgrounds and a clearly distinguishable selected segment; do not add global palette changes for this local restyle.
- **R7 — Tests and documentation**: update the four files in E8 test-first, retaining behaviour assertions and adding role-specific grouped-layout, selector-selection and accessibility coverage. Synchronize `README.md`, `README.en.md`, `frontend/.claude/CLAUDE.md`, `.claude/CLAUDE.md` and `.claude/index.json` with the final behaviour/file inventory. Keep any narrative evidence in the existing change-log archive, never expand root history. No new dependency, runner, build/release process or test-config change.

## Acceptance Criteria

| ID | Observable acceptance | Requirements |
| --- | --- | --- |
| AC1 | A regular user sees R2's exact grouping, row/action order and labels; the old central dividers, edit/theme switches and four stacked full-width transfer buttons are gone. | R1, R2 |
| AC2 | 基础 / 完全 persists through `crf_edit_mode`; returning to 基础 leaves advanced tabs and closes template search. 浅色 / 深色 persists through `crf_theme` and stays in sync with the header toggle, including after settings reopen. | R2, R4 |
| AC3 | Password change, logout, Agent authorization, both exports and both imports retain their request and confirmation contracts, no-project disabled states and import loading state. | R4 |
| AC4 | Admin settings show the role-specific cards and 关闭 / 保存, retain AI load/test/save behaviour, and expose no regular-user project actions. Regular-user settings have no footer. | R3, R4 |
| AC5 | Agent lifecycle regressions still prove: zero Agent requests on settings open; one lazy sibling with the correct numeric id; unmount and stale-response protection on settings close, project switch/delete, logout and expiry. Closing via the remaining header × is verified in the browser. | R4, R5 |
| AC6 | New expectations fail before implementation and pass after it. Full frontend `npm test`, lint and build pass; comparable baseline/final coverage is reported, at least 80% without a decrease or weaker exclusions. Review the actual diff and perform a focused security-boundary review. | R4, R7 |
| AC7 | Isolated real-browser evidence covers both roles in light/dark desktop themes; 390px and 320px widths, a short viewport and a long project name show no horizontal overflow or inaccessible controls. Verify selector keyboard interaction and basic action-entry routing, without modifying real data. | R5, R6, C3 |
| AC8 | Documentation names the modes 「基础 / 完全」 (Basic / Complete in English) and describes the grouped settings; there is no unrelated refactor, production deployment or external publication. | R7, C1 |

## Out of Scope

Follow-system theme; dropdown or embedded Agent management; glass/gradient redesign; settings extraction; new backend behaviour/endpoints; logout confirmation or new leave guards; dependency/version/configuration changes; build-script/release changes; real credentials or data; 8888 rebuild/restart; commits, merge, push or deleting other worktrees. Existing backend and Agent contracts remain unchanged.

## Planning State

No blocking product decisions remain. The user approved this consolidated PRD with 「按此方案实施」 on 2026-11-10 and task.py start set status to `in_progress`. This remains a lightweight presentation task with one implementation owner and the existing test harness. Execution evidence and remaining review/acceptance boundaries are recorded in `verification.md` and `planning-board.md`; commits, merge, push and production deployment still require explicit authorization.

## Subsequent Acceptance Deployment Authorization — 2026-11-10

The user subsequently requested 「重建并重启服务，我去浏览器测试」. This supersedes only the original prohibition on rebuilding the frontend and restarting the existing 8888 service: build inside the task worktree, back up the existing served static assets outside Git, copy the generated frontend/dist assets into the service's existing static directory and restart crf-editor. Preserve old assets for cached clients and verify the served build before handing browser testing back to the user. No tracked main-source edits, backend/config/database changes, commit, merge, push or task cleanup are authorized by this request.

## User Acceptance and Wrap-up Authorization — 2026-11-10

The user confirmed 「没有问题了，收尾」 after browser testing, then explicitly requested 「提交，然后收尾」. This authorizes the verified task's work-commit batch and the standard wrap-up pipeline in `.trellis/spec/guides/git-and-tooling-conventions.md` §8: archive, journal, local main merge, main-checkout frontend build/HTTP verification, main push and cleanup of only this task's worktree/branch. Preserve other tasks/worktrees and all original business/credential/database/configuration boundaries. The earlier sudo-blocked restart is not a successful restart and is not a blocker for the accepted frontend-only change.
