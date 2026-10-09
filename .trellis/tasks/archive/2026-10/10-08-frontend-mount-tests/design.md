# Design: vitest + @vue/test-utils component mount tests

Facts below were re-verified on 2026-10-08 against `main` @ `6580fc9`.

## Boundaries

- Touch:
  - `frontend/package.json` (devDependencies + two scripts) and `frontend/package-lock.json`
  - new `frontend/vitest.config.js`
  - new `frontend/tests/component/` (setup file + three spec files)
  - docs (see "Docs")
- **No production code changes.** `frontend/src/**`, `frontend/vite.config.js`, `frontend/.eslintrc.cjs`, `frontend/.prettierrc.cjs` and all of `backend/` stay untouched.
- No existing `tests/*.test.js` file is edited, moved, or migrated.

## D1 — Packages (devDependencies only, exact pins)

| Package | Version | Why this version |
|---|---|---|
| `vitest` | `5.0.3` (latest) | engines `node ^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0` (local Node `v24.14.1` OK); peer `vite ^6.4.0 \|\| ^7.0.0 \|\| ^8.0.0` (local `vite 7.3.1` OK) |
| `@vue/test-utils` | `2.5.1` (latest) | peer `vue 3.x` (local `vue 3.5.29`); its `@vue/compiler-dom` / `@vue/server-renderer` peers are already installed as `vue` dependencies |
| `happy-dom` | `20.14.5` (latest) | DOM environment, see D2. engines `node >=20.0.0`; 7 direct dependencies |

- Install with `npm install -D -E …` so `package.json` records exact versions (the PRD asks for pinned versions; existing entries keep their `^` ranges, which this task does not touch).
- `dependencies` must stay byte-identical. The bundle must not change (D8).
- Not installed: `@vitest/coverage-v8` (R6, needs separate approval), `@vitest/ui`, `jsdom`.

## D2 — DOM environment: happy-dom 20.14.5

Research (sub-agent, 2026-10-08; sources: element-plus `dev` branch `vitest.config.mts` / `vitest.setup.ts`, happy-dom and jsdom sources, GitHub advisories + OSV):

| | happy-dom 20.14.5 | jsdom 29.1.1 |
|---|---|---|
| `matchMedia` / `IntersectionObserver` / `scrollTo` | native | missing → stubs needed |
| `ResizeObserver` | present, no-op | missing → stub needed |
| Element Plus's own suite | used for its popper-heavy `select` and `autocomplete` tests (per-file override) | default environment, plus a `ResizeObserver` polyfill |
| Advisories | 5 historical CVEs, all `<= 20.8.8`; 20.14.5 is clean | none |
| Node engines | `>=20.0.0` | `^20.19.0 \|\| ^22.13.0 \|\| >=24.0.0` (`30.x` needs `^24.15.0`, local is `24.14.1`) |
| Direct dependencies | 7 | 20 |

- Choose happy-dom. The split targets (`FormDesignerTab.vue`, `VisitsTab.vue`, `App.vue`) lean on `el-select`, `el-autocomplete` and teleported poppers, which is exactly where Element Plus itself switches to happy-dom. It also avoids four hand-written stubs.
- Its historical CVEs concern parsing **untrusted** HTML/JS (VM escape). These tests only run first-party code, and the package is dev-only and never bundled (D8 build check).
- Element Plus 2.13.2 reaches `ResizeObserver` only through `@vueuse/core`'s `useResizeObserver`, which no-ops when unsupported (`es/components/input/src/input.vue2.mjs:127`, `es/hooks/use-calc-input-width/index.mjs:15`, …), and never calls `matchMedia`. So the PRD's polyfill pitfall does not apply here; the environment smoke spec (D6.3) proves it.
- Rejected: jsdom 29.1.1 (needs `ResizeObserver` / `matchMedia` / `IntersectionObserver` / `scrollTo` stubs; Element Plus itself avoids it for select/autocomplete). Fallback if happy-dom misbehaves in a later task: install jsdom with user approval and opt that one file in with `// @vitest-environment jsdom`.

## D3 — Standalone `frontend/vitest.config.js`

```js
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// 组件挂载测试专用配置：只收集 tests/component/**/*.spec.js，与 node --test 的 tests/*.test.js 不相交。
// 独立文件不继承 vite.config.js（构建 / 开发服务器配置保持零改动），故需显式加载 Vue 插件编译 .vue。
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['tests/component/**/*.spec.js'],
    setupFiles: ['tests/component/setup.js'],
  },
});
```

