"""临时目录单一来源契约（design.md D2 / AC4）。

必须在无 conftest 的子进程、且非 backend/ 的工作目录下读取两个类的默认值：
套件内 conftest 会把两个类属性改指到会话临时目录，进程内断言永远不可能变红。
"""

import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]

_SCRIPT = textwrap.dedent(
    """
    import json, os, sys
    sys.path.insert(0, os.environ["BACKEND_ROOT"])
    from src.services.docx_import_service import DocxImportService
    from src.services.docx_screenshot_service import DocxScreenshotService
    from src.services.temp_paths import DOCX_TEMP_DIR
    print(json.dumps({
        "temp_dir": DocxImportService.TEMP_DIR,
        "base_dir": DocxScreenshotService.BASE_DIR,
        "constant": DOCX_TEMP_DIR,
    }))
    """
)


def test_docx_temp_defaults_share_one_absolute_source(tmp_path):
    proc = subprocess.run(
        [sys.executable, "-I", "-c", _SCRIPT],
        capture_output=True,
        text=True,
        cwd=tmp_path,
        env={**os.environ, "BACKEND_ROOT": str(BACKEND_ROOT)},
        timeout=120,
    )
    assert proc.returncode == 0, f"子进程导入失败（cwd={tmp_path}）：\n{proc.stderr}"
    data = json.loads(proc.stdout.strip().splitlines()[-1])
    assert data["temp_dir"] == data["base_dir"] == data["constant"], data
    assert Path(data["temp_dir"]).is_absolute(), data
    # 按 Path 分段比较，Windows 反斜杠路径同样成立（复审 #9）
    assert Path(data["temp_dir"]).parts[-2:] == ("uploads", "docx_temp"), data
