# Design: unified temp-resource lifecycle (streaming uploads + async threadpool + single temp dir)

Evidence base: `research/evidence-2026-10-09.md` (main @ a4431b0, 2026-10-09; **historical line values from earlier revisions also live there**). Follow the parent runbook `.trellis/tasks/10-08-review-remediation/implement.md` ("RB").

**Anchor policy**: this task opens only after `legacy-cleanup` (LC: deletes `src/perf.py`, every `perf_span`/`record_*` call, the perf scripts and `tests/test_perf_harness.py`) and `backend-format` (BF: ruff 0.16.10 reformat of the whole backend, `backend/ruff.toml`, line-length 120, double quotes) have both merged into `main`. After those two merges every line number in these docs drifts. All anchors are therefore **symbol-first** (function / class / constant names are authoritative); line numbers are indicative only, captured pre-LC/BF. S0 re-anchors by symbol in the worktree before any edit.

## Boundaries

- Touch:
  - `backend/src/routers/projects.py` (streaming `.db` upload, threadpool wraps)
  - `backend/src/routers/import_docx.py` (streaming docx upload, threadpool wraps)
  - `backend/src/services/docx_import_service.py` (temp dir single source, shared naming helper, `.db` sweep coverage)
  - `backend/src/services/docx_screenshot_service.py` (one line: `BASE_DIR` aliases the shared constant)
  - new `backend/src/services/temp_paths.py` (leaf constant module)
  - new `backend/src/services/upload_streaming.py` (leaf async streaming writer, D3b)
  - new `backend/src/services/await_drain.py` (leaf cancellation-completion guard, D4)
  - backend tests (new files + extensions, see implement.md)
  - docs (see implement.md docs step)
- Do not touch:
  - `backend/src/services/docx_screenshot_service.py` beyond the `BASE_DIR` line; the Word import parser (`parse_full` and below), preview comparison, `ai_review_service.py`;
  - `backend/src/background_jobs.py` (the existing `_docx_temp_sweep_loop` already calls `purge_expired_uploads`; extending that function is enough);
  - Logo upload, `import_template.py`, `export.py`, the frontend, the config model, the database schema;
  - `tests/conftest.py` redirect logic (the class-attr read surface is preserved, see D2).
- No new dependencies. No response-shape or error-text changes anywhere (the only user-visible deltas: none).

## D1 — Streaming `.db` uploads (R1, projects.py)

Replace `_save_bytes_to_temp(filename, content)` usage in the three import endpoints with an async streaming writer. The old bytes helper is deleted (its only callers are the three endpoints; tests that imported it are updated).

