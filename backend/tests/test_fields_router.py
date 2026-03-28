"""字段接口集成测试

验证字段更新契约：
- 清空单位时显式提交 unit_id: null 能持久化为空
- 相关列表接口返回 trailing_underscore，支持导入后预览语义
"""
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from src.database import get_session
from src.models import Base
from src.models.project import Project
from src.models.form import Form
from src.models.field_definition import FieldDefinition
from src.models.form_field import FormField
from src.models.codelist import CodeList, CodeListOption


@pytest.fixture
def engine():
    """内存 SQLite 引擎，允许 TestClient 跨线程访问。"""
    _engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(_engine, "connect")
    def _enable_fk(dbapi_conn, connection_record):
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
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def project_id(client: TestClient) -> int:
    resp = client.post("/api/projects", json={"name": "字段项目", "version": "1.0"})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def unit_id(client: TestClient, project_id: int) -> int:
    resp = client.post(f"/api/projects/{project_id}/units", json={"symbol": "kg", "code": "KG"})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def field_definition_id(client: TestClient, project_id: int, unit_id: int) -> int:
    resp = client.post(
        f"/api/projects/{project_id}/field-definitions",
        json={
            "variable_name": "FIELD_WEIGHT",
            "label": "体重",
            "field_type": "数值",
            "unit_id": unit_id,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def form_id(client: TestClient, project_id: int) -> int:
    resp = client.post(f"/api/projects/{project_id}/forms", json={"name": "筛选表"})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def codelist_id(client: TestClient, project_id: int) -> int:
    resp = client.post(
        f"/api/projects/{project_id}/codelists",
        json={"name": "性别", "code": "CL_SEX"},
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
        form = Form(project_id=project.id, name="模板表单", code="FORM_TEMPLATE")
        session.add(form)
        session.flush()
        codelist = CodeList(project_id=project.id, name="性别", code="CL_TEMPLATE")
        session.add(codelist)
        session.flush()
        session.add_all([
            CodeListOption(codelist_id=codelist.id, code="1", decode="男", trailing_underscore=1, order_index=1),
            CodeListOption(codelist_id=codelist.id, code="2", decode="女", trailing_underscore=0, order_index=2),
        ])
        session.flush()
        field_definition = FieldDefinition(
            project_id=project.id,
            variable_name="FIELD_TEMPLATE",
            label="模板字段",
            field_type="单选",
            codelist_id=codelist.id,
        )
        session.add(field_definition)
        session.flush()
        session.add(FormField(
            form_id=form.id,
            field_definition_id=field_definition.id,
            sort_order=1,
        ))
        session.commit()

    engine.dispose()
    return SimpleNamespace(db_path=db_path, form_id=form.id)


@pytest.fixture
def choice_field_definition_id(client: TestClient, project_id: int, codelist_id: int) -> int:
    option1_resp = client.post(
        f"/api/projects/{project_id}/codelists/{codelist_id}/options",
        json={"code": "1", "decode": "男", "trailing_underscore": 1},
    )
    assert option1_resp.status_code == 201, option1_resp.text
    option2_resp = client.post(
        f"/api/projects/{project_id}/codelists/{codelist_id}/options",
        json={"code": "2", "decode": "女", "trailing_underscore": 0},
    )
    assert option2_resp.status_code == 201, option2_resp.text
    resp = client.post(
        f"/api/projects/{project_id}/field-definitions",
        json={
            "variable_name": "FIELD_SEX",
            "label": "性别",
            "field_type": "单选",
            "codelist_id": codelist_id,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_update_field_definition_can_clear_unit_with_null(
    client: TestClient,
    project_id: int,
    field_definition_id: int,
) -> None:
    resp = client.put(
        f"/api/projects/{project_id}/field-definitions/{field_definition_id}",
        json={"unit_id": None},
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["unit_id"] is None
    assert data["unit"] is None

    list_resp = client.get(f"/api/projects/{project_id}/field-definitions")
    assert list_resp.status_code == 200, list_resp.text
    matched = [item for item in list_resp.json() if item["id"] == field_definition_id]
    assert len(matched) == 1
    assert matched[0]["unit_id"] is None
    assert matched[0]["unit"] is None


def test_update_field_definition_clear_unit_is_idempotent_and_visible_in_form_readback(
    client: TestClient,
    project_id: int,
    form_id: int,
    field_definition_id: int,
) -> None:
    add_resp = client.post(
        f"/api/forms/{form_id}/fields",
        json={"field_definition_id": field_definition_id},
    )
    assert add_resp.status_code == 201, add_resp.text

    first_resp = client.put(
        f"/api/projects/{project_id}/field-definitions/{field_definition_id}",
        json={"unit_id": None},
    )
    assert first_resp.status_code == 200, first_resp.text

    second_resp = client.put(
        f"/api/projects/{project_id}/field-definitions/{field_definition_id}",
        json={"unit_id": None},
    )
    assert second_resp.status_code == 200, second_resp.text
    second_data = second_resp.json()
    assert second_data["unit_id"] is None
    assert second_data["unit"] is None

    form_fields_resp = client.get(f"/api/forms/{form_id}/fields")
    assert form_fields_resp.status_code == 200, form_fields_resp.text
    fields = form_fields_resp.json()
    assert len(fields) == 1
    field_definition = fields[0]["field_definition"]
    assert field_definition["id"] == field_definition_id
    assert field_definition["unit_id"] is None
    assert field_definition["unit"] is None


def test_patch_inline_mark_preserves_default_value_when_disabling(
    client: TestClient,
    form_id: int,
    field_definition_id: int,
) -> None:
    add_resp = client.post(
        f"/api/forms/{form_id}/fields",
        json={
            "field_definition_id": field_definition_id,
            "inline_mark": 1,
            "default_value": "保留值",
        },
    )
    assert add_resp.status_code == 201, add_resp.text
    form_field = add_resp.json()

    patch_resp = client.patch(
        f"/api/form-fields/{form_field['id']}/inline-mark",
        json={"inline_mark": 0},
    )
    assert patch_resp.status_code == 200, patch_resp.text
    patched = patch_resp.json()
    assert patched["inline_mark"] == 0
    assert patched["default_value"] == "保留值"

    list_resp = client.get(f"/api/forms/{form_id}/fields")
    assert list_resp.status_code == 200, list_resp.text
    matched = [item for item in list_resp.json() if item["id"] == form_field["id"]]
    assert len(matched) == 1
    assert matched[0]["inline_mark"] == 0
    assert matched[0]["default_value"] == "保留值"



def test_form_fields_response_includes_trailing_underscore_for_choice_options(
    client: TestClient,
    form_id: int,
    choice_field_definition_id: int,
) -> None:
    add_resp = client.post(
        f"/api/forms/{form_id}/fields",
        json={"field_definition_id": choice_field_definition_id},
    )
    assert add_resp.status_code == 201, add_resp.text

    list_resp = client.get(f"/api/forms/{form_id}/fields")
    assert list_resp.status_code == 200, list_resp.text
    fields = list_resp.json()
    assert len(fields) == 1

    options = fields[0]["field_definition"]["codelist"]["options"]
    assert [option["decode"] for option in options] == ["男", "女"]
    assert [option["trailing_underscore"] for option in options] == [1, 0]



def test_import_template_preview_response_includes_trailing_underscore(
    client: TestClient,
    project_id: int,
    template_db_path: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.routers import import_template as import_template_router

    monkeypatch.setattr(
        import_template_router,
        "get_config",
        lambda: SimpleNamespace(template_path=str(template_db_path.db_path)),
    )

    preview_resp = client.get(
        f"/api/projects/{project_id}/import-template/form-fields?form_id={template_db_path.form_id}"
    )
    assert preview_resp.status_code == 200, preview_resp.text
    payload = preview_resp.json()
    assert payload["form_id"] == template_db_path.form_id
    assert len(payload["fields"]) == 1
    options = payload["fields"][0]["options"]
    assert [option["decode"] for option in options] == ["男", "女"]
    assert [option["trailing_underscore"] for option in options] == [1, 0]
