# verification.md — 10-08-legacy-cleanup

Implement agent, 2026-10-09. Worktree `/home/decade/CRF-Editor-legacy-cleanup` (branch `refactor/legacy-cleanup`, from main `f68ebe1`). All commands carried their own explicit `cd`; backend pytest ran with the six proxy vars unset via `env -u`.

## Baseline (main `f68ebe1`)

| Suite | Command | Result |
|---|---|---|
| Backend | `cd backend && env -u ... python -m pytest -q` | **1042 passed, 4 xfailed** |
| Frontend node:test | `node --test tests/*.test.js` | **824 pass, 0 fail** |
| Frontend vitest | `npm run test:component` | **4 files, 11 tests passed** |
| Frontend lint/build | (gates, see Final) | — |

- `npm ci` run once in the worktree frontend before any test.
- ruff F401/F841 snapshot at main (files to edit): **10 findings** — main.py `request_id` F841 (inside the perf middleware), database.py `typing.Optional` F401, import_docx.py `verify_form_owner` + `Project` F401, export_service.py `json`/`math`/`Tuple`/`WD_TAB_ALIGNMENT`/`WD_TAB_LEADER` F401 + `docPr` F841. Saved at `/tmp/legacy-cleanup-impl/ruff_before.txt`.
- **Initial baseline coverage was omitted; this was corrected by the lead.** A detached worktree at `f68ebe1` was used to run the same full coverage command as the branch. Pure deletion does **not** prove a nondecreasing coverage ratio, and deleting tests may uncover surviving code. The comparison exposed two real coverage losses; the regular-test ports below restore them. The initial 1022/82% results below are historical intermediate results, superseded by the final 1027/84% results.

## Per-step evidence

### D4 — shrimp-rules.md
- Pre-delete grep: zero references outside `.trellis/tasks/*` and `.context/history/*` (both excluded from the check); no tooling/config reference.
- Deleted (`rm`). Post: `test ! -e shrimp-rules.md` passes.

### R7 — test_export_validation.py
- File matched research exactly (`sessionmaker` :8, helpers import :21, session fixture :24-33, engine fixture :36-50, create_project :53-57).
- Deleted the four zero-reference items; `engine` fixture kept (control).
- Targeted run after edit: **8 passed**.
- AC8 greps: `grep -nE "def session|auth_headers|login_as|create_project|sessionmaker"` → zero hits; `grep -n "def engine"` → 1 hit (now line 22).

### D5 backend — FieldRepository / FieldProfileResult
- `git grep -nw FieldRepository -- backend` at main: only `repositories/__init__.py:3,8` (re-export) + `field_repository.py:13` (definition). Note `FormFieldRepository` is a different, live class (excluded from the grep with `-w` + explicit filter).
- `git grep -n FieldProfileResult -- backend` at main: only `schemas/field_profile.py:117`. Not in `schemas/__init__.py`.
- Deleted `field_repository.py`; removed the import + `__all__` entry from `repositories/__init__.py` via `sed -i` (file carries historical `\r\r\n` line endings — Edit could not match, Write would have rewritten every line; sed removed exactly 2 lines, `git diff --stat` = "2 deletions"); removed the `FieldProfileResult` class from `field_profile.py` via Edit (11 deletions, module rest intact).
- Post greps: zero refs remaining (`git grep -nw "FieldRepository\|FieldProfileResult" -- backend frontend`, FormFieldRepository excluded).

### D5 CSS — main.css (15 deletions, verified per selector)
Each selector grepped in `frontend/src/**` (templates, `:class`, string-built names via `fd-[a-z-]+`/`ff-[a-z-]+` enumeration, classList/querySelector implied by template/class usage) and `frontend/tests/**`:

