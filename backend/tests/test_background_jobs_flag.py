"""后台任务环境变量开关测试，仿 test_main_reload_flag.py。"""

import asyncio

import pytest

import main
from src.background_jobs import should_enable_background_jobs

_FLAG = should_enable_background_jobs


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    monkeypatch.delenv("CRF_DISABLE_BACKGROUND_JOBS", raising=False)
    yield


def test_default_enabled_when_env_unset():
    assert _FLAG() is True


def test_disabled_when_one(monkeypatch):
    monkeypatch.setenv("CRF_DISABLE_BACKGROUND_JOBS", "1")
    assert _FLAG() is False


def test_disabled_when_true(monkeypatch):
    monkeypatch.setenv("CRF_DISABLE_BACKGROUND_JOBS", "true")
    assert _FLAG() is False


def test_disabled_when_yes(monkeypatch):
    monkeypatch.setenv("CRF_DISABLE_BACKGROUND_JOBS", "yes")
    assert _FLAG() is False


def test_disabled_when_on(monkeypatch):
    monkeypatch.setenv("CRF_DISABLE_BACKGROUND_JOBS", "on")
    assert _FLAG() is False


def test_enabled_when_zero(monkeypatch):
    monkeypatch.setenv("CRF_DISABLE_BACKGROUND_JOBS", "0")
    assert _FLAG() is True


def test_enabled_for_unknown_value(monkeypatch):
    monkeypatch.setenv("CRF_DISABLE_BACKGROUND_JOBS", "maybe")
    assert _FLAG() is True


class _FakeApp:
    def __init__(self):
        self.state = type("S", (), {})()


def test_start_background_jobs_noop_when_disabled(monkeypatch):
    from src.background_jobs import start_background_jobs

    monkeypatch.setenv("CRF_DISABLE_BACKGROUND_JOBS", "1")
    app = _FakeApp()
    # 需要事件循环，但 disabled 分支不会 create_task，直接 return
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        pass
    start_background_jobs(app)
    assert getattr(app.state, "recycle_bin_cleanup_task", None) is None


def test_start_background_jobs_creates_task_when_enabled(monkeypatch):
    from src.background_jobs import start_background_jobs

    async def _run():
        app = _FakeApp()
        # patch _run_cleanup_once_sync 立即返回，避免真实 DB 访问
        import src.background_jobs as bj

        monkeypatch.setattr(bj, "_run_cleanup_once_sync", lambda: {"purged_count": 0})
        # 不 patch 的话，启用分支会真实执行 purge_expired_uploads，
        # 删掉 cwd 相对路径 uploads/docx_temp 下的真实上传文件。
        monkeypatch.setattr(bj, "_run_docx_temp_sweep_once_sync", lambda: 0)
        # 缩短 sleep 以便快速取消
        import src.config as cfg

        class _P:
            interval_minutes = 60

            class recycle_bin:
                interval_minutes = 60

        monkeypatch.setattr(bj, "get_config", lambda: _P(), raising=False)
        # 直接 patch 模块内对 get_config 的延迟导入：替换 src.config.get_config
        monkeypatch.setattr(cfg, "get_config", lambda: _P())
        start_background_jobs(app)
        task = getattr(app.state, "recycle_bin_cleanup_task", None)
        assert task is not None
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    asyncio.run(_run())