- Vitest 5 still looks for `vitest.config.*` before `vite.config.*` (but no longer searches parent directories, so always run from `frontend/`). `vite build` / `vite` never read `vitest.config.js`.
- Rejected: a `test` block inside `vite.config.js`, or `mergeConfig(viteConfig, …)`. `vite.config.js` is a function config carrying `base` (`VITE_BASE_PATH`), the dev proxy, `allowedHosts` and `manualChunks`; none of it matters to tests, and keeping tests out of that file is what guarantees the build is unaffected. Cost: the plugin list is duplicated (one line). If `vite.config.js` ever gains a plugin that components need at compile time, add it here too (recorded in the spec guideline).
- Mock hygiene: vitest 5 defaults to `clearMocks: true` (call history cleared before every test); spy restoration is explicit in `setup.js` (D5), so the config needs no mock flags.
- No `server.deps.inline` / optimizer settings: vitest externalizes `node_modules`, and Node loads Element Plus's `es/*.mjs` natively.

## D4 — Runner isolation (AC1, AC4)

| Runner | Files | Discovery |
|---|---|---|
| `node --test` | `tests/*.test.js` | flat glob, never descends into `tests/component/` (shell glob on Linux; Node ≥ 21 expands the same glob itself on Windows) |
| vitest | `tests/component/**/*.spec.js` | explicit `include` only |

- Disjoint twice: different directory depth **and** different suffix.
- vitest's default include (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) **would** collect the 68 `tests/*.test.js` files, so the explicit `include` is mandatory. The RED step demonstrates it.
- Node's default discovery patterns (`**/*.test.?(c|m)js`, `**/test/**/*.?(c|m)js`, …) match neither `*.spec.js` nor `tests/component/setup.js`.

## D5 — `tests/component/setup.js` (the shared test-utility module, R4)

1. `config.global.plugins = [[ElementPlus, { locale: zhCn }]]` from `@vue/test-utils`, importing exactly what `src/main.js` imports (`element-plus`, `element-plus/es/locale/lang/zh-cn`). Every `mount()` then sees the same global registration as the app. No Element Plus CSS import: vitest turns CSS into empty modules by default (`css.include: []`) and the DOM environment does no layout.
2. `enableAutoUnmount(afterEach)`: every wrapper is unmounted after its test, so teleported dialogs and intervals do not leak into the next test.
3. A `beforeEach` that stubs the toast API: `vi.spyOn(ElMessage, m).mockImplementation(() => {})` for `success`, `error`, `warning`, `info` (these are plain assigned properties, `es/components/message/src/method.mjs:148-149`, so spying works). Tests assert directly on `ElMessage.success` etc.
   - Only the method form (`ElMessage.success(…)`) is covered; that is the only form `src/` uses. `ElMessageBox.confirm` is not stubbed globally: tests that need it call `vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm')` (documented in the guideline; no speculative helper).
4. An `afterEach` that runs `vi.useRealTimers()`, `vi.restoreAllMocks()` and `localStorage.clear()`.
   - Order matters: wrappers must unmount **before** timers and spies are restored (unmount stops intervals through the captured timer functions). Vitest runs after-hooks in reverse registration order by default (`sequence.hooks: 'stack'`), so register this hook before calling `enableAutoUnmount(afterEach)`. Verify the order once (e.g. a temporary log) and record it.
5. No DOM polyfills by default. Add one only when a spec fails without it, with a comment naming the component and API, and record it in the session log.

## D6 — Specs

API boundary for all specs: spy on the real exported `api` object (`src/composables/useApi.js:134`, a plain object) with `vi.spyOn(api, 'put')` etc. No `vi.mock` module factory and no hoisting is needed; the setup `afterEach` restores the methods. (`vi.spyOn` on an ESM *namespace* export still fails in vitest 5; spying on a property of an exported object is fine.)

### D6.1 `DesignNotesDialog.spec.js` (primary seed, 68-line component, no sibling task edits it)

The component is mounted eagerly by `FormDesignerTab.vue:5347` and its watcher has no `immediate`, so tests mount with `modelValue: false` and open via `setProps({ modelValue: true })`, exactly like the parent. `el-dialog` uses `append-to-body`; the dialog body is queried through `new DOMWrapper(document.body)` and emits are asserted on the mount wrapper (the component already carries `data-test` hooks).

> Execution note (2026-10-09): the originally planned `global.stubs: { teleport: true }` does not work. A lead probe confirmed that @vue/test-utils 2.5.1 renders an **empty** `<teleport-stub to="body">` for Element Plus's `ElTeleport` (`element-plus/es/components/teleport/src/teleport.vue2.mjs`), whether the dialog is open at mount or opened later. The real teleport works under happy-dom. Logged in the session log.

1. Opening copies `form.design_notes` into the textarea.
2. 取消 emits `update:modelValue` → `false` and calls no API.
3. 确定 calls `api.put('/api/forms/7', { design_notes: <edited text> })`, `api.invalidateCache('/api/projects/3/forms')`, emits `saved` (`{ formId: 7, designNotes }`) then `update:modelValue` → `false`, and `ElMessage.success('已保存')`.
4. A rejected `api.put` shows `ElMessage.error('设计备注保存失败：<message>')` and emits neither `saved` nor a close.

