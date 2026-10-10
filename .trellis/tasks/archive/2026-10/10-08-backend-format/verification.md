# verification.md — backend-format §§2-3（基线与配置提交内容）

记录时间：2026-10-09。执行者：trellis-implement（Sonnet）。
范围：implement.md §2（基线）+ §3（配置提交内容）。**未做任何 `.py` 格式化**，等 lead 复核后做 commit 1。

## 环境

| 项 | 值 |
|---|---|
| Worktree | `/home/decade/CRF-Editor-backend-format` |
| 分支 | `chore/backend-format` |
| HEAD（基点） | `f56a92d`（`chore(merge): 合入退役代码清理分支`，即 legacy-cleanup 已合入的 main） |
| 起始工作树状态 | 干净（`git status --short` 无输出） |
| ruff | `0.16.10`（`/home/decade/.venvs/crf-editor/bin/ruff`，venv 内已装，未改 PATH，未装新包） |
| Python | `3.10.21`（venv） |
| tracked `.py` 总数（全仓库） | 182 |
| tracked `.py`（`backend/` 内，格式化范围） | 144（`core.quotePath=false` 复核，无非 ASCII 文件名、无 symlink、无未跟踪 `.py`） |
| backend 外的 38 个 `.py` | `.trellis/scripts` 6 + `.trellis/scripts/common` 21 + `.trellis/scripts/hooks` 1 + `.claude/hooks` 4 + `.codex/hooks` 3 + `.gemini/hooks` 3 —— 按 design 不格式化 |
| `backend/` 下原有格式化配置 | 无 `ruff.toml`、无 `pyproject.toml`（开工时 ls 复核，与 PRD 前提一致） |

## §2 基线（全量后端测试）

命令（runbook §3，代理变量已 unset）：

```bash
cd /home/decade/CRF-Editor-backend-format/backend && env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY /home/decade/.venvs/crf-editor/bin/python -m pytest -q
```

实测结果：**1027 passed, 4 xfailed**（687 warnings，42.51s）。格式化后须与此完全一致（同 passed / xfailed 数）。

## §3 配置提交内容（commit 1 的全部改动）

### 1. 新建 `backend/ruff.toml`

与 design.md 逐字一致（format-only，无 `[lint]` 节、无任何规则选择）：

```toml
# 仅用于 ruff format（代码格式化）；不启用任何 lint 规则。
# 版本固定在 requirements-dev.txt；行宽与引号按 2026-10-09 实测选取，使格式化改动最小。
target-version = "py310"
line-length = 120

[format]
quote-style = "double"
```

### 2. 修改 `backend/requirements-dev.txt`

在文件末尾追加：

```text
# Formatting
ruff==0.16.10
```

其余内容（`-r requirements.txt`、pytest/pytest-cov/hypothesis/pip-tools）未动。

## §3 步骤 3：`ruff format --check` 预期 RED 证据

命令：`cd backend && /home/decade/.venvs/crf-editor/bin/ruff format --check .`

- 退出码：**1**（存在待格式化文件；这是本步骤的预期结果，非构建失败）。
- 总结行：**`134 files would be reformatted, 11 files already formatted`**。
- 配置生效的间接证据：design 探测中行宽 120 + double 在 f68ebe1（154 文件）时为 143 files changed；本次 legacy-cleanup 后（144 文件）为 134，数量级与方向一致。

### 自洽性核对（执行中额外做的核实）

- 134 个 would-reformat 的唯一文件清单与 git tracked backend `.py` 列表做 `comm` 差集：**双向为空**（无列表外文件、无遗漏），清单存于 `/tmp/bf-reformat-files.txt`，完整诊断输出存于 `/tmp/bf-check.ltiOeC`（17000 行）。
- 显式传入全部 144 个 tracked 文件再跑 `--check`：`134 files would be reformatted, 10 files already formatted`，134 + 10 = 144，与 git 完全自洽。

### 已知 quirk（不影响门禁）

目录扫描（`ruff format --check .`）的总结行比显式列表多计 1 个 already-formatted（11 vs 10，即 145 vs 144），且三次复现稳定。已排除：symlink、未跟踪 `.py`、非 ASCII 文件名、`.ipynb`/`.pyi`、缓存首次/非首次差异（受控实验证实总结语义本身正常；该多出的 1 计入 already formatted，不产生任何改动项）。判定为 ruff 0.16.10 目录扫描的计数 quirk。§4 门禁只要求 "0 files would be reformatted" + AST 全等 + `git status` 仅含 `.py`，均不受影响。若格式化后目录扫描出现非 0 的 would-reformat 计数，届时再以显式 144 文件列表复核。

