"""Private archive storage: opaque identities, exact reads and explicit cleanup only."""

from __future__ import annotations

import hashlib
import logging
import os
import re
import shutil
import stat
import threading
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from src.config import AppConfig
from src.services.design_snapshot_service import SnapshotError
from src.services.frozen_render_service import MAX_ORIGINAL_BYTES

logger = logging.getLogger(__name__)
MIN_FREE_BYTES = 1024 * 1024 * 1024
_KEY = re.compile(r"[0-9a-f]{32}\Z")
_HASH = re.compile(r"[0-9a-f]{64}\Z")
_KNOWN_FILES = frozenset({"ecrf.docx", "acrf.docx", "logo.bitmap"})
_PUBLICATION_LOCK = threading.Lock()
_LEASE_LOCK = threading.RLock()
_HAS_DIRECTORY_FDS = all(function in os.supports_dir_fd for function in (os.open, os.stat, os.unlink, os.rmdir))


@dataclass(frozen=True)
class Stage:
    root: Path
    key: str

    @property
    def directory(self) -> Path:
        return self.root / "staging" / self.key


@dataclass
class _Lease:
    readers: int = 0
    remover: int | None = None
    depth: int = 0


_LEASES: dict[tuple[Path, str], _Lease] = {}


def _failure(code: str = "BASELINE_STORAGE_INVALID", status: int = 500) -> SnapshotError:
    messages = {
        "BASELINE_STORAGE_INVALID": "留档存储不可安全使用，请联系管理员",
        "BASELINE_STORAGE_FULL": "留档存储空间不足，未删除任何既有留档",
        "BASELINE_INTEGRITY_FAILED": "保存的原件缺失或校验失败，不能下载",
        "BASELINE_BUSY": "留档正在读取或处理中，请稍后重试",
    }
    return SnapshotError(messages[code], code, status)


def _key(value: str) -> str:
    if not isinstance(value, str) or not _KEY.fullmatch(value):
        raise _failure()
    return value


def _absolute(path: Path) -> Path:
    return Path(os.path.abspath(path))


def _check_directory(path: Path, *, create: bool = False) -> Path:
    """Never resolve through a symlink, including intermediate components."""
    path = _absolute(path)
    for part in (*reversed(path.parents), path):
        try:
            info = part.lstat()
        except FileNotFoundError:
            if not create:
                raise
            part.mkdir(mode=0o700)
            info = part.lstat()
        if not stat.S_ISDIR(info.st_mode):
            raise _failure()
    return path


def _overlaps(left: Path, right: Path) -> bool:
    return left.is_relative_to(right) or right.is_relative_to(left)


def history_root(config: AppConfig) -> Path:
    """Create only this private root; never read application data or public assets."""
    try:
        root = _absolute(Path(config.design_history_path))
        db_path = Path(config.db_path)
        repo = Path(__file__).resolve().parents[3]
        excluded = (Path(config.upload_path), repo / "frontend", repo / "assets", repo / "backend" / "uploads")
        static = os.environ.get("CRF_STATIC_DIR")
        if static:
            excluded = (*excluded, _absolute(Path(static)))
        if db_path.is_relative_to(root) or any(_overlaps(root, path) for path in excluded):
            raise _failure()
        _check_directory(root, create=True)
        for name in ("staging", "objects"):
            _check_directory(root / name, create=True)
        return root
    except SnapshotError:
        raise
    except (OSError, ValueError) as exc:
        raise _failure() from exc


def prepare_stage(config: AppConfig) -> Stage:
    root = history_root(config)
    try:
        if shutil.disk_usage(root).free < MIN_FREE_BYTES:
            raise _failure("BASELINE_STORAGE_FULL", 507)
        stage = Stage(root, uuid.uuid4().hex)
        stage.directory.mkdir(mode=0o700)
        return stage
    except SnapshotError:
        raise
    except OSError as exc:
        raise _failure() from exc


def publish_stage(stage: Stage) -> Path:
    """Publish under a fresh server identity, never replace an existing object."""
    _key(stage.key)
    try:
        with _PUBLICATION_LOCK:
            root = _check_directory(stage.root)
            source = _check_directory(root / "staging" / stage.key)
            target = _check_directory(root / "objects") / stage.key
            if os.path.lexists(target):
                raise _failure()
            # A private root, opaque server identity and process lock exclude other
            # application publishers. DB completion follows this atomic rename.
            source.rename(target)
            return target
    except SnapshotError:
        raise
    except (OSError, ValueError) as exc:
        raise _failure() from exc


@contextmanager
def _lease(root: Path, key: str, *, remove: bool) -> Iterator[None]:
    identity = (_absolute(root), _key(key))
    owner = threading.get_ident()
    with _LEASE_LOCK:
        state = _LEASES.setdefault(identity, _Lease())
        if (remove and (state.readers or state.remover not in (None, owner))) or (
            not remove and state.remover is not None
        ):
            raise _failure("BASELINE_BUSY", 409)
        if remove:
            state.remover, state.depth = owner, state.depth + 1
        else:
            state.readers += 1
    try:
        yield
    finally:
        with _LEASE_LOCK:
            if remove:
                state.depth -= 1
                if not state.depth:
                    state.remover = None
            else:
                state.readers -= 1
            if not state.readers and state.remover is None:
                _LEASES.pop(identity, None)


