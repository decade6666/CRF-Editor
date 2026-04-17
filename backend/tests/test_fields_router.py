"""字段接口集成测试

验证字段更新契约：
- 清空单位时显式提交 unit_id: null 能持久化为空
- 相关列表接口返回 trailing_underscore，支持导入后预览语义
"""
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from helpers import auth_headers, login_as
from src.models import Base
from src.models.project import Project
from src.models.form import Form
from src.models.field_definition import FieldDefinition
from src.models.form_field import FormField
from src.models.codelist import CodeList, CodeListOption


@pytest.fixture
def auth_token(client: TestClient) -> str:
    return login_as(client, "alice")


@pytest.fixture
def project_id(client: TestClient, auth_token: str) -> int:
    resp = client.post(
        "/api/projects",
        json={"name": "字段项目", "version": "1.0"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def unit_id(client: TestClient, project_id: int, auth_token: str) -> int:
    resp = client.post(
        f"/api/projects/{project_id}/units",
        json={"symbol": "kg", "code": "KG"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def field_definition_id(client: TestClient, project_id: int, unit_id: int, auth_token: str) -> int:
    resp = client.post(
        f"/api/projects/{project_id}/field-definitions",
        json={
            "variable_name": "FIELD_WEIGHT",
            "label": "体重",
            "field_type": "数值",
            "unit_id": unit_id,
        },
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def form_id(client: TestClient, project_id: int, auth_token: str) -> int:
    resp = client.post(
        f"/api/projects/{project_id}/forms",
        json={"name": "筛选表"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.fixture
def codelist_id(client: TestClient, project_id: int, auth_token: str) -> int:
    resp = client.post(
        f"/api/projects/{project_id}/codelists",
        json={"name": "性别", "code": "CL_SEX"},
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
            order_index=1,
        ))
        session.commit()

    engine.dispose()
    return SimpleNamespace(db_path=db_path, form_id=form.id)


@pytest.fixture
def choice_field_definition_id(client: TestClient, project_id: int, codelist_id: int, auth_token: str) -> int:
    option1_resp = client.post(
        f"/api/projects/{project_id}/codelists/{codelist_id}/options",
        json={"code": "1", "decode": "男", "trailing_underscore": 1},
        headers=auth_headers(auth_token),
    )
    assert option1_resp.status_code == 201, option1_resp.text
    option2_resp = client.post(
        f"/api/projects/{project_id}/codelists/{codelist_id}/options",
        json={"code": "2", "decode": "女", "trailing_underscore": 0},
        headers=auth_headers(auth_token),
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
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_update_field_definition_can_clear_unit_with_null(
    client: TestClient,
    project_id: int,
    field_definition_id: int,
    auth_token: str,
) -> None:
    resp = client.put(
        f"/api/projects/{project_id}/field-definitions/{field_definition_id}",
        json={"unit_id": None},
        headers=auth_headers(auth_token),
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["unit_id"] is None
    assert data["unit"] is None

    list_resp = client.get(
        f"/api/projects/{project_id}/field-definitions",
        headers=auth_headers(auth_token),
    )
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
    auth_token: str,
) -> None:
    add_resp = client.post(
        f"/api/forms/{form_id}/fields",
        json={"field_definition_id": field_definition_id},
        headers=auth_headers(auth_token),
    )
    assert add_resp.status_code == 201, add_resp.text

    first_resp = client.put(
        f"/api/projects/{project_id}/field-definitions/{field_definition_id}",
        json={"unit_id": None},
        headers=auth_headers(auth_token),
    )
    assert first_resp.status_code == 200, first_resp.text

    second_resp = client.put(
        f"/api/projects/{project_id}/field-definitions/{field_definition_id}",
        json={"unit_id": None},
        headers=auth_headers(auth_token),
    )
    assert second_resp.status_code == 200, second_resp.text
    second_data = second_resp.json()
    assert second_data["unit_id"] is None
    assert second_data["unit"] is None

    form_fields_resp = client.get(
        f"/api/forms/{form_id}/fields",
        headers=auth_headers(auth_token),
    )
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
    auth_token: str,
) -> None:
    add_resp = client.post(
        f"/api/forms/{form_id}/fields",
        json={
            "field_definition_id": field_definition_id,
            "inline_mark": 1,
            "default_value": "保留值",
        },
        headers=auth_headers(auth_token),
    )
    assert add_resp.status_code == 201, add_resp.text
    form_field = add_resp.json()

    patch_resp = client.patch(
        f"/api/form-fields/{form_field['id']}/inline-mark",
        json={"inline_mark": 0},
        headers=auth_headers(auth_token),
    )
    assert patch_resp.status_code == 200, patch_resp.text
    patched = patch_resp.json()
    assert patched["inline_mark"] == 0
    assert patched["default_value"] == "保留值"

    list_resp = client.get(
        f"/api/forms/{form_id}/fields",
        headers=auth_headers(auth_token),
    )
    assert list_resp.status_code == 200, list_resp.text
    matched = [item for item in list_resp.json() if item["id"] == form_field["id"]]
    assert len(matched) == 1
    assert matched[0]["inline_mark"] == 0
    assert matched[0]["default_value"] == "保留值"



def test_form_fields_response_includes_trailing_underscore_for_choice_options(
    client: TestClient,
    form_id: int,
    choice_field_definition_id: int,
    auth_token: str,
) -> None:
    add_resp = client.post(
        f"/api/forms/{form_id}/fields",
        json={"field_definition_id": choice_field_definition_id},
        headers=auth_headers(auth_token),
    )
    assert add_resp.status_code == 201, add_resp.text

    list_resp = client.get(
        f"/api/forms/{form_id}/fields",
        headers=auth_headers(auth_token),
    )
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
    auth_token: str,
) -> None:
    from src.routers import import_template as import_template_router

    monkeypatch.setattr(
        import_template_router,
        "get_config",
        lambda: SimpleNamespace(template_path=str(template_db_path.db_path)),
    )

    preview_resp = client.get(
        f"/api/projects/{project_id}/import-template/form-fields?form_id={template_db_path.form_id}",
        headers=auth_headers(auth_token),
    )
    assert preview_resp.status_code == 200, preview_resp.text
    payload = preview_resp.json()
    assert payload["form_id"] == template_db_path.form_id
    assert len(payload["fields"]) == 1
    options = payload["fields"][0]["options"]
    assert [option["decode"] for option in options] == ["男", "女"]
    assert [option["trailing_underscore"] for option in options] == [1, 0]


def test_patch_colors_can_clear_bg_and_set_text_black(
    client: TestClient,
    form_id: int,
    field_definition_id: int,
    auth_token: str,
) -> None:
    add_resp = client.post(
        f"/api/forms/{form_id}/fields",
        json={"field_definition_id": field_definition_id},
        headers=auth_headers(auth_token),
    )
    assert add_resp.status_code == 201, add_resp.text
    form_field = add_resp.json()

    seed_resp = client.put(
        f"/api/form-fields/{form_field['id']}",
        json={"bg_color": "FFEEDD", "text_color": "112233"},
        headers=auth_headers(auth_token),
    )
    assert seed_resp.status_code == 200, seed_resp.text
    seeded = seed_resp.json()
    assert seeded["bg_color"] == "FFEEDD"
    assert seeded["text_color"] == "112233"

    patch_resp = client.patch(
        f"/api/form-fields/{form_field['id']}/colors",
        json={"bg_color": None, "text_color": "000000"},
        headers=auth_headers(auth_token),
    )
    assert patch_resp.status_code == 200, patch_resp.text
    patched = patch_resp.json()
    assert patched["bg_color"] is None
    assert patched["text_color"] == "000000"

    list_resp = client.get(
        f"/api/forms/{form_id}/fields",
        headers=auth_headers(auth_token),
    )
    assert list_resp.status_code == 200, list_resp.text
    matched = [item for item in list_resp.json() if item["id"] == form_field["id"]]
    assert len(matched) == 1
    assert matched[0]["bg_color"] is None
    assert matched[0]["text_color"] == "000000"


def test_patch_colors_rejects_invalid_hex(
    client: TestClient,
    form_id: int,
    field_definition_id: int,
    auth_token: str,
) -> None:
    add_resp = client.post(
        f"/api/forms/{form_id}/fields",
        json={"field_definition_id": field_definition_id},
        headers=auth_headers(auth_token),
    )
    assert add_resp.status_code == 201, add_resp.text
    form_field = add_resp.json()

    patch_resp = client.patch(
        f"/api/form-fields/{form_field['id']}/colors",
        json={"text_color": "GGGGGG"},
        headers=auth_headers(auth_token),
    )
    assert patch_resp.status_code == 422, patch_resp.text


def test_patch_colors_keeps_omitted_field_unchanged(
    client: TestClient,
    form_id: int,
    field_definition_id: int,
    auth_token: str,
) -> None:
    add_resp = client.post(
        f"/api/forms/{form_id}/fields",
        json={"field_definition_id": field_definition_id},
        headers=auth_headers(auth_token),
    )
    assert add_resp.status_code == 201, add_resp.text
    form_field = add_resp.json()

    seed_resp = client.put(
        f"/api/form-fields/{form_field['id']}",
        json={"bg_color": "FFEEDD", "text_color": "112233"},
        headers=auth_headers(auth_token),
    )
    assert seed_resp.status_code == 200, seed_resp.text

    patch_resp = client.patch(
        f"/api/form-fields/{form_field['id']}/colors",
        json={"text_color": "000000"},
        headers=auth_headers(auth_token),
    )
    assert patch_resp.status_code == 200, patch_resp.text
    patched = patch_resp.json()
    assert patched["bg_color"] == "FFEEDD"
    assert patched["text_color"] == "000000"


@pytest.mark.parametrize(
    ("payload", "expected_status", "expected_bg_color", "expected_text_color"),
    [
        ({"bg_color": None}, 200, None, "112233"),
        ({"text_color": None}, 200, "FFEEDD", None),
        ({"bg_color": "A1B2C3", "text_color": "000000"}, 200, "A1B2C3", "000000"),
        ({"text_color": "GGGGGG"}, 422, None, None),
    ],
)
def test_put_form_field_color_validation_and_null_semantics(
    client: TestClient,
    form_id: int,
    field_definition_id: int,
    auth_token: str,
    payload: dict,
    expected_status: int,
    expected_bg_color: str | None,
    expected_text_color: str | None,
) -> None:
    add_resp = client.post(
        f"/api/forms/{form_id}/fields",
        json={"field_definition_id": field_definition_id},
        headers=auth_headers(auth_token),
    )
    assert add_resp.status_code == 201, add_resp.text
    form_field = add_resp.json()

    seed_resp = client.put(
        f"/api/form-fields/{form_field['id']}",
        json={"bg_color": "FFEEDD", "text_color": "112233"},
        headers=auth_headers(auth_token),
    )
    assert seed_resp.status_code == 200, seed_resp.text

    put_resp = client.put(
        f"/api/form-fields/{form_field['id']}",
        json=payload,
        headers=auth_headers(auth_token),
    )
    assert put_resp.status_code == expected_status, put_resp.text

    if expected_status != 200:
        return

    updated = put_resp.json()
    assert updated["bg_color"] == expected_bg_color
    assert updated["text_color"] == expected_text_color
