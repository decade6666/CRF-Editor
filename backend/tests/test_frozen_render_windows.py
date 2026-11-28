"""Win32 boundaries are exercised with external API fakes, never helper mocks."""

from __future__ import annotations

import ctypes
import io
import os
import subprocess
import sys
from collections.abc import Callable, Iterator
from types import ModuleType, SimpleNamespace
from typing import Any

import pytest

from src.services import frozen_render_windows as windows

pytestmark = pytest.mark.unit


class ThreadEntry(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_uint32),
        ("cntUsage", ctypes.c_uint32),
        ("th32ThreadID", ctypes.c_uint32),
        ("th32OwnerProcessID", ctypes.c_uint32),
        ("tpBasePri", ctypes.c_int32),
        ("tpDeltaPri", ctypes.c_int32),
        ("dwFlags", ctypes.c_uint32),
    ]


class ApiFunction:
    def __init__(self, implementation: Callable[..., Any]) -> None:
        self.implementation = implementation
        self.argtypes: list[Any] = []
        self.restype: Any = None

    def __call__(self, *args: Any) -> Any:
        return self.implementation(*args)


class OwnedProcess:
    pid = 3021
    _handle = 0x100000123

    def __init__(self) -> None:
        self.actions: list[str] = []
        self.kill_error: Exception | None = None
        self.wait_error: Exception | None = None

    def kill(self) -> None:
        self.actions.append("kill")
        if self.kill_error:
            raise self.kill_error

    def wait(self, timeout: float | None = None) -> int:
        assert timeout is not None and 0 < timeout <= 5
        self.actions.append("wait")
        if self.wait_error:
            raise self.wait_error
        return 1


