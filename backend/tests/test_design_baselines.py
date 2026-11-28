"""Current-admin archive boundary, coherent capture and exact retained originals."""

from __future__ import annotations

import hashlib
import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import create_engine, event, func, select, update
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from src.config import AppConfig, DatabaseConfig, StorageConfig
from src.models.design_baseline import DesignBaseline, DesignBaselineCapture
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.user import User
from src.models.visit import Visit
from src.models.visit_form import VisitForm
from src.routers import design_baselines as routes
from src.services import frozen_render_service as frozen
from src.services.auth_service import create_access_token
from src.services.design_baseline_state_service import initialize_design_baselines

pytestmark = pytest.mark.integration
BASE = "/api/admin/projects/11/design-baselines"


@dataclass(frozen=True)
class ArchiveApi:
    client: Any = field(repr=False)
    engine: Engine
    config: AppConfig = field(repr=False)
    admin: dict[str, str] = field(repr=False)
    owner: dict[str, str] = field(repr=False)


@pytest.fixture
def api(engine: Engine, raw_client: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> ArchiveApi:
    initialize_design_baselines(engine)
    config = AppConfig(
        database=DatabaseConfig(path=str(tmp_path / "data.db")),
        storage=StorageConfig(upload_path=str(tmp_path / "uploads")),
    )
    monkeypatch.setattr(routes, "get_config", lambda: config)
    with Session(engine) as session:
        session.add_all(
            [
                User(id=1, username="synthetic-archive-admin", is_admin=True),
                User(id=2, username="synthetic-archive-owner", is_admin=False),
            ]
        )
        session.flush()
        session.add(Project(id=11, name="设计留档测试", version="1", owner_id=2))
        session.flush()
        session.add_all(
            [
                Form(id=21, project_id=11, code="F1", name="冻结表单"),
                Visit(id=31, project_id=11, name="基线", sequence=1),
                FieldDefinition(id=41, project_id=11, variable_name="FIELD", label="原始标签", field_type="文本"),
            ]
        )
        session.flush()
        session.add_all(
            [
                FormField(id=51, form_id=21, field_definition_id=41, order_index=1),
                VisitForm(visit_id=31, form_id=21, sequence=1),
            ]
        )
        session.commit()
    admin = {"Authorization": "Bearer " + create_access_token(1, "synthetic-archive-admin", 0)}
    owner = {"Authorization": "Bearer " + create_access_token(2, "synthetic-archive-owner", 0)}
    return ArchiveApi(client=raw_client, engine=engine, config=config, admin=admin, owner=owner)


@pytest.fixture
def wal_api(api: ArchiveApi, monkeypatch: pytest.MonkeyPatch) -> Iterator[ArchiveApi]:
    """Copy only this test's fresh synthetic database into independent WAL connections."""
    from main import app

    database = Path(api.config.db_path)
    assert not database.exists()
    with api.engine.connect() as source, sqlite3.connect(database) as destination:
        source.connection.driver_connection.backup(destination)
        assert destination.execute("PRAGMA journal_mode=WAL").fetchone() == ("wal",)
    engine = create_engine(
        f"sqlite+pysqlite:///{database}", connect_args={"check_same_thread": False}, poolclass=NullPool
    )

    @event.listens_for(engine, "connect")
    def configure(connection: Any, _record: Any) -> None:
        connection.execute("PRAGMA foreign_keys=ON")

    def plain_session() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    try:
        with engine.connect() as first, engine.connect() as second:
            assert first.connection.driver_connection is not second.connection.driver_connection
            assert first.exec_driver_sql("PRAGMA journal_mode").scalar_one() == "wal"
        with monkeypatch.context() as overrides:
            overrides.setitem(app.dependency_overrides, routes.get_plain_session, plain_session)
            yield ArchiveApi(api.client, engine, api.config, api.admin, api.owner)
    finally:
        engine.dispose()


def _context(api: ArchiveApi) -> dict[str, Any]:
    response = api.client.get(BASE + "/capture-context", headers=api.admin)
    assert response.status_code == 200, response.text
    assert response.headers["Cache-Control"] == "no-store"
    result = response.json()
    assert response.headers["X-CRF-Design-Revision"] == result["source_revision"]
    return result


def _create(api: ArchiveApi, **changes: Any) -> Any:
    context = _context(api)
    body = {"request_id": uuid.uuid4().hex, "label": "正式 v1", "remark": "合成测试留档", "column_widths": {}}
    body.update(changes)
    return api.client.post(BASE, json=body, headers={**api.admin, "If-Match": context["source_revision"]})


def _counts(api: ArchiveApi) -> tuple[int, int]:
    with Session(api.engine) as session:
        return session.scalar(select(func.count()).select_from(DesignBaseline)), session.scalar(
            select(func.count()).select_from(DesignBaselineCapture)
        )


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/api/admin/design-baseline-projects"),
        ("GET", BASE),
        ("GET", BASE + "/capture-context"),
        ("POST", BASE),
        ("GET", BASE + "/" + "a" * 32),
        ("GET", BASE + "/" + "a" * 32 + "/originals/ecrf"),
        ("DELETE", BASE + "/" + "a" * 32),
        ("GET", BASE + "/requests/" + "b" * 32),
    ],
)
def test_should_reject_regular_owner_on_every_archive_operation(api: ArchiveApi, method: str, path: str) -> None:
    response = api.client.request(method, path, headers=api.owner, json={})
    assert response.status_code == 403
    assert response.headers["Cache-Control"] == "no-store"
    assert _counts(api) == (0, 0)
    assert not Path(api.config.design_history_path).exists()