## 当前工作树状态

```
 M backend/requirements-dev.txt
?? backend/ruff.toml
```

再无其他改动。**没有任何 `.py` 被格式化**（0 个 `.py` 文件被修改）。

## 下一步（lead 检查点）

lead 复核上文后做 commit 1（`chore(backend): 引入 ruff 格式化配置并固定版本`，仅 `backend/ruff.toml` + `backend/requirements-dev.txt`）。本实现者随后按 implement.md §4 执行格式化 + AST 证明 + 全量测试，止于 commit 2 前的下一个检查点。

---

# §4 记录（commit 1 之后执行）

Commit 1：`bf57803`（backend/ruff.toml + requirements-dev.txt）。格式化在其上进行。

## 快照

- 唯一快照目录：**`/tmp/backend-format-snap.qZfzdk`**（`mktemp -d` 生成，未复用/删除任何已有目录）
- `before/`、`after/` 各 144 个 tracked `.py`（与 git 列表一致）。

## 格式化与稳定性

- `ruff format .`：**134 files reformatted, 11 files left unchanged**（134 与 §3 would-reformat 集合一致；"11+134=145" 为 §3 已记录的目录扫描计数 quirk）。
- `ruff format --check .`：**`145 files already formatted`，退出码 0** —— 0 files would be reformatted，结果幂等稳定。

## 语义等价证明（R3 / AC2）

`research/ast_equivalence.py before after`（venv python 3.10.21）：

```
files=144 raw_ast_diff=1 normalized_ast_diff=0
raw-only (docstring reflow): ['tests/test_export_service.py']
normalized diffs: []
```

- **normalized_ast_diff = 0**（门禁通过）。
- 唯一 raw-only 差异与 design 预言的文件一致（`test_export_toc_entries_immediately_follow_title_without_blank_line` 的 docstring，ruff 在 `"""` 与以 `"` 开头的正文间插入一个空格，避免 `""""` 四连引号）：

  - before：`""""目录"标题段之后紧跟首条目录条目，中间无空行；条目紧邻标题不在文档末尾。"""`
  - after：`""" "目录"标题段之后紧跟首条目录条目，中间无空行；条目紧邻标题不在文档末尾。"""`

  纯 docstring 空白差异，无运行时影响。

## 工作树改动范围

`git status --short` 共 134 条，**全部为 `.py`**（`grep -v '\.py$'` 无输出）；无 config/db/uploads/coverage 等其他条目。

## 行数前后对照（PRD Background 所列文件）

| 文件 | before | after |
|---|---|---|
| `src/routers/fields.py` | 530 | 478 |
| `src/services/order_service.py` | 835 | 571 |
| `src/routers/import_docx.py` | 887 | 628 |
| `src/routers/visits.py` | 456 | 397 |
| `src/services/docx_import_service.py` | 2116 | 1647 |
| `main.py` | 614 | 488 |
| `src/services/export_service.py` | 4351 | 3602 |

全局（144 文件合计）：47717 → 45006 行；空行 11955 → 9487，空白行占比 **25.1% → 21.1%**（与 design 探测的 26% → 21% 吻合）。

## 回归门禁（AC6）

格式化后全量后端套件（与基线同命令）：**1027 passed, 4 xfailed, 687 warnings（41.83s）**——与基线 1027/4/687 完全一致，无新增失败。

## 下一步（lead 检查点 2）

本实现者已停止：未 add / 未 commit。等 lead 复核 diff 与本记录后做 commit 2（仅 134 个被格式化的 `.py`，提交信息注明"只改格式不改语义"）。hook、blame-ignore、docs、spec（commit 3/4 与 §5）待 lead 放行后再动。

---

# §4+ 行尾事件（lead 复核 commit 2 时发现并修复，2026-10-09）

Commit 2 首次提交被 pre-commit 门禁 Gate 2（`git diff --cached --check`）拦下：gitleaks 通过，但 17 个文件报尾随空白。

