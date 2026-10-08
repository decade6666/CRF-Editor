# Design: owner-bound Word import uploads

## Boundaries

- Touch:
  - `backend/src/services/docx_import_service.py`
  - `backend/src/routers/import_docx.py`
  - `backend/src/background_jobs.py`
  - backend tests: a new `tests/test_docx_temp_isolation.py`, plus updates to existing tests (see T2)
  - docs (see the docs list in `implement.md`)
- Do not touch:
  - `backend/main.py`: the lifespan is unchanged; the sweep is wired inside `start_background_jobs` / `stop_background_jobs`;
  - `docx_screenshot_service.py`, `ai_review_service.py`;
  - the frontend, the config model, and the database schema.
- Response shapes stay the same, apart from 422 for malformed ids. There are no new user-facing texts.

## D1 — Temp id format and validation

- `docx_import_service.py`, module level:

  ```python
  TEMP_ID_PATTERN = r"^[0-9a-f]{32}$"
  _TEMP_ID_RE = re.compile(TEMP_ID_PATTERN)
  ```

- `save_temp_file` mints `uuid.uuid4().hex`.
- Router validation (FastAPI 0.110.3 / Pydantic 2.13.5, so `pattern=` works and malformed input yields an automatic 422):
  - `TempId = Annotated[str, Path(pattern=TEMP_ID_PATTERN)]`, used by the four path endpoints;
  - `DocxExecuteRequest.temp_id: str = Field(pattern=TEMP_ID_PATTERN)`.
- Service functions that build paths from an id re-check `_TEMP_ID_RE` and treat a mismatch as "not found" (return `None`, or no-op). This guards internal callers that bypass the router (sweep, cleanup).
  - It is the only defense-in-depth layer.
  - Paths are then built only from validated hex and integers, so no `resolve()` containment check is needed. Do not add one: the internal state is impossible.

## D2 — Ownership encoded in the stored file name

- Stored name: `{temp_id}_u{user_id}_p{project_id}_{basename}`. `basename` is sanitized exactly as today; the router already enforces `.docx`.
- `save_temp_file(content: bytes, filename: str, *, user_id: int, project_id: int) -> tuple[str, str]`
- `get_owned_temp_path(temp_id: str, *, user_id: int, project_id: int) -> Optional[str]`:
  1. pattern check;
  2. `sorted(Path(TEMP_DIR).glob(f"{temp_id}_u{user_id}_p{project_id}_*.docx"))`;
  3. return the first match, or `None`.
  
  The glob contains only validated hex and integers.
- Delete `get_temp_path` (prefix match). Its only production callers are the two router lookups. Tests that patch it are updated (T2).

### Why the file name, not a sidecar registry

The investigation sub-agent proposed a sidecar JSON file. Other options were an in-memory dict and a DB table.

| Option | Verdict |
|---|---|
| File name (chosen) | One atomic write. No second file to keep in sync, no parse or corruption path. Survives restarts. No migration. |
| Sidecar JSON | Same durability, but adds an atomic second write, JSON parsing, and orphan or mismatch handling. |
| In-memory dict | Lost on restart while the uploads stay on disk. |
| DB table | Model + migration + background-job session plumbing for rows that live 24 h. |
| Per-user subdirectory | Ruled out: `DocxScreenshotService.cleanup_old_caches()` deletes every subdirectory of the same folder on each shutdown, which would wipe pending uploads. |

- Verified: no code parses stored names. Routers pass `file_path` through, and the original filename is never recovered from disk.
- Trade-off: foreign and missing ids are indistinguishable. The project convention returns 403 for foreign *projects* (`dependencies.py:52`); here it is deliberately not followed.
  - Project ids are sequential, so their existence is not secret.
  - 128-bit upload ids cannot be enumerated, and not revealing existence is the safer default.
  - Record this in contracts §4.

## D3 — Endpoint behavior (`routers/import_docx.py`)

Rule: **a foreign id gets exactly the response a nonexistent id gets today.**

| Endpoint | Change |
|---|---|
| `POST …/import-docx/preview` | `save_temp_file(content, file.filename, user_id=current_user.id, project_id=project_id)` |
| `POST …/import-docx/execute` | `get_owned_temp_path(...)`. When missing or foreign: the same `400 「临时文件已过期，请重新上传」`. The raise already sits before the `try/finally`, so cleanup runs only for an owned upload. Keep it that way. |
| `GET …/{temp_id}/ai-review/status` | Ownership lookup **before** `get_ai_task`. When it fails: the same `404 「AI复核任务不存在或已过期」`. |
| `POST …/{temp_id}/screenshots/start` | Ownership lookup. When it fails: the same `400 「临时文件不存在，请重新上传」`. Delete the unreachable `is_dir()` block (`:684-693`). |
| `GET …/{temp_id}/screenshots/status` | Ownership lookup **before** `get_task`. When it fails: `ScreenshotStatusResponse(status="idle")`, the current unknown-task response. This also keeps the panel's polling behavior unchanged. |
| `GET …/{temp_id}/screenshots/pages/{page}` | Keep the `page < 1` check first. When the ownership lookup fails: the same `404 「截图不存在或尚未生成」`. |

- Extract one small helper to avoid repeating the lookup:

  ```python
  def _owned_upload(temp_id: str, project_id: int, user: User) -> Optional[str]
  ```

  Each endpoint keeps its own not-found response.

## D4 — Cleanup and expiry

- `cleanup_temp(temp_id: str) -> None`:
  - pattern check;
  - unlink every `Path(TEMP_DIR).glob(f"{temp_id}_*.docx")`. Ids are unique 128-bit values, so a validated id cannot match another upload;
  - drop the unreachable `elif is_dir()` branch (`:1368-1372`).
