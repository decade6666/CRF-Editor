"""取消完成守卫（design.md D4）：请求取消后先等内部工作完成，再向上传播取消。

语义（exp4 rev3 原型验证，Python 3.10.21 + anyio 4.15.1）：
- 首个取消被保留并最终原样重抛；
- 重复的原始调用方取消在 anyio 屏蔽作用域内被逐一吸收，不 busy-spin；
- worker 异常被取回并记录为警告，不替换已保留的取消；
- 取消只在内部工作完成后才向上传播——``get_session`` 的事务收尾等请求
  清理因此不会与仍在运行的 worker 并发操作同一 Session / 文件句柄。

边界（超出范围，直接失败）：进程被 kill、事件循环被销毁、对本模块内部
任务的直接取消。生产签名不含测试钩子；行为由 tests/test_await_drain.py 锁定。
"""

import asyncio
import logging
from typing import Awaitable, TypeVar

import anyio

logger = logging.getLogger(__name__)

_T = TypeVar("_T")


async def await_with_drain(awaitable: Awaitable[_T]) -> _T:
    inner = asyncio.ensure_future(awaitable)
    try:
        return await asyncio.shield(inner)
    except asyncio.CancelledError as first_cancel:
        while not inner.done():
            try:
                with anyio.CancelScope(shield=True):
                    await asyncio.shield(inner)
            except asyncio.CancelledError:
                continue  # 重复的原始取消 / 作用域退出重投递：继续等待
            except Exception:
                break  # 普通 worker 异常：跳出排水循环，交给下方取回逻辑
        if not inner.cancelled():
            exc = inner.exception()
            if exc is not None:
                logger.warning("worker exception during cancellation drain", exc_info=exc)
        raise first_cancel
