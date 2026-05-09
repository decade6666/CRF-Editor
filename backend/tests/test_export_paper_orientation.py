from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from src.models import Base
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.services.export_service import ExportService


def _build_session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    return session_factory()


def _create_project(session: Session) -> Project:
    project = Project(name="项目", version="v1.0")
    session.add(project)
    session.flush()
    return project


def _create_form(
    session: Session,
    project_id: int,
    *,
    name: str,
    paper_orientation: str = "auto",
) -> Form:
    form = Form(
        project_id=project_id,
        name=name,
        code=f"{name}_CODE",
        order_index=1,
        paper_orientation=paper_orientation,
    )
    session.add(form)
    session.flush()
    return form


def _create_field_definition(session: Session, project_id: int, *, variable_name: str, label: str) -> FieldDefinition:
    field_definition = FieldDefinition(
        project_id=project_id,
        variable_name=variable_name,
        label=label,
        field_type="文本",
    )
    session.add(field_definition)
    session.flush()
    return field_definition


def _create_form_field(
    session: Session,
    form_id: int,
    field_definition_id: int,
    *,
    order_index: int,
    inline_mark: int = 0,
) -> FormField:
    form_field = FormField(
        form_id=form_id,
        field_definition_id=field_definition_id,
        order_index=order_index,
        inline_mark=inline_mark,
    )
    session.add(form_field)
    session.flush()
    return form_field


def _add_wide_inline_group(session: Session, form: Form, *, count: int = 5) -> None:
    for idx in range(1, count + 1):
        fd = _create_field_definition(
            session,
            form.project_id,
            variable_name=f"F{idx}",
            label=f"字段{idx}",
        )
        _create_form_field(
            session,
            form.id,
            field_definition_id=fd.id,
            order_index=idx,
            inline_mark=1,
        )


def _add_standard_fields(session: Session, form: Form, *, count: int = 2) -> None:
    for idx in range(1, count + 1):
        fd = _create_field_definition(
            session,
            form.project_id,
            variable_name=f"N{idx}",
            label=f"普通字段{idx}",
        )
        _create_form_field(session, form.id, field_definition_id=fd.id, order_index=idx)


def test_classify_layout_auto_returns_mixed_landscape_for_wide_inline_group() -> None:
    with _build_session() as session:
        project = _create_project(session)
        form = _create_form(session, project.id, name="宽表单", paper_orientation="auto")
        _add_standard_fields(session, form, count=1)
        _add_wide_inline_group(session, form, count=5)

        form_fields = sorted(form.form_fields, key=lambda ff: (ff.order_index, ff.id))
        decision = ExportService(session)._classify_form_layout(form_fields, paper_orientation="auto")

        assert decision.mode == "mixed_landscape"
        assert decision.force_landscape is False
        assert decision.force_portrait is False


def test_classify_layout_portrait_forces_legacy_and_disables_wide_switch() -> None:
    with _build_session() as session:
        project = _create_project(session)
        form = _create_form(session, project.id, name="宽表单", paper_orientation="portrait")
        _add_standard_fields(session, form, count=1)
        _add_wide_inline_group(session, form, count=5)

        form_fields = sorted(form.form_fields, key=lambda ff: (ff.order_index, ff.id))
        decision = ExportService(session)._classify_form_layout(form_fields, paper_orientation="portrait")

        assert decision.mode == "legacy"
        assert decision.force_landscape is False
        assert decision.force_portrait is True


def test_classify_layout_landscape_forces_legacy_form_to_landscape() -> None:
    with _build_session() as session:
        project = _create_project(session)
        form = _create_form(session, project.id, name="普通表单", paper_orientation="landscape")
        _add_standard_fields(session, form, count=2)

        form_fields = sorted(form.form_fields, key=lambda ff: (ff.order_index, ff.id))
        decision = ExportService(session)._classify_form_layout(form_fields, paper_orientation="landscape")

        assert decision.mode == "legacy"
        assert decision.force_landscape is True
        assert decision.force_portrait is False


def test_export_portrait_override_passes_non_wide_inline_flag(tmp_path: Path) -> None:
    with _build_session() as session:
        project = _create_project(session)
        form = _create_form(session, project.id, name="纵向宽表单", paper_orientation="portrait")
        _add_wide_inline_group(session, form, count=5)
        output_path = tmp_path / "portrait.docx"

        captured_is_wide: list[bool] = []
        original = ExportService._add_inline_table

        def _spy(self, doc, group, is_wide, form_id=None):
            captured_is_wide.append(is_wide)
            return original(self, doc, group, is_wide, form_id=form_id)

        with patch.object(ExportService, "_add_inline_table", _spy):
            ok = ExportService(session).export_project_to_word(project.id, str(output_path))

        assert ok is True
        assert captured_is_wide
        assert captured_is_wide == [False]


def test_export_auto_mode_keeps_wide_inline_flag(tmp_path: Path) -> None:
    with _build_session() as session:
        project = _create_project(session)
        form = _create_form(session, project.id, name="自动宽表单", paper_orientation="auto")
        _add_wide_inline_group(session, form, count=5)
        output_path = tmp_path / "auto.docx"

        captured_is_wide: list[bool] = []
        original = ExportService._add_inline_table

        def _spy(self, doc, group, is_wide, form_id=None):
            captured_is_wide.append(is_wide)
            return original(self, doc, group, is_wide, form_id=form_id)

        with patch.object(ExportService, "_add_inline_table", _spy):
            ok = ExportService(session).export_project_to_word(project.id, str(output_path))

        assert ok is True
        assert captured_is_wide
        assert captured_is_wide == [True]
