"""Creation-time job ownership at the Win32 boundary; no real host processes."""

from __future__ import annotations

import ctypes
import os
import subprocess
import sys
import threading
from collections.abc import Callable, Iterator
from pathlib import Path
from types import ModuleType, SimpleNamespace
from typing import Any

import pytest

from src.services import frozen_render_windows as windows

pytestmark = pytest.mark.unit


class ApiFunction:
    def __init__(self, implementation: Callable[..., Any]) -> None:
        self.implementation = implementation
        self.argtypes: list[Any] = []
        self.restype: Any = None

    def __call__(self, *arguments: Any) -> Any:
        return self.implementation(*arguments)


class Kernel:
    job = 0x200000123
    process = 0x300000123
    thread = 0x400000123
    pid = 3021

    def __init__(self) -> None:
        self.events: list[str] = []
        self.fail: str | None = None
        self.error = 5
        self.attributes: dict[int, list[int]] = {}
        self.duplicates: set[int] = set()
        self.child_fds: set[int] = set()
        self.exited = threading.Event()
        self.job_closed = threading.Event()
        self.stopping = False
        self.reply: bytes | None = b'{"complete":true}'
        self.input = b""
        self.worker: threading.Thread | None = None
        self.command = ""
        self.cwd = ""
        self.flags = 0

    def __getattr__(self, name: str) -> Any:
        implementation = getattr(type(self), "api_" + name, None)
        if implementation is None:

            def unexpected(*_arguments: Any) -> Any:
                raise AssertionError("unexpected Win32 call: " + name)

            function = ApiFunction(unexpected)
        else:
            function = ApiFunction(lambda *arguments: implementation(self, *arguments))
        setattr(self, name, function)
        return function

    def api_CreateJobObjectW(self, attributes: Any, name: Any) -> int:
        assert attributes is name is None
        self.events.append("job")
        return 0 if self.fail == "job" else self.job

    def api_SetInformationJobObject(self, job: int, kind: int, data: Any, size: int) -> int:
        assert job == self.job and kind == 9
        assert int.from_bytes(ctypes.string_at(data, size)[16:20], "little") == 0x2000
        self.events.append("limits")
        return int(self.fail != "limits")

    def api_GetCurrentProcess(self) -> int:
        return -1

    def api_DuplicateHandle(
        self, source: int, fd: int, target: int, output: Any, access: int, inherit: bool, flags: int
    ) -> int:
        assert source == target == -1 and access == 0 and inherit is True and flags == 2
        self.events.append("duplicate")
        if self.fail == "duplicate":
            return 0
        duplicate = os.dup(fd)
        os.set_inheritable(duplicate, True)
        self.duplicates.add(duplicate)
        ctypes.cast(output, ctypes.POINTER(ctypes.c_void_p)).contents.value = duplicate
        return 1

    def api_InitializeProcThreadAttributeList(self, pointer: Any, count: int, flags: int, size: Any) -> int:
        assert count == 2 and flags == 0
        ctypes.cast(size, ctypes.POINTER(ctypes.c_size_t)).contents.value = 256
        if pointer is None:
            self.error = 122
            return 0
        self.error = 5
        self.events.append("attributes")
        return int(self.fail != "attributes")

    def api_UpdateProcThreadAttribute(
        self, pointer: Any, flags: int, kind: int, value: Any, size: int, old: Any, returned: Any
    ) -> int:
        assert flags == 0 and old is returned is None
        assert kind in (0x20002, 0x2000D)
        values = ctypes.cast(value, ctypes.POINTER(ctypes.c_void_p))
        self.attributes[kind] = [values[index] for index in range(size // ctypes.sizeof(ctypes.c_void_p))]
        name = "job_list" if kind == 0x2000D else "handle_list"
        self.events.append(name)
        return int(self.fail != name)

    def api_DeleteProcThreadAttributeList(self, pointer: Any) -> None:
        self.events.append("delete_attributes")

    def api_CreateProcessW(
        self,
        executable: str,
        command: Any,
        process_attributes: Any,
        thread_attributes: Any,
        inherit: bool,
        flags: int,
        environment: Any,
        cwd: str,
        startup: Any,
        information: Any,
    ) -> int:
        from src.services import frozen_render_windows_process as native

        assert process_attributes is thread_attributes is None and inherit is True
        self.events.append("create")
        self.command, self.cwd, self.flags = command.value, cwd, flags
        assert self.attributes[0x2000D] == [self.job]
        info = ctypes.cast(startup, ctypes.POINTER(native._StartupInfoEx)).contents
        assert info.StartupInfo.cb == ctypes.sizeof(native._StartupInfoEx)
        assert info.StartupInfo.dwFlags & 0x100
        handles = self.attributes[0x20002]
        assert handles == [info.StartupInfo.hStdInput, info.StartupInfo.hStdOutput, info.StartupInfo.hStdError]
        assert self.job not in handles and all(os.get_inheritable(handle) for handle in handles)
        if self.fail == "create":
            return 0
        self.child_input, self.child_output = os.dup(handles[0]), os.dup(handles[1])
        self.child_fds.update((self.child_input, self.child_output))
        result = ctypes.cast(information, ctypes.POINTER(native._ProcessInformation)).contents
        result.hProcess, result.hThread = self.process, self.thread
        result.dwProcessId, result.dwThreadId = self.pid, 777
        return 1

    def api_ResumeThread(self, thread: int) -> int:
        assert thread == self.thread
        self.events.append("resume")
        assert not self.duplicates
        if self.fail == "resume":
            return 0xFFFFFFFF
        if self.reply is not None:
            self.worker = threading.Thread(target=self._work, daemon=True)
            self.worker.start()
        return 1

    def _work(self) -> None:
        try:
            with os.fdopen(self.child_input, "rb", closefd=False) as source:
                self.input = source.read()
            if not self.stopping:
                os.write(self.child_output, self.reply)
        except (OSError, ValueError):
            if not self.stopping:
                raise
        finally:
            for fd in tuple(self.child_fds):
                os.close(fd)
                self.child_fds.remove(fd)
            self.exited.set()

    def api_CloseHandle(self, handle: int) -> int:
        if handle in self.duplicates:
            self.events.append("close_duplicate")
            os.close(handle)
            self.duplicates.remove(handle)
        elif handle == self.job:
            self.events.append("close_job")
            self.stopping = True
            self.job_closed.set()
            self.exited.set()
            if self.worker is None:
                for fd in tuple(self.child_fds):
                    os.close(fd)
                    self.child_fds.remove(fd)
        else:
            assert handle in (self.thread, self.process)
            self.events.append("close_thread" if handle == self.thread else "close_process")
        return 1

    def api_WaitForSingleObject(self, handle: int, timeout: int) -> int:
        assert handle == self.process
        return 0 if self.exited.wait(timeout / 1000) else 258

    def api_GetExitCodeProcess(self, handle: int, output: Any) -> int:
        assert handle == self.process and self.exited.is_set()
        ctypes.cast(output, ctypes.POINTER(ctypes.c_uint32)).contents.value = 0
        return 1


@pytest.fixture
def kernel(monkeypatch: pytest.MonkeyPatch) -> Iterator[Kernel]:
    api = Kernel()
    monkeypatch.setattr(ctypes, "WinDLL", lambda *_args, **_kwargs: api, raising=False)
    monkeypatch.setattr(ctypes, "get_last_error", lambda: api.error, raising=False)
    monkeypatch.setattr(windows, "sys", SimpleNamespace(platform="win32"))
    crt = ModuleType("msvcrt")
    crt.get_osfhandle = lambda descriptor: descriptor
    monkeypatch.setitem(sys.modules, "msvcrt", crt)
    yield api
    if api.worker is not None:
        api.worker.join(timeout=1)
        assert not api.worker.is_alive()
    assert not api.duplicates and not api.child_fds


def launch(tmp_path: Path) -> Any:
    return windows.windows_worker_process(
        ["synthetic-python.exe", "argument with spaces"],
        cwd=tmp_path,
        env={"SYSTEMROOT": "synthetic", "LANG": "zh_CN.UTF-8"},
    )


def test_should_create_worker_already_bound_to_noninherited_job_before_resume(kernel: Kernel, tmp_path: Path) -> None:
    with launch(tmp_path) as process:
        assert process.pid == kernel.pid
        kernel.events.append("body")
    assert (
        kernel.events.index("job_list")
        < kernel.events.index("create")
        < kernel.events.index("resume")
        < kernel.events.index("body")
    )
    assert kernel.flags & 4 and kernel.flags & 0x80000 and kernel.flags & 0x400
    assert kernel.command == 'synthetic-python.exe "argument with spaces"'
    assert kernel.cwd == str(tmp_path)
    assert kernel.events.index("close_job") < kernel.events.index("close_process")
    assert "close_thread" in kernel.events and "delete_attributes" in kernel.events


def test_should_communicate_real_pipe_bytes_and_collect_exit_status(kernel: Kernel, tmp_path: Path) -> None:
    with launch(tmp_path) as process:
        result, errors = process.communicate(b"synthetic frozen input", timeout=2)
        assert result == kernel.reply and errors is None
        assert process.returncode == 0
    assert kernel.input == b"synthetic frozen input"


@pytest.mark.parametrize(
    "failure", ["job", "limits", "duplicate", "attributes", "job_list", "handle_list", "create", "resume"]
)
def test_should_close_owned_resources_when_native_setup_fails(kernel: Kernel, tmp_path: Path, failure: str) -> None:
    kernel.fail = failure
    with pytest.raises(OSError):
        with launch(tmp_path):
            pytest.fail("failed setup yielded a worker")
    if failure not in ("create", "resume"):
        assert "create" not in kernel.events
    if failure != "job":
        assert "close_job" in kernel.events
    if failure == "resume":
        assert "close_process" in kernel.events and "close_thread" in kernel.events


def test_should_close_job_before_reaping_after_timeout(kernel: Kernel, tmp_path: Path) -> None:
    kernel.reply = None
    with launch(tmp_path) as process:
        with pytest.raises(subprocess.TimeoutExpired):
            process.communicate(b"frozen", timeout=0.01)
        process.kill()
        process.communicate()
        assert "close_job" in kernel.events
    assert kernel.events.index("close_job") < kernel.events.index("close_process")


def test_should_reject_excess_protocol_output_without_unbounded_drain(kernel: Kernel, tmp_path: Path) -> None:
    kernel.reply = b"x" * 4097
    with pytest.raises(OSError):
        with launch(tmp_path) as process:
            process.communicate(b"input", timeout=2)
    assert "close_job" in kernel.events


def test_should_preserve_body_error_while_releasing_native_worker(kernel: Kernel, tmp_path: Path) -> None:
    failure = ValueError("synthetic caller failure")
    with pytest.raises(ValueError) as observed:
        with launch(tmp_path):
            raise failure
    assert observed.value is failure
    assert "close_job" in kernel.events and "close_process" in kernel.events


def test_should_surface_late_pipe_error_instead_of_accepting_complete_response(kernel: Kernel, tmp_path: Path) -> None:
    with launch(tmp_path) as process:
        original = process._output

        class FailedFinalRead:
            first = True

            def read(self, size: int) -> bytes:
                if self.first:
                    self.first = False
                    return original.read(size)
                assert kernel.job_closed.wait(timeout=2)
                raise OSError("synthetic final ReadFile error")

        process._output = FailedFinalRead()
        with pytest.raises(OSError):
            process.communicate(b"input", timeout=2)


def test_should_surface_input_close_failure_instead_of_accepting_complete_response(
    kernel: Kernel, tmp_path: Path
) -> None:
    with launch(tmp_path) as process:
        original = process._input

        class FailedInputClose:
            def write(self, data: bytes) -> int:
                return original.write(data)

            def close(self) -> None:
                original.close()
                raise OSError("synthetic input CloseHandle error")

        process._input = FailedInputClose()
        with pytest.raises(OSError):
            process.communicate(b"input", timeout=2)


def test_should_match_fixed_win32_process_structure_sizes(kernel: Kernel) -> None:
    from src.services import frozen_render_windows_process as native

    wide = ctypes.sizeof(ctypes.c_void_p) == 8
    assert ctypes.sizeof(native._StartupInfo) == (104 if wide else 68)
    assert ctypes.sizeof(native._StartupInfoEx) == (112 if wide else 72)
    assert ctypes.sizeof(native._ProcessInformation) == (24 if wide else 16)
    assert native._ProcessInformation.dwProcessId.offset == (16 if wide else 8)


def test_should_refuse_missing_native_library_before_creating_worker(
    kernel: Kernel, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from src.services import frozen_render_windows_process as native

    def unavailable(*_args: Any, **_kwargs: Any) -> Any:
        raise OSError("synthetic API unavailable")

    monkeypatch.setattr(ctypes, "WinDLL", unavailable)
    with pytest.raises(native.WindowsWorkerUnsupported):
        with launch(tmp_path):
            pytest.fail("missing API yielded worker")
    assert "job" not in kernel.events


def test_should_refuse_invalid_duplicate_without_creating_worker(
    kernel: Kernel, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(kernel, "DuplicateHandle", ApiFunction(lambda *_args: 1))
    with pytest.raises(OSError):
        with launch(tmp_path):
            pytest.fail("invalid pipe yielded worker")
    assert "create" not in kernel.events


@pytest.mark.parametrize("failure", ["unexpected_success", "zero_size", "wrong_error"])
def test_should_refuse_invalid_attribute_size_probe_before_creation(
    kernel: Kernel, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    def probe(_pointer: Any, _count: int, _flags: int, size: Any) -> int:
        ctypes.cast(size, ctypes.POINTER(ctypes.c_size_t)).contents.value = 0 if failure == "zero_size" else 256
        kernel.error = 5 if failure == "wrong_error" else 122
        return int(failure == "unexpected_success")

    monkeypatch.setattr(kernel, "InitializeProcThreadAttributeList", ApiFunction(probe))
    with pytest.raises(OSError):
        with launch(tmp_path):
            pytest.fail("invalid attribute size yielded worker")
    assert "create" not in kernel.events


def test_should_refuse_unsupported_job_attribute_without_unsafe_fallback(
    kernel: Kernel, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from src.services import frozen_render_windows_process as native

    def unsupported(*_args: Any) -> int:
        kernel.error = 50
        return 0

    monkeypatch.setattr(kernel, "UpdateProcThreadAttribute", ApiFunction(unsupported))
    with pytest.raises(native.WindowsWorkerUnsupported):
        with launch(tmp_path):
            pytest.fail("unsupported attribute yielded worker")
    assert "create" not in kernel.events and "delete_attributes" in kernel.events


@pytest.mark.parametrize("failed_mode", ["rb", "wb"])
def test_should_release_both_pipe_descriptors_when_stream_adoption_fails(
    kernel: Kernel, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failed_mode: str
) -> None:
    from src.services import frozen_render_windows_process as native

    pipe, adopt = os.pipe, os.fdopen
    descriptors: list[int] = []

    def owned_pipe() -> tuple[int, int]:
        pair = pipe()
        descriptors.extend(pair)
        return pair

    def failed_adoption(descriptor: int, mode: str, **kwargs: Any) -> Any:
        if mode == failed_mode:
            raise OSError("synthetic CRT stream adoption error")
        return adopt(descriptor, mode, **kwargs)

    monkeypatch.setattr(native.os, "pipe", owned_pipe)
    monkeypatch.setattr(native.os, "fdopen", failed_adoption)
    with pytest.raises(OSError):
        with launch(tmp_path):
            pytest.fail("failed stream adoption yielded worker")
    for descriptor in descriptors:
        with pytest.raises(OSError):
            os.fstat(descriptor)


@pytest.mark.parametrize("written", [None, 0, -1])
def test_should_surface_nonprogressing_input_write(kernel: Kernel, tmp_path: Path, written: int | None) -> None:
    with launch(tmp_path) as process:
        original = process._input

        class StalledInput:
            def write(self, _data: bytes) -> int | None:
                return written

            def close(self) -> None:
                original.close()

        process._input = StalledInput()
        with pytest.raises(OSError):
            process.communicate(b"input", timeout=2)


def test_should_deliver_all_input_after_partial_writes(kernel: Kernel, tmp_path: Path) -> None:
    with launch(tmp_path) as process:
        original = process._input

        class PartialInput:
            def write(self, data: bytes) -> int:
                return original.write(data[:2])

            def close(self) -> None:
                original.close()

        process._input = PartialInput()
        process.communicate(b"partial frozen input", timeout=2)
    assert kernel.input == b"partial frozen input"


def test_should_not_repeat_frozen_input_after_communication(kernel: Kernel, tmp_path: Path) -> None:
    with launch(tmp_path) as process:
        process.communicate(b"once", timeout=2)
        with pytest.raises(ValueError):
            process.communicate(b"again", timeout=2)
    assert kernel.input == b"once"


def test_should_surface_exit_status_lookup_failure(
    kernel: Kernel, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(kernel, "GetExitCodeProcess", ApiFunction(lambda *_args: 0))
    with pytest.raises(OSError, match="GetExitCodeProcess"):
        with launch(tmp_path) as process:
            process.communicate(b"input", timeout=2)


def test_should_surface_wait_failure_while_releasing_owned_worker(
    kernel: Kernel, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    normal = kernel.WaitForSingleObject
    monkeypatch.setattr(
        kernel,
        "WaitForSingleObject",
        ApiFunction(lambda handle, timeout: normal(handle, timeout) if kernel.job_closed.is_set() else 0xFFFFFFFF),
    )
    with pytest.raises(OSError, match="WaitForSingleObject"):
        with launch(tmp_path) as process:
            process.communicate(b"input", timeout=2)
    assert "close_process" in kernel.events


def test_should_report_unreaped_worker_without_hiding_cleanup_failure(
    kernel: Kernel, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    kernel.reply = None
    monkeypatch.setattr(kernel, "WaitForSingleObject", ApiFunction(lambda *_args: 258))
    with pytest.raises(OSError):
        with launch(tmp_path):
            pass
    assert "close_job" in kernel.events and "close_process" in kernel.events


def test_should_bound_thread_join_and_report_unfinished_pipe(kernel: Kernel, tmp_path: Path) -> None:
    joins: list[float] = []

    class UnfinishedThread:
        def join(self, timeout: float) -> None:
            joins.append(timeout)

        def is_alive(self) -> bool:
            return True

    with launch(tmp_path) as process:
        process._threads = [UnfinishedThread()]
        try:
            with pytest.raises(OSError):
                process._join_io()
        finally:
            process._threads = []
    assert len(joins) == 1 and 0 <= joins[0] <= 5


def test_should_never_return_oversized_response_even_during_cleanup(kernel: Kernel, tmp_path: Path) -> None:
    kernel.reply = b"x" * 4097
    with launch(tmp_path) as process:
        with pytest.raises(OSError):
            process.communicate(b"input", timeout=2)
        process.kill()
        with pytest.raises(OSError):
            process.communicate()


@pytest.mark.parametrize("failed_start", [1, 2])
def test_should_preserve_thread_start_failure_and_join_only_started_threads(
    kernel: Kernel, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failed_start: int
) -> None:
    failure = RuntimeError("synthetic I/O thread resource limit")
    starts = 0
    actual_start = threading.Thread.start

    def start(thread: threading.Thread) -> None:
        nonlocal starts
        starts += 1
        if starts == failed_start:
            raise failure
        actual_start(thread)

    with pytest.raises(RuntimeError) as observed:
        with launch(tmp_path) as process:
            monkeypatch.setattr(threading.Thread, "start", start)
            process.communicate(b"input", timeout=2)
    assert observed.value is failure
    assert len(process._threads) == failed_start - 1
    assert all(not thread.is_alive() for thread in process._threads)
    assert "close_job" in kernel.events and "close_process" in kernel.events
