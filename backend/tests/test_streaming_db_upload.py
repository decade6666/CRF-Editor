"""流式 .db 上传契约测试（design.md D1/D3b/D6）。

RED 阶段说明：
- 助手单元针对尚不存在的 ``src.services.upload_streaming.stream_upload_to_file``，
  以函数级导入触发 ImportError（D6 允许的新模块用例）；
- 端点级用例在现网 ``_save_bytes_to_temp`` 行为下失败：整读缓冲（读取计数/提前停止）、
  落盘目录错误（系统临时目录而非归属目录）、存储名携带调用方后缀而非
  ``{temp_id}_u{uid}_p0_upload.db`` 固定形状。
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.concurrency import run_in_threadpool as _real_run_in_threadpool
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session
from starlette.requests import Request

from helpers import auth_headers, login_as
from src.models import Base
from src.models.project import Project
from src.models.user import User
from src.routers.projects import import_project_db
from src.services.docx_import_service import DocxImportService

_MAGIC = b"SQLite format 3"
_MAGIC_MESSAGE = "文件不是有效的 SQLite 数据库"
_OWNED_NAME_RE = r"[0-9a-f]{32}_u\d+_p0_upload\.db"


def _load_stream_upload_to_file():
    from src.services.upload_streaming import stream_upload_to_file

    return stream_upload_to_file


# ── reader / upload 桩 ──────────────────────────────────────────


class _ChunkReader:
    """结构化 reader 桩：按固定块吐数据并记录每次读取。"""

    def __init__(self, data: bytes, *, chunk_size: int = 1024 * 1024):
        self._data = data
        self._chunk_size = chunk_size
        self._pos = 0
        self.read_calls: list[int] = []

    async def read(self, size: int) -> bytes:
        self.read_calls.append(size)
        chunk = self._data[self._pos : self._pos + size]
        self._pos += len(chunk)
        return chunk


class _FailAfterFirstChunk:
    """第一块正常返回，其后抛指定异常（取消 / 磁盘错误）。"""

    def __init__(self, first_chunk: bytes, dest: Path, exc: BaseException):
        self._first_chunk = first_chunk
        self._dest = dest
        self._exc = exc
        self._used = False
        self.dest_existed_at_raise: bool | None = None

    async def read(self, size: int) -> bytes:
        if not self._used:
            self._used = True
            return self._first_chunk
        self.dest_existed_at_raise = self._dest.exists()
        raise self._exc


class _CountedUpload:
    """带读取计数的上传桩：与 UploadFile 一样暴露 filename 与 async read(size)。"""

    def __init__(self, data: bytes, *, filename: str):
        self.filename = filename
        self._data = data
        self._pos = 0
        self.read_calls: list[int] = []
        self.pulled = 0

    async def read(self, size: int = -1) -> bytes:
        self.read_calls.append(size)
        if size is None or size < 0:
            chunk = self._data[self._pos :]
            self._pos = len(self._data)
        else:
            chunk = self._data[self._pos : self._pos + size]
            self._pos += len(chunk)
        self.pulled += len(chunk)
        return chunk


def _dummy_request() -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/projects/import/project-db",
            "headers": [],
            "query_string": b"",
        }
    )


def _assert_no_db_residue() -> None:
    temp_dir = Path(DocxImportService.TEMP_DIR)
    leftovers = sorted(p.name for p in temp_dir.glob("*.db")) if temp_dir.exists() else []
    assert leftovers == [], leftovers


# ── 助手单元：stream_upload_to_file ─────────────────────────────


def test_stream_writes_all_chunks_and_returns_byte_count(tmp_path):
    stream_upload_to_file = _load_stream_upload_to_file()
    dest = tmp_path / "dest.db"
    data = b"x" * (2 * 1024 * 1024 + 17)
    reader = _ChunkReader(data)

    written = asyncio.run(stream_upload_to_file(reader, dest, max_bytes=64 * 1024 * 1024, over_limit_message="over"))

    assert written == len(data)
    assert dest.read_bytes() == data
    assert len(reader.read_calls) >= 2, reader.read_calls


def test_magic_prefix_checked_before_size_and_at_eof_short_read(tmp_path):
    stream_upload_to_file = _load_stream_upload_to_file()

    async def run_short(dest: Path, data: bytes):
        return await stream_upload_to_file(
            _ChunkReader(data),
            dest,
            max_bytes=200 * 1024 * 1024,
            over_limit_message="文件大小超过限制（最大 200 MB）",
            magic_prefix=_MAGIC,
            magic_message=_MAGIC_MESSAGE,
        )

    with pytest.raises(ValueError, match=_MAGIC_MESSAGE):
        asyncio.run(run_short(tmp_path / "short.db", b"short"))
    with pytest.raises(ValueError, match=_MAGIC_MESSAGE):
        asyncio.run(run_short(tmp_path / "big.db", b"NOT SQLITE" * (400 * 1024)))
    for name in ("short.db", "big.db"):
        assert not (tmp_path / name).exists()


def test_magic_error_precedes_size_error_even_when_cap_is_smaller_than_header(tmp_path):
    stream_upload_to_file = _load_stream_upload_to_file()
    message = "文件大小超过限制（最大 1 字节）"

    with pytest.raises(ValueError, match=_MAGIC_MESSAGE):
        asyncio.run(
            stream_upload_to_file(
                _ChunkReader(b"NOT SQLITE"),
                tmp_path / "invalid.db",
                max_bytes=1,
                over_limit_message=message,
                magic_prefix=_MAGIC,
                magic_message=_MAGIC_MESSAGE,
            )
        )

    with pytest.raises(ValueError, match=message):
        asyncio.run(
            stream_upload_to_file(
                _ChunkReader(_MAGIC),
                tmp_path / "oversized-header.db",
                max_bytes=1,
                over_limit_message=message,
                magic_prefix=_MAGIC,
                magic_message=_MAGIC_MESSAGE,
            )
        )

    assert not (tmp_path / "invalid.db").exists()
    assert not (tmp_path / "oversized-header.db").exists()


def test_size_cap_rejects_with_exact_message_and_unlinks_partial(tmp_path):
    stream_upload_to_file = _load_stream_upload_to_file()
    dest = tmp_path / "dest.db"
    data = b"a" * (3 * 1024 * 1024)

    with pytest.raises(ValueError, match="文件大小超过限制（最大 1 MB）"):
        asyncio.run(
            stream_upload_to_file(
                _ChunkReader(data), dest, max_bytes=1024 * 1024, over_limit_message="文件大小超过限制（最大 1 MB）"
            )
        )

    assert not dest.exists()


def test_cancellation_mid_stream_unlinks_partial_and_propagates(tmp_path):
    stream_upload_to_file = _load_stream_upload_to_file()
    dest = tmp_path / "dest.db"
    reader = _FailAfterFirstChunk(_MAGIC + b"\x00first-chunk", dest, asyncio.CancelledError())

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(
            stream_upload_to_file(
                reader,
                dest,
                max_bytes=64 * 1024 * 1024,
                over_limit_message="over",
                magic_prefix=_MAGIC,
                magic_message=_MAGIC_MESSAGE,
            )
        )

    assert reader.dest_existed_at_raise is True, "取消时半成品文件应已创建"
    assert not dest.exists(), "取消后必须清理半成品文件（except BaseException，而非 except Exception）"


def test_read_error_unlinks_partial_and_reraises(tmp_path):
    stream_upload_to_file = _load_stream_upload_to_file()
    dest = tmp_path / "dest.db"
    reader = _FailAfterFirstChunk(_MAGIC + b"\x00first-chunk", dest, OSError("disk boom"))

    with pytest.raises(OSError, match="disk boom"):
        asyncio.run(
            stream_upload_to_file(
                reader,
                dest,
                max_bytes=64 * 1024 * 1024,
                over_limit_message="over",
                magic_prefix=_MAGIC,
                magic_message=_MAGIC_MESSAGE,
            )
        )

    assert not dest.exists()


def test_cleanup_failure_logs_warning_and_preserves_original_error(tmp_path, monkeypatch, caplog):
    stream_upload_to_file = _load_stream_upload_to_file()
    dest = tmp_path / "subject-123\nERROR.db"

    def _boom(*_args, **_kwargs):
        raise OSError("unlink boom")

    monkeypatch.setattr(Path, "unlink", _boom)

    with caplog.at_level(logging.WARNING):
        with pytest.raises(ValueError, match="文件大小超过限制"):
            asyncio.run(
                stream_upload_to_file(
                    _ChunkReader(b"a" * (3 * 1024 * 1024)),
                    dest,
                    max_bytes=1024 * 1024,
                    over_limit_message="文件大小超过限制（最大 1 MB）",
                )
            )

    assert any(r.levelno == logging.WARNING for r in caplog.records), [r.getMessage() for r in caplog.records]
    assert all("subject-123" not in r.getMessage() for r in caplog.records), [r.getMessage() for r in caplog.records]
    assert all("\n" not in r.getMessage() for r in caplog.records), [r.getMessage() for r in caplog.records]


def test_per_chunk_write_goes_through_run_in_threadpool(tmp_path, monkeypatch):
    from src.services import upload_streaming

    write_fns: list = []

    async def _spy(fn, *args, **kwargs):
        write_fns.append(fn)
        return await _real_run_in_threadpool(fn, *args, **kwargs)

    monkeypatch.setattr(upload_streaming, "run_in_threadpool", _spy, raising=False)
    dest = tmp_path / "dest.db"
    data = b"x" * (2 * 1024 * 1024 + 1)

    asyncio.run(
        upload_streaming.stream_upload_to_file(
            _ChunkReader(data), dest, max_bytes=64 * 1024 * 1024, over_limit_message="over"
        )
    )

    assert write_fns, (
        "每个数据块的写入必须经 fastapi.concurrency.run_in_threadpool（D4 锁定，asyncio.to_thread 视为违反）"
    )
    assert dest.read_bytes() == data


def test_exclusive_create_refuses_existing_dest_and_keeps_it_intact(tmp_path):
    stream_upload_to_file = _load_stream_upload_to_file()
    dest = tmp_path / "dest.db"
    dest.write_bytes(b"KEEP")

    with pytest.raises(FileExistsError):
        asyncio.run(
            stream_upload_to_file(
                _ChunkReader(_MAGIC + b"\x00data"),
                dest,
                max_bytes=64 * 1024 * 1024,
                over_limit_message="over",
                magic_prefix=_MAGIC,
                magic_message=_MAGIC_MESSAGE,
            )
        )

    assert dest.read_bytes() == b"KEEP"


@pytest.mark.skipif(os.name == "nt", reason="POSIX 权限断言")
def test_created_temp_file_has_0600_permissions(tmp_path):
    stream_upload_to_file = _load_stream_upload_to_file()
    dest = tmp_path / "dest.db"

    asyncio.run(stream_upload_to_file(_ChunkReader(b"data"), dest, max_bytes=1024 * 1024, over_limit_message="over"))

    assert (dest.stat().st_mode & 0o777) == 0o600


# ── 端点级：应用层「未整读」与错误顺序 ───────────────────────────


def test_oversized_db_upload_rejects_without_buffering_whole_body(monkeypatch):
    limit = 1024 * 1024
    monkeypatch.setattr("src.routers.projects._MAX_IMPORT_SIZE", limit)
    payload = _MAGIC + b"\x00" + b"x" * (3 * 1024 * 1024)
    fake = _CountedUpload(payload, filename="test.db")

    async def call():
        return await import_project_db(
            request=_dummy_request(), file=fake, session=None, current_user=SimpleNamespace(id=7)
        )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(call())

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == f"文件大小超过限制（最大 {limit // 1024 // 1024} MB）"
    assert fake.read_calls and all(size > 0 for size in fake.read_calls), fake.read_calls
    assert fake.pulled < len(payload), f"端点整读缓冲了完整请求体：{fake.pulled}/{len(payload)}"
    _assert_no_db_residue()


def test_real_multipart_oversized_db_upload_returns_400_and_leaves_no_temp_file(client, monkeypatch):
    limit = 1024 * 1024
    monkeypatch.setattr("src.routers.projects._MAX_IMPORT_SIZE", limit)
    token = login_as(client, "alice")
    payload = _MAGIC + b"\x00" + b"x" * (limit + 1 - len(_MAGIC) - 1)

    response = _upload_db(client, "too-large.db", token, content=payload)

    assert response.status_code == 400, response.text
    assert response.json() == {"detail": f"文件大小超过限制（最大 {limit // 1024 // 1024} MB）"}, response.text
    _assert_no_db_residue()


def test_non_sqlite_oversized_upload_reports_magic_error_before_size(monkeypatch):
    limit = 1024 * 1024
    monkeypatch.setattr("src.routers.projects._MAX_IMPORT_SIZE", limit)
    payload = b"NOTSQLITE!" * (400 * 1024)
    fake = _CountedUpload(payload, filename="test.db")

    async def call():
        return await import_project_db(
            request=_dummy_request(), file=fake, session=None, current_user=SimpleNamespace(id=7)
        )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(call())

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == _MAGIC_MESSAGE
    assert fake.read_calls and all(size > 0 for size in fake.read_calls), fake.read_calls
    assert fake.pulled < len(payload), f"端点整读缓冲了完整请求体：{fake.pulled}/{len(payload)}"
    _assert_no_db_residue()


# ── 端点级：存储名闭包（归属目录 + 固定形状 + 强制 .db 后缀）─────


def _capture_import_service(monkeypatch) -> list[Path]:
    captured: list[Path] = []

    def _fake_import(path_str, *_args, **_kwargs):
        captured.append(Path(path_str))
        return SimpleNamespace(project_id=1, project_name="项目A")

    monkeypatch.setattr("src.routers.projects.ProjectDbImportService.import_single_project", _fake_import)
    return captured


def _upload_db(client, filename: str, token: str, content: bytes = _MAGIC + b"\x00stub"):
    return client.post(
        "/api/projects/import/project-db",
        files={"file": (filename, content, "application/octet-stream")},
        headers=auth_headers(token),
    )


def test_db_upload_temp_file_lands_in_owned_dir_with_owned_name(client, monkeypatch):
    token = login_as(client, "alice")
    captured = _capture_import_service(monkeypatch)

    resp = _upload_db(client, "test.db", token)

    assert resp.status_code == 200, resp.text
    assert len(captured) == 1
    stored = captured[0]
    assert stored.parent == Path(DocxImportService.TEMP_DIR), stored
    assert re.fullmatch(_OWNED_NAME_RE, stored.name), stored.name


@pytest.mark.parametrize("filename", ["foo", "foo.backup", "样本"])
def test_suffixless_and_foreign_suffix_uploads_accepted_and_stored_as_upload_db(client, monkeypatch, filename):
    token = login_as(client, "alice")
    captured = _capture_import_service(monkeypatch)

    resp = _upload_db(client, filename, token)

    assert resp.status_code == 200, resp.text
    stored = captured[0]
    assert stored.parent == Path(DocxImportService.TEMP_DIR), stored
    assert re.fullmatch(_OWNED_NAME_RE, stored.name), stored.name


def test_long_filename_db_upload_imports_without_path_errors(client, monkeypatch):
    token = login_as(client, "alice")
    captured = _capture_import_service(monkeypatch)
    long_name = "长" * 300 + ".db"

    resp = _upload_db(client, long_name, token)

    assert resp.status_code == 200, resp.text
    stored = captured[0]
    assert re.fullmatch(_OWNED_NAME_RE, stored.name), stored.name
    assert long_name not in stored.name, "存储名不得携带用户可控文件名成分"


# ── AC2 锚点：正常小文件导入行为不变 ─────────────────────────────


def _create_minimal_export_db(db_path: Path) -> Path:
    engine = create_engine(f"sqlite:///{db_path}")

    @event.listens_for(engine, "connect")
    def _fk(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys = ON")

    Base.metadata.create_all(engine)
    with Session(engine) as session, session.begin():
        user = User(username="export_user")
        session.add(user)
        session.flush()
        session.add(Project(name="导入项目", version="1.0", owner_id=user.id))
    engine.dispose()
    return db_path


def test_normal_small_db_upload_still_imports_end_to_end(client, engine, tmp_path):
    token = login_as(client, "alice")
    db_path = _create_minimal_export_db(tmp_path / "export.db")

    with open(db_path, "rb") as f:
        resp = client.post(
            "/api/projects/import/project-db",
            files={"file": ("test.db", f, "application/octet-stream")},
            headers=auth_headers(token),
        )

    assert resp.status_code == 200, resp.text
    with Session(engine) as session:
        project = session.scalar(select(Project).where(Project.name == "导入项目"))
        alice_id = session.scalar(select(User.id).where(User.username == "alice"))
    assert project is not None
    assert project.owner_id == alice_id
    _assert_no_db_residue()
