"""项目复制集成测试"""
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import select
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as
from src.models.codelist import CodeList, CodeListOption
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.unit import Unit
from src.models.user import User
from src.models.visit import Visit
from src.models.visit_form import VisitForm


def _create_full_project_graph(session: Session, owner_id: int) -> Project:
    project = Project(
        name="源项目",
        version="1.0",
        trial_name="试验A",
        crf_version="v1",
        protocol_number="P-001",
        sponsor="Sponsor",
        owner_id=owner_id,
        company_logo_path="source-logo.png",
    )
    session.add(project)
    session.flush()

    unit = Unit(project_id=project.id, symbol="kg", code="UNIT_KG", order_index=1)
    session.add(unit)
    session.flush()

    codelist = CodeList(project_id=project.id, name="性别", code="CL_SEX", description="desc", order_index=1)
    session.add(codelist)
    session.flush()

    opt1 = CodeListOption(codelist_id=codelist.id, code="1", decode="男", trailing_underscore=0, order_index=1)
    opt2 = CodeListOption(codelist_id=codelist.id, code="2", decode="女", trailing_underscore=1, order_index=2)
    session.add_all([opt1, opt2])
    session.flush()

    fd1 = FieldDefinition(
        project_id=project.id,
        variable_name="WEIGHT",
        label="体重",
        field_type="数值",
        unit_id=unit.id,
        order_index=1,
    )
    fd2 = FieldDefinition(
        project_id=project.id,
        variable_name="SEX",
        label="性别",
        field_type="单选",
        codelist_id=codelist.id,
        order_index=2,
    )
    session.add_all([fd1, fd2])
    session.flush()

    form = Form(project_id=project.id, name="筛选表", code="FORM001", domain="DM", order_index=1, design_notes="备注")
    session.add(form)
    session.flush()

    ff1 = FormField(form_id=form.id, field_definition_id=fd1.id, sort_order=1, default_value="70")
    ff2 = FormField(form_id=form.id, field_definition_id=fd2.id, sort_order=2, inline_mark=1)
    session.add_all([ff1, ff2])
    session.flush()

    visit = Visit(project_id=project.id, name="V1", code="VISIT1", sequence=1)
    session.add(visit)
    session.flush()

    visit_form = VisitForm(visit_id=visit.id, form_id=form.id, sequence=1)
    session.add(visit_form)
    session.flush()

    return project


