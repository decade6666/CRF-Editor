# Design: hermetic backend test session

## Boundaries

- Touch:
  - `backend/tests/conftest.py`
  - `backend/tests/test_permission_guards.py` (the export test only)
  - `backend/tests/test_export_validation.py` (delete the unused fixtures)
  - a new guard test `backend/tests/test_test_environment_isolation.py`
  - `backend/requirements-dev.txt`
  - `.gitignore`
  - docs
- **No production code changes.** `backend/src/**` and `backend/main.py` stay untouched.
  - The investigation sub-agent suggested gating the shutdown cache cleanup in `main.py` lifespan; that alternative is rejected.
  - So is making `BASE_DIR` configurable.
  - The session-level overrides in T2 cover both the shutdown wipe and the import writes without touching production behavior.

## T1 — Bootstrap at the top of `conftest.py`, before `from main import app`

Replace the current single `os.environ.setdefault("CRF_DISABLE_BACKGROUND_JOBS", "1")` block (conftest.py:7-9) with:

```python
import secrets
import shutil
import tempfile

# 测试会话专用根目录：数据库、上传、截图、导入临时文件全部落在这里，绝不触碰仓库内真实资源。
TEST_ROOT = Path(tempfile.mkdtemp(prefix="crf-editor-tests-"))
os.environ["CRF_DATABASE_PATH"] = str(TEST_ROOT / "crf_editor.db")      # 强制覆盖，不受开发者 shell 影响
os.environ["CRF_STORAGE_UPLOAD_PATH"] = str(TEST_ROOT / "uploads")
os.environ.setdefault("CRF_AUTH_SECRET_KEY", secrets.token_hex(32))     # 全新 worktree 无 config.yaml 时 main 导入需要
os.environ.pop("CRF_ENV", None)                                         # 生产模式只由个别测试显式 monkeypatch 开启
os.environ.setdefault("CRF_DISABLE_BACKGROUND_JOBS", "1")               # 保留原有语义与注释
```

- `get_config()` is `lru_cache`d (`src/config.py:334`) and is first evaluated when `main` is imported (`_validate_app_config()`), so this ordering is sufficient.
- Before relying on the `CRF_ENV` pop, grep `tests/` for `CRF_ENV`. Tests that need production mode must set it with `monkeypatch.setenv`. If any test relies on an inherited value, set it explicitly in that test instead.
- `_TEST_CONFIG` (conftest.py:35-38): add `storage=StorageConfig(upload_path=str(TEST_ROOT / "uploads"))`, importing `StorageConfig` from `src.config` (class at `config.py:101`).
  - Then the lifespan `mkdir` of `config.upload_path` (main.py) lands in the temp root, not in repo-root `uploads/`.
  - Keep the existing literal test secret and password unchanged; they are test fixtures, not credentials.
- Add a session fixture that yields `TEST_ROOT` and removes it at session end with `shutil.rmtree(TEST_ROOT, ignore_errors=True)`. Name it `test_root`; the guard test uses it.

## T2 — Session-level directory overrides

```python
@pytest.fixture(scope="session", autouse=True)
def _isolate_docx_dirs():
    """截图缓存与 Word 导入临时目录指向测试根目录：退出清理（cleanup_old_caches(days=0)）与导入写文件都不再触碰 backend/uploads/docx_temp。"""
    docx_temp = TEST_ROOT / "docx_temp"
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(DocxScreenshotService, "BASE_DIR", str(docx_temp))
        mp.setattr(DocxImportService, "TEMP_DIR", str(docx_temp))
        yield
```

- Both attributes are class attributes (`docx_screenshot_service.py:75`, `docx_import_service.py:1272`). The same directory mirrors the production layout.
- Per-test `monkeypatch.setattr(DocxScreenshotService, "BASE_DIR", tmp_path)` keeps working, because function-scoped monkeypatch restores the session value.
- Before finishing, grep the tests for assertions on the default `BASE_DIR` / `TEMP_DIR` values.
- With T1 + T2 in place, `test_lifespan_runs_render_backend_self_check_once` is isolated automatically: its real `init_db()` hits the temp DB and its shutdown wipe hits the temp `docx_temp`. Do not edit that test.

## T3 — `test_permission_guards.py::test_authenticated_user_can_export_owned_projects_database` (~:302)

- The route reads only `get_config().db_path` (`routers/export.py:118-120`) and bypasses the session dependencies. A per-test file database is therefore the right seam.
- Implementation:
  1. Create `tmp_path / "export_source.db"` with `create_engine(f"sqlite:///{path}")` and `Base.metadata.create_all(engine)`.
  2. Seed the logged-in test user's id with at least 2 projects. Mirror the semantics of the deleted CI seed: an owner row plus projects owned by it.
  3. `monkeypatch.setattr("src.routers.export.get_config", lambda: SimpleNamespace(db_path=str(path)))`.
  4. Keep the existing assertions.
- If `export_user_projects_database` needs schema details beyond `create_all` (e.g. `_validate_form_field_schema`), check what it validates. Prefer seeding through `src.database.init_db` pointed at the temp file, via a scoped `monkeypatch` of `src.database.get_config` plus resetting the cached `_engine`. Pick the simpler option that passes, and record why.

## T4 — `test_export_validation.py`

- Delete the unused `engine` / `client` fixtures (~:47-78). Re-grep first to confirm no test requests them.
- Keep the self-contained `session` fixture.

## T5 — Guard test `tests/test_test_environment_isolation.py`

```python
def test_should_resolve_runtime_paths_under_test_root(test_root): ...
```

- Assert that each of these resolves under `test_root`:
  - `Path(load_config().db_path)`;
  - `Path(load_config().upload_path)`;
  - `Path(DocxScreenshotService.BASE_DIR)`;
  - `Path(DocxImportService.TEMP_DIR)`.
- Optionally, a second test asserting `os.environ.get("CRF_ENV")` is unset at session start.
- Do **not** guard by stat-ing the real repo files' mtimes: a dev server running from the main checkout touches the real DB and would cause false failures.

## T6 — Coverage

- `backend/requirements-dev.txt`: add `pytest-cov~=<x.y>` compatible with `pytest~=7.4.0`. Verify with `$PY -m pip install --dry-run "pytest-cov~=<x.y>"` before pinning, then install it into `~/.venvs/crf-editor`. The user approved this dependency on 2026-10-08.
- Documented command, not added to `pytest.ini` addopts (that would make a missing plugin break the suite):

  ```bash
  $PY -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered -q
  ```

- `.gitignore`: add `.coverage`, `.coverage.*`, `htmlcov/`, `coverage.xml`.

## Interaction with sibling tasks

- `docx-temp-ownership` tests monkeypatch `TEMP_DIR` / `BASE_DIR` to `tmp_path` themselves, so they are compatible in either merge order. Its sweep loop is off in tests (`CRF_DISABLE_BACKGROUND_JOBS`).
- After this merges:
  - children no longer need the throwaway config (parent runbook §3);
  - running backend tests in the main checkout becomes safe again;
  - the parent runbook §1 rule can be relaxed in the Trellis 3.3 spec update.

## Rollback

Pure test-infrastructure change. Revert the commit.
