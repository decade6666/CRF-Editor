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

        def _spy(self, doc, group, is_wide, form_id=None, *, available_cm=None):
            captured_is_wide.append(is_wide)
            return original(
                self,
                doc,
                group,
                is_wide,
                form_id=form_id,
                available_cm=available_cm,
            )

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

        def _spy(self, doc, group, is_wide, form_id=None, *, available_cm=None):
            captured_is_wide.append(is_wide)
            return original(
                self,
                doc,
                group,
                is_wide,
                form_id=form_id,
                available_cm=available_cm,
            )

        with patch.object(ExportService, "_add_inline_table", _spy):
            ok = ExportService(session).export_project_to_word(project.id, str(output_path))

        assert ok is True
        assert captured_is_wide
        assert captured_is_wide == [True]


def test_export_landscape_uses_23_36cm_for_normal_table(tmp_path: Path) -> None:
    with _build_session() as session:
        project = _create_project(session)
        form = _create_form(session, project.id, name="横向普通表单", paper_orientation="landscape")
        _add_standard_fields(session, form, count=2)
        output_path = tmp_path / "landscape_normal.docx"

        captured_avail_cm: list[float] = []
        from src.services import export_service as export_service_mod

        original_planner = export_service_mod.plan_normal_table_width

        def _planner_spy(fields, available_cm):
            captured_avail_cm.append(available_cm)
            return original_planner(fields, available_cm)

        with patch.object(export_service_mod, "plan_normal_table_width", _planner_spy):
            ok = ExportService(session).export_project_to_word(project.id, str(output_path))

        assert ok is True
        assert captured_avail_cm == [23.36]



def test_export_landscape_uses_23_36cm_for_narrow_inline_budget(tmp_path: Path) -> None:
    with _build_session() as session:
        project = _create_project(session)
        form = _create_form(session, project.id, name="横向窄表单", paper_orientation="landscape")
        _add_wide_inline_group(session, form, count=3)
        output_path = tmp_path / "landscape_narrow_inline.docx"

        captured_avail_cm: list[float] = []
        from src.services import export_service as export_service_mod

        original_planner = export_service_mod.plan_inline_table_width

        def _planner_spy(headers, row_values, avail_cm, semantic_demands=None):
            captured_avail_cm.append(avail_cm)
            return original_planner(headers, row_values, avail_cm, semantic_demands=semantic_demands)

        with patch.object(export_service_mod, "plan_inline_table_width", _planner_spy):
            ok = ExportService(session).export_project_to_word(project.id, str(output_path))

        assert ok is True
        assert captured_avail_cm == [23.36]



def test_export_mixed_landscape_uses_23_36cm_for_normal_and_inline(tmp_path: Path) -> None:
    with _build_session() as session:
        project = _create_project(session)
        form = _create_form(session, project.id, name="自动混合横向表单", paper_orientation="auto")
        _add_standard_fields(session, form, count=1)
        _add_wide_inline_group(session, form, count=5)
        output_path = tmp_path / "mixed_landscape.docx"

        normal_avail_cm: list[float] = []
        inline_avail_cm: list[float] = []
        from src.services import export_service as export_service_mod

        original_normal_planner = export_service_mod.plan_normal_table_width
        original_inline_planner = export_service_mod.plan_inline_table_width

        def _normal_planner_spy(fields, available_cm):
            normal_avail_cm.append(available_cm)
            return original_normal_planner(fields, available_cm)

        def _inline_planner_spy(headers, row_values, avail_cm, semantic_demands=None):
            inline_avail_cm.append(avail_cm)
            return original_inline_planner(headers, row_values, avail_cm, semantic_demands=semantic_demands)

        with patch.object(export_service_mod, "plan_normal_table_width", _normal_planner_spy), patch.object(
            export_service_mod,
            "plan_inline_table_width",
            _inline_planner_spy,
        ):
            ok = ExportService(session).export_project_to_word(project.id, str(output_path))

        assert ok is True
        assert normal_avail_cm == [23.36]
        assert inline_avail_cm == [23.36]



def test_export_portrait_uses_14_66cm_inline_budget(tmp_path: Path) -> None:
    """portrait 强制时 inline 表格的可用宽度必须回到 14.66cm（非 23.36cm 横向预算）。"""
    with _build_session() as session:
        project = _create_project(session)
        form = _create_form(session, project.id, name="纵向宽表单", paper_orientation="portrait")
        _add_wide_inline_group(session, form, count=5)
        output_path = tmp_path / "portrait_budget.docx"

        captured_avail_cm: list[float] = []
        from src.services import export_service as export_service_mod

        original_planner = export_service_mod.plan_inline_table_width

        def _planner_spy(headers, row_values, avail_cm, semantic_demands=None):
            captured_avail_cm.append(avail_cm)
            return original_planner(headers, row_values, avail_cm, semantic_demands=semantic_demands)

        with patch.object(export_service_mod, "plan_inline_table_width", _planner_spy):
            ok = ExportService(session).export_project_to_word(project.id, str(output_path))

        assert ok is True
        assert captured_avail_cm, "portrait override should still produce at least one inline table"
        for avail in captured_avail_cm:
            assert avail == 14.66, f"portrait inline table must use 14.66cm, got {avail}"


def test_export_portrait_does_not_emit_landscape_section(tmp_path: Path) -> None:
    """portrait 强制时表单内容必须落在 PORTRAIT 分节里。

    导出文档里允许出现 LANDSCAPE 节（用于访视流程图），但流程图结束后会
    切回 PORTRAIT，表单内容必须继续在 PORTRAIT 节中渲染——也就是最后一个 section
    必须是 PORTRAIT，且表单循环不会再追加新的 LANDSCAPE 节。
    """
    from docx import Document
    from docx.enum.section import WD_ORIENT

    with _build_session() as session:
        project = _create_project(session)
        form = _create_form(session, project.id, name="纵向宽表单", paper_orientation="portrait")
        _add_wide_inline_group(session, form, count=5)
        output_path = tmp_path / "portrait_section.docx"

        original_switch = ExportService._switch_section
        switch_calls: list = []

        def _spy(self, doc, orientation, project_arg):
            switch_calls.append(orientation)
            return original_switch(self, doc, orientation, project_arg)

        with patch.object(ExportService, "_switch_section", _spy):
            ok = ExportService(session).export_project_to_word(project.id, str(output_path))
        assert ok is True

        doc = Document(str(output_path))
        orientations = [section.orientation for section in doc.sections]
        assert orientations, "exported document should contain at least one section"
        assert orientations[-1] == WD_ORIENT.PORTRAIT, (
            f"portrait override must keep form content inside a PORTRAIT section, got {orientations}"
        )
        landscape_switch_count = sum(1 for o in switch_calls if o == WD_ORIENT.LANDSCAPE)
        assert landscape_switch_count <= 1, (
            "portrait override must not add extra LANDSCAPE switches beyond the visit-flow diagram, "
            f"got {switch_calls}"
        )