def test_copy_project_clones_full_graph(client, engine, tmp_path: Path):
    token = login_as(client, "alice")

    with Session(engine) as session:
        with session.begin():
            user = session.scalar(select(User).where(User.username == "alice"))
            assert user is not None
            project = _create_full_project_graph(session, user.id)
            logos_dir = tmp_path / "logos"
            logos_dir.mkdir(parents=True, exist_ok=True)
            (logos_dir / "source-logo.png").write_bytes(b"source-logo")

    from src.config import AppConfig, AuthConfig, StorageConfig

    test_config = AppConfig(
        auth=AuthConfig(secret_key="test-secret-key-for-testing"),
        storage=StorageConfig(upload_path=str(tmp_path)),
    )

    with patch("src.services.project_clone_service.get_config", return_value=test_config), \
         patch("src.routers.projects.get_config", return_value=test_config):
        resp = client.post("/api/projects/1/copy", headers=auth_headers(token))

    assert resp.status_code == 201, resp.text
    copied = resp.json()
    assert copied["name"] == "源项目 (副本)"
    assert copied["id"] != 1

    with Session(engine) as session:
        projects = session.scalars(select(Project).order_by(Project.id)).all()
        assert len(projects) == 2
        source_project, cloned_project = projects
        assert copied["company_logo_path"] == cloned_project.company_logo_path
        assert cloned_project.owner_id == source_project.owner_id
        assert cloned_project.company_logo_path is not None
        assert cloned_project.company_logo_path != source_project.company_logo_path

        source_units = session.scalars(select(Unit).where(Unit.project_id == source_project.id)).all()
        cloned_units = session.scalars(select(Unit).where(Unit.project_id == cloned_project.id)).all()
        assert len(source_units) == len(cloned_units) == 1
        assert cloned_units[0].id != source_units[0].id
        assert cloned_units[0].symbol == source_units[0].symbol

        source_codelists = session.scalars(select(CodeList).where(CodeList.project_id == source_project.id)).all()
        cloned_codelists = session.scalars(select(CodeList).where(CodeList.project_id == cloned_project.id)).all()
        assert len(source_codelists) == len(cloned_codelists) == 1
        assert cloned_codelists[0].id != source_codelists[0].id

        source_options = session.scalars(select(CodeListOption).where(CodeListOption.codelist_id == source_codelists[0].id)).all()
        cloned_options = session.scalars(select(CodeListOption).where(CodeListOption.codelist_id == cloned_codelists[0].id)).all()
        assert len(source_options) == len(cloned_options) == 2
        assert {o.decode for o in cloned_options} == {"男", "女"}

        source_defs = session.scalars(select(FieldDefinition).where(FieldDefinition.project_id == source_project.id).order_by(FieldDefinition.order_index)).all()
        cloned_defs = session.scalars(select(FieldDefinition).where(FieldDefinition.project_id == cloned_project.id).order_by(FieldDefinition.order_index)).all()
        assert len(source_defs) == len(cloned_defs) == 2
        assert all(a.id != b.id for a, b in zip(source_defs, cloned_defs))
        assert cloned_defs[0].unit_id == cloned_units[0].id
        assert cloned_defs[1].codelist_id == cloned_codelists[0].id

        source_forms = session.scalars(select(Form).where(Form.project_id == source_project.id)).all()
        cloned_forms = session.scalars(select(Form).where(Form.project_id == cloned_project.id)).all()
        assert len(source_forms) == len(cloned_forms) == 1
        assert cloned_forms[0].id != source_forms[0].id
        assert cloned_forms[0].domain == "DM"

        cloned_form_fields = session.scalars(select(FormField).where(FormField.form_id == cloned_forms[0].id).order_by(FormField.sort_order)).all()
        assert len(cloned_form_fields) == 2
        assert cloned_form_fields[0].field_definition_id == cloned_defs[0].id
        assert cloned_form_fields[1].field_definition_id == cloned_defs[1].id

        source_visits = session.scalars(select(Visit).where(Visit.project_id == source_project.id)).all()
        cloned_visits = session.scalars(select(Visit).where(Visit.project_id == cloned_project.id)).all()
        assert len(source_visits) == len(cloned_visits) == 1
        assert cloned_visits[0].id != source_visits[0].id

        cloned_visit_forms = session.scalars(select(VisitForm).where(VisitForm.visit_id == cloned_visits[0].id)).all()
        assert len(cloned_visit_forms) == 1
        assert cloned_visit_forms[0].form_id == cloned_forms[0].id

        assert (tmp_path / "logos" / source_project.company_logo_path).read_bytes() == b"source-logo"
        assert (tmp_path / "logos" / cloned_project.company_logo_path).read_bytes() == b"source-logo"


def test_copy_project_forbidden_for_other_user(client, engine):
    token_a = login_as(client, "alice")
    token_b = login_as(client, "bob")

    with Session(engine) as session:
        with session.begin():
            user = session.scalar(select(User).where(User.username == "alice"))
            assert user is not None
            _create_full_project_graph(session, user.id)

    resp = client.post("/api/projects/1/copy", headers=auth_headers(token_b))
    assert resp.status_code == 403


def test_copy_project_rolls_back_when_logo_copy_fails(client, engine, tmp_path: Path):
    token = login_as(client, "alice")

    with Session(engine) as session:
        with session.begin():
            user = session.scalar(select(User).where(User.username == "alice"))
            assert user is not None
            _create_full_project_graph(session, user.id)
            logos_dir = tmp_path / "logos"
            logos_dir.mkdir(parents=True, exist_ok=True)
            (logos_dir / "source-logo.png").write_bytes(b"source-logo")

    from src.config import AppConfig, AuthConfig, StorageConfig

    test_config = AppConfig(
        auth=AuthConfig(secret_key="test-secret-key-for-testing"),
        storage=StorageConfig(upload_path=str(tmp_path)),
    )

    with patch("src.services.project_clone_service.get_config", return_value=test_config), \
         patch("src.routers.projects.get_config", return_value=test_config), \
         patch("src.services.project_clone_service.shutil.copy2", side_effect=OSError("copy failed")):
        resp = client.post("/api/projects/1/copy", headers=auth_headers(token))

    assert resp.status_code == 500

    with Session(engine) as session:
        projects = session.scalars(select(Project).order_by(Project.id)).all()
        assert len(projects) == 1

    logos = list((tmp_path / "logos").iterdir())
    assert len(logos) == 1
    assert logos[0].name == "source-logo.png"
