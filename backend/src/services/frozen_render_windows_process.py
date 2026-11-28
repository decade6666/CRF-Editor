"""Private Win32 worker with creation-time job binding and bounded pipe ownership.

Only standard-library APIs; no live app/config or global subprocess patch. The
caller retains the platform gate until real native and windowed proofs pass.
"""

from __future__ import annotations

import ctypes
import os
import queue
import subprocess
import threading
import time
from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from pathlib import Path
from typing import Any, BinaryIO

from . import frozen_render_windows as windows

_HANDLE = ctypes.c_void_p
_DWORD = ctypes.c_uint32
_BOOL = ctypes.c_int32
_SIZE_T = ctypes.c_size_t
_JOB_LIST = 0x2000D
_HANDLE_LIST = 0x20002
_CREATION_FLAGS = 0x80000 | 0x400 | 0x4 | 0x08000000
_MAX_RESPONSE_BYTES = 4096
_CLEANUP_SECONDS = 5.0


class WindowsWorkerUnsupported(OSError):
    """Required creation-time containment is unavailable; no unsafe fallback."""


class _StartupInfo(ctypes.Structure):
    _fields_ = [
        ("cb", _DWORD),
        ("lpReserved", ctypes.c_wchar_p),
        ("lpDesktop", ctypes.c_wchar_p),
        ("lpTitle", ctypes.c_wchar_p),
        ("dwX", _DWORD),
        ("dwY", _DWORD),
        ("dwXSize", _DWORD),
        ("dwYSize", _DWORD),
        ("dwXCountChars", _DWORD),
        ("dwYCountChars", _DWORD),
        ("dwFillAttribute", _DWORD),
        ("dwFlags", _DWORD),
        ("wShowWindow", ctypes.c_uint16),
        ("cbReserved2", ctypes.c_uint16),
        ("lpReserved2", ctypes.POINTER(ctypes.c_ubyte)),
        ("hStdInput", _HANDLE),
        ("hStdOutput", _HANDLE),
        ("hStdError", _HANDLE),
    ]


class _StartupInfoEx(ctypes.Structure):
    _fields_ = [("StartupInfo", _StartupInfo), ("lpAttributeList", ctypes.c_void_p)]


class _ProcessInformation(ctypes.Structure):
    _fields_ = [("hProcess", _HANDLE), ("hThread", _HANDLE), ("dwProcessId", _DWORD), ("dwThreadId", _DWORD)]


def _native_api() -> Any:
    try:
        api = windows._kernel32()
        signatures = (
            ("InitializeProcThreadAttributeList", [ctypes.c_void_p, _DWORD, _DWORD, ctypes.POINTER(_SIZE_T)], _BOOL),
            (
                "UpdateProcThreadAttribute",
                [ctypes.c_void_p, _DWORD, _SIZE_T, ctypes.c_void_p, _SIZE_T, ctypes.c_void_p, ctypes.c_void_p],
                _BOOL,
            ),
            ("DeleteProcThreadAttributeList", [ctypes.c_void_p], None),
            (
                "CreateProcessW",
                [
                    ctypes.c_wchar_p,
                    ctypes.c_wchar_p,
                    ctypes.c_void_p,
                    ctypes.c_void_p,
                    _BOOL,
                    _DWORD,
                    ctypes.c_void_p,
                    ctypes.c_wchar_p,
                    ctypes.c_void_p,
                    ctypes.POINTER(_ProcessInformation),
                ],
                _BOOL,
            ),
            ("WaitForSingleObject", [_HANDLE, _DWORD], _DWORD),
            ("GetExitCodeProcess", [_HANDLE, ctypes.POINTER(_DWORD)], _BOOL),
        )
        for name, arguments, result in signatures:
            function = getattr(api, name)
            function.argtypes, function.restype = arguments, result
        return api
    except (AttributeError, OSError) as exc:
        raise WindowsWorkerUnsupported("Windows 冻结渲染缺少创建时回收接口") from exc


def _duplicate_child_handle(api: Any, stream: BinaryIO, children: ExitStack) -> int:
    import msvcrt

    duplicate = _HANDLE()
    current = api.GetCurrentProcess()
    if not api.DuplicateHandle(
        current, msvcrt.get_osfhandle(stream.fileno()), current, ctypes.byref(duplicate), 0, True, 2
    ):
        raise windows._api_error("DuplicateHandle(child)")
    if not windows._valid_handle(duplicate.value):
        raise OSError("Windows 冻结渲染子管道句柄无效")
    children.callback(windows._close_handle, api, duplicate.value)
    return duplicate.value


