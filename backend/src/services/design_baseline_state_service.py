"""Local immutable-history schema guards, separate from design invalidation."""

from __future__ import annotations

from contextlib import contextmanager
import threading
from typing import Iterator

from sqlalchemy.engine import Engine

from src.services.design_snapshot_service import SnapshotError

HISTORY_PRIVATE_TABLES = ("design_baseline_artifact", "design_baseline_capture", "design_baseline")
HISTORY_TRIGGER_PREFIX = "crf_baseline_v1_"
RENDER_CONTRACT_VERSION = "frozen-word-v1"
_PROJECT_LOCK = threading.Lock()
_PROJECT_READERS: dict[int, int] = {}
_PROJECT_REMOVING: set[int] = set()


def _busy() -> SnapshotError:
    return SnapshotError("项目留档正在读取、生成或清理，请稍后重试", "BASELINE_BUSY", 409)


@contextmanager
def project_history_access(project_id: int) -> Iterator[None]:
    with _PROJECT_LOCK:
        if project_id in _PROJECT_REMOVING:
            raise _busy()
        _PROJECT_READERS[project_id] = _PROJECT_READERS.get(project_id, 0) + 1
    try:
        yield
    finally:
        with _PROJECT_LOCK:
            remaining = _PROJECT_READERS[project_id] - 1
            if remaining:
                _PROJECT_READERS[project_id] = remaining
            else:
                del _PROJECT_READERS[project_id]


@contextmanager
def project_history_removal(project_id: int) -> Iterator[None]:
    with _PROJECT_LOCK:
        if project_id in _PROJECT_REMOVING or _PROJECT_READERS.get(project_id):
            raise _busy()
        _PROJECT_REMOVING.add(project_id)
    try:
        yield
    finally:
        with _PROJECT_LOCK:
            _PROJECT_REMOVING.remove(project_id)


def initialize_design_baselines(engine: Engine) -> None:
    """Only online startup calls this; never initialize an external product DB."""
    guards = {
        "baseline_immutable": "BEFORE UPDATE ON design_baseline BEGIN SELECT RAISE(ABORT,'immutable baseline'); END",
        "artifact_immutable": "BEFORE UPDATE ON design_baseline_artifact BEGIN SELECT RAISE(ABORT,'immutable original'); END",
        "pair_required": (
            "BEFORE INSERT ON design_baseline WHEN "
            "EXISTS(SELECT 1 FROM design_baseline WHERE id=NEW.id) OR "
            "(SELECT COUNT(*) FROM design_baseline_artifact WHERE baseline_id=NEW.id)!=2 "
            "BEGIN SELECT RAISE(ABORT,'incomplete or existing baseline'); END"
        ),
        "artifact_closed": (
            "BEFORE INSERT ON design_baseline_artifact WHEN EXISTS(SELECT 1 FROM design_baseline WHERE id=NEW.baseline_id) "
            "BEGIN SELECT RAISE(ABORT,'completed original set'); END"
        ),
        "artifact_pair_delete": (
            "BEFORE DELETE ON design_baseline_artifact WHEN EXISTS(SELECT 1 FROM design_baseline WHERE id=OLD.baseline_id) "
            "BEGIN SELECT RAISE(ABORT,'delete whole baseline only'); END"
        ),
        "capture_binding": (
            "BEFORE UPDATE ON design_baseline_capture WHEN "
            + " OR ".join(
                f"OLD.{column} IS NOT NEW.{column}"
                for column in (
                    "id",
                    "project_id",
                    "actor_user_id",
                    "actor_username",
                    "request_id",
                    "input_hash",
                    "created_at",
                )
            )
            + " BEGIN SELECT RAISE(ABORT,'immutable capture binding'); END"
        ),
    }
    with engine.begin() as connection:
        for name, definition in guards.items():
            connection.exec_driver_sql(f'CREATE TRIGGER IF NOT EXISTS "{HISTORY_TRIGGER_PREFIX}{name}" {definition}')
