"""后台任务：回收站定时清理循环。

进程内 asyncio 后台任务，uvicorn lifespan 启停。无外部调度依赖。
- 阻塞 SQLite I/O 通过 asyncio.to_thread 挪出事件循环，避免拖慢并发请求。
- 每轮重读配置，策略改动在下一轮（≤ interval）生效，无需重启。
- 测试隔离：CRF_DISABLE_BACKGROUND_JOBS=1 时不启动循环；默认两条规则关闭，即使循环运行也是 no-op。
- 单实例限制：N 个应用实例会跑 N 个循环，行为仍正确（删前重查 + 单项目事务使重复工作变 no-op），
  但浪费，与现有限流器同属单节点限制。
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
import os

logger = logging.getLogger("src.background_jobs")

_DISABLE_ENV = "CRF_DISABLE_BACKGROUND_JOBS"
_DISABLED_VALUES = {"1", "true", "yes", "on"}


def should_enable_background_jobs() -> bool:
    """CRF_DISABLE_BACKGROUND_JOBS=1/true/yes/on 时关闭后台任务。"""
    raw = os.environ.get(_DISABLE_ENV, "").strip().lower()
    return raw not in _DISABLED_VALUES


def _run_cleanup_once_sync() -> dict:
    """在工作线程里跑一轮清理：自建 Session，不复用请求作用域依赖。"""
    from sqlalchemy.orm import Session

    from src.database import get_engine
    from src.services.recycle_bin_cleanup_service import run_recycle_bin_cleanup

    with Session(get_engine()) as session:
        return run_recycle_bin_cleanup(session)


async def _recycle_bin_cleanup_loop() -> None:
    """回收站清理循环：启动即跑一次，其后按 interval 每轮重读配置。"""
    from src.config import get_config

    while True:
        try:
            report = await asyncio.to_thread(_run_cleanup_once_sync)
            purged = report.get("purged_count", 0)
            if purged:
                from src.services.project_size_service import format_bytes
                logger.info(
                    "回收站定时清理：彻底删除 %d 个项目，释放约 %s",
                    purged,
                    format_bytes(report.get("freed_bytes", 0)),
                )
        except asyncio.CancelledError:
            raise  # 必须原样上抛，否则 shutdown 卡死
        except Exception:  # noqa: BLE001 - 单轮失败不杀死循环
            logger.exception("回收站定时清理失败，本轮跳过")
        interval = max(1, get_config().recycle_bin.interval_minutes)
        try:
            await asyncio.sleep(interval * 60)
        except asyncio.CancelledError:
            raise


def start_background_jobs(app) -> None:
    """在 app.state 上创建回收站清理后台任务（lifespan startup 调用）。"""
    if not should_enable_background_jobs():
        logger.info("后台任务已通过 %s 关闭", _DISABLE_ENV)
        return
    task = asyncio.create_task(_recycle_bin_cleanup_loop(), name="recycle-bin-cleanup")
    app.state.recycle_bin_cleanup_task = task
    logger.info("回收站定时清理后台任务已启动")


async def stop_background_jobs(app) -> None:
    """取消回收站清理后台任务（lifespan shutdown 调用，先于其他清理）。"""
    task = getattr(app.state, "recycle_bin_cleanup_task", None)
    if task is None:
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    app.state.recycle_bin_cleanup_task = None
    logger.info("回收站定时清理后台任务已停止")