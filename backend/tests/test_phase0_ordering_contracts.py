"""Phase 0 排序真值与模板导入契约测试。"""
from __future__ import annotations

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
from src.models.unit import Unit
from src.models.user import User
from src.models.visit import Visit
from src.models.visit_form import VisitForm
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


def _create_visit_form_sequence_scope(engine, target_project_id: int) -> tuple[int, list[int]]:
    with Session(engine) as session:
        project = session.get(Project, target_project_id)
        assert project is not None

        visit = Visit(project_id=project.id, name="排序访视", code="VISIT_ORDER", sequence=1)
        session.add(visit)
        session.flush()

        form_ids = []
        for idx in range(1, 4):
            form = Form(
                project_id=project.id,
                name=f"访视表单{idx}",
                code=f"VISIT_FORM_{idx}",
                order_index=idx,
            )
            session.add(form)
            session.flush()

            visit_form = VisitForm(visit_id=visit.id, form_id=form.id, sequence=idx)
            session.add(visit_form)
            session.flush()
            form_ids.append(form.id)

        session.commit()
        return visit.id, form_ids


def test_reorder_projects_uses_active_scope_only(
    client: TestClient,
    engine,
    auth_token: str,
) -> None:
    with Session(engine) as session:
        owner = session.scalar(select(User).where(User.username == "alice"))
        assert owner is not None

        active_a = Project(name="项目A", version="1.0", owner_id=owner.id, order_index=1)
        active_b = Project(name="项目B", version="1.0", owner_id=owner.id, order_index=2)
        deleted_project = Project(
            name="回收站项目",
            version="1.0",
            owner_id=owner.id,
            order_index=3,
        )
        session.add_all([active_a, active_b, deleted_project])
        session.flush()
        deleted_project.deleted_at = deleted_project.created_at
        deleted_project_id = deleted_project.id
        session.commit()
        reordered_ids = [active_b.id, active_a.id]

    reorder_resp = client.post(
        "/api/projects/reorder",
        json=reordered_ids,
        headers=auth_headers(auth_token),
    )
    assert reorder_resp.status_code == 204, reorder_resp.text

    readback = client.get(
        "/api/projects",
        headers=auth_headers(auth_token),
    )
    assert readback.status_code == 200, readback.text
    payload = readback.json()
    assert [project["id"] for project in payload] == reordered_ids
    assert [project["order_index"] for project in payload] == [1, 2]

    with Session(engine) as session:
        deleted_project = session.get(Project, deleted_project_id)
        assert deleted_project is not None
        assert deleted_project.deleted_at is not None
        assert deleted_project.order_index == 3


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

        unit = Unit(project_id=project.id, symbol="kg", code="UNIT_KG", order_index=1)
        session.add(unit)
        session.flush()

        field_definitions = []
        for idx, variable_name in enumerate(["FIELD_A", "FIELD_B", "FIELD_C"], start=1):
            field_definition = FieldDefinition(
                project_id=project.id,
                variable_name=variable_name,
                label=f"字段{idx}",
                field_type="单选" if idx == 1 else "文本",
                codelist_id=codelist.id if idx == 1 else None,
                unit_id=unit.id if idx == 2 else None,
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
            codelist_id=codelist.id,
            unit_id=unit.id,
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


def test_field_level_import_preserves_source_relative_order(
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


def test_reorder_codelists_persists_dense_order_in_readback(
    client: TestClient,
    target_project_id: int,
    auth_token: str,
) -> None:
    first = client.post(
        f"/api/projects/{target_project_id}/codelists",
        json={"name": "字典A", "code": "CL_A"},
        headers=auth_headers(auth_token),
    )
    second = client.post(
        f"/api/projects/{target_project_id}/codelists",
        json={"name": "字典B", "code": "CL_B"},
        headers=auth_headers(auth_token),
    )
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text

    reordered_ids = [second.json()["id"], first.json()["id"]]
    resp = client.post(
        f"/api/projects/{target_project_id}/codelists/reorder",
        json=reordered_ids,
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 200, resp.text

    readback = client.get(
        f"/api/projects/{target_project_id}/codelists",
        headers=auth_headers(auth_token),
    )
    assert readback.status_code == 200, readback.text
    payload = readback.json()
    assert [item["id"] for item in payload] == reordered_ids
    assert [item["order_index"] for item in payload] == [1, 2]



def test_reorder_visit_forms_persists_dense_sequence_in_readback(
    client: TestClient,
    engine,
    target_project_id: int,
    auth_token: str,
) -> None:
    visit_id, form_ids = _create_visit_form_sequence_scope(engine, target_project_id)
    reordered_form_ids = [form_ids[2], form_ids[0], form_ids[1]]

    resp = client.post(
        f"/api/visits/{visit_id}/forms/reorder",
        json=reordered_form_ids,
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 204, resp.text

    matrix_resp = client.get(
        f"/api/projects/{target_project_id}/visit-form-matrix",
        headers=auth_headers(auth_token),
    )
    assert matrix_resp.status_code == 200, matrix_resp.text
    matrix = matrix_resp.json()["matrix"][str(visit_id)]
    assert [matrix[str(form_id)] for form_id in reordered_form_ids] == [1, 2, 3]

    with Session(engine) as session:
        visit_forms = list(
            session.scalars(
                select(VisitForm)
                .where(VisitForm.visit_id == visit_id)
                .order_by(VisitForm.sequence, VisitForm.id)
            ).all()
        )
        assert [item.form_id for item in visit_forms] == reordered_form_ids
        assert [item.sequence for item in visit_forms] == [1, 2, 3]



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


def test_field_level_import_rejects_duplicate_field_ids(
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

    duplicate_id = template_db_path.form_field_ids[0]
    resp = client.post(
        f"/api/projects/{target_project_id}/import-template/execute",
        json={
            "source_project_id": template_db_path.source_project_id,
            "form_ids": [template_db_path.form_id],
            "field_ids": [duplicate_id, duplicate_id],
        },
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 400, resp.text
    assert "重复" in resp.json()["detail"]



def test_field_level_import_rejects_out_of_scope_field_ids(
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


def test_field_level_import_includes_dependency_closure(
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

    selected_field_ids = [template_db_path.form_field_ids[0], template_db_path.form_field_ids[1]]
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
    payload = resp.json()
    assert payload["imported_form_count"] == 1
    assert payload["merged_units"] == 1
    assert payload["created_field_definitions"] == 2
    assert payload["created_form_fields"] == 2

    with Session(engine) as session:
        imported_defs = list(
            session.scalars(
                select(FieldDefinition)
                .where(FieldDefinition.project_id == target_project_id)
                .order_by(FieldDefinition.order_index, FieldDefinition.id)
            ).all()
        )
        assert len(imported_defs) == 2

        imported_codelists = list(
            session.scalars(
                select(CodeList).where(CodeList.project_id == target_project_id).order_by(CodeList.order_index, CodeList.id)
            ).all()
        )
        imported_units = list(
            session.scalars(
                select(Unit).where(Unit.project_id == target_project_id).order_by(Unit.order_index, Unit.id)
            ).all()
        )
        assert len(imported_codelists) == 1
        assert len(imported_units) == 1

        gender_field = next(definition for definition in imported_defs if definition.variable_name == "FIELD_A")
        weight_field = next(definition for definition in imported_defs if definition.variable_name == "FIELD_B")
        assert gender_field.codelist_id == imported_codelists[0].id
        assert weight_field.unit_id == imported_units[0].id

        option_decodes = list(
            session.scalars(
                select(CodeListOption.decode)
                .where(CodeListOption.codelist_id == imported_codelists[0].id)
                .order_by(CodeListOption.order_index, CodeListOption.id)
            ).all()
        )
        assert option_decodes == ["男", "女"]
        assert imported_units[0].symbol == "kg"



def test_field_level_import_no_orphan_references(
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

    resp = client.post(
        f"/api/projects/{target_project_id}/import-template/execute",
        json={
            "source_project_id": template_db_path.source_project_id,
            "form_ids": [template_db_path.form_id],
            "field_ids": template_db_path.form_field_ids[:2],
        },
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 200, resp.text

    with Session(engine) as session:
        valid_codelist_ids = set(
            session.scalars(select(CodeList.id).where(CodeList.project_id == target_project_id)).all()
        )
        valid_unit_ids = set(
            session.scalars(select(Unit.id).where(Unit.project_id == target_project_id)).all()
        )
        imported_defs = list(
            session.scalars(select(FieldDefinition).where(FieldDefinition.project_id == target_project_id)).all()
        )

        assert imported_defs
        for definition in imported_defs:
            if definition.codelist_id is not None:
                assert definition.codelist_id in valid_codelist_ids
            if definition.unit_id is not None:
                assert definition.unit_id in valid_unit_ids



def test_import_then_reorder_then_export_consistent_order(
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

    resp = client.post(
        f"/api/projects/{target_project_id}/import-template/execute",
        json={
            "source_project_id": template_db_path.source_project_id,
            "form_ids": [template_db_path.form_id],
            "field_ids": template_db_path.form_field_ids,
        },
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 200, resp.text

    with Session(engine) as session:
        imported_form = session.scalar(
            select(Form).where(Form.project_id == target_project_id).order_by(Form.id.desc())
        )
        assert imported_form is not None
        imported_form_id = imported_form.id
        imported_fields = list(
            session.scalars(
                select(FormField)
                .where(FormField.form_id == imported_form_id)
                .order_by(FormField.order_index, FormField.id)
            ).all()
        )
        assert len(imported_fields) == 3
        reorder_ids = [imported_fields[2].id, imported_fields[0].id, imported_fields[1].id]

    reorder_resp = client.post(
        f"/api/forms/{imported_form_id}/fields/reorder",
        json={"ordered_ids": reorder_ids},
        headers=auth_headers(auth_token),
    )
    assert reorder_resp.status_code == 204, reorder_resp.text

    with Session(engine) as session:
        ordered_fields = list(
            session.scalars(
                select(FormField)
                .where(FormField.form_id == imported_form_id)
                .order_by(FormField.order_index, FormField.id)
            ).all()
        )
        assert [field.id for field in ordered_fields] == reorder_ids
        assert [field.order_index for field in ordered_fields] == [1, 2, 3]
        segments = ExportService(session)._build_unified_segments(ordered_fields)
        exported_ids = [field.id for segment in segments for field in segment.fields]
        assert exported_ids == reorder_ids



def test_project_copy_preserves_order_index(
    client: TestClient,
    engine,
    target_project_id: int,
    auth_token: str,
) -> None:
    from src.config import StorageConfig

    form_id, field_ids = _create_ordered_form_fields(engine, target_project_id)
    reorder_ids = [field_ids[1], field_ids[2], field_ids[0]]

    reorder_resp = client.post(
        f"/api/forms/{form_id}/fields/reorder",
        json={"ordered_ids": reorder_ids},
        headers=auth_headers(auth_token),
    )
    assert reorder_resp.status_code == 204, reorder_resp.text

    test_config = AppConfig(
        auth=AuthConfig(secret_key="test-secret-key-for-testing"),
        admin=AdminConfig(username="admin"),
        storage=StorageConfig(upload_path="."),
    )

    with patch("src.services.project_clone_service.get_config", return_value=test_config), patch(
        "src.routers.projects.get_config", return_value=test_config
    ):
        copy_resp = client.post(
            f"/api/projects/{target_project_id}/copy",
            headers=auth_headers(auth_token),
        )
    assert copy_resp.status_code == 201, copy_resp.text
    copied_project_id = copy_resp.json()["id"]

    with Session(engine) as session:
        source_form = session.scalar(
            select(Form).where(Form.project_id == target_project_id).order_by(Form.id.asc())
        )
        copied_form = session.scalar(
            select(Form).where(Form.project_id == copied_project_id).order_by(Form.id.asc())
        )
        assert source_form is not None
        assert copied_form is not None

        source_fields = list(
            session.scalars(
                select(FormField)
                .where(FormField.form_id == source_form.id)
                .order_by(FormField.order_index, FormField.id)
            ).all()
        )
        copied_fields = list(
            session.scalars(
                select(FormField)
                .where(FormField.form_id == copied_form.id)
                .order_by(FormField.order_index, FormField.id)
            ).all()
        )
        assert [field.order_index for field in copied_fields] == [field.order_index for field in source_fields]

        source_defs = [session.get(FieldDefinition, field.field_definition_id) for field in source_fields]
        copied_defs = [session.get(FieldDefinition, field.field_definition_id) for field in copied_fields]
        assert [definition.variable_name for definition in copied_defs] == [definition.variable_name for definition in source_defs]
        assert [definition.id for definition in copied_defs] != [definition.id for definition in source_defs]



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


def test_quick_edit_updates_list_readback_and_export_consistently(
    client: TestClient,
    engine,
    target_project_id: int,
    auth_token: str,
) -> None:
    form_id, field_ids = _create_ordered_form_fields(engine, target_project_id)
    target_field_id = field_ids[1]

    update_resp = client.put(
        f"/api/form-fields/{target_field_id}",
        json={
            "label_override": "快捷编辑标签",
            "inline_mark": 1,
            "bg_color": "FFEEDD",
            "text_color": "112233",
        },
        headers=auth_headers(auth_token),
    )
    assert update_resp.status_code == 200, update_resp.text

    readback = client.get(
        f"/api/forms/{form_id}/fields",
        headers=auth_headers(auth_token),
    )
    assert readback.status_code == 200, readback.text
    payload = readback.json()
    matched = next(item for item in payload if item["id"] == target_field_id)
    assert matched["label_override"] == "快捷编辑标签"
    assert matched["inline_mark"] == 1
    assert matched["bg_color"] == "FFEEDD"
    assert matched["text_color"] == "112233"

    with Session(engine) as session:
        ordered_fields = list(
            session.scalars(
                select(FormField)
                .where(FormField.form_id == form_id)
                .order_by(FormField.order_index, FormField.id)
            ).all()
        )
        target_field = next(field for field in ordered_fields if field.id == target_field_id)
        assert target_field.label_override == "快捷编辑标签"
        assert target_field.inline_mark == 1
        assert target_field.bg_color == "FFEEDD"
        assert target_field.text_color == "112233"

        segments = ExportService(session)._build_unified_segments(ordered_fields)
        target_segment = next(segment for segment in segments if any(field.id == target_field_id for field in segment.fields))
        exported_field = next(field for field in target_segment.fields if field.id == target_field_id)
        assert target_segment.type == "inline_block"
        assert exported_field.label_override == "快捷编辑标签"
        assert exported_field.inline_mark == 1
        assert exported_field.bg_color == "FFEEDD"
        assert exported_field.text_color == "112233"


# ---------------------------------------------------------------------------
# Task 0.4: 拖拽与手改序号并存 — 连续 reorder 不回弹
# ---------------------------------------------------------------------------


def test_consecutive_reorder_keeps_dense_order(
    client: TestClient,
    engine,
    target_project_id: int,
    auth_token: str,
) -> None:
    """连续两次 reorder 后顺序仍为 1..n 稠密，刷新读回一致。"""
    form_id, field_ids = _create_ordered_form_fields(engine, target_project_id)

    # 第一次 reorder：[C, A, B]
    first_order = [field_ids[2], field_ids[0], field_ids[1]]
    resp1 = client.post(
        f"/api/forms/{form_id}/fields/reorder",
        json={"ordered_ids": first_order},
        headers=auth_headers(auth_token),
    )
    assert resp1.status_code == 204, resp1.text

    # 第二次 reorder：[B, C, A]
    second_order = [field_ids[1], field_ids[2], field_ids[0]]
    resp2 = client.post(
        f"/api/forms/{form_id}/fields/reorder",
        json={"ordered_ids": second_order},
        headers=auth_headers(auth_token),
    )
    assert resp2.status_code == 204, resp2.text

    # 验证读回顺序与第二次一致
    readback = client.get(
        f"/api/forms/{form_id}/fields",
        headers=auth_headers(auth_token),
    )
    payload = readback.json()
    assert [field["id"] for field in payload] == second_order
    assert [field["order_index"] for field in payload] == [1, 2, 3]

    # 验证数据库层面也稠密
    with Session(engine) as session:
        db_fields = list(
            session.scalars(
                select(FormField)
                .where(FormField.form_id == form_id)
                .order_by(FormField.order_index, FormField.id)
            ).all()
        )
        assert [field.order_index for field in db_fields] == [1, 2, 3]


def test_reorder_then_add_field_compacts_correctly(
    client: TestClient,
    engine,
    target_project_id: int,
    auth_token: str,
) -> None:
    """reorder 后在指定位置插入字段，整体顺序仍稠密。"""
    form_id, field_ids = _create_ordered_form_fields(engine, target_project_id)

    # reorder 为 [A, C, B]
    reordered = [field_ids[0], field_ids[2], field_ids[1]]
    resp = client.post(
        f"/api/forms/{form_id}/fields/reorder",
        json={"ordered_ids": reordered},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 204, resp.text

    # 在位置 2 插入新字段（应排在第 2 位，原 2/3 后移）
    create_fd_resp = client.post(
        f"/api/projects/{target_project_id}/field-definitions",
        json={"variable_name": "INSERT_AFTER_REORDER", "label": "插入字段", "field_type": "文本"},
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


def test_reorder_then_delete_compacts_remaining(
    client: TestClient,
    engine,
    target_project_id: int,
    auth_token: str,
) -> None:
    """reorder 后删除中间字段，剩余字段自动压实。"""
    form_id, field_ids = _create_ordered_form_fields(engine, target_project_id)

    # reorder 为 [C, A, B]
    reordered = [field_ids[2], field_ids[0], field_ids[1]]
    resp = client.post(
        f"/api/forms/{form_id}/fields/reorder",
        json={"ordered_ids": reordered},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 204, resp.text

    # 删除当前排在第 2 位的字段（原始 field_ids[0]）
    delete_resp = client.delete(
        f"/api/form-fields/{field_ids[0]}",
        headers=auth_headers(auth_token),
    )
    assert delete_resp.status_code == 204, delete_resp.text

    readback = client.get(
        f"/api/forms/{form_id}/fields",
        headers=auth_headers(auth_token),
    )
    payload = readback.json()
    assert [field["id"] for field in payload] == [field_ids[2], field_ids[1]]
    assert [field["order_index"] for field in payload] == [1, 2]
