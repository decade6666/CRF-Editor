# Design: backend router / migration / ordering dedup

Baseline: `main` after `backend-format` merges (ruff 0.16.10, line-length 120). Facts in `research/current-state.md` are cited at `a4431b0` (pre-format): re-anchor by function/class name (RB §5.2).

## Boundaries

- Behavior-preserving dedup. The ONLY intended behavior change is R1's batch-delete limits (declared below).
- Touch:
  - routers `admin.py`, `projects.py`, `codelists.py`, `fields.py`, `forms.py`, `visits.py`, `import_template.py`;
  - services `project_clone_service.py`, `project_import_service.py` (only if a helper replaces a same-algorithm ladder there), `import_service.py`, `order_service.py`;
  - `database.py`, `schemas/*`;
  - new `services/unique_name.py` and new `services/admin_bootstrap_service.py`;
  - tests, docs.
- Must NOT change:
  - any wire format (request keys, response shapes, status codes) except R1;
  - frontend files;
  - `routers/template_fields.py` (it imports `_compatibility_error` from `import_template.py`, which stays);
  - the "probe then migrate" mechanism;
  - the public `OrderService` method names and signatures.
- Optional items (a) reorder request shapes, (b) narrowing the global `ValueError → 400` handler, (c) the masking helpers: NOT done (PRD R7 default; no user approval sought). Record this in the report.

## R1 — batch-delete request models (declared behavior change)

Current state:

- `schemas.BatchDeleteRequest(ids: 1..500)` serves 13 sub-resource endpoints.
- Two route-local copies with unbounded `project_ids` serve `POST /api/admin/projects/batch-delete` (`admin.py`) and `POST /api/projects/batch-delete` (`projects.py`; no frontend caller).

Decisions:

1. Keep every wire key. Add one shared `ProjectBatchDeleteRequest` in `schemas/project.py`: `project_ids: List[int] = Field(..., min_length=1, max_length=500)`. Both endpoints use it, and both route-local `BatchDeleteRequest` classes are deleted.
   - Afterwards `BatchDeleteRequest` exists once in the repo (`schemas/__init__.py`, unchanged), satisfying AC1.
   - Renaming keys would force `AdminView.vue` changes (`project_ids` at :257/:272/:292) or break API clients, with no benefit.
2. Empty list → 422 (PRD option (a), consistent with AC1 and with the 13 `ids` endpoints):
   - the frontend never sends empty lists (research §1: every batch button is `:disabled` without a selection, and `executeBatchDelete` returns early);
   - rewrite `test_batch_delete_isolation.py::test_batch_delete_empty_list_is_noop` to expect 422 with nothing deleted;
   - delete the now-unreachable `if not data.project_ids:` guard in `projects.py`.
3. More than 500 ids → 422 on both endpoints.
4. `BatchCopyRequest` / `BatchMoveRequest` (admin) keep their exact fields and no limits; they only move to `schemas/admin.py` (R6). Adding limits there would be an undeclared behavior change.
5. TDD (RED first): new tests send `[]` and 501 ids to both endpoints and expect 422 with zero DB changes. They fail on current code. Existing admin tests (`test_admin_project_ops.py`: missing / deleted id → 400) stay green.

## R2 — copy-name ladders

New `backend/src/services/unique_name.py` with one core:

```python
def first_free_name(first: str, numbered: Callable[[int], str], is_taken: Callable[[str], bool], start: int) -> str:
    """Return `first` if free, else numbered(start), numbered(start + 1), ... — the first candidate not taken."""
```

Same-algorithm groups switch to it. Each call reproduces its current ladder verbatim.

| Group | Sites | `first` | `numbered(n)` | `start` | `is_taken` |
|---|---|---|---|---|---|
| A (router copy, DB probe per candidate) | `codelists._build_codelist_copy_name`, `copy_field_definition` (`variable_name`), `copy_form`, `copy_visit` | `f"{name}_copy"` | `f"{name}_copy{n}"` | 1 | a per-candidate existence query scoped exactly as today (same model, column and project filter) |
| B (prefetched set, Chinese suffix) | `project_clone_service._resolve_copy_name`, `admin._resolve_restore_name` | `f"{name} (副本)"` / `f"{name} (恢复)"` | `f"{name} (副本{n})"` / `f"{name} (恢复{n})"` | 2 | `lambda c: c in existing`; each caller keeps its own set query (with vs without `deleted_at`) |
| C (import, in-memory set) | `import_service._make_unique_name` (`_导入`), `_make_unique_import_codelist_name` (`（导入）`, full-width, number inside), `_make_unique_var` + `_make_unique_code` (byte-identical, `_IMP`) | per row | per row | 2 | `lambda c: c in existing` |

- Not merged (structurally different):
  - `project_import_service._resolve_import_name` tries the original name first;
  - visit-form copy copies `sequence` with no renaming.
- Re-read every site before replacing it. If its loop differs from the table (start index, where the number goes, whether the existence check strips or lowercases), keep that site unchanged and report it.
- Characterization tests first (they pass on current code), for every replaced site: no collision / one collision / two collisions → exact names. Group A through the HTTP copy endpoints; B and C at function level. They must stay green after the swap.
- Keep the private wrappers where callers or tests import them by name: each wrapper body becomes one `first_free_name(...)` call. Delete wrappers that have no remaining caller.

