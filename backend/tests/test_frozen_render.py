"""Formal originals render from one closed frozen input, never live files/config."""

from __future__ import annotations

import hashlib
import json
import struct
import zlib
from pathlib import Path
from typing import Any
from zipfile import ZipFile

import pytest
from sqlalchemy import update
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from src.models.field import Field
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.visit import Visit
from src.models.visit_form import VisitForm
from src.services import frozen_render_service as frozen
from src.services.design_snapshot_service import FrozenProjectDesign, SnapshotError, capture_project_design
from src.services.export_service import ExportService
from src.services.word_table_parity import extract_docx_form_table_fields


def _bitmap() -> bytes:
    def chunk(kind: bytes, content: bytes) -> bytes:
        return struct.pack(">I", len(content)) + kind + content + struct.pack(">I", zlib.crc32(kind + content))

    header = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    pixels = zlib.compress(b"\x00\x00\x00\x80")
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", pixels) + chunk(b"IEND", b"")


@pytest.fixture
def design(engine: Engine) -> FrozenProjectDesign:
    with Session(engine) as session:
        project = Project(name="原始项目", version="1", crf_version="Original", company_logo_path="frozen.png")
        session.add(project)
        session.flush()
        form = Form(
            project_id=project.id,
            name="原始表单",
            code="form.lower",
            domain="Lb Mixed",
            annotation_positions='{"old.CODE":{"y":25},"_form":{"y":-18}}',
        )
        definition = FieldDefinition(
            project_id=project.id, variable_name="old.CODE", label="原始字段", field_type="文本"
        )
        visit = Visit(project_id=project.id, name="基线", sequence=1)
        session.add_all([form, definition, visit])
        session.flush()
        session.add_all(
            [
                FormField(form_id=form.id, field_definition_id=definition.id, order_index=1),
                VisitForm(visit_id=visit.id, form_id=form.id, sequence=1),
            ]
        )
        session.commit()
        return capture_project_design(session, project.id)