class Kernel32:
    job = 0x200000123
    snapshot = 0x300000123
    thread = 0x400000123
    current_process = -1

    def __init__(self) -> None:
        self.events: list[tuple[Any, ...]] = []
        self.failures: set[str] = set()
        self.close_failures: dict[int, int] = {}
        self.error = 5
        self.entries = [(100, 888), (OwnedProcess.pid, 777), (555, 999)]
        self.thread_owner = OwnedProcess.pid
        self.resume_count = 1
        self.entry_size = ctypes.sizeof(ThreadEntry)
        self.enumeration_index = 0
        self.std_handles = {-10: 0, -11: 0}
        self.file_types: dict[int, int] = {}
        self.duplicates: list[int] = []
        names = (
            "CreateJobObjectW",
            "SetInformationJobObject",
            "AssignProcessToJobObject",
            "CloseHandle",
            "TerminateJobObject",
            "CreateToolhelp32Snapshot",
            "Thread32First",
            "Thread32Next",
            "OpenThread",
            "GetProcessIdOfThread",
            "ResumeThread",
            "GetStdHandle",
            "GetFileType",
            "GetCurrentProcess",
            "DuplicateHandle",
        )
        for name in names:
            setattr(self, name, ApiFunction(getattr(self, "api_" + name)))

    def api_CreateJobObjectW(self, attributes: Any, name: Any) -> int:
        self.events.append(("create_job", attributes, name))
        return 0 if "create_job" in self.failures else self.job

    def api_SetInformationJobObject(self, job: int, kind: int, limits: Any, size: int) -> int:
        raw = ctypes.string_at(limits, size)
        assert job == self.job and kind == 9
        assert size == (144 if ctypes.sizeof(ctypes.c_void_p) == 8 else 112)
        assert int.from_bytes(raw[16:20], "little") == 0x2000
        self.events.append(("set_limits",))
        return int("set_limits" not in self.failures)

    def api_AssignProcessToJobObject(self, job: int, process: int) -> int:
        assert job == self.job and process == OwnedProcess._handle
        self.events.append(("assign", process))
        return int("assign" not in self.failures)

    def api_CloseHandle(self, handle: int) -> int:
        self.events.append(("close", handle))
        if self.close_failures.get(handle, 0):
            self.close_failures[handle] -= 1
            return 0
        if handle in self.duplicates:
            os.close(handle)
        return 1

    def api_TerminateJobObject(self, job: int, code: int) -> int:
        self.events.append(("terminate_job", job, code))
        return int("terminate_job" not in self.failures)

    def api_CreateToolhelp32Snapshot(self, flags: int, pid: int) -> int:
        assert flags == 4 and pid == 0
        self.events.append(("snapshot",))
        return ctypes.c_void_p(-1).value if "snapshot" in self.failures else self.snapshot

    def _write_entry(self, pointer: Any) -> int:
        entry = ctypes.cast(pointer, ctypes.POINTER(ThreadEntry)).contents
        assert entry.dwSize == ctypes.sizeof(ThreadEntry)
        if self.enumeration_index >= len(self.entries):
            self.error = 18
            return 0
        pid, tid = self.entries[self.enumeration_index]
        entry.th32OwnerProcessID = pid
        entry.th32ThreadID = tid
        entry.dwSize = self.entry_size
        return 1

    def api_Thread32First(self, snapshot: int, pointer: Any) -> int:
        assert snapshot == self.snapshot
        self.events.append(("first",))
        self.enumeration_index = 0
        return 0 if "first" in self.failures else self._write_entry(pointer)

    def api_Thread32Next(self, snapshot: int, pointer: Any) -> int:
        assert snapshot == self.snapshot
        self.events.append(("next",))
        self.enumeration_index += 1
        return 0 if "next" in self.failures else self._write_entry(pointer)

    def api_OpenThread(self, access: int, inherit: bool, tid: int) -> int:
        self.events.append(("open_thread", access, inherit, tid))
        return 0 if "open_thread" in self.failures else self.thread

    def api_GetProcessIdOfThread(self, thread: int) -> int:
        assert thread == self.thread
        self.events.append(("thread_owner",))
        return 0 if "thread_owner" in self.failures else self.thread_owner

    def api_ResumeThread(self, thread: int) -> int:
        assert thread == self.thread
        self.events.append(("resume",))
        return self.resume_count

    def api_GetStdHandle(self, selector: int) -> int:
        self.events.append(("std_handle", selector))
        return self.std_handles[ctypes.c_int32(selector).value]

    def api_GetFileType(self, handle: int) -> int:
        self.events.append(("file_type", handle))
        return self.file_types.get(handle, 0)

    def api_GetCurrentProcess(self) -> int:
        return self.current_process

    def api_DuplicateHandle(
        self, source: int, handle: int, target: int, output: Any, access: int, inherit: bool, options: int
    ) -> int:
        assert source == target == self.current_process
        assert access == 0 and inherit is False and options == 2
        self.events.append(("duplicate", handle))
        if "duplicate" in self.failures:
            return 0
        if "invalid_duplicate" in self.failures:
            return 1
        duplicate = os.dup(handle)
        os.set_inheritable(duplicate, False)
        self.duplicates.append(duplicate)
        ctypes.cast(output, ctypes.POINTER(ctypes.c_void_p)).contents.value = duplicate
        return 1


@pytest.fixture
def kernel(monkeypatch: pytest.MonkeyPatch) -> Kernel32:
    api = Kernel32()

    def load(name: str, *, use_last_error: bool) -> Kernel32:
        assert name == "kernel32" and use_last_error is True
        return api

    monkeypatch.setattr(ctypes, "WinDLL", load, raising=False)
    monkeypatch.setattr(ctypes, "get_last_error", lambda: api.error, raising=False)
    monkeypatch.setattr(windows, "sys", SimpleNamespace(platform="win32", stdin=None, stdout=None))
    return api


def test_should_admit_owned_suspended_process_before_resuming_only_its_thread(kernel: Kernel32) -> None:
    process = OwnedProcess()

    with windows.windows_worker_job(process):
        kernel.events.append(("body",))

    events = kernel.events
    assert events[0] == ("create_job", None, None)
    assert events.index(("assign", process._handle)) < events.index(("resume",)) < events.index(("body",))
    assert ("open_thread", 0x802, False, 777) in events
    assert events.index(("close", kernel.snapshot)) < events.index(("resume",))
    assert events[-1] == ("close", kernel.job)
    assert ("close", kernel.thread) in events
    assert ("close", process._handle) not in events
    assert not process.actions


