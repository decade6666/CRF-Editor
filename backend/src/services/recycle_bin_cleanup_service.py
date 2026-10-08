"""回收站定时清理决策服务。

纯逻辑层，可注入 now 直接单测，不碰事件循环。
后台循环与 preview 接口复用 build_cleanup_plan；run_recycle_bin_cleanup 执行实际删除。

关键语义：
- deleted_at 由 datetime.now() 写入（naive 本地时间），年龄截止时间**必须**同样用 naive 本地，
  用 datetime.now(timezone.utc) 会整体偏移时区差导致删错集合（见 database-guidelines）。
- 年龄规则先算，命中集合记为 age_ids；容量规则在剩余集合上算（否则重复计入即将消失的项目而超删）。
- 容量规则受 min_retain_hours 保护：删除时间不足该时长的项目不参与容量清理。
- 每个项目一个事务，删前重查 deleted_at is not None（关掉计划后恢复的竞态）。
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.config import DAYS_PER_MONTH, DAYS_PER_YEAR, RecycleBinConfig, get_config
from src.models.project import Project
from src.services.project_purge_service import purge_project, remove_logo_file
from src.services.project_size_service import estimate_project_sizes, format_bytes

logger = logging.getLogger(__name__)

_AGE_FACTORS = {"day": 1, "month": DAYS_PER_MONTH, "year": DAYS_PER_YEAR}
_SIZE_FACTORS = {"MB": 1024 ** 2, "GB": 1024 ** 3}


@dataclass(frozen=True)
class CleanupPlan:
    """清理计划（不执行删除）。"""

    age_ids: List[int]
    size_ids: List[int]
    total_bytes_before: int
    total_bytes_after: int
    would_converge: bool

    @property
    def all_target_ids(self) -> Tuple[int, ...]:
        # 保留顺序，去重（同一项目不应被两条规则同时命中——年龄命中者已从剩余集合剔除）
        seen = set()
        out: List[int] = []
        for pid in (*self.age_ids, *self.size_ids):
            if pid not in seen:
                seen.add(pid)
                out.append(pid)
        return tuple(out)

    def matched_rules_for(self, project_id: int) -> List[str]:
        rules: List[str] = []
        if project_id in self.age_ids:
            rules.append("age")
        if project_id in self.size_ids:
            rules.append("size")
        return rules


def resolve_age_cutoff(rule, now: datetime) -> Optional[datetime]:
    """年龄规则截止时间（naive 本地）。关闭或未知单位返回 None。"""
    if not rule.enabled:
        return None
    factor = _AGE_FACTORS.get(rule.unit)
    if factor is None:
        return None
    return now - timedelta(days=rule.value * factor)


def resolve_size_limit_bytes(rule) -> Optional[int]:
    """容量规则阈值（字节）。关闭或未知单位返回 None。"""
    if not rule.enabled:
        return None
    factor = _SIZE_FACTORS.get(rule.unit)
    if factor is None:
        return None
    return rule.value * factor


@dataclass
class _RecycledRow:
    id: int
    deleted_at: datetime


def _load_recycled_rows(session: Session) -> List[_RecycledRow]:
    rows = session.execute(
        select(Project.id, Project.deleted_at)
        .where(Project.deleted_at.is_not(None))
        .order_by(Project.deleted_at.asc(), Project.id.asc())
    ).all()
    out: List[_RecycledRow] = []
    for pid, deleted_at in rows:
        if deleted_at is None:
            continue
        # 兼容历史 aware 写入：统一剥离 tzinfo，与 naive now 比较
        if deleted_at.tzinfo is not None:
            deleted_at = deleted_at.replace(tzinfo=None)
        out.append(_RecycledRow(id=pid, deleted_at=deleted_at))
    return out


def build_cleanup_plan(
    session: Session,
    policy: Optional[RecycleBinConfig] = None,
    now: Optional[datetime] = None,
) -> CleanupPlan:
    """构建清理计划，不执行任何删除。"""
    policy = policy if policy is not None else get_config().recycle_bin
    now = now if now is not None else datetime.now()  # naive 本地

    rows = _load_recycled_rows(session)
    if not rows:
        return CleanupPlan([], [], 0, 0, True)

    ids = [r.id for r in rows]
    sizes = estimate_project_sizes(session, ids)

    # 年龄规则先算
    cutoff = resolve_age_cutoff(policy.age, now)
    age_ids: List[int] = []
    age_set: set = set()
    if cutoff is not None:
        for r in rows:
            if r.deleted_at < cutoff:
                age_ids.append(r.id)
                age_set.add(r.id)

    # 容量规则在剩余集合上算
    remaining = [r for r in rows if r.id not in age_set]
    total = sum(sizes.get(r.id, 0) for r in remaining)
    total_before = sum(sizes.get(r.id, 0) for r in rows)
    limit = resolve_size_limit_bytes(policy.size)
    size_ids: List[int] = []
    blocked_by_retain = False
    if limit is not None:
        retain_cutoff = now - timedelta(hours=max(0, policy.min_retain_hours))
        retained_total = 0
        for r in remaining:  # 已按 deleted_at 升序（最早在最前）
            if total <= limit:
                break
            if r.deleted_at > retain_cutoff:
                blocked_by_retain = True
                continue
            size_ids.append(r.id)
            total -= sizes.get(r.id, 0)
        # total 已扣除年龄命中与容量命中，即计划执行后的剩余总量（每条只扣一次）
        total_after = total
    else:
        total_after = total

    if blocked_by_retain and limit is not None and total > limit:
        logger.info(
            "回收站容量规则因 min_retain_hours=%s 未能降到阈值 %s 以下，"
            "剩余约 %s；保留较新项目",
            policy.min_retain_hours,
            format_bytes(limit),
            format_bytes(total_after),
        )

    return CleanupPlan(
        age_ids=age_ids,
        size_ids=size_ids,
        total_bytes_before=total_before,
        total_bytes_after=total_after,
        would_converge=not blocked_by_retain if limit is not None else True,
    )


def run_recycle_bin_cleanup(
    session: Session,
    policy: Optional[RecycleBinConfig] = None,
    now: Optional[datetime] = None,
) -> Dict[str, object]:
    """执行回收站定时清理。每个项目一个事务，删前重查 deleted_at。

    返回 {purged_count, freed_bytes, age_purged, size_purged}。
    """
    plan = build_cleanup_plan(session, policy=policy, now=now)
    targets = plan.all_target_ids
    # 逐项目建 dict 便于日志
    recycled_rows = {r.id: r for r in _load_recycled_rows(session)}
    sizes = estimate_project_sizes(session, list(targets))

    purged = 0
    freed = 0
    age_purged = 0
    size_purged = 0
    for pid in targets:
        project = session.get(Project, pid)
        if project is None or project.deleted_at is None:
            # 计划生成后被管理员恢复或已删 -> 跳过
            continue
        size = sizes.get(pid, 0)
        try:
            logo_path = purge_project(session, project)
            session.commit()
            # 提交成功后才删文件：提交失败会走 except 回滚，文件仍留在原地
            remove_logo_file(logo_path)
            purged += 1
            freed += size
            if pid in plan.age_ids:
                age_purged += 1
            if pid in plan.size_ids:
                size_purged += 1
            row = recycled_rows.get(pid)
            logger.info(
                "回收站定时清理：彻底删除项目 id=%s name=%s owner_id=%s deleted_at=%s 约 %s",
                pid,
                getattr(project, "name", "?"),
                getattr(project, "owner_id", None),
                row.deleted_at if row else "?",
                format_bytes(size),
            )
        except Exception:  # noqa: BLE001 - 单项目失败不影响其余
            session.rollback()
            logger.exception("回收站定时清理：项目 id=%s 删除失败，跳过", pid)

    return {
        "purged_count": purged,
        "freed_bytes": freed,
        "age_purged": age_purged,
        "size_purged": size_purged,
    }