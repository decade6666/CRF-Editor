"""守卫测试：断言测试会话的运行时路径全部隔离到会话临时根目录。

一旦有人移除 conftest 里的环境变量覆盖或目录替换（隔离被破坏），
这里的断言会先于任何真实资源被触碰而失败。
"""

import os
from pathlib import Path

import src.config as config_module
from src.config import load_config
from src.services.docx_import_service import DocxImportService
from src.services.docx_screenshot_service import DocxScreenshotService

# conftest 主动强制设置的配置覆盖项；其余 _ENV_OVERRIDE_MAP 变量不得从开发者 shell 继承。
# 此副本是故意的绊线（与 conftest 的 _FORCED_CONFIG_ENV 不共享导入）：conftest 新增/移除强制键
# 时本守卫会先失败提醒同步；若失败信息出现，请核对两处清单而不是直接删掉断言——详见
# .trellis/spec/backend/quality-guidelines.md「Test Session Isolation」。
_FORCED_CONFIG_ENV = {"CRF_DATABASE_PATH", "CRF_STORAGE_UPLOAD_PATH", "CRF_AUTH_SECRET_KEY"}


def test_should_resolve_runtime_paths_under_test_root(test_root: Path) -> None:
    """数据库、上传目录、截图缓存、Word 导入临时目录都必须落在测试根目录之下。"""
    runtime_paths = {
        "db_path": Path(load_config().db_path),
        "upload_path": Path(load_config().upload_path),
        "screenshot_base_dir": Path(DocxScreenshotService.BASE_DIR),
        "docx_import_temp_dir": Path(DocxImportService.TEMP_DIR),
    }
    for name, path in runtime_paths.items():
        resolved = path.resolve()
        assert resolved.is_relative_to(test_root.resolve()), (
            f"{name} 未隔离到测试根目录: {resolved} 不在 {test_root} 之下"
        )


def test_should_not_inherit_production_env() -> None:
    """会话启动时不得继承外部 CRF_ENV=production（生产模式只允许个别测试显式开启）。"""
    assert os.environ.get("CRF_ENV") is None


def test_should_redirect_config_file_under_test_root(test_root: Path) -> None:
    """配置文件必须指向测试根目录：仓库根的真实 config.yaml 不得被读取或写入。"""
    config_file = Path(config_module.CONFIG_FILE).resolve()
    assert config_file.is_relative_to(test_root.resolve()), (
        f"CONFIG_FILE 未隔离到测试根目录: {config_file} 不在 {test_root} 之下"
    )


def test_should_not_inherit_config_override_env() -> None:
    """除 conftest 强制设置的三项外，开发者 shell 的 CRF_* 配置变量不得进入测试会话。

    失败信息只列变量名，绝不打印值——它们可能含密钥。
    """
    inherited = sorted(
        name
        for name in config_module._ENV_OVERRIDE_MAP
        if name not in _FORCED_CONFIG_ENV and name in os.environ
    )
    assert inherited == [], f"测试会话继承了外部配置变量: {inherited}"
