from __future__ import annotations

import logging
import subprocess
import threading
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse

import pytest
from docx import Document

from src.config import DocxScreenshotBackend, load_config
from src.services import docx_screenshot_service as screenshot_module
from src.services.docx_screenshot_service import DocxScreenshotService, ScreenshotTask


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


def test_is_toc_page_flags_compact_index() -> None:
    form_names = [
        "知情同意",
        "访视日期",
        "人口学资料",
        "受试者特征",
        "既往史",
        "合并用药",
        "生命体征",
        "体格检查",
        "实验室检查",
        "心电图",
        "不良事件",
        "合并疾病",
    ]
    text = (
        "表单访视分布图。"
        + "；".join(form_names)
        + "。本页仅供快速导航，请按目录跳转填写。"
        + "说明" * 85
    )

    assert 200 <= len(text) <= 400
    assert DocxScreenshotService.is_toc_page(text, form_names) is True


def test_is_toc_page_ignores_content_cross_reference() -> None:
    form_names = [
        "知情同意",
        "访视日期",
        "人口学资料",
        "受试者特征",
        "既往史",
        "合并用药",
        "生命体征",
        "体格检查",
    ]
    text = (
        "本页记录受试者筛选过程和研究现场说明。"
        "研究者需要结合知情同意与访视日期两张表核对来源文件，但本页主要承载筛选描述。"
        + "受试者描述和现场记录。" * 120
    )

    assert len(text) > 1200
    assert DocxScreenshotService.is_toc_page(text, form_names) is False


def test_is_toc_page_deduplicates_substring_matches() -> None:
    form_names = ["体重", "身高体重", "血压", "脉搏"]
    text = "本页目录提示：身高体重。请见对应章节。"

    assert len(text) < 500
    assert DocxScreenshotService.is_toc_page(text, form_names) is False


def test_map_forms_via_text_requires_independent_short_form_match() -> None:
    form_names = ["体重", "身高体重"]
    page_texts = [
        "第1页：体重。研究护士在本页单独记录受试者体重变化。",
        "第2页：身高体重。此页只出现联合表单名称。",
    ]

    ranges = DocxScreenshotService._map_forms_via_text(
        form_names,
        page_texts,
        total_pages=2,
        all_form_names=form_names,
    )

    assert ranges["体重"] == [1, 1]
    assert ranges["身高体重"] == [2, 2]

    long_name_only = DocxScreenshotService._map_forms_via_text(
        ["体重"],
        ["封面页。", page_texts[1]],
        total_pages=2,
        all_form_names=form_names,
    )

    assert "体重" not in long_name_only


def test_map_forms_via_outline_uses_true_pages() -> None:
    form_names = ["知情同意", "访视日期", "受试者特征", "病史", "吸烟饮酒史", "用药史"]
    outline = [
        ("目录", 2),
        ("表单访视分布图", 4),
        ("1. 知情同意", 7),
        ("2. 访视日期", 8),
        ("4. 受试者特征", 10),
        ("7. 病史", 12),
        ("7.1. 吸烟饮酒史", 14),
        ("8. 用药史", 16),
    ]

    ranges = DocxScreenshotService._map_forms_via_outline(form_names, outline, total_pages=20)

    assert ranges["知情同意"] == [7, 7]
    assert ranges["访视日期"] == [8, 9]
    assert ranges["受试者特征"] == [10, 11]
    assert ranges["病史"] == [12, 13]
    assert ranges["吸烟饮酒史"] == [14, 15]
    assert ranges["用药史"] == [16, 20]
    assert all(start >= 7 for start, _end in ranges.values())


def test_map_forms_via_outline_ignores_non_form_subheadings_as_boundaries() -> None:
    form_names = ["病史", "用药史"]
    outline = [
        ("7. 病史", 12),
        ("7.1. 病史填写说明", 13),
        ("8. 用药史", 16),
    ]

    ranges = DocxScreenshotService._map_forms_via_outline(form_names, outline, total_pages=20)

    assert ranges["病史"] == [12, 15]
    assert ranges["用药史"] == [16, 20]


def test_forms_signature_changes_when_field_labels_or_order_change() -> None:
    base_forms = [{"name": "生命体征", "fields": [{"label": "体重"}, {"label": "脉搏"}]}]
    changed_label = [{"name": "生命体征", "fields": [{"label": "身高"}, {"label": "脉搏"}]}]
    changed_order = [{"name": "生命体征", "fields": [{"label": "脉搏"}, {"label": "体重"}]}]

    base_signature = DocxScreenshotService._forms_signature(base_forms)

    assert base_signature != DocxScreenshotService._forms_signature(changed_label)
    assert base_signature != DocxScreenshotService._forms_signature(changed_order)