def _open_pipe(resources: ExitStack) -> tuple[BinaryIO, BinaryIO]:
    reader, writer = os.pipe()
    try:
        source = resources.enter_context(os.fdopen(reader, "rb", buffering=0))
    except BaseException:
        os.close(reader)
        os.close(writer)
        raise
    try:
        sink = resources.enter_context(os.fdopen(writer, "wb", buffering=0))
    except BaseException:
        os.close(writer)
        raise
    return source, sink


def _worker_pipes(api: Any, resources: ExitStack, children: ExitStack) -> tuple[BinaryIO, BinaryIO, list[int]]:
    child_input, parent_input = _open_pipe(resources)
    parent_output, child_output = _open_pipe(resources)
    child_error = resources.enter_context(open(os.devnull, "wb", buffering=0))
    handles = [_duplicate_child_handle(api, stream, children) for stream in (child_input, child_output, child_error)]
    child_input.close()
    child_output.close()
    child_error.close()
    return parent_input, parent_output, handles


@contextmanager
def _attributes(api: Any, job: int, handles: list[int]) -> Iterator[Any]:
    size = _SIZE_T()
    probe = api.InitializeProcThreadAttributeList(None, 2, 0, ctypes.byref(size))
    if probe or ctypes.get_last_error() != 122 or not 0 < size.value <= 65536:
        raise windows._api_error("InitializeProcThreadAttributeList(size)")
    buffer = ctypes.create_string_buffer(size.value)
    if not api.InitializeProcThreadAttributeList(buffer, 2, 0, ctypes.byref(size)):
        raise windows._api_error("InitializeProcThreadAttributeList")
    try:
        # Attribute storage must remain alive until DeleteProcThreadAttributeList.
        jobs = (_HANDLE * 1)(job)
        inherited = (_HANDLE * len(handles))(*handles)
        for kind, values in ((_JOB_LIST, jobs), (_HANDLE_LIST, inherited)):
            if not api.UpdateProcThreadAttribute(buffer, 0, kind, values, ctypes.sizeof(values), None, None):
                if kind == _JOB_LIST and ctypes.get_last_error() in (50, 87):
                    raise WindowsWorkerUnsupported("Windows 不支持创建时绑定回收组")
                raise windows._api_error("UpdateProcThreadAttribute")
        yield buffer
    finally:
        api.DeleteProcThreadAttributeList(buffer)


def _create_suspended(
    api: Any,
    job: int,
    command: list[str],
    cwd: Path,
    env: dict[str, str],
    handles: list[int],
    info: _ProcessInformation,
) -> None:
    with _attributes(api, job, handles) as attributes:
        startup = _StartupInfoEx()
        startup.StartupInfo.cb = ctypes.sizeof(startup)
        startup.StartupInfo.dwFlags = 0x100 | 1  # USESTDHANDLES | USESHOWWINDOW, SW_HIDE
        startup.StartupInfo.hStdInput, startup.StartupInfo.hStdOutput, startup.StartupInfo.hStdError = handles
        startup.lpAttributeList = ctypes.addressof(attributes)
        arguments = ctypes.create_unicode_buffer(subprocess.list2cmdline(command))
        environment = ctypes.create_unicode_buffer(
            "\0".join(f"{key}={value}" for key, value in sorted(env.items(), key=lambda item: item[0].upper())) + "\0\0"
        )
        if not api.CreateProcessW(
            command[0],
            arguments,
            None,
            None,
            True,
            _CREATION_FLAGS,
            environment,
            str(cwd),
            ctypes.byref(startup),
            ctypes.byref(info),
        ):
            raise windows._api_error("CreateProcessW")


def _wait_exit(api: Any, handle: int, seconds: float) -> int:
    state = api.WaitForSingleObject(handle, max(0, int(seconds * 1000)))
    if state == 258:
        return state
    if state != 0:
        raise windows._api_error("WaitForSingleObject")
    return state


