"""Windows-only containment and inherited-pipe ownership for the frozen worker.

No app/config imports, global stdio replacement, breakaway, or privilege changes.
Win32 bindings are lazy so importing the service remains safe on other platforms.
"""

from __future__ import annotations

import ctypes
import io
import os
import subprocess
import sys
from collections.abc import Iterator
from contextlib import AbstractContextManager, ExitStack, contextmanager
from pathlib import Path
from typing import Any, BinaryIO, TextIO, cast

_DWORD = ctypes.c_uint32
_LONG = ctypes.c_int32
_BOOL = ctypes.c_int32
_HANDLE = ctypes.c_void_p
_SIZE_T = ctypes.c_size_t
_INVALID_HANDLE = ctypes.c_void_p(-1).value
_ERROR_NO_MORE_FILES = 18


class _BasicLimits(ctypes.Structure):
    _fields_ = [
        ("PerProcessUserTimeLimit", ctypes.c_int64),
        ("PerJobUserTimeLimit", ctypes.c_int64),
        ("LimitFlags", _DWORD),
        ("MinimumWorkingSetSize", _SIZE_T),
        ("MaximumWorkingSetSize", _SIZE_T),
        ("ActiveProcessLimit", _DWORD),
        ("Affinity", _SIZE_T),
        ("PriorityClass", _DWORD),
        ("SchedulingClass", _DWORD),
    ]


class _IoCounters(ctypes.Structure):
    _fields_ = [
        ("ReadOperationCount", ctypes.c_uint64),
        ("WriteOperationCount", ctypes.c_uint64),
        ("OtherOperationCount", ctypes.c_uint64),
        ("ReadTransferCount", ctypes.c_uint64),
        ("WriteTransferCount", ctypes.c_uint64),
        ("OtherTransferCount", ctypes.c_uint64),
    ]


class _ExtendedLimits(ctypes.Structure):
    _fields_ = [
        ("BasicLimitInformation", _BasicLimits),
        ("IoInfo", _IoCounters),
        ("ProcessMemoryLimit", _SIZE_T),
        ("JobMemoryLimit", _SIZE_T),
        ("PeakProcessMemoryUsed", _SIZE_T),
        ("PeakJobMemoryUsed", _SIZE_T),
    ]


class _ThreadEntry(ctypes.Structure):
    _fields_ = [
        ("dwSize", _DWORD),
        ("cntUsage", _DWORD),
        ("th32ThreadID", _DWORD),
        ("th32OwnerProcessID", _DWORD),
        ("tpBasePri", _LONG),
        ("tpDeltaPri", _LONG),
        ("dwFlags", _DWORD),
    ]


def _kernel32() -> Any:
    if sys.platform != "win32":
        raise OSError("冻结渲染 Windows 控制接口不可用")
    try:
        return _bind_kernel32()
    except (AttributeError, OSError) as exc:
        raise OSError("冻结渲染 Windows 控制接口不完整") from exc


def _bind_kernel32() -> Any:
    api = ctypes.WinDLL("kernel32", use_last_error=True)
    signatures = (
        ("CreateJobObjectW", [ctypes.c_void_p, ctypes.c_wchar_p], _HANDLE),
        ("SetInformationJobObject", [_HANDLE, ctypes.c_int32, ctypes.c_void_p, _DWORD], _BOOL),
        ("AssignProcessToJobObject", [_HANDLE, _HANDLE], _BOOL),
        ("CloseHandle", [_HANDLE], _BOOL),
        ("TerminateJobObject", [_HANDLE, _DWORD], _BOOL),
        ("CreateToolhelp32Snapshot", [_DWORD, _DWORD], _HANDLE),
        ("Thread32First", [_HANDLE, ctypes.POINTER(_ThreadEntry)], _BOOL),
        ("Thread32Next", [_HANDLE, ctypes.POINTER(_ThreadEntry)], _BOOL),
        ("OpenThread", [_DWORD, _BOOL, _DWORD], _HANDLE),
        ("GetProcessIdOfThread", [_HANDLE], _DWORD),
        ("ResumeThread", [_HANDLE], _DWORD),
        ("GetStdHandle", [_DWORD], _HANDLE),
        ("GetFileType", [_HANDLE], _DWORD),
        ("GetCurrentProcess", [], _HANDLE),
        ("DuplicateHandle", [_HANDLE, _HANDLE, _HANDLE, ctypes.POINTER(_HANDLE), _DWORD, _BOOL, _DWORD], _BOOL),
    )
    for name, arguments, result in signatures:
        function = getattr(api, name)
        function.argtypes = arguments
        function.restype = result
    return api


