"""流式 docx 上传契约测试（design.md D1/D3b/D6）。

预览端点经 ``stream_upload_to_file`` 边读边限长直写临时文件：带读取计数的
桩锁定「有界分块读取 + 超限提前停止」，取消场景锁定「半成品文件被清理」。
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from helpers import auth_headers, login_as
from src.services.docx_import_service import DocxImportService
from src.services.docx_screenshot_service import DocxScreenshotService

_DOCX_SIZE_MESSAGE = "文件大小超过限制（最大 1MB）"
_TEMP_ID_RE = r"[0-9a-f]{32}"


@pytest.fixture(autouse=True)
def _isolated_temp_dirs(tmp_path, monkeypatch):
    monkeypatch.setattr(DocxImportService, "TEMP_DIR", str(tmp_path / "docx_temp"))
    monkeypatch.setattr(DocxScreenshotService, "BASE_DIR", str(tmp_path / "docx_temp"))
    yield


class _CountedUpload:
    """带读取计数的上传桩：现网 read() 无参整读，流式后 read(chunk) 有界分块。"""

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


class _CancelAfterFirstChunk:
    """第一块正常返回，其后抛 CancelledError 并记录抛出点的目录内容。"""

    def __init__(self, first_chunk: bytes, *, filename: str, dest_dir: Path):
        self.filename = filename
        self._first_chunk = first_chunk
        self._dest_dir = dest_dir
        self._used = False
        self.dir_contents_at_raise: list[str] | None = None

    async def read(self, size: int = -1) -> bytes:
        if not self._used:
            self._used = True
            return self._first_chunk
        self.dir_contents_at_raise = sorted(p.name for p in self._dest_dir.iterdir())
        raise asyncio.CancelledError


def _dummy_request() -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/projects/1/import-docx/preview",
            "headers": [],
            "query_string": b"",
        }
    )


def _patch_preview_collaborators(monkeypatch) -> None:
    """预览端点在保存之后的协作对象：项目归属、解析、AI 与截图启动全部打桩。"""
    monkeypatch.setattr(
        "src.routers.import_docx.verify_project_owner",
        lambda _project_id, _user, _session: SimpleNamespace(db_type=None),
    )
    monkeypatch.setattr(
        "src.routers.import_docx.DocxImportService.parse_full",
        lambda _path, **_kw: [{"name": "表单A", "fields": [{"label": "字段1", "field_type": "文本"}]}],
    )

    async def _fake_start_ai_review(*_args, **_kwargs):
        return None

    monkeypatch.setattr("src.routers.import_docx.start_ai_review", _fake_start_ai_review)
    monkeypatch.setattr(
        "src.routers.import_docx.DocxScreenshotService.start",
        lambda *_args, **_kwargs: SimpleNamespace(status="running"),
    )


def _call_preview(fake_upload):
    from src.routers.import_docx import preview_docx_import

    return preview_docx_import(
        project_id=1,
        request=_dummy_request(),
        file=fake_upload,
        session=None,
        current_user=SimpleNamespace(id=7),
    )


def test_oversized_docx_preview_rejects_without_buffering_whole_body(monkeypatch):
    _patch_preview_collaborators(monkeypatch)
    monkeypatch.setattr(DocxImportService, "MAX_FILE_SIZE", 1024 * 1024)
    payload = b"PK\x03\x04" + b"x" * (3 * 1024 * 1024)
    fake = _CountedUpload(payload, filename="样本.docx")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_call_preview(fake))

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == _DOCX_SIZE_MESSAGE
    assert fake.read_calls and all(size > 0 for size in fake.read_calls), fake.read_calls
    assert fake.pulled < len(payload), f"端点整读缓冲了完整请求体：{fake.pulled}/{len(payload)}"
    temp_dir = Path(DocxImportService.TEMP_DIR)
    leftovers = sorted(p.name for p in temp_dir.iterdir()) if temp_dir.exists() else []
    assert leftovers == [], leftovers


def test_real_multipart_oversized_docx_preview_returns_400_and_leaves_no_temp_file(client, monkeypatch):
    _patch_preview_collaborators(monkeypatch)
    limit = 1024 * 1024
    monkeypatch.setattr(DocxImportService, "MAX_FILE_SIZE", limit)
    token = login_as(client, "alice")
    payload = b"PK\x03\x04" + b"x" * (limit + 1 - 4)

    response = client.post(
        "/api/projects/1/import-docx/preview",
        files={"file": ("sample.docx", payload, "application/octet-stream")},
        headers=auth_headers(token),
    )

    assert response.status_code == 400, response.text
    assert response.json() == {"detail": _DOCX_SIZE_MESSAGE}, response.text
    temp_dir = Path(DocxImportService.TEMP_DIR)
    leftovers = sorted(p.name for p in temp_dir.iterdir()) if temp_dir.exists() else []
    assert leftovers == [], leftovers


def test_normal_docx_preview_reads_in_chunks_and_round_trips(monkeypatch):
    _patch_preview_collaborators(monkeypatch)
    payload = b"PK\x03\x04 fake docx content"
    fake = _CountedUpload(payload, filename="样本.docx")

    response = asyncio.run(_call_preview(fake))

    assert re.fullmatch(_TEMP_ID_RE, response.temp_id), response.temp_id
    assert response.forms and response.forms[0].name == "表单A"
    assert len(fake.read_calls) >= 2, f"必须分块读取而非一次整读：{fake.read_calls}"
    assert all(size > 0 for size in fake.read_calls), fake.read_calls


def test_cancelled_parse_discards_saved_docx_upload(monkeypatch):
    """复审 #7 取消窗口：保存成功后 parse_full 阶段被取消，已落盘上传必须被丢弃。"""
    _patch_preview_collaborators(monkeypatch)

    def _cancelled_parse_full(*_args, **_kwargs):
        raise asyncio.CancelledError

    monkeypatch.setattr("src.routers.import_docx.DocxImportService.parse_full", _cancelled_parse_full)
    fake = _CountedUpload(b"PK\x03\x04 fake docx content", filename="样本.docx")
    temp_dir = Path(DocxImportService.TEMP_DIR)

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(_call_preview(fake))

    leftovers = sorted(p.name for p in temp_dir.iterdir()) if temp_dir.exists() else []
    assert leftovers == [], "取消必须丢弃已落盘的上传文件，不能留作 24h 孤儿"


def test_cancelled_docx_stream_leaves_no_partial_file(monkeypatch):
    _patch_preview_collaborators(monkeypatch)
    temp_dir = Path(DocxImportService.TEMP_DIR)
    temp_dir.mkdir(parents=True, exist_ok=True)
    fake = _CancelAfterFirstChunk(b"PK\x03\x04 first", filename="样本.docx", dest_dir=temp_dir)

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(_call_preview(fake))

    assert fake.dir_contents_at_raise is not None, (
        "取消必须发生在流式写盘中（现网整读后才会落盘，取消根本不会到达写路径）"
    )
    assert fake.dir_contents_at_raise, "取消时半成品文件应已创建"
    leftovers = sorted(p.name for p in temp_dir.iterdir())
    assert leftovers == [], leftovers