def test_start_skips_redetect_when_signature_unchanged(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    temp_id = "done-cache"
    pages_dir = tmp_path / temp_id / "pages"
    pages_dir.mkdir(parents=True)
    (pages_dir / "rendered.pdf").write_bytes(b"%PDF-1.4\n")
    monkeypatch.setattr(DocxScreenshotService, "BASE_DIR", str(tmp_path))

    calls = {"detect_form_pages": 0}

    def _fake_detect_form_pages(_pdf_path: str, form_names: list[str], _total_pages: int) -> dict[str, list[int]]:
        calls["detect_form_pages"] += 1
        return {name: [1, 1] for name in form_names}

    monkeypatch.setattr(DocxScreenshotService, "_detect_form_pages", staticmethod(_fake_detect_form_pages))
    monkeypatch.setattr(DocxScreenshotService, "_detect_field_pages", staticmethod(lambda *_args, **_kwargs: {}))

    forms_data = [
        {"name": "知情同意", "fields": []},
        {"name": "访视日期", "fields": []},
    ]
    task = ScreenshotTask(
        status="done",
        pages=["page-001.png"],
        page_count=1,
        detect_signature=DocxScreenshotService._forms_signature(forms_data),
    )
    screenshot_module._tasks[temp_id] = task

    reused = DocxScreenshotService.start(temp_id, "/tmp/unused.docx", forms_data)

    assert reused is task
    assert calls["detect_form_pages"] == 0

    updated_forms = forms_data + [{"name": "受试者特征", "fields": []}]

    refreshed = DocxScreenshotService.start(temp_id, "/tmp/unused.docx", updated_forms)

    assert refreshed is task
    assert calls["detect_form_pages"] == 1
    assert task.detect_signature == DocxScreenshotService._forms_signature(updated_forms)
    assert task.page_ranges["受试者特征"] == [1, 1]


def test_start_refreshes_done_task_when_field_labels_change(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    temp_id = "done-cache-fields"
    pages_dir = tmp_path / temp_id / "pages"
    pages_dir.mkdir(parents=True)
    (pages_dir / "rendered.pdf").write_bytes(b"%PDF-1.4\n")
    monkeypatch.setattr(DocxScreenshotService, "BASE_DIR", str(tmp_path))

    calls = {"detect_form_pages": 0}

    def _fake_detect_form_pages(_pdf_path: str, form_names: list[str], _total_pages: int) -> dict[str, list[int]]:
        calls["detect_form_pages"] += 1
        return {name: [1, 1] for name in form_names}

    monkeypatch.setattr(DocxScreenshotService, "_detect_form_pages", staticmethod(_fake_detect_form_pages))
    monkeypatch.setattr(DocxScreenshotService, "_detect_field_pages", staticmethod(lambda *_args, **_kwargs: {}))

    original_forms = [{"name": "生命体征", "fields": [{"label": "体重"}]}]
    updated_forms = [{"name": "生命体征", "fields": [{"label": "身高"}]}]
    task = ScreenshotTask(
        status="done",
        pages=["page-001.png"],
        page_count=1,
        detect_signature=DocxScreenshotService._forms_signature(original_forms),
    )
    screenshot_module._tasks[temp_id] = task

    reused = DocxScreenshotService.start(temp_id, "/tmp/unused.docx", updated_forms)

    assert reused is task
    assert calls["detect_form_pages"] == 1
    assert task.detect_signature == DocxScreenshotService._forms_signature(updated_forms)
    assert task.page_ranges["生命体征"] == [1, 1]


def test_start_refresh_does_not_hold_global_tasks_lock(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    temp_id = "done-cache-lock"
    pages_dir = tmp_path / temp_id / "pages"
    pages_dir.mkdir(parents=True)
    (pages_dir / "rendered.pdf").write_bytes(b"%PDF-1.4\n")
    monkeypatch.setattr(DocxScreenshotService, "BASE_DIR", str(tmp_path))
    monkeypatch.setattr(DocxScreenshotService, "_detect_field_pages", staticmethod(lambda *_args, **_kwargs: {}))

    calls = {"detect_form_pages": 0}
    original_forms = [{"name": "生命体征", "fields": [{"label": "体重"}]}]
    updated_forms = [{"name": "生命体征", "fields": [{"label": "身高"}]}]
    task = ScreenshotTask(
        status="done",
        pages=["page-001.png"],
        page_count=1,
        detect_signature=DocxScreenshotService._forms_signature(original_forms),
    )
    screenshot_module._tasks[temp_id] = task

    def _fake_detect_form_pages(_pdf_path: str, form_names: list[str], _total_pages: int) -> dict[str, list[int]]:
        calls["detect_form_pages"] += 1
        assert DocxScreenshotService.get_task(temp_id) is task
        return {name: [1, 1] for name in form_names}

    monkeypatch.setattr(DocxScreenshotService, "_detect_form_pages", staticmethod(_fake_detect_form_pages))

    result: dict[str, ScreenshotTask] = {}
    errors: list[Exception] = []

    def _run_refresh() -> None:
        try:
            result["task"] = DocxScreenshotService.start(temp_id, "/tmp/unused.docx", updated_forms)
        except Exception as exc:  # pragma: no cover - failure path assertion
            errors.append(exc)

    worker = threading.Thread(target=_run_refresh, daemon=True)
    worker.start()
    worker.join(timeout=1)

    assert not worker.is_alive()
    assert not errors
    assert result["task"] is task
    assert calls["detect_form_pages"] == 1


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
