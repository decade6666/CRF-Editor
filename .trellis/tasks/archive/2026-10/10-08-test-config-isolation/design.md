# Design: test session config isolation

## Boundaries

- Touch:
  - `backend/tests/conftest.py` (bootstrap block only)
  - `backend/tests/test_test_environment_isolation.py` (two new guards)
  - `backend/tests/test_recycle_bin_policy_api.py` (delete one unused import line)
  - docs
- **No production code changes.** `backend/src/**`, `backend/main.py`, and `backend/app_launcher.py` stay untouched.
- Rejected alternatives:
  - A production `CRF_CONFIG_FILE` env var. It would widen the production config surface to serve a test-only need.
  - Redirecting `_CONFIG_DIR` as well. It is a path-resolution base, not a data source (`config.py:35`; used at `:241`, `:246`, and `import_service.py:71-72`). In the test session the DB and upload paths are already absolute, and the template allowlist (`import_service.py:60-64`) only admits the temp root. Moving it would change how every relative path resolves, for no isolation gain.
  - Scrubbing every `CRF_*` name by prefix. That would also drop runtime switches such as `CRF_DISABLE_BACKGROUND_JOBS`. The scrub set is exactly `_ENV_OVERRIDE_MAP` minus the forced keys, so config keys added later are covered automatically.
  - A function-scoped autouse fixture that deletes `TEST_ROOT/config.yaml` after every test. No test writes the default config path unpatched today; the convention goes into the spec instead (T4).

## T1 — Conftest bootstrap (`conftest.py`, before `from main import app`)

1. Secret key: replace the conditional block (`conftest.py:30-32` at `6580fc9`) with an unconditional assignment. Once the config file is redirected, the env var is the only source of `auth.secret_key`, and a shell value must not leak in:

   ```python
   # 配置文件已重定向（见下方），secret_key 只能来自环境变量；每次会话随机生成，不沿用开发者 shell 的值。
   os.environ["CRF_AUTH_SECRET_KEY"] = secrets.token_hex(32)
   ```

2. After the `sys.path` insert (`:42-44`) and before `from main import app` (`:52`):

   ```python
   import src.config as _config_module

   # 切断真实配置的另外两条入口，必须早于 import main（get_config 在那里首次求值并缓存）：
   # 1) 开发者 shell 中其余 CRF_* 配置覆盖项一律清除，只保留上方强制设置的三项；
   # 2) CONFIG_FILE 指向会话临时根下不存在的文件：读取只得到默认值，未打补丁的写入也只落在临时根。
   _FORCED_CONFIG_ENV = frozenset(
       {"CRF_DATABASE_PATH", "CRF_STORAGE_UPLOAD_PATH", "CRF_AUTH_SECRET_KEY"}
   )
   for _name in _config_module._ENV_OVERRIDE_MAP.keys() - _FORCED_CONFIG_ENV:
       os.environ.pop(_name, None)
   _config_module.CONFIG_FILE = TEST_ROOT / "config.yaml"
   ```

- Why this works:
  - `load_config` / `save_config` / `update_config` read the module global `CONFIG_FILE` at call time (`path or CONFIG_FILE`), and so does the `get_config` log line;
  - `_build_env_overrides` reads `os.environ` at call time;
  - `get_config` is `lru_cache`d and first evaluated during `import main`, so both changes must land before that import;
  - no production module imports `CONFIG_FILE` by name. Grepping `CONFIG_FILE` in `backend/src`, `backend/main.py`, and `backend/app_launcher.py` finds only `config.py`.
- `update_config` writes through `tempfile.mkstemp(dir=config_file.parent)`. The parent is `TEST_ROOT`, which exists for the whole session.
- Function-scoped patches keep working:
  - `patch("src.config.CONFIG_FILE", tmp_path / ...)` (`test_recycle_bin_policy_api.py:63`) restores the redirected value on exit;
  - `monkeypatch.setenv` / `delenv` in `test_config.py` run after the session bootstrap.
- Re-grep at start (RB §5.2):
  - every `CONFIG_FILE` / `_ENV_OVERRIDE_MAP` reference in `backend/src` and `backend/tests`;
  - every `CRF_` env access in `backend/tests`.

## T2 — `test_recycle_bin_policy_api.py`

Delete line 10, `from src.config import CONFIG_FILE`. Afterwards, `grep -n CONFIG_FILE` on that file shows only the string patch target.

## T3 — Guards in `tests/test_test_environment_isolation.py`

```python
import src.config as config_module

# conftest 主动强制设置的配置覆盖项；其余 _ENV_OVERRIDE_MAP 变量不得从开发者 shell 继承。
_FORCED_CONFIG_ENV = {"CRF_DATABASE_PATH", "CRF_STORAGE_UPLOAD_PATH", "CRF_AUTH_SECRET_KEY"}


def test_should_redirect_config_file_under_test_root(test_root: Path) -> None:
    """配置文件必须指向测试根目录：仓库根的真实 config.yaml 不得被读取或写入。"""
    config_file = Path(config_module.CONFIG_FILE).resolve()
    assert config_file.is_relative_to(test_root.resolve()), (
        f"CONFIG_FILE 未隔离到测试根目录: {config_file} 不在 {test_root} 之下"
    )


def test_should_not_inherit_config_override_env() -> None:
    """除 conftest 强制设置的三项外，开发者 shell 的 CRF_* 配置变量不得进入测试会话。"""
    inherited = sorted(
        name
        for name in config_module._ENV_OVERRIDE_MAP
        if name not in _FORCED_CONFIG_ENV and name in os.environ
    )
    assert inherited == [], f"测试会话继承了外部配置变量: {inherited}"
```

- Read `config_module.CONFIG_FILE` at test time. Never write `from src.config import CONFIG_FILE`, which would freeze the value at import.
- The failure message lists variable names only. Never print values; they may be secrets.
- The guard keeps its own copy of the forced set on purpose. If conftest starts forcing another key, the guard fails until someone updates it deliberately.
- Do not add a behavioral assertion on `load_config().ai` / `template_path`. A test that patches `CONFIG_FILE` mid-session could make it flaky, and the path guard plus AC2 already prove the behavior.

## T4 — Spec contract

Edit `.trellis/spec/backend/quality-guidelines.md`, section "Test Session Isolation (hermetic)". Extend its seven existing subsections; do not add a new section.

- Scope: the config file and the config env vars join the isolated set.
- Contracts:
  - `CONFIG_FILE` → `TEST_ROOT/config.yaml`, which does not exist at session start;
  - `_ENV_OVERRIDE_MAP` minus the three forced keys is scrubbed;
  - the secret key is always random.
- Convention: a test that writes config must patch `"src.config.CONFIG_FILE"` (by string) to a `tmp_path` file. Tests never import `CONFIG_FILE` by name.
- Error matrix:
  - an inherited variable → the env guard fails, naming the variables only;
  - the redirect removed → the path guard fails.
- Wrong vs Correct: `from src.config import CONFIG_FILE` vs `patch("src.config.CONFIG_FILE", tmp_path / "config.yaml")`.

## Interaction with sibling tasks

- `small-defects` (in progress at planning time, worktree `/home/decade/CRF-Editor-small-defects`) only relies on the conftest `get_plain_session` override and edits other test files. No overlap.
- `legacy-cleanup` R7 edits `test_export_validation.py`. No overlap.
- `backend-format` is exclusive: its precondition is that no other backend branch is in progress.
- `docs-sync` runs last and lists this task as a prerequisite.

## Rollback

Pure test-infrastructure change. Revert the commit.
