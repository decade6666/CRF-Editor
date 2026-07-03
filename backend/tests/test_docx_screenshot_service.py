from __future__ import annotations

import logging
import subprocess
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse

import pytest
from docx import Document

from src.config import DocxScreenshotBackend, load_config
from src.services import docx_screenshot_service as screenshot_module
from src.services.docx_screenshot_service import DocxScreenshotService


class _ImmediateThread:
    def __init__(self, *, target, args, daemon):
        self._target = target
        self._args = args
        self.daemon = daemon

    def start(self) -> None:
        self._target(*self._args)


@pytest.fixture(autouse=True)
def _clear_screenshot_tasks():
    with screenshot_module._tasks_lock:
        screenshot_module._tasks.clear()
    yield
    with screenshot_module._tasks_lock:
        screenshot_module._tasks.clear()


def _config_for_backend(backend: str | DocxScreenshotBackend) -> SimpleNamespace:
    return SimpleNamespace(docx_screenshot=SimpleNamespace(backend=backend))


def _patch_backend_config(monkeypatch: pytest.MonkeyPatch, backend: str | DocxScreenshotBackend) -> None:
    monkeypatch.setattr(
        "src.services.docx_screenshot_service.get_config",
        lambda: _config_for_backend(backend),
    )


def test_config_accepts_docx_screenshot_backend_yaml_and_env(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config_file = tmp_path / "config.yaml"
    config_file.write_text(
        "docx_screenshot:\n"
        "  backend: word\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("CRF_DOCX_SCREENSHOT_BACKEND", "libreoffice")

    config = load_config(config_file)

    assert config.docx_screenshot.backend == "libreoffice"


def test_start_marks_task_failed_when_no_render_backend_available(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_backend_config(monkeypatch, "auto")
    monkeypatch.setattr(DocxScreenshotService, "BASE_DIR", str(tmp_path / "screenshots"))
    monkeypatch.setattr("src.services.docx_screenshot_service.threading.Thread", _ImmediateThread)
    monkeypatch.setattr(DocxScreenshotService, "_is_word_backend_available", staticmethod(lambda: False))
    monkeypatch.setattr("src.services.docx_screenshot_service.find_libreoffice", lambda: None)

    task = DocxScreenshotService.start("test-no-backend", "/tmp/fake.docx", [])

    assert task.status == "failed"
    assert "无可用的文档渲染后端" in (task.error or "")
    assert "MS Word" not in (task.error or "")


@pytest.mark.parametrize(
    ("backend", "expected"),
    [
        ("word", "指定的 Word 文档渲染后端不可用"),
        ("libreoffice", "指定的 LibreOffice 文档渲染后端不可用"),
    ],
)
def test_start_marks_task_failed_when_explicit_backend_is_unavailable(
    backend: str,
    expected: str,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_backend_config(monkeypatch, backend)
    monkeypatch.setattr(DocxScreenshotService, "BASE_DIR", str(tmp_path / "screenshots"))
    monkeypatch.setattr("src.services.docx_screenshot_service.threading.Thread", _ImmediateThread)
    monkeypatch.setattr(DocxScreenshotService, "_is_word_backend_available", staticmethod(lambda: False))
    monkeypatch.setattr("src.services.docx_screenshot_service.find_libreoffice", lambda: None)

    task = DocxScreenshotService.start(f"test-{backend}-unavailable", "/tmp/fake.docx", [])

    assert task.status == "failed"
    assert task.error == expected


def test_auto_backend_prefers_word_when_available(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_backend_config(monkeypatch, "auto")
    monkeypatch.setattr(DocxScreenshotService, "_is_word_backend_available", staticmethod(lambda: True))
    monkeypatch.setattr("src.services.docx_screenshot_service.find_libreoffice", lambda: "/usr/bin/soffice")

    selection = DocxScreenshotService._select_pdf_backend()

    assert selection.backend == DocxScreenshotBackend.WORD
    assert selection.soffice_path is None


def test_auto_backend_falls_back_to_libreoffice(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_backend_config(monkeypatch, "auto")
    monkeypatch.setattr(DocxScreenshotService, "_is_word_backend_available", staticmethod(lambda: False))
    monkeypatch.setattr("src.services.docx_screenshot_service.find_libreoffice", lambda: "/usr/bin/soffice")

    selection = DocxScreenshotService._select_pdf_backend()

    assert selection.backend == DocxScreenshotBackend.LIBREOFFICE
    assert selection.soffice_path == "/usr/bin/soffice"


def test_libreoffice_start_path_does_not_load_pythoncom(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_backend_config(monkeypatch, "auto")
    monkeypatch.setattr(DocxScreenshotService, "BASE_DIR", str(tmp_path / "screenshots"))
    monkeypatch.setattr("src.services.docx_screenshot_service.threading.Thread", _ImmediateThread)
    monkeypatch.setattr(DocxScreenshotService, "_is_word_backend_available", staticmethod(lambda: False))
    monkeypatch.setattr("src.services.docx_screenshot_service.find_libreoffice", lambda: "/usr/bin/soffice")

    def _raise_if_called():
        raise AssertionError("LibreOffice 后端不应加载 pythoncom")

    def _fake_libreoffice(cls, docx_path: str, output_dir: Path, soffice: str) -> str:
        pdf_path = output_dir / "fake.pdf"
        pdf_path.write_bytes(b"%PDF-1.4\n")
        return str(pdf_path)

    monkeypatch.setattr(DocxScreenshotService, "_load_pythoncom", staticmethod(_raise_if_called))
    monkeypatch.setattr(DocxScreenshotService, "_convert_to_pdf_libreoffice", classmethod(_fake_libreoffice))
    monkeypatch.setattr(DocxScreenshotService, "_convert_to_images", staticmethod(lambda _pdf, _out: ["page-001.png"]))

    task = DocxScreenshotService.start("test-libreoffice-no-pythoncom", "/tmp/fake.docx", [])

    assert task.status == "done"
    assert task.pages == ["page-001.png"]


def test_libreoffice_conversion_uses_isolated_profile_and_validates_pdf(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    docx_path = tmp_path / "input.docx"
    docx_path.write_bytes(b"docx")
    captured: dict[str, object] = {}

    def _fake_run(cmd, *, capture_output, timeout):
        captured["cmd"] = cmd
        captured["capture_output"] = capture_output
        captured["timeout"] = timeout
        (tmp_path / "input.pdf").write_bytes(b"%PDF-1.4\n")
        return subprocess.CompletedProcess(cmd, 0, stdout=b"ok", stderr=b"")

    monkeypatch.setattr("src.services.docx_screenshot_service.subprocess.run", _fake_run)

    pdf_path = DocxScreenshotService._convert_to_pdf_libreoffice(
        str(docx_path),
        tmp_path,
        "/usr/bin/soffice",
    )

    cmd = captured["cmd"]
    assert pdf_path == str(tmp_path / "input.pdf")
    assert captured["capture_output"] is True
    assert 90 <= captured["timeout"] <= 120
    assert cmd[0] == "/usr/bin/soffice"
    assert "--headless" in cmd
    assert "--norestore" in cmd
    assert "--convert-to" in cmd
    assert "pdf:writer_pdf_Export" in cmd
    assert "--outdir" in cmd
    profile_arg = next(part for part in cmd if part.startswith("-env:UserInstallation=file://"))
    profile_path = Path(urlparse(profile_arg.split("=", 1)[1]).path)
    assert not profile_path.exists()


def test_libreoffice_conversion_timeout_fails_with_neutral_error(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    docx_path = tmp_path / "input.docx"
    docx_path.write_bytes(b"docx")

    def _fake_run(cmd, *, capture_output, timeout):
        raise subprocess.TimeoutExpired(cmd, timeout, output=b"partial", stderr=b"too slow")

    monkeypatch.setattr("src.services.docx_screenshot_service.subprocess.run", _fake_run)

    with caplog.at_level(logging.ERROR, logger="src.services.docx_screenshot_service"):
        with pytest.raises(RuntimeError, match="文档渲染失败：渲染超时"):
            DocxScreenshotService._convert_to_pdf_libreoffice(
                str(docx_path),
                tmp_path,
                "/usr/bin/soffice",
            )

    assert "LibreOffice 文档渲染超时" in caplog.text
    assert "too slow" in caplog.text


def test_libreoffice_conversion_without_output_pdf_fails(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    docx_path = tmp_path / "input.docx"
    docx_path.write_bytes(b"docx")

    def _fake_run(cmd, *, capture_output, timeout):
        return subprocess.CompletedProcess(cmd, 0, stdout=b"no output", stderr=b"")

    monkeypatch.setattr("src.services.docx_screenshot_service.subprocess.run", _fake_run)

    with caplog.at_level(logging.ERROR, logger="src.services.docx_screenshot_service"):
        with pytest.raises(RuntimeError, match="文档渲染失败：未生成输出 PDF"):
            DocxScreenshotService._convert_to_pdf_libreoffice(
                str(docx_path),
                tmp_path,
                "/usr/bin/soffice",
            )

    assert "未生成非空 PDF" in caplog.text


@pytest.mark.skipif(
    screenshot_module.find_libreoffice() is None,
    reason="需要 LibreOffice 渲染文档",
)
def test_libreoffice_converts_real_docx_to_nonempty_pdf(tmp_path: Path) -> None:
    docx_path = tmp_path / "real.docx"
    doc = Document()
    doc.add_paragraph("中文渲染测试")
    doc.save(docx_path)

    soffice = screenshot_module.find_libreoffice()
    assert soffice is not None

    try:
        pdf_path = DocxScreenshotService._convert_to_pdf_libreoffice(
            str(docx_path),
            tmp_path,
            soffice,
        )
    except RuntimeError as exc:
        pytest.skip(f"LibreOffice 当前环境无法完成渲染: {exc}")

    assert Path(pdf_path).is_file()
    assert Path(pdf_path).stat().st_size > 0
