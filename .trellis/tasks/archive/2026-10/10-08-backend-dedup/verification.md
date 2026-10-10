# backend-dedup verification

## Step 0/1 baseline (lead, 2026-10-10)

- Worktree: `/home/decade/CRF-Editor-backend-dedup`
- Branch: `refactor/backend-dedup` (created from main `e591f83` after export-layer-cleanup merged)
- Worktree status at creation: clean (fresh worktree off main).
- Full backend suite (proxy vars unset, `CRF_DISABLE_BACKGROUND_JOBS=1`): **1098 passed, 0 xfailed** (50.25s).
- `ruff format --check .`: 149 files already formatted.
- Wave C coordination: `temp-resource-lifecycle` also edits `routers/projects.py` (per design.md). Announcement message sent to peer session crf-editor-2c before the first edit; `projects.py` will not be touched without explicit coordination.

Not run at baseline: coverage (to be measured per item on edited files).

## Baseline complexity (lead, AST counter `research/complexity.py`, decision points + 1)

| Target | cx | lines |
|---|---:|---:|
| `_heal_reserved_admin_account` (database.py) | 15 | 84 |
| `_migrate_add_order_index` (database.py) | 29 | 193 |
| `OrderService.get_next_order` / `get_next_sequence` | 1 / 2 | 26 / 6 |
| `OrderService.insert_at` / `insert_at_sequence` | 3 / 3 | 62 / 29 |
| `OrderService.move_to` / `move_to_sequence` | 4 / 5 | 94 / 44 |
| `OrderService.delete_and_compact` / `_sequence` | 1 / 1 | 46 / 24 |
| `OrderService.reorder_batch` / `_sequence` | 7 / 7 | 54 / 38 |
| `OrderService.compact_after_batch_delete` / `_sequence` | 2 / 2 | 19 / 15 |

Matches research §4 (§「≈15」「≈29」).

## Item 1 — R4b admin healing move (commit `0f0789c`)

Lead-verified evidence (independently re-run, not just implementer-reported):

| Check | Result |
|---|---|
| Function move fidelity | AST compare old `_heal_reserved_admin_account` body vs new `heal_reserved_admin_account` body: **body identical = True**; only intended diffs are the def name, the added `engine: Engine` annotation, and `-> None` (repo style for new modules) |
| Characterization-first | 12 tests in `tests/test_admin_bootstrap_service.py` passed against the UNTOUCHED original before the move (implementer-reported), 12 passed after; re-run by lead: 12 passed |
| Focused suites | `test_admin_bootstrap_service.py` + `test_user_admin.py`: **50 passed** |
| Full suite | **1110 passed, 0 xfailed** (baseline 1098 + 12 new) |
| Coverage of new module | `src/services/admin_bootstrap_service.py` **100%** (40/40 stmts) |
| `ruff format --check .` | 151 files already formatted |
| Import cycle | new module imports `src.config` + `src.services.auth_service` only; verified no `src.database` import |
| `database.py` imports | `is_production_env` / `hash_password` / `has_usable_password_hash` removed (no remaining use); `get_config` kept (used by `get_engine`) |

Deviations kept-and-reported:

1. **Final-check branch is unreachable on real data** (branch 10): the leading promote UPDATE sets `is_admin=1` for every TRIM-matching row, and the final check selects exactly that row — so "no usable admin" cannot occur after a non-raising repair. Locked with a stateful stub (`is_production_env` side_effect `[False, True]`); documented in the test docstring. Kept as a guard.
2. **`tests/test_user_admin.py` +2 lines**: research §4's "zero coverage" claim was wrong — 5 `init_db`-level tests exercised the function indirectly via `_run_init_db_for_test`, which patched only `src.database.get_config`. After the move, 3 of them went RED (patch no longer reaches the moved module); the fix adds one `monkeypatch.setattr("src.services.admin_bootstrap_service.get_config", …)` line in that helper. Mechanical patch-namespace fix, no assertions changed. This RED evidence also confirms the move is real (the old namespace path no longer reaches the logic).

## Item 2 — R4a backfill helper (commit `cddb2e5`)

Lead-verified evidence:

| Check | Result |
|---|---|
| Old-vs-new equivalence | Implementer probe: AST-extracted OLD `_migrate_add_order_index` vs new implementation, each run twice on fresh copies of the legacy fixture; full snapshots (6 data tables + indexes + column lists) identical (57 rows per run). Lead spot-checked the new code: helper semantics (has_table guard, DISTINCT group query, skip-empty, `COALESCE(MAX,0)+1`, per-row UPDATE) match the old blocks |
| Complexity (lead AST counter) | `_migrate_add_order_index` 29 → **7** (44 lines); `_backfill_null_order` **5** (29 lines); both ≤ 10 |
| Idempotency / AC4 | `test_init_db_twice_yields_identical_order_rows` runs real `init_db()` twice on a legacy sample; pinned numbering asserted after run 1 |
| Injection line of defense | `_backfill_null_order` raises ValueError for any (table, group, order) not in `_ORDER_BACKFILL_TARGETS`; identifiers interpolated only from that tuple |
| Focused tests | 38 passed (order-index migration + phase0 ordering + admin bootstrap) on the merged tree |
| Full suite (merged tree) | **1160 passed, 0 xfailed** (post-merge count includes item-1 + item-2 tests plus the newly merged Wave C suites) |
| `ruff format --check .` | 161 files already formatted |
| Deviations | Placeholder name unified (`pids`/`cid` → `:group_value`) — text() binds by name, SQL behavior identical. Nothing else |