@pytest.mark.parametrize(
    "failure", ["create_job", "set_limits", "assign", "snapshot", "first", "next", "open_thread", "thread_owner"]
)
def test_should_kill_and_reap_only_owned_process_when_admission_fails(kernel: Kernel32, failure: str) -> None:
    process = OwnedProcess()
    kernel.failures.add(failure)

    with pytest.raises(OSError), windows.windows_worker_job(process):
        pytest.fail("failed admission executed the body")

    assert process.actions == ["kill", "wait"]
    assert ("resume",) not in kernel.events
    assert ("close", process._handle) not in kernel.events
    if failure != "create_job":
        assert ("close", kernel.job) in kernel.events
    if failure not in {"create_job", "set_limits", "assign", "snapshot"}:
        assert ("close", kernel.snapshot) in kernel.events


@pytest.mark.parametrize("entries", [[], [(99, 777)], [(3021, 777), (3021, 778)]])
def test_should_refuse_missing_or_ambiguous_initial_thread(kernel: Kernel32, entries: list[tuple[int, int]]) -> None:
    kernel.entries = entries
    process = OwnedProcess()

    with pytest.raises(OSError), windows.windows_worker_job(process):
        pytest.fail("no unique suspended thread")

    assert not any(event[0] in {"open_thread", "resume"} for event in kernel.events)
    assert process.actions == ["kill", "wait"]


def test_should_refuse_truncated_thread_entry_before_reading_owner(kernel: Kernel32) -> None:
    kernel.entry_size = 12

    with pytest.raises(OSError), windows.windows_worker_job(OwnedProcess()):
        pytest.fail("truncated THREADENTRY32 was accepted")

    assert ("resume",) not in kernel.events


def test_should_not_resume_reused_thread_id_owned_by_another_process(kernel: Kernel32) -> None:
    kernel.thread_owner = 9000

    with pytest.raises(OSError), windows.windows_worker_job(OwnedProcess()):
        pytest.fail("foreign thread was admitted")

    assert ("resume",) not in kernel.events
    assert ("close", kernel.thread) in kernel.events


@pytest.mark.parametrize("previous_count", [0, 2, 0xFFFFFFFF])
def test_should_refuse_any_resume_count_other_than_exactly_one(kernel: Kernel32, previous_count: int) -> None:
    kernel.resume_count = previous_count
    process = OwnedProcess()

    with pytest.raises(OSError), windows.windows_worker_job(process):
        pytest.fail("unexpected suspend count was accepted")

    assert kernel.events.count(("resume",)) == 1
    assert process.actions == ["kill", "wait"]
    assert ("close", kernel.thread) in kernel.events
    assert ("close", kernel.job) in kernel.events


@pytest.mark.parametrize("handle_name", ["snapshot", "thread"])
def test_should_refuse_admission_and_close_job_when_auxiliary_close_fails(kernel: Kernel32, handle_name: str) -> None:
    kernel.close_failures[getattr(kernel, handle_name)] = 1
    process = OwnedProcess()

    with pytest.raises(OSError), windows.windows_worker_job(process):
        pytest.fail("close failure was hidden")

    assert ("close", kernel.job) in kernel.events
    assert process.actions == ["kill", "wait"]


def test_should_close_job_when_the_admitted_body_raises(kernel: Kernel32) -> None:
    with pytest.raises(ValueError, match="synthetic body failure"), windows.windows_worker_job(OwnedProcess()):
        raise ValueError("synthetic body failure")

    assert kernel.events[-1] == ("close", kernel.job)


@pytest.mark.parametrize("terminate_fails", [False, True])
def test_should_surface_job_close_failure_after_attempting_owned_job_termination(
    kernel: Kernel32, terminate_fails: bool
) -> None:
    kernel.close_failures[kernel.job] = 1
    if terminate_fails:
        kernel.failures.add("terminate_job")

    with pytest.raises(OSError), windows.windows_worker_job(OwnedProcess()):
        pass

    assert ("terminate_job", kernel.job, 1) in kernel.events
    assert kernel.events.count(("close", kernel.job)) == 2


