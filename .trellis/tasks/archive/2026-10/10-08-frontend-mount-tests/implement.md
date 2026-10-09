# Implementation plan: vitest + @vue/test-utils component mount tests

Follow the parent runbook `/home/decade/CRF-Editor/.trellis/tasks/10-08-review-remediation/implement.md` (RB). Technical decisions are in `design.md` (D1–D8).

- Branch: `test/frontend-mount-tests`
- Worktree: `/home/decade/CRF-Editor-frontend-mount-tests` (`$WT` below)
- Executor: Sonnet (`trellis-implement`). Opus reviews the actual diff.
- Install authorization covered by approving this plan: exactly `vitest@5.0.3`, `@vue/test-utils@2.5.1`, `happy-dom@20.14.5` as devDependencies, plus `npm ci` in the worktree. Anything else (other packages, `@vitest/coverage-v8`, global installs) needs a new approval.
- Every command carries its own `cd "$WT/frontend" &&` prefix (RB §1 harness gotcha). npm needs the proxy variables, so do **not** unset them for npm (only the backend Python command unsets them).

## 1. Start and baseline

```bash
cd /home/decade/CRF-Editor
python3 ./.trellis/scripts/task.py start .trellis/tasks/10-08-frontend-mount-tests
python3 ./.trellis/scripts/task.py set-branch .trellis/tasks/10-08-frontend-mount-tests test/frontend-mount-tests
git worktree add /home/decade/CRF-Editor-frontend-mount-tests -b test/frontend-mount-tests main
cd /home/decade/CRF-Editor-frontend-mount-tests/frontend && npm ci
```

Record (task notes and final report):

1. `ls tests/*.test.js | wc -l` — the AC4 file count.
2. `node --test tests/*.test.js 2>&1 | tail -n 12` — tests / pass / fail.
3. `npm run lint` — exit status.
4. `npm run build && (cd dist && find . -type f -print0 | sort -z | xargs -0 sha256sum) > /tmp/frontend-mount-tests-dist-before.sha256`
5. `npm audit --json` summary (design D8 says 14: 1 low, 1 moderate, 12 high).
6. `npm ls vite vue @vitejs/plugin-vue element-plus --depth=0`.

## 2. Install (design D1)

```bash
cd "$WT/frontend" && npm install -D -E vitest@5.0.3 @vue/test-utils@2.5.1 happy-dom@20.14.5
git -C "$WT" diff -- frontend/package.json        # only three exact-version devDependencies lines
cd "$WT/frontend" && npm ls vite vue @vitejs/plugin-vue element-plus --depth=0   # identical to baseline 1.6
```

- Record any peer / engine warning.
- **Stop and report** if an already-locked version of `vite`, `vue`, `element-plus` or `@vitejs/plugin-vue` changed.

## 3. RED

1. **Isolation RED (design D4).** Before creating `vitest.config.js`, run `npx vitest list --filesOnly` (collects file names only, executes nothing). Expected: it lists the `tests/*.test.js` node:test files through vitest's default include. Record the count.
2. Create `vitest.config.js` (D3), the three specs (D6.1–D6.3), and a `tests/component/setup.js` that has the hooks of D5.2–D5.4 but **no** Element Plus registration yet.
3. **Environment RED.** `npx vitest run` → the specs fail because `el-*` components do not resolve (`[Vue warn]: Failed to resolve component: el-dialog` and missing-element assertions). Record the failing lines. An import error does not count as RED.

## 4. GREEN

1. Complete `setup.js` (D5.1 plugin registration, D5.3 `ElMessage` stubs). Verify the after-hook order once (D5.4: unmount before timers / spies are restored) and record it.
2. `npx vitest run` → all specs pass. The output must contain no `[Vue warn]`. Fix the test, or record why a warning is unavoidable.
3. If a spec fails only because the DOM environment lacks an API, add the minimal polyfill (D5.5) with a comment, and log it.
4. Add the scripts (D7). `npm run test:component` and `npm test` both pass; `npm test` prints the node:test summary, then the vitest summary.
5. AC2 failure semantics, one quick check: temporarily flip one expected value in a spec, confirm `npm test` exits non-zero, restore the spec.

