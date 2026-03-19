from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from src.models import Base
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.unit import Unit
from src.repositories.form_field_repository import FormFieldRepository
from src.services.import_service import ImportService


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    with session_factory() as db_session:
        yield db_session

    engine.dispose()


def create_project(session: Session, name: str = "项目") -> Project:
    project = Project(name=name, version="v1.0")
    session.add(project)
    session.flush()
    return project


def create_form(session: Session, project_id: int, name: str = "筛选表") -> Form:
    form = Form(project_id=project_id, name=name, code=f"{name}_CODE")
    session.add(form)
    session.flush()
    return form


def create_field_definition(
    session: Session,
    project_id: int,
    *,
    variable_name: str = "FIELD_A",
    label: str = "字段A",
    field_type: str = "文本",
    unit_id: int | None = None,
) -> FieldDefinition:
    field_definition = FieldDefinition(
        project_id=project_id,
        variable_name=variable_name,
        label=label,
        field_type=field_type,
        unit_id=unit_id,
    )
    session.add(field_definition)
    session.flush()
    return field_definition


def create_form_field(
    session: Session,
    form_id: int,
    field_definition_id: int,
    *,
    sort_order: int = 1,
    inline_mark: int = 0,
    default_value: str | None = None,
) -> FormField:
    form_field = FormField(
        form_id=form_id,
        field_definition_id=field_definition_id,
        sort_order=sort_order,
        inline_mark=inline_mark,
        default_value=default_value,
    )
    session.add(form_field)
    session.flush()
    return form_field


def build_template_db(tmp_path: Path, *, with_unit: bool) -> tuple[Path, int]:
    db_path = tmp_path / ("template_with_unit.db" if with_unit else "template_without_unit.db")
    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    with session_factory() as template_session:
        project = create_project(template_session, name="模板项目")
        form = create_form(template_session, project.id, name="模板表单")
        unit_id = None

        if with_unit:
            unit = Unit(project_id=project.id, symbol="支", code="ZHI")
            template_session.add(unit)
            template_session.flush()
            unit_id = unit.id

        field_definition = create_field_definition(
            template_session,
            project.id,
            variable_name="TEMP_FIELD",
            label="模板字段",
            field_type="文本",
            unit_id=unit_id,
        )
        create_form_field(
            template_session,
            form.id,
            field_definition.id,
            inline_mark=1,
            default_value="模板默认值",
        )
        template_session.commit()

    engine.dispose()
    return db_path, form.id


def test_get_template_form_fields_returns_unit_symbol(tmp_path: Path, session: Session) -> None:
    template_path, form_id = build_template_db(tmp_path, with_unit=True)
    service = ImportService(session)

    fields = service.get_template_form_fields(str(template_path), form_id)

    assert len(fields) == 1
    assert fields[0]["unit_symbol"] == "支"


def test_get_template_form_fields_returns_none_unit_when_no_unit(
    tmp_path: Path,
    session: Session,
) -> None:
    template_path, form_id = build_template_db(tmp_path, with_unit=False)
    service = ImportService(session)

    fields = service.get_template_form_fields(str(template_path), form_id)

    assert len(fields) == 1
    assert fields[0]["unit_symbol"] is None


def test_update_inline_mark_clears_default_value(session: Session) -> None:
    project = create_project(session)
    form = create_form(session, project.id)
    field_definition = create_field_definition(session, project.id)
    form_field = create_form_field(
        session,
        form.id,
        field_definition.id,
        inline_mark=1,
        default_value="some text",
    )
    repo = FormFieldRepository(session)

    updated = repo.update_inline_mark(form_field.id, 0)

    assert updated is True
    refreshed = repo.get_by_id(form_field.id)
    assert refreshed is not None
    assert refreshed.default_value is None
    assert refreshed.inline_mark == 0


def test_update_inline_mark_preserves_default_value_when_enabling(session: Session) -> None:
    project = create_project(session)
    form = create_form(session, project.id)
    field_definition = create_field_definition(session, project.id)
    form_field = create_form_field(
        session,
        form.id,
        field_definition.id,
        inline_mark=0,
        default_value=None,
    )
    form_field.default_value = "test"
    session.flush()
    repo = FormFieldRepository(session)

    updated = repo.update_inline_mark(form_field.id, 1)

    assert updated is True
    refreshed = repo.get_by_id(form_field.id)
    assert refreshed is not None
    assert refreshed.default_value == "test"
    assert refreshed.inline_mark == 1
