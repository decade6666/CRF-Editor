from __future__ import annotations

from src.services.docx_screenshot_service import DocxScreenshotService


class _ImmediateThread:
    def __init__(self, *, target, args, daemon):
        self._target = target
        self._args = args
        self.daemon = daemon

    def start(self) -> None:
        self._target(*self._args)


def test_start_marks_task_failed_when_runtime_is_unavailable(monkeypatch) -> None:
    temp_id = 'test-runtime-unavailable'

    def _raise_runtime_error():
        raise RuntimeError('当前环境不支持 Word 截图，请在安装了 MS Word 的 Windows 环境中使用该功能')

    monkeypatch.setattr('src.services.docx_screenshot_service.threading.Thread', _ImmediateThread)
    monkeypatch.setattr(DocxScreenshotService, '_load_pythoncom', staticmethod(_raise_runtime_error))

    task = DocxScreenshotService.start(temp_id, '/tmp/fake.docx', [])

    assert task.status == 'failed'
    assert task.error == '当前环境不支持 Word 截图，请在安装了 MS Word 的 Windows 环境中使用该功能'

    DocxScreenshotService.remove_task(temp_id)