## 5. Assertion sensitivity (design "Assertion sensitivity")

One temporary component edit per seed. Confirm the matching test fails, then restore with `git -C "$WT" checkout -- <file>`:

- `frontend/src/components/DesignNotesDialog.vue`: in `save()`, emit `true` instead of `false` for `update:modelValue`. D6.1 case 3 must fail.
- `frontend/src/components/SessionTimer.vue`: replace the status class binding with a constant. D6.2 case 2 must fail.

Then `git -C "$WT" diff --stat main -- frontend/src` must be empty.

## 6. Isolation, parity and hygiene checks

- `npx vitest list --filesOnly` → exactly the three `tests/component/*.spec.js` files (AC1).
- `ls tests/*.test.js | wc -l` and `node --test tests/*.test.js` → same counts as baseline (AC4, AC6).
- `npm run lint` → same status as baseline (lint covers `src/` only, which is unchanged).
- `npm run build`, recompute the `dist/` hashes, `diff` against `/tmp/frontend-mount-tests-dist-before.sha256` → identical (design D8).
- `npm audit --json` → list any advisory introduced by the new packages; pre-existing ones are out of scope.
- `git -C "$WT" diff --stat main -- backend frontend/src frontend/vite.config.js frontend/.eslintrc.cjs` → empty.
- `npx prettier --check vitest.config.js "tests/component/**/*.js"` → clean (repo `.prettierrc.cjs`: semicolons, single quotes, width 120).
- `git -C "$WT" status --short --ignored` → no stray artifacts outside `node_modules/` and `dist/`.

## 7. Docs (design "Docs", RB §7)

- `README.md` + `README.en.md` (semantically identical).
- Root `.claude/CLAUDE.md` (Common Commands, module index, Testing Strategy, one Change Log line) and `.context/history/archives/claudemd-changelog.md` (full narrative with RED → GREEN evidence). Keep the root file under 40k chars (`wc -c`).
- `frontend/.claude/CLAUDE.md`, `.claude/index.json`.
- `.trellis/spec/frontend/quality-guidelines.md` and `directory-structure.md` (Trellis files, separate commit).
- Decision log `/home/decade/CRF-Editor/.context/current/branches/test/frontend-mount-tests/session.log` (gitignored, main checkout): D2 DOM environment, D3 standalone config, and any polyfill or deviation.

## 8. Review gates (RB §6)

- `git -C "$WT" diff --check main...HEAD` and the working tree.
- `trellis-check` (sonnet) on the full branch diff; fix its findings.
- `code-review` skill on the branch diff.
- Haiku read-only review (`Agent`, model `haiku`) of the frontend diff (`package.json`, `vitest.config.js`, `tests/component/**`); it reports only.
- Not security-sensitive (dev-only test tooling); the npm audit delta stands in for a security note.

## 9. Finish

RB §2 and RB §8. The backend is untouched, so backend pytest is not run (PRD AC6); say so in the report. Suggested commits, each only after the user authorizes it:

1. `test(frontend): 引入 vitest 与 @vue/test-utils 组件挂载测试` — `frontend/package.json`, `frontend/package-lock.json`, `frontend/vitest.config.js`, `frontend/tests/component/**`, both READMEs, root and frontend `CLAUDE.md`, `.claude/index.json`, `.context/history/archives/claudemd-changelog.md`.
2. `docs(spec): 前端质量规范补充组件挂载测试约定` — the two `.trellis/spec/frontend/` files.
3. After the merge into `main`: `chore(task): archive 10-08-frontend-mount-tests`.

## Rollback points

- happy-dom cannot mount a seed or the smoke spec, and a polyfill of 10 lines or fewer does not fix it: stop and report. Switching to jsdom needs a new install approval.
- `npm install` changed a locked runtime or build package: stop and report.
- The `dist/` hashes differ: investigate lockfile drift before anything else; never accept a changed bundle silently.