## R3 — template-import error mapping

`import_template.py` repeats one mapping in `preview_import`, `preview_form_fields`, `execute_import`:

- `FileNotFoundError` → `HTTPException(404, str(e))`;
- `ValueError` containing `模板库不兼容` → `_compatibility_error(msg)`, a `JSONResponse(400, {"detail", "code": "TEMPLATE_INCOMPATIBLE"})`;
- any other `ValueError` → `HTTPException(400, msg)`.

Extract it into one private function:

```python
def _template_import_error_response(exc: FileNotFoundError | ValueError) -> JSONResponse:
    """Raise HTTPException for 404 / plain 400; return the structured TEMPLATE_INCOMPATIBLE response."""
```

- Each endpoint uses `except (FileNotFoundError, ValueError) as exc: return _template_import_error_response(exc)`.
- `execute_import` keeps its trailing `except Exception → logger.exception + 500`.
- Raising (rather than returning) the HTTPException variants keeps them on FastAPI's HTTPException handler path, exactly as today.
- `_compatibility_error` stays in place (`template_fields.py` imports it).
- `projects.py`'s `ImportError` mapping and `import_docx.py`'s mappings have different shapes (no `code` field, different statuses). They are not duplicates of this one, so they are left alone.
- Tests: for each of the three endpoints assert 404, plain 400, and the `TEMPLATE_INCOMPATIBLE` JSON. Reuse the existing tests where they already cover a combination (research §3); add only the missing ones (characterization, green before and after).

## R4 — migrations

### `_migrate_add_order_index`

- Research found **six** structurally identical backfill blocks, not five. Cover all six:
  - `unit`, `field_definition`, `form`, `codelist` — grouped by `project_id`, column `order_index`;
  - `codelist_option` — grouped by `codelist_id`, column `order_index`;
  - `visit` — grouped by `project_id`, column `sequence`.
- Extract `_backfill_null_order(conn, table: str, group_column: str, order_column: str) -> None`. It reproduces the block verbatim:
  - the `has_table` guard;
  - `SELECT DISTINCT group WHERE group IS NOT NULL AND order IS NULL`;
  - per group, `SELECT id … ORDER BY id`;
  - an empty group is skipped;
  - numbering starts at `COALESCE(MAX(order), 0) + 1`;
  - one UPDATE per row.
- Drive it from a module-level tuple of `(table, group_column, order_column)` constants. Identifiers are interpolated only from that tuple; assert membership so the helper can never take external input.
- Phase 1 (add columns) and Phase 3 (unique indexes on the five `order_index` tables only — `visit.sequence` has none) stay as they are.
- Target: `_migrate_add_order_index` and the helper each cyclomatic complexity ≤ 10 (report before/after, AST counter in `research/`).
- Tests:
  - an old-schema SQLite sample with NULL order columns in several groups (incl. a group with pre-existing max order) → the expected numbering;
  - running `init_db()` twice gives identical rows (idempotency, AC4);
  - the four existing migration test files stay green.

### `_heal_reserved_admin_account` → `services/admin_bootstrap_service.py`

- Security-sensitive: the production multi-user server runs this at every startup. The PRD also requires characterization tests BEFORE the move.
- First write characterization tests against the current function (`src.database._heal_reserved_admin_account`), on a temp SQLite DB with the real `user` table and patched config / production detection. Cover every branch in research §4:
  1. no `user` table → no-op;
  2. blank configured username → no-op;
  3. existing reserved user (trim-matched) gets `is_admin=1` in non-production too;
  4. non-production, no admin row → nothing inserted;
  5. production, no admin, no `bootstrap_password` → `RuntimeError`;
  6. production, no admin, with `bootstrap_password` → inserted with a usable hash and `auth_version=1`;
  7. trim-matched username differing from the exact one, with no conflicting exact row → renamed;
  8. production, unusable hash, no `bootstrap_password` → `RuntimeError`;
  9. production, unusable hash, with `bootstrap_password` → password reset and `auth_version` + 1;
  10. production final check: no usable admin → `RuntimeError`.
- Then move the function verbatim to `backend/src/services/admin_bootstrap_service.py` as public `heal_reserved_admin_account(...)`, with the same parameters and its imports (`get_config`, `is_production_env`, `hash_password`, `has_usable_password_hash`). `init_db` imports and calls it at the same position. No import cycle: `auth_service` does not import `database` (research §4).
- Point the tests at the new location; all stay green.
- `database.py` keeps no business logic for admin healing.

## R5 — `OrderService` twins

The six `*_sequence` methods duplicate their `order_index` twins, with deliberate asymmetries that must survive (research §5):

