# Implementation plan: unified temp-resource lifecycle

Follow the parent runbook `/home/decade/CRF-Editor/.trellis/tasks/10-08-review-remediation/implement.md` ("RB"). This file lists only task-specific steps. Design decisions D1–D7 refer to `design.md` in this directory; evidence is in `research/evidence-2026-10-09.md`.

- Branch: `refactor/temp-resource-lifecycle`
- Worktree: `/home/decade/CRF-Editor-temp-resource-lifecycle`
- **Ordering (user decision)**: do NOT open until `legacy-cleanup` (LC) and `backend-format` (BF) have both merged into `main` (S0 verifies). Then branch from that `main` and run **in parallel** with `export-layer-cleanup` (ELC) and `backend-dedup` (BD); the coordinator relays any announced overlap.
- Anchors: all line numbers predate LC's deletions and BF's reformat — **symbol names are authoritative, line numbers indicative**; S0 re-anchors by symbol.
- Python: `/home/decade/.venvs/crf-editor/bin/python` (ruff binary: `/home/decade/.venvs/crf-editor/bin/ruff`, not on PATH). No package installs. Do not touch the dev server running from the main checkout (RB §1).

## Task board

- [ ] S0 Start: **LC+BF merge gate (STOP if unmet)** + task start + worktree + symbol re-anchor + coverage baseline
- [ ] S1 RED: write all new/extended tests, confirm each fails for its stated reason
- [ ] S2 GREEN-1 (D2+D3+D3b+D4 helper): temp dir single source + naming helpers + shared streaming writer + `await_drain`
- [ ] S3 GREEN-2 (D5): `.db` sweep coverage
- [ ] S4 GREEN-3 (D1): streaming `.db` uploads
- [ ] S5 GREEN-4 (D1): streaming docx upload + delete `save_temp_file`
- [ ] S6 GREEN-5 (D4): threadpool wraps
- [ ] S7 Full suite + coverage + ruff gates
- [ ] S8 API smoke (throwaway server)
- [ ] S9 Docs sync (ownership split)
- [ ] S10 Review gates (incl. hermeticity + dead-patch greps)
- [ ] S11 Report and stop (commit / merge / push need separate user authorization)

## S0 — Start

**Precondition gate (STOP if it fails, report to the coordinator):** `main` must contain both LC's and BF's merges, verified by symbol, not by commit-message trust:

```bash
git -C /home/decade/CRF-Editor log --oneline --merges -5          # LC and BF merge commits visible
test ! -e /home/decade/CRF-Editor/backend/src/perf.py && echo "LC ok"      # perf.py absent
test -e /home/decade/CRF-Editor/backend/ruff.toml && echo "BF ok"          # ruff config present
grep -rn "perf_span\|record_payload_size" /home/decade/CRF-Editor/backend/src/routers/projects.py || echo "LC ok"
```

Only then start:

```bash
cd /home/decade/CRF-Editor
python3 ./.trellis/scripts/task.py start .trellis/tasks/10-08-temp-resource-lifecycle
python3 ./.trellis/scripts/task.py set-branch .trellis/tasks/10-08-temp-resource-lifecycle refactor/temp-resource-lifecycle
git -C /home/decade/CRF-Editor worktree add /home/decade/CRF-Editor-temp-resource-lifecycle -b refactor/temp-resource-lifecycle main
```

**Re-anchor by symbol in the worktree** (LC/BF moved every line): `grep -n` the symbols — `_MAX_IMPORT_SIZE`, `_save_bytes_to_temp`, `import_project_db`, `import_database_merge`, `import_auto` in `projects.py`; `preview_docx_import`, `start_docx_screenshot`, `save_temp_file` call site in `import_docx.py`; `TEMP_DIR`, `MAX_FILE_SIZE`, `save_temp_file`, `cleanup_temp`, `purge_expired_uploads` in `docx_import_service.py`; `BASE_DIR` in `docx_screenshot_service.py`. Update the worktree-local line references before editing; if a symbol is missing, STOP and report.

Baseline (RB §3; suite is hermetic — no config/DB setup, never copy `config.yaml` / `*.db`). **The baseline must use the same coverage command as the final run** so S7 can compare per-file coverage:

```bash
cd /home/decade/CRF-Editor-temp-resource-lifecycle/backend && env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY /home/decade/.venvs/crf-editor/bin/python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered -q
```

