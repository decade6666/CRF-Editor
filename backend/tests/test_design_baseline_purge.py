"""Final live-project purge commits first and never reaches sealed system copies."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import insert, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from src.config import AppConfig, DatabaseConfig, RecycleBinAgeRule, RecycleBinConfig, StorageConfig
from src.models.design_baseline import DesignBaseline, DesignBaselineArtifact
from src.models.project import Project
from src.models.user import User
from src.routers import admin as admin_routes
from src.services import recycle_bin_cleanup_service as recycle
from src.services.auth_service import create_access_token
from src.services.design_baseline_state_service import initialize_design_baselines, project_history_access
from src.services import design_baseline_storage_service as storage

pytestmark = pytest.mark.integration


@dataclass(frozen=True)
class PurgeCase:
    client: Any = field(repr=False)
    engine: Engine
    config: AppConfig = field(repr=False)
    headers: dict[str, str] = field(repr=False)
    original: Path
    sealed: Path


@pytest.fixture
def purge_case(raw_client: Any, engine: Engine, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> PurgeCase:
    config = AppConfig(
        database=DatabaseConfig(path=str(tmp_path / "data.db")),
        storage=StorageConfig(upload_path=str(tmp_path / "uploads")),
    )
    monkeypatch.setattr(admin_routes, "get_config", lambda: config)
    monkeypatch.setattr(recycle, "get_config", lambda: config)
    initialize_design_baselines(engine)
    stage = storage.prepare_stage(config)
    for kind in ("ecrf", "acrf"):
        (stage.directory / f"{kind}.docx").write_bytes(f"synthetic-{kind}".encode())
    directory = storage.publish_stage(stage)
    sealed = tmp_path / "sealed-system-set" / "original.docx"
    sealed.parent.mkdir()
    sealed.write_bytes(b"independent self-contained sealed set")
    with Session(engine) as session:
        session.add(User(id=71, username="synthetic-purge-admin", is_admin=True))
        session.flush()
        session.add(Project(id=81, name="回收留档", version="1", owner_id=71, deleted_at=datetime(2026, 1, 1)))
        session.flush()
        for kind in ("ecrf", "acrf"):
            session.execute(
                insert(DesignBaselineArtifact).values(
                    baseline_id="a" * 32, kind=kind, relative_name=f"{kind}.docx", byte_count=1, sha256="e" * 64
                )
            )
        session.execute(
            insert(DesignBaseline).values(
                id="a" * 32,
                project_id=81,
                creator_user_id=71,
                creator_name="synthetic-purge-admin",
                label="purge-test",
                remark="",
                source_revision='"test"',
                snapshot_schema=1,
                snapshot_json="{}",
                content_hash="c" * 64,
                layout_json="{}",
                layout_hash="d" * 64,
                storage_key=stage.key,
                app_version="test",
                render_version="frozen-word-v1",
            )
        )
        session.commit()
    headers = {"Authorization": "Bearer " + create_access_token(71, "synthetic-purge-admin", 0)}
    return PurgeCase(raw_client, engine, config, headers, directory / "ecrf.docx", sealed)


def _purge(case: PurgeCase, kind: str) -> int:
    if kind == "admin":
        return case.client.delete("/api/admin/projects/81/hard-delete", headers=case.headers).status_code
    policy = RecycleBinConfig(age=RecycleBinAgeRule(enabled=True, value=1, unit="day"), min_retain_hours=0)
    with Session(case.engine) as session:
        result = recycle.run_recycle_bin_cleanup(session, policy=policy, now=datetime(2026, 11, 20))
    return 204 if result["purged_count"] == 1 else 409


@pytest.mark.parametrize("kind", ["admin", "scheduled-recycle"])
def test_should_commit_project_purge_before_unlinking_its_originals(
    purge_case: PurgeCase, kind: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    observed: list[bool] = []
    original_commit = Session.commit

    def probe_commit(session: Session) -> None:
        if session.scalar(select(Project.id).where(Project.id == 81)) is None:
            observed.append(purge_case.original.exists())
        original_commit(session)

    monkeypatch.setattr(Session, "commit", probe_commit)

    assert _purge(purge_case, kind) == 204
    assert observed and observed[0] is True
    assert not purge_case.original.exists()
    assert purge_case.sealed.read_bytes() == b"independent self-contained sealed set"


@pytest.mark.parametrize("kind", ["admin", "scheduled-recycle"])
def test_should_retain_usable_history_files_on_failed_purge_commit(
    purge_case: PurgeCase, kind: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    original_commit = Session.commit

    def fail_deleted_project(session: Session) -> None:
        if session.scalar(select(Project.id).where(Project.id == 81)) is None:
            raise RuntimeError("synthetic purge commit failure")
        original_commit(session)

    monkeypatch.setattr(Session, "commit", fail_deleted_project)

    assert _purge(purge_case, kind) != 204
    assert purge_case.original.read_bytes() == b"synthetic-ecrf"
    with Session(purge_case.engine) as session:
        assert session.get(Project, 81) is not None
        assert session.get(DesignBaseline, "a" * 32) is not None


@pytest.mark.parametrize("kind", ["admin", "scheduled-recycle"])
def test_should_block_final_purge_while_history_capture_or_read_is_active(purge_case: PurgeCase, kind: str) -> None:
    with project_history_access(81):
        assert _purge(purge_case, kind) == 409
    assert purge_case.original.exists()
    with Session(purge_case.engine) as session:
        assert session.get(DesignBaseline, "a" * 32) is not None


def test_should_keep_history_for_recycled_project_without_running_final_purge(purge_case: PurgeCase) -> None:
    with Session(purge_case.engine) as session:
        session.execute(update(Project).where(Project.id == 81).values(deleted_at=None))
        session.commit()
    response = purge_case.client.post(
        "/api/admin/projects/batch-delete", headers=purge_case.headers, json={"project_ids": [81]}
    )
    assert response.status_code == 204
    assert purge_case.original.exists()
    with Session(purge_case.engine) as session:
        assert session.get(DesignBaseline, "a" * 32) is not None
