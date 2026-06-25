"""字段接口集成测试

验证字段更新契约：
- 清空单位时显式提交 unit_id: null 能持久化为空
- 相关列表接口返回 trailing_underscore，支持导入后预览语义
"""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from helpers import auth_headers, login_as
from src.models import Base
from src.models.project import Project
from src.services import import_service as import_service_module
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
    return SimpleNamespace(db_path=db_path, allowed_template_path=db_path, form_id=form.id)


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

    template_service_config = SimpleNamespace(
        db_path=str(template_db_path.db_path.parent / "crf_editor.db"),
        upload_path=str(template_db_path.db_path.parent / "uploads"),
    )
    monkeypatch.setattr(
        import_template_router,
        "get_config",
        lambda: SimpleNamespace(template_path=str(template_db_path.allowed_template_path)),
    )
    monkeypatch.setattr(import_service_module, "get_config", lambda: template_service_config)

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


def test_form_field_label_style_defaults_and_updates(
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

    # 通过 /colors PATCH（正向自动保存路径）写入“不加粗 + 大字号”
    patch_resp = client.patch(
        f"/api/form-fields/{form_field['id']}/colors",
        json={"label_bold": 0, "label_font_size": "large"},
        headers=auth_headers(auth_token),
    )
    assert patch_resp.status_code == 200, patch_resp.text
    patched = patch_resp.json()
    assert patched["label_bold"] == 0
    assert patched["label_font_size"] == "large"

    # 通过 PUT（双击快编路径）改回加粗 + 小字号
    put_resp = client.put(
        f"/api/form-fields/{form_field['id']}",
        json={"label_bold": 1, "label_font_size": "small"},
        headers=auth_headers(auth_token),
    )
    assert put_resp.status_code == 200, put_resp.text
    assert put_resp.json()["label_bold"] == 1
    assert put_resp.json()["label_font_size"] == "small"

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


def test_form_field_label_font_size_rejects_invalid_value(
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

    resp = client.patch(
        f"/api/form-fields/{form_field['id']}/colors",
        json={"label_font_size": "huge"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 422, resp.text


def test_form_field_label_bold_rejects_out_of_range(
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

    # /colors PATCH 与 PUT 两条写路径都应拒绝 0/1 之外的值
    patch_resp = client.patch(
        f"/api/form-fields/{form_field['id']}/colors",
        json={"label_bold": 2},
        headers=auth_headers(auth_token),
    )
    assert patch_resp.status_code == 422, patch_resp.text

    put_resp = client.put(
        f"/api/form-fields/{form_field['id']}",
        json={"label_bold": -1},
        headers=auth_headers(auth_token),
    )
    assert put_resp.status_code == 422, put_resp.text


def test_form_field_label_bold_rejects_null(
    client: TestClient,
    form_id: int,
    field_definition_id: int,
    auth_token: str,
) -> None:
    create_resp = client.post(
        f"/api/forms/{form_id}/fields",
        json={"field_definition_id": field_definition_id, "label_bold": None},
        headers=auth_headers(auth_token),
    )
    assert create_resp.status_code == 422, create_resp.text

    add_resp = client.post(
        f"/api/forms/{form_id}/fields",
        json={"field_definition_id": field_definition_id},
        headers=auth_headers(auth_token),
    )
    assert add_resp.status_code == 201, add_resp.text
    form_field = add_resp.json()

    patch_resp = client.patch(
        f"/api/form-fields/{form_field['id']}/colors",
        json={"label_bold": None},
        headers=auth_headers(auth_token),
    )
    assert patch_resp.status_code == 422, patch_resp.text

    put_resp = client.put(
        f"/api/form-fields/{form_field['id']}",
        json={"label_bold": None},
        headers=auth_headers(auth_token),
    )
    assert put_resp.status_code == 422, put_resp.text


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
    normal_field = add_form_field(client, form_id, create_label_field_definition(
        client,
        project_id,
        auth_token,
        variable_name="LABEL_BATCH_2",
        label="批量标题二",
    ), auth_token)

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
