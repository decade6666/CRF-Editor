"""既有表单域的 CRUD、权限及真实 Word 标注回归；所有数据来自隔离测试库。"""

from pathlib import Path
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient
from lxml import etree
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as
from src.models import FieldDefinition, Form, FormField, Visit, VisitForm
from src.schemas.form import FormCreate, FormUpdate
from src.services.export_service import ExportService
from src.services.word_table_parity import extract_docx_form_table_fields

FREE_DOMAIN = 'dM / Vs；自定义 <域> & "文本"'


@pytest.fixture
def project_id(client: TestClient) -> int:
    client.headers.update(auth_headers(login_as(client, "domain_owner")))
    response = client.post("/api/projects", json={"name": "域测试项目", "version": "1.0"})
    assert response.status_code == 201
    return response.json()["id"]


def _create_form(client: TestClient, project_id: int, domain: str | None = FREE_DOMAIN) -> dict:
    response = client.post(
        f"/api/projects/{project_id}/forms",
        json={"name": "自由文本域", "code": "DOMAIN_FORM", "domain": domain, "paper_orientation": "landscape"},
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.unit
@pytest.mark.parametrize("domain", [None, "", "   ", FREE_DOMAIN, "  oldDm / Vs  "])
def test_should_preserve_free_text_domain_in_existing_schemas(domain: str | None) -> None:
    assert FormCreate(name="域", domain=domain).domain == domain
    assert FormUpdate(domain=domain).domain == domain


@pytest.mark.integration
@pytest.mark.parametrize("domain", [None, "", FREE_DOMAIN, "  oldDm / Vs  "])
def test_should_save_and_list_domain_without_oid_normalization(
    client: TestClient, project_id: int, domain: str | None
) -> None:
    form = _create_form(client, project_id, domain)
    response = client.get(f"/api/projects/{project_id}/forms")
    assert response.status_code == 200
    assert form["domain"] == domain
    assert response.json()[0]["domain"] == domain


@pytest.mark.integration
@pytest.mark.parametrize("method", ["put", "patch"])
def test_should_update_and_clear_domain_without_rewriting_other_properties(
    client: TestClient, project_id: int, method: str
) -> None:
    form = _create_form(client, project_id, "oldDomain")
    update = getattr(client, method)
    response = update(f"/api/forms/{form['id']}", json={"domain": FREE_DOMAIN})
    assert response.status_code == 200
    assert response.json()["domain"] == FREE_DOMAIN
    assert response.json()["code"] == form["code"]
    assert response.json()["paper_orientation"] == "landscape"

    cleared = update(f"/api/forms/{form['id']}", json={"domain": None})
    assert cleared.status_code == 200
    assert cleared.json()["domain"] is None
    assert client.get(f"/api/projects/{project_id}/forms").json()[0]["domain"] is None


@pytest.mark.integration
@pytest.mark.parametrize("legacy", [None, "", "   ", "  oldDm / Vs  "])
def test_should_preserve_legacy_domain_on_unrelated_property_and_annotation_updates(
    client: TestClient, project_id: int, legacy: str | None
) -> None:
    form = _create_form(client, project_id, legacy)
    renamed = client.put(f"/api/forms/{form['id']}", json={"name": "仅改名称"})
    assert renamed.status_code == 200
    assert renamed.json()["domain"] == legacy
    positioned = client.patch(f"/api/forms/{form['id']}", json={"annotation_positions": {"_form": {"y": 15}}})
    assert positioned.status_code == 200
    assert positioned.json()["domain"] == legacy


@pytest.mark.integration
def test_should_preserve_domain_when_copying_form(client: TestClient, project_id: int) -> None:
    form = _create_form(client, project_id)
    copied = client.post(f"/api/forms/{form['id']}/copy")
    assert copied.status_code == 201
    assert copied.json()["domain"] == FREE_DOMAIN


@pytest.mark.integration
def test_should_reject_unauthenticated_domain_write(client: TestClient, project_id: int) -> None:
    form = _create_form(client, project_id)
    client.headers.pop("Authorization")
    response = client.put(f"/api/forms/{form['id']}", json={"domain": "not-authorized"})
    assert response.status_code == 401


@pytest.mark.integration
def test_should_reject_foreign_domain_read_and_write_without_changing_value(
    client: TestClient, project_id: int, engine: Engine
) -> None:
    form = _create_form(client, project_id)
    foreign = auth_headers(login_as(client, "other_domain_user"))
    response = client.put(f"/api/forms/{form['id']}", json={"domain": "foreign"}, headers=foreign)
    assert response.status_code == 403
    assert client.get(f"/api/projects/{project_id}/forms", headers=foreign).status_code == 403
    with Session(engine) as session:
        assert session.get(Form, form["id"]).domain == FREE_DOMAIN


@pytest.mark.integration
@pytest.mark.parametrize("domain", [None, "", " \t ", FREE_DOMAIN, "  oldDm / Vs  "])
def test_should_use_saved_domain_in_acrf_only_without_changing_table_text(
    client: TestClient, project_id: int, engine: Engine, tmp_path: Path, domain: str | None
) -> None:
    form = _create_form(client, project_id, domain)
    with Session(engine) as session:
        visit = Visit(project_id=project_id, name="访视", code="VISIT", sequence=1)
        definition = FieldDefinition(project_id=project_id, label="姓名", variable_name="NAME", field_type="文本")
        session.add_all([visit, definition])
        session.flush()
        session.add_all(
            [
                VisitForm(visit_id=visit.id, form_id=form["id"], sequence=1),
                FormField(form_id=form["id"], field_definition_id=definition.id, order_index=1),
            ]
        )
        session.commit()
        service = ExportService(session)
        paths = {False: tmp_path / "ecrf.docx", True: tmp_path / "acrf.docx"}
        for annotated, path in paths.items():
            assert service.export_project_to_word(
                project_id, str(path), annotated=annotated, bake_toc_page_numbers=False
            )
        assert session.get(Form, form["id"]).domain == domain

    namespaces = {
        "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        "wps": "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
    }
    with ZipFile(paths[True]) as archive:
        xml = etree.fromstring(archive.read("word/document.xml"))
    texts = xml.xpath("//wps:txbx//w:t/text()", namespaces=namespaces)
    expected_domain = (domain or "").strip()
    assert texts == ([expected_domain, "NAME"] if expected_domain else ["NAME"])
    with ZipFile(paths[False]) as archive:
        plain_xml = etree.fromstring(archive.read("word/document.xml"))
    assert plain_xml.xpath("//wps:txbx", namespaces=namespaces) == []
    assert extract_docx_form_table_fields(paths[False]) == extract_docx_form_table_fields(paths[True])
