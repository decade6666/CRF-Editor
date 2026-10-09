# Verification: frontend-mount-tests

## Status and authorization

- Implementation complete on `test/frontend-mount-tests` (worktree `/home/decade/CRF-Editor-frontend-mount-tests`), branch merged with `main` @ `dbe347d` (merge commit `b2e11f7`, conflict resolutions included).
- Implementation and docs were authored in a parallel executor session (2026-10-09 08:34–09:09); the coordinating session independently re-derived RED/mutation evidence, merged main, ran all final gates, and applied review fixes.
- Not yet authorized / performed: local merge into `main`, task archival, push.

## Commits (branch, in order)

| Commit | Change |
| --- | --- |
| `3a1a911` | test(frontend): 引入 vitest 与 @vue/test-utils 组件挂载测试（依赖、配置、3 个 spec + setup、README 中英、根/前端 CLAUDE.md、index.json、归档叙述） |
| `c356aae` | docs(spec): 前端质量规范补充组件挂载测试约定（quality-guidelines + directory-structure，Trellis 单独提交） |
| `b2e11f7` | chore(merge): 同步 main 并合并文档冲突（small-defects + template-field 合入带来的 6 处文档冲突） |
| `e1750fb` | fix(frontend): 终审修正测试计数与令牌常量导入 |

## Gate results

| Gate | Result |
| --- | --- |
| trellis-check (sonnet, post-merge full branch) | AC1–AC7 全过；hook 顺序用临时探针 spec 实证；0 个小缺陷需修 |
| Haiku read-only review (AC8) | 3 Low / 0 blocking：SessionTimer 第 4 例用真实定时器（设计取舍，flushPromises 与 fake timers 冲突）；环境冒烟 spec 插槽警告噪音；DesignNotesDialog invalidateCache spy 调真实现（无害，缓存为空）— 均记录不修 |
| code-review skill | 3 条发现全部修复：spec 规范行 68→69；模块 CLAUDE.md 基线数字补合并后注记（69/824）；SessionTimer.spec 改为导入 `TOKEN_STORAGE_KEY` 共享常量（`e1750fb`） |
| Suites | node --test 824/0；vitest 3 文件 9 用例全过无 [Vue warn]；lint 0 errors（3615 条既有警告与基线一致）；build exit 0；prettier 新文件 clean；`git diff --check main...HEAD` clean |
| Isolation / zero-touch | vitest `include` 只收集 3 个 spec；`git diff --stat main -- backend frontend/src frontend/vite.config.js frontend/.eslintrc.cjs` 为空 |
| npm audit | 13 条（实现时 14→13，picomatch high 消失，新增包零公告；nopt/abbrev EBADENGINE 为噪音） |

## RED → GREEN evidence

- Isolation RED：无 vitest.config.js 时 `npx vitest list --filesOnly` 收集全部 69 个 `tests/*.test.js`（默认 include 误收 node:test 套件，`include` 必填）。
- Environment RED：setup.js 不注册 Element Plus 时 5/9 用例失败（`[Vue warn]: Failed to resolve component: el-*`；SessionTimer 走 composable 的用例按设计不依赖组件解析）。
- Mutation：DesignNotesDialog save() emit 翻转 → 保存用例失败；SessionTimer 状态类改常量 → 警告用例失败；均 `git checkout --` 还原且 `git diff --stat main -- frontend/src` 为空。
- AC2 语义：翻转 spec 期望值 → `npm test` 退出码 1。

## Not run / limitations

- Backend pytest：分支后端零改动（diff 为空），AC6 明确允许。
- dist sha256 前后对比：实现阶段 27 文件哈希一致；main 合并后 useApi.js 合法变化使该对比不再适用，以 build exit 0 为准。
- 浏览器验证：纯开发态测试工装，无生产 UI 变化，不适用。
