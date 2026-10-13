# 审查整改

## Goal

- 落实 2026-10-08 全项目审查的结论。审查在会话 `c61a24cd` 中完成，合并了 Sonnet、Haiku、GPT 三方意见，并逐条回到代码核实。
- 先堵住线上可被利用的安全漏洞，再让测试不碰真实数据。之后分批修小缺陷、收拢重复代码、整理导出层、拆分巨型文件。
- 每个子任务都能单独验证、单独合入 `main`。不推倒重写。

## 来源

- 审查报告原文：`research/review-2026-10-08.md`。行号对应当时的代码，子任务开工前须重新核实。
- 第 0–2 步的事实已于 2026-10-08 由三个只读子代理按当前代码（`main` 为 `77e8f3f`）重新核实，结论写在对应子任务的 `prd.md` / `design.md` 中。

## 用户已做的决定（2026-10-08）

| 事项 | 决定 |
|---|---|
| 计划粒度 | 第 0–2 步（越权修复、测试隔离、小缺陷）写完整设计和执行文档；其余子任务只写范围，开工前再补设计 |
| pytest-cov | 引入，只统计、不设门槛 |
| ruff format | 引入，后端一次性统一格式 |
| vitest + @vue/test-utils | 引入，用于前端组件挂载测试 |
| 提交前钩子 | 引入，补上 CI 删除后缺失的密钥扫描和基本自检 |
| 退役的性能埋点 | 删除 |
| `shrimp-rules.md` | 删除 |
| `AGENTS.md` | 保留（由 Trellis 托管） |
| 多用户服务器 | **已上线**，越权漏洞按紧急修复处理 |

## 任务地图

「完整」表示已有 `design.md` + `implement.md`，审阅后可直接开工；「范围」表示只有 `prd.md`，开工前须先补设计。「轻量」表示 PRD 已足够，可直接开工。

| 波次 | 子任务（`.trellis/tasks/10-08-<名称>`） | 内容 | 前置 | 文档 |
|---|---|---|---|---|
| A | `docx-temp-ownership` | **紧急**：Word 导入临时文件越权修复 | 无 | 完整 |
| A | `test-isolation` | 测试只碰临时目录；全新 worktree 零配置可跑；覆盖率统计 | 无 | 完整 |
| A | `pre-commit-gate` | 本机提交前钩子：密钥扫描 + 快速自检 | 无 | 轻量 |
| B | `small-defects` | 六个已核实的小缺陷 | 建议在 `test-isolation` 之后 | 完整 |
| B | `test-config-isolation` | 低优先级：测试不再读取真实 `config.yaml`，也不继承 shell 里的 `CRF_*` 配置变量 | `test-isolation`（已合入） | 完整 |
| C | `temp-resource-lifecycle` | 流式上传、异步接口线程池、统一临时目录 | `docx-temp-ownership` | 范围 |
| C | `shared-rule-convergence` | 收拢前端重复规则，修访视页多行默认值 | 无（前端） | 范围 |
| D | `legacy-cleanup` | 删除性能埋点、`shrimp-rules.md`、死代码 | B、C 波合入 | 范围 |
| D | `backend-format` | ruff format 一次性格式化 | 没有其他后端分支在进行 | 范围 |
| D | `export-layer-cleanup` | 导出层：删死分支、合并重复渲染、拆大函数 | `backend-format` | 范围 |
| D | `backend-dedup` | 后端路由与迁移代码去重 | `backend-format` | 范围 |
| E | `frontend-mount-tests` | 引入 vitest + @vue/test-utils | 无（可提前开工） | 范围 |
| E | `designer-split` | 拆分 `FormDesignerTab.vue` | `shared-rule-convergence`、`frontend-mount-tests`、`legacy-cleanup` | 范围 |
| E | `visits-preview-split` | 拆分 `VisitsTab.vue` 预览弹窗 | `designer-split` | 范围 |
| E | `app-word-import-split` | 拆分 `App.vue` Word 导入向导 | `visits-preview-split` | 范围 |
| F | `docs-sync` | 文档单一来源与过时内容清理 | 最后做 | 范围 |

- 同一波次内的任务互不改同一批代码文件，可以在不同会话里并行。
- `frontend-mount-tests` 不改其他任务的代码文件，可以提前到任何时候开工；越早合入，后面的前端任务越早能用上挂载测试。
- 三个前端拆分任务要等 `legacy-cleanup` 合入。之后 D 波（后端）与 E 波（前端）可以并行。
- 父任务本身不写代码，不需要 `task.py start`。

## 跨子任务验收标准

- [ ] 每个子任务在独立的 worktree 和任务分支里实现；检查通过后在本地合入 `main`，然后删除 worktree 和分支。
- [ ] 后端全量测试没有新增失败；涉及前端的任务，前端测试没有新增失败，并通过 lint 和构建。
- [ ] `test-isolation` 合入后，每个子任务记录改动文件的覆盖率，不得下降（只统计，不设门槛）。
- [ ] 改了前端的任务，必须经过 Haiku 只读审查；涉及安全的任务，必须经过安全审查。
- [ ] 每个子任务自己同步文档：README 中英文、模块 `CLAUDE.md`、`.claude/index.json`、跨栈契约；根 `.claude/CLAUDE.md` 变更日志只写一行，全文追加到 `.context/history/archives/claudemd-changelog.md`。
- [ ] 提交、合入、推送、部署都要先得到用户明确授权。`.trellis/` 的改动（任务归档、日志）单独提交，不和项目代码混在一起。

## 线上事项（需要你在生产服务器上执行）

1. **现在：排查访问日志。** 截图和 AI 复核接口的编号在网址里，正常编号是 12 位十六进制。下面的命令筛掉正常请求，剩下的就是可疑请求（日志路径按实际情况调整）：

   ```bash
   sudo zgrep -hE '/import-docx/' /var/log/nginx/access.log* \
     | grep -vE '/import-docx/(preview|execute)[ ?"]' \
     | grep -vE '/import-docx/[0-9a-f]{12}/(ai-review/status|screenshots/(start|status|pages/[0-9]+))[ ?"]'
   ```

   - 执行导入的编号在请求体里，访问日志看不到。只能做弱判断：某个 IP 只调用过 `execute`、从没调用过 `preview`，就值得怀疑。
   - 没有 nginx 时，改查 `sudo journalctl -u crf-editor --no-pager | grep import-docx`。
2. **可选的临时止血：** 在 nginx 里临时拦截 `/import-docx/`，会暂停整个 Word 导入功能。这是修复上线前唯一完整的拦截方式，因为最危险的执行导入接口无法按编号过滤。
3. **修复合入后：** 部署并重启服务。正在进行中的导入需要重新上传。旧的上传文件立即失效，并在 24 小时内被自动清理。
4. **如果仓库是公开的：** 修复代码一推送就会暴露漏洞原理，推送后要尽快部署。本任务目录里有漏洞细节，等线上部署完成后再提交归档。

## Out of Scope

以下是三方审查一致不建议做的事：

- 推倒重写、更换技术栈、拆成微服务、全面改用 TypeScript。
- 用版本表或 Alembic 替换现有的「先探测再迁移」。
- 合并不同用途的数据库会话、排序规则或撤销保护。
- 做通用的增删改查列表组件；大范围清理「防御性代码」；重写 Word 导入解析器。
- 为后台任务引入 Redis 或 Celery。
