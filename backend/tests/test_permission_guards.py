"""关键路由权限门禁测试。"""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as
from main import app
from src.config import AuthConfig, StorageConfig
from src.models.codelist import CodeList
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.unit import Unit
from src.models.user import User
from src.models.visit import Visit
from src.models.visit_form import VisitForm


@pytest.fixture
def owned_form_graph(client, engine):
    alice_token = login_as(client, "alice")
    bob_token = login_as(client, "bob")

    with Session(engine) as session:
        alice = session.scalar(select(User).where(User.username == "alice"))
        assert alice is not None

        project = Project(name="Alice 项目", version="1.0", owner_id=alice.id, order_index=1)
        session.add(project)
        session.flush()

        form = Form(project_id=project.id, name="筛选表", code="FORM_AUTH", order_index=1)
        session.add(form)
        session.flush()

        unit = Unit(project_id=project.id, symbol="cm", code="UNIT_CM", order_index=1)
        session.add(unit)
        session.flush()

        field_definition = FieldDefinition(
            project_id=project.id,
            variable_name="AUTH_FIELD",
            label="授权字段",
            field_type="文本",
            order_index=1,
            unit_id=unit.id,
        )
        session.add(field_definition)
        session.flush()

        form_field = FormField(
            form_id=form.id,
            field_definition_id=field_definition.id,
            order_index=1,
        )
        session.add(form_field)
        session.flush()

        visit = Visit(project_id=project.id, name="V1", code="VISIT_AUTH", sequence=1)
        session.add(visit)
        session.flush()

        visit_form = VisitForm(visit_id=visit.id, form_id=form.id, sequence=1)
        session.add(visit_form)
        session.commit()

        return SimpleNamespace(
            alice_token=alice_token,
            bob_token=bob_token,
            project_id=project.id,
            form_id=form.id,
            field_definition_id=field_definition.id,
            form_field_id=form_field.id,
            unit_id=unit.id,
            visit_id=visit.id,
            visit_form_id=visit_form.id,
        )


def _request(client: TestClient, method: str, url: str, *, headers=None, json=None):
    caller = getattr(client, method)
    kwargs = {}
    if headers is not None:
        kwargs["headers"] = headers
    if json is not None:
        kwargs["json"] = json
    return caller(url, **kwargs)


def test_settings_endpoints_require_login(client: TestClient) -> None:
    payload = {
        "template_path": "D:/templates/library.db",
        "ai_enabled": False,
        "ai_api_url": "",
        "ai_api_key": "",
        "ai_model": "",
        "ai_api_format": "",
    }

    assert client.get("/api/settings").status_code == 401
    assert client.put("/api/settings", json=payload).status_code == 401
    assert client.post("/api/settings/ai/test", json={}).status_code == 401