| Selector group | main.css lines (main) | Evidence |
|---|---|---|
| `.project-item .del-btn`, `.project-item:hover .del-btn` | 169-170 | `grep del-btn` outside main.css: zero hits |
| `.fd-library`, `.fd-library:hover`, `.fd-library-header`, `.fd-library-list` | 232-235 | src: zero; tests: only `doesNotMatch` guards on **Vue sources** (formFieldPresentation.test.js:479, orderingStructure.test.js:278, paneSplit.test.js:188) — none read main.css |
| `.fd-panel-resizer`, `.fd-panel-resizer:hover/.dragging` | 236-237 | src: zero; tests: same `doesNotMatch` guard class (paneSplit.test.js:117, orderingStructure.test.js:279) |
| `.fd-item`, `.fd-item:hover` | 238-239 | zero hits outside main.css anywhere |
| `.ff-item .ff-type` | 252 | zero hits |
| `.fd-item,` entry in SortableJS transition group | 258 | entry removed; rule kept for `.el-table__body-wrapper tbody tr` + `.ff-item` |
| `.fd-item.sortable-ghost/chosen/drag` entries | 267, 286, 301 | compound entries removed; `.ff-item.sortable-*` rules kept |

- Class inventory check: used `fd-*` = fd-autocomplete-*, fd-canvas*, fd-formlist, fd-notes-tooltip*, fd-right; used `ff-*` = ff-item/label/select-slot/selected/var-name. The 10 tests that read main.css assert none of the deleted selectors (verified by grep — only the three `doesNotMatch` source guards above).
- Not touched despite zero source hits (runtime-applied): `.el-*`, `.sortable-ghost/chosen/drag`, `.hover-row`.
- Post: `grep "del-btn\|ff-type\|fd-library\|fd-panel-resizer\|fd-item" frontend/src/styles/main.css` → zero.
- 「重复的默认值支持」规则：**未定位，未删除**（design/prd 已预期；短语在前后端源码与文档零命中）。

### D1 + D2 backend — perf removal

Transformer: `/tmp/legacy-cleanup-impl/perf_strip.py` (AST-driven line surgery: drop `src.perf` imports, splice `with perf_span(...)` bodies with one-level dedent, drop `record_counter`/`record_payload_size` Expr statements, drop dead locals after a side-effect-free RHS check, drop `attach_perf_sql_listeners` def+call+`import time` in database.py, drop `performance_baseline_middleware` incl. decorator in main.py). Apply log (abridged):

- database.py: import L12-17, `import time` L5, def L62-91, call L121.
- main.py: import L25-31, def+decorator L348-379.
- routers/export.py: import L17; withs L56/59/70/82/100; record_counter L87 (incl. `os.path.getsize` arg).
- routers/import_docx.py: import L29; withs L332/335/350/426/491/494/499/600(inside `finally:`); record_* L352/353/398/399; dead locals L393-397.
- routers/projects.py: import L20; withs L106/110/112/143/146/148/187/189/332/340; record_* L114/119/150/155/191.
- routers/visits.py: import L27; withs L408/418.
- services/docx_import_service.py: import L43; withs L1322/1457(returns kept)/1693/1717/1730/1797/2037/2083/2129; record_* L1622 + L1623-1626 (multi-line).
- services/export_service.py: import L23; withs L403/419/516/1572; record_* L412/413; dead locals L410-411.
- services/order_service.py: import L17; withs L487(valid_ids kept)/498/513/520/523(early return kept)/729(valid_ids kept)/738/753/760/763(early return kept); record_* L494/736.
- services/project_clone_service.py: import L15; withs L171/208(~145-line block incl. try)/354(copied_logo_name escapes with — order kept)/361.
- services/project_import_service.py: import L14; withs L239/241/244/251/258/262/284/286/289/303/310/314.

**AST proof (mandatory, design D1)** — verify mode re-applies the same transform to `git show HEAD:` content and asserts `ast.dump` equality with the on-disk branch file, per file:

```
backend/src/database.py: OK
backend/main.py: OK
backend/src/routers/export.py: OK
backend/src/routers/import_docx.py: OK
backend/src/routers/projects.py: OK
backend/src/routers/visits.py: OK
backend/src/services/docx_import_service.py: OK
backend/src/services/export_service.py: OK
backend/src/services/order_service.py: OK
backend/src/services/project_clone_service.py: OK
backend/src/services/project_import_service.py: OK
ALL CHECKS PASSED
```

(Re-run passed again after a cosmetic blank-run collapse in database.py — blank lines do not affect AST.)

Dead-local purity: the three `forms_count`/`fields_count` RHS were `len(...)`/`sum(len(...) for ...)` over `getattr(...)`/dict `.get`/comprehensions — read-only; the checker whitelists exactly those node shapes and refuses anything else. `py_compile` passed for all 11 files.

**F401/F841 before/after** (`/home/decade/.venvs/crf-editor/bin/ruff check --isolated --select F401,F841`, saved `ruff_before.txt` / `ruff_after.txt`): 10 → 9 findings; the diff is exactly the removal of the middleware's `request_id` F841 (the function was deleted). **Zero new findings** — no import became unused (`os` in export.py still used by `os.unlink` BackgroundTask; `Request`/`logging` in main.py still used by `security_headers_middleware`; `event`/`logger` in database.py still used by `_configure_sqlite`).

**Deleted files (10)**: `backend/src/perf.py`, `backend/scripts/generate_perf_fixture.py`, `backend/scripts/run_perf_baseline.py`, `backend/tests/test_perf_{baseline,busy_wait_metric,contracts,fixture,harness,redaction,reorder_spans}.py`. `test_perf_fk_indexes.py` untouched — explicit run: **1 passed** (AC2). Deleted-test count check: the 7 files contain exactly 6+1+2+2+6+2+1 = **20** test functions = the backend delta 1042→1022.

### D3 + D2 frontend

- `tests/formDesignerAuxiliaryData.test.js` created FIRST (5 non-perf FormDesignerTab tests moved verbatim from perfBaselineHelpers.test.js lines 13-79, header keeps only the `formDesignerSource` read) and run against the untouched component: **5/5 pass** before any component edit.
- App.vue (git diff = exactly 4 hunks): import line removed; `clearPerfEvents()` removed from `resetSessionState`; markPerfStart/End around `projects.value = await api.get('/api/projects')` removed (statement kept); `onMainTabChange` reduced to `activateTab(name)` (`firstActivation` dead local removed). `isTabActivated` stays (used at lines 212/232/1295+).
- FormDesignerTab.vue (git diff = exactly 6 hunks): import removed; `recordPerfEvent` blocks in `onDrop`/`openQuickEdit`/`toggleInline` removed; `const eventName` + both `markPerfStart`/`markPerfEnd` around the form-switch guard chain removed (chain kept); `openDesigner` keeps try/catch + `ElMessage.error`, only the three markPerf* calls removed.
- Deleted (5): `src/composables/usePerfBaseline.js`, `scripts/collectBuildMetrics.mjs`, `scripts/runBrowserPerfBaseline.mjs`, `tests/browserPerfBaselineScript.test.js` (2 tests), `tests/perfBaselineHelpers.test.js` (9 tests: 5 moved + 4 perf).

### D4 shrimp-rules.md / protected files

- `shrimp-rules.md` deleted; `git diff --quiet main -- AGENTS.md .trellis/.template-hashes.json .codex/config.toml` → **AC3-ok**.
- `git diff --quiet main -- backend/src/utils.py backend/src/services/ai_review_service.py` → **AC4-mask-untouched** (`mask_secret` / `_mask_api_key` zero changes).

## Final checks (implement.md §4)

