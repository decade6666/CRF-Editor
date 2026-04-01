from pathlib import Path

from docx import Document
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from src.database import get_read_session, get_session
from src.models import Base
from src.models.project import Project
from src.models.user import User
from src.routers import export as export_router
from src.services.export_service import ExportService
from tests.helpers import auth_headers, login_as


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    with session_factory() as db_session:
        yield db_session

    engine.dispose()


@pytest.fixture
def engine():
    _engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(_engine, "connect")
    def _enable_fk(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys = ON")

    Base.metadata.create_all(_engine)
    yield _engine
    _engine.dispose()


@pytest.fixture
def client(engine) -> TestClient:
    def _override():
        with Session(engine) as db_session:
            with db_session.begin():
                yield db_session

    app.dependency_overrides[get_session] = _override
    app.dependency_overrides[get_read_session] = _override
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    app.dependency_overrides.clear()



def create_project(session: Session, name: str = "项目") -> Project:
    project = Project(name=name, version="v1.0")
    session.add(project)
    session.flush()
    return project



def test_validate_output_accepts_valid_docx(tmp_path: Path) -> None:
    output_path = tmp_path / "valid.docx"
    doc = Document()
    doc.add_table(rows=2, cols=3)  # 封面
    doc.add_table(rows=1, cols=1)  # 访视流程
    doc.add_table(rows=1, cols=2)  # 表单
    doc.save(output_path)

    ok, reason = ExportService._validate_output(str(output_path))

    assert ok is True
    assert reason == ""



def test_validate_output_rejects_insufficient_tables(tmp_path: Path) -> None:
    output_path = tmp_path / "insufficient.docx"
    doc = Document()
    doc.add_table(rows=2, cols=3)  # 封面
    doc.add_table(rows=1, cols=1)  # 访视流程
    doc.save(output_path)

    ok, reason = ExportService._validate_output(str(output_path))

    assert ok is False
    assert "結構不完整" in reason



def test_validate_output_rejects_zero_byte_file(tmp_path: Path) -> None:
    output_path = tmp_path / "empty.docx"
    output_path.write_bytes(b"")

    ok, reason = ExportService._validate_output(str(output_path))

    assert ok is False
    assert "0 字节" in reason



def test_prepare_export_returns_download_url_with_30min_ttl(
    client: TestClient,
    engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    export_router._export_cache.clear()

    with Session(engine) as session:
        user = User(username="bob")
        session.add(user)
        session.flush()
        project = Project(name="导出项目", version="v1.0", owner_id=user.id)
        session.add(project)
        session.commit()
        project_id = project.id

    token = login_as(client, "bob")

    monkeypatch.setattr(
        ExportService,
        "export_project_to_word",
        lambda self, project_id, output_path: Document().save(output_path) or True,
    )
    monkeypatch.setattr(
        ExportService,
        "_validate_output",
        staticmethod(lambda path: (True, "")),
    )

    response = client.post(
        f"/api/projects/{project_id}/export/word/prepare",
        headers=auth_headers(token),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["download_url"] == f"/api/export/download/{data['token']}"
    assert data["expires_in"] == 1800
    assert data["token"]


def test_prepare_export_rejects_invalid_docx(
    client: TestClient,
    engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    export_router._export_cache.clear()

    with Session(engine) as session:
        user = User(username="alice")
        session.add(user)
        session.flush()
        project = Project(name="导出项目", version="v1.0", owner_id=user.id)
        session.add(project)
        session.commit()
        project_id = project.id

    token = login_as(client, "alice")

    monkeypatch.setattr(
        ExportService,
        "export_project_to_word",
        lambda self, project_id, output_path: Path(output_path).write_bytes(b"PK") or True,
    )
    monkeypatch.setattr(
        ExportService,
        "_validate_output",
        staticmethod(lambda path: (False, "无效 docx")),
    )

    response = client.post(
        f"/api/projects/{project_id}/export/word/prepare",
        headers=auth_headers(token),
    )

    assert response.status_code == 500
    assert "无效 docx" in response.text
    assert export_router._export_cache == {}


def test_download_by_token_requires_authenticated_user(
    client: TestClient,
    engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    export_router._export_cache.clear()

    with Session(engine) as session:
        user = User(username="alice")
        session.add(user)
        session.flush()
        project = Project(name="导出项目", version="v1.0", owner_id=user.id)
        session.add(project)
        session.commit()
        project_id = project.id

    token = login_as(client, "alice")
    monkeypatch.setattr(
        ExportService,
        "export_project_to_word",
        lambda self, project_id, output_path: Document().save(output_path) or True,
    )
    monkeypatch.setattr(
        ExportService,
        "_validate_output",
        staticmethod(lambda path: (True, "")),
    )

    prepare_response = client.post(
        f"/api/projects/{project_id}/export/word/prepare",
        headers=auth_headers(token),
    )
    download_url = prepare_response.json()["download_url"].replace("http://testserver", "")

    download_response = client.get(download_url)

    assert download_response.status_code == 401



def test_download_by_token_forbids_other_user(
    client: TestClient,
    engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    export_router._export_cache.clear()

    with Session(engine) as session:
        alice = User(username="alice")
        bob = User(username="bob")
        session.add_all([alice, bob])
        session.flush()
        project = Project(name="导出项目", version="v1.0", owner_id=alice.id)
        session.add(project)
        session.commit()
        project_id = project.id

    alice_token = login_as(client, "alice")
    bob_token = login_as(client, "bob")
    monkeypatch.setattr(
        ExportService,
        "export_project_to_word",
        lambda self, project_id, output_path: Document().save(output_path) or True,
    )
    monkeypatch.setattr(
        ExportService,
        "_validate_output",
        staticmethod(lambda path: (True, "")),
    )

    prepare_response = client.post(
        f"/api/projects/{project_id}/export/word/prepare",
        headers=auth_headers(alice_token),
    )
    download_url = prepare_response.json()["download_url"].replace("http://testserver", "")

    download_response = client.get(download_url, headers=auth_headers(bob_token))

    assert download_response.status_code == 403



def test_download_by_token_allows_owner_with_auth_header(
    client: TestClient,
    engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    export_router._export_cache.clear()

    with Session(engine) as session:
        user = User(username="alice")
        session.add(user)
        session.flush()
        project = Project(name="导出项目", version="v1.0", owner_id=user.id)
        session.add(project)
        session.commit()
        project_id = project.id

    token = login_as(client, "alice")
    monkeypatch.setattr(
        ExportService,
        "export_project_to_word",
        lambda self, project_id, output_path: Document().save(output_path) or True,
    )
    monkeypatch.setattr(
        ExportService,
        "_validate_output",
        staticmethod(lambda path: (True, "")),
    )

    prepare_response = client.post(
        f"/api/projects/{project_id}/export/word/prepare",
        headers=auth_headers(token),
    )
    download_url = prepare_response.json()["download_url"].replace("http://testserver", "")

    download_response = client.get(download_url, headers=auth_headers(token))

    assert download_response.status_code == 200
    assert download_response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