class WindowsFrozenWorker:
    """Own a single admitted tree and at most two bounded protocol I/O threads."""

    def __init__(
        self, api: Any, job: int, info: _ProcessInformation, command: list[str], source: BinaryIO, output: BinaryIO
    ) -> None:
        self._api, self._job, self._info = api, job, info
        self._command, self._input, self._output = command, source, output
        self._response = bytearray()
        self._errors: queue.Queue[BaseException] = queue.Queue()
        self._threads: list[threading.Thread] = []
        self._stopping = False
        self.pid = info.dwProcessId
        self.returncode: int | None = None

    def kill(self) -> None:
        self._stopping = True
        self._close_job()

    def _close_job(self) -> None:
        if self._job is not None:
            job, self._job = self._job, None
            windows._close_job(self._api, job)

    def _write_input(self, data: bytes) -> None:
        try:
            view = memoryview(data)
            while view:
                written = self._input.write(view[:65536])
                if written is None or written <= 0:
                    raise OSError("Windows 冻结渲染管道未写入")
                view = view[written:]
        except BaseException as exc:
            self._errors.put(exc)
        finally:
            try:
                self._input.close()
            except BaseException as exc:
                self._errors.put(exc)

    def _read_output(self) -> None:
        try:
            while True:
                chunk = self._output.read(_MAX_RESPONSE_BYTES + 1 - len(self._response))
                if not chunk:
                    return
                self._response.extend(chunk)
                if len(self._response) > _MAX_RESPONSE_BYTES:
                    raise OSError("Windows 冻结渲染诊断超出上限")
        except BaseException as exc:
            self._errors.put(exc)

    def _start_io(self, data: bytes) -> None:
        threads = [
            threading.Thread(target=self._write_input, args=(data,), daemon=True),
            threading.Thread(target=self._read_output, daemon=True),
        ]
        for thread in threads:
            thread.start()
            self._threads.append(thread)

    def _check_error(self) -> None:
        if not self._stopping:
            try:
                error = self._errors.get_nowait()
            except queue.Empty:
                return
            raise OSError("Windows 冻结渲染管道通信失败") from error

    def _join_io(self) -> None:
        deadline = time.monotonic() + _CLEANUP_SECONDS
        for thread in self._threads:
            thread.join(timeout=max(0, deadline - time.monotonic()))
        if any(thread.is_alive() for thread in self._threads):
            raise OSError("Windows 冻结渲染管道未能结束")

    def communicate(self, input: bytes | None = None, timeout: float | None = None) -> tuple[bytes, None]:
        if not self._threads:
            self._start_io(input or b"")
        elif input is not None:
            raise ValueError("冻结渲染输入不能重复发送")
        seconds = _CLEANUP_SECONDS if timeout is None else timeout
        deadline = time.monotonic() + seconds
        while True:
            self._check_error()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise subprocess.TimeoutExpired(self._command, seconds)
            if _wait_exit(self._api, self._info.hProcess, min(remaining, 0.05)) == 0:
                break
        self._check_error()
        # A root may exit while descendants still hold pipes. End the job before
        # waiting for EOF; this also bounds onefile bootloader descendants.
        self._close_job()
        self._join_io()
        self._check_error()
        code = _DWORD()
        if not self._api.GetExitCodeProcess(self._info.hProcess, ctypes.byref(code)):
            raise windows._api_error("GetExitCodeProcess")
        self.returncode = code.value
        if len(self._response) > _MAX_RESPONSE_BYTES:
            raise OSError("Windows 冻结渲染诊断超出上限")
        return bytes(self._response), None


def _new_job(api: Any) -> int:
    job = api.CreateJobObjectW(None, None)
    if not windows._valid_handle(job):
        raise windows._api_error("CreateJobObjectW")
    try:
        limits = windows._ExtendedLimits()
        limits.BasicLimitInformation.LimitFlags = 0x2000
        if not api.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            raise windows._api_error("SetInformationJobObject")
        return job
    except BaseException:
        windows._close_job(api, job)
        raise


def _release(api: Any, job: int, info: _ProcessInformation, process: WindowsFrozenWorker | None) -> None:
    with ExitStack() as handles:
        if windows._valid_handle(info.hProcess):
            handles.callback(windows._close_handle, api, info.hProcess)
        if windows._valid_handle(info.hThread):
            handles.callback(windows._close_handle, api, info.hThread)
        try:
            if process is None:
                windows._close_job(api, job)
            else:
                process.kill()
        finally:
            if windows._valid_handle(info.hProcess):
                if _wait_exit(api, info.hProcess, _CLEANUP_SECONDS) != 0:
                    raise OSError("Windows 冻结渲染子进程未能退出")
            if process is not None:
                process._join_io()


@contextmanager
def open_windows_worker(command: list[str], *, cwd: Path, env: dict[str, str]) -> Iterator[WindowsFrozenWorker]:
    """Create in the job atomically; unsupported setup never uses ordinary Popen."""
    api = _native_api()
    with ExitStack() as resources:
        job = _new_job(api)
        info = _ProcessInformation()
        process = None
        try:
            with ExitStack() as children:
                source, output, handles = _worker_pipes(api, resources, children)
                _create_suspended(api, job, command, cwd, env, handles, info)
            process = WindowsFrozenWorker(api, job, info, command, source, output)
            if api.ResumeThread(info.hThread) != 1:
                raise windows._api_error("ResumeThread")
            thread, info.hThread = info.hThread, None
            windows._close_handle(api, thread)
            yield process
        finally:
            _release(api, job, info, process)