1. Backend perf-token grep (`perf_span|record_counter|record_payload_size|from src.perf|from src import perf|src.perf|CRF_PERF_BASELINE|attach_perf_sql_listeners|performance_baseline` over `backend frontend .claude/index.json`): the only hit is **my own new Change Log line** in `backend/.claude/CLAUDE.md:132` (historical narrative — allowed by the check's "historical changelog lines" rule).
2. Frontend perf-token grep (excl. archive/history): hits are my three new Change Log lines (root `.claude/CLAUDE.md`, `frontend/.claude/CLAUDE.md`) plus one doc entry mentioning provenance — all intentional narrative; zero references in code, config, or index.json (an initial miss — `browserPerfBaselineScript.test.js` left in `.claude/index.json` — was caught by this check and fixed; index.json re-validated as JSON).
3. AC3 / AC4 / AC8 outputs: see above; `git diff --check main` clean.

## Suite counts vs baseline

| Suite | Baseline | After | Delta | Explanation |
|---|---|---|---|---|
| Backend pytest | 1042 passed, 4 xfailed | **1022 passed, 4 xfailed** | −20 | exactly the 20 test functions in the 7 deleted perf files; no new failures/skips/xfails |
| Backend + coverage | — | **1022 passed, 4 xfailed**, TOTAL 82% (9699 stmts) | — | coverage command per RB §3 |
| node:test | 824 pass | **818 pass, 0 fail** | −6 | −4 perf tests (perfBaselineHelpers: 9 total = 5 moved + 4 deleted) −2 (browserPerfBaselineScript); the 5 moved tests pass in the new file |
| vitest | 4 files / 11 tests | **4 files / 11 tests** | 0 | |
| `npm run lint` | — | **0 errors** (3612 prettier warnings repo-wide; changed files contribute 0 errors) | — | gate is 0 errors per implement.md |
| `npm run build` | — | **built in ~4s, exit 0** | — | |

Coverage of every edited production file (after; skip-covered report):

main.py 84%, database.py 79%, routers/export.py 79%, routers/import_docx.py 72%, routers/projects.py 89%, routers/visits.py 59%, schemas/field_profile.py 95%, services/docx_import_service.py 45%, services/export_service.py 87%, services/order_service.py 77%, services/project_clone_service.py 90%, services/project_import_service.py 99%. TOTAL 82%.

## Docs touched

- `.claude/index.json` — removed perf.py, 2 backend scripts, 7 perf tests (kept `test_perf_fk_indexes.py`), `field_repository.py`, `usePerfBaseline.js`, 2 frontend scripts, `browserPerfBaselineScript.test.js`, `perfBaselineHelpers.test.js`, the perf `next_steps` sentence; added `formDesignerAuxiliaryData.test.js` (alphabetical position). JSON re-validated.
- `backend/.claude/CLAUDE.md` — perf.py entry removed; tests 69→62 files / 67→60 `test_*.py`; "performance baseline" dropped from the test list (FK indexes kept); scripts line rewritten to the 4 real remaining scripts; infrastructure + repositories rows cleaned; repositories 5→4 modules; Change Log line added.
- `frontend/.claude/CLAUDE.md` — composables description (count already read 31, now true); scripts 3→1; perf test entry replaced by `formDesignerAuxiliaryData.test.js`; `usePerfBaseline.js` dropped from the file list; Change Log line added.
- Root `.claude/CLAUDE.md` — mermaid (repositories 5→4, backend tests 69→62, composables 32→31, frontend tests 76→75) and module-index counts (62 files / 60 `test_*.py`; 75 files / 68 node:test) — real file counts used (design.md predicted 75→ differs from actual text 76); one Change Log line.
- `.context/history/archives/claudemd-changelog.md` — full narrative appended.
- README.md / README.en.md — grepped: zero perf mentions, zero file/test counts stated → **no change needed**.
- Historical changelog lines (backend CLAUDE.md 137/158/164, commits.md/commits.jsonl) untouched.

## Kept and reported

1. **死局部纯度检查器扩展**：`fields_count`/`forms_count` 的 RHS（sum/len/getattr/dict.get/推导式，只读）最初被检查器判"可能不纯"；核验无副作用后扩展白名单而非保留死代码（design 的本意是排除有副作用的 RHS）。
2. **`repositories/__init__.py` 的 `\r\r\n` 行尾**：历史状态（backend/src 共 16 个文件同况），用 sed 按行删除，未 normalize（超出范围）；`backend-format` 后续会统一处理。
3. **database.py 删除后遗留 5 连空行**：收敛回文件原有 2 空行风格（AST 证明复跑通过）。
4. **「重复的默认值支持」规则**：未定位，未删除（全仓短语零命中；与 PRD/设计预期一致）。
5. **审查的"重复密钥脱敏函数"**：确认非重复，两函数 diff 零改动（AC4-ok），已移交 `backend-dedup`。
6. **覆盖率基线已补录**：最初的数学替代论证无效；主代理实跑 `f68ebe1` 和分支的逐文件对照，发现并修复两处非 perf 覆盖缺口。最终结果见 Coverage-preserving ports。
7. project_clone_service 6 处"新增"空行、visits/docx_import/project_import 各 1 处：均为原 with 体内既有空行在新位置的保留，风格一致，未清理。

## Not run

- **Browser 实机验证**：未跑。理由：本任务为纯删除型改动（AST 证明无新增/改写语句），用户可见行为面由双端全量套件 + 构建覆盖；design.md 未列浏览器检查项。
- **基线覆盖率逐文件对照**：已补跑，不再属于未运行项；见 Coverage-preserving ports。
- **Spec update review**: `git grep` under `.trellis/spec` found no references to the retired pipeline/classes. No live API, schema, or cross-stack contract changed, so no spec edit is needed for this child.
- **Lead documentation check**: corrected the remaining frontend module test count from 76/69 to 75/68 after checking actual files.

## Handoff notes for the lead

- 提交切分（design.md "Commits" 1-7）可按路径分组：commit 1 = `backend/src/perf.py`(D) + 11 个生产文件 + 2 scripts + 7 tests；commit 2 = `frontend/src/App.vue`、`FormDesignerTab.vue`、`usePerfBaseline.js`(D)、2 scripts(D)、2 tests(D)、`formDesignerAuxiliaryData.test.js`(新增)；commit 3 = `shrimp-rules.md`(D)；commit 4 = `field_repository.py`(D) + `repositories/__init__.py` + `field_profile.py`；commit 5 = `main.css`；commit 6 = `test_export_validation.py`；commit 7 = 全部文档（root/module CLAUDE.md、index.json、changelog archive）。`.context/current/branches/refactor/legacy-cleanup/session.log` 为决策记录（随 lead 决定去留）。
- 工作树 `git status` 已与上述清单完全对账，无计划外文件。

## Check agent (trellis-check, 2026-10-09)

- 全部 AC1–AC8 复核通过：perf token 双 grep 仅剩历史 changelog 行；AC3/AC4/AC8 grep 与受保护文件（`utils.py`、`ai_review_service.py`、`test_perf_fk_indexes.py`、`AGENTS.md` 等）diff 为空；`git diff --check main` 干净。
- 11 个后端生产文件 `git diff -w` 逐文件人工复核：纯删除、语句顺序保持；ruff `--isolated --select F401,F821,F841` main vs 分支 10→9 findings（唯一差异=被删中间件的 `request_id` F841），零新增。
- 前端 App.vue（4 hunks）/ FormDesignerTab.vue（6 hunks）均为纯 perf 编辑，无并发分支的他项改动混入；迁移测试与原文 13-79 行 `diff` 逐字节一致（VERBATIM-OK）；CSS 删除选择器全仓 grep 零残余使用（仅 Vue 源码 `doesNotMatch` 守卫，与 CSS 无关）。
- 实跑复核（与本文件记录一致）：后端 1022 passed / 4 xfailed；覆盖率逐文件 12 项 + TOTAL 82%（9699 stmts）全部一致；node:test 818；vitest 4 文件 11 用例；lint 0 errors；build 通过；`formDesignerAuxiliaryData.test.js` 单跑 5/5。
- **修正一处（check agent 已改）**：`README.md:462-463` / `README.en.md:462-463` 的测试文件计数（backend 69/67、frontend 76/69）被本任务变陈旧，原记录「README 无文件计数需更新」有误；已按实际数改为 62/60 与 75/68，两文件语义其余不动。
- PRD AC8 字面（`git diff --stat main -- backend/src` 为空）与 R1 删生产埋点自相矛盾，按其本意（R7 提交仅动测试文件）复核通过，未改 PRD。

## Coverage-preserving ports (2026-10-09, second pass per coordinator)

The lead's base-vs-branch coverage comparison (`--cov=src --cov=main`, base = `f68ebe1`) found two deleted perf tests were the only coverage of real, non-perf code. Per design.md D2 "Coverage-preserving ports" both were ported into regular tests; nothing else changed.

### New/changed test files

- **New** `backend/tests/test_docx_import_synthetic_tables.py` — ports the Word part of `f68ebe1:backend/tests/test_perf_fixture.py` plus the builder pieces it used from `f68ebe1:backend/scripts/generate_perf_fixture.py` (`_build_docx_fixture` → `_build_synthetic_docx`, `_add_preface_table` → `_add_syn_preface_table`, `_docx_label_for`/`_docx_value_for` → `_syn_docx_*`, `FIELD_TYPE_SEQUENCE`/`DOCX_*_TABLE_COUNT` → `SYN_*`). Self-contained: no `scripts.generate_perf_fixture` / `src.perf` imports, zero "perf" vocabulary (`PERF_` → `SYN_`). DB-fixture/determinism/merge parts not ported. Form-table count shrunk 40 → 4 (runtime); coverage gate verified against the full run, not guessed. 4 tests, AAA, behavior-named:
  - `test_parse_full_skips_preface_tables_and_pairs_every_form_title_with_its_table`
  - `test_parse_full_reads_every_field_type_in_expected_proportions`
  - `test_parse_full_parses_two_options_for_every_choice_field`
  - `test_parse_full_flags_log_rows_and_keeps_label_defaults_and_numeric_units`
- **Extended** `backend/tests/test_phase0_ordering_contracts.py` — new endpoint test following the file's codelists readback pattern:
  - `test_reorder_forms_persists_dense_order_in_readback` (creates 3 forms via POST, reorders `[C, A, B]`, asserts 200 `{"message": "Reordered"}` and readback ids + dense `order_index` `[1, 2, 3]`).

### Gate: per-file Miss vs base (`/tmp/lc-verify/base-cov.txt` vs `/tmp/lc-verify/branch-cov2.txt`)

Required targets: docx_import_service.py ≤ 266, routers/forms.py ≤ 22 — **both met**. Every other surviving file's Miss equals or beats base. All files whose Miss differs from base:

| File | base (stmts, Miss) | branch (stmts, Miss) | Verdict |
|---|---|---|---|
| `src/services/docx_import_service.py` | (823, 266) | (811, **265**) | improved (target ≤266 met) |
| `src/routers/forms.py` | (129, 22) | (129, **22**) | restored to base (was 25 before the port) |
| `main.py` | (238, 38) | (213, 34) | improved — covered perf middleware deleted |
| `src/database.py` | (509, 105) | (480, 99) | improved — covered perf listener deleted |
| `src/perf.py` | (140, 21) | deleted | intended (module removed) |
| `src/repositories/field_repository.py` | (15, 5) | deleted | intended (dead code removed) |

Every other file: Miss identical to base (diff script over all `term` rows; zero REGRESSION rows). TOTAL: base 84% (10009/1611) → branch 84% (9699/1574).

### Suite totals and runtime

- Full backend suite after the ports: **1027 passed, 4 xfailed** (1022 + 4 docx + 1 reorder; vs base 1042 = −20 deleted perf tests + 5 ported tests), 50.91s with coverage (`/tmp/lc-verify/branch-cov2.txt`).
- New docx test alone: **4 passed in 1.74s** (file ran standalone; ~1.7s test time inside the suite).

### Docs updates for the port (counts verified with `ls`, not arithmetic)

- Backend test dir now **63 `.py` files / 61 `test_*.py`** (`ls` verified). Updated: root `.claude/CLAUDE.md` (mermaid `tests (63)`, module index "63 files, including 61"), `backend/.claude/CLAUDE.md` (tests line, + "synthetic multi-type Word import parsing"), `.claude/index.json` (new entry `backend/tests/test_docx_import_synthetic_tables.py`, JSON re-validated), README.md:462 / README.en.md:462 (63/61; frontend 75/68 numbers from the check agent kept).
- Changelog clauses added noting the two non-perf coverages were ported: root `.claude/CLAUDE.md` Change Log line, `backend/.claude/CLAUDE.md` Change Log line, `.context/history/archives/claudemd-changelog.md` narrative (with the before/after Miss numbers).

## Final two pinpoint fixes (2026-10-09, per coordinator)

1. **Helper complexity** — `backend/tests/test_docx_import_synthetic_tables.py`: `_syn_docx_value_for` had 11 `if` returns (over the ≤10 complexity rule). Replaced by a test-local `SYN_VALUE_TEMPLATES` mapping + `.get(field_type, "SYN_PLACEHOLDER_{suffix}")` + `.format(suffix=...)`; every field_type output and the unknown-type fallback are byte-identical, no production constants referenced, no new module, function now has **0 if / 0 branching constructs**. Targeted verification (`/tmp/legacy-cleanup-impl/verify_value_helper.py`): old chain (verbatim from the pre-fix source) vs new mapping over **42 inputs** (11 field types + 3 unknown fallbacks × 3 index combos incl. 1/1, 4/40, 12/7) → **0 mismatches**; AST count of the new function: ifs=0. The 4 tests are unaffected and pass (see below). `_syn_docx_label_for` (2 branches) unchanged.
2. **Spec repositories subtree** — `.trellis/spec/backend/directory-structure.md` (worktree copy, for the lead's standalone `docs(spec)` commit): the repositories mini-tree (was lines 57-63) still listed the deleted `field_repository.py` plus three other never-current entries (visit/form/option_repository). Corrected to the real **4 repository modules + `__init__.py`** (`base/project/field_definition/form_field`), wording states the `__init__.py` exclusion; no other stale tree in the file touched.

**Correction of the earlier spec no-change conclusion**: the original spec scan grepped for class names (`perf`, perf APIs) and missed this tree because it keyed on the *file name* `field_repository.py` inside a directory listing; `.trellis/spec/backend/directory-structure.md` now needs exactly this one edit (others, e.g. the idealized services/routers trees, deliberately untouched per coordinator).

**Targeted verification** (full-suite re-runs skipped per coordinator; independent final full run = `/tmp/lc-verify/final-backend.txt`, 1027 passed / 4 xfailed, TOTAL 84%):
- `pytest tests/test_docx_import_synthetic_tables.py tests/test_phase0_ordering_contracts.py -q` → **26 passed**.
- Equivalence/complexity script → OK (42 inputs, 0 mismatches, ifs=0, branching=0).
- `git diff --check` → clean.

## Code-review disposition (final pass, 2026-10-09)

Code-review verdict: **生产行为零缺陷**（production behavior: zero defects）。处置：

- **已修 — spec stale tree**: `.trellis/spec/backend/directory-structure.md` repositories 小树仍列已删 `field_repository.py`（及 visit/form/option 三个从未存在的条目），已校正为真实 4 模块 + `__init__.py`（见上节修正 2；此前初轮 "spec no change" 结论系 grep 只搜类名未搜文件名所致，已在该节更正）。
- **已修 — 3 处事实性文档错误**（本轮，均在叙事文案，时序数字不动）：① "10 个 routers/services 文件"→**9**（git diff 文件列表核实 = 4 routers + 5 services；AST proof 含 main/database 共 11 不变），改 `backend/.claude/CLAUDE.md`、根 `.claude/CLAUDE.md`（"10 文件埋点"→9）、archive entry 三处；② 前端 node:test −6 拆分 −3/−3 →**−4 perf / −2 browser**（`perfBaselineHelpers.test.js` 原 9 用例 = 5 迁移 + 4 删除、`browserPerfBaselineScript.test.js` 恰 2 用例，`git show f68ebe1` 实数核实；总体 824→818 不变），改 `frontend/.claude/CLAUDE.md` 与 archive entry；③ archive entry "tests 69→62"→**69→63**（删 7 + 增 1）。主 checkout 本文件的初轮错误拆分（D3 节 "(3 tests)/(8 tests: 5 moved + 3 perf)" 与 Suite 表 "−3/−3"）同轮改正；初轮 1022 passed / TOTAL 82% 等时序数字保留为历史状态标记，未替换。
- **不采用 — onMainTabChange wrapper 建议**: 保留现有事件入口。本任务边界是只删埋点调用，将 `onMainTabChange` 重接为模板直绑 `activateTab` 属无行为收益的模板重接线，超出删除范围。
- **已修 — builder 回显 skipped_tables 恒真断言**: 主代理删除 `assert built["skipped_tables"] == SYN_SKIPPED_TABLE_COUNT` 及无用回显键；实际 document.tables 数量、解析表单数量和内容断言保留。两测试文件再次 26 passed；随后主代理完整后端+覆盖率与前端测试/lint/build 合入门禁均通过。
- **剩余运行缺陷：无。**
- **浏览器检查（后续补验，2026-10-09）**: 独立代理已完成隔离冒烟；普通用户登录→打开项目/表单→全屏设计器→A/B 表单切换→新增字段保存并经 API 确认→双击打开快速编辑，均通过。33 个请求均 200/201，后端日志 51 行无 ERROR/4xx/5xx，控制台无 JS 错误（仅 1 条 CSP eval issue）；截图 `/tmp/crf-e2e-lc-QWuQFG/designer-fullscreen-formA.png`。未覆盖 Word 导出/下载、访视预览、aCRF 注记拖拽和列宽/行高拖拽；CSP 提示来源未深查。代理已关闭自建页面和端口 8921 后端；未验证流程不得记为通过。

## Lead merge gates and local integration

- Final full backend + coverage after all code/test corrections: `pytest -q --cov=src --cov=main --cov-report=term` with the six proxy variables unset, **1027 passed / 4 xfailed**, TOTAL **84%** (9699 statements, 1574 missed). Log: `/tmp/lc-verify/merge-gate-backend.txt`. No surviving file has more missed statements than base `f68ebe1`.
- Final frontend: `npm test` **818 node:test + 11 vitest cases passed**; `npm run lint` **0 errors, 3612 existing warnings**; `npm run build` passed. Logs: `/tmp/lc-verify/merge-gate-{frontend,lint,build}.txt`.
- Sonnet final incremental `trellis-check`: clean. Haiku frontend read-only review and code-review completed; the dispositions above cover all verified findings.
- Eight task commits made separately, including the standalone `.trellis/spec` correction; every ordinary commit passed the existing pre-commit gate. Local `--no-ff` merge: **f56a92d**. No push or deployment.
- Browser evidence was completed after this integration checkpoint and is recorded above; the agent confirmed its page and port 8921 backend were closed. The LC worktree remains present; no other session resources were touched.
- The branch does not touch `codelists.py`. A subsequent narrow triage confirmed the reported reference-route authorization gap and identified five option-write endpoints. A separate peer reports owner guards, regression tests, and a clean security review on its task branch; that work is not part of this legacy-cleanup branch and has not been independently verified, merged, or deployed here.
