"""字段接口集成测试

验证字段更新契约：
- 清空单位时显式提交 unit_id: null 能持久化为空
- 相关列表接口返回精简后的选项结构，支持导入后预览语义
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from helpers import auth_headers, login_as
from src.models import Base
from src.models.project import Project
from src.services import import_service as import_service_module
from src.models.form import Form
from src.models.field_definition import FieldDefinition
from src.models.form_field import FormField
from src.models.codelist import CodeList, CodeListOption
from src.database import _migrate_add_field_definition_checkbox_label


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
        session.add_all(
            [
                CodeListOption(codelist_id=codelist.id, code="1", decode="男", order_index=1),
                CodeListOption(codelist_id=codelist.id, code="2", decode="女", order_index=2),
            ]
        )
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
        session.add(
            FormField(
                form_id=form.id,
                field_definition_id=field_definition.id,
                order_index=1,
            )
        )
        session.commit()

    engine.dispose()
    return SimpleNamespace(db_path=db_path, allowed_template_path=db_path, form_id=form.id)


@pytest.fixture
def choice_field_definition_id(client: TestClient, project_id: int, codelist_id: int, auth_token: str) -> int:
    option1_resp = client.post(
        f"/api/projects/{project_id}/codelists/{codelist_id}/options",
        json={"code": "1", "decode": "男"},
        headers=auth_headers(auth_token),
    )
    assert option1_resp.status_code == 201, option1_resp.text
    option2_resp = client.post(
        f"/api/projects/{project_id}/codelists/{codelist_id}/options",
        json={"code": "2", "decode": "女"},
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


def create_form(client: TestClient, project_id: int, auth_token: str, *, name: str) -> int:
    resp = client.post(
        f"/api/projects/{project_id}/forms",
        json={"name": name},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def create_label_field_definition(
    client: TestClient,
    project_id: int,
    auth_token: str,
    *,
    variable_name: str,
    label: str,
) -> int:
    resp = client.post(
        f"/api/projects/{project_id}/field-definitions",
        json={
            "variable_name": variable_name,
            "label": label,
            "field_type": "标签",
        },
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def add_form_field(client: TestClient, form_id: int, field_definition_id: int, auth_token: str) -> dict:
    resp = client.post(
        f"/api/forms/{form_id}/fields",
        json={"field_definition_id": field_definition_id},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


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


def test_checkbox_label_migration_is_idempotent(tmp_path: Path) -> None:
    db_path = tmp_path / "legacy_fields.db"
    migration_engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    with migration_engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE field_definition ("
                "id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, label VARCHAR(255) NOT NULL)"
            )
        )

    _migrate_add_field_definition_checkbox_label(migration_engine)
    _migrate_add_field_definition_checkbox_label(migration_engine)

    columns = {column["name"]: column for column in inspect(migration_engine).get_columns("field_definition")}
    assert columns["checkbox_label"]["nullable"] is True
    migration_engine.dispose()


def test_checkbox_model_clears_codelist_regardless_constructor_assignment_order() -> None:
    checkbox = FieldDefinition(
        project_id=1,
        variable_name="SIGNED",
        label="已签署",
        codelist_id=999,
        field_type="复选",
    )

    assert checkbox.codelist_id is None


def test_checkbox_field_definition_persists_without_codelist(
    client: TestClient,
    project_id: int,
    form_id: int,
    codelist_id: int,
    auth_token: str,
) -> None:
    create_resp = client.post(
        f"/api/projects/{project_id}/field-definitions",
        json={
            "variable_name": "SIGNED",
            "label": "已签署",
            "field_type": "复选",
            "checkbox_label": "本人已签署",
            "codelist_id": codelist_id,
        },
        headers=auth_headers(auth_token),
    )

    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    assert created["field_type"] == "复选"
    assert created["checkbox_label"] == "本人已签署"
    assert created["codelist_id"] is None
    assert created["codelist"] is None

    choice_resp = client.post(
        f"/api/projects/{project_id}/field-definitions",
        json={
            "variable_name": "CONSENT",
            "label": "知情同意",
            "field_type": "单选",
            "codelist_id": codelist_id,
        },
        headers=auth_headers(auth_token),
    )
    assert choice_resp.status_code == 201, choice_resp.text

    update_resp = client.put(
        f"/api/projects/{project_id}/field-definitions/{choice_resp.json()['id']}",
        json={"field_type": "复选", "checkbox_label": None},
        headers=auth_headers(auth_token),
    )
    assert update_resp.status_code == 200, update_resp.text
    updated = update_resp.json()
    assert updated["checkbox_label"] is None
    assert updated["codelist_id"] is None

    reassign_resp = client.put(
        f"/api/projects/{project_id}/field-definitions/{choice_resp.json()['id']}",
        json={"codelist_id": codelist_id},
        headers=auth_headers(auth_token),
    )
    assert reassign_resp.status_code == 200, reassign_resp.text
    assert reassign_resp.json()["codelist_id"] is None

    add_resp = client.post(
        f"/api/forms/{form_id}/fields",
        json={"field_definition_id": choice_resp.json()["id"]},
        headers=auth_headers(auth_token),
    )
    assert add_resp.status_code == 201, add_resp.text

    form_fields_resp = client.get(
        f"/api/forms/{form_id}/fields",
        headers=auth_headers(auth_token),
    )
    assert form_fields_resp.status_code == 200, form_fields_resp.text
    definition = form_fields_resp.json()[0]["field_definition"]
    assert definition["checkbox_label"] is None
    assert definition["codelist_id"] is None


def test_copy_checkbox_field_definition_preserves_custom_text(
    client: TestClient,
    project_id: int,
    auth_token: str,
) -> None:
    create_resp = client.post(
        f"/api/projects/{project_id}/field-definitions",
        json={
            "variable_name": "SIGNED",
            "label": "已签署",
            "field_type": "复选",
            "checkbox_label": "受试者本人已签署",
        },
        headers=auth_headers(auth_token),
    )
    assert create_resp.status_code == 201, create_resp.text

    copy_resp = client.post(
        f"/api/field-definitions/{create_resp.json()['id']}/copy",
        headers=auth_headers(auth_token),
    )

    assert copy_resp.status_code == 201, copy_resp.text
    copied = copy_resp.json()
    assert copied["variable_name"] == "SIGNED_copy"
    assert copied["field_type"] == "复选"
    assert copied["checkbox_label"] == "受试者本人已签署"
    assert copied["codelist_id"] is None


def test_checkbox_field_definition_rejects_label_over_255_characters(
    client: TestClient,
    project_id: int,
    auth_token: str,
) -> None:
    response = client.post(
        f"/api/projects/{project_id}/field-definitions",
        json={
            "variable_name": "SIGNED_LONG",
            "label": "已签署",
            "field_type": "复选",
            "checkbox_label": "x" * 256,
        },
        headers=auth_headers(auth_token),
    )

    assert response.status_code == 422


def put_binding_profile(client: TestClient, ff_id: int, auth_token: str, upsert: dict) -> dict:
    """通过 binding-profile 实例部分更新；返回 (status_code, payload)。"""
    resp = client.put(
        f"/api/form-fields/{ff_id}/binding-profile",
        json={"instance": {"mode": "upsert", "upsert": upsert}},
        headers=auth_headers(auth_token),
    )
    return resp.status_code, resp.json()


def test_binding_profile_inline_mark_normalizes_default_value_when_disabling(
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

    status, payload = put_binding_profile(client, form_field["id"], auth_token, {"inline_mark": 0})
    assert status == 200, payload
    updated = payload["form_field"]
    assert updated["inline_mark"] == 0
    assert updated["default_value"] == "保留值"

    list_resp = client.get(
        f"/api/forms/{form_id}/fields",
        headers=auth_headers(auth_token),
    )
    assert list_resp.status_code == 200, list_resp.text
    matched = [item for item in list_resp.json() if item["id"] == form_field["id"]]
    assert len(matched) == 1
    assert matched[0]["inline_mark"] == 0
    assert matched[0]["default_value"] == "保留值"


def test_binding_profile_can_clear_bg_and_set_text_black(
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

    status, seeded = put_binding_profile(
        client,
        form_field["id"],
        auth_token,
        {"bg_color": "FFEEDD", "text_color": "112233"},
    )
    assert status == 200, seeded
    assert seeded["form_field"]["bg_color"] == "FFEEDD"
    assert seeded["form_field"]["text_color"] == "112233"

    status, patched = put_binding_profile(
        client,
        form_field["id"],
        auth_token,
        {"bg_color": None, "text_color": "000000"},
    )
    assert status == 200, patched
    assert patched["form_field"]["bg_color"] is None
    assert patched["form_field"]["text_color"] == "000000"

    list_resp = client.get(
        f"/api/forms/{form_id}/fields",
        headers=auth_headers(auth_token),
    )
    assert list_resp.status_code == 200, list_resp.text
    matched = [item for item in list_resp.json() if item["id"] == form_field["id"]]
    assert len(matched) == 1
    assert matched[0]["bg_color"] is None
    assert matched[0]["text_color"] == "000000"


def test_binding_profile_rejects_invalid_hex(
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

    status, payload = put_binding_profile(client, form_field["id"], auth_token, {"text_color": "GGGGGG"})
    assert status == 422, payload


def test_binding_profile_keeps_omitted_field_unchanged(
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

    status, seeded = put_binding_profile(
        client,
        form_field["id"],
        auth_token,
        {"bg_color": "FFEEDD", "text_color": "112233"},
    )
    assert status == 200, seeded

    status, patched = put_binding_profile(client, form_field["id"], auth_token, {"text_color": "000000"})
    assert status == 200, patched
    assert patched["form_field"]["bg_color"] == "FFEEDD"
    assert patched["form_field"]["text_color"] == "000000"


@pytest.mark.parametrize(
    ("payload", "expected_status", "expected_bg_color", "expected_text_color"),
    [
        ({"bg_color": None}, 200, None, "112233"),
        ({"text_color": None}, 200, "FFEEDD", None),
        ({"bg_color": "A1B2C3", "text_color": "000000"}, 200, "A1B2C3", "000000"),
        ({"text_color": "GGGGGG"}, 422, None, None),
    ],
)
def test_binding_profile_color_validation_and_null_semantics(
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

    status, seeded = put_binding_profile(
        client,
        form_field["id"],
        auth_token,
        {"bg_color": "FFEEDD", "text_color": "112233"},
    )
    assert status == 200, seeded

    status, updated = put_binding_profile(client, form_field["id"], auth_token, payload)
    assert status == expected_status, updated

    if expected_status != 200:
        return

    assert updated["form_field"]["bg_color"] == expected_bg_color
    assert updated["form_field"]["text_color"] == expected_text_color


def test_binding_profile_label_style_defaults_and_updates(
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
    # 新建字段默认加粗、默认字号（NULL）
    assert form_field["label_bold"] == 1
    assert form_field["label_font_size"] is None

    # 设计器属性保存与快编两条路径都走 binding-profile 实例更新
    status, updated = put_binding_profile(
        client,
        form_field["id"],
        auth_token,
        {"label_bold": 0, "label_font_size": "large"},
    )
    assert status == 200, updated
    assert updated["form_field"]["label_bold"] == 0
    assert updated["form_field"]["label_font_size"] == "large"

    status, updated = put_binding_profile(
        client,
        form_field["id"],
        auth_token,
        {"label_bold": 1, "label_font_size": "small"},
    )
    assert status == 200, updated
    assert updated["form_field"]["label_bold"] == 1
    assert updated["form_field"]["label_font_size"] == "small"

    # 列表读回保持一致
    list_resp = client.get(
        f"/api/forms/{form_id}/fields",
        headers=auth_headers(auth_token),
    )
    assert list_resp.status_code == 200, list_resp.text
    matched = [item for item in list_resp.json() if item["id"] == form_field["id"]]
    assert len(matched) == 1
    assert matched[0]["label_bold"] == 1
    assert matched[0]["label_font_size"] == "small"


def test_binding_profile_label_font_size_rejects_invalid_value(
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

    status, payload = put_binding_profile(client, form_field["id"], auth_token, {"label_font_size": "huge"})
    assert status == 422, payload


def test_binding_profile_label_bold_rejects_out_of_range(
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

    for bad_value in (2, -1):
        status, payload = put_binding_profile(client, form_field["id"], auth_token, {"label_bold": bad_value})
        assert status == 422, payload


def test_binding_profile_label_bold_rejects_null(
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

    status, payload = put_binding_profile(client, form_field["id"], auth_token, {"label_bold": None})
    assert status == 422, payload


def test_legacy_form_field_write_routes_are_removed(
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

    put_resp = client.put(
        f"/api/form-fields/{form_field['id']}",
        json={"inline_mark": 0},
        headers=auth_headers(auth_token),
    )
    assert put_resp.status_code == 405, put_resp.text

    patch_colors = client.patch(
        f"/api/form-fields/{form_field['id']}/colors",
        json={"bg_color": None},
        headers=auth_headers(auth_token),
    )
    assert patch_colors.status_code in (404, 405), patch_colors.text

    patch_inline = client.patch(
        f"/api/form-fields/{form_field['id']}/inline-mark",
        json={"inline_mark": 1},
        headers=auth_headers(auth_token),
    )
    assert patch_inline.status_code in (404, 405), patch_inline.text


def test_delete_label_form_field_removes_orphan_field_definition(
    client: TestClient,
    project_id: int,
    form_id: int,
    auth_token: str,
) -> None:
    field_definition_id = create_label_field_definition(
        client,
        project_id,
        auth_token,
        variable_name="LABEL_ORPHAN",
        label="章节标题",
    )
    form_field = add_form_field(client, form_id, field_definition_id, auth_token)

    delete_resp = client.delete(
        f"/api/form-fields/{form_field['id']}",
        headers=auth_headers(auth_token),
    )
    assert delete_resp.status_code == 204, delete_resp.text

    list_resp = client.get(
        f"/api/projects/{project_id}/field-definitions",
        headers=auth_headers(auth_token),
    )
    assert list_resp.status_code == 200, list_resp.text
    assert all(item["id"] != field_definition_id for item in list_resp.json())

    get_resp = client.get(
        f"/api/forms/{form_id}/fields",
        headers=auth_headers(auth_token),
    )
    assert get_resp.status_code == 200, get_resp.text
    assert all(item["id"] != form_field["id"] for item in get_resp.json())


def test_delete_normal_form_field_keeps_field_definition(
    client: TestClient,
    project_id: int,
    form_id: int,
    field_definition_id: int,
    auth_token: str,
) -> None:
    form_field = add_form_field(client, form_id, field_definition_id, auth_token)

    delete_resp = client.delete(
        f"/api/form-fields/{form_field['id']}",
        headers=auth_headers(auth_token),
    )
    assert delete_resp.status_code == 204, delete_resp.text

    list_resp = client.get(
        f"/api/projects/{project_id}/field-definitions",
        headers=auth_headers(auth_token),
    )
    assert list_resp.status_code == 200, list_resp.text
    matched = [item for item in list_resp.json() if item["id"] == field_definition_id]
    assert len(matched) == 1


def test_delete_shared_label_form_field_keeps_definition_until_last_reference_removed(
    client: TestClient,
    project_id: int,
    form_id: int,
    auth_token: str,
) -> None:
    second_form_id = create_form(client, project_id, auth_token, name="共享标签第二表单")
    field_definition_id = create_label_field_definition(
        client,
        project_id,
        auth_token,
        variable_name="LABEL_SHARED",
        label="共享标题",
    )
    first_field = add_form_field(client, form_id, field_definition_id, auth_token)
    second_field = add_form_field(client, second_form_id, field_definition_id, auth_token)

    first_delete = client.delete(
        f"/api/form-fields/{first_field['id']}",
        headers=auth_headers(auth_token),
    )
    assert first_delete.status_code == 204, first_delete.text

    list_after_first = client.get(
        f"/api/projects/{project_id}/field-definitions",
        headers=auth_headers(auth_token),
    )
    assert list_after_first.status_code == 200, list_after_first.text
    matched_after_first = [item for item in list_after_first.json() if item["id"] == field_definition_id]
    assert len(matched_after_first) == 1

    second_delete = client.delete(
        f"/api/form-fields/{second_field['id']}",
        headers=auth_headers(auth_token),
    )
    assert second_delete.status_code == 204, second_delete.text

    list_after_second = client.get(
        f"/api/projects/{project_id}/field-definitions",
        headers=auth_headers(auth_token),
    )
    assert list_after_second.status_code == 200, list_after_second.text
    assert all(item["id"] != field_definition_id for item in list_after_second.json())


def test_batch_delete_label_form_fields_removes_orphan_definitions(
    client: TestClient,
    project_id: int,
    form_id: int,
    auth_token: str,
) -> None:
    field_definition_id = create_label_field_definition(
        client,
        project_id,
        auth_token,
        variable_name="LABEL_BATCH",
        label="批量标题",
    )
    label_field = add_form_field(client, form_id, field_definition_id, auth_token)
    normal_field = add_form_field(
        client,
        form_id,
        create_label_field_definition(
            client,
            project_id,
            auth_token,
            variable_name="LABEL_BATCH_2",
            label="批量标题二",
        ),
        auth_token,
    )

    delete_resp = client.post(
        f"/api/forms/{form_id}/fields/batch-delete",
        json={"ids": [label_field["id"], normal_field["id"]]},
        headers=auth_headers(auth_token),
    )
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json()["deleted"] == 2

    list_resp = client.get(
        f"/api/projects/{project_id}/field-definitions",
        headers=auth_headers(auth_token),
    )
    assert list_resp.status_code == 200, list_resp.text
    ids = {item["id"] for item in list_resp.json()}
    assert field_definition_id not in ids


def test_delete_label_field_compacts_field_definition_order(
    client: TestClient,
    project_id: int,
    form_id: int,
    auth_token: str,
) -> None:
    first_id = create_label_field_definition(
        client,
        project_id,
        auth_token,
        variable_name="LABEL_ORDER_1",
        label="第一标题",
    )
    second_id = create_label_field_definition(
        client,
        project_id,
        auth_token,
        variable_name="LABEL_ORDER_2",
        label="第二标题",
    )
    third_id = create_label_field_definition(
        client,
        project_id,
        auth_token,
        variable_name="LABEL_ORDER_3",
        label="第三标题",
    )
    middle_field = add_form_field(client, form_id, second_id, auth_token)

    delete_resp = client.delete(
        f"/api/form-fields/{middle_field['id']}",
        headers=auth_headers(auth_token),
    )
    assert delete_resp.status_code == 204, delete_resp.text

    list_resp = client.get(
        f"/api/projects/{project_id}/field-definitions",
        headers=auth_headers(auth_token),
    )
    assert list_resp.status_code == 200, list_resp.text
    matched = [item for item in list_resp.json() if item["id"] in {first_id, third_id}]
    assert [item["order_index"] for item in matched] == [1, 2]
