# Journal - decade (Part 1)

> AI development session journal
> Started: 2026-09-29

---



## Session 1: Archive designer-copy-field-draft after PR #85 merge
<!-- trellis-session: v=2 fp=3740dff672e83bb9 -->

**Date**: 2026-09-29
**Task**: Archive designer-copy-field-draft after PR #85 merge
**Branch**: `main`

### Summary

Archived 08-28-designer-copy-field-draft: designer regular-field copy now defers to a local __draft__ row persisted at save; PR #85 merged into main (5d7102e). Repaired task metadata (branch fix/designer-copy-field-draft, base main) and set repo-local git identity; 66 dirty Trellis platform files left untouched as unrelated parallel work.

### Git Commits

| Hash | Message |
|------|---------|
| `5d7102e` | fix(frontend): defer regular field copies until save |

### Status

[OK] **Completed**


## Session 2: Designer label OIDs system-managed + draft seed follow-up (PR #86, #87)
<!-- trellis-session: v=2 fp=02c99fddbd8d1520 -->

**Date**: 2026-09-29
**Task**: Designer label OIDs system-managed + draft seed follow-up (PR #86, #87)
**Branch**: `fix/designer-label-oid-followup`

### Summary

Form designer label OIDs are now system-managed (controlled type selector, label OID session, save-path placeholders, fork vs in-place routing) with backend startup normalization of non-placeholder label OIDs (PR #86). Post-merge review follow-up (PR #87): drafts carry a creation-time __labelOidSeed so re-selecting a draft after picking a library candidate no longer reuses the candidate OID; added guard tests for autocomplete session writes, multi-project migration, and init_db wiring. CI green; task archived via branch chore/archive-09-29-designer-label-oid. Found: auto-merge merges before CI finishes because the free private repo has no required checks.

### Git Commits

| Hash | Message |
|------|---------|
| `1bce061` | fix(designer): keep label OIDs system-managed |
| `f61f68b` | fix(designer): seed draft label OIDs from creation snapshot |

### Status

[OK] **Completed**


## Session 3: Wrap up 09-29 tasks: gated merges verified, tasks archived
<!-- trellis-session: v=2 fp=ef2c842c89ddeb92 -->

**Date**: 2026-09-30
**Task**: Wrap up 09-29 tasks: gated merges verified, tasks archived
**Branch**: `chore/archive-09-29-designer-tasks`

### Summary

PR #89 (CI merge gate) and PR #90 (designer autocomplete fixes) both merged by the new ci.yml merge-owner-pr job after the four CI jobs and gitleaks passed; both Trellis tasks archived to .trellis/tasks/archive/2026-09/ via PR #91.

### Git Commits

| Hash | Message |
|------|---------|
| `6e6d48f` | ci(workflows): merge owner PRs only after CI passes |
| `8541631` | fix(designer): keep autocomplete input on rejected candidate picks |
| `a262391` | chore(task): archive 09-29-auto-merge-after-checks |
| `7bab650` | chore(task): archive 09-29-designer-autocomplete-candidates |

### Testing

- [OK] Live gate evidence: PR #89 run 36564034189 (4 jobs success 11:48:44-11:50:12Z, merge job 11:50:21-11:50:28Z after 'gitleaks on 6e6d48f: success', merged 11:50:26Z by app/github-actions -> 99f536c); PR #90 run 36564626819 ('gitleaks on e4ed92b: success', merged 11:55:53Z by app/github-actions -> 68619f2). No manual merges; deleted workflows never ran.

### Status

[OK] **Completed**

### Next Steps

- After PR #91 merges: remove both worktrees, delete local+remote branches fix/designer-autocomplete-candidates and ci/auto-merge-after-checks; user-side: delete unused GITEE_* repository secrets.


## Session 4: Word 填写线最长 20 个字符（预览 + 导出）
<!-- trellis-session: v=2 fp=da9107840b2429ba -->

**Date**: 2026-09-30
**Task**: Word 填写线最长 20 个字符（预览 + 导出）
**Branch**: `main`

### Summary

Trellis 任务 09-30-word-underline-limit 全流程：需求讨论定稿（自动生成文本填写线最多 20 个 _，≈3.8cm；手输下划线、|__| 输入格、legacy 16 根不变）；双栈 FILL_LINE_MAX_CHARS 80→20 + renderCtrlHtml/renderCtrlTextHtml 首段生成线 max-width:10.0em 截停 .word-page flex 拉满；设计器/访视 inline 默认值回退改走 renderCtrlTextHtml。后端定向 79 passed、前端 721 passed、lint 0 errors、build OK；浏览器实测与导出 docx 核验通过；PR #97 已自动合并（含 main 前移合并 7885e3a，合并树复验 763 前端全过）。

### Git Commits

| Hash | Message |
|------|---------|
| `3bd21c8` | feat(fill-line): cap auto-generated text fill-line at 20 underscores in export and preview |
| `ec51c11` | docs(fill-line): sync 20-underscore cap contract in spec and module docs |

### Status

[OK] **Completed**

## Session 5: 日期时间/时间字段支持仅到小时格式

**Date**: 2026-09-30
**Task**: 日期时间/时间字段支持仅到小时格式（09-30-date-time-hour-format）
**Branch**: `feat/date-time-hour-format`

### Summary

Trellis 任务 09-30-date-time-hour-format 全流程（Opus 规划 + trellis-implement/trellis-check 子代理执行 + 主会话浏览器实测）。新增共享 `dateFormatOptions.js`（日期时间 +`yyyy-MM-dd HH`；时间 +`HH`/`hh AP`），预览 `renderPart` hasBox 修复丢「时」缺陷，后端 `render_date_time_placeholder`/`resolve_time_precision` 统一导出文本与控件权重（秒级格式列宽按实际文本对齐，D3），启动规范化映射补小时键且契约测试改解析真实 JS 列表，Word 导入严格识别仅到时占位（`…日  |__|__|时`→`yyyy-MM-dd HH`、整格 `|__|__|时`→`HH`），共享 fixtures 新增 5 用例。前端 725 passed / lint 0 errors / build OK，后端 978 passed / 2 skipped / 4 xfailed；浏览器实测下拉/预览/导出/再导入闭环通过。PR #95 的 pull_request CI 两次未触发（main 两度前移导致 merge ref 失效，mergeStateStatus DIRTY），关闭后重建 PR #99 并两轮合并 main 解决冲突（模板查询 §12 保留、本任务改 §13；fixtures 与生成器输出核验零漂移），合并树复验前端 770 / 后端 995 全过，CI 绿后自动合并（bd75310）。工作树与分支已清理，任务已归档（归档 chore 提交待用户指示）。

### Git Commits

| Hash | Message |
|------|---------|
| `7a5a804` | feat(field): support hour-only date-time and time formats |
| `061bce1` | merge: resolve changelog/spec conflicts with template-field-search and imported-log-row-label |
| `641bc8e` | merge: resolve changelog conflict with word-underline-limit |

### Status

[OK] **Completed**


## Session 6: Word 导入临时文件 IDOR 修复与过期清扫
<!-- trellis-session: v=2 fp=2001e6958872e028 -->

**Date**: 2026-10-08
**Task**: Word 导入临时文件 IDOR 修复与过期清扫
**Branch**: `main`

### Summary

落地 10-08-docx-temp-ownership 全部 AC：临时编号改 32 位十六进制并在存储文件名内嵌上传者+项目归属，5 个编号接口统一归属校验、外来编号与缺失编号逐字同响应；24h TTL 过期清扫（每小时后台循环，复用 CRF_DISABLE_BACKGROUND_JOBS 门禁）；扩展名大小写归一并修复大写上传无法执行的历史缺陷；清扫/导入竞态统一返回过期 400。新增 test_docx_temp_isolation 42 例，全量 1026 passed/4 xfailed。四路审查（安全×2、trellis-check、code-review+6 视角）全部通过，阻塞项清零。浏览器 E2E：A 全流程含 LibreOffice 截图面板、B 五接口逐字同缺失、文件名格式与导入后清理验证。文档：契约 §4 条款 6-8、README 中英、CLAUDE.md ×2、index.json、决策日志 session.log。前端零改动。

### Git Commits

| Hash | Message |
|------|---------|
| `c28f03b` | fix(docx): Word 导入临时文件改用 32 位编号并校验上传者归属 |
| `29d3669` | feat(docx): 过期的 Word 导入上传每小时自动清理 |
| `db32cf7` | docs(docx): Word 导入临时文件归属与过期清理文档同步 |
| `1d8062d` | docs(spec): 契约 §4 补临时编号归属与过期清扫条款 |
| `8405b1f` | fix(docx): 清扫与导入并发时统一返回过期提示并同步措辞 |

### Status

[OK] **Completed**


## Session 7: 本机 pre-commit 门禁（10-08-pre-commit-gate）
<!-- trellis-session: v=2 fp=e9fec7f18088b485 -->

**Date**: 2026-10-08
**Task**: 本机 pre-commit 门禁（10-08-pre-commit-gate）
**Branch**: `main`

### Summary

CI 删除后补上本机提交前门禁：版本化 .githooks/pre-commit（gitleaks v8.30.1 git --staged --verbose 暂存区扫描、git diff --cached --check、暂存 .py 的 py_compile、条件 ruff format --check），从 8ed19cd^ 逐字节恢复 .gitleaks.toml allowlist；core.hooksPath 已启用（所有 worktree 共享）。评审发现并修复非 ASCII 文件名 fail-open（core.quotePath=false）。AC1-AC9 全过；合并 main 后后端 1028 passed/4 xfailed、前端 790/0。归档提交时钩子在主检出拦下 prd.md 尾随空白并已修复。

### Git Commits

| Hash | Message |
|------|---------|
| `75a7dbe` | chore(hooks): 新增本机 pre-commit 门禁（gitleaks 暂存区扫描与快速自检） |
| `6ac0ab7` | docs: 同步 pre-commit 门禁说明至 README 与项目文档 |
| `11336bf` | docs(spec): Git 与工具规范补充本机 pre-commit 门禁条款 |
| `907e42b` | chore(merge): 同步主分支并合并 Change Log 双条目 |
| `301b870` | chore(merge): 合入本机 pre-commit 门禁任务分支 |

### Status

[OK] **Completed**


## Session 8: 10-08-test-isolation：后端测试会话隔离真实资源并引入覆盖率统计
<!-- trellis-session: v=2 fp=4994e963c95788ee -->

**Date**: 2026-10-08
**Task**: 10-08-test-isolation：后端测试会话隔离真实资源并引入覆盖率统计
**Branch**: `main`

### Summary

conftest 导入前强制 DB/上传路径到会话临时根（空密钥兜底、清 CRF_ENV、atexit+夹具双清理），会话级重定向截图/Word 导入临时目录；导出权限测试自建临时库；新增守卫测试；pytest-cov~=4.1 仅统计（基线 84%）。零配置 worktree 与主检出均 1030 passed/4 xfailed，主检出真实配置/上传/数据库前后快照一致；生产代码零改动。插曲：Bash cwd 每次重置导致早期两次误在主检出跑套件（已评估无损并写入记忆）；归档提交被 pre-commit 门禁拦下（规划文档尾随空格）后修正重提。

### Git Commits

| Hash | Message |
|------|---------|
| `68868e2` | test(backend): 测试会话隔离真实数据库与上传目录，并引入覆盖率统计 |
| `ff68f81` | docs(spec): 后端质量规范补充测试会话隔离契约 |
| `a7c37e9` | chore(merge): 同步主分支并合并变更日志条目 |
| `90a1962` | chore(merge): 合入测试会话隔离任务分支 |

### Status

[OK] **Completed**


## Session 9: 模板字段查询：来源直显表单 OID 与名称 + 表单 OID 检索
<!-- trellis-session: v=2 fp=2f2531c83b0df4ab -->

**Date**: 2026-10-09
**Task**: 模板字段查询：来源直显表单 OID 与名称 + 表单 OID 检索
**Branch**: `worktree-template-field-source-form-oid`

### Summary

来源列内联显示表单 OID 与名称；检索新增表单 OID 候选，按字段强、表单强、字段模糊、表单模糊四组排序；后端 sources[].form_code 增量字段并兼容旧库缺列；本地合入 main 并归档（271b622），未推送远端。

### Main Changes

- 后端：TemplateFieldSource 新增 form_code（空白、NULL、缺列均为 null），只读探测 form.code，合并与排除语义不变
- 前端：rankTemplateFieldMatches 复用共享模糊排序分域组合并按首现去重；来源列改为只读多行直显，不再弹出、不可复制
- 测试：后端 16→18 例、前端 28→48 例；文档同步 README 中英、三处 CLAUDE.md、cross-stack-contracts §12

### Git Commits

| Hash | Message |
|------|---------|
| `f8eccf4` | feat(template): 模板字段查询直显来源并支持表单OID检索 |
| `cb5fcaa` | docs(spec): 同步模板字段查询契约与任务记录 |
| `078aaa1` | chore(merge): 同步主分支并保留两项功能文档 |
| `1bef604` | docs(task): 记录模板字段查询整合验收结果 |

### Testing

- [OK] 前端：定向 74 / 全量 790 通过，lint、build 通过；templateFieldSearch.js 行 100% / 分支 91.53% / 函数 100%
- [OK] 后端：在最终 main 6580fc9 上重跑，定向 18 / 全量 1030 通过 + 4 xfailed
- [OK] 浏览器实测：DM 检索顺序、来源直显、复制、分页、重开保留、明暗主题与窄屏通过；整合后构建复查通过

### Status

[OK] **Completed**

### Next Steps

- 是否推送远端由用户决定；主副本 frontend/dist 需执行 npm run build 后才显示新界面

## Session 10: 10-08-small-defects：集中修复六个已核实小缺陷

**Date**: 2026-10-09
**Task**: 集中修复六个已核实小缺陷（复制丢样式 / 导出吞错 / 会话令牌竞态 / 删项目先删 Logo / 500 无堆栈 / 估算重复扣减）
**Branch**: `fix/small-defects`（已合入 main 并删除）

### Main Changes

- 后端：新增 `form_field_copy.py`（三条复制路径共用按模型列推导的复制函数）；`export_project_to_word` 透传 `ExportError`（400 + detail/code）且路由清理临时文件；`security_headers_middleware` 记录未处理异常堆栈；`build_cleanup_plan` 剩余容量只扣一次；`purge_project` 返回 Logo 相对文件名，两条彻底删除路径提交后经 `logo_storage_service.delete_file` 删文件（统一策略，兜底非法文件名）
- 前端：`useApi.js` 会话令牌守卫（`_buildRequestAuth`/`_isCurrentSession`），迟到响应不得覆盖或清除新会话令牌；契约 §3 第 4、5 条改写
- 测试：后端 67→69 文件（1030→1038 通过），前端 790→824 通过（新增 useApiSessionRace 34 例）；`helpers.commit_probe` 收拢 after_commit 观察块
- 审查整改：trellis-check（1 Low）+ code-review 十角度 24 项单票验证（6 CONFIRMED 全修、17 REFUTED 不扩展）；一段会话注入的越权"二轮改动"（export 裸 unlink 分支）已回退并复实

### Git Commits

| Hash | Message |
|------|---------|
| `d094d58` | fix(recycle-bin): 清理计划的估算剩余容量不再重复扣减 |
| `872946c` | fix(main): 未处理异常返回 500 时记录完整堆栈 |
| `3b67699` | fix(forms): 表单复制保留字段全部展示属性，三条复制路径共用复制函数 |
| `ff8768d` | fix(export): Word 导出的具体错误原样返回，不再被吞成通用失败 |
| `2708bab` | fix(admin): 彻底删除项目时先提交数据库再删除 Logo 文件 |
| `fbb1f37` | fix(auth): 迟到的响应不再覆盖或清除新会话的令牌 |
| `c7c1743` | fix(admin): 项目 Logo 清理统一走 logo 存储服务并兜底非法文件名 |
| `f5d32e5` | fix(export): 导出临时文件删除失败记录告警 |
| `204f1a1` | test(backend): 表单复制测试复用共享夹具并补齐类型注解 |
| `5f86be4` | docs(small-defects): 模块文档、README 计数与变更日志同步 |
| `0b3f1bc` | docs(spec): 会话作用域令牌契约与六项修复的代码规范同步 |
| `e837f6b` | chore(merge): 合入小缺陷修复任务分支 |

### Testing

- [OK] 后端：分支上 1038 通过 + 4 xfailed；合入后在最终 main（e837f6b）重跑同结果；TOTAL 覆盖率 84% 持平，改动文件无一下降（export 路由 72%→78%，purge 服务与新模块 100%）
- [OK] 前端：824 通过 / 0 失败，lint 0 错误（警告数与基线一致），build 通过
- [OK] 浏览器实测：复制表单后四个展示属性逐字节保留（计算样式 + 截图）；aCRF 导出错误界面直显具体 detail、API 返回 400 EXPORT_DATA_INCOMPATIBLE，非 aCRF 200 对照正常
- [OK] 审查：Haiku 前端只读审查、Sonnet 安全审查（无 High/Critical，令牌字符串即会话身份已核实）、trellis-check 补修后复查无 High/Low

### Status

[OK] **Completed**

### Next Steps

- 既有问题记录为后续任务素材：跨标签页响应体/缓存同步、`_pending` 去重误删、模板兼容列清单、前端测试桩共享模块、`config.py` 同类吞错
- 生产部署需另行执行（本次仅本地 main + 已推送）

## Session 10: 前端组件挂载测试：vitest + @vue/test-utils + happy-dom
<!-- trellis-session: v=2 fp=fmt-j10 -->

**Date**: 2026-10-09
**Task**: 10-08-frontend-mount-tests
**Branch**: `test/frontend-mount-tests`

### Summary

devDependencies 精确固定 vitest@5.0.3 / @vue/test-utils@2.5.1 / happy-dom@20.14.5；独立 vitest.config.js（include 只收 tests/component/**/*.spec.js）；setup.js 全局注册 Element Plus + ElMessage spy + 自动卸载；三个种子 spec（DesignNotesDialog 4 例 / SessionTimer 4 例 / 环境冒烟 1 例）。实现与文档由并行执行会话产出，本会话独立复推 RED/变异证据、合入 main 解决 6 处文档冲突、跑全部终审门禁并应用 3 条 code-review 修复（计数 68→69、模块基线注记、TOKEN_STORAGE_KEY 改导入）。合入 main（d89cb8d），未推送。

### Git Commits

| Hash | Message |
|------|---------|
| `3a1a911` | test(frontend): 引入 vitest 与 @vue/test-utils 组件挂载测试 |
| `c356aae` | docs(spec): 前端质量规范补充组件挂载测试约定 |
| `b2e11f7` | chore(merge): 同步 main 并合并文档冲突 |
| `e1750fb` | fix(frontend): 终审修正测试计数与令牌常量导入 |

### Testing

- [OK] node --test 824/0；vitest 3 文件 9 用例无 [Vue warn]；lint 0 errors；build 通过；prettier clean；npm audit 13 条零新增
- [OK] 三门禁：trellis-check（AC1–AC7 + hook 时序实证）、Haiku 只读（3 Low 0 阻塞）、code-review（3 条已修）

### Status

[OK] **Completed**

## Session 11: 测试会话隔离真实配置来源
<!-- trellis-session: v=2 fp=fmt-j11 -->

**Date**: 2026-10-09
**Task**: 10-08-test-config-isolation
**Branch**: `test/test-config-isolation`

### Summary

conftest 在 import main 前重定向 CONFIG_FILE 到会话临时根（不存在文件）、清除强制三项外的全部 _ENV_OVERRIDE_MAP 变量、密钥改为无条件会话随机；新增路径/环境变量两条守卫（失败只列名）；删除按名导入 CONFIG_FILE 陷阱；_TEST_CONFIG 补 database 指向会话临时根（code-review 发现注入配置原指向仓库根真实库）+ get_config.cache_clear() 导入顺序自愈 + DB_PATH 单一来源。多角度复审 8 路全收敛，处置矩阵入 verification.md。合入 main（de78f0c），未推送。

### Git Commits

| Hash | Message |
|------|---------|
| `3fbea07` | test(backend): 测试会话不再读取真实 config.yaml 与外部 CRF_* 配置变量 |
| `774c95b` | docs(spec): 测试会话隔离契约补充配置来源 |
| `bd3bccd` | test(backend): 测试注入配置的数据库路径指向会话临时根 |
| `a8d0010` | docs: 记录配置隔离复审处置与测试配置加固 |
| `a9f3b63` | refactor(tests): 会话数据库路径收敛为单一常量 |
| `08c8355` | test(backend): 配置缓存自愈清空与强制键绊线注释 |
| `6ace09b` | chore(merge): 同步 main 并合并测试策略与变更日志 |

### Testing

- [OK] 全量 1042 passed / 4 xfailed（毒文件在场/哨兵变量/敌意 8 变量/真实 config.yaml 拷贝四种条件均验证），TOTAL 84%
- [OK] 合入后主目录：后端 1042/4 + AC5 config.yaml sha256 前后一致；前端 824/0 + 9 vitest + lint/build 通过
- [OK] trellis-check 0 缺陷；后续改进记录：CRF_DISABLE_BACKGROUND_JOBS setdefault、_CONFIG_DIR 生产接缝 set_config_file()

### Status

[OK] **Completed**


## Session 12: backend-format 本地合入与归档
<!-- trellis-session: v=2 fp=fb92b08368f6eb1c -->

**Date**: 2026-10-09
**Task**: backend-format 本地合入与归档
**Branch**: `main`

### Summary

后端 Ruff format-only 配置与 134 个 Python 文件的纯格式整理已本地合入；完成行尾规范、AST 等价、全量测试、钩子验证及独立 Trellis 归档。

### Main Changes

- 本地合入代码提交 2f702eb；独立归档提交 0bb61d6。

### Git Commits

| Hash | Message |
|------|---------|
| `2f702eb` | chore(merge): 合入后端格式化分支 |
| `0bb61d6` | chore(task): 归档后端格式化任务 |

### Testing

- [OK] 后端 1027 passed / 4 xfailed；Ruff format --check、归一化 AST 比较、pre-commit 三场景复测通过。

### Status

[OK] **Completed**

### Next Steps

- 推进既有 export-layer-cleanup 子任务；不推送。


## Session 13: legacy-cleanup 本地合入、浏览器补验与归档
<!-- trellis-session: v=2 fp=4ed94b609f10f197 -->

**Date**: 2026-10-09
**Task**: legacy-cleanup 本地合入、浏览器补验与归档
**Branch**: `main`

### Summary

退役性能埋点与死代码清理已本地合入；补录隔离浏览器冒烟结果并完成独立任务归档。

### Main Changes

- 代码合入 f56a92d；归档提交 24cc83e；无推送或部署。

### Git Commits

| Hash | Message |
|------|---------|
| `f56a92d` | chore(merge): 合入退役代码清理分支 |
| `24cc83e` | chore(task): 归档退役代码清理任务 |

### Testing

- [OK] 后端 1027 passed / 4 xfailed、覆盖率 84%；前端 818 node:test + 11 vitest 通过，lint/build 通过。补充浏览器窄范围冒烟：登录、表单/设计器切换、新建字段保存、快速编辑打开通过；33 个请求均 200/201。

### Status

[OK] **Completed**

### Next Steps

- 继续 export-layer-cleanup；backend-dedup 等待 codelists.py 文件租约释放。


## Session 14: 引用删除审查跟进合入本地 main 并归档
<!-- trellis-session: v=2 fp=4c70497426a41de1 -->

**Date**: 2026-10-10
**Task**: 引用删除审查跟进合入本地 main 并归档
**Branch**: `main`

### Summary

完成引用删除复审跟进：修复四类批量删除接口的跨租户引用状态探测，补足后端 27 条与前端 29 条经变异验证的回归测试，校正文档与规格；后端 1098 passed / 4 xfailed、覆盖率 85%、ruff 通过，前端 node:test 893、vitest 11、lint 0 errors、build 通过。以 4 个分组提交和合并提交 5bcb961 合入本地 main（未推送、未部署），合入后冒烟测试后端 73、前端 82；归档 Trellis 任务为 ecc4ca9。浏览器未重跑，生产部署由用户执行。

### Git Commits

| Hash | Message |
|------|---------|
| `6e6a8cb` | fix(security): 批量删除引用预检限定本项目 id |
| `ab703ad` | test(reference-delete): 补强引用删除回归测试 |
| `f3fc979` | docs(reference-delete): 同步审查跟进文档与索引 |
| `bb419f2` | docs(spec): 更正引用删除与权限规格 |
| `5bcb961` | chore(merge): 合入引用删除审查跟进与批删隔离修复 |

### Status

[OK] **Completed**


## Session 15: 导出层整理合入本地 main 并归档
<!-- trellis-session: v=2 fp=7d14cb83cf23f376 -->

**Date**: 2026-10-10
**Task**: 导出层整理合入本地 main 并归档
**Branch**: `main`

### Summary

删除不可达 unified_landscape 导出分支并合并重复渲染（选项标签单一实现、结构行/控件分派共用、_add_forms_content 按版式拆分 cx 32→7），数据库导出移入独立模块；全程以任务本地金标（82 ZIP 条目逐步 0 差异）证明导出字节不变。合入前修正评审发现的过时测试描述、xfail 规范与残留表述范围；两个 changelog 冲突保留双方条目。合入后 main：后端 1098 passed / 0 xfailed、覆盖率 85%、ruff 干净、parity plain+annotated 均 exact 1.0、前端 node:test 893 + vitest 11、width fixtures 49 通过。未推送、未部署；worktree 与分支删除待用户确认。共享 worktree 中两处无主类型注解经复核后保留（全量套件与格式检查通过）。

### Main Changes

- 代码提交 18e6699（--no-ff 合入 refactor/export-layer-cleanup，含 b445272/0cda92b/462d0b2/653452b/e06cc12/c36718d 六步重构与三个文档/测试提交）
- 新模块 backend/src/services/database_export_service.py；test_export_unified.py 描述校正并新增普通字段底纹断言（并行 checker 认领）
- spec 更正：quality-guidelines xfail 约定区分保留路径与彻底删除路径；cross-stack §5 填写线行重写为无宽度回退规则

### Git Commits

| Hash | Message |
|------|---------|
| `18e6699` | chore(merge): 合入导出层整理与文档更正 |
| `509ac90` | chore(merge): 同步主线引用删除修复 |
| `d0aa4ae` | refactor(export): 校正混合布局测试与类型标注 |
| `76d8b54` | docs(spec): 更正导出布局与 xfail 规范 |
| `09c784c` | docs(export): 同步导出模块文档 |

### Testing

- [OK] 后端全量 1098 passed / 0 xfailed（worktree 与 main 各跑一次）；覆盖率 TOTAL 85%（export_service 88%、database_export_service 94%）
- [OK] 金标对比 82 entries / 0 differences（合并后重新导出 vs Step 0 before）；parity CLI plain+annotated exact 1.0 / 0 mismatch；test_word_table_parity 4 passed
- [OK] 前端 npm test：node:test 893 passed + vitest 11 passed（worktree，node_modules 临时软链已删）；columnWidthPlanning 49 passed（main）
- [OK] ruff format --check 149 files clean；git diff --check clean；git grep unified_landscape -- backend 零命中；index.json 校验 28 services

### Status

[OK] **Completed**

### Next Steps

- 波次 D 仅剩 backend-dedup：基于当前 main 开新 worktree；若提取批删 helper 必须保持先按项目取 own_ids 再做引用预检（防跨租户探测），由 test_batch_delete_isolation.py 守护
- ELC worktree 与分支删除需用户单独确认


## Session 16: 导出层整理终检跟进与清理确认
<!-- trellis-session: v=2 fp=a0226a0666a55b77 -->

**Date**: 2026-10-10
**Task**: 导出层整理终检跟进与清理确认
**Branch**: `main`

### Summary

用户确认后完成 ELC 收尾：修正两处遗留 unified 测试注释与跨栈契约中无宽度回退表述（评审收尾发现），补记归档验证记录；删除 refactor/export-layer-cleanup 工作树并删除已合入分支（本地，未推送）。

### Main Changes

- 3ca5771: test_export_service.py / test_export_column_width_override.py 遗留 unified 注释改为历史键表述
- aeb5047: cross-stack §5 无宽度填写线回退限定为 helper 直调（生产导出均传显式宽度）

### Git Commits

| Hash | Message |
|------|---------|
| `d298c8f` | docs(task): 补记导出层整理终检记录 |
| `aeb5047` | docs(spec): 收窄无宽度填写线回退表述 |
| `3ca5771` | docs(test): 更正遗留 unified 注释 |

### Testing

- [OK] 后端 test_export_service.py + test_export_column_width_override.py 52 passed；ruff format --check 通过；git diff --check 干净

### Status

[OK] **Completed**

### Next Steps

- 波次 D 仅剩 backend-dedup（基于当前 main 开新 worktree）；其余 5 个旧 worktree 分支均已合入但归其他波次/会话，清理需逐个确认

## 2026-10-10 (session) — 波次 C 两项任务：前端规则收拢 + 临时资源生命周期

### Main Changes

- 前端共享规则收拢（`feat/shared-rule-convergence` → main `c38e31b`）：三组件预览纯函数收敛 `previewCellRender.js`；字典快捷增/改共享 `CodelistQuickEditDialog.vue`（含竞态守卫：opProjectId 捕获 + isOperationStale + confirmAdd/confirmSave 对齐 + FieldsTab load 身份门）；列宽存储键与导出收集收拢 `useColumnResize.js`；访视预览多行默认值修复；横向选项两空格 R8 对齐；aCRF 常量一致性测试。
- 临时资源生命周期（`refactor/temp-resource-lifecycle` → main `340f1be`）：`temp_paths.py` / `upload_streaming.py` / `await_drain.py` 三个叶子模块；.db 与 docx 上传流式限长直写（独占 0600、BaseException 清理、半成品零残留）；.db 临时文件入归属目录 + 24h 清扫（含 SQLite 边车）；六端点线程池化 + `await_with_drain` 取消排水。
- 修复合并暴露问题：`referenceDeleteWiring.test.js` 锚点随弹窗迁移（quickSaveCodelist → CodelistQuickEditDialog.confirmSave）；`FieldsTab.vue` 未用 confirmDelete 导入（lint error）；aCRF 一致性测试 ruff 格式。
- OEL 归档、worktree/分支清理、main 推送均已完成。

### Git Commits

| Hash | Message |
|------|---------|
| `c38e31b` | chore(merge): 合入前端重复规则收拢与访视多行默认值修复 |
| `340f1be` | chore(merge): 合入统一临时资源生命周期与流式上传 |

### Testing

- [OK] 主检出后端 1144 passed / 857 warnings；ruff format --check 151 文件全过
- [OK] 前端 node:test 915/915、vitest 26/26、lint 0 errors（prettier warning 既有基线）、build 成功
- [OK] TRL 分支合并前 1144 passed；SRC 分支合并前 1099 passed（后端）/915 node:test/26 vitest
- [未运行] 浏览器交互验证：隔离 CDP 启动被安全分类器以 Security Weaken / Expose Local Services / Credential Materialization 拒绝，未绕过；严格 parity 用存量 preview JSON + 新导出 DOCX 比对（20/20 cells、8/8 rows、1.0/1.0）
- [未运行] PyInstaller 冻结构建（设计声明为 frozen 模式差异，未执行构建）

### Decisions

- 竞态守卫最终裁定：全量落地（弹窗 op-context pinning + FieldsTab 身份门 + 3 回归用例）。过程历经 8 次树翻转（消息队列乱序 + 裁定反转），最终按磁盘批准态收敛；教训已入记忆 `teammate-instruction-ordering`：消息全部按序执行、反转裁定须显式取代、震荡 ≥3 次后只批一次终态。
- `backend/.claude/CLAUDE.md` 合并口径：服务 31（含新 3 叶子模块 + database_export_service）、测试 71 文件（69 test_*.py）。

### Status

[OK] **Completed**（两项任务已合入 main 并推送；worktree/分支已清理；任务已归档）


## Session 17: 设计器引用保留修复合入 main 并归档
<!-- trellis-session: v=2 fp=f670c829213af920 -->

**Date**: 2026-10-10
**Task**: 设计器引用保留修复合入 main 并归档
**Branch**: `main`

### Summary

表单设计器引用字段库字段保留实例样式，仅在共享定义 9 键真实变化时写入并确认；合入 main、归档任务、清理 worktree 与分支并推送。

### Main Changes

- 90f45e1: 候选水合只替换 9 个定义级键，未保存展示属性不再被覆盖；normalizeDefinitionPayload 归一后一致即 definition_operation none；影响确认与 PUT 共用冻结参数；候选目标阈值降为其他 ≥1 表单；撤销/重做按正向实际写入回放并保留结构键；保存期互斥锁定全部冲突入口
- 8c6493c: 根/前端模块 CLAUDE.md 变更日志与 component-guidelines 契约表 +11 行同步
- 2023d3b: 任务工件归档（prd/design/implement/verification/research）
- c40cb09: 合入 main 前端规则收拢与临时资源生命周期（frontend/.claude/CLAUDE.md 唯一冲突：VisitsTab/FieldsTab 描述取主线弹窗化版本，FormDesignerTab 描述保留本任务语义）

### Git Commits

| Hash | Message |
|------|---------|
| `90f45e1` | fix(designer): 引用字段库字段时保留实例样式并仅在共享定义实际变化时确认 |
| `8c6493c` | docs(spec): 同步设计器引用保留文档与前端规格 |
| `2023d3b` | chore(task): 归档设计器引用保留任务 |
| `c40cb09` | chore(merge): 合入前端规则收拢与临时资源生命周期 |

### Testing

- [OK] 前端 node:test 944 passed / vitest 26 passed（5 文件）/ lint 0 errors / build OK；覆盖率 100.00 与 98.09（基线 95.20/97.40）
- [OK] 后端全量 1144 passed（合入树复核，后端零改动）
- [OK] 浏览器（临时库 :8906，最终树）：保留大字号/默认、纯换绑零弹窗零共享写入、真实共享改名确认并传播、撤销重做不重写字段库

### Status

[OK] **Completed**

### Next Steps

- 2e1fb91 已推送 origin/main；生产多用户环境部署由用户自行执行

## Session 18: 波次 D backend-dedup 合入 main 并归档
<!-- trellis-session: v=2 fp=backend-dedup-2026-10-10 -->

**Date**: 2026-10-10
**Task**: 波次 D — 后端路由 / 迁移 / 排序去重（backend-dedup）
**Branch**: `refactor/backend-dedup` → `main`

### Summary

波次 D 最后一项 `backend-dedup` 完成：R1–R6 去重，唯一行为变化为 R1（项目批量删除空列表 / >500 → 422）。R4b 保留管理员自愈移入新服务、R4a 排序回填抽通用助手、R2 复制改名梯子收敛、R3 模板导入错误映射收敛、R5 OrderService order/sequence 共用实现、R6 内联模型迁入 schemas/；独立代码审查 + 安全审查通过，同步 main、合并、归档、清理 worktree 与分支。

### Main Changes

- `0f0789c`: 保留管理员自愈逐字移入 `services/admin_bootstrap_service.py::heal_reserved_admin_account(engine)`，`init_db()` 同位置调用；12 条特征测试锁定全部分支
- `cddb2e5`: `_migrate_add_order_index` 六段同构回填抽为 `_backfill_null_order` + `_ORDER_BACKFILL_TARGETS`（标识符仅取自该元组，成员断言拒绝未登记目标），cx 29→7
- `cda2bb3`: 新增 `services/unique_name.py::first_free_name`，收敛 11 处复制 / 导入改名梯子；后缀 / 编号位置 / 起始编号留在调用方
- `073abf4`: `import_template.py` 三处错误映射收敛为 `_template_import_error_response`（404 / 普通 400 / 结构化 400）
- `6c0c546`: `OrderService` order / sequence 平行方法共用按列参数化的私有实现，保留自愈与位移方向不对称
- `127c06f`: 共享 `schemas/project.py::ProjectBatchDeleteRequest`（`project_ids` 1..500），两个项目批删端点共用；空列表 / >500 → 422（唯一行为变化）
- `51d103e`: 25 个内联 Pydantic 模型逐字迁入 `schemas/`（新增 `admin.py` / `template_import.py`）；OpenAPI 组件数 102→102
- `f9bb2f1` / `34a63b4`: 规格与模块文档同步
- `32bdb66`: `test_project_import.py` 补打桩 `admin_bootstrap_service.get_config`（审查跟进）
- `b215e51`: 合入 main（两处文档变更日志冲突，均保留）；`b490e1f`: main 合并 `refactor/backend-dedup`

### Git Commits

| Hash | Message |
|------|---------|
| `0f0789c` | refactor(backend): 保留管理员账号修复逻辑移出迁移代码 |
| `cddb2e5` | refactor(database): 排序列回填迁移抽取通用助手 |
| `cda2bb3` | refactor(backend): 复制改名梯子收敛为通用助手 |
| `073abf4` | refactor(import): 模板导入错误映射收敛为一个函数 |
| `6c0c546` | refactor(order): sequence 排序方法与 order_index 方法共用实现 |
| `127c06f` | fix(api): 项目批量删除共用请求模型并限制 1-500 条 |
| `51d103e` | refactor(schemas): 触碰路由的内联模型迁入 schemas |
| `f9bb2f1` | docs(spec): 后端去重后同步数据库规格与改名梯子说明 |
| `34a63b4` | docs: 同步后端去重后的模块文档与变更日志 |
| `32bdb66` | test(import): 补打桩 admin_bootstrap_service 配置命名空间 |
| `b215e51` | Merge branch 'main' into refactor/backend-dedup |
| `b490e1f` | Merge branch 'refactor/backend-dedup' |

### Testing

- [OK] 后端全量（合并树）1210 passed / 0 xfailed；`ruff format --check .` 167 files clean；`git diff --check` clean
- [OK] `class BatchDeleteRequest` grep 唯一命中 `schemas/__init__.py:9`；`heal_reserved_admin_account` 仅新模块定义 + `database.py` 导入 / 调用
- [OK] 前端 diff 相对 main 为空（无需 Haiku 前端审查）
- [OK] 独立代码审查（Sonnet 只读）：仅两处发现——设计明确排除的两处梯子（保持不动，非缺陷）+ `test_project_import.py` 打桩命名空间（已修 `32bdb66`）
- [OK] 独立安全审查（Sonnet 只读，R1/R4b）：CLEAN，无 Critical/High/Medium

### Decisions

- R2 保持 `docx_import_service` 表单名梯子与 `project_import_service._resolve_import_name`（先试原名）不动：design.md R2 显式排除，形状不同
- 批删 409 预检的 project 端点不加入跨栈契约 §14（该节只描述四个子资源端点）

### Status

[OK] **Completed**

### Next Steps

- 未推送（用户仅授权本地提交与合并）；生产部署由用户自行执行
- 波次 D 四项（legacy-cleanup / backend-format / export-layer-cleanup / backend-dedup）全部合入 main


## Session 19: 导入Word向导拆分（app-word-import-split）
<!-- trellis-session: v=2 fp=ee52c51641ea9b4b -->

**Date**: 2026-10-11
**Task**: 导入Word向导拆分（app-word-import-split）
**Branch**: `main`

### Summary

App.vue 的 Word 导入向导外移为 WordImportDialog.vue + useWordImport.js，新增 useDesignerFormSelection 就绪桥，前端套件与文档/规格同步，已合并 main 并推送

### Main Changes

- 新增 WordImportDialog.vue（v-model + 可空 projectId）与 useWordImport.js（上传/AI 复核轮询/建议接受/执行导入，逐次调用持有状态）
- App.vue 仅保留入口与可见性开关，resetSessionState 关闭向导；删除 20×50ms 盲等
- 新增 useDesignerFormSelection.js 就绪桥，卸载后迟到的 AI 响应不再写状态或续排
- 文档与规格同步：根/前端 CLAUDE.md、index.json、跨栈契约 §4/§9、frontend spec 新增就绪与生命周期测试契约

### Git Commits

| Hash | Message |
|------|---------|
| `02eff57` | fix(frontend): 导入后打开设计页改为等待设计器就绪再选中表单 |
| `f1f7379` | refactor(frontend): 导入Word向导从 App.vue 拆分为 WordImportDialog 组件与 useWordImport |
| `8a486bb` | fix(frontend): WordImportDialog 注入 refreshKey 时提供默认值 |
| `4be74c1` | test(frontend): 补齐导入Word向导生命周期与宿主 v-model 往返测试 |
| `98bc154` | docs(frontend): 同步导入Word向导拆分后的模块说明与测试索引 |
| `47ac218` | docs(spec): 沉淀异步组件就绪与导入向导生命周期测试契约 |
| `fd97dd6` | docs(frontend): 回填导入向导拆分的终检结果与验证限制 |
| `d9056df` | Merge branch 'refactor/app-word-import-split' |

### Testing

- [OK] node:test 944→954；vitest 组件 5 文件/26 例→6 文件/50 例；lint 0 errors（3546 warnings 基线持平）；build 4.12s；后端 pytest 1210 passed
- [OK] 两处修正均 RED→GREEN：refreshKey 注入默认值、卸载后迟到成功/失败响应不写状态；卸载守卫经隔离 /tmp 副本变异验证
- [OK] 本地 CSS 作用域差异探针：无新增选择器丢失；实机浏览器验收因临时测试凭据策略被拦截而未运行

### Status

[OK] **Completed**

### Next Steps

- visits-preview-split 等 designer-split 合入 main 后重新核实并执行；届时可复用 DesignerAcrfAnnotation
- 依赖审计：基线 npm ci 报 13 项漏洞（11 high），外部 audit 详情仍被权限拦截，需另行授权的私有 advisory 查询或升级任务
- 实机浏览器验收（上传→预览→执行→跳转设计页）仍待可用隔离凭据后补做，不能由本地 happy-dom 探针替代


## Session 20: 设计器拆分（designer-split）：预览模板与 aCRF 注释组件抽出并合入 main
<!-- trellis-session: v=2 fp=2e6bd352682fe45c -->

**Date**: 2026-10-12
**Task**: 设计器拆分（designer-split）：预览模板与 aCRF 注释组件抽出并合入 main
**Branch**: `main`

### Summary

FormDesignerTab.vue 的 aCRF 注释标记与 Word 预览模板抽出为无状态子组件，父组件保留状态/缓存/保存撤销/会话，已合入 main 并推送、归档

### Main Changes

- 新增 DesignerAcrfAnnotation.vue（133 行，per-marker 展示组件，pointerdown/reset 事件）与 DesignerWordPreview.vue（577 行，单 word-page 模板，父渲染两次 scope=main/designer，6 数据 props + 14 个函数闭包经 v-bind 透传）
- FormDesignerTab.vue 5985→4548 行（约 −24%）；父 script 差异仅 4 个 import hunk、previewHandlers 对象与删除 cumRatio/getRowHeightStyle 两个纯助手
- 8 个注释调用点、25 处 scope 替换（每块 24 getResizer + 1 normalFillChars）、9 个样式块/12 选择器全部随迁；getRowResizer 仍两参共享行缓存
- 新增测试：designerPreviewSplit.test.js（10 守卫）+ DesignerAcrfAnnotation.spec.js（8 例）+ DesignerWordPreview.spec.js（18 例）；6 个既有源码测试重指向新组件，paneSplit 未动
- 规格与文档：component-guidelines.md 新增 Stateless Word-Preview Extraction 场景、cross-stack-contracts §5/§6 同步；根/前端 CLAUDE.md、index.json、README 中英、changelog 归档同步

### Git Commits

| Hash | Message |
|------|---------|
| `6a34721` | refactor(designer): 抽出 aCRF 注释标记组件 |
| `8956090` | refactor(designer): 两套 Word 预览模板合并为 DesignerWordPreview |
| `b434ff0` | chore(merge): 同步主线导入向导拆分并复验设计器 |
| `cd0488d` | docs(spec): 记录设计器预览拆分约定 |
| `ecbcd6d` | docs(frontend): 同步设计器拆分文档 |
| `e317a2e` | Merge branch 'refactor/designer-split' |
| `54fd5fa` | chore(task): 归档设计器拆分任务 |

### Testing

- [OK] node:test 944→964（+10 designer），vitest 26→76（+26 designer）；lint 0 errors / 2884 warnings；build 3.94s；后端 pytest 1210 passed / 0 xfailed / TOTAL 87%（后端零改动）
- [OK] 独立等价证明：AST 语义比较 NONE、编译渲染 token 比较 IDENTICAL（两旧块），SHA256 产品哈希一致，负向变异矩阵均被捕获
- [OK] 浏览器 QA：baseline/baseline2/final 各 24 张截图逐字节一致，5/5 行为往返（注释拖拽、快改、列宽、行高、字典快速新增），console 0 错误；parity 报告与冻结基线字段级一致

### Status

[OK] **Completed**

### Next Steps

- 严格预览/导出 parity 仍为 73/79=0.924（6 项既有失配，非本次引入），未达成 1.0 目标；unified 预览分支 UI 不可达（挂载测试+双证明覆盖）；前端无数字覆盖率（未安装插件）
- visits-preview-split 可复用 DesignerAcrfAnnotation.vue；合入后 main=e317a2e（归档前），归档提交 54fd5fa


## Session 21: 访视预览弹窗拆分（visits-preview-split）
<!-- trellis-session: v=2 fp=303a9b39e1e17531 -->

**Date**: 2026-10-12
**Task**: 访视预览弹窗拆分（visits-preview-split）
**Branch**: `main`

### Summary

访视预览弹窗外移为 VisitFormPreviewDialog + useVisitPreviewAnnotation，修复 F1 四项预览缺陷与评审 F2；全门禁绿，QA 7/7，已合并 main 并归档

### Main Changes

## 交付内容

- 拆分 `VisitsTab.vue`（1545 → 552 行）：预览弹窗外移为自持权威 `FormResponse` 的
  `VisitFormPreviewDialog.vue`（796 行）+ 每次调用独立的注解胶水
  `useVisitPreviewAnnotation.js`（126 行）；父组件只剩开关桥（`showFormPreview` /
  `formPreviewFormId` / `openFormPreview`）与一个无条件挂载的弹窗实例。
- 修复 F1（四项预览缺陷）：打开路径改为 flush → `cachedGet('/api/projects/{pid}/forms')`
  解析权威表单 → `cachedGet('/api/forms/{id}/fields')`，单一请求序号；备注 aside、显式纸张
  方向、表单域注解、持久化字段偏移首开全部生效（拆分前 RED 4/4 → 拆分后 GREEN 4/4）。
- 评审轮 F2 修复：`projectId` 由按值捕获改为 ref（`toRef(props, …)`），消除项目程序化切换
  后注解 target 携带旧项目 id、缓存失效打偏的回归；另补项目切换 / 卸载两条生命周期用例。
- 测试：新增 `visitPreviewSplit.test.js`（9）、`VisitFormPreviewDialog.spec.js`（22）、
  `visitsPreviewIntegration.spec.js`（4，F1 探针保留转正）；8 个源码读取型测试文件 16 处
  重指向 + 1 处 DELETE/REPLACE（均给出等价替代）。
- 文档：根 / frontend 模块 `CLAUDE.md`、`.claude/index.json`、README 中英测试清单、
  `claudemd-changelog.md`；spec：`component-guidelines.md` 新场景 + `cross-stack-contracts.md`
  §5/§6/§7 归属更新。

## 验证

- node:test **973/973**（合并后 main 复跑）、vitest **10 文件 / 102 例**、lint 0 errors /
  2675 warnings、build 通过、backend pytest **1210 passed**。
- 浏览器 QA（任务内 harness，baseline `0d111a1` vs 分支树，同一 seed）：行为断言 final
  **7/7 pass / 0 known-red**；baseline↔final 差异逐项归属 D8，console / 网络 0 错误 0 失败；
  parity 无预览 JSON 可抽取，记录 not-run（未伪造）。
- 变异矩阵 (a)–(e) 全部咬合（(e) 组合变异由 lead 直接复核确认）；单点缓存别名变体记为
  已声明残留（verification.md §3）。

## 备注

- 两个独立评审（V2c-check sonnet 只读 + 沙箱变异、V2d-review haiku 只读）未发现运行时缺陷；
  F2 为其中唯一真实回归，已修复并补守卫。
- 归档 28 文件（含 12 张 QA JPEG 证据与 harness 脚本）随独立 `.trellis/` 提交入库。


### Git Commits

| Hash | Message |
|------|---------|
| `b8575cc` | refactor(frontend): 访视表单预览弹窗拆分并修复预览数据来源 |
| `6cb035c` | docs(frontend): 同步访视预览拆分文档 |
| `10722cb` | docs(spec): 记录访视预览弹窗拆分约定 |
| `a4aaaf9` | Merge branch 'refactor/visits-preview-split' |
| `0c86b1c` | chore(task): 归档访视预览弹窗拆分任务 |

### Status

[OK] **Completed**

## Session 22: 文档单一来源与过时内容清理（docs-sync）

**Date**: 2026-10-13
**Task**: 文档单一来源与过时内容清理（10-08-docs-sync，整改树 Wave F 收尾）
**Branch**: `docs/docs-sync` → 合入 `main`（`ecffbd3`）

### Summary

跨栈契约正文收敛为唯一来源；手写文件计数清除；`index.json` 清单与文件系统一一对应；
三份 CLAUDE.md 的变更日志统一并入归档。纯文档变更，无代码测试。

### Main Changes

- **R1 契约单一来源**：根 `.claude/CLAUDE.md` 的 `## Cross-Stack Contracts`（9,319 字符、
  13 条正文）改为 14 条 `§N` 指针（文件对锚点 + 指向
  `.trellis/spec/guides/cross-stack-contracts.md`）；后端模块删去纯复述行（列宽常量、
  fixture、parity、复选框）改为 §1/§5/§8 指针，三条 Development-Conventions 同步清单
  收缩为 §7/§6/§8 指针；前端同样处理 §1/§3/§5/§8。保留全部 UNIQUE/NO-SPEC 行
  （`useSortableTable.js`、localStorage 键语法、`.wp-form-title` 句、`snapToGrid`/`tcMar`
  机制、模板导入 OID、导出错误语义、表单复制契约）。
- **R2/R7 `index.json`**：补齐 5 个包标记 `__init__.py`，修复 2 处排序颠倒
  （`services` 的 `database_export_service.py`、`deploy.important_paths`），version
  1.4.2→1.4.3，timestamp→2026-10-13。18 个清单逐一与文件系统对账（0 缺 0 多），
  4 处排序例外有文档依据（`entry_files` 主入口在前、`commands` 工作流序等）。
- **R3 计数清理**：mermaid 9 个计数标签、Module Index 2 个 Tests 单元格、模块 Core
  Directories 各 6/4 处括号计数、4 处组件行数、README 中英各 2 句测试文件计数全部改为
  不计数表述；保留阈值/版本/历史数字（40k、`ruff==0.16.10`、JWT 60 分钟、
  `month=30`/`year=365`、changelog 叙事）。
- **R4 变更日志收敛**：后端 42 条 + 前端 59 条模块级 Change Log **逐字**并入
  `.context/history/archives/claudemd-changelog.md`（74→187 行，仅去重 2 条字节相同项并留
  注记），模块文件改为指针段；归档头部过时的「43 条」计数改为无计数溯源说明；根文件保留
  单行索引并新增本任务一行。
- **R5 收尾扫描**：路径/命令/README 一致性全量复查，另修出 4 类既有漂移——前端与 spec 的
  `apiUrl()` 绕过站点计数（9→11，漏 `OrganizationManagementView.vue`）、后端
  `repositories` 描述中的「field instances」（无此模块）、根文件「`.gitleaks.toml` 随 CI
  删除」句（实为删除后同日恢复供 pre-commit 使用）、三份 CLAUDE.md 的 `Last updated` 日期。
- **D8/D9 spec**：`cross-stack-contracts.md:62` 交叉引用 §12→§13；§1 补「CJK 码点范围属于
  契约」说明；§9 绕过站点清单更正为 eleven call sites（跨六个组件）；Tests Required 表两个
  示例测试路径改为真实文件。`git-and-tooling-conventions.md` 新增 §6
  「Change Log Convergence」（原 §6 顺延为 §7，并修掉指向旧编号的自引用）。
- **D5 模块清单**：两个 `## Related File List` 表改为指向 `.claude/index.json`
  （11 处漂移漏项一并消除；被删文件名均在正文或 index.json 中可查）。

### 验证（R6：纯文档变更，以字数/链接/路径检查 + diff 复核代替测试）

- 五项探针全 PASS：`reconcile_index`（18 清单 + 5 标记，0 缺 0 多）、`scan_order`
  （0 未解释颠倒）、路径检查（678 in-scope token 全解析）、spec § 交叉引用 + 锚点、
  `verify_fold`（101 条逐字在档、归档前缀字节不变）。
- 归档完整性：`git diff --numstat` = `+115/−2`，删除的仅 3–4 行头部；前缀与 HEAD 逐字节一致。
- 根文件字节数 40,921 → 35,377（限 40,000）；两模块文件合计 −111KB 而归档 +103KB
  （叙事是搬移而非删除）。
- 独立对抗式验证 workflow（5 代理 / 60 项）：46 CONFIRMED / 5 REFUTED / 9 PARTIAL；
  据其发现修 6 处（含 spec 侧补回 CJK 码点范围契约句）。Haiku 只读审查 3 项 OK +
  3 项 LOW 全修。两次评审后修复项均回归探针复跑通过。
- 实际运行的两个测试：`portDefaults.test.js` 4/4、`wordPageGeometry.test.js` 7/7
  （唯一读取本次改动文档的测试）；未运行其余测试套件，理由已写入 `verification.md`。

### Git Commits

| Hash | Message |
|------|---------|
| `f2cfe23` | docs(docs): 收敛跨栈契约单一来源并清理过时计数 |
| `f77a124` | docs(spec): 修正跨栈契约交叉引用并记录变更日志收敛约定 |
| `68dda42` | Merge branch 'main' into docs/docs-sync |
| `ecffbd3` | Merge branch 'docs/docs-sync' |

### Status

[OK] **Completed** — 已合并 `main` 并推送 origin；worktree 与分支已清理。

## Session 23: 字段拖拽落点修复（designer-field-drag-offset）

### 完成内容

- 修复 `FormDesignerTab.vue` 原生字段拖拽落点偏移：`onDrop` 改为按字段 ID 在
  `sortFormFieldsByOrder` 统一可见逻辑顺序中定位目标，`commitFieldDropAtBoundary`
  以 `insertIndex = boundaryIndex - (srcIdx < boundaryIndex ? 1 : 0)` 换算插入边界；
  新增 `onDropAtListEnd` 显式末尾落点（`.ff-drop-end`），同位/相邻/自身落点零请求零历史。
- 附带根因修复：行内批量选择框改 `:model-value` 布尔绑定 + `toggleFieldSelection`
  （消除 el-checkbox 数组 modelValue prop 类型警告，键盘空格共用）；挂载测试门禁
  「任何 Vue 警告即失败」要求修根因而非消音。
- 新测试：`tests/designerFieldReorder.test.js`（21 例行为测试，真实函数 bind 提取执行）
  与 `tests/component/FormDesignerFieldReorder.spec.js`（3 例真实挂载）；更新 4 个既有
  源码契约断言文件（onDrop→commitFieldDropAtBoundary 契约迁移 + 新接线锁定）。
- 文档同步：README.md / README.en.md 表单设计条目、`frontend/.claude/CLAUDE.md`
  FormDesignerTab 描述、`.claude/index.json` 测试索引。
- 浏览器验收（一次性后端 :8901 + 无头 Chrome，凭据经用户授权生成）：首次向下拖、
  向上拖、末尾落点+高亮、相邻 no-op 零请求、首位落点、撤销回放、刷新重开持久化、
  真实新增保存后拖动，8 项全通过；POST 逐笔核对 `{ordered_ids}`。

### 关键事实

- RED：16 失败 / 5 对照通过（与规划会话复现表逐字一致）；GREEN：21/21。
- 全量回归：node:test 995/995 + vitest 118/118；lint 0 error（+12 条测试文件风格警告）；
  build 通过。
- 测试 harness 教训：提取组件函数需「依赖形参前置 + .bind()」，保持组件内部调用签名；
  旧/新形参名差异（targetIdx/targetId）由 functionParams 动态解析。
- 应用 CSP `default-src 'self'` 阻止页面跨端口 fetch 辅助服务（非代理问题）；
  `localhost` 走 ::1 而后端听 0.0.0.0，浏览器验收一律用 `127.0.0.1`。
- 遗留：`.trellis/spec/guides/cross-stack-contracts.md:114-133` 排序接口示例仍与实际
  `{ordered_ids}`/HTTP 204 冲突，留作独立规范纠正改动。

### Git Commits

| Hash | Message |
|------|---------|
| `4681b07` | fix(designer): 字段拖拽按插入边界落点并新增末尾落点 |
| `f2580d3` | chore(task): 归档字段拖拽落点任务并记录实施决策 |

### Status

[OK] **Completed** — 待合并 `main` 并重启本地 8888 服务供用户人工测试。


## Session 24: 访视修改后跨实例刷新同步修复
<!-- trellis-session: v=2 fp=a8f43b7cd76f1ba6 -->

**Date**: 2026-10-15
**Task**: 访视修改后跨实例刷新同步修复
**Branch**: `plan/visit-flow-refresh`

### Summary

修复访视信息保存后已挂载的访视流程实例不刷新：reloadVisits 在权威本地重载后递增共享 refreshKey，copyVisit 接入同一等待边界；新增双保留实例 vitest 回归（RED→GREEN）与项目级 PUT 真实缓存控制用例；npm test/lint/build 全绿；一次性后端 + headless 浏览器实机走查 AC1/AC2/AC3/AC6 通过（截图在 /tmp/visit-flow-e2e-rxKy/evidence/）。发现既有 Sortable.destroy 陈旧 tbody 竞态（未修，已记入记忆）。
## Session 25: 字典快编影响提醒改为仅多表单时弹出
<!-- trellis-session: v=2 fp=4ccdc8fe48bebcdf -->

**Date**: 2026-10-15
**Task**: 字典快编影响提醒改为仅多表单时弹出
**Branch**: `plan/codelist-impact-multiform`

### Summary

前置 10-14 合并后同步基线 b909ca5 并激活任务;TDD 修复共享弹窗 CodelistQuickEditDialog.confirmSave 的影响提醒谓词(refs.length → countDistinctForms(refs) > 1,复用 fieldReferenceImpact.js 同表单合并口径),新增 7 用例阈值套件并将 5 处单表单影响 fixture 升级为双表单;全量前端 137/137、相关 node:test 112/112、lint/build 通过,浏览器实测通过;README×2 与 frontend 模块文档同步。

### Git Commits

| Hash | Message |
|------|---------|
| `9612205` | fix(visits): 保存访视后广播刷新信号同步访视流程实例 |
| `8b76b8e` | fix(frontend): 字典快编影响提醒仅多表单时弹出 |

### Status

[OK] **Completed**


## Session 26: 表单 OID 徽章去前缀并统一红框样式
<!-- trellis-session: v=2 fp=f38d691b95a31b4f -->

**Date**: 2026-10-15
**Task**: 表单 OID 徽章去前缀并统一红框样式
**Branch**: `worktree-form-title-oid-style`

### Summary

FormPreviewOid 纸面标题徽章改为仅插值 displayCode（去 OID: 前缀，值内字面 OID: 透传），经 buildAnnotationStyle 键过滤注入 4 个装饰变量实现与字段注记一致的红框（#c00000 边框/文字不透明、rgba 25% 底色、2px 圆角、border-box），保留文档流布局/10.5pt 字号/overflow-wrap；三套挂载测试前缀断言改纯值并新增字面透传用例，acrfViewToggle 新增红框装饰源码契约（注释剥离后负向断言）；vitest 145 全绿、lint 0 errors、build 通过；隔离环境浏览器实测全矩阵（主/全屏/访视预览、eCRF/aCRF、简明/空值、纵/横向换行与 4.8cm 保留区、明暗主题、计算样式与字段注记一致），凭据生成经 AskUserQuestion 授权。

### Git Commits

| Hash | Message |
|------|---------|
| `73e1597` | feat(frontend): 表单 OID 徽章去前缀并统一字段注记红框样式 |

### Status

[OK] **Completed**

## Session 27: 赛美斯 OID 长度限制（保存门禁+录入 maxlength）
<!-- trellis-session: v=2 fp=6bb35f7372320672 -->

**Date**: 2026-10-16
**Task**: 赛美斯数据库手工 OID 长度限制
**Branch**: `task/saimosi-oid-limit`

### Summary

赛美斯项目下字段 OID ≤8 位、表单 OID ≤10 位双层限制：保存门禁 editedOidLengthError（与基线值比较判定人工修改，未改动的系统生成/历史/复制默认值豁免，FIELD_/FORM_ 前缀形态不豁免；设计器候选绑定基线取 candidateOid 与 isCandidateRebind 判定同源，草稿取 __labelOidSeed 创建态快照，标签/日志行设计器内豁免）+ 录入层条件 maxlength（oidMaxLength，8/10，五处 OID 输入含 el-autocomplete 透传，程序化预填不受影响，其他项目不渲染）。TDD 先红后绿：策略套件 10 例 + 真实挂载 16 例（含 autocomplete 真实候选挑选→纯换绑 PUT→手输超长被拒）；全量 node:test 1007 / vitest 161 / lint 0 errors / build ✓；后端兼容 125 ✓；真机冒烟 7 场景全过（throwaway 环境 DB 级零写入验证，凭据经用户明确授权；el-tabs 渲染全部面板致无可见性过滤的按钮查询命中隐藏表单——假成功教训已入记忆）；用户浏览器实测确认后收尾。

### Git Commits

| Hash | Message |
|------|---------|
| `826b00f` | feat(frontend): 赛美斯项目 OID 长度限制（保存门禁+录入 maxlength） |
| `abe82bd` | docs: 同步赛美斯 OID 长度限制功能说明 |
| `a2dbbdd` | docs(spec): 沉淀赛美斯手工 OID 长度限制契约 |
| `4bf0c80` | chore(task): 归档 saimosi-oid-limit 任务 |

### Status

[OK] **Completed**
