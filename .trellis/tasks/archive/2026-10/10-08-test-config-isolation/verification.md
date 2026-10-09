# Verification: test-config-isolation

## Status and authorization

- Implementation complete on `test/test-config-isolation` (worktree `/home/decade/CRF-Editor-test-config-isolation`), based on `main` @ `dbe347d`.
- Not yet authorized / performed: local merge into `main`, post-merge AC5 check, task archival, push.

## Commits

| Commit | Change |
| --- | --- |
| `3fbea07` | test(backend): 测试会话不再读取真实 config.yaml 与外部 CRF_* 配置变量（conftest 引导块、2 条守卫、陷阱导入删除、README 中英、根/backend CLAUDE.md、归档叙述） |
| `774c95b` | docs(spec): 测试会话隔离契约补充配置来源（quality-guidelines，Trellis 单独提交） |

## Gate results

| Gate | Result |
| --- | --- |
| trellis-check (sonnet) | **0 缺陷**；AC1–AC6 全过（AC5 留待合入后）；T1–T4 设计符合；全库 re-grep 无遗漏消费方；3 次全量 1042 passed / 4 xfailed（含哨兵变量、含毒文件在场），TOTAL 84% |
| conventions check (code-review 内部) | 5 项 CLAUDE.md 规则全过；index.json 无需改动确认；提交信息格式合规 |
| code-review skill | 3 条发现，逐条处置见下 |
| 独立验证（执行会话） | RED：路径守卫失败于仓库根解析；哨兵变量下环境守卫点名 2 变量（只列名）；AC2 毒文件使导入期崩溃 → 修复后毒文件在场全量通过；删毒文件复跑同数 |

## code-review findings disposition（3 条，均不改代码）

1. `conftest.py:17` `CRF_DISABLE_BACKGROUND_JOBS` 用 `setdefault`，shell 导出 `0`/`false`/空值可击穿 → 本任务 PRD「Out of Scope」明确「运行开关……conftest 现有处理不变」，**记为后续改进**（建议改赋值 `= "1"`，与相邻注释语义一致）。
2. `CONFIG_FILE` 重绑定后 `_CONFIG_DIR` 仍指仓库根（相对路径解析基准未动）→ 设计文档明确权衡并拒绝重定向（测试会话 DB/上传路径均为绝对注入）；实际触发需与发现 1 叠加，**维持设计决定**。
3. 守卫自持 `_FORCED_CONFIG_ENV` 字面量而非导入 → 设计文档明确「故意自持副本」作绊线；危险漂移方向（conftest 撤销强制项）由路径守卫先行变红兜底，**维持设计**。

## Not run / limitations

- AC5（合入后主目录 sha256 前后对照 + 全量）待合并授权后执行。
- AC1 字面 RED 复跑需回滚实现（被禁止）；已用直查片段 + 实现前 RED 记录补偿。
- 前端套件 / lint / build：分支零前端改动，不适用。
- ruff format --check：ruff 未安装（pre-commit 第 4 道门禁按设计跳过，待 `backend-format` 合入点亮）。
- 合入后需更新记忆笔记 `backend-test-environment`（其中仍描述本任务移除的残留）。

## Addendum: multi-angle code-review full disposition (2026-10-09)

Review fork ran 8+ finder angles (line-by-line, removed-behavior audit, cross-file tracer, language pitfalls, altitude ×2, simplification, conventions ×2). Consolidated disposition:

**Applied (4 commits):**
- `bd3bccd` `_TEST_CONFIG` gains `database=DatabaseConfig(path=TEST_ROOT/"crf_editor.db")` — the injected config object previously resolved db_path to the repo root (unguarded by the load_config()-based path guard).
- `a9f3b63` `DB_PATH` single-source constant (two literals → one).
- `08c8355` `get_config.cache_clear()` after the rebind (self-heals any future import-order regression that could cache real config) + cross-reference comments on both `_FORCED_CONFIG_ENV` copies (prevents the "fix by deleting the tripwire" misreading).
- Guard-file tripwire comment mirrored.

**Design/PRD-documented decisions maintained (not code defects):**
- `_CONFIG_DIR` not rebound (design-rejected; fail-closed latent trap; 4 angles confirmed known-accepted). Future production seam idea (`set_config_file()` rebinding both globals) recorded for a future task — production change, AC4-forbidden here.
- `CRF_DISABLE_BACKGROUND_JOBS` stays `setdefault` (PRD: runtime switches out of scope). With the `_TEST_CONFIG` fix, even a leak now binds engines to the session temp DB, not the repo DB.
- Standalone `test_should_redirect_config_file_under_test_root` kept (design T3 verbatim; spec error-matrix references by name).
- No behavioral default-value assertion on `load_config()` (design: flaky with mid-session patches); no per-test `TEST_ROOT/config.yaml` cleanup (design: convention in spec instead).
- Secret-shape (64-hex) tripwire rejected: cannot discriminate a reverted conditional + shell-held 64-hex prod secret; the unconditional overwrite already guarantees the session value is session-random.
- Order-blindness of the env guard (direct `os.environ` writes after the guard module runs) — latent, grep-verified zero current offenders; root conftest bootstrap remains the only module-level writer.

**Strongest merge evidence (angle-C hostile runs):** 8 hostile shell vars (incl. `CRF_ENV=production`, `CRF_DATABASE_PATH=/tmp/evil-leak.db`) → suite green, evil DB never created; real repo `config.yaml` copied into worktree root → suite green, file md5 unchanged (on `main` this scenario was a live defect: settings/recycle PUT tests could write the developer's real config.yaml — this change fixes it).

**Language note:** root `.claude/CLAUDE.md` Change Log line kept Chinese despite the global LLM-docs-English policy — the file's 43 prior entries (all user-accepted) are Chinese; file-local precedent wins for the index; the parallel `backend/.claude/CLAUDE.md` entry follows that file's English house style.

**Final suite state:** 1042 passed / 4 xfailed, TOTAL 84% (re-verified after every hardening commit).