@pytest.mark.parametrize("failure", ["kill", "wait"])
def test_should_surface_owned_cleanup_failure_and_still_attempt_reap_and_job_close(
    kernel: Kernel32, failure: str
) -> None:
    kernel.failures.add("assign")
    process = OwnedProcess()
    setattr(process, failure + "_error", OSError("synthetic owned cleanup failure"))

    with pytest.raises(OSError), windows.windows_worker_job(process):
        pytest.fail("failed cleanup was accepted")

    assert process.actions == ["kill", "wait"]
    assert ("close", kernel.job) in kernel.events


def test_should_translate_owned_reap_timeout_to_oserror(kernel: Kernel32) -> None:
    kernel.failures.add("assign")
    process = OwnedProcess()
    process.wait_error = subprocess.TimeoutExpired("synthetic", 5)

    with pytest.raises(OSError), windows.windows_worker_job(process):
        pytest.fail("cleanup timeout was accepted")

    assert ("close", kernel.job) in kernel.events


@pytest.mark.parametrize("handle", [None, 0, -1])
def test_should_refuse_missing_owned_process_handle(kernel: Kernel32, handle: int | None) -> None:
    process = OwnedProcess()
    process._handle = handle

    with pytest.raises(OSError), windows.windows_worker_job(process):
        pytest.fail("invalid owned process handle was accepted")

    assert ("resume",) not in kernel.events
    assert process.actions == ["kill", "wait"]


@pytest.fixture
def pipe_handles(kernel: Kernel32, monkeypatch: pytest.MonkeyPatch) -> Iterator[tuple[int, int, int, int]]:
    input_read, input_write = os.pipe()
    output_read, output_write = os.pipe()
    kernel.std_handles = {-10: input_read, -11: output_write}
    kernel.file_types = {input_read: 3, output_write: 3}
    crt = ModuleType("msvcrt")

    def open_osfhandle(handle: int, flags: int) -> int:
        assert flags & 0x8000
        assert not os.get_inheritable(handle)
        return handle  # External CRT ownership transfer only; all io wrappers are real.

    crt.open_osfhandle = open_osfhandle
    monkeypatch.setitem(sys.modules, "msvcrt", crt)
    try:
        yield input_read, input_write, output_read, output_write
    finally:
        for handle in (input_read, input_write, output_read, output_write):
            os.close(handle)


def test_should_use_existing_python_streams_without_winapi_or_closing_them(monkeypatch: pytest.MonkeyPatch) -> None:
    stdin = io.TextIOWrapper(io.BytesIO(b"input"), encoding="utf-8")
    stdout = io.StringIO()
    fake_sys = SimpleNamespace(platform="linux", stdin=stdin, stdout=stdout)
    monkeypatch.setattr(windows, "sys", fake_sys)

    with windows.worker_standard_streams() as (binary_input, text_output):
        assert binary_input is stdin.buffer and text_output is stdout
        assert binary_input.read() == b"input"
        text_output.write("response")

    assert stdout.getvalue() == "response"
    assert not stdin.closed and not stdout.closed
    assert fake_sys.stdin is stdin and fake_sys.stdout is stdout
    stdin.close()
    stdout.close()


def test_should_recover_only_owned_noninheritable_pipe_duplicates_with_utf8_output(
    kernel: Kernel32, pipe_handles: tuple[int, int, int, int]
) -> None:
    input_read, input_write, output_read, output_write = pipe_handles
    os.write(input_write, b"request")

    with windows.worker_standard_streams() as (binary_input, text_output):
        assert binary_input.read(7) == b"request"
        assert text_output.encoding.lower().replace("-", "") == "utf8"
        text_output.write("完成")
        assert windows.sys.stdin is None and windows.sys.stdout is None

    assert binary_input.closed and text_output.closed
    assert os.read(output_read, 6) == "完成".encode()
    os.fstat(input_read)
    os.fstat(output_write)
    for duplicate in kernel.duplicates:
        with pytest.raises(OSError):
            os.fstat(duplicate)
    assert not any(event[0] == "close" and event[1] in {input_read, output_write} for event in kernel.events)


@pytest.mark.parametrize("missing", ["stdin", "stdout"])
def test_should_recover_only_missing_python_stream_and_leave_existing_stream_open(
    kernel: Kernel32, pipe_handles: tuple[int, int, int, int], missing: str
) -> None:
    existing = io.StringIO() if missing == "stdin" else io.TextIOWrapper(io.BytesIO(b"x"))
    setattr(windows.sys, "stdout" if missing == "stdin" else "stdin", existing)

    with windows.worker_standard_streams() as streams:
        recovered = streams[0 if missing == "stdin" else 1]

    assert recovered.closed and not existing.closed
    assert len(kernel.duplicates) == 1
    existing.close()


