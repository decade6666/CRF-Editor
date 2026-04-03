"""Phase 0 排序真值与模板导入契约测试。"""
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from helpers import auth_headers, login_as
from main import app
from src.config import AdminConfig, AppConfig, AuthConfig
from src.database import get_session
from src.models import Base

_TEST_CONFIG = AppConfig(
    auth=AuthConfig(secret_key="test-secret-key-for-testing"),
    admin=AdminConfig(username="admin"),
)
from src.models.codelist import CodeList, CodeListOption
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.user import User
from src.routers import settings as settings_router
from src.services.export_service import ExportService


@pytest.fixture
def engine():
    """内存 SQLite 引擎，允许 TestClient 跨线程访问。"""
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
def client(engine):
    """TestClient，依赖注入替换为内存 Session。"""

    def _override():
        with Session(engine) as session:
            with session.begin():
                yield session

    app.dependency_overrides[get_session] = _override
    with patch("main.get_config", return_value=_TEST_CONFIG), \
         patch("src.database.get_config", return_value=_TEST_CONFIG), \
         patch("src.services.auth_service.get_config", return_value=_TEST_CONFIG), \
         patch("src.dependencies.get_config", return_value=_TEST_CONFIG), \
         patch("src.routers.admin.get_config", return_value=_TEST_CONFIG), \
         patch("main.init_db"):
        with TestClient(app, raise_server_exceptions=False) as c:
            yield c
    app.dependency_overrides.clear()


@pytest.fixture
def auth_token(client: TestClient) -> str:
    return login_as(client, "alice")