Merge note: `main` advanced during item 2 (Wave C `340f1be` merged temp-resource-lifecycle + other sessions' work). Item-2 changes were stashed, `main` merged as `778d4e8` (no conflicts in item-2 files), stash restored, full gated re-run, then committed. `routers/projects.py` was changed by Wave C on main; the dedup `R7(a)`/R6 work on that file must build on the merged state.

## Item 3 — R2 copy-name ladders (commit `cda2bb3`)

Lead-verified evidence:

| Check | Result |
|---|---|
| Helper | new `services/unique_name.py::first_free_name(first, numbered, is_taken, start)` — pure loop; suffix/number-position/start stay with callers |
| Sites swapped (11) | A: `codelists._build_codelist_copy_name`, `fields.copy_field_definition`, `forms.copy_form`, `visits.copy_visit` (per-candidate DB probe, `X_copy`→`X_copy1`→…, start 1). B: `project_clone_service._resolve_copy_name`, `admin._resolve_restore_name` (prefetched set, `(副本)`/`(恢复)`, start 2; each keeps its own set query — clone includes deleted, restore excludes). C: `import_service._make_unique_name` / `_make_unique_import_codelist_name` / `_make_unique_var` / `_make_unique_code` (in-memory set, `_导入`/`（导入）`/`_IMP`, start 2) |
| Wrappers kept | every public/private name retained; all 7 callers resolve (grep-confirmed: codelists:126, project_clone:172, admin:149, import_service:517/782/900/955) |
| Not merged (design) | `project_import_service._resolve_import_name` (try-original-first) — locked with its own test so it is not folded in later; visit-form copy (copies `sequence`, no rename) |
| Characterization-first | 21 tests in `test_copy_name_ladders.py` (A group via HTTP copy endpoints 0/1/2 collisions; B function-level incl. owner-scope + recycled-project cases; C parametrized 0/1/2 per wrapper; `_resolve_import_code` collision semantics; try-original-first lock) green before and after |
| Focused | 21 passed; implementer's wider focused set 202 passed |
| Full suite | **1181 passed, 0 xfailed** |
| `ruff format --check .` | 163 files already formatted |
| Deviations | None from design.md R2. Transient during swap: `fields.copy_field_definition` briefly missed the `first_free_name` import → endpoint ladder test caught it (500), fixed; the endpoint-level characterization tests are what surfaced it |

## Item 4 — R3 template-import error mapping (commit `073abf4`)

Lead-verified evidence:

| Check | Result |
|---|---|
| Helper | `import_template._template_import_error_response(exc)` — FileNotFoundError → raises `HTTPException(404, str(exc))`; ValueError with 「模板库不兼容」→ returns `_compatibility_error(msg)` (structured JSON); other ValueError → raises `HTTPException(400, str(exc))`. Raising (not returning) the HTTPException variants preserves the FastAPI handler path |
| Endpoints | all three (`preview_import` / `preview_form_fields` / `execute_import`) now `except (FileNotFoundError, ValueError) as e: return _template_import_error_response(e)`; `execute_import` keeps its trailing `except Exception → logger.exception + 500` |
| `_compatibility_error` | stays in place; `template_fields.py` import unaffected (verified) |
| Not touched | `projects.py` `ImportError` mapping + `import_docx.py` mappings (different shapes — no `code` field, different statuses); `import_docx.py` not read/modified |
| Characterization-first | 12 tests in `test_import_template_error_mapping.py`: 3 mappings × 3 endpoints parametrized + execute 500 + unconfigured-path 400 + `_compatibility_error` shape lock; service methods monkeypatched to raise so the mapping itself is locked; structured-vs-plain split asserted by presence/absence of `code` |
| Focused | 115 passed (new file + template field index + phase0 ordering + import service) |
| Full suite | **1193 passed, 0 xfailed** |
| `ruff format --check .` | 164 files already formatted |
| Deviations | None. Test-authoring fix only: initial byte-exact JSON assertion assumed `ensure_ascii`; switched to `json.loads` equality — no production change |

Drift note: `main` advanced another 7 commits during items 3–4 but changed **no backend `src`/`tests` files** (frontend designer-reference-preservation + task archives only); the branch will be re-synced before the final merge.

## Item 5 — R5 OrderService twins (commit `6c0c546`)

Lead-verified evidence:

| Check | Result |
|---|---|
| Public API | AST compare vs `HEAD`: 12 public methods, **0 missing, 0 added, 0 signature changes**; exactly 5 new private impls (`_get_next`, `_insert_at`, `_delete_and_compact`, `_reorder_batch`, `_compact_after_batch_delete`) |
| Pair merge fidelity | `_get_next(column, ensure_initialized)` — order inits, sequence takes raw `max`; `_insert_at` — order `position <= max` gate, sequence unconditional two-phase, sequence never inits; `_delete_and_compact(direction)` — order `direction=-1` + `column < 0` phase-2 predicate, sequence `direction=+1` + `column > old + SAFE_OFFSET` predicate (branch by direction); `_reorder_batch` / `_compact_after_batch_delete` — only the sign differs. `move_to` / `move_to_sequence` bodies left **separate** (park-at-0 vs min/max offset) per design |
| Asymmetry intact | grep: no sequence-family public method calls `_ensure_initialized`; no sign flipped (verified against old `HEAD` blobs of `insert_at`, `insert_at_sequence`, `delete_and_compact`, `delete_and_compact_sequence`) |
| Characterization-first | 14 tests in `test_order_service_sequence.py` (get_next_sequence max+1 / no-heal / all-NULL→1; order-heals-vs-sequence-does-not pair; insert shift-into/append/out-of-range/no-heal; move forward/backward/no-op/out-of-range; delete_and_compact; compact_after_batch_delete) green before and after |
| Equivalence probe | implementer ran old vs new OrderService through 8 identical op sequences on fresh in-memory DBs with real `UniqueConstraint`, snapshots compared after **every** op incl. intermediate states, exceptions compared as (type, message) — all 8 identical |
| Complexity (lead counter) | `_get_next` 3, `_insert_at` 6, `_delete_and_compact` 3, `_reorder_batch` 7, `_compact_after_batch_delete` 2; all 12 public delegates cx 1; `move_to`/`move_to_sequence` 4/5 unchanged; all ≤ 10 |
| Focused | 51 passed (`test_order_service.py` 12 + new 14 + phase0 ordering) |
| Full suite | **1207 passed, 0 xfailed** |
| `ruff format --check .` | 165 files already formatted |
| Coverage | implementer: `order_service.py` 70%→80% with only `test_order_service.py` (shared impls exercised by both families) |
| Deviations | None. Transient: initial refactor briefly omitted the `get_next_sequence` delegate → characterization test caught it immediately, fixed |

## Item 6 — R1 batch-delete request models (commit `127c06f`)

Behavior change (declared in design.md R1). Lead-verified evidence:

| Check | Result |
|---|---|
| Shared model | `schemas/project.py::ProjectBatchDeleteRequest(project_ids: List[int] = Field(..., min_length=1, max_length=500))`; wire key `project_ids` unchanged |
| Route-local copies deleted | both `admin.py` and `projects.py` route-local `BatchDeleteRequest` classes removed; both endpoints now take `ProjectBatchDeleteRequest`; `projects.py` dropped its now-unused `from pydantic import BaseModel`; the unreachable `if not data.project_ids: return` guard removed |
| Single definition | `git grep -n "class BatchDeleteRequest" -- backend` → exactly **one** hit (`backend/src/schemas/__init__.py:9`, unchanged; the 13 `ids`-based sub-resource endpoints keep it) |
| Handler bodies | admin body byte-unchanged (len mismatch → 400 "project_ids 包含不存在的项目"; any soft-deleted id → 400 "project_ids 包含已软删项目"; else soft-delete); projects body unchanged apart from the removed empty guard |
| TDD RED → GREEN | 4 new/rewritten tests all failed on current code (`assert 204 == 422` for empty, 204 for 501 ids), then pass |
| New tests | `test_batch_delete_empty_list_is_rejected` (projects `[]` → 422, pid still listed), `test_batch_delete_rejects_more_than_500_ids` (501 → 422), `test_admin_batch_delete_rejects_empty_list` (admin `[]` → 422, `deleted_at` snapshot unchanged), `test_admin_batch_delete_rejects_more_than_500_ids` (admin 501 → 422, snapshot unchanged) |
| Existing admin 400 tests | `test_admin_project_ops.py` missing/deleted-id → 400 tests stay green (small non-empty lists unaffected) |
| Focused | 35 passed (`test_batch_delete_isolation.py` + `test_admin_project_ops.py`) |
| Full suite | **1210 passed, 0 xfailed** (baseline 1207 + 4 new − 1 rewritten) |
| `ruff format --check .` | 165 files already formatted |
| `git diff --check` | clean |
| `BatchCopyRequest`/`BatchMoveRequest` | untouched (exact fields, no limits) per design; move under R6 |
| Frontend | no change needed — `AdminView.vue` guards every batch entry with `if (!selectedProjectIds.value.length) return`, so it never sends an empty list |

Drift note: `main` advanced (designer-reference-preservation + Wave C docs) during items 3–6 but changed **no backend `src`/`tests` files**; the branch will be re-synced before the final merge.

## Item 7 — R6 inline Pydantic models → schemas/ (commit `51d103e`)

Pure move (no behavior change). Lead-verified evidence:

| Check | Result |
|---|---|
| Move fidelity | Lead re-ran an independent AST compare: all **25** moved classes (`ast.dump` of the full ClassDef) are byte-identical to their `HEAD:<router>` definitions — class name, fields, defaults, validators, `model_config`, docstrings. `ALL IDENTICAL` |
| New modules | `schemas/admin.py` (13 models), `schemas/template_import.py` (9 models); `ProjectProfileMetadata` → `schemas/project.py`, `ReorderRequest` → `schemas/field.py`, `VisitFormSequenceUpdate` → `schemas/visit.py` |
| Routers emptied | `git grep -nE "^class .*\(BaseModel\)" -- <5 routers>` → exit 1 (zero hits) |
| Re-export | `from src.routers.import_template import ImportExecuteRequest, execute_import` resolves (`test_import_service.py:1891` unaffected); a comment documents the re-export |
| OpenAPI | `main.app.openapi()` builds; component count **102**, identical to the pre-change baseline (implementer re-ran against a stash of `HEAD` to confirm; `ProjectProfileMetadata` was never an OpenAPI component either way) |
| No new lint findings | `ruff check --select F401,F811,F841` on the touched files vs the same selection on the `HEAD` blobs: the remaining findings are **all pre-existing** (admin/fields/import_template unused imports + `repo` F841 that predate this task); the move removed one pre-existing unused import (`fields.py` `field_validator`) and added none |
| `projects.ImportError` | exception class left in the router (`main.py:373` consumer) |
| `BatchCopyRequest`/`BatchMoveRequest` | moved with exact fields, no limits |
| `schemas/__init__.py` | untouched (new modules are not re-exported there — not its convention) |
| Full suite | **1210 passed, 0 xfailed** (unchanged — pure move) |
| `ruff format --check .` | 167 files already formatted |
| `git diff --check` | clean |
| Worktree | exactly the 10 expected files (8 modified + 2 new); nothing else |

Transient (implementer-reported, self-caught): the first `admin.py` edit placed the `/auth/me` route above the new `schemas.admin` import, leaving `MeResponse` undefined at class-definition time (`NameError` on `import main`); imports were moved above the route and re-verified.

## Item 8 — docs sync (commits `f9bb2f1` spec, `34a63b4` docs)

Docs only (no source/test change in the docs commits). Lead-verified evidence:

| Check | Result |
|---|---|
| `backend/.claude/CLAUDE.md` | services 31→33 (+`unique_name.py`, `admin_bootstrap_service.py`), schemas 9→11 (+`admin.py`, `template_import.py`), tests 71→76 (74 `test_*.py`); `database.py` bullet notes the healing moved out + the `_backfill_null_order` helper; `projects.py` bullet documents the shared `ProjectBatchDeleteRequest` (1..500, 422 on empty/oversized); Service Overview adds `unique_name.py` + `admin_bootstrap_service.py`; module Change Log entry added |
| `.claude/index.json` | services/schemas/tests lists completed: **0 missing / 0 extra** vs `ls` (services 33, schemas 11, test_*.py 74); `python -m json.tool` parses |
| Root `.claude/CLAUDE.md` | mermaid `services (28)`→`(33)`, `schemas (9)`→`(11)`, `tests (65)`→`(76)`; module-index test cell → `(76 files, including 74 test_*.py)`; one Change Log line |
| Archive | full `backend-dedup` narrative appended to `.context/history/archives/claudemd-changelog.md` |
| `.trellis/spec/**` | one standalone `docs(spec)` commit: `database-guidelines.md` `_make_unique_code` note now states it shares the ladder loop via `first_free_name`. `cross-stack-contracts.md` §2 (ordering) — **no change** (internals only); §14 batch-delete rows describe the four sub-resource endpoints, not the project endpoints, so no 1-500 bound was added there. The spec never claimed admin healing lived in `database.py`, so no pointer edit was needed |
| README | **not touched** — its only batch-delete bullet is about the sub-resource reference-aware delete (verified) |

## Review gates (lead, post-merge)

| Check | Result |
|---|---|
| Full suite (merged tree, main synced) | **1210 passed, 0 xfailed** |
| `ruff format --check .` | 167 files already formatted |
| `git diff --check` | clean |
| `class BatchDeleteRequest` grep | exactly **one** hit (`schemas/__init__.py:9`) |
| `heal_reserved_admin_account` grep | definition in `admin_bootstrap_service.py:14`; `database.py:46` import + `:945` call — no other refs |
| frontend diff vs main | **empty** (no Haiku frontend review needed) |
| Independent code review (Sonnet, read-only) | Two findings: (1) item 3 did not fold the two ladder sites the design **explicitly excludes** (`docx_import_service` form-name ladder, `project_import_service._resolve_import_name` try-original-first) — intentional per design.md R2, no correctness issue; (2) `test_project_import.py` patched only `src.database.get_config` while `init_db()` now reaches the moved module — **fixed** in `32bdb66` (added the `admin_bootstrap_service.get_config` patch). Everything else traced clean (item 5 asymmetries, item 2 injection guard, item 6 callers, item 7 old-location refs, item 4 mapping order) |
| Independent security review (Sonnet, read-only; items 1 + 6) | **CLEAN** — no Critical/High/Medium. Change A: healing body byte-identical, `is_production_env` gate intact, no import cycle/reorder. Change B: owner-scoping (`owner_id == current_user.id`) + `require_admin` intact; empty/oversized list cannot reach the DB (422 before handler); bounding also caps an unbounded `id.in_(...)` payload. Low note: intended 204→422 empty-list change; the only frontend caller is `AdminView.vue` (admin endpoint), which guards against empty lists |

Review-follow-up commit `32bdb66` (test isolation) re-ran `test_project_import.py`: **34 passed**, ruff clean. Merge of `main` (`b215e51`) resolved two doc-only conflicts (both changelog entries kept).