- Move the router's `_cleanup_docx_temp` (`import_docx.py:284-287`) into the service as `DocxImportService.discard_upload(temp_id: str) -> None`. It runs `cleanup_temp`, `DocxScreenshotService.cleanup`, and `remove_ai_task`.
  - The router and the sweep share it (DRY).
  - There is no import cycle: neither `docx_screenshot_service` nor `ai_review_service` imports `docx_import_service`.
  - Import lazily inside the function if module import order causes trouble.
- `UPLOAD_TTL_HOURS = 24` (module constant).
- `purge_expired_uploads(*, max_age_hours: int = UPLOAD_TTL_HOURS, now: Optional[float] = None) -> int`:
  1. For each `Path(TEMP_DIR).glob("*.docx")` whose `st_mtime < now - ttl`:
     - if the name starts with a 32-hex id followed by `_`, call `discard_upload(id)`;
     - otherwise (legacy 12-hex names, unknown files), unlink the file only. Legacy screenshot caches are wiped on every shutdown by `cleanup_old_caches(days=0)`, and legacy AI tasks are in-memory, so both are already gone after the deploy restart.
  2. Return the number of files purged.
  - A missing `TEMP_DIR` returns 0.
- `background_jobs.py`:
  - add `_run_docx_temp_sweep_once_sync()` and `_docx_temp_sweep_loop()`, mirroring `_recycle_bin_cleanup_loop`:
    - run once at startup, then every `_DOCX_TEMP_SWEEP_INTERVAL_MINUTES = 60`;
    - work via `asyncio.to_thread`;
    - per-round `except Exception: logger.exception(...)`;
    - re-raise `CancelledError`;
    - log INFO only when something was purged.
  - `start_background_jobs` creates both tasks behind the same `should_enable_background_jobs()` gate.
  - `stop_background_jobs` cancels both. Iterate over the state attribute names to keep each function < 50 lines.
  - Update the module docstring, which currently describes only the recycle-bin loop.
- No config surface: constants only, in the spirit of the recycle-bin defaults (`config.py:205-206`).

## D5 — Tests

### T1 — New file `backend/tests/test_docx_temp_isolation.py`

- An autouse fixture monkeypatches `DocxImportService.TEMP_DIR` and `DocxScreenshotService.BASE_DIR` to `tmp_path`.
- Reuse:
  - conftest `client` / `engine` (`conftest.py:41`, `:59`);
  - `tests/helpers.py` `seed_user` / `login_as` / `auth_headers`;
  - the project creation pattern of `tests/test_isolation.py:12-19`.

Unit tests:

- `test_should_mint_32_hex_temp_id_bound_to_owner_and_project`
- `test_should_find_upload_only_for_same_user_and_project`
- `test_should_treat_malformed_temp_id_as_missing`: `get_owned_temp_path` returns `None`; `cleanup_temp("")` / `cleanup_temp("a")` delete nothing while two uploads exist.
- `test_should_purge_expired_uploads_with_their_artifacts`:
  - uses `os.utime` to age an old new-format file, an old legacy file, and a fresh file;
  - spies on `DocxScreenshotService.cleanup` / `remove_ai_task`.

API tests:

- `test_should_return_422_for_malformed_temp_id`, parametrized:
  - path endpoints with `a`, `a*31`, `a*33`, `A*32`, `g*32`, `..`;
  - execute body with `""`, `a*31`, `"../" + "a"*29`.
- `test_should_answer_foreign_temp_id_like_missing_one_on_every_endpoint`:
  - A's upload is created through `save_temp_file`;
  - A's screenshot task is seeded as finished, and A's AI task as done;
  - B's responses are compared with responses for a random 32-hex id.
- `test_should_keep_owner_upload_when_other_user_executes_it`: A's file still exists, and B's project has no forms.
- `test_should_reject_owner_temp_id_in_another_project_of_same_owner`
- `test_should_start_docx_temp_sweep_only_when_background_jobs_enabled`: follow the `tests/test_background_jobs_flag.py` pattern.

### T2 — Update existing tests to the new signatures and 32-hex ids

| File | Lines | What to update |
|---|---|---|
| `tests/test_docx_import_contract.py` | patches at ~52, 56, 95, 99, 137, 141, 187; temp ids at ~74, 120, 164, 218 | function names, signatures, 32-hex ids |
| `tests/test_rate_limit.py` | ~115, 124, 125 | lambdas taking `(content, filename)` / `(_temp_id)`, and `"temp-1"` |
| `tests/test_ai_review_service.py` | ~310, 314 | patched function names |
| `tests/test_perf_harness.py` | ~13, 30, 34 | minimal update only; `legacy-cleanup` deletes this file later |

Re-grep for `get_temp_path`, `save_temp_file`, `cleanup_temp`, `_cleanup_docx_temp`, and literal temp ids before finishing.

## Compatibility, rollout, rollback

- The deploy restarts the service. An in-flight import holding a 12-hex id gets 422 on its next call, and the user re-uploads. Mention this in the change log.
- Legacy files become unreachable at once. The startup sweep deletes those already older than 24 h; the rest go within 24 h.
- No migration, no config change, no frontend change.
- Rollback: revert the commits. Leftover 32-hex files are harmless: the old prefix lookup still matches them by prefix, and the old code never cleans them.

## Disclosure

The diff reveals the flaw. If the GitHub repository is public:

- deploy right after pushing;
- commit the Trellis task docs, which describe the exploit path, only after the production deploy.