Record pass/fail/xfailed counts **and** save the per-file coverage table (tee to a file outside the repo, e.g. `/tmp/temp-lifecycle-baseline.txt`). The count will differ from the 2026-10-09 reference (1042 passed / 4 xfailed) because LC deletes the perf test files — record whatever the post-LC/BF `main` gives; there is no absolute expected number. An additional plain `-m pytest -q` speed run is optional; the coverage run above is the recorded baseline. If the harness refuses `env -u`, put `unset` + pytest into a `/tmp` script instead.

## S1 — RED (write tests first, one batch, run to confirm failure reasons)

Create/extend per design.md D6. Every test must fail for the stated reason — not an incidental import error (except the new-module cases D6 explicitly allows). Key mechanics:

- Patch `_MAX_IMPORT_SIZE` / `MAX_FILE_SIZE` down to keep oversized-body tests cheap; restore via monkeypatch.
- Fake upload for the no-full-buffer asserts: an object with a counted, generator-backed `read(n)`; assert chunked reads and early stop. Scope claim: this proves the **application layer** (`read(size)` chunking, write-as-you-go, read counting) — Starlette's multipart spool and the network transfer complete before the endpoint runs (design.md D1 boundary note); do not assert or report transport-level early rejection.
- Cancellation test: fake upload whose `read(n)` raises `asyncio.CancelledError` mid-stream; assert the partial temp file is gone and `CancelledError` propagates. This is why the writers' cleanup must use `except BaseException` (Python 3.10: `CancelledError` is `BaseException`, not `Exception`).
- Final-cleanup-failure test: monkeypatch the partial-file unlink to raise; assert a warning is logged and the original error still propagates (never masked).
- `.db` stored-name closure: suffix-less (`foo`) and foreign-suffix (`foo.backup`) SQLite uploads are accepted exactly as today but the stored temp file is `{temp_id}_u{uid}_p0_upload.db` (sentinel `p0`, fixed stem, forced `.db` suffix — no user-controlled path component); a ~300-char uploaded filename still imports normally (ENAMETOOLONG regression guard) — RED today because `_save_bytes_to_temp` stores the caller's suffix and would ENAMETOOLONG on the new owned path shape.
- Subprocess AC4 test uses `sys.executable -c` with a non-`backend/` cwd; no conftest involvement.
- Threadpool spy: monkeypatch **`fastapi.concurrency.run_in_threadpool`** in `src.routers.projects` / `src.routers.import_docx` module namespaces with a recording delegator. The symbol choice is the D4 mechanism guard: an endpoint using `asyncio.to_thread` (forbidden for the session-bearing imports — the drain guard is written against the anyio-managed worker future that `run_in_threadpool` provides) never fires the spy, so the test goes RED.
- New RED tests for the completion guard, `tests/test_await_drain.py` (design.md D6 row): port the validated exp4 rev3 harness — 7 scenarios (A repeated raw cancel, B worker error after cancel, C clean success, D worker error no cancel, E triple cancel, F inner raises `CancelledError`, G anyio scope cancel during drain) with deterministic `threading.Event` sync, 15s watchdog, and the full assertion set (exact outcome per scenario, `worker_end < teardown` recorded in a `finally`, `not task.done()` after each cancel while the worker is Event-blocked, C's return value, D's original RuntimeError, B's warning capture). RED because `backend/src/services/await_drain.py` does not exist.

**Seams and targets may change; assertions do not.** Existing tests are re-targeted only where the new call path forces it (design.md D6 seam conversions: `test_docx_temp_isolation.py:50/:83` → `build_owned_filename`; `test_rate_limit.py:115` / `test_docx_import_contract.py:191` → the new streaming seam) — every assertion text/shape stays identical; extend `test_docx_temp_isolation.py` additively. After LC/BF the line numbers inside those tests have drifted — locate by symbol.

## S2 — GREEN-1: D2 + D3 + D3b

- New `backend/src/services/temp_paths.py` (`DOCX_TEMP_DIR`).
- `docx_screenshot_service.py:75` → `BASE_DIR = DOCX_TEMP_DIR` (leaf import only — `temp_paths` must not import services).
- `docx_import_service.py:1283` → `TEMP_DIR = DOCX_TEMP_DIR`.
- Extract the two naming helpers from `save_temp_file` (locate by symbol): `build_owned_filename(filename, *, user_id, project_id)` (docx semantics, unchanged, sole consumer of the shared sanitation core) and `build_owned_db_filename(*, user_id)` — **no filename parameter**, mints `{temp_id}_u{uid}_p0_upload.db` (sentinel `p0`, fixed stem `upload`, forced `.db` suffix; nothing user-controlled reaches the path). `save_temp_file` temporarily delegates to `build_owned_filename` — it is **deleted in S5** (decision: no production code kept solely for tests; D3).
- **Hermeticity rule (D2)**: all callers resolve the temp dir from the class attr `DocxImportService.TEMP_DIR` at call time. `DOCX_TEMP_DIR` may be referenced in exactly three places (its `temp_paths.py` definition + the two class-attr assignments) — S10 greps for this.
- New `backend/src/services/upload_streaming.py`: `stream_upload_to_file` per D3b — single chunk loop, mkdir, magic-before-size (15-byte prefix, EOF-short compatible), size cap, per-chunk `run_in_threadpool` write (locked decision), `except BaseException` cleanup. No FastAPI types; reader is structural. The `reader.read(chunk)` and per-chunk write awaits go through `await_with_drain` (D4).
- New `backend/src/services/await_drain.py`: `await_with_drain(awaitable)` per D4 — ≤50 lines, production signature without test hooks; port the validated exp4 rev3 logic verbatim (initial shield wait; drain under `anyio.CancelScope(shield=True)` while `not inner.done()` with shield on every iteration; ordinary worker Exception breaks the drain; `not inner.cancelled()` guard before `inner.exception()` + warning; re-raise the retained first cancellation; boundary docstring: process kill / loop destruction / direct inner-task cancel out of scope; measured on py3.10.21 + anyio 4.15.1). S4/S6 depend on it.
- Run: the new streaming-naming/helper units, `test_temp_dir_single_source.py`, then `test_docx_temp_isolation.py` + `test_docx_import_contract.py` (RED→GREEN evidence per test).

## S3 — GREEN-2: D5

- `purge_expired_uploads` suffix filter adds `.db`; `cleanup_temp` glob covers `{temp_id}_*.db`.
- Run `test_docx_temp_isolation.py` (new `.db` cases GREEN) and `test_background_jobs_flag.py` (no sweep regressions).

## S4 — GREEN-3: D1 streaming `.db` uploads (projects.py)

- Replace `_save_bytes_to_temp` with the thin `_save_upload_to_temp_db`: mint via `build_owned_db_filename`, call `stream_upload_to_file` (D3b) with `_MAGIC`/both texts/`_MAX_IMPORT_SIZE`, catch `ValueError` inside the wrapper → `HTTPException(400, str(e))` — **outside the import `try`**, keeping the original response shape. No router-local chunk loop. **No perf instrumentation** (LC deleted `perf.py`; do not reintroduce `perf_span`/`record_payload_size`/`record_counter` — D1.5).
- Rewire the three endpoints (none has a `project_id` — do not invent one); keep the `try/except ValueError→ImportError / sqlite3.DatabaseError / Exception / finally unlink` chain (locate the `finally` blocks by symbol). Normal-path non-overlap of the `finally` unlink and the 24h sweep, with the stated mtime limitation — design.md D5; add no locks.
- Run `test_streaming_db_upload.py` + `test_project_import.py` + `test_rate_limit.py` (import rule untouched).

## S5 — GREEN-4: D1 streaming docx upload (import_docx.py) + save_temp_file removal

- Rewire the preview's save: ext check unchanged (locate by symbol), then `build_owned_filename` + `stream_upload_to_file` (D3b) with `magic_prefix=None`, `MAX_FILE_SIZE`, the existing 10MB text; the helper's `ValueError` lands in the existing `except ValueError → HTTPException(400, str(e))` (unchanged). No router-local chunk loop; **no `record_payload_size`/`record_counter`** (deleted by LC, none reintroduced). The in-flight read/write drain already lives inside `stream_upload_to_file` (`await_with_drain`, D4) — no extra router-level guard.
- **Delete `save_temp_file`** (its production callers are gone: preview streams; LC deleted `run_perf_baseline.py`). Convert its remaining test uses per design.md D6: `test_docx_temp_isolation.py:50/:83` naming units → `build_owned_filename` (same asserts); re-target the `save_temp_file` monkeypatches in `test_rate_limit.py:115` and `test_docx_import_contract.py:191` to the new seam (`stream_upload_to_file` / `_save_upload_to_temp_db`) — locate by symbol post-BF, assertions unchanged. Verify no reference to `save_temp_file` remains: `grep -rn save_temp_file backend/` → only historical changelog/docs.
- Run `test_streaming_docx_upload.py` + `test_docx_import_contract.py` + `test_docx_temp_isolation.py`.

## S6 — GREEN-5: D4 threadpool wraps

- Wrap the six heavy call sites per the D4 table with **`fastapi.concurrency.run_in_threadpool`** — `asyncio.to_thread` is forbidden for the three session-bearing import calls. Leave the light endpoints and `start_ai_review` alone; **add no instrumentation**.
- Each of the three session-bearing wrapped calls is additionally wrapped with **`await_with_drain(...)`** (D4): retains the first cancellation, drains repeated raw caller cancels under the anyio shield, retrieves/logs worker exceptions, and re-raises the cancellation only after the worker completes — so `get_session`'s `session.begin()` teardown never overlaps a running worker on the same Session. The naive `except CancelledError: await task` shape is forbidden (unsafe on a second raw cancel; a worker error would replace the cancellation). Verified semantics: raw `Task.cancel()` is delivered immediately on this stack (py3.10 + anyio 4.15 — the scope shield cannot intercept it); client disconnect does not cancel; prototype evidence `/tmp/trl-evidence/exp1–4`, durable test = `tests/test_await_drain.py`.
- Run `test_async_heavy_threadpool.py` + `test_await_drain.py`, then the full targeted set from S2–S5 again (interaction check: preview's `parse_full` wrap sits before `await start_ai_review`).

## S7 — Full suite + coverage (same commands as S0)

```bash
cd /home/decade/CRF-Editor-temp-resource-lifecycle/backend && env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY /home/decade/.venvs/crf-editor/bin/python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered -q
```

Record coverage for every changed file (`projects.py`, `import_docx.py`, `docx_import_service.py`, `docx_screenshot_service.py`, `temp_paths.py`, `upload_streaming.py`); must not drop vs the S0 run.

**Formatting gate (BF is merged):**

```bash
cd /home/decade/CRF-Editor-temp-resource-lifecycle/backend && /home/decade/.venvs/crf-editor/bin/ruff format --check src/routers/projects.py src/routers/import_docx.py src/services/docx_import_service.py src/services/docx_screenshot_service.py src/services/temp_paths.py src/services/upload_streaming.py
```

(config `backend/ruff.toml`.) Run `/home/decade/.venvs/crf-editor/bin/ruff check <changed files>` additionally **only if** BF's config enables lint rules and `main` is clean under it — check `git -C /home/decade/CRF-Editor log --oneline -1 -- backend/ruff.toml` plus one probe run on an untouched file. New files (`temp_paths.py`, `upload_streaming.py`) are written in that style from the start (line-length 120, double quotes).

## S8 — API smoke (backend-only change; no browser UI delta expected)

Per RB §4: throwaway server on port 8901 (`CRF_DATABASE_PATH`/`CRF_STORAGE_UPLOAD_PATH` under `/tmp/<dir>`, `CRF_ENV=production`), then `httpx` (not `requests`): login → small real `.docx` preview upload → small `.db` import → confirm the temp file lands in `uploads/docx_temp` and is gone after the request. If blocked (port, env), report the blocker and the reduced scope; never claim verification that did not run.

**Word temp-dir isolation after R3 (mandatory):** `CRF_STORAGE_UPLOAD_PATH` does **not** redirect `DocxImportService.TEMP_DIR` / `DocxScreenshotService.BASE_DIR` anymore — both resolve to the absolute `<repo-root>/backend/uploads/docx_temp` computed from the server's own `__file__`. Therefore:

- Run the throwaway server **only from the worktree** (`/home/decade/CRF-Editor-temp-resource-lifecycle`) — its temp dir resolves into the worktree, never into the main checkout where the live dev server's real temp files live. Never run a smoke server from the main checkout.
- No env knob exists for these two attrs (by design, no new config in scope); the worktree-local absolute dir plus post-smoke cleanup is the isolation: before smoke, record the worktree `backend/uploads/docx_temp` contents (fresh worktree: absent/empty); after smoke, assert no leftovers remain (both upload kinds are unlinked in-request).
- `.db` import temp files now land in that same dir during the smoke — same cleanup assert.

## S9 — Docs sync (ownership split — aligned with `shared-rule-convergence`)

**Executor edits directly:**

- `backend/.claude/CLAUDE.md`: temp-dir single source; `purge_expired_uploads` now also sweeps `.db` import leftovers; `save_temp_file` removed (naming via `build_owned_filename` / `build_owned_db_filename`); Change Log entry.
- `.context/current/branches/refactor/temp-resource-lifecycle/session.log`: decision records for (a) leaf-module vs cross-service alias, (b) `.db` into the owned dir with sentinel `p0`, fixed stem `upload` + forced `.db` stored suffix (no user-controlled path component — mkstemp parity, ENAMETOOLONG/odd-char regression guard), (c) `cleanup_screenshots` inclusion, (d) `except BaseException` failure policy + exclusive 0600 create, (e) `run_in_threadpool` mandated over `asyncio.to_thread` for session-bearing imports (raw `Task.cancel` is delivered immediately on this stack — py3.10 + anyio 4.15 scope shield cannot intercept it — so `await_with_drain`, not the mechanism, preserves teardown ordering; flush-only services + `get_session` commit), (f) per-chunk `run_in_threadpool` write in the shared helper (locked, mirrors Starlette `UploadFile.write`), (g) `save_temp_file` deleted (no production code kept solely for tests), (h) cancellation semantics: raw `Task.cancel` is delivered immediately on this stack (anyio scope shield cannot intercept it on 3.10), client disconnect does not cancel, `await_with_drain` defers teardown until worker completion — prototype evidence `/tmp/trl-evidence/exp1–4` (exp4 rev3: 7 scenarios, failures=0), durable test = the pytest port `tests/test_await_drain.py`, (i) no perf instrumentation reintroduced post-LC (workflow.md rules 1/3/4).

**Coordinator-owned — the executor does NOT edit these; it proposes the exact text in its report:** root `.claude/CLAUDE.md` Change Log (one line; narrative for `.context/history/archives/claudemd-changelog.md`, keep under 40k chars), `README.md` + `README.en.md` (24h auto-cleanup sentence now covers `.db` import leftovers; keep both semantically identical), `.claude/index.json` (new test files + new service modules).

**Spec:** proposed `.trellis/spec/guides/cross-stack-contracts.md` §4 items (`.db`-temp + single-source-dir + ownership sentinel) go into a **standalone `docs(spec): …` commit**, never mixed with code commits; further `.trellis/spec/backend/` convention notes per Trellis step 3.3 follow the same rule.

## S10 — Review gates (RB §6)

- `git -C "$WT" diff --check main...HEAD` and working tree clean; reconcile `git status` against the S2–S6 file inventory before every commit (shared-worktree injection guard — memory note).
- Formatting/lint gates (S7's ruff commands) — `ruff format --check` must pass on every changed file; `ruff check` per the S7 condition.
- **Hermeticity grep gate**: `grep -rn DOCX_TEMP_DIR backend/src` must show exactly three sites — the `temp_paths.py` definition and the two class-attr assignments. Anything else reading the constant bypasses the conftest redirect (design.md D2).
- **Dead-patch gate**: `grep -rn save_temp_file backend/src backend/tests` must return nothing (production + tests clean after S5's conversions).
- `trellis-check` sub-agent (sonnet) on the full branch diff; fix findings.
- `code-review` skill on the branch diff.
- **security-review** on the diff (upload/ownership boundary is security-sensitive): magic-first order intact, exclusive 0600 create (no overwrite, no symlink follow, no pre-existing-file unlink), no new path traversal via the shared naming helpers, sweep cannot delete outside the temp dir, foreign/legacy file handling unchanged. No Critical/High may remain.
- No frontend diff → no Haiku review. Read every delegated change yourself before accepting.

## S11 — Report and stop (RB §8, in Chinese)

Report: one-sentence result; files changed with RED→GREEN evidence per new test; full-suite counts vs S0 baseline; changed-file coverage; ruff gates; review findings and resolutions; docs touched (executor-edited) + **proposed exact texts for the coordinator-owned docs**; not-run items with reasons (incl. D7 desktop delta: no frozen build); then wait for separate user authorization for commit → merge → push (RB §2 finish; before merging, merge `main` into the branch if ELC/BD landed in the meantime and re-run all gates; archive + journal in a standalone `.trellis/` commit afterwards).

Suggested commits (each staged by explicit path, never `git add .`):
1. `refactor(import): 临时目录统一为绝对路径单一来源并抽取归属命名助手` (S2+S3)
2. `feat(import): .db 与 docx 上传改为流式限长直写临时文件` (S4+S5, includes `save_temp_file` deletion)
3. `perf(import): 异步接口同步重活移入线程池` (S6)
4. `docs(import): 同步临时资源生命周期文档` (S9 executor-edited files) — or fold into 1–3 per file relevance
5. `docs(spec): 补充临时上传契约的 .db 覆盖与单一目录条款` (S9 spec files, standalone)