- **根因**：这 17 个文件是历史 `\r\r\n`（CRCRLF）行尾（legacy-cleanup 的 kept-and-reported #2 明确移交本任务统一）。ruff 0.16.10 读取后把行尾写成了**纯 CR**（逐字节核实：`backend/app_launcher.py` LF=0、CRLF=0、bare CR=203）。Python 通用换行可解析，故 AST 证明与全量套件未暴露；但 git 视每行为尾随 `\r`，门禁正确拦截。
- **修复**：17 个文件统一改写为 LF（先 `\r\n`→`\n` 再 `\r`→`\n`，断言零残留 CR）。清单：app_launcher.py、models/{codelist,field,field_definition,unit,visit,visit_form}.py、repositories/{__init__,base_repository,field_definition_repository,form_field_repository}.py、routers/__init__.py、schemas/{__init__,unit,visit}.py、services/__init__.py、utils.py。修复后全 backend `grep -rP '\r' --include='*.py'` 零命中。
- **修复后重跑全部证明（lead 独立执行）**：
  - `ruff format --check .` → `145 files already formatted`，exit 0（0 待格式化；145 vs 144 为 §3 已记录的目录扫描计数 quirk）。
  - AST 证明（before 快照 = bf57803 内容，即 f56a92d 格式化前状态 vs LF 修正后全树）：`files=144 raw_ast_diff=1 normalized_ast_diff=0`，唯一 raw-only 仍为 `tests/test_export_service.py` 的 docstring reflow（见 §4 记录）。
  - `git diff --cached --check` 干净；`git status` 仍仅 134 个 `.py`。
  - 全量后端套件复跑（LF 修正后）：见下方补记。

## §4+ 全量套件复跑补记

lead 复跑（LF 修正后）：**1027 passed, 4 xfailed, 687 warnings（40.51s）**，与基线完全一致。日志 `/tmp/bf-final-suite.txt`。commit 2 放行。

---

# §5 记录（commit 2 之后执行，等 lead 提交 commit 3/4）

## 1. blame 忽略（R4 / AC4）

仓库根新建 `.git-blame-ignore-revs`，登记 commit 2 的完整哈希 `fb1ae18853310861d79a603447afbfacac294493`，并注释原因与启用命令 `git config blame.ignoreRevsFile .git-blame-ignore-revs`。

AC4 检查（`backend/src/routers/import_docx.py`）：

```
git blame --ignore-revs-file .git-blame-ignore-revs -- backend/src/routers/import_docx.py | grep -c fb1ae18  → 0
git blame -- backend/src/routers/import_docx.py | grep -c fb1ae18                              → 15
```

通过：忽略文件时格式提交不再作为行来源，普通 blame 可见该提交。

## 2. pre-commit Gate 4（R5 / AC5）

`.githooks/pre-commit` 改为调用 `ruff format --check -- "$f"`，检查 `$?`：状态码 1 走「未通过」消息，其余非零走包含状态码的「运行出错」消息。语法检查 `sh -n /home/decade/CRF-Editor-backend-format/.githooks/pre-commit` 通过。

三场景验证使用唯一临时目录 **`/tmp/bf-hook-verify.gbPTOM`**（mktemp 生成；未清理/复用任何现有 `/tmp` 目录），临时仓库通过 `.git/config core.hooksPath` 调用本分支 hook；PATH 显式前置 `/home/decade/.venvs/crf-editor/bin`。gitleaks 使用仓库现有配置副本，初始空提交通过。

| 场景 | hook 实测输出 | git commit 退出码 | 结果 |
|---|---|---:|---|
| 干净 `-foo.py` | `1 file already formatted`，hook 完成 | 0 | 通过；同时验证 `--` 防止文件名被当作选项 |
| 未格式化 `unformatted.py` | `ruff format --check 未通过：unformatted.py（请运行 ruff format 修正后重新暂存提交）`，hook 中止 | 1 | 正确阻止 |
| 非法 `ruff.toml` | `ruff format --check 运行出错（状态码 2，详情见上方输出）：ok.py`，hook 中止 | 1 | 正确区分 ruff 运行错误 |

备注：最初一轮临时脚本通过 `tail` 管道取退出码，得到的是 `tail` 状态而非 git commit 状态；随后已修正为直接捕获 git commit 的真实退出码并分别重跑场景 2/3，表中仅列真实结果。最终场景 2 在移除场景 3 留下的非法配置后重测，确保错误归因正确。

## 3. 用户文档同步（R4 / AC7）

README 中英同步新增后端格式化小节：format / `--check` 命令、`ruff==0.16.10` 与 `backend/ruff.toml` 的位置、`blame.ignoreRevsFile` 启用方法、钩子 Gate 4 仅在 PATH 可找到 ruff 时启用，及退出码 1 与其他非零的报错区分。格式提交说明了 134 个 Python 文件与其中 17 个历史 CRCRLF 行尾统一。

