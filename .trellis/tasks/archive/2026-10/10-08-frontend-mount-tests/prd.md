# 引入 vitest 与 @vue/test-utils 组件挂载测试

## Goal

- 为前端提供组件挂载（mount，即在真实 DOM 环境里渲染整个组件）测试能力，用户已批准 vitest 与 @vue/test-utils 两个新依赖。
- 与现有 `node --test tests/*.test.js` 套件并存、互不干扰。
- 用 1-2 个真实小组件的种子挂载测试证明整套设置可用，为后续拆分巨型组件（`designer-split` 等）打底。

## Background（证据核实于 2026-10-08）

- 现状：前端测试只有 `node --test tests/*.test.js`（`tests/` 目录 69 个文件，其中 68 个 `*.test.js` 会被命令执行，另 1 个是辅助库 `testProperty.js`；68 个中有 37 个用 `readFileSync` 对源码做文本断言，无法验证组件真实行为）。`frontend/package.json` 的 scripts 只有 `dev/build/preview/lint/format`（已核实），连统一的 `test` 脚本都没有——运行方式全靠文档里的命令行。
- `vitest`、`@vue/test-utils`、jsdom/happy-dom 均未出现在 `frontend/package.json`（已核实 scripts 与依赖清单）。
- 组件技术栈：Vue 3 `<script setup>` + Element Plus（`.trellis/spec/frontend/component-guidelines.md`）。挂载测试需要：DOM 环境模拟、Element Plus 插件安装（或按需局部注册）、对 `ElMessage`/`ElMessageBox` 等全局挂载物的处理。
- 测试运行隔离设计要点：vitest 默认会扫描测试文件；必须用独立的文件模式（如 `tests/component/*.spec.js`）和 vitest 配置里的 `include` 限定，避免把现有 `*.test.js` 卷进 vitest 运行（两侧运行器语义不同会互相误报）。
- 可选项：覆盖率统计。`@vitest/coverage-v8` 是又一个新依赖，需用户单独批准；Node 内置的 `--experimental-test-coverage` 不需要新依赖但不能覆盖 vitest 用例。默认不做覆盖率。

## Requirements

- R1：以 pinned 版本把 `vitest`、`@vue/test-utils` 和 DOM 环境库（jsdom 或 happy-dom，design 阶段按体积/兼容性二选一）加入 `frontend/package.json` 的 `devDependencies`。
- R2：新增 vitest 配置（`frontend/vitest.config.js` 或在 `vite.config.js` 内的 `test` 字段，design 定；注意不要影响现有 vite 构建行为）：`include` 仅匹配新目录/新模式（如 `tests/component/**/*.spec.js`），与 `node --test` 的 `tests/*.test.js` 完全不相交。
- R3：新增 npm scripts：如 `test:component`（只跑 vitest）与 `test`（先 `node --test tests/*.test.js` 再 vitest，任一失败即失败）；不改变 `node --test` 现有行为。
- R4：提供 Element Plus 挂载设置：全局测试 setup 文件（安装 Element Plus 插件或按需注册、stub `ElMessage` 等需要 mock 的全局 API、必要的 CSS 豁免），收敛在一个测试工具模块里供各用例复用。
  - 已知坑：独立的 `vitest.config.js` 不会继承 `vite.config.js` 的插件；`@vitejs/plugin-vue`（已在 `devDependencies`，`^6.0.2`）必须加进 vitest 配置，或用 `mergeConfig` 复用 `vite.config.js`，否则 `.vue` 文件无法编译。
  - 已知坑：jsdom 缺少 Element Plus（如 `el-table`）用到的 `ResizeObserver` / `matchMedia`；若选 jsdom 需在 setup 文件里 stub，无论选哪个 DOM 库都要实测挂载可用。
- R5：写 1-2 个种子挂载测试，选择一个小组件（优先无路由/无复杂 props 依赖的真实组件；不要选 `App.vue` 或 `FormDesignerTab.vue`，`legacy-cleanup` 会编辑它们），验证：组件可挂载、关键交互（如点击触发事件/状态变化）可断言。
- R6（可选，需用户批准后才做）：覆盖率接入（`@vitest/coverage-v8`）。未获批准前不安装。
- R7：文档同步：`README.md` / `README.en.md` 测试章节、根 `.claude/CLAUDE.md` 与 `frontend/.claude/CLAUDE.md` 的常用命令，写清两套测试各自的运行方式与文件位置约定。

## Acceptance Criteria

- [ ] AC1（对应 R1/R2）：依赖按 pinned 版本安装成功；`npx vitest run` 只发现并运行 `tests/component/` 下的用例，不会收集现有 `*.test.js`。
- [ ] AC2（对应 R3）：`npm run test:component` 与 `npm run test` 均可运行且语义正确。
- [ ] AC3（对应 R4/R5）：种子挂载测试通过：真实组件挂载成功且断言了至少一个交互行为。
- [ ] AC4（对应 R2/R3）：现有套件零改动零影响：`node --test tests/*.test.js` 全部通过（运行的文件数与开工时 main 上 `tests/*.test.js` 的数量一致；不写固定数字，其他任务会增删测试文件）。
- [ ] AC5（对应 R6）：覆盖率未启用；如用户批准则另加 AC（报告可生成且数字合理）。
- [ ] AC6（回归门禁）：前端 `cd frontend && node --test tests/*.test.js` 无新增失败；后端零改动，pytest 未跑需注明。
- [ ] AC7（对应 R7，文档同步）：README 中英与两份 `.claude/CLAUDE.md` 命令章节已更新且一致。
- [ ] AC8（评审）：前端改动完成后走 Haiku 只读评审，问题已处理或记录。

## Out of Scope

- 不迁移任何现有 `node --test` 测试到 vitest；不重写 37 个源码文本测试（那是各重构任务随拆随改）。
- 不给业务代码引入任何运行时依赖；不改 vite 构建/打包配置的行为。
- 默认不引入覆盖率依赖（除非用户批准 R6）。
- 全局非目标：不做重写 / 换技术栈 / 微服务 / TypeScript 迁移；不引入 Alembic 或版本表迁移；不合并不同的数据库会话类型、排序规则或撤销保护；不做通用 CRUD 列表组件；不做大范围"防御性代码"清理；不重写 Word 导入解析器；不引入 Redis/Celery。

## Dependencies and Order

- 无硬性前置，可随时开工；建议尽早做，因为 `shared-rule-convergence` 和三个拆分任务都能用上。
- 归在 Wave E，但可以提前到任何波次做；阻塞 `designer-split`、`visits-preview-split`、`app-word-import-split`（三者每步都要用到挂载测试）。
- 与 Wave D 后端串行链（backend-format 等）无文件冲突，可并行。
- 一个任务 = 一个 worktree + 一个分支，检查通过后本地合入 `main`。

## Before Starting

这是范围文档。开工前必须基于当时最新的 main 补写 design.md 和 implement.md（Trellis 对复杂任务的要求），并重新核实上面的行号。执行流程见父任务 `implement.md`（公共执行手册）。