@pytest.mark.parametrize("selector", [-10, -11])
@pytest.mark.parametrize("handle", [0, None, -1, ctypes.c_void_p(-1).value])
def test_should_refuse_missing_or_invalid_inherited_handles_and_close_partial_recovery(
    kernel: Kernel32, pipe_handles: tuple[int, int, int, int], selector: int, handle: int | None
) -> None:
    kernel.std_handles[selector] = handle

    with pytest.raises(OSError), windows.worker_standard_streams():
        pytest.fail("invalid handle was accepted")

    for duplicate in kernel.duplicates:
        with pytest.raises(OSError):
            os.fstat(duplicate)


@pytest.mark.parametrize("kind", [0, 1, 2])
@pytest.mark.parametrize("selector", [-10, -11])
def test_should_refuse_nonpipe_inherited_handles(
    kernel: Kernel32, pipe_handles: tuple[int, int, int, int], kind: int, selector: int
) -> None:
    kernel.file_types[kernel.std_handles[selector]] = kind

    with pytest.raises(OSError), windows.worker_standard_streams():
        pytest.fail("non-pipe protocol was accepted")

    for duplicate in kernel.duplicates:
        with pytest.raises(OSError):
            os.fstat(duplicate)


def test_should_refuse_duplicate_failure_without_closing_original_handles(
    kernel: Kernel32, pipe_handles: tuple[int, int, int, int]
) -> None:
    kernel.failures.add("duplicate")

    with pytest.raises(OSError), windows.worker_standard_streams():
        pytest.fail("failed duplicate was accepted")

    assert not kernel.duplicates
    os.fstat(pipe_handles[0])
    os.fstat(pipe_handles[3])


def test_should_close_duplicate_when_crt_ownership_transfer_fails(
    kernel: Kernel32, pipe_handles: tuple[int, int, int, int], monkeypatch: pytest.MonkeyPatch
) -> None:
    def reject_handle(handle: int, flags: int) -> int:
        raise OSError("synthetic CRT failure")

    monkeypatch.setattr(sys.modules["msvcrt"], "open_osfhandle", reject_handle)

    with pytest.raises(OSError, match="synthetic CRT failure"), windows.worker_standard_streams():
        pytest.fail("failed CRT transfer was accepted")

    assert ("close", kernel.duplicates[0]) in kernel.events
    with pytest.raises(OSError):
        os.fstat(kernel.duplicates[0])


def test_should_close_recovered_streams_even_when_body_raises(
    kernel: Kernel32, pipe_handles: tuple[int, int, int, int]
) -> None:
    with pytest.raises(ValueError, match="synthetic body failure"), windows.worker_standard_streams() as streams:
        raise ValueError("synthetic body failure")

    assert all(stream.closed for stream in streams)


@pytest.mark.parametrize("missing", ["stdin", "stdout"])
def test_should_fail_closed_for_missing_streams_on_nonwindows(monkeypatch: pytest.MonkeyPatch, missing: str) -> None:
    fake_sys = SimpleNamespace(platform="linux", stdin=SimpleNamespace(buffer=io.BytesIO()), stdout=io.StringIO())
    setattr(fake_sys, missing, None)
    monkeypatch.setattr(windows, "sys", fake_sys)

    with pytest.raises(OSError), windows.worker_standard_streams():
        pytest.fail("missing non-Windows stdio was accepted")


def test_should_refuse_present_stdin_without_binary_buffer_instead_of_recovering(kernel: Kernel32) -> None:
    windows.sys.stdin = io.StringIO("not binary")
    windows.sys.stdout = io.StringIO()

    with pytest.raises(OSError), windows.worker_standard_streams():
        pytest.fail("nonbinary Python stdin was accepted")

    assert not kernel.events