def _api_error(operation: str) -> OSError:
    return OSError(ctypes.get_last_error(), f"冻结渲染 Windows 接口失败：{operation}")


def _valid_handle(handle: int | None) -> bool:
    return handle not in (None, 0, -1, _INVALID_HANDLE)


def _close_handle(api: Any, handle: int) -> None:
    if not api.CloseHandle(handle):
        raise _api_error("CloseHandle")


def _close_job(api: Any, job: int) -> None:
    if api.CloseHandle(job):
        return
    error = _api_error("CloseHandle(job)")
    # Only this newly created job is targeted. Never hide a failed teardown.
    try:
        if not api.TerminateJobObject(job, 1):
            raise _api_error("TerminateJobObject")
    finally:
        _close_handle(api, job)
    raise error


def _initial_thread_id(api: Any, pid: int) -> int:
    snapshot = api.CreateToolhelp32Snapshot(0x4, 0)  # TH32CS_SNAPTHREAD
    if not _valid_handle(snapshot):
        raise _api_error("CreateToolhelp32Snapshot")
    with ExitStack() as handles:
        handles.callback(_close_handle, api, snapshot)
        entry = _ThreadEntry()
        entry.dwSize = ctypes.sizeof(entry)
        available = api.Thread32First(snapshot, ctypes.byref(entry))
        matches: list[int] = []
        while available:
            if entry.dwSize < _ThreadEntry.th32OwnerProcessID.offset + ctypes.sizeof(_DWORD):
                raise OSError("冻结渲染线程快照不完整")
            if entry.th32OwnerProcessID == pid:
                matches.append(entry.th32ThreadID)
            entry.dwSize = ctypes.sizeof(entry)
            available = api.Thread32Next(snapshot, ctypes.byref(entry))
        if ctypes.get_last_error() != _ERROR_NO_MORE_FILES:
            raise _api_error("Thread32First/Next")
        if len(matches) != 1:
            raise OSError("冻结渲染子进程没有唯一初始线程")
        return matches[0]


def _resume_owned_thread(api: Any, pid: int) -> None:
    thread_id = _initial_thread_id(api, pid)
    # Limited query access also verifies ownership after the snapshot/open gap.
    thread = api.OpenThread(0x802, False, thread_id)  # SUSPEND_RESUME | QUERY_LIMITED_INFORMATION
    if not _valid_handle(thread):
        raise _api_error("OpenThread")
    try:
        owner = api.GetProcessIdOfThread(thread)
        if not owner:
            raise _api_error("GetProcessIdOfThread")
        if owner != pid:
            raise OSError("冻结渲染初始线程归属已改变")
        previous_count = api.ResumeThread(thread)
        if previous_count == 0xFFFFFFFF:
            raise _api_error("ResumeThread")
        if previous_count != 1:
            raise OSError("冻结渲染初始线程挂起状态异常")
    finally:
        _close_handle(api, thread)


def _reap_failed_admission(process: subprocess.Popen[bytes]) -> None:
    try:
        process.kill()
    finally:
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired as exc:
            raise OSError("冻结渲染未接纳子进程未能退出") from exc