**Upload boundary — promised scope** (verified against FastAPI 0.110.3 / Starlette 0.37.2, the pinned stack; this section and the failure policy in point 3 below are part of the task's commitment):

- Because the endpoints declare `UploadFile = File(...)`, Starlette parses the whole multipart body **before the endpoint function runs** (`starlette/requests.py:280` → `MultiPartParser.parse()`), spooling each file part into `SpooledTemporaryFile(max_size=1MiB)` (`starlette/formparsers.py:121,:209`): ≤1 MiB in RAM, beyond that rolled over to a disk temp file. The network transfer and framework-side spool therefore complete before the first `await file.read()`.
- Chunked `read(n)` consequently eliminates **the endpoint-level full in-memory bytes copy** (today `content = await file.read()` duplicates the entire spooled file into RAM). The disk write itself is **not** eliminated: the streaming path still copies the Starlette spool — chunk by chunk — into the managed temp file, so both paths end with two disk files (framework spool + managed temp); what disappears is the whole-file RAM detour. It also does **not** block or early-abort the HTTP transfer or the framework spool — the network/multipart buffering stage is **not part of this task's promise**; transport-level early rejection would require middleware/proxy changes, explicitly out of scope.
- R5(a)'s "服务端未缓冲完整请求体" is therefore proven **at the application layer only**: read-count / early-stop / write-as-you-go assertions on `UploadFile.read(size)`. Tests and reports must not claim transport-level rejection. The fake-upload test injects a spool stand-in; the monkeypatched-small-limit endpoint test exercises the real starlette spool cheaply.

```python
_MAGIC = b"SQLite format 3"          # 15 bytes (SQLite's canonical header is
                                     # 16 bytes with a trailing NUL; the existing
                                     # content[:16].startswith check never required
                                     # the NUL — keep that looseness)
```

The endpoint-facing writer `_save_upload_to_temp_db` is a thin wrapper: mint the name via `build_owned_db_filename` (D3), call the shared `stream_upload_to_file` helper (D3b) with the constants above, map its `ValueError` → `HTTPException(400, str(e))` outside the import `try`. The chunk loop, mkdir, counting, and cleanup live only in the helper (D3b).

Semantics locked (AC1):

1. **Magic before size, EOF-short-read compatible.** Accumulate the first reads until >= 15 bytes are seen **or EOF**, then check `_MAGIC` prefix via `startswith` — byte-for-byte the current `content[:16].startswith(b"SQLite format 3")` semantics, including files shorter than the magic (EOF → `startswith` False → same 400 「文件不是有效的 SQLite 数据库」). Do **not** tighten to a 16-byte/NUL-terminated header check — that would reject inputs the current code accepts. A huge non-SQLite file still answers the SQLite message — the order is locked by a test (D6).
2. **Size limit during streaming.** Reject with 400 「文件大小超过限制（最大 200 MB）」 as soon as cumulative bytes would exceed `_MAX_IMPORT_SIZE` (constant and text unchanged, `projects.py:30`/`:83-87`).
3. **No half-file residue — full failure policy (cancellation / read / write / cleanup).** The destination file is created and owned by the shared helper (D3b): exclusive create (`os.open(..., O_WRONLY|O_CREAT|O_EXCL, 0o600)`), chunked writes inside `os.fdopen(fd, "wb")`, and the helper unlinks the partial file on any failure:
   - *Cancellation*: verified on this stack, a client disconnect does **not** raise `CancelledError` in the handler (uvicorn only flags `cycle.disconnected`; BaseHTTPMiddleware forwards disconnect only to an app that polls `receive()` — ours never do mid-request; Exp3). Cancellation reaches the request task only via uvicorn graceful-shutdown-timeout `t.cancel()`, second-Ctrl+C force exit, or AnyIO-internal scope cancellation. On Python 3.10 `CancelledError` inherits from **`BaseException`**, so cleanup must be `except BaseException: unlink(partial); raise` — an `except Exception` handler would leak the partial file on those real paths (raw task cancel is delivered to the awaiter immediately, possibly while a chunk write is still in flight; see D4/D3b).
   - *Read/write failure*: `OSError` from the spool read or the disk write hits the same handler; partial file unlinked, error re-raised.
   - *Rejections*: the magic and size rejections raise `ValueError` through the same handler (routers map to the existing 400 texts) — partial file unlinked, response text unchanged.
   - *Final-cleanup failure*: if the unlink itself raises (e.g. Windows lock, race), it must **log a warning and never mask the original error** — mirror the `_remove_temp_file` best-effort convention from `routers/export.py`; the 24h sweep is the backstop for a stuck partial.
   - *Cleanup scope*: unlink **only a file this call created** (guarded by a created-flag) — a `FileExistsError` from the exclusive create must never delete the pre-existing file (D3b).
   - AC1 asserts the temp dir is empty after a rejection.
4. **Temp placement moves into the swept owned directory** (D3): the file is named `{temp_id}_u{uid}_p0_upload.db` — **project sentinel `0`** (the three `.db` endpoints have no `project_id`: the import *creates* the target project, so none exists at upload time), a **fixed stem `upload`**, and a **forced `.db` stored suffix** (today `Path(filename).suffix or '.db'` at `:88` stores arbitrary/absent suffixes; the sweep's suffix filter could never cover those). The stored name therefore contains **no user-controlled component** — today's `mkstemp` path carries no user filename either, so this preserves that property instead of introducing the uploaded stem into a path (a ~250-char uploaded name plus the 40+ char prefix would exceed NAME_MAX 255 and turn a today-succeeding import into an unhandled ENAMETOOLONG 500; embedded odd characters would surface as confusing 400s — the `.db` file is consumed in-request and nothing downstream reads its name). Input acceptance and response semantics are unchanged — any/absent/odd uploaded names are still accepted and imported identically; only the private on-disk name is normalized. Locked by tests (D6). The request-side `finally: unlink(missing_ok=True)` (`:131-132`/`:173-174`/`:215-216`) stays (normal path); the sweep only catches crash leftovers. This is what makes R4 real for `.db`: today a crash leaks the file in the system temp dir where nothing sweeps it.
5. **No perf instrumentation, and none reintroduced.** LC (already merged when this task opens) deletes `src/perf.py` and every `perf_span`/`record_*` call, so `projects.py` has no `perf_span("upload_read")`/`record_payload_size` left around the import endpoints — TRL does not add any replacement instrumentation (`perf_span`, `record_counter`, `record_payload_size`, `print`, timing hooks: all out). The endpoint bodies keep only the `try/except ValueError→ImportError / sqlite3.DatabaseError / Exception / finally unlink` chain.

**Not buffered** assertion (R5a): a fake upload whose `read(n)` is counted must show (a) multiple chunk reads and (b) early stop — when the limit is hit the writer stops consuming before the fake's data is exhausted. Endpoint-level tests monkeypatch `_MAX_IMPORT_SIZE` down (e.g. 1 MiB) so a real `TestClient` upload stays cheap.

## D2 — Temp dir single source (R3)

New leaf module `backend/src/services/temp_paths.py`:

```python
from pathlib import Path

# Absolute, cwd-independent; resolves to <repo>/backend/uploads/docx_temp.
DOCX_TEMP_DIR = str(Path(__file__).resolve().parent.parent.parent / "uploads" / "docx_temp")
```

- `DocxScreenshotService.BASE_DIR = DOCX_TEMP_DIR` (`docx_screenshot_service.py:75` — value byte-identical to today).
- `DocxImportService.TEMP_DIR = DOCX_TEMP_DIR` (`docx_import_service.py:1283` — becomes absolute; all four internal readers `:1311/:1336/:1348/:1379` keep reading the class attr, zero call-site churn).
- Both class attributes remain the only read surfaces, so `tests/conftest.py:103-106` keeps working unchanged (it patches both attrs to the session temp dir).
- **AC4 test must not assert on the patched attrs** — conftest already equalizes them in-suite, so such an assert can never go RED. Instead: a `sys.executable` subprocess (no conftest) imports both services fresh, runs with a non-`backend/` cwd, and asserts the two defaults are equal, absolute, and end with `uploads/docx_temp`. RED today: `TEMP_DIR` is the relative string `"uploads/docx_temp"` → equality/absolute asserts fail.

Options considered: (a) `TEMP_DIR = DocxScreenshotService.BASE_DIR` — rejected: makes `docx_import_service` top-level-import `docx_screenshot_service` (heavier module, subprocess/LibreOffice imports at class-definition time) for one constant; (b) keep two definitions — rejected: that is the bug. The leaf module is the smallest true single source.

**Hermeticity rule (hard constraint).** The `.db` dest path must be computed from the class attr `DocxImportService.TEMP_DIR`, **read at call time** — never from `temp_paths.DOCX_TEMP_DIR` directly. The constant may be referenced in exactly three places: its definition in `temp_paths.py`, and the two class-attr assignments (`DocxScreenshotService.BASE_DIR`, `DocxImportService.TEMP_DIR`). Anything else reading the module constant bypasses `tests/conftest.py:103-106` (which patches only the class attrs), and the suite would write into the real `backend/uploads/docx_temp`. S10 runs a grep gate for this.

## D3 — Owned-naming helpers (R4 prep; one sanitation source, two sealed entry points)

Extract the sanitation logic of `save_temp_file` (`docx_import_service.py:1313-1320`) and expose two thin helpers — the ownership naming scheme keeps exactly one definition (PRD: 复用归属登记，不另写一套):

```python
@staticmethod
def build_owned_filename(filename: str, *, user_id: int, project_id: int) -> Tuple[str, str]:
    """docx path: mint (temp_id, f"{temp_id}_u{uid}_p{pid}_{basename}"),
    basename sanitized as today (basename(), strip '..', lowercase ext)."""

@staticmethod
def build_owned_db_filename(*, user_id: int) -> Tuple[str, str]:
    """.db path: mint (temp_id, f"{temp_id}_u{uid}_p0_upload.db").
    No filename parameter: the stored name carries no user-controlled
    component (today's mkstemp path has none either) — a long or odd
    uploaded name can never reach the path and cause ENAMETOOLONG or
    encoding surprises. Sentinel p0 = no target project exists at upload
    time; the .db flow has no lookup-by-id API, so the sentinel is never
    interpreted. Sweep-compatible: purge takes name.split("_", 1)[0] and
    fullmatches _TEMP_ID_RE; cleanup_temp's {temp_id}_*.db glob matches."""
```

- Shared private sanitation (basename / `..` strip / stem-ext split) lives in one internal helper and now serves the **docx helper only** — the `.db` helper takes no filename at all.
- **`save_temp_file` (bytes API) is DELETED in this task.** After S5 its only production caller (the docx preview write) streams, and LC deletes its other caller (`run_perf_baseline.py:179`); keeping production code solely so old tests can call it is dead weight. Test conversions (same assertions, new seam — see D6/S5): `test_docx_temp_isolation.py:50/:83` naming units call `build_owned_filename` instead (name-format + lowercase-ext asserts unchanged); `test_rate_limit.py:115` and `test_docx_import_contract.py:191` monkeypatch `src.routers.import_docx.DocxImportService.save_temp_file` — left alone those patches would silently become dead — re-target them to the new call path (the `stream_upload_to_file` reader seam / `_save_upload_to_temp_db`), assertions unchanged.
- `get_owned_temp_path` stays `.docx`-only and **no `.db` lookup-by-id API is added**: the `.db` flow consumes the file synchronously inside the request; the sentinel files are reachable only by directory iteration (the sweep). This keeps the p0 sentinel closed — it cannot be used to address another user's or project's file because no addressing surface exists.
- Sweep coverage of the forced `.db` suffix closes today's gap where `foo.backup` / suffix-less SQLite uploads (accepted by the current `:88` logic) would escape the `.docx`/`.db` suffix filter forever.

## D3b — Shared async streaming write helper (one chunk loop for both routers)

New service-layer leaf module `backend/src/services/upload_streaming.py`. No FastAPI *types* in the core logic — the reader is structural (any object with `async def read(size: int) -> bytes`; `UploadFile` satisfies it). `fastapi.concurrency.run_in_threadpool` is imported as a function only.

```python
async def stream_upload_to_file(
    reader,                      # structural: async read(size) -> bytes
    dest_path: Path,
    *,
    max_bytes: int,
    over_limit_message: str,
    magic_prefix: bytes | None = None,
    magic_message: str | None = None,
    chunk_size: int = 1024 * 1024,
) -> int:
    """Stream reader -> dest_path under the byte cap; returns bytes written.
    Raises ValueError(magic_message / over_limit_message); unlinks the partial
    file on ANY failure (BaseException) and re-raises."""
```

Single owner of everything both uploads previously duplicated — the routers must not write their own chunk loops:

1. **File creation — exclusive, private**: `dest_path.parent.mkdir(parents=True, exist_ok=True)`, then `fd = os.open(dest_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o600)` and `handle = os.fdopen(fd, "wb")`. Exclusive create never overwrites and refuses a pre-existing path or symlink (`FileExistsError` → error out; cleanup must **unlink only a file this call created**, guarded by a created-flag, so a pre-existing file is never removed). `0o600` preserves the permission today's `.db` uploads get from `mkstemp` — moving them into the app dir with a plain `open("wb")` would loosen them to the umask default (0644) on multi-user hosts. For the docx path this *tightens* from today's `open(file_path, "wb")` (`docx_import_service.py:1322`) to 0600 — a security-positive delta; LibreOffice and the app run as the same user, so rendering is unaffected. Tests: pre-existing dest → error and the pre-existing file is untouched; on POSIX `mode & 0o777 == 0o600` (skipped on Windows).
2. **Optional header check, magic before size**: when `magic_prefix` is set, accumulate first reads until `len(buf) >= len(magic_prefix)` **or EOF**, then `buf.startswith(magic_prefix)` — 15-byte `b"SQLite format 3"`, EOF-short-read compatible, no NUL tightening (D1.1). Fail → `ValueError(magic_message)`.
3. **Size cap**: reject with `ValueError(over_limit_message)` as soon as cumulative bytes would exceed `max_bytes`, before writing the overflowing chunk.
4. **Per-chunk write: `await run_in_threadpool(handle.write, chunk)` — decision locked** (not the ≤1 MiB sync-write tradeoff). Rationale: it is byte-for-byte what Starlette's own `UploadFile.write` does for a non-in-memory spool (`starlette/datastructures.py:451-458`), so behavior matches the framework's write path. Both the `reader.read(chunk)` await and the per-chunk write await go through `await_with_drain` (D4): cancellation never proceeds while a chunk read/write is in flight, so the `BaseException` cleanup can never unlink under a concurrent worker, and an in-flight read cannot be orphaned by dependency teardown closing the spool. Reads ride `await reader.read(chunk_size)`, which for a spooled upload is already threadpool-delegated (`datastructures.py:460-463`).
5. **Cleanup**: `except BaseException:` unlink the partial `dest_path` — only if this call created it (created-flag; see 1) — (failure to unlink → warning log, never masks the original error) and re-raise; cancellation, `OSError`, and both `ValueError` rejections all flow through here.
6. **Return value**: returns the bytes written. After LC there is no production consumer (the old `record_payload_size` calls are gone); the int stays because the helper unit tests assert it as the streaming-count contract (stated consumer: `tests/test_streaming_db_upload.py` helper units).

Router mapping (thin, no duplicated loop logic):

- **.db** (`projects.py`): `_save_upload_to_temp_db` mints the name via `build_owned_db_filename`, calls the helper with `magic_prefix=_MAGIC` / `magic_message="文件不是有效的 SQLite 数据库"` / `max_bytes=_MAX_IMPORT_SIZE` / the existing over-limit text, catches `ValueError` **inside itself and converts to `HTTPException(400, str(e))`** — this catch sits naturally **outside the import `try`**, so the import error mapping (`ValueError → ImportError → 400 {detail, code}`) never sees upload rejections; wire responses (status + both texts) stay byte-identical to today's `_save_bytes_to_temp` HTTPExceptions. The helper's byte count has no consumer here (no perf instrumentation — D1.5); the wrapper just returns the `Path`.
- **.docx** (`import_docx.py`): preview calls the helper with `magic_prefix=None` / `max_bytes=MAX_FILE_SIZE` / the existing 10MB over-limit text; its `ValueError` flows into the **existing** `except ValueError → HTTPException(400, str(e))` handler (unchanged text/status). No `record_*` calls (deleted by LC, none reintroduced).

Evidence note: `DocxScreenshotService.cleanup_old_caches` deletes **directories only** (`docx_screenshot_service.py:750-768`, `if not temp_dir.is_dir(): continue` → `shutil.rmtree`), so `.db` files migrating into the same parent dir are never touched by it — recorded in `research/evidence-2026-10-09.md`.

## D4 — Threadpool wraps (R2) — final endpoint list for AC3

Wrap **only the heavy service calls** with `fastapi.concurrency.run_in_threadpool` (`await` suspends the endpoint coroutine, so the request-scoped session is handed to the worker thread **sequentially** in the normal path).

**Cancellation semantics — verified on the installed stack** (Python 3.10.21, anyio 4.15.1, Starlette 0.37.2, FastAPI 0.110.3, Uvicorn 0.27.1; bounded experiments in `/tmp/trl-evidence/exp1_anyio_scope.py`, `exp2_raw_cancel.py`, `exp3_middleware_disconnect.py`, run with the venv interpreter and proxy vars unset):

- **`run_in_threadpool` does not make the awaiting task wait for the worker under a raw `asyncio.Task.cancel()`.** anyio wraps the worker-future wait in a shielded scope (`_backends/_asyncio.py:2671`), but on Python 3.10 (no `Task.uncancel()` bookkeeping) a raw cancel is delivered to the awaiter immediately while the worker keeps running to completion in the background (Exp2 event order: `cancel_requested → task_cancelled_delivered → teardown_event → worker_end`). Wait-for-worker holds only for AnyIO-native scope cancellation — and there the cancellation is then lost on 3.10 (`cancelled_caught=False`, the task continues normally; Exp1).
- **What can deliver raw cancellation to a request task here**: uvicorn shutdown, **only when `--timeout-graceful-shutdown` is explicitly set and exceeded** (`server.py:284-293` calls `t.cancel()`; the default waits indefinitely for in-flight requests), a second Ctrl+C force exit, or AnyIO-internal scope cancellations. **Client disconnect does not cancel**: uvicorn only sets `cycle.disconnected = True` (`httptools_impl.py:128` / `h11_impl.py:124`; the only protocol-level `.cancel()` is the keep-alive timer), and BaseHTTPMiddleware forwards a disconnect to the app only if the app polls `receive()` (`middleware/base.py:116-133` — the lone `cancel_scope.cancel()` at :124 is the receive race-winner mechanism) — our endpoints never poll `receive()` mid-request (Exp3: blocked worker + disconnect available → app ran to completion, 200, no cancellation).
- Consequences: before TRL there was no overlap window (the sync import could not be interrupted mid-work — cancellation lands only at awaits); the threadpool move creates it, so the accepted invariant — never close/use the request Session or a file handle concurrently with a still-running worker — **cannot be met by wording alone**; the mechanism does not provide it (raw cancel releases the caller while the worker runs). **Accepted design (lead-approved after the `exp4` prototype; independently re-run by the lead: `SUMMARY failures=0`, exit 0)**: a completion guard `await_with_drain(awaitable)` in the new leaf module `backend/src/services/await_drain.py` (≤50 lines, production signature has no test hooks):

  ```python
  inner = asyncio.ensure_future(awaitable)
  try:
      return await asyncio.shield(inner)
  except asyncio.CancelledError as first_cancel:
      while not inner.done():
          try:
              with anyio.CancelScope(shield=True):
                  await asyncio.shield(inner)
          except asyncio.CancelledError:
              continue      # repeated raw caller cancels / scope-exit redelivery
          except Exception:
              break         # ordinary worker error breaks the drain
      if not inner.cancelled():
          exc = inner.exception()
          if exc is not None:
              logger.warning("worker exception during cancellation drain", exc_info=exc)
      raise first_cancel
  ```

  Validated semantics (exp4 rev3 prototype, 7 scenarios / 34 assertions): the first cancellation is retained; repeated raw caller cancels are absorbed by the anyio shield scope with no busy-spin (level-triggered cancellation is drained, matching anyio's official cleanup guidance); an inner task that raises `CancelledError` itself terminates promptly (`while not inner.done()` is already satisfied; the `inner.cancelled()` guard avoids `exception()` on a cancelled task); worker exceptions are retrieved, logged, and never replace the retained cancellation; the cancellation is re-raised only after the inner work is done, so request teardown never overlaps a running worker. Boundaries: process kill, event-loop destruction, and direct cancellation of the private inner task are out of scope; measured on py3.10.21 + anyio 4.15.1. This delays only a shutdown-cancelled request's teardown until the worker finishes; under uvicorn's default graceful shutdown (waits indefinitely) behavior is unchanged. **Exactly five wrap points**: `projects.py`'s three session-bearing service calls (`import_single_project`, both `merge` calls) and `upload_streaming`'s `reader.read(chunk)` await plus the per-chunk `run_in_threadpool(handle.write, chunk)` await — covering every await that shares request-scoped state (Session, spool fd, dest fd) with a worker; screenshot/cleanup wraps stay unwrapped. `asyncio.to_thread` remains forbidden for these calls — under the guard it buys nothing, and under AnyIO scopes it forfeits the wait-for-worker that `run_in_threadpool` provides.
- Test assertion target: the spy monkeypatches **`fastapi.concurrency.run_in_threadpool`** in the router module namespaces; if an endpoint used `asyncio.to_thread` instead, the spy never fires and the test goes RED — that is the automated guard for this constraint.

| # | Endpoint | Heavy call(s) to wrap | Session into thread? |
|---|---|---|---|
| 1 | `projects.py:100` `import_project_db` | `ProjectDbImportService.import_single_project` (:116-, inside try :115-119) | yes, sequential handoff |
| 2 | `projects.py:136` `import_database_merge` | `DatabaseMergeService.merge` (:152-, inside try :151-155) | yes, sequential handoff |
| 3 | `projects.py:178` `import_auto` | `DatabaseMergeService.merge` (:193-, inside try :192-196) | yes, sequential handoff |
| 4 | `import_docx.py:316` `preview_docx_import` | `parse_full` (:374) and `DocxScreenshotService.start` (:414) — two separate wraps | no (static, session-free) |
| 5 | `import_docx.py:657` `start_docx_screenshot` | conditional `parse_full` (:698) and `DocxScreenshotService.start` (:726) | no |
| 6 | `import_docx.py:880` `cleanup_screenshots` | `DocxScreenshotService.cleanup_old_caches(days)` (sync dir walk + unlinks; admin-manual, bounded) | no |

Request-side `finally` unlink blocks for the three `.db` endpoints sit at `projects.py:131-132` / `:173-174` / `:215-216` — unchanged by the wraps (they run after the awaited threadpool call returns).

Not wrapped (documented, light — in-memory lookups / glob / `FileResponse`): `get_ai_review_status` (:444), `get_screenshot_status` (:742), `get_screenshot_page` (:807). `start_ai_review` (:405) stays on the event loop: it is `async` and dispatches via `asyncio.create_task` — wrapping it would be wrong.

Thread-safety notes: `DocxScreenshotService.start` mutates a global task registry under a `threading` lock and already runs its heavy `_refresh_page_ranges` render outside the lock (2026-07-04 fix) — moving the call from the event loop into a worker thread is strictly safer. `import_single_project` / `merge` already use the engine from threadpool threads elsewhere (sync endpoints), so no new concurrency class is introduced. AC3's automated assert: a monkeypatched `run_in_threadpool` spy (per router module namespace, delegating to the real one) must be hit by each listed endpoint; parametrized.

## D5 — `.db` sweep coverage (R4)

Extend `purge_expired_uploads` (`docx_import_service.py:1370-1408`) — `background_jobs.py` untouched:

1. Suffix filter `:1386`: `p.suffix.lower() in (".docx", ".db")`.
2. `cleanup_temp` glob `:1348`: `{temp_id}_*.docx` → also match `{temp_id}_*.db`, so `discard_upload` (used by the sweep for new-format ids) actually removes the `.db` file — today it would return `removed = not path.exists()` → False and the file would survive the sweep.
3. Legacy/unowned names (no 32-hex id): existing plain-unlink branch `:1397` already covers them, `.db` included.
4. TTL stays `UPLOAD_TTL_HOURS = 24` (:62) for both suffixes; no policy/config surface added (out of scope).

AC5 test: owned-format `.db` file with an old mtime (`os.utime`) is purged together with any same-id artifacts; a fresh `.db` survives; a legacy-name `.db` is file-only purged.

**Concurrency boundary: in-use `.db` vs the 24h sweep** — safe as a **normal-path expectation**, not an absolute guarantee; no locking or scheduling framework is added (scope stays closed):

- The sweep selects only files with `mtime < now - 24h` (`purge_expired_uploads`, `:1382/:1389`). An upload being written or imported has a fresh mtime, so on the normal path (requests complete in seconds-to-minutes, far below the TTL) the sweep never selects a file a request is using, and the request-side `finally: unlink` and the hourly sweep do not race on the same file.
- **Residual limitation, stated plainly**: the freshness argument is mtime-based, not a hard invariant — an anomalously long-running import (worse than 24h) or a wall-clock jump (e.g. NTP step backward / timezone-independent clock change) can in principle push an in-use file across the cutoff. This is accepted deliberately. The worst case stays bounded either way: POSIX unlink of an open file is safe — the import's open SQLite handle stays valid and the request completes (name gone afterwards); on Windows the unlink raises `OSError`, which the sweep already logs and continues past (`:1403-1405`). Only the temp *source* file is affected; the main database (written via the request's SQLAlchemy session) is untouched in every branch. Fixes like mtime refresh, locks, or a scheduling framework are out of scope.
- The sweep remains a **crash-leak backstop only**; the normal lifecycle is the request's own `finally` unlink, and parse-failure cleanup stays `discard_upload` (unchanged).

## D6 — Tests (R5; file layout and RED reasons)

| File | Cases | RED reason (before the change) |
|---|---|---|
| `tests/test_streaming_db_upload.py` (new) | helper units for `stream_upload_to_file` (magic order incl. EOF-short file, size cap text, cancellation → partial unlinked, cleanup-failure → warning + original error preserved, per-chunk write via run_in_threadpool spy on `src.services.upload_streaming`, returned byte count); file-creation units (pre-existing dest → `FileExistsError` and the pre-existing file untouched; POSIX `mode & 0o777 == 0o600`, skip on Windows); endpoint-level: patched-small `_MAX_IMPORT_SIZE` → 400 text + empty temp dir; fake-upload read-count/early-stop (app-layer proof only — D1 boundary note); stored-name closure: suffix-less (`foo`) and foreign-suffix (`foo.backup`) uploads accepted as today but land as `{temp_id}_u{uid}_p0_upload.db` (fixed stem, no user component); a ~300-char-filename `.db` upload still imports normally (the ENAMETOOLONG regression guard — today's mkstemp path has no user filename, the new one must not either); normal small upload still imports (AC2 anchor) | `stream_upload_to_file` / `_save_upload_to_temp_db` / `build_owned_db_filename` do not exist (new-function import error is acceptable); order/limit/no-residue asserts fail against `_save_bytes_to_temp` behavior (full buffer, wrong dir, arbitrary stored suffix); cancellation/cleanup-failure cases fail because no helper exists yet — and would also fail against any `except Exception`-only cleanup |
| `tests/test_streaming_docx_upload.py` (new) | oversize rejection (patched `MAX_FILE_SIZE`) with the exact existing ValueError text → 400; no residue; read-count early-stop; cancellation mid-stream → partial file unlinked; normal upload round-trips to preview (AC2) | streaming path missing; current code buffers whole body (fake read exhausts before reject) |
| `tests/test_async_heavy_threadpool.py` (new) | parametrized over the 6 endpoints in D4: **`fastapi.concurrency.run_in_threadpool`** spy called, result passthrough, heavy fn actually executed inside the delegate | endpoints call services inline — spy never fires; an endpoint switched to `asyncio.to_thread` also never fires the spy (this is the D4 mechanism guard) |
| `tests/test_docx_temp_isolation.py` (extend) | D5 cases: expired `.db` purged (owned format), fresh `.db` survives, legacy `.db` file-only purge, same-id artifacts dropped | `.db` files are invisible to the `.docx`-only filter / `cleanup_temp` glob — expired file survives |
| `tests/test_temp_dir_single_source.py` (new) | subprocess AC4 assert (D2): defaults equal + absolute + `uploads/docx_temp` suffix + cwd-independence | `temp_paths` module missing (ImportError, acceptable: new module); subprocess assert fails on relative `TEMP_DIR` |
| `tests/test_await_drain.py` (new) | the exp4 rev3 harness (`/tmp/trl-evidence/exp4_drain.py`) ported to pytest — 7 scenarios with deterministic `threading.Event` sync, 15s watchdog, real assertions, nonzero exit on any failure: A repeated raw cancel, B worker error after cancel, C clean success, D worker error no cancel, E triple cancel, F inner raises `CancelledError`, G anyio scope cancel during drain; per scenario: exact outcome, `worker_end < teardown` (teardown recorded in a `finally`), `not task.done()` after each cancel while the worker is Event-blocked, C's return value, D's original RuntimeError, B's warning capture | `backend/src/services/await_drain.py` does not exist (ImportError; new-module case) |

Existing guards that must stay green (AC2/AC6): `test_project_import.py`, `test_docx_import_contract.py`, `test_docx_temp_isolation.py`, `test_rate_limit.py`, `test_background_jobs_flag.py` (`test_perf_harness.py` is deleted by LC and must not be referenced), plus the full suite. **Seam conversions (assertions unchanged, targets change)**: `test_docx_temp_isolation.py:50/:83` naming units call `build_owned_filename` (same name-format + lowercase-ext asserts); `test_rate_limit.py:115` and `test_docx_import_contract.py:191` monkeypatch `src.routers.import_docx.DocxImportService.save_temp_file` — re-targeted to the new call path (`stream_upload_to_file` reader seam / `_save_upload_to_temp_db`) so they do not silently become dead patches.

## D7 — Desktop (frozen) mode delta — declared, not exercised

Packaging is PyInstaller **onedir** (`backend/crf.spec`: `exclude_binaries=True` at :98 + `COLLECT` at :111, PyInstaller ≥6 default `contents_directory`), so bundled modules' frozen `__file__` lives under `sys._MEIPASS` = `<exe_dir>/_internal`. `DOCX_TEMP_DIR` (computed from `__file__`) therefore resolves to `<exe_dir>/_internal/uploads/docx_temp` — the same place `DocxScreenshotService.BASE_DIR` already writes today, so the two stay unified in frozen mode as well. Declared deltas:

- Word upload temps move from the cwd-relative `<exe_dir>/uploads/docx_temp` (cwd is the exe dir via `app_launcher.py` chdir) to `<exe_dir>/_internal/uploads/docx_temp`.
- `.db` import temps move from the system temp dir to that same app dir — this also removes the frozen-mode leak where a crash left `.db` files in the system temp with no sweeper.
- **No new permission requirement**: the desktop DB and config already resolve beside the exe (`config.py` `_CONFIG_DIR = CONFIG_FILE.resolve().parent`; `./crf_editor.db`), so the exe tree must already be writable for the app to function.
- No frozen build runs in this task — report this section as **not run** (declared desktop-mode delta only).

## Verification plan

- Full suite with coverage — **baseline and final use the identical command** (worktree, proxy vars unset):
  `cd "$WT/backend" && env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY /home/decade/.venvs/crf-editor/bin/python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered -q`
  (If the session's hook refuses `env -u`, wrap `unset` + pytest in a `/tmp` script — see memory note.)
- Formatting gate (BF merged): `cd "$WT/backend" && /home/decade/.venvs/crf-editor/bin/ruff format --check <changed files>` against `backend/ruff.toml`; `ruff check <changed files>` additionally, only if BF's config enables lint rules and `main` is clean under it. New files are written in that style from the start.
- Coverage: record per changed file; must not drop vs the baseline run of the same command.
- API smoke (no browser needed — backend-only change, zero UI delta): throwaway server on port 8901 per RB §4, one real `.docx` preview upload + one small `.db` import via `httpx` (venv has no `requests`). If blocked, state not-run scope; never claim browser verification that did not happen. No frozen (PyInstaller) build runs — D7 is a declared desktop-mode delta, reported as not run.
- Frontend suite: not run — zero frontend change (state in report).

## Risks

- **Boundary honesty in reports**: streaming removes the endpoint-level full bytes copy only; the framework multipart spool (≤1 MiB RAM, then disk) and the network transfer still precede the endpoint, and the spool→managed-temp disk write remains (D1). Reports must describe the win in those terms — no "rejects before the body is received" phrasing, no middleware/proxy work.
- **Order regressions in error texts**: locked by dedicated tests (D6 row 1); run `test_project_import.py` after every projects.py edit.
- **Post-LC/BF drift**: every line anchor in these docs is pre-LC/BF and indicative; symbol names are authoritative. S0 re-anchors; if a symbol is missing in the worktree, STOP and report instead of guessing.
- **`.db` files now land in `uploads/docx_temp`**: transient during requests only; the admin-facing recycle-bin size estimate counts per-project logos, not this dir — no user-visible metric changes. `cleanup_old_caches` removes directories only, never these files (D3b evidence note).
- **Shared-worktree injection guard** (memory note): reconcile `git status` against the file inventory above before every commit; peer sessions may merge LC/BF/ELC/BD into main mid-flight — re-check S0's merge state before resuming.
