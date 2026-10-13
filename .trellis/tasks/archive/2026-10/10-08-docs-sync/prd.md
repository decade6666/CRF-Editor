# 文档单一来源与过时内容清理

## Goal

- 让 `.trellis/spec/guides/cross-stack-contracts.md` 成为跨栈契约（前后端必须同步演进的规则）的唯一权威文档，其他文档只放链接、不再复述。
- 清掉手写的易过时内容：文件计数、模块清单漂移、`.claude/index.json` 漏项、重复的变更日志。
- 本任务是整个整改树的最后一环：清掉前面所有代码任务合并后累积的文档漂移。

## Background（证据核实于 2026-10-08）

- 审查说法更正："根 `.claude/CLAUDE.md:38` 模块表 backend/frontend 各重复一行"已不成立——当前根 `.claude/CLAUDE.md` 第 38 行只有一行 backend、第 39 行只有一行 frontend（已 grep 计数各为 1）。该项无需修复，但仍应防止回归。
- `.claude/index.json` 漏项（已核实，与审查"漏 1 个 router + 6 个 service"一致）：缺 `backend/src/routers/organization_presets.py`；缺 `backend/src/services/field_normalization.py`、`field_profile_service.py`、`field_type_policy.py`、`logo_storage_service.py`、`organization_preset_service.py`、`project_profile_service.py`（index.json 列出 13 个 router / 19 个 service，实际为 14 / 25 个模块文件）。其余小节同样有漏（已核实）：models 10/11、schemas 7/9、backend tests 54/65、frontend components 15/16、composables 29/32。
- 同一契约多处复述（已核实存在）：列宽、复选框、aCRF 注记、日期格式、排序、认证等契约同时出现在根 `.claude/CLAUDE.md`（Cross-Stack Contracts 节）、`backend/.claude/CLAUDE.md`、`frontend/.claude/CLAUDE.md` 与 `.trellis/spec/guides/cross-stack-contracts.md`，改一处极易漏其余。
- 变更日志多处存放（已核实）：根 `.claude/CLAUDE.md` 的 Change Log（自称"单行索引"，完整叙述归档于 `.context/history/archives/claudemd-changelog.md`）、`backend/.claude/CLAUDE.md` 与 `frontend/.claude/CLAUDE.md` 各有自己的 Change Log——同一任务的事件最多在三处出现。
- 手写计数易漂移（已核实现状）：根 `.claude/CLAUDE.md` 写 "backend/tests/ 65 files"、"frontend/tests/ 69 files"、routers/services 计数等；`backend/.claude/CLAUDE.md` 另有一套计数；整改期间多任务合并后这些数字必然再漂移。
- 体量约束（已核实）：根 `.claude/CLAUDE.md` 当前 26,266 字符，上限 40,000 字符（文件自身规定），整理时必须保持在上限内。
- `AGENTS.md` 保留（用户已拍板）：被 `.trellis/.template-hashes.json` 与 `.codex/config.toml` 引用，本任务不触碰。
- 若前面任务未全部合并，本任务的"清理漂移"会清错对象——必须最后执行。

## Requirements

- R1：契约单一来源：逐条核对四处文档中的跨栈契约复述，把 `.trellis/spec/guides/cross-stack-contracts.md` 定为唯一正文；根/模块 `.claude/CLAUDE.md` 只保留一行摘要 + 指向链接，删除重复叙述。语义零变化——只删复述，不改契约内容。
- R2：修 `.claude/index.json`：补上 1 个 router 与 6 个 service 漏项；并把每个文件清单小节（routers、services、models、schemas、backend/frontend tests、components、composables 等）逐一与 `backend/src/`、`frontend/src/` 实际文件对照补齐（各小节当前均有漏，见 Background；数字以执行时的 main 为准）；更新 timestamp/version 字段。
- R3：处理手写计数：删除各文档中易过时的文件计数（如 "65 files"），或改为不易过时的表述；如选择加自动校验脚本，属于工具链变更，必须先征得用户同意才实施，默认只删不改。
- R4：变更日志收敛：以 `.context/history/archives/claudemd-changelog.md` 为完整叙述归档地；根 `.claude/CLAUDE.md` 保留其自身规则要求的单行索引；模块级 Change Log 收敛为只保留近期条目或链接（具体方案 design 阶段定，不违反根文件的 40k 字符与单行索引规则）。
- R5：全树收尾核对：Waves A-E 各任务合入后，重扫根/`backend`/`frontend` 三个 `.claude/CLAUDE.md`、`.claude/index.json`、README 中英中的过时描述（命令、入口、计数、模块清单）并统一修正。
- R6：本次为纯文档变更：以字数/链接/路径检查和 diff 复核代替测试，并在验证报告中注明未运行代码测试。
- R7：修正 `.claude/index.json` 清单里的排序颠倒，修改后 JSON 仍须合法。以下核实于 main `6580fc9`，执行前在最新 main 上复核：
  - 要修的 4 处。这几个清单的其余条目都按字母序排列，只有这一处错位：
    - `modules[0].tests`：`backend/tests/test_docx_temp_isolation.py` 排在了 `test_docx_screenshot_service.py` 前面，两者对调；
    - `modules[0].infrastructure`：`backend/src/rate_limit.py` 排在了 `perf.py` 前面，两者对调；
    - `modules[1].components`：`OrganizationManagementView.vue` 被放在第 2 项（紧跟 `AdminView.vue`），移到 `LoginView.vue` 与 `ProjectInfoTab.vue` 之间；
    - `modules[3].important_paths`：`deploy/crf-editor.service.template` 排在了 `crf-editor.env.example` 前面，两者对调。4 项里只有这一对不按字母序，也没有文档说明它按部署步骤排列。
  - 不改的清单：
    - `modules[1].tests` 按不区分大小写的字母序排列，`modules[1].composables` 按区分大小写（ASCII）的字母序排列。两者各自内部一致，不为统一规则整表重排；
    - `modules[0].entry_files`、`modules[1].entry_files`（主入口在前）、`scan_summary.ignored_patterns`（按规则类别）、`scan_summary.next_steps`（按建议优先级）本来就不按字母序。
  - R2 补漏新增的条目，按所在清单的既有排序规则插入。

