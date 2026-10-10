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