| Pair | Share | Keep different |
|---|---|---|
| `get_next_order` / `get_next_sequence` | one private impl with `column` + `ensure_initialized: bool` | only the order family calls `_ensure_initialized` |
| `insert_at` / `insert_at_sequence` | one private impl with `column` + `ensure_initialized` + the order family's `position <= max_order` shift condition as a flag | sequence: unconditional two-phase shift |
| `delete_and_compact` / `delete_and_compact_sequence` | one private impl with `column` + `ensure_initialized` + `direction` | order: shift `-SAFE_OFFSET`, fix negatives; sequence: shift `+SAFE_OFFSET`, fix `> old + SAFE_OFFSET` |
| `reorder_batch` / `reorder_batch_sequence` | one private impl with `column` + `direction` | the sign |
| `compact_after_batch_delete` / `compact_after_batch_delete_sequence` | one private impl with `column` + `direction` | the sign |
| `move_to` / `move_to_sequence` | only WHERE / scope builders | different algorithms (park-at-0 vs min/max offset); bodies stay separate |

- All 12 public methods keep their names and signatures. Each becomes a thin delegate where a private impl exists; routers, repositories and services are untouched.
- No method in the sequence family may gain `_ensure_initialized`, and no sign may flip. Intermediate states matter for the unique indexes on the `order_index` tables.
- Characterization tests first for the sequence family at the service level (`get_next_sequence`, `insert_at_sequence`, `move_to_sequence`, `delete_and_compact_sequence`, `compact_after_batch_delete_sequence`; `reorder_batch_sequence` already has 3), plus one asserting the order family heals NULLs while the sequence family does not.
- Then refactor. `test_order_service.py`, `test_phase0_ordering_contracts.py` and every endpoint-level ordering test stay green.
- The ordering contract (`cross-stack-contracts.md` §2) is unchanged.

## R6 — inline Pydantic models in touched routers → `schemas/`

Move verbatim: class names, fields, defaults, validators and `model_config` unchanged.

| From | Models | To |
|---|---|---|
| `admin.py` | 15 models (incl. `BatchCopyRequest`, `BatchMoveRequest`, cleanup-policy and user models) | new `schemas/admin.py` |
| `projects.py` | `ProjectProfileMetadata` | `schemas/project.py` (`ProjectBatchDeleteRequest` from R1 already there) |
| `import_template.py` | 9 models | new `schemas/template_import.py` |
| `fields.py` | `ReorderRequest` | `schemas/field.py` |
| `visits.py` | `VisitFormSequenceUpdate` | `schemas/visit.py` |
| `codelists.py`, `forms.py` | none | — |

- `projects.ImportError` is an exception class, not a model; it stays (`main.py` imports it).
- `tests/test_import_service.py` imports `ImportExecuteRequest` from the router module. It keeps working because the router imports the name; do not edit that test file (`export-layer-cleanup` edits it).
- Re-export from `schemas/__init__.py` only if that is the existing convention for the target module.
- Check FastAPI's OpenAPI generation still works (`app.openapi()` in a test or a one-off script); component names may only lose their old duplicate-name disambiguation.

## Commits (lead commits after each item's checkpoint)

1. `refactor(backend): 保留管理员账号修复逻辑移出迁移代码` — R4b + its characterization tests.
2. `refactor(database): 排序列回填迁移抽取通用助手` — R4a + tests.
3. `refactor(backend): 复制改名梯子收敛为通用助手` — R2 + tests.
4. `refactor(import): 模板导入错误映射收敛为一个函数` — R3 + tests.
5. `refactor(order): sequence 排序方法与 order_index 方法共用实现` — R5 + tests.
6. `fix(api): 项目批量删除共用请求模型并限制 1-500 条` — R1 (behavior change, RED → GREEN).
7. `refactor(schemas): 触碰路由的内联模型迁入 schemas` — R6.
8. `docs: 同步后端去重后的文档` and, only if `.trellis/spec/**` changes, a standalone `docs(spec): …` commit.

All new code passes `ruff format --check` (pinned ruff, `backend/ruff.toml`).

## Docs

- `backend/.claude/CLAUDE.md`:
  - new modules `services/unique_name.py`, `services/admin_bootstrap_service.py`, `schemas/admin.py`, `schemas/template_import.py`;
  - the batch-delete limits;
  - the module Change Log.
- `.claude/index.json`: the new modules.
- Root `.claude/CLAUDE.md`:
  - one Change Log line;
  - the full narrative to `.context/history/archives/claudemd-changelog.md`.
- README.md / README.en.md: only if they describe the batch-delete API (re-grep).
- `.trellis/spec/guides/cross-stack-contracts.md`:
  - §2 ordering: no text change expected (internals only);
  - add the batch-delete 1–500 bound only if a batch-delete contract entry exists;
  - `.trellis/spec/backend/database-guidelines.md`: note where admin healing now lives if it currently says `database.py`.

## Interaction with sibling tasks

- Starts after `backend-format` merges.
- Wave C `temp-resource-lifecycle` also edits `routers/projects.py` (its import endpoints). The second merger merges `main` and resolves; announce the branch and file list to `crf-editor-ad` first.
- `export-layer-cleanup` shares no code files with this task (only docs). The lead may run the two in parallel worktrees and merge them one after the other.

## Rollback

One commit per item. R1 is the only behavior change; reverting commit 6 restores the unbounded project batch-delete models.