def test_should_require_browser_auth_not_agent_style_bearer(api: ArchiveApi) -> None:
    response = api.client.get(BASE, headers={"Authorization": "Bearer synthetic-not-a-browser-token"})
    assert response.status_code == 401
    assert _counts(api) == (0, 0)


def test_should_allow_admin_context_for_other_owned_project_without_widening_owner_routes(api: ArchiveApi) -> None:
    context = _context(api)
    assert context["snapshot"]["project"]["name"] == "设计留档测试"
    assert context["snapshot"]["tables"]["field_definition"][0]["label"] == "原始标签"
    assert "company_logo_path" not in str(context)
    assert api.client.get("/api/projects/11/forms", headers=api.admin).status_code == 403
    assert _counts(api) == (0, 0)


def test_should_publish_real_pair_and_return_only_exact_retained_downloads(api: ArchiveApi) -> None:
    response = _create(api, column_widths={"21": {"normal": [0.3, 0.7]}})
    assert response.status_code == 201, response.text
    archive = response.json()
    assert archive["kind"] == "formal_pair" and archive["origin"] == "manual"
    assert archive["capabilities"]["originals"] == ["ecrf", "acrf"]
    assert "storage_key" not in archive and "snapshot_json" not in archive
    assert len(archive["artifacts"]) == 2
    with Session(api.engine) as session:
        stored = session.get(DesignBaseline, archive["id"])
        key = stored.storage_key
    for artifact in archive["artifacts"]:
        download = api.client.get(f"{BASE}/{archive['id']}/originals/{artifact['kind']}", headers=api.admin)
        assert download.status_code == 200
        assert download.headers["Cache-Control"] == "no-store"
        assert download.headers["X-CRF-Original-SHA256"] == artifact["sha256"]
        assert hashlib.sha256(download.content).hexdigest() == artifact["sha256"]
        assert (
            download.content
            == (Path(api.config.design_history_path) / "objects" / key / f"{artifact['kind']}.docx").read_bytes()
        )
    assert _counts(api) == (1, 1)
    details = api.client.get(f"{BASE}/{archive['id']}", headers=api.admin)
    assert details.status_code == 200
    assert details.json()["snapshot"]["tables"]["field_definition"][0]["label"] == "原始标签"
    listing = api.client.get(BASE + "?limit=20&offset=0", headers=api.admin)
    assert listing.json()["total"] == 1
    assert listing.json()["items"][0]["id"] == archive["id"]


