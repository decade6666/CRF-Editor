"""Frozen Word-pair engine, isolated from live app state and application startup."""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import math
import os
import signal
import stat
import subprocess
import sys
import threading
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path, PurePosixPath
from types import SimpleNamespace
from typing import Any, BinaryIO, Iterator, TextIO
from zipfile import BadZipFile, ZipFile

from docx.opc.phys_pkg import PhysPkgWriter
from docx.opc.pkgwriter import PackageWriter
from sqlalchemy import Date, create_engine, event, insert
from sqlalchemy.orm import Session

from src.models import Base
from src.services.design_snapshot_service import (
    MAX_SNAPSHOT_BYTES,
    FrozenProjectDesign,
    SnapshotError,
    assert_formal_renderable,
    decode_project_design,
)
from src.services.export_service import ExportError, ExportService
from src.services.logo_storage_service import MAX_LOGO_BYTES, validate_bitmap

logger = logging.getLogger(__name__)
MAX_ORIGINAL_BYTES = 64 * 1024 * 1024
MAX_PAIR_BYTES = 128 * 1024 * 1024
MAX_EXPANDED_ORIGINAL_BYTES = 256 * 1024 * 1024
MAX_LAYOUT_BYTES = 256 * 1024
MAX_WIDTH_ENTRIES = 4096
PAIR_TIMEOUT_SECONDS = 300
INTERNAL_WORKER_FLAG = "--crf-frozen-render-internal"
_MAX_WORKER_INPUT = 2 * MAX_SNAPSHOT_BYTES + 8 * 1024 * 1024
_RENDER_LOCK = threading.Lock()
_TABLE_KINDS = frozenset({"normal", "inline"})
_WORKER_FAILURE_STATUS = {
    "BASELINE_RENDER_FAILED": 500,
    "BASELINE_LIMIT_EXCEEDED": 413,
    "BASELINE_ASSET_INVALID": 422,
    "BASELINE_LAYOUT_INVALID": 422,
}


@dataclass(frozen=True)
class FrozenRenderInput:
    design: FrozenProjectDesign
    layout_json: str
    logo: bytes | None = field(repr=False)

    @property
    def layout_hash(self) -> str:
        return hashlib.sha256(self.layout_json.encode("utf-8")).hexdigest()

    @property
    def asset_hash(self) -> str | None:
        return hashlib.sha256(self.logo).hexdigest() if self.logo is not None else None


@dataclass(frozen=True)
class OriginalArtifact:
    kind: str
    byte_count: int
    sha256: str


def _failure(code: str = "BASELINE_RENDER_FAILED", status: int = 500) -> SnapshotError:
    messages = {
        "BASELINE_RENDER_FAILED": "正式原件生成失败，未完成留档",
        "BASELINE_RENDER_TIMEOUT": "正式原件生成超时，未完成留档",
        "BASELINE_LIMIT_EXCEEDED": "留档文件或版式超出处理上限，未完成留档",
        "BASELINE_ASSET_INVALID": "项目 Logo 无法安全冻结，未完成留档",
        "BASELINE_LAYOUT_INVALID": "留档列宽与所选设计不匹配，请重新预览",
        "BASELINE_BUSY": "已有正式原件正在生成，请稍后重试",
        "BASELINE_PLATFORM_UNSUPPORTED": "此平台尚未具备受限留档渲染能力，未生成正式留档",
    }
    return SnapshotError(messages[code], code, status)


def _validate_ratios(value: Any) -> int:
    if not isinstance(value, list) or not value:
        raise _failure("BASELINE_LAYOUT_INVALID", 422)
    if any(type(part) not in (int, float) or not math.isfinite(part) or not 0 < part <= 1 for part in value):
        raise _failure("BASELINE_LAYOUT_INVALID", 422)
    if not math.isclose(sum(value), 1.0, abs_tol=1e-6):
        raise _failure("BASELINE_LAYOUT_INVALID", 422)
    return len(value)


