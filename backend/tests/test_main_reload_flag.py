"""生产模式下应关闭 uvicorn 热重载，守护进程不需要文件监听。"""

import pytest

import main

# should_enable_reload() 在调用时读取 os.environ，无模块级缓存，无需 reload 模块
_RELOAD_FLAG = main.should_enable_reload


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    # 避免本机环境变量影响用例
    monkeypatch.delenv("CRF_ENV", raising=False)
    yield


def test_should_disable_reload_when_production(monkeypatch):
    monkeypatch.setenv("CRF_ENV", "production")
    assert _RELOAD_FLAG() is False


def test_should_enable_reload_when_env_unset():
    assert _RELOAD_FLAG() is True


def test_should_enable_reload_when_development(monkeypatch):
    monkeypatch.setenv("CRF_ENV", "development")
    assert _RELOAD_FLAG() is True


def test_reload_flag_ignores_unknown_env_value(monkeypatch):
    monkeypatch.setenv("CRF_ENV", "staging")
    assert _RELOAD_FLAG() is True
