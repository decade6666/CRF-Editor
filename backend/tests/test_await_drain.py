"""await_with_drain 完成守卫的行为测试（design.md D4；exp4 rev3 的 pytest 移植）。

七个场景逐一锁定取消语义：首次取消被保留、重复原始取消不 busy-spin、
worker 异常被取回并记录为警告且不替换取消、取消只在 worker 完成后才向上
传播（请求收尾不得与仍在运行的 worker 并发）。
"""

import asyncio
import logging
import threading

import anyio
import pytest
from fastapi.concurrency import run_in_threadpool

from src.services.await_drain import await_with_drain

SCENARIO_TIMEOUT = 15


async def _wait_event(event: threading.Event) -> None:
    await asyncio.get_running_loop().run_in_executor(None, event.wait)


async def _settle_cancel_delivery() -> None:
    """等待原始取消投递到 endpoint 任务（几个事件循环迭代内完成）。

    生产实现无测试钩子（implement.md S2），排水进入改为定时沉降观测；
    总时长仍受 SCENARIO_TIMEOUT 看门狗约束。
    """
    await asyncio.sleep(0.05)


async def _run_scenario(mode: str, cancels: int):
    """移植 exp4 的单场景执行，返回 (outcome, events, result_box, not_done_flags)。"""
    events: list[str] = []
    lock = threading.Lock()
    start_ev, release_ev = threading.Event(), threading.Event()
    result_box: dict = {}
    not_done_flags: list[bool] = []
    scope_box: dict = {}

    def rec(name: str) -> None:
        with lock:
            events.append(name)

    def job():
        rec("worker_start")
        start_ev.set()
        release_ev.wait(timeout=SCENARIO_TIMEOUT)
        rec("worker_end")
        if mode == "fail_after_cancel":
            raise RuntimeError("worker failed after cancellation")
        return "worker-result"

    async def build_awaitable():
        if mode == "inner_cancel":

            async def inner_cancel_coro():
                rec("inner_raises_cancelled")
                raise asyncio.CancelledError

            return inner_cancel_coro()
        return run_in_threadpool(job)

    async def endpoint():
        rec("app_enter")
        try:
            with anyio.CancelScope() as scope:
                scope_box["scope"] = scope
                result_box["value"] = await await_with_drain(await build_awaitable())
            rec("app_scope_exited")
        finally:
            rec("teardown")

    t = None
    outcome = ""
    try:
        t = asyncio.create_task(endpoint())
        if mode == "inner_cancel":
            await _settle_cancel_delivery()
            rec("cancel_requested")
            t.cancel()
        elif mode == "scope_cancel_during_drain":
            await _wait_event(start_ev)
            t.cancel()
            await _settle_cancel_delivery()
            not_done_flags.append(not t.done())
            rec("first_cancel_retained")
            scope_box["scope"].cancel()
            await _settle_cancel_delivery()
            not_done_flags.append(not t.done())
            rec("scope_cancel_requested")
        elif cancels >= 1:
            await _wait_event(start_ev)
            for i in range(cancels):
                t.cancel()
                await _settle_cancel_delivery()
                alive = not t.done()
                not_done_flags.append(alive)
                if alive:
                    # 观测语义：worker 仍阻塞在 release_ev 时 endpoint 任务未完成，
                    # 即首个取消被保留、排水在等 worker（配合 outcome=cancelled 与
                    # worker_end < teardown 共同锁定保留语义）。
                    rec("first_cancel_retained")
            rec("cancels_done")
        else:
            await _wait_event(start_ev)
        release_ev.set()
        await t
        outcome = "clean"
    except asyncio.CancelledError:
        outcome = "cancelled"
    except Exception as exc:
        outcome = f"{type(exc).__name__}:{exc}"
    finally:
        release_ev.set()
    if t is not None:
        await asyncio.wait([t], timeout=SCENARIO_TIMEOUT)
    return outcome, events, result_box, not_done_flags


def _run_within_timeout(mode: str, cancels: int):
    try:
        return asyncio.run(asyncio.wait_for(_run_scenario(mode, cancels), timeout=SCENARIO_TIMEOUT))
    except asyncio.TimeoutError:
        pytest.fail(f"场景在 {SCENARIO_TIMEOUT}s 内未完成（看门狗触发）")


def _assert_worker_completed_before_teardown(events: list[str]) -> None:
    assert "worker_end" in events, events
    assert events.index("worker_end") < events.index("teardown"), events


def test_a_repeated_raw_cancel_keeps_first_and_waits_for_worker():
    outcome, events, _result_box, not_done_flags = _run_within_timeout("ok", cancels=2)

    assert outcome == "cancelled", (outcome, events)
    assert all(not_done_flags), (not_done_flags, events)
    _assert_worker_completed_before_teardown(events)
    assert "first_cancel_retained" in events, events


def test_b_worker_error_during_drain_is_logged_and_cancellation_kept(caplog):
    with caplog.at_level(logging.WARNING):
        outcome, events, _result_box, not_done_flags = _run_within_timeout("fail_after_cancel", cancels=2)

    assert outcome == "cancelled", (outcome, events)
    assert all(not_done_flags), (not_done_flags, events)
    _assert_worker_completed_before_teardown(events)
    assert "first_cancel_retained" in events, events
    warning = next((r for r in caplog.records if "worker exception" in r.getMessage()), None)
    assert warning is not None, [r.getMessage() for r in caplog.records]
    assert warning.exc_info is not None and isinstance(warning.exc_info[1], RuntimeError), warning.exc_info


def test_c_clean_success_returns_worker_result():
    outcome, events, result_box, _not_done_flags = _run_within_timeout("ok", cancels=0)

    assert outcome == "clean", (outcome, events)
    _assert_worker_completed_before_teardown(events)
    assert result_box.get("value") == "worker-result", result_box


def test_d_worker_error_without_cancel_propagates_original():
    outcome, events, _result_box, _not_done_flags = _run_within_timeout("fail_after_cancel", cancels=0)

    assert outcome == "RuntimeError:worker failed after cancellation", (outcome, events)
    _assert_worker_completed_before_teardown(events)


def test_e_triple_raw_cancel_still_waits_for_worker():
    outcome, events, _result_box, not_done_flags = _run_within_timeout("ok", cancels=3)

    assert outcome == "cancelled", (outcome, events)
    assert all(not_done_flags), (not_done_flags, events)
    _assert_worker_completed_before_teardown(events)
    assert "first_cancel_retained" in events, events


def test_f_inner_cancellederror_finishes_promptly_without_worker():
    outcome, events, _result_box, _not_done_flags = _run_within_timeout("inner_cancel", cancels=0)

    assert outcome == "cancelled", (outcome, events)
    assert "worker_start" not in events, events


def test_g_scope_cancel_context_during_drain_keeps_first_and_waits_for_worker():
    outcome, events, _result_box, not_done_flags = _run_within_timeout("scope_cancel_during_drain", cancels=0)

    assert outcome == "cancelled", (outcome, events)
    assert all(not_done_flags), (not_done_flags, events)
    _assert_worker_completed_before_teardown(events)
    assert "first_cancel_retained" in events, events
    assert "scope_cancel_requested" in events, events