def _layout_targets(design: FrozenProjectDesign) -> dict[str, tuple[str, str, int]]:
    payload = design.to_dict()
    targets: dict[str, tuple[str, str, int]] = {}
    for form in payload["tables"]["form"]:
        rows = [SimpleNamespace(**row) for row in payload["tables"]["form_field"] if row["form_id"] == form["id"]]
        rows.sort(key=lambda row: (row.order_index, row.id))
        for group in ExportService._group_form_fields(rows):
            if group:
                kind = "inline" if group[0].inline_mark == 1 else "normal"
                key = ExportService._build_table_instance_id(kind, group)
                targets[key] = (str(form["id"]), kind, len(group) if kind == "inline" else 2)
    return targets


def _freeze_layout(design: FrozenProjectDesign, widths: Any) -> str:
    if not isinstance(widths, dict):
        raise _failure("BASELINE_LAYOUT_INVALID", 422)
    form_ids = {str(row["id"]) for row in design.to_dict()["tables"]["form"]}
    targets = _layout_targets(design)
    count = 0
    for key, values in widths.items():
        if not isinstance(key, str):
            raise _failure("BASELINE_LAYOUT_INVALID", 422)
        if key in form_ids:
            if not isinstance(values, dict) or not values or not set(values) <= _TABLE_KINDS:
                raise _failure("BASELINE_LAYOUT_INVALID", 422)
            for kind, ratios in values.items():
                length = _validate_ratios(ratios)
                if (key, kind, length) not in targets.values():
                    raise _failure("BASELINE_LAYOUT_INVALID", 422)
                count += length
        else:
            length = _validate_ratios(values)
            if key not in targets or targets[key][2] != length:
                raise _failure("BASELINE_LAYOUT_INVALID", 422)
            count += length
        if count > MAX_WIDTH_ENTRIES:
            raise _failure("BASELINE_LIMIT_EXCEEDED", 413)
    encoded = json.dumps(widths, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    if len(encoded.encode("utf-8")) > MAX_LAYOUT_BYTES:
        raise _failure("BASELINE_LIMIT_EXCEEDED", 413)
    return encoded


def freeze_render_input(
    design: FrozenProjectDesign,
    column_widths: dict[str, Any] | None = None,
    logo: bytes | None = None,
) -> FrozenRenderInput:
    """Freeze validated explicit layout/assets, independent of caller-owned objects."""
    design = decode_project_design(design.payload_json)
    logo_expected = design.to_dict()["asset_references"]["company_logo"] is not None
    if (logo is not None) != logo_expected or (
        logo is not None and (not isinstance(logo, bytes) or len(logo) > MAX_LOGO_BYTES)
    ):
        raise _failure("BASELINE_ASSET_INVALID", 422)
    if logo is not None:
        try:
            validate_bitmap("frozen-logo.png", logo)
            from docx.image.image import Image

            Image.from_blob(logo)
        except Exception as exc:
            raise _failure("BASELINE_ASSET_INVALID", 422) from exc
    return FrozenRenderInput(design, _freeze_layout(design, column_widths if column_widths is not None else {}), logo)


def _materialized_rows(name: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    table = Base.metadata.tables[name]
    date_keys = {column.name for column in table.columns if isinstance(column.type, Date)}
    return [
        {
            key: date.fromisoformat(value) if key in date_keys and value is not None else value
            for key, value in row.items()
        }
        for row in rows
    ]


@contextmanager
def _render_session(inputs: FrozenRenderInput) -> Iterator[Session]:
    payload = inputs.design.to_dict()
    names = {"user", "project", *payload["tables"]}
    tables = [table for table in Base.metadata.sorted_tables if table.name in names]
    engine = create_engine("sqlite+pysqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def configure(connection: Any, _record: Any) -> None:
        connection.execute("PRAGMA foreign_keys=ON")

    try:
        Base.metadata.create_all(engine, tables=tables)
        project = dict(payload["project"], company_logo_path="frozen-logo" if inputs.logo is not None else None)
        rows = {"project": [project], **payload["tables"]}
        with engine.begin() as connection:
            for table in tables:
                if rows.get(table.name):
                    connection.execute(insert(table), _materialized_rows(table.name, rows[table.name]))
        with Session(engine) as session:
            yield session
    finally:
        engine.dispose()


def _check_zip(archive: ZipFile) -> None:
    names: set[str] = set()
    expanded = 0
    for member in archive.infolist():
        path = PurePosixPath(member.filename)
        if path.is_absolute() or ".." in path.parts or "\\" in member.filename or member.filename in names:
            raise _failure()
        if stat.S_ISLNK(member.external_attr >> 16):
            raise _failure()
        names.add(member.filename)
        expanded += member.file_size
        if expanded > MAX_EXPANDED_ORIGINAL_BYTES or len(names) > 10_000:
            raise _failure("BASELINE_LIMIT_EXCEEDED", 413)
    if archive.testzip() is not None:
        raise _failure()


def inspect_original(path: Path, kind: str) -> OriginalArtifact:
    if kind not in {"ecrf", "acrf"}:
        raise _failure()
    try:
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size <= 0:
            raise _failure()
        if info.st_size > MAX_ORIGINAL_BYTES:
            raise _failure("BASELINE_LIMIT_EXCEEDED", 413)
        with ZipFile(path) as archive:
            _check_zip(archive)
        valid, _reason = ExportService._validate_output(str(path))
        if not valid:
            raise _failure()
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        return OriginalArtifact(kind, info.st_size, digest.hexdigest())
    except SnapshotError:
        raise
    except (OSError, BadZipFile, ValueError) as exc:
        raise _failure() from exc


def _validate_output_directory(directory: Path) -> None:
    if directory.is_symlink() or not directory.is_dir() or any(directory.iterdir()):
        raise _failure()


class _BoundedOriginalWriter:
    """Seekable DOCX sink that refuses excess bytes before touching its owned file."""

    def __init__(self, stream: BinaryIO, limit: int) -> None:
        self._stream = stream
        self._limit = limit

    def _check_position(self, position: int) -> None:
        if position < 0:
            raise ValueError("negative original position")
        if position > self._limit:
            raise ExportError("正式原件超出写入上限", "BASELINE_LIMIT_EXCEEDED", 413)

    def tell(self) -> int:
        return self._stream.tell()

    def write(self, data: bytes) -> int:
        self._check_position(self.tell() + len(data))
        return self._stream.write(data)

    def seek(self, offset: int, whence: int = os.SEEK_SET) -> int:
        current = self.tell()
        if whence == os.SEEK_SET:
            position = offset
        elif whence == os.SEEK_CUR:
            position = current + offset
        elif whence == os.SEEK_END:
            end = self._stream.seek(0, os.SEEK_END)
            self._stream.seek(current)
            position = end + offset
        else:
            raise ValueError("invalid original seek origin")
        self._check_position(position)
        return self._stream.seek(position)

    def truncate(self, size: int | None = None) -> int:
        position = self.tell() if size is None else size
        self._check_position(position)
        return self._stream.truncate(position)

    def flush(self) -> None:
        self._stream.flush()


def _write_frozen_package(document: Any, stream: _BoundedOriginalWriter) -> None:
    # python-docx's PackageWriter.write has no finally around its ZipFile owner.
    # Reuse its serializers, but close before our owned file even on a limit error.
    package = document.part.package
    for part in package.parts:
        part.before_marshal()
    writer = PhysPkgWriter(stream)
    try:
        PackageWriter._write_content_types_stream(writer, package.parts)
        PackageWriter._write_pkg_rels(writer, package.rels)
        PackageWriter._write_parts(writer, package.parts)
    finally:
        writer.close()


def _save_frozen_document(document: Any, stream: _BoundedOriginalWriter, *, windows_toc_fallback: bool) -> None:
    if windows_toc_fallback:
        fields = [
            node for node in document.element.xpath(".//w:instrText") if (node.text or "").strip().startswith("TOC ")
        ]
        if len(fields) != 1:
            raise _failure()
        notice = document.add_paragraph("Windows 正式留档未预计算目录页码，请在 Word 中更新目录")
        fields[0].getparent().getparent().addprevious(notice._p)
    stream.seek(0)
    stream.truncate()
    _write_frozen_package(document, stream)
    stream.flush()


def render_pair_in_process(
    inputs: FrozenRenderInput,
    output_directory: Path,
    *,
    bake_toc: bool = True,
) -> tuple[OriginalArtifact, OriginalArtifact]:
    """Worker engine; all database objects are disposable and assets are frozen."""
    inputs = freeze_render_input(inputs.design, json.loads(inputs.layout_json), inputs.logo)
    assert_formal_renderable(inputs.design)
    _validate_output_directory(output_directory)
    try:
        with _render_session(inputs) as session:
            windows_toc_fallback = sys.platform == "win32"
            artifacts: list[OriginalArtifact] = []
            for kind in ("ecrf", "acrf"):
                path = output_directory / f"{kind}.docx"
                with path.open("x+b") as output:
                    stream = _BoundedOriginalWriter(output, MAX_ORIGINAL_BYTES)
                    service = ExportService(
                        session,
                        logo_resolver=lambda _project: inputs.logo,
                        document_saver=lambda document, _path: _save_frozen_document(
                            document, stream, windows_toc_fallback=windows_toc_fallback
                        ),
                    )
                    ok = service.export_project_to_word(
                        inputs.design.project_id,
                        str(path),
                        column_width_overrides=json.loads(inputs.layout_json),
                        bake_toc_page_numbers=bake_toc and not windows_toc_fallback,
                        annotated=kind == "acrf",
                    )
                if not ok:
                    raise _failure()
                artifacts.append(inspect_original(path, kind))
            if sum(item.byte_count for item in artifacts) > MAX_PAIR_BYTES:
                raise _failure("BASELINE_LIMIT_EXCEEDED", 413)
            return artifacts[0], artifacts[1]
    except ExportError as exc:
        if exc.code == "BASELINE_LIMIT_EXCEEDED":
            raise _failure("BASELINE_LIMIT_EXCEEDED", 413) from exc
        logger.exception("冻结原件导出失败 project_id=%s", inputs.design.project_id)
        raise _failure() from exc
    except SnapshotError:
        raise
    except Exception as exc:
        logger.exception("冻结原件渲染失败 project_id=%s", inputs.design.project_id)
        raise _failure() from exc


@contextmanager
def render_slot() -> Iterator[None]:
    if not _RENDER_LOCK.acquire(blocking=False):
        raise _failure("BASELINE_BUSY", 409)
    try:
        yield
    finally:
        _RENDER_LOCK.release()


def _worker_command(directory: Path) -> list[str]:
    if getattr(sys, "frozen", False):
        return [sys.executable, INTERNAL_WORKER_FLAG, str(directory)]
    return [sys.executable, "-m", "src.services.frozen_render_service", INTERNAL_WORKER_FLAG, str(directory)]


def _worker_environment() -> dict[str, str]:
    allowed = {"PATH", "SYSTEMROOT", "WINDIR", "LANG", "LC_ALL", "TEMP", "TMP", "TMPDIR"}
    return {key: value for key, value in os.environ.items() if key.upper() in allowed}


def _stop_worker(process: subprocess.Popen[bytes]) -> None:
    if os.name == "posix":
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    else:
        process.kill()
    process.communicate()


def _validate_worker_response(result: bytes, returncode: int) -> None:
    if len(result) > 4096:
        raise _failure()
    try:
        response = json.loads(result)
    except (ValueError, UnicodeError) as exc:
        raise _failure() from exc
    if isinstance(response, dict) and set(response) == {"complete", "code"} and response["complete"] is False:
        code = response["code"]
        if isinstance(code, str) and code in _WORKER_FAILURE_STATUS:
            raise _failure(code, _WORKER_FAILURE_STATUS[code])
    if returncode != 0 or response != {"complete": True}:
        raise _failure()


def _communicate_windows_worker(request: bytes, directory: Path) -> None:
    from src.services.frozen_render_windows import windows_worker_process
    from src.services.frozen_render_windows_process import WindowsWorkerUnsupported

    try:
        with windows_worker_process(
            _worker_command(directory),
            cwd=Path(__file__).resolve().parents[2],
            env=_worker_environment(),
        ) as process:
            try:
                result, _stderr = process.communicate(request, timeout=PAIR_TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired as exc:
                raise _failure("BASELINE_RENDER_TIMEOUT", 504) from exc
            # The native context owns kill/reap/join on every failure. Do not
            # restart communication after a failed I/O-thread start just to drain.
            _validate_worker_response(result, process.returncode)
    except WindowsWorkerUnsupported as exc:
        raise _failure("BASELINE_PLATFORM_UNSUPPORTED", 501) from exc


def _communicate_worker(inputs: FrozenRenderInput, directory: Path, bake_toc: bool) -> None:
    request = json.dumps(
        {
            "snapshot": inputs.design.payload_json,
            "layout": inputs.layout_json,
            "logo": base64.b64encode(inputs.logo).decode("ascii") if inputs.logo is not None else None,
            "bake_toc": bake_toc,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    if len(request) > _MAX_WORKER_INPUT:
        raise _failure("BASELINE_LIMIT_EXCEEDED", 413)
    if sys.platform == "win32":
        _communicate_windows_worker(request, directory)
        return
    options: dict[str, Any] = {"start_new_session": True} if os.name == "posix" else {}
    with subprocess.Popen(
        _worker_command(directory),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        cwd=Path(__file__).resolve().parents[2],
        env=_worker_environment(),
        **options,
    ) as process:
        try:
            result, _stderr = process.communicate(request, timeout=PAIR_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired as exc:
            _stop_worker(process)
            raise _failure("BASELINE_RENDER_TIMEOUT", 504) from exc
        except BaseException:
            _stop_worker(process)
            raise
        _validate_worker_response(result, process.returncode)


def render_frozen_pair(
    inputs: FrozenRenderInput,
    output_directory: Path,
    *,
    bake_toc: bool = True,
) -> tuple[OriginalArtifact, OriginalArtifact]:
    """Parent boundary: one admitted render, bounded deadline, no app/bootstrap."""
    assert_formal_renderable(inputs.design)
    _validate_output_directory(output_directory)
    with render_slot():
        try:
            _communicate_worker(inputs, output_directory.resolve(), bake_toc)
            artifacts = tuple(inspect_original(output_directory / f"{kind}.docx", kind) for kind in ("ecrf", "acrf"))
            if sum(item.byte_count for item in artifacts) > MAX_PAIR_BYTES:
                raise _failure("BASELINE_LIMIT_EXCEEDED", 413)
            return artifacts[0], artifacts[1]
        except SnapshotError as exc:
            logger.warning("冻结原件未完成 project_id=%s code=%s", inputs.design.project_id, exc.code)
            raise
        except (OSError, ValueError) as exc:
            logger.exception("冻结原件进程失败 project_id=%s", inputs.design.project_id)
            raise _failure() from exc


def worker_main(output_directory: str) -> int:
    """Internal entry: only owned/borrowed protocol streams, never app or config."""
    from src.services.frozen_render_windows import worker_standard_streams

    try:
        with worker_standard_streams() as (source, output):
            return _run_worker(output_directory, source, output)
    except Exception:
        # Stdio/admission failures are observable nonzero child outcomes; do not
        # enter the desktop GUI or expose exception values through the protocol.
        return 1


def _run_worker(output_directory: str, source: BinaryIO, output: TextIO) -> int:
    try:
        if os.name == "posix":
            import resource

            resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_ORIGINAL_BYTES, MAX_ORIGINAL_BYTES))
        raw = source.read(_MAX_WORKER_INPUT + 1)
        if len(raw) > _MAX_WORKER_INPUT:
            raise _failure("BASELINE_LIMIT_EXCEEDED", 413)
        request = json.loads(raw)
        if not isinstance(request, dict) or set(request) != {"snapshot", "layout", "logo", "bake_toc"}:
            raise _failure()
        if type(request["bake_toc"]) is not bool:
            raise _failure()
        logo = base64.b64decode(request["logo"], validate=True) if request["logo"] is not None else None
        inputs = freeze_render_input(decode_project_design(request["snapshot"]), json.loads(request["layout"]), logo)
        render_pair_in_process(inputs, Path(output_directory), bake_toc=request["bake_toc"])
        output.write('{"complete":true}')
        output.flush()
        return 0
    except Exception as exc:
        code = (
            exc.code
            if isinstance(exc, SnapshotError) and exc.code in _WORKER_FAILURE_STATUS
            else "BASELINE_RENDER_FAILED"
        )
        output.write(json.dumps({"complete": False, "code": code}))
        output.flush()
        return 1


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] != INTERNAL_WORKER_FLAG:
        raise SystemExit(2)
    raise SystemExit(worker_main(sys.argv[2]))