@pytest.mark.integration
def test_should_generate_both_real_originals_from_one_frozen_design_and_logo(
    engine: Engine, design: FrozenProjectDesign, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    image = _bitmap()
    inputs = frozen.freeze_render_input(design, logo=image)
    with Session(engine) as session:
        session.execute(
            update(Project)
            .where(Project.id == design.project_id)
            .values(name="后来项目", company_logo_path="changed.png")
        )
        session.execute(
            update(FieldDefinition).where(FieldDefinition.project_id == design.project_id).values(label="后来标签")
        )
        session.commit()
    monkeypatch.setattr("src.config.get_config", lambda: pytest.fail("frozen rendering read live config"))

    artifacts = frozen.render_pair_in_process(inputs, tmp_path, bake_toc=False)

    assert {artifact.kind for artifact in artifacts} == {"ecrf", "acrf"}
    for artifact in artifacts:
        output = tmp_path / f"{artifact.kind}.docx"
        assert artifact.byte_count == output.stat().st_size
        assert artifact.sha256 == hashlib.sha256(output.read_bytes()).hexdigest()
        forms = extract_docx_form_table_fields(output)
        assert forms[0].name == "原始表单"
        assert "原始字段" in str(forms[0].tables)
        assert "后来标签" not in str(forms)
        with ZipFile(output) as archive:
            media = [name for name in archive.namelist() if name.startswith("word/media/")]
            assert any(archive.read(name) == image for name in media)
            xml = archive.read("word/document.xml").decode()
            assert ('a:alpha val="25000"' in xml) == (artifact.kind == "acrf")


@pytest.mark.integration
def test_should_preserve_explicit_widths_in_both_originals(design: FrozenProjectDesign, tmp_path: Path) -> None:
    form_id = str(design.to_dict()["tables"]["form"][0]["id"])
    widths = {form_id: {"normal": [0.2, 0.8]}}
    inputs = frozen.freeze_render_input(design, widths, _bitmap())
    widths[form_id]["normal"][0] = 0.9

    frozen.render_pair_in_process(inputs, tmp_path, bake_toc=False)

    assert json.loads(inputs.layout_json)[form_id]["normal"] == [0.2, 0.8]
    from docx import Document

    for kind in ("ecrf", "acrf"):
        table = Document(tmp_path / f"{kind}.docx").tables[-1]
        assert table.columns[0].width / table.columns[1].width == pytest.approx(0.25, abs=0.01)


@pytest.mark.unit
@pytest.mark.parametrize(
    "widths",
    [
        {"999999": {"normal": [0.2, 0.8]}},
        {"1": {"normal": [0.2, 0.2]}},
        {"1": {"normal": [float("nan"), 0.8]}},
        {"1": {"normal": [True, 0.0]}},
        {"../path": [0.5, 0.5]},
        {"inline:fieldIds=999999": [1.0]},
        {"1": {"surprise": [0.2, 0.8]}},
    ],
)
def test_should_reject_invalid_or_unbound_layout_inputs(design: FrozenProjectDesign, widths: Any) -> None:
    with pytest.raises(SnapshotError):
        frozen.freeze_render_input(design, widths, _bitmap())


@pytest.mark.integration
def test_should_refuse_missing_frozen_logo_instead_of_using_live_path(design: FrozenProjectDesign) -> None:
    with pytest.raises(SnapshotError) as failure:
        frozen.freeze_render_input(design)
    assert failure.value.code == "BASELINE_ASSET_INVALID"


@pytest.mark.unit
@pytest.mark.parametrize("image", [b"invalid-bitmap", b"<svg xmlns='http://www.w3.org/2000/svg'/>"])
def test_should_refuse_invalid_frozen_logo(design: FrozenProjectDesign, image: bytes) -> None:
    with pytest.raises(SnapshotError):
        frozen.freeze_render_input(design, logo=image)


@pytest.mark.integration
def test_should_fail_pair_if_second_real_export_fails(
    design: FrozenProjectDesign, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    original = ExportService.export_project_to_word

    def fail_second(self: Any, *args: Any, **kwargs: Any) -> bool:
        if kwargs.get("annotated"):
            raise RuntimeError("private failure detail")
        return original(self, *args, **kwargs)

    monkeypatch.setattr(ExportService, "export_project_to_word", fail_second)
    with pytest.raises(SnapshotError) as failure:
        frozen.render_pair_in_process(frozen.freeze_render_input(design, logo=_bitmap()), tmp_path, bake_toc=False)
    assert failure.value.code == "BASELINE_RENDER_FAILED"
    assert "private failure detail" not in str(failure.value)
    assert (tmp_path / "ecrf.docx").exists()


@pytest.mark.integration
def test_should_refuse_legacy_fields_before_creating_any_original(
    engine: Engine, design: FrozenProjectDesign, tmp_path: Path
) -> None:
    with Session(engine) as session:
        form_id = design.to_dict()["tables"]["form"][0]["id"]
        session.add(Field(form_id=form_id, variable_name="legacy", label="旧字段", field_type="文本"))
        session.commit()
        legacy = capture_project_design(session, design.project_id)
    with pytest.raises(SnapshotError) as failure:
        frozen.render_pair_in_process(frozen.freeze_render_input(legacy, logo=_bitmap()), tmp_path, bake_toc=False)
    assert failure.value.code == "SNAPSHOT_LEGACY_UNSUPPORTED"
    assert list(tmp_path.iterdir()) == []


@pytest.mark.unit
def test_should_reject_output_above_compressed_budget(
    design: FrozenProjectDesign, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(frozen, "MAX_ORIGINAL_BYTES", 100)
    with pytest.raises(SnapshotError) as failure:
        frozen.render_pair_in_process(frozen.freeze_render_input(design, logo=_bitmap()), tmp_path, bake_toc=False)
    assert failure.value.code == "BASELINE_LIMIT_EXCEEDED"


@pytest.mark.unit
def test_should_reject_expanded_zip_budget_before_docx_parsing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    output = tmp_path / "oversized.docx"
    with ZipFile(output, "w") as archive:
        archive.writestr("word/document.xml", "a" * 1024)
    monkeypatch.setattr(frozen, "MAX_EXPANDED_ORIGINAL_BYTES", 100)

    with pytest.raises(SnapshotError) as failure:
        frozen.inspect_original(output, "ecrf")
    assert failure.value.code == "BASELINE_LIMIT_EXCEEDED"


@pytest.mark.unit
@pytest.mark.parametrize("name", ["../outside.xml", "/absolute.xml", "word\\evil.xml"])
def test_should_reject_unsafe_zip_entry_names(tmp_path: Path, name: str) -> None:
    output = tmp_path / "unsafe.docx"
    with ZipFile(output, "w") as archive:
        archive.writestr(name, "not-valid")
    with pytest.raises(SnapshotError):
        frozen.inspect_original(output, "ecrf")


@pytest.mark.integration
def test_should_render_real_pair_in_separate_internal_process_without_app_boot(
    design: FrozenProjectDesign, tmp_path: Path
) -> None:
    inputs = frozen.freeze_render_input(design, logo=_bitmap())

    artifacts = frozen.render_frozen_pair(inputs, tmp_path, bake_toc=False)

    assert [artifact.kind for artifact in artifacts] == ["ecrf", "acrf"]
    assert {item.name for item in tmp_path.iterdir()} == {"ecrf.docx", "acrf.docx"}
    assert frozen.inspect_original(tmp_path / "ecrf.docx", "ecrf") == artifacts[0]


@pytest.mark.integration
def test_should_enforce_pair_process_deadline_without_publishing_completion(
    design: FrozenProjectDesign, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(frozen, "PAIR_TIMEOUT_SECONDS", 0.001)
    with pytest.raises(SnapshotError) as failure:
        frozen.render_frozen_pair(frozen.freeze_render_input(design, logo=_bitmap()), tmp_path, bake_toc=False)
    assert failure.value.code == "BASELINE_RENDER_TIMEOUT"


@pytest.mark.integration
def test_should_reject_overlapping_render_without_queue(design: FrozenProjectDesign, tmp_path: Path) -> None:
    with frozen.render_slot():
        with pytest.raises(SnapshotError) as failure:
            frozen.render_frozen_pair(frozen.freeze_render_input(design, logo=_bitmap()), tmp_path, bake_toc=False)
    assert failure.value.code == "BASELINE_BUSY"


@pytest.mark.unit
def test_should_route_packaged_internal_worker_without_starting_application(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    import app_launcher

    calls: list[str] = []
    monkeypatch.setattr(app_launcher, "main", lambda: pytest.fail("ordinary app booted"))
    monkeypatch.setattr(frozen, "worker_main", lambda path: calls.append(path) or 0)

    assert app_launcher.dispatch_entrypoint(["--crf-frozen-render-internal", str(tmp_path)]) == 0
    assert calls == [str(tmp_path)]


@pytest.mark.integration
@pytest.mark.parametrize(
    "widths",
    [
        {"1": {"normal": [1.0]}},
        {"1": {"unified": [0.5, 0.5]}},
        {"inline:fieldIds=1": [1.0]},
        {"normal:fieldIds=1": [1.0]},
    ],
)
def test_should_not_record_widths_that_the_frozen_export_would_ignore(design: FrozenProjectDesign, widths: Any) -> None:
    with pytest.raises(SnapshotError) as failure:
        frozen.freeze_render_input(design, widths, _bitmap())
    assert failure.value.code == "BASELINE_LAYOUT_INVALID"


@pytest.mark.integration
def test_should_accept_actual_normal_table_instance_widths(design: FrozenProjectDesign, tmp_path: Path) -> None:
    instance = design.to_dict()["tables"]["form_field"][0]["id"]
    inputs = frozen.freeze_render_input(design, {f"normal:fieldIds={instance}": [0.3, 0.7]}, _bitmap())

    artifacts = frozen.render_pair_in_process(inputs, tmp_path, bake_toc=False)

    assert len(artifacts) == 2


@pytest.mark.unit
def test_should_preserve_normal_application_entrypoint(monkeypatch: pytest.MonkeyPatch) -> None:
    import app_launcher

    called: list[bool] = []
    monkeypatch.setattr(app_launcher, "main", lambda: called.append(True))

    assert app_launcher.dispatch_entrypoint([]) == 0
    assert called == [True]


@pytest.mark.unit
def test_should_reject_internal_worker_with_missing_output_without_app_boot(monkeypatch: pytest.MonkeyPatch) -> None:
    import app_launcher

    monkeypatch.setattr(app_launcher, "main", lambda: pytest.fail("application unexpectedly started"))

    assert app_launcher.dispatch_entrypoint(["--crf-frozen-render-internal"]) == 2


@pytest.mark.integration
def test_should_execute_internal_worker_from_bounded_stdin_without_global_resource_change(
    design: FrozenProjectDesign, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import base64
    import resource
    import sys
    from io import BytesIO, StringIO
    from types import SimpleNamespace

    request = {
        "snapshot": design.payload_json,
        "layout": "{}",
        "logo": base64.b64encode(_bitmap()).decode(),
        "bake_toc": False,
    }
    output = StringIO()
    limits: list[Any] = []
    monkeypatch.setattr(sys, "stdin", SimpleNamespace(buffer=BytesIO(json.dumps(request).encode())))
    monkeypatch.setattr(sys, "stdout", output)
    monkeypatch.setattr(resource, "setrlimit", lambda *values: limits.append(values))

    assert frozen.worker_main(str(tmp_path)) == 0
    assert json.loads(output.getvalue()) == {"complete": True}
    assert limits
    assert frozen.inspect_original(tmp_path / "acrf.docx", "acrf").byte_count > 0


@pytest.mark.unit
@pytest.mark.parametrize(
    "raw_request", [b"not-json", b"{}", b'{"snapshot":null,"layout":"{}","logo":null,"bake_toc":1}']
)
def test_should_report_worker_input_failure_with_closed_safe_diagnostic(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, raw_request: bytes
) -> None:
    import resource
    import sys
    from io import BytesIO, StringIO
    from types import SimpleNamespace

    output = StringIO()
    monkeypatch.setattr(sys, "stdin", SimpleNamespace(buffer=BytesIO(raw_request)))
    monkeypatch.setattr(sys, "stdout", output)
    monkeypatch.setattr(resource, "setrlimit", lambda *values: None)

    assert frozen.worker_main(str(tmp_path)) == 1
    assert json.loads(output.getvalue()) == {"complete": False, "code": "BASELINE_RENDER_FAILED"}
    assert list(tmp_path.iterdir()) == []


@pytest.mark.unit
@pytest.mark.parametrize(
    "code,status", [("BASELINE_LIMIT_EXCEEDED", 413), ("BASELINE_ASSET_INVALID", 422), ("BASELINE_RENDER_FAILED", 500)]
)
def test_should_preserve_safe_child_failure_codes_and_log_context(
    design: FrozenProjectDesign,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    code: str,
    status: int,
) -> None:
    import logging
    from unittest.mock import MagicMock

    process = MagicMock()
    process.__enter__.return_value = process
    process.returncode = 1
    process.communicate.return_value = (json.dumps({"complete": False, "code": code}).encode(), None)
    monkeypatch.setattr("subprocess.Popen", lambda *args, **kwargs: process)

    with caplog.at_level(logging.WARNING), pytest.raises(SnapshotError) as failure:
        frozen.render_frozen_pair(frozen.freeze_render_input(design, logo=_bitmap()), tmp_path, bake_toc=False)
    assert failure.value.code == code
    assert failure.value.status_code == status
    assert code in caplog.text
    assert "原始字段" not in caplog.text


@pytest.mark.unit
@pytest.mark.parametrize("content", [b"invalid zip", b"", b"not xml"])
def test_should_refuse_missing_or_corrupt_originals(tmp_path: Path, content: bytes) -> None:
    path = tmp_path / "corrupt.docx"
    path.write_bytes(content)
    with pytest.raises(SnapshotError):
        frozen.inspect_original(path, "ecrf")


@pytest.mark.unit
def test_should_not_follow_original_file_symlinks(tmp_path: Path) -> None:
    target = tmp_path / "target.docx"
    target.write_bytes(b"untrusted")
    linked = tmp_path / "linked.docx"
    linked.symlink_to(target)

    with pytest.raises(SnapshotError):
        frozen.inspect_original(linked, "ecrf")
    assert target.read_bytes() == b"untrusted"


@pytest.mark.integration
def test_should_refuse_nonempty_stage_without_overwriting_existing_file(
    design: FrozenProjectDesign, tmp_path: Path
) -> None:
    existing = tmp_path / "ecrf.docx"
    existing.write_bytes(b"must survive")

    with pytest.raises(SnapshotError):
        frozen.render_frozen_pair(frozen.freeze_render_input(design, logo=_bitmap()), tmp_path, bake_toc=False)
    assert existing.read_bytes() == b"must survive"


@pytest.mark.integration
def test_should_release_render_slot_when_body_fails() -> None:
    with pytest.raises(RuntimeError), frozen.render_slot():
        raise RuntimeError("test failure")

    with frozen.render_slot():
        pass


@pytest.mark.integration
def test_should_enforce_combined_pair_budget(
    design: FrozenProjectDesign, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(frozen, "MAX_PAIR_BYTES", 100)
    with pytest.raises(SnapshotError) as failure:
        frozen.render_pair_in_process(frozen.freeze_render_input(design, logo=_bitmap()), tmp_path, bake_toc=False)
    assert failure.value.code == "BASELINE_LIMIT_EXCEEDED"


@pytest.mark.unit
def test_should_keep_layout_and_asset_hashes_separate(design: FrozenProjectDesign) -> None:
    inputs = frozen.freeze_render_input(design, logo=_bitmap())

    assert inputs.layout_hash == hashlib.sha256(b"{}").hexdigest()
    assert inputs.asset_hash == hashlib.sha256(_bitmap()).hexdigest()
    assert inputs.layout_hash != inputs.design.content_hash


@pytest.mark.unit
def test_should_fail_closed_on_windows_before_starting_unbounded_worker(
    design: FrozenProjectDesign, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from src.services import frozen_render_windows as windows
    from src.services.frozen_render_windows_process import WindowsWorkerUnsupported

    admitted: list[bool] = []

    def unsupported(*args: Any, **kwargs: Any) -> Any:
        admitted.append(True)
        raise WindowsWorkerUnsupported("synthetic unavailable creation-time containment")

    monkeypatch.setattr(frozen.sys, "platform", "win32")
    monkeypatch.setattr(windows, "windows_worker_process", unsupported)
    monkeypatch.setattr("subprocess.Popen", lambda *args, **kwargs: pytest.fail("unsupported worker started"))

    with pytest.raises(SnapshotError) as failure:
        frozen.render_frozen_pair(frozen.freeze_render_input(design, logo=_bitmap()), tmp_path, bake_toc=False)

    assert failure.value.code == "BASELINE_PLATFORM_UNSUPPORTED"
    assert failure.value.status_code == 501
    assert admitted == [True]
    assert list(tmp_path.iterdir()) == []


@pytest.mark.unit
def test_should_exit_private_worker_without_gui_error_when_standard_streams_are_absent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(frozen.sys, "stdin", None)
    monkeypatch.setattr(frozen.sys, "stdout", None)

    assert frozen.worker_main(str(tmp_path)) == 1


@pytest.mark.unit
def test_should_reject_original_write_before_modifying_bytes_above_limit() -> None:
    from io import BytesIO
    from src.services.export_service import ExportError

    raw = BytesIO()
    stream = frozen._BoundedOriginalWriter(raw, 8)
    assert stream.write(b"12345678") == 8
    with pytest.raises(ExportError) as failure:
        stream.write(b"9")
    assert failure.value.code == "BASELINE_LIMIT_EXCEEDED"
    assert raw.getvalue() == b"12345678"
    assert stream.tell() == 8


@pytest.mark.unit
@pytest.mark.parametrize("offset,whence", [(9, 0), (5, 1), (1, 2)])
def test_should_reject_seek_above_original_limit_without_moving_cursor(offset: int, whence: int) -> None:
    from io import BytesIO
    from src.services.export_service import ExportError

    raw = BytesIO(b"12345678")
    raw.seek(4)
    stream = frozen._BoundedOriginalWriter(raw, 8)
    with pytest.raises(ExportError):
        stream.seek(offset, whence)
    assert raw.tell() == 4
    assert raw.getvalue() == b"12345678"


@pytest.mark.unit
def test_should_allow_bounded_rewrites_and_reject_oversized_truncation() -> None:
    from io import BytesIO
    from src.services.export_service import ExportError

    raw = BytesIO(b"12345678")
    stream = frozen._BoundedOriginalWriter(raw, 8)
    assert stream.seek(-2, 2) == 6
    assert stream.write(b"ab") == 2
    assert stream.seek(-4, 1) == 4
    assert stream.truncate() == 4
    stream.flush()
    with pytest.raises(ExportError):
        stream.truncate(9)
    assert raw.getvalue() == b"1234"


@pytest.mark.integration
def test_should_enforce_actual_docx_limit_before_excess_bytes_reach_disk(
    design: FrozenProjectDesign, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(frozen, "MAX_ORIGINAL_BYTES", 512)
    with pytest.raises(SnapshotError) as failure:
        frozen.render_pair_in_process(frozen.freeze_render_input(design, logo=_bitmap()), tmp_path, bake_toc=False)
    assert failure.value.code == "BASELINE_LIMIT_EXCEEDED"
    assert all(path.stat().st_size <= 512 for path in tmp_path.iterdir())


@pytest.mark.unit
def test_should_fail_private_dispatch_without_gui_when_render_engine_cannot_import(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import sys
    import app_launcher

    monkeypatch.setitem(sys.modules, "src.services.frozen_render_service", None)
    monkeypatch.setattr(app_launcher, "main", lambda: pytest.fail("ordinary GUI startup reached"))
    assert app_launcher.dispatch_entrypoint([frozen.INTERNAL_WORKER_FLAG, str(tmp_path)]) == 1
    assert list(tmp_path.iterdir()) == []


@pytest.mark.unit
def test_should_match_default_docx_package_parts_with_managed_zip_lifetime() -> None:
    from io import BytesIO
    from docx import Document

    document = Document()
    document.add_paragraph("保留原有 OPC 序列化")
    document.add_table(rows=1, cols=2).cell(0, 0).text = "合成内容"
    document.sections[0].header.paragraphs[0].text = "合成页眉"
    expected = BytesIO()
    actual = BytesIO()
    document.save(expected)
    frozen._write_frozen_package(document, frozen._BoundedOriginalWriter(actual, frozen.MAX_ORIGINAL_BYTES))
    with ZipFile(expected) as before, ZipFile(actual) as after:
        assert before.namelist() == after.namelist()
        assert {name: before.read(name) for name in before.namelist()} == {
            name: after.read(name) for name in after.namelist()
        }


@pytest.mark.integration
def test_should_close_failed_docx_archive_before_its_output_file(
    design: FrozenProjectDesign, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import gc
    import sys

    unraisable: list[Any] = []
    monkeypatch.setattr(frozen, "MAX_ORIGINAL_BYTES", 512)
    monkeypatch.setattr(sys, "unraisablehook", unraisable.append)

    def exceed_limit() -> None:
        with pytest.raises(SnapshotError) as failure:
            frozen.render_pair_in_process(frozen.freeze_render_input(design, logo=_bitmap()), tmp_path, bake_toc=False)
        assert failure.value.code == "BASELINE_LIMIT_EXCEEDED"

    exceed_limit()
    gc.collect()
    assert unraisable == []


@pytest.mark.integration
@pytest.mark.parametrize("bake_toc,expected_saves", [(False, 1), (True, 2)])
def test_should_use_optional_document_saver_for_initial_and_toc_save(
    design: FrozenProjectDesign, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, bake_toc: bool, expected_saves: int
) -> None:
    calls: list[str] = []

    def save(document: Any, path: str) -> None:
        calls.append(path)
        document.save(path)

    monkeypatch.setattr(
        "src.services.toc_pagination.compute_heading_pages", lambda _path: {"表单访视分布图": 3, "原始表单": 4}
    )
    inputs = frozen.freeze_render_input(design, logo=_bitmap())
    path = tmp_path / "saved.docx"
    with frozen._render_session(inputs) as session:
        service = ExportService(session, logo_resolver=lambda _project: inputs.logo, document_saver=save)
        assert service.export_project_to_word(design.project_id, str(path), bake_toc_page_numbers=bake_toc)
    assert calls == [str(path)] * expected_saves
    assert frozen.inspect_original(path, "ecrf").byte_count > 0


@pytest.mark.integration
def test_should_preserve_specific_custom_save_error_instead_of_returning_false(
    design: FrozenProjectDesign, tmp_path: Path
) -> None:
    from src.services.export_service import ExportError

    expected = ExportError("合成写入上限", "BASELINE_LIMIT_EXCEEDED", 413)

    def save(_document: Any, _path: str) -> None:
        raise expected

    inputs = frozen.freeze_render_input(design, logo=_bitmap())
    with frozen._render_session(inputs) as session:
        service = ExportService(session, logo_resolver=lambda _project: inputs.logo, document_saver=save)
        with pytest.raises(ExportError) as failure:
            service.export_project_to_word(design.project_id, str(tmp_path / "unused.docx"))
    assert failure.value is expected


@pytest.mark.integration
def test_should_skip_external_toc_and_disclose_windows_fallback_in_both_originals(
    design: FrozenProjectDesign, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(frozen.sys, "platform", "win32")
    monkeypatch.setattr(
        "src.services.toc_pagination.compute_heading_pages", lambda _path: pytest.fail("external renderer started")
    )
    frozen.render_pair_in_process(frozen.freeze_render_input(design, logo=_bitmap()), tmp_path, bake_toc=True)
    for kind in ("ecrf", "acrf"):
        with ZipFile(tmp_path / f"{kind}.docx") as archive:
            xml = archive.read("word/document.xml").decode()
            assert "Windows 正式留档未预计算目录页码，请在 Word 中更新目录" in xml
            assert "PAGEREF" in xml
            assert "w:updateFields" in archive.read("word/settings.xml").decode()


@pytest.mark.unit
@pytest.mark.parametrize("bake_toc", [False, True])
def test_should_refuse_windows_internal_worker_before_creating_an_uncontained_process(
    design: FrozenProjectDesign, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, bake_toc: bool
) -> None:
    import subprocess
    from unittest.mock import MagicMock

    from src.services import frozen_render_windows as windows
    from src.services.frozen_render_windows_process import WindowsWorkerUnsupported

    def unsupported(*args: Any, **kwargs: Any) -> Any:
        raise WindowsWorkerUnsupported("synthetic unsupported Job list")

    launch = MagicMock(side_effect=AssertionError("uncontained Windows process created"))
    monkeypatch.setattr(frozen.sys, "platform", "win32")
    monkeypatch.setattr(windows, "windows_worker_process", unsupported)
    monkeypatch.setattr(subprocess, "Popen", launch)

    with pytest.raises(SnapshotError) as failure:
        frozen._communicate_worker(frozen.freeze_render_input(design, logo=_bitmap()), tmp_path, bake_toc)

    assert failure.value.code == "BASELINE_PLATFORM_UNSUPPORTED"
    assert failure.value.status_code == 501
    launch.assert_not_called()


@pytest.mark.unit
def test_should_use_owned_recovered_worker_streams_and_flush_closed_response(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import resource
    import sys
    from contextlib import contextmanager
    from io import BytesIO, StringIO
    from types import ModuleType

    output = StringIO()
    closed: list[bool] = []
    monkeypatch.setattr(resource, "setrlimit", lambda *_args: None)

    @contextmanager
    def streams() -> Any:
        try:
            yield BytesIO(b"{}"), output
        finally:
            closed.append(True)

    windows = ModuleType("src.services.frozen_render_windows")
    windows.worker_standard_streams = streams
    monkeypatch.setitem(sys.modules, windows.__name__, windows)
    monkeypatch.setattr(frozen.sys, "stdin", None)
    monkeypatch.setattr(frozen.sys, "stdout", None)
    assert frozen.worker_main(str(tmp_path)) == 1
    assert json.loads(output.getvalue()) == {"complete": False, "code": "BASELINE_RENDER_FAILED"}
    assert closed == [True]


@pytest.mark.unit
@pytest.mark.parametrize("group_already_exited", [False, True])
def test_should_stop_owned_process_group_and_drain_after_parent_communication_error(
    design: FrozenProjectDesign, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, group_already_exited: bool
) -> None:
    import signal
    import subprocess
    from unittest.mock import MagicMock

    failure = OSError("synthetic communication failure")
    process = MagicMock()
    process.__enter__.return_value = process
    process.pid = 123456
    process.communicate.side_effect = [failure, (b"", None)]
    stop_group = MagicMock(side_effect=ProcessLookupError() if group_already_exited else None)
    monkeypatch.setattr(frozen.sys, "platform", "linux")
    monkeypatch.setattr(subprocess, "Popen", MagicMock(return_value=process))
    monkeypatch.setattr(frozen.os, "killpg", stop_group)

    with pytest.raises(OSError) as observed:
        frozen._communicate_worker(frozen.freeze_render_input(design, logo=_bitmap()), tmp_path, False)

    assert observed.value is failure
    stop_group.assert_called_once_with(process.pid, signal.SIGKILL)
    assert process.communicate.call_count == 2


@pytest.mark.unit
@pytest.mark.parametrize("bake_toc", [False, True])
@pytest.mark.parametrize("outcome", ["complete", "timeout", "io_error", "start_error"])
def test_should_use_atomic_windows_transport_and_its_owned_exception_cleanup(
    design: FrozenProjectDesign, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, bake_toc: bool, outcome: str
) -> None:
    import subprocess
    from contextlib import contextmanager
    from types import SimpleNamespace
    from src.services import frozen_render_windows as windows

    calls: list[dict[str, Any]] = []
    closed: list[bool] = []
    errors = {
        "timeout": subprocess.TimeoutExpired("synthetic worker", frozen.PAIR_TIMEOUT_SECONDS),
        "io_error": OSError("synthetic pipe error"),
        "start_error": RuntimeError("synthetic thread resource error"),
    }

    def communicate(data: bytes, timeout: float) -> tuple[bytes, None]:
        calls.append({"request": json.loads(data), "timeout": timeout})
        if outcome in errors:
            raise errors[outcome]
        return b'{"complete":true}', None

    @contextmanager
    def transport(command: list[str], **options: Any) -> Any:
        assert command[-2:] == [frozen.INTERNAL_WORKER_FLAG, str(tmp_path)]
        assert set(options) == {"cwd", "env"}
        try:
            yield SimpleNamespace(communicate=communicate, returncode=0)
        finally:
            closed.append(True)

    monkeypatch.setattr(frozen.sys, "platform", "win32")
    monkeypatch.setattr(windows, "windows_worker_process", transport)
    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs: pytest.fail("unsafe fallback started"))
    inputs = frozen.freeze_render_input(design, logo=_bitmap())
    if outcome == "complete":
        frozen._communicate_worker(inputs, tmp_path, bake_toc)
    else:
        expected = SnapshotError if outcome == "timeout" else type(errors[outcome])
        with pytest.raises(expected) as failure:
            frozen._communicate_worker(inputs, tmp_path, bake_toc)
        if outcome == "timeout":
            assert failure.value.code == "BASELINE_RENDER_TIMEOUT" and failure.value.status_code == 504
        else:
            assert failure.value is errors[outcome]
    assert closed == [True] and len(calls) == 1
    assert calls[0]["timeout"] == frozen.PAIR_TIMEOUT_SECONDS
    assert calls[0]["request"]["snapshot"] == inputs.design.payload_json
    assert calls[0]["request"]["layout"] == inputs.layout_json
    assert calls[0]["request"]["bake_toc"] is bake_toc