def test_should_replay_same_request_after_later_edits_without_rendering_again(
    api: ArchiveApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    context = _context(api)
    body = {"request_id": uuid.uuid4().hex, "label": "固定请求", "remark": "", "column_widths": {}}
    headers = {**api.admin, "If-Match": context["source_revision"]}
    first = api.client.post(BASE, json=body, headers=headers)
    assert first.status_code == 201, first.text
    with Session(api.engine) as session:
        session.execute(update(FieldDefinition).where(FieldDefinition.id == 41).values(label="后来的设计"))
        session.commit()
    monkeypatch.setattr(frozen, "render_frozen_pair", lambda *args, **kwargs: pytest.fail("replay re-rendered"))

    replay = api.client.post(BASE, json=body, headers=headers)

    assert replay.status_code == 200, replay.text
    assert replay.json()["id"] == first.json()["id"]
    assert _counts(api) == (1, 1)
    changed = api.client.post(BASE, json={**body, "label": "不同输入"}, headers=headers)
    assert changed.status_code == 409 and changed.json()["code"] == "BASELINE_REQUEST_CONFLICT"


@pytest.mark.parametrize("headers", [None, {"If-Match": '"stale"'}])
def test_should_reject_missing_or_stale_revision_before_creating_capture(
    api: ArchiveApi, headers: dict[str, str] | None
) -> None:
    response = api.client.post(
        BASE, json={"request_id": uuid.uuid4().hex, "label": "留档"}, headers={**api.admin, **(headers or {})}
    )
    assert response.status_code == (428 if headers is None else 409)
    assert _counts(api) == (0, 0)


@pytest.mark.parametrize(
    "change",
    [
        {"extra": "forbidden"},
        {"label": "a" * 101},
        {"remark": "a" * 2001},
        {"request_id": "../path"},
        {"column_widths": {"999": {"normal": [0.5, 0.5]}}},
    ],
)
def test_should_reject_invalid_closed_bounded_creation_without_history(api: ArchiveApi, change: dict[str, Any]) -> None:
    response = _create(api, **change)
    assert response.status_code == 422, response.text
    assert _counts(api) == (0, 0)


def test_should_limit_request_json_before_creating_capture(api: ArchiveApi) -> None:
    response = api.client.post(
        BASE,
        content=b'{"padding":"' + b"a" * (256 * 1024) + b'"}',
        headers={**api.admin, "Content-Type": "application/json"},
    )
    assert response.status_code == 413
    assert _counts(api) == (0, 0)


@pytest.mark.parametrize("mutation,status", [("role", 403), ("auth_version", 401), ("recycle", 404)])
def test_should_reauthorize_after_render_before_publication(
    api: ArchiveApi, monkeypatch: pytest.MonkeyPatch, mutation: str, status: int
) -> None:
    original = frozen.render_frozen_pair

    def render_then_revoke(*args: Any, **kwargs: Any) -> Any:
        result = original(*args, **kwargs)
        with Session(api.engine) as session:
            if mutation == "role":
                session.execute(update(User).where(User.id == 1).values(is_admin=False))
            elif mutation == "auth_version":
                session.execute(update(User).where(User.id == 1).values(auth_version=1))
            else:
                session.execute(update(Project).where(Project.id == 11).values(deleted_at=datetime(2026, 11, 20)))
            session.commit()
        return result

    monkeypatch.setattr(frozen, "render_frozen_pair", render_then_revoke)
    response = _create(api)
    assert response.status_code == status, response.text
    assert _counts(api)[0] == 0
    with Session(api.engine) as session:
        assert session.scalars(select(DesignBaselineCapture.status)).one() == "failed"


def test_should_allow_normal_edits_during_render_without_changing_frozen_history(
    api: ArchiveApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    original = frozen.render_frozen_pair

    def render_then_edit(*args: Any, **kwargs: Any) -> Any:
        result = original(*args, **kwargs)
        with Session(api.engine) as session:
            session.execute(update(FieldDefinition).where(FieldDefinition.id == 41).values(label="后来保存的字段"))
            session.commit()
        return result

    monkeypatch.setattr(frozen, "render_frozen_pair", render_then_edit)
    response = _create(api)
    assert response.status_code == 201, response.text
    detail = api.client.get(f"{BASE}/{response.json()['id']}", headers=api.admin)
    assert detail.json()["snapshot"]["tables"]["field_definition"][0]["label"] == "原始标签"


def test_should_keep_delete_tombstone_and_require_whole_pair_confirmation(api: ArchiveApi) -> None:
    context = _context(api)
    body = {"request_id": uuid.uuid4().hex, "label": "即将删除", "remark": "", "column_widths": {}}
    headers = {**api.admin, "If-Match": context["source_revision"]}
    created = api.client.post(BASE, json=body, headers=headers)
    assert created.status_code == 201, created.text
    path = f"{BASE}/{created.json()['id']}"
    rejected = api.client.request("DELETE", path, json={"confirm_pair_loss": False}, headers=api.admin)
    assert rejected.status_code == 422
    assert _counts(api) == (1, 1)
    removed = api.client.request("DELETE", path, json={"confirm_pair_loss": True}, headers=api.admin)
    assert removed.status_code == 200, removed.text
    assert removed.json()["deleted"] is True
    replay = api.client.post(BASE, json=body, headers=headers)
    assert replay.status_code == 410 and replay.json()["code"] == "BASELINE_REQUEST_DELETED"
    assert _counts(api) == (0, 1)
    with Session(api.engine) as session:
        assert session.scalars(select(DesignBaselineCapture.status)).one() == "deleted"


def test_should_refuse_corrupt_original_without_rendering_replacement(
    api: ArchiveApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = _create(api)
    assert created.status_code == 201, created.text
    identifier = created.json()["id"]
    with Session(api.engine) as session:
        key = session.get(DesignBaseline, identifier).storage_key
    path = Path(api.config.design_history_path) / "objects" / key / "ecrf.docx"
    path.write_bytes(b"synthetic corruption")
    monkeypatch.setattr(frozen, "render_frozen_pair", lambda *args, **kwargs: pytest.fail("download re-rendered"))

    response = api.client.get(f"{BASE}/{identifier}/originals/ecrf", headers=api.admin)

    assert response.status_code == 500
    assert response.json()["code"] == "BASELINE_INTEGRITY_FAILED"
    assert str(path) not in response.text


def test_should_cleanup_only_new_stage_when_initial_capture_commit_fails(
    api: ArchiveApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    original_commit = Session.commit

    def fail_pending_capture(session: Session) -> None:
        if (
            session.scalar(select(DesignBaselineCapture.id).where(DesignBaselineCapture.status == "pending"))
            is not None
        ):
            raise RuntimeError("synthetic initial commit failure")
        original_commit(session)

    monkeypatch.setattr(Session, "commit", fail_pending_capture)
    response = _create(api)
    assert response.status_code == 500
    assert _counts(api) == (0, 0)
    assert list((Path(api.config.design_history_path) / "staging").iterdir()) == []
    assert list((Path(api.config.design_history_path) / "objects").iterdir()) == []


def test_should_keep_previous_pair_when_new_publication_commit_fails(
    api: ArchiveApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    previous = _create(api)
    assert previous.status_code == 201, previous.text
    previous_id = previous.json()["id"]
    before = api.client.get(f"{BASE}/{previous_id}/originals/ecrf", headers=api.admin).content
    original_commit = Session.commit

    def fail_new_publication(session: Session) -> None:
        if session.scalar(select(DesignBaseline.id).where(DesignBaseline.label == "failed-new-pair")) is not None:
            raise RuntimeError("synthetic publication commit failure")
        original_commit(session)

    monkeypatch.setattr(Session, "commit", fail_new_publication)
    failure = _create(api, label="failed-new-pair")
    assert failure.status_code == 500
    assert _counts(api) == (1, 2)
    retained = api.client.get(f"{BASE}/{previous_id}/originals/ecrf", headers=api.admin)
    assert retained.status_code == 200 and retained.content == before
    with Session(api.engine) as session:
        assert (
            session.scalar(
                select(func.count()).select_from(DesignBaselineCapture).where(DesignBaselineCapture.status == "failed")
            )
            == 1
        )


def test_should_keep_usable_originals_when_delete_commit_fails(
    api: ArchiveApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = _create(api)
    assert created.status_code == 201, created.text
    identifier = created.json()["id"]
    before = api.client.get(f"{BASE}/{identifier}/originals/acrf", headers=api.admin).content
    original_commit = Session.commit

    def fail_delete(session: Session) -> None:
        if (
            session.scalar(select(DesignBaselineCapture.id).where(DesignBaselineCapture.status == "deleted"))
            is not None
        ):
            raise RuntimeError("synthetic deletion commit failure")
        original_commit(session)

    monkeypatch.setattr(Session, "commit", fail_delete)
    response = api.client.request("DELETE", f"{BASE}/{identifier}", headers=api.admin, json={"confirm_pair_loss": True})
    assert response.status_code == 500
    assert _counts(api) == (1, 1)
    retained = api.client.get(f"{BASE}/{identifier}/originals/acrf", headers=api.admin)
    assert retained.status_code == 200 and retained.content == before


def test_should_report_partial_render_as_failed_and_allow_only_explicit_retry(
    api: ArchiveApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    from src.services.design_snapshot_service import SnapshotError

    context = _context(api)
    body = {"request_id": uuid.uuid4().hex, "label": "retry-pair"}
    headers = {**api.admin, "If-Match": context["source_revision"]}
    original = frozen.render_frozen_pair

    def fail_partial(_inputs: Any, directory: Path, **kwargs: Any) -> Any:
        (directory / "ecrf.docx").write_bytes(b"synthetic partial original")
        raise SnapshotError("合成渲染失败", "BASELINE_RENDER_FAILED", 500)

    monkeypatch.setattr(frozen, "render_frozen_pair", fail_partial)
    failure = api.client.post(BASE, json=body, headers=headers)
    assert failure.status_code == 500
    assert _counts(api) == (0, 1)
    status = api.client.get(f"{BASE}/requests/{body['request_id']}", headers=api.admin)
    assert status.status_code == 200 and status.json()["status"] == "failed"
    monkeypatch.setattr(frozen, "render_frozen_pair", original)
    refused = api.client.post(BASE, json=body, headers=headers)
    assert refused.status_code == 409 and refused.json()["code"] == "BASELINE_CAPTURE_FAILED"
    retry = api.client.post(BASE, json={**body, "retry": True}, headers=headers)
    assert retry.status_code == 201, retry.text
    assert _counts(api) == (1, 1)


def test_should_never_hijack_active_request_with_explicit_retry(
    api: ArchiveApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    context = _context(api)
    body = {"request_id": uuid.uuid4().hex, "label": "active-pair"}
    headers = {**api.admin, "If-Match": context["source_revision"]}
    original = frozen.render_frozen_pair
    observed: list[int] = []

    def overlap(inputs: Any, directory: Path, **kwargs: Any) -> Any:
        repeated = api.client.post(BASE, json={**body, "retry": True}, headers=headers)
        observed.append(repeated.status_code)
        return original(inputs, directory, **kwargs)

    monkeypatch.setattr(frozen, "render_frozen_pair", overlap)
    response = api.client.post(BASE, json=body, headers=headers)
    assert response.status_code == 201, response.text
    assert observed == [409]
    assert _counts(api) == (1, 1)


def test_should_not_leak_history_through_another_project_scope(api: ArchiveApi) -> None:
    created = _create(api)
    assert created.status_code == 201, created.text
    with Session(api.engine) as session:
        session.add(Project(id=12, name="另一个项目", version="1", owner_id=2))
        session.commit()
    response = api.client.get(f"/api/admin/projects/12/design-baselines/{created.json()['id']}", headers=api.admin)
    assert response.status_code == 404
    assert "原始标签" not in response.text


@pytest.mark.unit
@pytest.mark.parametrize("confirmation", [1, "true", None, False])
def test_should_require_literal_boolean_whole_pair_confirmation(confirmation: Any) -> None:
    from pydantic import ValidationError
    from src.schemas.design_baseline import BaselineDelete

    with pytest.raises(ValidationError):
        BaselineDelete.model_validate({"confirm_pair_loss": confirmation})


def _logo_bytes() -> bytes:
    import struct
    import zlib

    def chunk(kind: bytes, content: bytes) -> bytes:
        return struct.pack(">I", len(content)) + kind + content + struct.pack(">I", zlib.crc32(kind + content))

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(b"\x00\x00\x00\x80"))
        + chunk(b"IEND", b"")
    )


def _install_logo(api: ArchiveApi, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("src.services.logo_storage_service.get_config", lambda: api.config)
    directory = Path(api.config.upload_path) / "logos"
    directory.mkdir(parents=True)
    path = directory / "synthetic.png"
    path.write_bytes(_logo_bytes())
    with Session(api.engine) as session:
        session.execute(update(Project).where(Project.id == 11).values(company_logo_path=path.name))
        session.commit()
    return path


def test_should_freeze_valid_logo_and_show_only_data_url_in_coherent_preview(
    api: ArchiveApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    import base64
    from zipfile import ZipFile
    from io import BytesIO

    path = _install_logo(api, monkeypatch)
    context = _context(api)
    assert base64.b64decode(context["logo_data_url"].split(",", 1)[1]) == _logo_bytes()
    assert str(path) not in str(context)
    created = _create(api)
    assert created.status_code == 201, created.text
    assert created.json()["asset_hash"] == hashlib.sha256(_logo_bytes()).hexdigest()
    for kind in ("ecrf", "acrf"):
        response = api.client.get(f"{BASE}/{created.json()['id']}/originals/{kind}", headers=api.admin)
        assert response.status_code == 200
        with ZipFile(BytesIO(response.content)) as archive:
            assert any(
                archive.read(name) == _logo_bytes() for name in archive.namelist() if name.startswith("word/media/")
            )


@pytest.mark.parametrize("defect", ["missing", "invalid", "symlink", "hardlink", "oversized", "traversal"])
def test_should_fail_closed_on_unfreezable_logo_before_writing_history(
    api: ArchiveApi, monkeypatch: pytest.MonkeyPatch, defect: str, tmp_path: Path
) -> None:
    import os

    path = _install_logo(api, monkeypatch)
    if defect == "missing":
        with Session(api.engine) as session:
            session.execute(update(Project).where(Project.id == 11).values(company_logo_path="missing.png"))
            session.commit()
    elif defect == "invalid":
        path.write_bytes(b"synthetic invalid image")
    elif defect == "symlink":
        linked = path.with_name("linked.png")
        linked.symlink_to(path)
        with Session(api.engine) as session:
            session.execute(update(Project).where(Project.id == 11).values(company_logo_path=linked.name))
            session.commit()
    elif defect == "hardlink":
        os.link(path, tmp_path / "shared-logo.png")
    elif defect == "oversized":
        with path.open("wb") as stream:
            stream.truncate(5 * 1024 * 1024 + 1)
    else:
        with Session(api.engine) as session:
            session.execute(update(Project).where(Project.id == 11).values(company_logo_path="../outside.png"))
            session.commit()

    response = api.client.get(BASE + "/capture-context", headers=api.admin)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "BASELINE_ASSET_INVALID"
    assert _counts(api) == (0, 0)
    assert str(path) not in response.text


def test_should_list_active_other_owned_projects_only_for_current_admin(api: ArchiveApi) -> None:
    with Session(api.engine) as session:
        session.add(Project(id=12, name="回收项目", version="1", owner_id=2, deleted_at=datetime(2026, 1, 1)))
        session.commit()
    response = api.client.get("/api/admin/design-baseline-projects", headers=api.admin)
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert response.json()["items"] == [{"id": 11, "name": "设计留档测试", "owner_username": "synthetic-archive-owner"}]


def test_should_begin_physical_snapshot_before_authentication_select(api: ArchiveApi) -> None:
    from sqlalchemy import event

    statements: list[str] = []

    def record(_connection: Any, _cursor: Any, statement: str, _parameters: Any, _context: Any, _many: bool) -> None:
        statements.append(statement)

    event.listen(api.engine, "before_cursor_execute", record)
    try:
        _context(api)
    finally:
        event.remove(api.engine, "before_cursor_execute", record)
    assert statements[0] == "BEGIN"
    assert "user" in statements[1]


def test_should_not_find_another_admins_request_by_identity(api: ArchiveApi) -> None:
    request_id = uuid.uuid4().hex
    created = _create(api, request_id=request_id)
    assert created.status_code == 201, created.text
    with Session(api.engine) as session:
        session.add(User(id=3, username="synthetic-other-admin", is_admin=True))
        session.commit()
    headers = {"Authorization": "Bearer " + create_access_token(3, "synthetic-other-admin", 0)}
    response = api.client.get(f"{BASE}/requests/{request_id}", headers=headers)
    assert response.status_code == 404
    assert created.json()["id"] not in response.text


def test_should_return_not_found_when_pair_is_deleted_before_read_lease_admission(
    wal_api: ArchiveApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = _create(wal_api)
    assert created.status_code == 201, created.text
    path = f"{BASE}/{created.json()['id']}"
    original_access = routes.project_history_access
    deletion_status: list[int] = []

    @contextmanager
    def delete_before_admission(project_id: int) -> Iterator[None]:
        deleted = wal_api.client.request("DELETE", path, json={"confirm_pair_loss": True}, headers=wal_api.admin)
        deletion_status.append(deleted.status_code)
        with original_access(project_id):
            yield

    monkeypatch.setattr(routes, "project_history_access", delete_before_admission)

    response = wal_api.client.get(path + "/originals/ecrf", headers=wal_api.admin)

    assert deletion_status == [200], "The competing deletion must actually commit and clean its synthetic pair"
    assert response.status_code == 404, response.text
    assert response.json()["detail"] == "留档不存在"
    assert response.headers["Cache-Control"] == "no-store"


@pytest.mark.parametrize("mutation,status", [("role", 403), ("auth_version", 401), ("recycle", 404)])
def test_should_reauthorize_after_changes_before_read_lease_admission(
    wal_api: ArchiveApi, monkeypatch: pytest.MonkeyPatch, mutation: str, status: int
) -> None:
    created = _create(wal_api)
    assert created.status_code == 201, created.text
    original_access = routes.project_history_access

    @contextmanager
    def change_before_admission(project_id: int) -> Iterator[None]:
        with Session(wal_api.engine) as writer:
            if mutation == "role":
                writer.execute(update(User).where(User.id == 1).values(is_admin=False))
            elif mutation == "auth_version":
                writer.execute(update(User).where(User.id == 1).values(auth_version=1))
            else:
                writer.execute(update(Project).where(Project.id == project_id).values(deleted_at=datetime.utcnow()))
            writer.commit()
        with original_access(project_id):
            yield

    monkeypatch.setattr(routes, "project_history_access", change_before_admission)

    response = wal_api.client.get(f"{BASE}/{created.json()['id']}/originals/acrf", headers=wal_api.admin)

    assert response.status_code == status
    assert response.headers["Cache-Control"] == "no-store"
    with routes.project_history_removal(11):
        pass  # Authorization failure must not leave a reader lease behind.


def test_should_block_pair_deletion_until_original_read_finishes(
    wal_api: ArchiveApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    created = _create(wal_api)
    assert created.status_code == 201, created.text
    archive = created.json()
    path = f"{BASE}/{archive['id']}"
    original_read = routes.storage.read_original
    deletion_status: list[int] = []

    def delete_during_read(*args: Any, **kwargs: Any) -> bytes:
        deleted = wal_api.client.request("DELETE", path, json={"confirm_pair_loss": True}, headers=wal_api.admin)
        deletion_status.append(deleted.status_code)
        return original_read(*args, **kwargs)

    monkeypatch.setattr(routes.storage, "read_original", delete_during_read)

    response = wal_api.client.get(path + "/originals/ecrf", headers=wal_api.admin)

    artifact = next(item for item in archive["artifacts"] if item["kind"] == "ecrf")
    assert deletion_status == [409]
    assert response.status_code == 200
    assert hashlib.sha256(response.content).hexdigest() == artifact["sha256"]
    removed = wal_api.client.request("DELETE", path, json={"confirm_pair_loss": True}, headers=wal_api.admin)
    assert removed.status_code == 200, removed.text


@pytest.mark.parametrize("actor,status", [("owner", 403), ("invalid", 401)])
def test_should_reject_unauthorized_actor_before_disclosing_a_busy_project(
    api: ArchiveApi, actor: str, status: int
) -> None:
    headers = api.owner if actor == "owner" else {"Authorization": "Bearer synthetic-not-a-browser-token"}
    with routes.project_history_removal(11):
        response = api.client.get(BASE, headers=headers)

    assert response.status_code == status
    assert response.headers["Cache-Control"] == "no-store"