@contextmanager
def windows_worker_job(process: subprocess.Popen[bytes]) -> Iterator[None]:
    """Admit our own CREATE_SUSPENDED Popen before its initial thread can run.

    The caller MUST create a new owned worker with creationflags=0x4 and retain
    its Popen handle. That borrowed handle is never closed or reopened by PID.
    Closing the non-inheritable job terminates all admitted descendants, also
    when the parent exits. Failed admission kills/reaps only this owned worker.
    """
    with ExitStack() as handles:
        try:
            api = _kernel32()
            job = api.CreateJobObjectW(None, None)
            if not _valid_handle(job):
                raise _api_error("CreateJobObjectW")
            handles.callback(_close_job, api, job)
            limits = _ExtendedLimits()
            limits.BasicLimitInformation.LimitFlags = 0x2000  # KILL_ON_JOB_CLOSE
            if not api.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
                raise _api_error("SetInformationJobObject")
            process_handle = getattr(process, "_handle", None)
            if not _valid_handle(process_handle):
                raise OSError("冻结渲染自有子进程句柄不可用")
            if not api.AssignProcessToJobObject(job, process_handle):
                raise _api_error("AssignProcessToJobObject")
            _resume_owned_thread(api, process.pid)
        except BaseException:
            _reap_failed_admission(process)
            raise
        yield


def _recover_pipe(api: Any, selector: int, *, writing: bool) -> BinaryIO:
    import msvcrt

    original = api.GetStdHandle(selector & 0xFFFFFFFF)
    if not _valid_handle(original):
        raise OSError("冻结渲染缺少继承的标准管道")
    if api.GetFileType(original) != 0x3:  # FILE_TYPE_PIPE only
        raise OSError("冻结渲染标准句柄不是管道")
    duplicate = _HANDLE()
    current_process = api.GetCurrentProcess()
    if not api.DuplicateHandle(current_process, original, current_process, ctypes.byref(duplicate), 0, False, 2):
        raise _api_error("DuplicateHandle")
    if not _valid_handle(duplicate.value):
        raise OSError("冻结渲染管道副本句柄无效")
    try:
        flags = (os.O_WRONLY if writing else os.O_RDONLY) | 0x8000  # O_BINARY
        descriptor = msvcrt.open_osfhandle(duplicate.value, flags)
    except BaseException:
        _close_handle(api, duplicate.value)
        raise
    try:
        return cast(BinaryIO, open(descriptor, "wb" if writing else "rb"))
    except BaseException:
        os.close(descriptor)  # The CRT owns the duplicate after open_osfhandle.
        raise


@contextmanager
def worker_standard_streams() -> Iterator[tuple[BinaryIO, TextIO]]:
    """Borrow existing Python stdio, or own only duplicates of inherited pipes."""
    stdin = getattr(sys.stdin, "buffer", None)
    stdout = sys.stdout
    if sys.stdin is not None and stdin is None:
        raise OSError("冻结渲染标准输入不支持二进制读取")
    if getattr(stdin, "closed", False) or getattr(stdout, "closed", False):
        raise OSError("冻结渲染标准管道已经关闭")
    with ExitStack() as recovered:
        if stdin is None or stdout is None:
            api = _kernel32()
            if stdin is None:
                stdin = recovered.enter_context(_recover_pipe(api, -10, writing=False))
            if stdout is None:
                binary_stdout = recovered.enter_context(_recover_pipe(api, -11, writing=True))
                stdout = recovered.enter_context(io.TextIOWrapper(binary_stdout, encoding="utf-8", newline="\n"))
        yield stdin, stdout


def windows_worker_process(command: list[str], *, cwd: Path, env: dict[str, str]) -> AbstractContextManager[Any]:
    """Private parent adapter; creation-time containment, never post-create admission."""
    from .frozen_render_windows_process import open_windows_worker

    return open_windows_worker(command, cwd=cwd, env=env)