@pytest.mark.parametrize("missing_api", ["WinDLL", "ResumeThread"])
def test_should_translate_unavailable_windows_api_to_oserror_and_reap_owned_worker(
    kernel: Kernel32, monkeypatch: pytest.MonkeyPatch, missing_api: str
) -> None:
    if missing_api == "WinDLL":

        def unavailable(*args: Any, **kwargs: Any) -> Any:
            raise AttributeError("synthetic unavailable loader")

        monkeypatch.setattr(ctypes, "WinDLL", unavailable)
    else:
        delattr(kernel, missing_api)
    process = OwnedProcess()

    with pytest.raises(OSError), windows.windows_worker_job(process):
        pytest.fail("missing WinAPI was accepted")

    assert process.actions == ["kill", "wait"]


@pytest.mark.parametrize("closed_stream", ["stdin", "stdout"])
def test_should_refuse_closed_python_streams_without_recovering_or_closing_other_stream(
    kernel: Kernel32, closed_stream: str
) -> None:
    stdin = io.TextIOWrapper(io.BytesIO())
    stdout = io.StringIO()
    windows.sys.stdin = stdin
    windows.sys.stdout = stdout
    target = stdin if closed_stream == "stdin" else stdout
    other = stdout if closed_stream == "stdin" else stdin
    target.close()

    with pytest.raises(OSError), windows.worker_standard_streams():
        pytest.fail("closed Python stdio was accepted")

    assert not kernel.events and not other.closed
    other.close()


def test_should_refuse_successful_duplicate_call_with_invalid_output_handle(
    kernel: Kernel32, pipe_handles: tuple[int, int, int, int]
) -> None:
    kernel.failures.add("invalid_duplicate")

    with pytest.raises(OSError), windows.worker_standard_streams():
        pytest.fail("invalid duplicate output was accepted")

    assert not kernel.duplicates
    os.fstat(pipe_handles[0])
    os.fstat(pipe_handles[3])


def test_should_reset_thread_entry_size_between_enumeration_calls(kernel: Kernel32) -> None:
    kernel.entry_size = 16  # Both required IDs are present; the next call still needs full dwSize.

    with windows.windows_worker_job(OwnedProcess()):
        pass

    assert kernel.events.count(("resume",)) == 1


def test_should_close_all_recovered_streams_when_stdout_flush_fails(
    kernel: Kernel32, pipe_handles: tuple[int, int, int, int]
) -> None:
    closed_read, broken_write = os.pipe()
    os.close(closed_read)
    kernel.std_handles[-11] = broken_write
    kernel.file_types[broken_write] = 3
    try:
        with pytest.raises(BrokenPipeError), windows.worker_standard_streams() as streams:
            streams[1].write("synthetic buffered response")
        assert all(stream.closed for stream in streams)
        os.fstat(broken_write)
    finally:
        os.close(broken_write)


def test_should_close_partial_recovery_if_second_crt_transfer_fails(
    kernel: Kernel32, pipe_handles: tuple[int, int, int, int], monkeypatch: pytest.MonkeyPatch
) -> None:
    transfers = 0

    def transfer(handle: int, flags: int) -> int:
        nonlocal transfers
        transfers += 1
        if transfers == 2:
            raise OSError("synthetic second CRT failure")
        return handle

    monkeypatch.setattr(sys.modules["msvcrt"], "open_osfhandle", transfer)
    with pytest.raises(OSError, match="synthetic second CRT failure"), windows.worker_standard_streams():
        pytest.fail("partial CRT failure was accepted")

    assert transfers == 2
    for duplicate in kernel.duplicates:
        with pytest.raises(OSError):
            os.fstat(duplicate)


def test_should_surface_repeated_job_close_failure_after_owned_termination(kernel: Kernel32) -> None:
    kernel.close_failures[kernel.job] = 2

    with pytest.raises(OSError), windows.windows_worker_job(OwnedProcess()):
        pass

    assert kernel.events.count(("close", kernel.job)) == 2
    assert ("terminate_job", kernel.job, 1) in kernel.events


def test_should_fail_closed_and_reap_owned_process_if_job_is_requested_on_nonwindows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(windows, "sys", SimpleNamespace(platform="linux"))
    process = OwnedProcess()

    with pytest.raises(OSError), windows.windows_worker_job(process):
        pytest.fail("Windows job was accepted on Linux")

    assert process.actions == ["kill", "wait"]
