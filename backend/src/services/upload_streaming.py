"""共享的流式上传落盘助手（design.md D3b）。

两个上传端点（.db / .docx）唯一的分块循环归属：边读边限长、魔数先于大小、
独占私有创建（0600）、任何失败（含取消，BaseException）都清理半成品文件。
不导入 FastAPI 类型：reader 是结构化的（任何带 ``async read(size)`` 的对象，
UploadFile 满足该形状）；分块写入经 ``fastapi.concurrency.run_in_threadpool``
（与 Starlette 自身对非内存 spool 的写路径一致），读 / 写的 await 都经过
``await_with_drain``（D4 取消完成守卫）。
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Protocol

from fastapi.concurrency import run_in_threadpool

from src.services.await_drain import await_with_drain

logger = logging.getLogger(__name__)

DEFAULT_CHUNK_SIZE = 1024 * 1024


class AsyncReader(Protocol):
    async def read(self, size: int = -1) -> bytes: ...


def _remove_partial(path: Path) -> None:
    """尽力删除半成品文件；删除失败只记警告，绝不掩盖原始错误（24h 清扫兜底）。"""
    try:
        path.unlink(missing_ok=True)
    except OSError:
        logger.warning("清理上传半成品临时文件失败: dir=%s", path.parent)


async def stream_upload_to_file(
    reader: AsyncReader,
    dest_path: Path,
    *,
    max_bytes: int,
    over_limit_message: str,
    magic_prefix: bytes | None = None,
    magic_message: str | None = None,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> int:
    """把 reader 流式写入 dest_path，返回写入字节数；超限 / 魔数不符抛 ValueError。

    独占创建（O_EXCL，0600）：目标已存在直接报 FileExistsError，且绝不删除
    预存在文件。魔数校验在大小上限之前（与既有整读语义一致，EOF 短读兼容，
    不收紧为 16 字节 NUL 结尾）；大小超限在写入溢出块之前即拒绝。
    """
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    # os.open 在 try 之外：创建失败（含 FileExistsError）时绝不进入清理分支，
    # 预存在文件原样保留；进入 try 即表示本调用创建了该文件，失败才可删除。
    fd = os.open(dest_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o600)
    total = 0
    try:
        with os.fdopen(fd, "wb") as handle:
            if magic_prefix is not None:
                header = b""
                while len(header) < len(magic_prefix):
                    chunk = await await_with_drain(reader.read(chunk_size))
                    if not chunk:
                        break  # EOF 短读：与整读时代 content[:16].startswith 语义一致
                    header += chunk
                if not header.startswith(magic_prefix):
                    raise ValueError(magic_message)
                if len(header) > max_bytes:
                    raise ValueError(over_limit_message)
                await await_with_drain(run_in_threadpool(handle.write, header))
                total += len(header)
            while True:
                chunk = await await_with_drain(reader.read(chunk_size))
                if not chunk:
                    break
                if total + len(chunk) > max_bytes:
                    raise ValueError(over_limit_message)
                await await_with_drain(run_in_threadpool(handle.write, chunk))
                total += len(chunk)
            return total
    except BaseException:
        # with 块先关闭句柄再走到这里：POSIX/Windows 都能删除半成品。
        _remove_partial(dest_path)
        raise