@contextmanager
def history_access(root: Path, key: str) -> Iterator[None]:
    """Hold across authorization/metadata lookup and the exact retained-byte read."""
    with _lease(root, key, remove=False):
        yield


@contextmanager
def history_removal(root: Path, key: str) -> Iterator[None]:
    """Hold across the DB transaction and subsequent post-commit unlink."""
    with _lease(root, key, remove=True):
        yield


def _identity(info: os.stat_result) -> tuple[int, ...]:
    return (info.st_dev, info.st_ino, info.st_size, info.st_nlink, info.st_mtime_ns, info.st_ctime_ns)


def _read_verified(path: Path, expected_sha256: str, expected_bytes: int) -> bytes:
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size != expected_bytes:
        raise _failure("BASELINE_INTEGRITY_FAILED")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_BINARY", 0))
    with os.fdopen(descriptor, "rb") as stream:
        if _identity(os.fstat(stream.fileno())) != _identity(before):
            raise _failure("BASELINE_INTEGRITY_FAILED")
        content = stream.read(expected_bytes + 1)
        after = os.fstat(stream.fileno())
    if (
        len(content) != expected_bytes
        or _identity(after) != _identity(before)
        or _identity(path.lstat()) != _identity(before)
    ):
        raise _failure("BASELINE_INTEGRITY_FAILED")
    if hashlib.sha256(content).hexdigest() != expected_sha256:
        raise _failure("BASELINE_INTEGRITY_FAILED")
    return content


def read_original(root: Path, key: str, kind: str, expected_sha256: str, expected_bytes: int) -> bytes:
    _key(key)
    if kind not in {"ecrf", "acrf"} or not isinstance(expected_sha256, str) or not _HASH.fullmatch(expected_sha256):
        raise _failure("BASELINE_INTEGRITY_FAILED")
    if type(expected_bytes) is not int or not 0 < expected_bytes <= MAX_ORIGINAL_BYTES:
        raise _failure("BASELINE_INTEGRITY_FAILED")
    try:
        with history_access(root, key):
            directory = _check_directory(_absolute(root) / "objects" / key)
            return _read_verified(directory / f"{kind}.docx", expected_sha256, expected_bytes)
    except SnapshotError:
        raise
    except (OSError, ValueError) as exc:
        raise _failure("BASELINE_INTEGRITY_FAILED") from exc


@contextmanager
def _directory_handle(path: Path | str, *, parent_fd: int | None = None) -> Iterator[int]:
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    if parent_fd is not None:
        descriptor = os.open(path, flags, dir_fd=parent_fd)
    else:
        absolute = _absolute(Path(path))
        descriptor = os.open(absolute.anchor, flags)
        try:
            for component in absolute.parts[1:]:
                child = os.open(component, flags, dir_fd=descriptor)
                os.close(descriptor)
                descriptor = child
        except BaseException:
            os.close(descriptor)
            raise
    try:
        yield descriptor
    finally:
        os.close(descriptor)


def _unlink_known_directory(parent: Path, key: str) -> None:
    # Without pinned directory handles a concurrent link replacement could
    # redirect unlink outside the archive. Retain an observable orphan instead.
    if not _HAS_DIRECTORY_FDS:
        raise _failure()
    with _directory_handle(parent) as parent_fd, _directory_handle(key, parent_fd=parent_fd) as directory_fd:
        directory_info = os.fstat(directory_fd)
        entries = {name: os.stat(name, dir_fd=directory_fd, follow_symlinks=False) for name in os.listdir(directory_fd)}
        if any(
            name not in _KNOWN_FILES or not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
            for name, info in entries.items()
        ):
            raise _failure()
        for name, before in entries.items():
            if _identity(os.stat(name, dir_fd=directory_fd, follow_symlinks=False)) != _identity(before):
                raise _failure()
            os.unlink(name, dir_fd=directory_fd)
        current = os.stat(key, dir_fd=parent_fd, follow_symlinks=False)
        if not stat.S_ISDIR(current.st_mode) or (current.st_dev, current.st_ino) != (
            directory_info.st_dev,
            directory_info.st_ino,
        ):
            raise _failure()
        os.rmdir(key, dir_fd=parent_fd)


def _cleanup(root: Path, key: str, area: str) -> bool:
    """All entries are inspected before any unlink; unknown/shared files survive."""
    try:
        _key(key)
        with history_removal(root, key):
            parent = _check_directory(_absolute(root) / area)
            if not os.path.lexists(parent / key):
                return True
            _unlink_known_directory(parent, key)
            return True
    except (SnapshotError, OSError, ValueError):
        logger.warning(
            "留档文件清理未完成 key=%s area=%s",
            key if isinstance(key, str) and _KEY.fullmatch(key) else "invalid",
            area,
        )
        return False


def cleanup_published(root: Path, key: str) -> bool:
    """Call only after successful DB deletion; no retention/automatic sweeping."""
    return _cleanup(root, key, "objects")


def cleanup_stage(stage: Stage) -> bool:
    """Compensate only the stage created by the current failed capture."""
    return _cleanup(stage.root, stage.key, "staging")
