"""Product exchange excludes local history; faithful future system copies do not."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from sqlalchemy import create_engine, event, insert, select
from sqlalchemy.orm import Session

from src.models import Base
from src.models.design_baseline import DesignBaseline, DesignBaselineArtifact, DesignBaselineCapture
from src.models.project import Project
from src.models.user import User
from src.services.database_export_service import (
    export_full_database,
    export_project_database,
    export_user_projects_database,
)
from src.services.design_baseline_state_service import (
    HISTORY_PRIVATE_TABLES,
    HISTORY_TRIGGER_PREFIX,
    initialize_design_baselines,
)
from src.services.design_revision_service import initialize_design_state
from src.services.design_snapshot_service import capture_project_design

SENTINEL = "LOCAL_HISTORY_NOT_PRODUCT_EXCHANGE_778EC2"


@pytest.fixture
def history_db(tmp_path: Path) -> Path:
    path = tmp_path / "source.db"
    engine = create_engine(f"sqlite:///{path}")

    @event.listens_for(engine, "connect")
    def configure(connection: object, _record: object) -> None:
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    initialize_design_state(engine)
    initialize_design_baselines(engine)
    with Session(engine) as session:
        session.add(User(id=1, username="synthetic-history-owner"))
        session.flush()
        session.add(Project(id=1, name="可交换项目", version="1", owner_id=1))
        session.commit()
        snapshot = capture_project_design(session, 1)
        for kind in ("ecrf", "acrf"):
            session.execute(
                insert(DesignBaselineArtifact).values(
                    baseline_id="a" * 32, kind=kind, relative_name=f"{kind}.docx", byte_count=12, sha256="e" * 64
                )
            )
        session.execute(
            insert(DesignBaseline).values(
                id="a" * 32,
                project_id=1,
                creator_user_id=1,
                creator_name="synthetic-history-admin",
                label=SENTINEL,
                remark=SENTINEL,
                source_revision='"test-revision"',
                snapshot_schema=1,
                snapshot_json=snapshot.payload_json,
                content_hash=snapshot.content_hash,
                layout_json="{}",
                layout_hash="d" * 64,
                storage_key="b" * 32,
                app_version="test",
                render_version="frozen-word-v1",
            )
        )
        session.execute(
            insert(DesignBaselineCapture).values(
                project_id=1,
                actor_user_id=1,
                actor_username="synthetic-history-admin",
                request_id="f" * 32,
                input_hash="a" * 64,
                status="completed",
                baseline_id="a" * 32,
            )
        )
        session.commit()
    engine.dispose()
    return path


@pytest.mark.integration
@pytest.mark.parametrize("kind", ["full", "project", "user"])
def test_should_strip_all_history_from_product_export_without_mutating_source(history_db: Path, kind: str) -> None:
    exporters = {
        "full": lambda: export_full_database(str(history_db)),
        "project": lambda: export_project_database(str(history_db), 1, "项目"),
        "user": lambda: export_user_projects_database(str(history_db), 1),
    }

    output = Path(exporters[kind]())

    with sqlite3.connect(output) as connection:
        names = {row[0] for row in connection.execute("SELECT name FROM sqlite_master")}
        assert not set(HISTORY_PRIVATE_TABLES).intersection(names)
        assert not any(name.startswith(HISTORY_TRIGGER_PREFIX) for name in names)
        assert connection.execute("PRAGMA freelist_count").fetchone()[0] == 0
        assert connection.execute("SELECT name FROM project WHERE id=1").fetchone()[0] == "可交换项目"
    assert SENTINEL.encode() not in output.read_bytes()
    with sqlite3.connect(history_db) as connection:
        assert connection.execute("SELECT label FROM design_baseline").fetchone()[0] == SENTINEL
        assert connection.execute("SELECT COUNT(*) FROM design_baseline_artifact").fetchone()[0] == 2
        assert connection.execute("SELECT status FROM design_baseline_capture").fetchone()[0] == "completed"


@pytest.mark.integration
def test_should_preserve_history_in_faithful_sqlite_capture_not_product_export(
    history_db: Path, tmp_path: Path
) -> None:
    target = tmp_path / "faithful-system-capture.db"
    with sqlite3.connect(history_db) as source, sqlite3.connect(target) as destination:
        source.backup(destination)
        assert destination.execute("SELECT label FROM design_baseline").fetchone()[0] == SENTINEL
        assert destination.execute("SELECT COUNT(*) FROM design_baseline_artifact").fetchone()[0] == 2
        assert destination.execute("SELECT status FROM design_baseline_capture").fetchone()[0] == "completed"


@pytest.mark.integration
@pytest.mark.parametrize("operation", ["project-import", "database-merge", "project-clone"])
def test_should_never_inherit_history_from_an_external_or_cloned_project(
    history_db: Path, engine: object, operation: str
) -> None:
    from sqlalchemy import func
    from src.services.project_clone_service import ProjectCloneService
    from src.services.project_import_service import DatabaseMergeService, ProjectDbImportService

    if operation == "project-clone":
        source_engine = create_engine(f"sqlite:///{history_db}")
        try:
            with Session(source_engine) as session:
                copied = ProjectCloneService.clone(1, 1, session)
                session.commit()
                assert copied.id != 1
                assert (
                    session.scalar(
                        select(func.count()).select_from(DesignBaseline).where(DesignBaseline.project_id == copied.id)
                    )
                    == 0
                )
                assert (
                    session.scalar(
                        select(func.count())
                        .select_from(DesignBaselineCapture)
                        .where(DesignBaselineCapture.project_id == copied.id)
                    )
                    == 0
                )
                assert session.scalar(select(func.count()).select_from(DesignBaseline)) == 1
        finally:
            source_engine.dispose()
    else:
        with Session(engine) as session:
            session.add(User(id=2, username="synthetic-import-owner"))
            session.commit()
            if operation == "project-import":
                result = ProjectDbImportService.import_single_project(str(history_db), 2, session)
                assert result.project_name == "可交换项目"
            else:
                result = DatabaseMergeService.merge(str(history_db), 2, session)
                assert len(result.imported) == 1
            session.commit()
            for model in (DesignBaseline, DesignBaselineArtifact, DesignBaselineCapture):
                assert session.scalar(select(func.count()).select_from(model)) == 0
    with sqlite3.connect(history_db) as connection:
        assert connection.execute("SELECT label FROM design_baseline").fetchone()[0] == SENTINEL
