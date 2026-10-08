"""守卫测试：断言测试会话的运行时路径全部隔离到会话临时根目录。

一旦有人移除 conftest 里的环境变量覆盖或目录替换（隔离被破坏），
这里的断言会先于任何真实资源被触碰而失败。
"""

import os
from pathlib import Path

from src.config import load_config
from src.services.docx_import_service import DocxImportService
from src.services.docx_screenshot_service import DocxScreenshotService


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