def test_authenticated_admin_can_read_settings(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    token = login_as(client, "admin")
    from src.routers import settings as settings_router

    fake_config = SimpleNamespace(
        template_path="D:/templates/library.db",
        ai_config=SimpleNamespace(
            enabled=False,
            api_url="",
            api_key="secret-key",
            model="",
            api_format="",
            timeout=30,
        ),
    )
    monkeypatch.setattr(settings_router, "get_config", lambda: fake_config)

    resp = client.get("/api/settings", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["template_path"] == "D:/templates/library.db"
    assert payload["ai_api_key"].endswith("-key")
    assert payload["ai_api_key"] != "secret-key"


def test_non_admin_cannot_access_global_settings_or_full_export(client: TestClient) -> None:
    token = login_as(client, "alice")
    payload = {
        "template_path": "D:/templates/library.db",
        "ai_enabled": False,
        "ai_api_url": "",
        "ai_api_key": "",
        "ai_model": "",
        "ai_api_format": "",
    }

    assert client.get("/api/settings", headers=auth_headers(token)).status_code == 403
    assert client.put("/api/settings", json=payload, headers=auth_headers(token)).status_code == 403
    assert client.post("/api/settings/ai/test", json={}, headers=auth_headers(token)).status_code == 403
    assert client.get("/api/export/database", headers=auth_headers(token)).status_code == 403



def test_authenticated_user_can_export_owned_projects_database(client: TestClient, engine) -> None:
    token = login_as(client, "alice")
    login_as(client, "bob")

    with Session(engine) as session:
        alice = session.scalar(select(User).where(User.username == "alice"))
        bob = session.scalar(select(User).where(User.username == "bob"))
        assert alice is not None
        assert bob is not None

        session.add_all([
            Project(name="Alice 导出项目A", version="1.0", owner_id=alice.id, order_index=1),
            Project(name="Alice 导出项目B", version="1.0", owner_id=alice.id, order_index=2),
            Project(name="Bob 导出项目", version="1.0", owner_id=bob.id, order_index=1),
        ])
        session.commit()

    resp = client.get("/api/projects/export/database", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("application/octet-stream")


@pytest.mark.parametrize(
    ("method", "url_template", "json_body"),
    [
        ("get", "/api/forms/{form_id}/references", None),
        ("put", "/api/forms/{form_id}", {"name": "Hijacked"}),
        ("delete", "/api/forms/{form_id}", None),
        ("post", "/api/forms/{form_id}/copy", {}),
        ("get", "/api/forms/{form_id}/fields", None),
        ("post", "/api/forms/{form_id}/fields", {"field_definition_id": "{field_definition_id}"}),
        ("put", "/api/form-fields/{form_field_id}", {"label_override": "Hijacked"}),
        ("delete", "/api/form-fields/{form_field_id}", None),
        ("patch", "/api/form-fields/{form_field_id}/inline-mark", {"inline_mark": 0}),
        ("patch", "/api/form-fields/{form_field_id}/colors", {"bg_color": "FFFFFF"}),
        ("post", "/api/forms/{form_id}/fields/reorder", {"ordered_ids": ["{form_field_id}"]}),
        ("post", "/api/forms/{form_id}/fields/batch-delete", {"ids": ["{form_field_id}"]}),
        ("get", "/api/field-definitions/{field_definition_id}/references", None),
        ("delete", "/api/field-definitions/{field_definition_id}", None),
        ("post", "/api/field-definitions/{field_definition_id}/copy", {}),
        ("put", "/api/units/{unit_id}", {"symbol": "mm"}),
        ("get", "/api/units/{unit_id}/references", None),
        ("delete", "/api/units/{unit_id}", None),
        ("delete", "/api/visits/{visit_id}", None),
        ("post", "/api/visits/{visit_id}/copy", {}),
        ("post", "/api/visits/{visit_id}/forms/{form_id}", None),
        ("post", "/api/visits/{visit_id}/forms/reorder", {"ordered_form_ids": ["{form_id}"]}),
        ("put", "/api/visits/{visit_id}/forms/{form_id}", {"sequence": 1}),
        ("delete", "/api/visits/{visit_id}/forms/{form_id}", None),
    ],
)
def test_other_user_cannot_access_form_and_field_routes(
    client: TestClient,
    owned_form_graph,
    method: str,
    url_template: str,
    json_body,
) -> None:
    substitutions = {
        "form_id": owned_form_graph.form_id,
        "field_definition_id": owned_form_graph.field_definition_id,
        "form_field_id": owned_form_graph.form_field_id,
        "unit_id": owned_form_graph.unit_id,
        "visit_id": owned_form_graph.visit_id,
    }
    url = url_template.format(**substitutions)

    def resolve_placeholders(value):
        if isinstance(value, str) and value.startswith("{") and value.endswith("}"):
            return substitutions[value.strip("{}")]
        if isinstance(value, list):
            return [resolve_placeholders(item) for item in value]
        if isinstance(value, dict):
            return {key: resolve_placeholders(item) for key, item in value.items()}
        return value

    payload = resolve_placeholders(json_body)

    resp = _request(
        client,
        method,
        url,
        headers=auth_headers(owned_form_graph.bob_token),
        json=payload,
    )
    assert resp.status_code == 403, (method, url, resp.status_code, resp.text)


@pytest.mark.parametrize(
    ("method", "url_template", "json_body"),
    [
        ("get", "/api/forms/{form_id}/references", None),
        ("get", "/api/forms/{form_id}/fields", None),
        ("patch", "/api/form-fields/{form_field_id}/inline-mark", {"inline_mark": 0}),
    ],
)
def test_sensitive_form_and_field_routes_require_login(
    client: TestClient,
    owned_form_graph,
    method: str,
    url_template: str,
    json_body,
) -> None:
    url = url_template.format(
        form_id=owned_form_graph.form_id,
        form_field_id=owned_form_graph.form_field_id,
    )
    resp = _request(client, method, url, json=json_body)
    assert resp.status_code == 401, (method, url, resp.status_code, resp.text)


def test_add_form_field_rejects_cross_project_field_definition(client: TestClient, engine, owned_form_graph) -> None:
    with Session(engine) as session:
        bob = session.scalar(select(User).where(User.username == "bob"))
        assert bob is not None

        project = Project(name="Bob 项目", version="1.0", owner_id=bob.id, order_index=2)
        session.add(project)
        session.flush()

        foreign_field_definition = FieldDefinition(
            project_id=project.id,
            variable_name="BOB_FIELD",
            label="Bob 字段",
            field_type="文本",
            order_index=1,
        )
        session.add(foreign_field_definition)
        session.commit()
        foreign_field_definition_id = foreign_field_definition.id

    resp = client.post(
        f"/api/forms/{owned_form_graph.form_id}/fields",
        json={"field_definition_id": foreign_field_definition_id},
        headers=auth_headers(owned_form_graph.alice_token),
    )
    assert resp.status_code == 403, resp.text


def test_update_field_definition_rejects_cross_project_codelist_and_unit(client: TestClient, engine, owned_form_graph) -> None:
    with Session(engine) as session:
        bob = session.scalar(select(User).where(User.username == "bob"))
        assert bob is not None

        project = Project(name="Bob 资源项目", version="1.0", owner_id=bob.id, order_index=2)
        session.add(project)
        session.flush()

        foreign_codelist = CodeList(project_id=project.id, name="Bob 字典", code="BOB_CL", order_index=1)
        foreign_unit = Unit(project_id=project.id, symbol="kg", code="BOB_UNIT", order_index=1)
        session.add_all([foreign_codelist, foreign_unit])
        session.commit()
        foreign_codelist_id = foreign_codelist.id
        foreign_unit_id = foreign_unit.id

    resp = client.put(
        f"/api/projects/{owned_form_graph.project_id}/field-definitions/{owned_form_graph.field_definition_id}",
        json={"codelist_id": foreign_codelist_id, "unit_id": foreign_unit_id},
        headers=auth_headers(owned_form_graph.alice_token),
    )
    assert resp.status_code == 403, resp.text


def test_batch_delete_form_fields_rejects_ids_outside_form_scope(client: TestClient, engine, owned_form_graph) -> None:
    with Session(engine) as session:
        bob = session.scalar(select(User).where(User.username == "bob"))
        assert bob is not None

        project = Project(name="Bob 第二项目", version="1.0", owner_id=bob.id, order_index=3)
        session.add(project)
        session.flush()

        form = Form(project_id=project.id, name="Bob 表单", code="BOB_FORM", order_index=1)
        session.add(form)
        session.flush()

        field_definition = FieldDefinition(
            project_id=project.id,
            variable_name="BOB_SCOPE_FIELD",
            label="Bob 作用域字段",
            field_type="文本",
            order_index=1,
        )
        session.add(field_definition)
        session.flush()

        foreign_form_field = FormField(
            form_id=form.id,
            field_definition_id=field_definition.id,
            order_index=1,
        )
        session.add(foreign_form_field)
        session.commit()
        foreign_form_field_id = foreign_form_field.id

    resp = client.post(
        f"/api/forms/{owned_form_graph.form_id}/fields/batch-delete",
        json={"ids": [foreign_form_field_id]},
        headers=auth_headers(owned_form_graph.alice_token),
    )
    assert resp.status_code == 403, resp.text


def test_admin_cleanup_screenshots_requires_admin(client: TestClient) -> None:
    user_token = login_as(client, "alice")
    assert client.post("/api/admin/cleanup-screenshots", headers=auth_headers(user_token)).status_code == 403


def test_upload_logo_route_exists_and_updates_project(client: TestClient, engine, owned_form_graph, tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    from src.routers import projects as projects_router

    fake_config = SimpleNamespace(upload_path=str(tmp_path))
    monkeypatch.setattr(projects_router, "get_config", lambda: fake_config)

    png_bytes = b"\x89PNG\r\n\x1a\nrest-of-png"
    resp = client.post(
        f"/api/projects/{owned_form_graph.project_id}/logo",
        files={"file": ("logo.png", png_bytes, "image/png")},
        headers=auth_headers(owned_form_graph.alice_token),
    )
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["company_logo_path"].endswith(".png")


def test_batch_reference_endpoints_do_not_leak_cross_project_data(client: TestClient, engine, owned_form_graph) -> None:
    with Session(engine) as session:
        bob = session.scalar(select(User).where(User.username == "bob"))
        assert bob is not None

        project = Project(name="Bob 引用项目", version="1.0", owner_id=bob.id, order_index=4)
        session.add(project)
        session.flush()

        form = Form(project_id=project.id, name="Bob 访视表", code="BOB_REF_FORM", order_index=1)
        session.add(form)
        session.flush()

        unit = Unit(project_id=project.id, symbol="kg", code="BOB_REF_UNIT", order_index=1)
        session.add(unit)
        session.flush()

        field_definition = FieldDefinition(
            project_id=project.id,
            variable_name="BOB_REF_FIELD",
            label="Bob 引用字段",
            field_type="文本",
            unit_id=unit.id,
            order_index=1,
        )
        session.add(field_definition)
        session.flush()

        form_field = FormField(form_id=form.id, field_definition_id=field_definition.id, order_index=1)
        session.add(form_field)
        session.flush()

        visit = Visit(project_id=project.id, name="Bob 访视", code="BOB_VISIT", sequence=1)
        session.add(visit)
        session.flush()

        visit_form = VisitForm(visit_id=visit.id, form_id=form.id, sequence=1)
        session.add(visit_form)
        session.commit()

        foreign_form_id = form.id
        foreign_fd_id = field_definition.id
        foreign_unit_id = unit.id

    form_resp = client.post(
        f"/api/projects/{owned_form_graph.project_id}/forms/batch-references",
        json={"ids": [foreign_form_id]},
        headers=auth_headers(owned_form_graph.alice_token),
    )
    assert form_resp.status_code == 200, form_resp.text
    assert form_resp.json() == {}

    field_resp = client.post(
        f"/api/projects/{owned_form_graph.project_id}/field-definitions/batch-references",
        json={"ids": [foreign_fd_id]},
        headers=auth_headers(owned_form_graph.alice_token),
    )
    assert field_resp.status_code == 200, field_resp.text
    assert field_resp.json() == {}

    unit_resp = client.post(
        f"/api/projects/{owned_form_graph.project_id}/units/batch-references",
        json={"ids": [foreign_unit_id]},
        headers=auth_headers(owned_form_graph.alice_token),
    )
    assert unit_resp.status_code == 200, unit_resp.text
    assert unit_resp.json() == {}


def test_remove_visit_form_compacts_sequence(client: TestClient, engine, owned_form_graph) -> None:
    with Session(engine) as session:
        form = Form(project_id=owned_form_graph.project_id, name="第二表单", code="FORM_TWO", order_index=2)
        session.add(form)
        session.flush()
        second_form_id = form.id

        second_link = VisitForm(visit_id=owned_form_graph.visit_id, form_id=second_form_id, sequence=2)
        session.add(second_link)
        session.commit()

    resp = client.delete(
        f"/api/visits/{owned_form_graph.visit_id}/forms/{owned_form_graph.form_id}",
        headers=auth_headers(owned_form_graph.alice_token),
    )
    assert resp.status_code == 204, resp.text

    with Session(engine) as session:
        remaining = list(session.scalars(
            select(VisitForm).where(VisitForm.visit_id == owned_form_graph.visit_id).order_by(VisitForm.sequence)
        ).all())
        assert len(remaining) == 1
        assert remaining[0].form_id == second_form_id
        assert remaining[0].sequence == 1