@pytest.fixture
def target_project_id(client: TestClient, auth_token: str) -> int:
    resp = client.post(
        "/api/projects",
        json={"name": "目标项目", "version": "1.0"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def template_db_path(tmp_path: Path) -> SimpleNamespace:
    db_path = tmp_path / "template_preview.db"
    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    with session_factory() as session:
        project = Project(name="模板项目", version="v1.0")
        session.add(project)
        session.flush()

        form = Form(project_id=project.id, name="模板表单", code="FORM_TEMPLATE", order_index=1)
        session.add(form)
        session.flush()

        codelist = CodeList(project_id=project.id, name="性别", code="CL_TEMPLATE", order_index=1)
        session.add(codelist)
        session.flush()

        session.add_all(
            [
                CodeListOption(codelist_id=codelist.id, code="1", decode="男", trailing_underscore=1, order_index=1),
                CodeListOption(codelist_id=codelist.id, code="2", decode="女", trailing_underscore=0, order_index=2),
            ]
        )
        session.flush()

        field_definitions = []
        for idx, variable_name in enumerate(["FIELD_A", "FIELD_B", "FIELD_C"], start=1):
            field_definition = FieldDefinition(
                project_id=project.id,
                variable_name=variable_name,
                label=f"字段{idx}",
                field_type="单选" if idx == 1 else "文本",
                codelist_id=codelist.id if idx == 1 else None,
                order_index=idx,
            )
            session.add(field_definition)
            session.flush()
            field_definitions.append(field_definition)

        form_fields = []
        for order_index, field_definition in zip([10, 20, 30], field_definitions):
            form_field = FormField(
                form_id=form.id,
                field_definition_id=field_definition.id,
                order_index=order_index,
                inline_mark=0,
            )
            session.add(form_field)
            session.flush()
            form_fields.append(form_field)

        session.commit()

        result = SimpleNamespace(
            db_path=db_path,
            source_project_id=project.id,
            form_id=form.id,
            form_field_ids=[form_field.id for form_field in form_fields],
        )

    engine.dispose()
    return result


def test_import_template_preview_exposes_form_field_id_and_source_project_id(
    client: TestClient,
    target_project_id: int,
    auth_token: str,
    template_db_path: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.routers import import_template as import_template_router

    monkeypatch.setattr(
        import_template_router,
        "get_config",
        lambda: SimpleNamespace(template_path=str(template_db_path.db_path)),
    )

    resp = client.get(
        f"/api/projects/{target_project_id}/import-template/form-fields?form_id={template_db_path.form_id}",
        headers=auth_headers(auth_token),
    )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["form_id"] == template_db_path.form_id
    assert [field["id"] for field in payload["fields"]] == template_db_path.form_field_ids
    assert {field["project_id"] for field in payload["fields"]} == {template_db_path.source_project_id}


def test_import_forms_with_field_ids_compacts_order_index_and_preserves_source_order(
    client: TestClient,
    engine,
    target_project_id: int,
    auth_token: str,
    template_db_path: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.routers import import_template as import_template_router

    monkeypatch.setattr(
        import_template_router,
        "get_config",
        lambda: SimpleNamespace(template_path=str(template_db_path.db_path)),
    )

    selected_field_ids = [template_db_path.form_field_ids[2], template_db_path.form_field_ids[0]]

    resp = client.post(
        f"/api/projects/{target_project_id}/import-template/execute",
        json={
            "source_project_id": template_db_path.source_project_id,
            "form_ids": [template_db_path.form_id],
            "field_ids": selected_field_ids,
        },
        headers=auth_headers(auth_token),
    )

    assert resp.status_code == 200, resp.text

    with Session(engine) as session:
        imported_form = session.scalar(
            select(Form)
            .where(Form.project_id == target_project_id)
            .order_by(Form.id.desc())
        )
        assert imported_form is not None

        imported_fields = list(
            session.scalars(
                select(FormField)
                .where(FormField.form_id == imported_form.id)
                .order_by(FormField.order_index, FormField.id)
            ).all()
        )
        assert [field.order_index for field in imported_fields] == [1, 2]

        imported_definitions = [
            session.get(FieldDefinition, field.field_definition_id) for field in imported_fields
        ]
        assert [definition.label for definition in imported_definitions] == ["字段1", "字段3"]


def _create_ordered_form_fields(engine, target_project_id: int) -> tuple[int, list[int]]:
    with Session(engine) as session:
        owner = session.scalar(select(User).where(User.username == "alice"))
        assert owner is not None

        project = session.get(Project, target_project_id)
        assert project is not None
        assert project.owner_id == owner.id

        form = Form(project_id=project.id, name="排序表单", code="FORM_ORDER", order_index=1)
        session.add(form)
        session.flush()

        field_ids = []
        for idx in range(1, 4):
            field_definition = FieldDefinition(
                project_id=project.id,
                variable_name=f"ORDER_FIELD_{idx}",
                label=f"排序字段{idx}",
                field_type="文本",
                order_index=idx,
            )
            session.add(field_definition)
            session.flush()

            form_field = FormField(
                form_id=form.id,
                field_definition_id=field_definition.id,
                order_index=idx,
            )
            session.add(form_field)
            session.flush()
            field_ids.append(form_field.id)

        session.commit()
        return form.id, field_ids


def test_reorder_form_fields_persists_dense_order_in_readback(
    client: TestClient,
    engine,
    target_project_id: int,
    auth_token: str,
) -> None:
    form_id, field_ids = _create_ordered_form_fields(engine, target_project_id)
    reordered_ids = [field_ids[2], field_ids[0], field_ids[1]]

    resp = client.post(
        f"/api/forms/{form_id}/fields/reorder",
        json={"ordered_ids": reordered_ids},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 204, resp.text

    readback = client.get(
        f"/api/forms/{form_id}/fields",
        headers=auth_headers(auth_token),
    )
    assert readback.status_code == 200, readback.text
    payload = readback.json()
    assert [field["id"] for field in payload] == reordered_ids
    assert [field["order_index"] for field in payload] == [1, 2, 3]


def test_export_service_reads_same_field_order_after_reorder(
    client: TestClient,
    engine,
    target_project_id: int,
    auth_token: str,
) -> None:
    form_id, field_ids = _create_ordered_form_fields(engine, target_project_id)
    reordered_ids = [field_ids[1], field_ids[2], field_ids[0]]

    resp = client.post(
        f"/api/forms/{form_id}/fields/reorder",
        json={"ordered_ids": reordered_ids},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 204, resp.text

    with Session(engine) as session:
        ordered_fields = list(
            session.scalars(
                select(FormField)
                .where(FormField.form_id == form_id)
                .order_by(FormField.order_index, FormField.id)
            ).all()
        )
        segments = ExportService(session)._build_unified_segments(ordered_fields)
        exported_ids = [field.id for segment in segments for field in segment.fields]
        assert exported_ids == reordered_ids


def test_add_form_field_with_explicit_order_compacts_existing_rows(
    client: TestClient,
    engine,
    target_project_id: int,
    auth_token: str,
) -> None:
    form_id, _ = _create_ordered_form_fields(engine, target_project_id)

    create_fd_resp = client.post(
        f"/api/projects/{target_project_id}/field-definitions",
        json={"variable_name": "INSERT_FIELD", "label": "插入字段", "field_type": "文本"},
        headers=auth_headers(auth_token),
    )
    assert create_fd_resp.status_code == 201, create_fd_resp.text
    new_fd_id = create_fd_resp.json()["id"]

    add_resp = client.post(
        f"/api/forms/{form_id}/fields",
        json={"field_definition_id": new_fd_id, "order_index": 2},
        headers=auth_headers(auth_token),
    )
    assert add_resp.status_code == 201, add_resp.text

    readback = client.get(
        f"/api/forms/{form_id}/fields",
        headers=auth_headers(auth_token),
    )
    payload = readback.json()
    assert [field["order_index"] for field in payload] == [1, 2, 3, 4]
    assert payload[1]["field_definition_id"] == new_fd_id


def test_delete_form_field_compacts_remaining_order(client: TestClient, engine, target_project_id: int, auth_token: str) -> None:
    form_id, field_ids = _create_ordered_form_fields(engine, target_project_id)

    delete_resp = client.delete(
        f"/api/form-fields/{field_ids[1]}",
        headers=auth_headers(auth_token),
    )
    assert delete_resp.status_code == 204, delete_resp.text

    readback = client.get(
        f"/api/forms/{form_id}/fields",
        headers=auth_headers(auth_token),
    )
    payload = readback.json()
    assert [field["id"] for field in payload] == [field_ids[0], field_ids[2]]
    assert [field["order_index"] for field in payload] == [1, 2]


def test_import_forms_rejects_out_of_scope_field_ids(
    client: TestClient,
    target_project_id: int,
    auth_token: str,
    template_db_path: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.routers import import_template as import_template_router

    monkeypatch.setattr(
        import_template_router,
        "get_config",
        lambda: SimpleNamespace(template_path=str(template_db_path.db_path)),
    )

    resp = client.post(
        f"/api/projects/{target_project_id}/import-template/execute",
        json={
            "source_project_id": template_db_path.source_project_id,
            "form_ids": [template_db_path.form_id],
            "field_ids": [template_db_path.form_field_ids[0], 999999],
        },
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 400, resp.text


def test_update_settings_requires_admin(client: TestClient) -> None:
    user_token = login_as(client, "alice")
    resp = client.put(
        "/api/settings",
        json={
            "template_path": "D:/templates/library.db",
            "ai_enabled": True,
            "ai_api_url": "https://example.com",
            "ai_api_key": "",
            "ai_model": "demo-model",
            "ai_api_format": "openai",
        },
        headers=auth_headers(user_token),
    )
    assert resp.status_code == 403, resp.text


def test_reorder_form_fields_returns_400_when_ordered_ids_are_incomplete(
    client: TestClient,
    engine,
    target_project_id: int,
    auth_token: str,
) -> None:
    form_id, field_ids = _create_ordered_form_fields(engine, target_project_id)

    resp = client.post(
        f"/api/forms/{form_id}/fields/reorder",
        json={"ordered_ids": field_ids[:2]},
        headers=auth_headers(auth_token),
    )

    assert resp.status_code == 400, resp.text
    assert "ID 列表不完整" in resp.json()["detail"]

    with Session(engine) as session:
        persisted_fields = list(
            session.scalars(
                select(FormField)
                .where(FormField.form_id == form_id)
                .order_by(FormField.order_index, FormField.id)
            ).all()
        )
        assert [field.id for field in persisted_fields] == field_ids