### D6.2 `SessionTimer.spec.js` (second seed, 66-line component)

Complements `tests/sessionTimer.test.js` (composable-level, injected fakes) with the component wiring: `v-if`, status class, `title` / `aria-label`, click → refresh. Uses `vi.useFakeTimers()` + `vi.setSystemTime(…)` and a `crf_token` in `localStorage` whose payload carries `exp`.

1. A token with 600 s left renders `600(s)` and class `session-timer--normal`; advancing fake time by 1 s re-renders `599(s)`.
2. A token inside the 5-minute window renders class `session-timer--warning` and calls `ElMessage.warning` once.
3. Clicking calls `api.get('/api/auth/me')` and `ElMessage.success('会话已续期')`.

### D6.3 `elementPlusEnvironment.spec.js` (environment smoke, R4 evidence)

An inline test component renders `el-table` (2 rows, 2 columns), `el-select` (bound value + options) and `el-tooltip` (trigger slot). Asserts: two body rows with the cell text, the select shows the bound option label, the tooltip trigger renders. It proves the DOM environment + global plugin can mount the heavier Element Plus components the split tasks depend on, without polyfills (or shows which polyfill is needed).

### Assertion sensitivity

These are characterization tests of existing behavior, so classic RED is impossible for the assertions themselves. Instead:

- RED (environment): with the specs written but no `setup.js` plugin registration, they fail because the `el-*` components do not resolve. That proves the setup is what makes them pass.
- Mutation check: for each seed, temporarily break one line of the component in the worktree (e.g. emit `true` instead of `false`), confirm the matching test fails, then restore the file with `git -C "$WT" checkout -- <file>`. `git diff --stat main -- frontend/src` must be empty at the end.

## D7 — npm scripts

```json
"test": "node --test tests/*.test.js && vitest run",
"test:component": "vitest run"
```

- `test` runs node:test first; `&&` makes either failure fail the script.
- `node --test tests/*.test.js` keeps its exact documented form; nothing about it changes.
- Watch mode is `npx vitest` (documented, no script).

## D8 — Verification beyond tests

- **Build unaffected**: `npm run build` before and after; `sha256sum` of every file under `dist/` must be identical.
- **Collection**: `npx vitest list` (or the vitest 5 equivalent) lists only `tests/component/*.spec.js` cases.
- **node:test unchanged**: same file count and pass count as the baseline on `main`.
- **npm audit**: baseline on `main` is 14 advisories (1 low, 1 moderate, 12 high, 0 critical; e.g. direct `vite` and `vue`), none from this task. Re-run after install; report any advisory introduced by the new packages. Fixing the pre-existing ones is out of scope.

## Docs

- `README.md` / `README.en.md` (semantically identical): tech-stack testing line, `tests/` tree comment, Testing → Frontend commands (`npm test`, `npm run test:component`, `node --test tests/*.test.js`), file-location convention, test counts.
- Root `.claude/CLAUDE.md`: Common Commands, module index tests cell, Testing Strategy; one Change Log line. Full narrative appended to `.context/history/archives/claudemd-changelog.md`.
- `frontend/.claude/CLAUDE.md`: Dependencies and Scripts, Core Directories (`tests/component/`), Testing Focus (the three specs + `setup.js`), Related File List (`vitest.config.js`), Change Log entry.
- `.claude/index.json`: frontend `config_files` + `tests`; refresh the `no_browser_e2e` gap description (node:test source-level + vitest mount tests; still no browser E2E).
- `.trellis/spec/frontend/quality-guidelines.md`: add "Component Mount Tests" (runner, location, naming, setup contents, API-boundary spying, ElMessage stubs, teleport stub, fake timers, polyfill rule, plugin-duplication rule); update Running Tests and the review checklist. `directory-structure.md`: `tests/component/` layout and `*.spec.js` naming. These two are Trellis files: separate commit.
- No cross-stack contract changes.

## Interaction with sibling tasks

- `small-defects` (worktree exists) edits `src/composables/useApi.js` and `tests/appSettingsShell.test.js`; no overlap. If `main` moves, merge it into the branch and re-run §4 checks.
- `legacy-cleanup` deletes perf-baseline tests, which changes the node:test file count; AC4 compares against `main` at start and again after any `main` merge. Doc conflicts, if any, are resolved at merge time.
- `designer-split`, `visits-preview-split`, `app-word-import-split` consume this setup through the spec guideline.

## Rollback

Revert the commit, then `npm ci` reinstalls `node_modules` from the previous lockfile. Nothing else depends on the new files.