## Acceptance Criteria

- [ ] AC1（对应 R1）：任一跨栈契约的完整正文只在 `cross-stack-contracts.md` 出现一次；根与模块 CLAUDE.md 中的对应段落变为摘要 + 链接；链接全部可点开（路径检查通过）。
- [ ] AC2（对应 R2）：`.claude/index.json` 的每个文件清单小节（routers/services/models/schemas/tests/components/composables 等）都与实际文件一一对应，不只 router/service（一次性脚本或手工核对留证，以执行时的 main 为准）。
- [ ] AC3（对应 R3）：各文档不再含手写文件计数（或校验脚本已获用户批准并落地）。
- [ ] AC4（对应 R4）：变更日志归档地唯一；根 `.claude/CLAUDE.md` 仍满足其单行索引与 40k 字符上限（字数统计留证）。
- [ ] AC5（对应 R5）：Wave A-E 合入引入的过时描述已清理；三份 CLAUDE.md、`index.json`、README 中英相互一致。
- [ ] AC6（对应 R6，验证方式说明）：未运行任何代码测试；以 `wc -c`、链接/路径存在性检查、全文 grep（确认无重复契约正文、无失效路径）与逐文件 diff 复核代替。
- [ ] AC7（对应 R7）：用一次性脚本扫描 `.claude/index.json` 的全部字符串清单：除 R7 列出的「不改」清单外，没有残余的排序颠倒（以执行时的 main 为准，含 R2 新增的条目）；`python3 -m json.tool .claude/index.json > /dev/null` 通过。

## Out of Scope

- 不改任何代码与测试文件；不改 `.trellis/spec/` 下契约正文语义。
- 不删除 `AGENTS.md`、`.trellis/.template-hashes.json`、`.codex/config.toml`。
- 不新增校验脚本（除非用户批准 R3 的脚本方案）。
- 不重写 README 的功能介绍（只修命令/计数/路径层面的过时内容）。
- 全局非目标：不做重写 / 换技术栈 / 微服务 / TypeScript 迁移；不引入 Alembic 或版本表迁移；不合并不同的数据库会话类型、排序规则或撤销保护；不做通用 CRUD 列表组件；不做大范围"防御性代码"清理；不重写 Word 导入解析器；不引入 Redis/Celery。

## Dependencies and Order

- 前置：整改树其余全部子任务（`docx-temp-ownership`、`test-isolation`、`small-defects`、`pre-commit-gate`、`temp-resource-lifecycle`、`shared-rule-convergence`、`legacy-cleanup`、`backend-format`、`backend-dedup`、`export-layer-cleanup`、`frontend-mount-tests`、`designer-split`、`visits-preview-split`、`app-word-import-split`、`test-config-isolation`）都已合入 `main`。
- Wave F，最后一个执行；不阻塞任何任务。
- 一个任务 = 一个 worktree + 一个分支，检查通过后本地合入 `main`（Trellis 文档更新单独提交，不与代码混提——本任务自身即纯文档，提交信息用 `docs(scope)` 前缀）。

## Before Starting

这是范围文档。开工前必须基于当时最新的 main 补写 design.md 和 implement.md（Trellis 对复杂任务的要求），并重新核实上面的行号。执行流程见父任务 `implement.md`（公共执行手册）。