- `/home/decade/CRF-Editor-backend-format/README.md`
- `/home/decade/CRF-Editor-backend-format/README.en.md`
- `/home/decade/CRF-Editor-backend-format/backend/.claude/CLAUDE.md` — Common Commands 与 Development Conventions
- `/home/decade/CRF-Editor-backend-format/.claude/CLAUDE.md` — Common Commands 与单行 Change Log
- `/home/decade/CRF-Editor-backend-format/.context/history/archives/claudemd-changelog.md` — 完整任务叙事
- `.claude/index.json` — updated the backend `commands` metadata with the two ruff format commands and `git config blame.ignoreRevsFile .git-blame-ignore-revs`, per the root documentation-sync rule.

## 4. 规范同步（独立提交范围）

以下 `.trellis/spec/` 文件单独列出，供 lead 与非 spec 文档分开提交：

- `/home/decade/CRF-Editor-backend-format/.trellis/spec/guides/git-and-tooling-conventions.md` §6：Gate 4 更新为定案事实（`--`、退出码 1 vs 其他非零、PATH 激活条件、ruff 版本/配置），新增旧分支跨格式提交合并配方与 blame-ignore 约束。
- `/home/decade/CRF-Editor-backend-format/.trellis/spec/backend/quality-guidelines.md`：格式化器从 black 改为 `ruff format`，标注 format-only 配置和版本位置；Checklist 命令改为 `ruff format .`。原有 lint 条目未改动，本任务未启用 lint 规则。

## 5. 终验状态

- `git diff --check main` 与 `git diff --check`：均通过，无空白错误。
- `cd backend && /home/decade/.venvs/crf-editor/bin/ruff format --check .`：退出码 0，`145 files already formatted`（0 个待格式化；目录计数 quirk 见 §3）。
- 全量后端回归：**1027 passed, 4 xfailed, 687 warnings（44.06s）**，与 §2 基线完全一致。
- 当前分支未提交改动共 8 个非 spec 文件（`.git-blame-ignore-revs`、`.githooks/pre-commit`、README 中英、root/backend 两份 CLAUDE.md、`.claude/index.json` 与 changelog）+ 2 个规范文件（单独提交范围）；无任何 `.py` 改动。主 checkout 中本验证文档是唯一任务记录改动。
- 本实现者不会 add/commit。lead 复核后把上述非 spec 与 spec 分开提交（commit 3/4）。

## Lead 独立复测（2026-10-09）

lead 首次独立尝试没有把 `/home/decade/.venvs/crf-editor/bin` 加入 PATH，导致 hook 跳过 ruff 格式检查；该轮验证无效，不作为证据。随后在新的临时仓库 `/tmp/bf-hook-lead-rerun.YH2cSS` 中将该 venv bin 前置到 PATH 后重测，结果：

| 场景 | 实测结果 |
|---|---|
| 干净 `-foo.py` | commit rc 0，格式检查通过 |
| 未格式化文件 | commit rc 1，输出「未通过」 |
| 非法 ruff 配置 | commit rc 1，ruff 状态码 2，输出「运行出错」 |

该复测独立确认 `--` 分隔符和退出码分支行为；不覆盖、不替代上方 implementer 自己的 `/tmp/bf-hook-verify.gbPTOM` 记录。

## Code-review disposition (2026-10-09)

- `code-review` initially found `.claude/index.json` omitted the new backend formatter commands, contrary to the root documentation-sync rule. Fixed by adding a backend `commands` array for `ruff format`, `ruff format --check`, and `git config blame.ignoreRevsFile .git-blame-ignore-revs`.
- Re-review confirmed the command metadata resolves the finding; JSON validation passed and no in-repository source consumer of `index.json` was found.
- No remaining code or documentation findings. Ruff lint/mypy and frontend tests were not run: this task is format-only and has no frontend changes; browser verification is not applicable.

## Final post-documentation gate (2026-10-09)

- Full backend suite after all commits: **1027 passed, 4 xfailed, 687 warnings (40.50s)**; log `/tmp/bf-post-doc-final-suite.txt`.
- `git diff --check f56a92d...HEAD`, worktree `git diff --check`, `sh -n .githooks/pre-commit`, and `cd backend && ruff format --check .` all passed (`145 files already formatted`).
- `.claude/index.json` parses with Python's `json.tool`; the new backend commands array is present. `.git-blame-ignore-revs` still yields 0 format-commit blame lines vs 15 in plain blame.
- Final pending uncommitted paths are clean after the four planned commits; no frontend file changes, no push.
