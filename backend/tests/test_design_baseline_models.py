"""Completed archives are immutable pairs; request tombstones stay system-private."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import pytest
from sqlalchemy import delete, insert, inspect, select, text, update
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.models import Base
from src.models.design_baseline import DesignBaseline, DesignBaselineArtifact, DesignBaselineCapture
from src.models.project import Project
from src.services.design_baseline_state_service import initialize_design_baselines
from src.services import design_baseline_state_service as history_state
from src.services.design_snapshot_service import SnapshotError
from src.services.design_revision_service import read_design_revision


@pytest.fixture
def baseline_engine(engine: Engine) -> Engine:
    initialize_design_baselines(engine)
    with Session(engine) as session:
        session.add(Project(id=1, name="模型测试项目", version="1"))
        session.commit()
    return engine


def _metadata() -> dict[str, Any]:
    return {
        "id": "a" * 32,
        "project_id": 1,
        "creator_user_id": 9,
        "creator_name": "synthetic-admin",
        "created_at": datetime(2026, 11, 20),
        "label": "正式版本",
        "remark": "不可变备注",
        "source_revision": '"reviewed-revision"',
        "snapshot_schema": 1,
        "snapshot_json": "{}",
        "content_hash": "c" * 64,
        "layout_json": "{}",
        "layout_hash": "d" * 64,
        "asset_hash": None,
        "storage_key": "b" * 32,
        "app_version": "test-version",
        "render_version": "frozen-word-v1",
        "kind": "formal_pair",
        "origin": "manual",
        "storage_source": "live_history",
        "status": "complete",
    }


def _insert_pair(session: Session) -> None:
    for kind in ("ecrf", "acrf"):
        session.execute(
            insert(DesignBaselineArtifact).values(
                baseline_id="a" * 32, kind=kind, relative_name=f"{kind}.docx", byte_count=123, sha256="e" * 64
            )
        )
    session.execute(insert(DesignBaseline).values(**_metadata()))


@pytest.mark.unit
def test_should_block_history_purge_during_active_project_capture_and_release_after_error() -> None:
    with history_state.project_history_access(1):
        with pytest.raises(SnapshotError) as failure:
            with history_state.project_history_removal(1):
                pytest.fail("purge overlapped capture")
    assert failure.value.code == "BASELINE_BUSY"
    with pytest.raises(RuntimeError), history_state.project_history_removal(1):
        raise RuntimeError("synthetic transaction failure")
    with history_state.project_history_access(1):
        pass


@pytest.mark.unit
def test_should_block_project_history_reads_during_exclusive_removal() -> None:
    with history_state.project_history_removal(1):
        with pytest.raises(SnapshotError):
            with history_state.project_history_access(1):
                pytest.fail("read overlapped purge")
    with history_state.project_history_access(1):
        pass


@pytest.mark.integration
def test_should_register_all_three_private_tables_without_design_triggers(baseline_engine: Engine) -> None:
    assert {"design_baseline", "design_baseline_artifact", "design_baseline_capture"} <= set(
        inspect(baseline_engine).get_table_names()
    )
    assert {"design_baseline", "design_baseline_artifact", "design_baseline_capture"} <= set(Base.metadata.tables)
    with baseline_engine.connect() as connection:
        revision_triggers = (
            connection.execute(
                text("SELECT tbl_name FROM sqlite_master WHERE type='trigger' AND name LIKE 'crf_design_v1_%'")
            )
            .scalars()
            .all()
        )
    assert not {"design_baseline", "design_baseline_artifact", "design_baseline_capture"}.intersection(
        revision_triggers
    )


@pytest.mark.integration
def test_should_refuse_completed_baseline_without_both_originals(baseline_engine: Engine) -> None:
    with Session(baseline_engine) as session, pytest.raises(IntegrityError):
        session.execute(insert(DesignBaseline).values(**_metadata()))
        session.commit()


@pytest.mark.integration
@pytest.mark.parametrize("kind", ["ecrf", "acrf"])
def test_should_refuse_single_original_as_completed_pair(baseline_engine: Engine, kind: str) -> None:
    with Session(baseline_engine) as session, pytest.raises(IntegrityError):
        session.execute(
            insert(DesignBaselineArtifact).values(
                baseline_id="a" * 32, kind=kind, relative_name=f"{kind}.docx", byte_count=1, sha256="e" * 64
            )
        )
        session.execute(insert(DesignBaseline).values(**_metadata()))
        session.commit()


@pytest.mark.integration
@pytest.mark.parametrize(
    "column,value",
    [
        ("label", "changed"),
        ("snapshot_json", '{"changed":true}'),
        ("storage_key", "f" * 32),
        ("content_hash", "f" * 64),
        ("project_id", 2),
    ],
)
def test_should_refuse_sql_update_of_completed_metadata(baseline_engine: Engine, column: str, value: Any) -> None:
    with Session(baseline_engine) as session:
        _insert_pair(session)
        session.commit()
        with pytest.raises(IntegrityError):
            session.execute(update(DesignBaseline).values(**{column: value}))
            session.commit()


@pytest.mark.integration
def test_should_refuse_sql_replacement_of_original_checksum(baseline_engine: Engine) -> None:
    with Session(baseline_engine) as session:
        _insert_pair(session)
        session.commit()
        with pytest.raises(IntegrityError):
            session.execute(update(DesignBaselineArtifact).values(sha256="f" * 64))
            session.commit()


@pytest.mark.integration
@pytest.mark.parametrize(
    "kind,name,size",
    [
        ("pdf", "ecrf.docx", 1),
        ("ecrf", "../private", 1),
        ("ecrf", "ecrf.docx", 0),
        ("ecrf", "ecrf.docx", 64 * 1024 * 1024 + 1),
    ],
)
def test_should_refuse_invalid_artifact_index(baseline_engine: Engine, kind: str, name: str, size: int) -> None:
    with Session(baseline_engine) as session, pytest.raises(IntegrityError):
        session.execute(
            insert(DesignBaselineArtifact).values(
                baseline_id="a" * 32, kind=kind, relative_name=name, byte_count=size, sha256="e" * 64
            )
        )
        session.flush()


@pytest.mark.integration
def test_should_bind_one_request_to_project_actor_and_canonical_input(baseline_engine: Engine) -> None:
    values = {
        "project_id": 1,
        "actor_user_id": 9,
        "actor_username": "synthetic-admin",
        "request_id": "f" * 32,
        "input_hash": "a" * 64,
        "status": "pending",
    }
    with Session(baseline_engine) as session:
        session.execute(insert(DesignBaselineCapture).values(**values))
        session.commit()
        with pytest.raises(IntegrityError):
            session.execute(insert(DesignBaselineCapture).values(**values))
            session.commit()
    with Session(baseline_engine) as session, pytest.raises(IntegrityError):
        session.execute(update(DesignBaselineCapture).values(input_hash="b" * 64))
        session.commit()


@pytest.mark.integration
def test_should_preserve_deleted_request_tombstone_without_original_index(baseline_engine: Engine) -> None:
    with Session(baseline_engine) as session:
        _insert_pair(session)
        session.execute(
            insert(DesignBaselineCapture).values(
                project_id=1,
                actor_user_id=9,
                actor_username="synthetic-admin",
                request_id="f" * 32,
                input_hash="a" * 64,
                status="completed",
                baseline_id="a" * 32,
            )
        )
        session.commit()
        session.execute(update(DesignBaselineCapture).values(status="deleted"))
        session.execute(delete(DesignBaseline))
        session.commit()
        capture = session.scalars(select(DesignBaselineCapture)).one()
        assert capture.status == "deleted" and capture.baseline_id is None
        assert session.scalars(select(DesignBaselineArtifact)).all() == []


@pytest.mark.integration
def test_should_not_change_design_revision_when_writing_history(baseline_engine: Engine) -> None:
    with Session(baseline_engine) as session:
        before = read_design_revision(session, 1)
        _insert_pair(session)
        session.commit()
        assert read_design_revision(session, 1) == before


@pytest.mark.integration
def test_should_keep_completed_history_when_recycled_and_delete_only_with_project_purge(
    baseline_engine: Engine,
) -> None:
    with Session(baseline_engine) as session:
        _insert_pair(session)
        session.commit()
        session.execute(update(Project).where(Project.id == 1).values(deleted_at=datetime(2026, 11, 20)))
        session.commit()
        assert session.get(DesignBaseline, "a" * 32) is not None
        session.execute(delete(Project).where(Project.id == 1))
        session.commit()
        assert session.scalars(select(DesignBaselineArtifact)).all() == []
        assert session.scalars(select(DesignBaseline)).all() == []


@pytest.mark.integration
def test_should_refuse_deleting_only_one_original_index(baseline_engine: Engine) -> None:
    with Session(baseline_engine) as session:
        _insert_pair(session)
        session.commit()
        with pytest.raises(IntegrityError):
            session.execute(delete(DesignBaselineArtifact).where(DesignBaselineArtifact.kind == "ecrf"))
            session.commit()


@pytest.mark.integration
def test_should_reinitialize_guards_without_rewriting_history(baseline_engine: Engine) -> None:
    with Session(baseline_engine) as session:
        _insert_pair(session)
        session.commit()
    initialize_design_baselines(baseline_engine)
    with Session(baseline_engine) as session:
        row = session.get(DesignBaseline, "a" * 32)
        assert row is not None and row.label == "正式版本"
        with pytest.raises(IntegrityError):
            session.execute(update(DesignBaseline).values(remark="mutated"))
            session.commit()
