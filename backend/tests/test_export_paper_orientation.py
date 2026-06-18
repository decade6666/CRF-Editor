from __future__ import annotations

from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from src.models import Base
from src.models.field_definition import FieldDefinition
from src.models.codelist import CodeList, CodeListOption
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


def _create_field_definition(
    session: Session,
    project_id: int,
    *,
    variable_name: str,
    label: str,
    field_type: str = "文本",
    codelist_id: int | None = None,
) -> FieldDefinition:
    field_definition = FieldDefinition(
        project_id=project_id,
        variable_name=variable_name,
        label=label,
        field_type=field_type,
        codelist_id=codelist_id,
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


def _add_vertical_choice_field(session: Session, form: Form) -> None:
    codelist = CodeList(project_id=form.project_id, name="是否字典", code="YN")
    codelist.options = [
        CodeListOption(code="1", decode="是", order_index=1),
        CodeListOption(code="2", decode="否", order_index=2),
        CodeListOption(code="3", decode="不适用", order_index=3),
    ]
    session.add(codelist)
    session.flush()
    fd = _create_field_definition(
        session,
        form.project_id,
        variable_name="VC1",
        label="纵向多选字段",
        field_type="多选（纵向）",
        codelist_id=codelist.id,
    )
    _create_form_field(session, form.id, field_definition_id=fd.id, order_index=1)


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


_WORD_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def _read_document_xml(docx_path: Path) -> ET.Element:
    with zipfile.ZipFile(docx_path) as docx_zip:
        document_xml = docx_zip.read("word/document.xml")
    return ET.fromstring(document_xml)


def _paragraph_text(paragraph: ET.Element) -> str:
    return "".join(node.text or "" for node in paragraph.findall(".//w:t", _WORD_NS))


def _paragraph_spacing_for_text(root: ET.Element, expected_text: str) -> ET.Element:
    for paragraph in root.findall(".//w:p", _WORD_NS):
        if expected_text in _paragraph_text(paragraph):
            spacing = paragraph.find("w:pPr/w:spacing", _WORD_NS)
            assert spacing is not None, f"paragraph {expected_text!r} should define spacing"
            return spacing
    raise AssertionError(f"paragraph {expected_text!r} not found in exported document")


def test_export_form_rows_use_at_least_one_cm_height_and_exact_line_spacing(tmp_path: Path) -> None:
    with _build_session() as session:
        project = _create_project(session)
        form = _create_form(session, project.id, name="行高表单", paper_orientation="portrait")
        _add_standard_fields(session, form, count=1)
        output_path = tmp_path / "row_height.docx"

        ok = ExportService(session).export_project_to_word(project.id, str(output_path))

    assert ok is True
    root = _read_document_xml(output_path)
    expected_height_twips = str(round(ExportService.FORM_TABLE_ROW_HEIGHT_CM * 28.3465 * 20))
    expected_vpad_twips = str(round(ExportService.CELL_VPAD_PT * 20))
    expected_line_twips = str(round(ExportService.SINGLE_LINE_HEIGHT_PT * 20))

    row_heights = root.findall(".//w:trHeight", _WORD_NS)
    assert row_heights, "exported tables should declare row heights"
    assert all(height.get(f"{{{_WORD_NS['w']}}}hRule") == "atLeast" for height in row_heights)
    assert all(height.get(f"{{{_WORD_NS['w']}}}val") == expected_height_twips for height in row_heights)

    label_spacing = _paragraph_spacing_for_text(root, "普通字段1")
    assert label_spacing.get(f"{{{_WORD_NS['w']}}}before") == expected_vpad_twips
    assert label_spacing.get(f"{{{_WORD_NS['w']}}}after") == expected_vpad_twips
    assert label_spacing.get(f"{{{_WORD_NS['w']}}}lineRule") == "exact"
    assert label_spacing.get(f"{{{_WORD_NS['w']}}}line") == expected_line_twips


def test_export_vertical_choice_rows_can_expand_without_extra_option_padding(tmp_path: Path) -> None:
    with _build_session() as session:
        project = _create_project(session)
        form = _create_form(session, project.id, name="纵向选项表单", paper_orientation="portrait")
        _add_vertical_choice_field(session, form)
        output_path = tmp_path / "vertical_choice_height.docx"

        ok = ExportService(session).export_project_to_word(project.id, str(output_path))

    assert ok is True
    root = _read_document_xml(output_path)
    expected_line_twips = str(round(ExportService.SINGLE_LINE_HEIGHT_PT * 20))
    expected_gap_twips = str(round(ExportService.VERTICAL_OPTION_GAP_PT * 20))

    option_spacings: dict[str, ET.Element] = {}
    option_snaps: dict[str, ET.Element | None] = {}
    for paragraph in root.findall(".//w:p", _WORD_NS):
        text = _paragraph_text(paragraph)
        if text in {"□是", "□否", "□不适用"}:
            spacing = paragraph.find("w:pPr/w:spacing", _WORD_NS)
            assert spacing is not None, f"option paragraph {text!r} should define spacing"
            option_spacings[text] = spacing
            option_snaps[text] = paragraph.find("w:pPr/w:snapToGrid", _WORD_NS)

    assert set(option_spacings) == {"□是", "□否", "□不适用"}
    assert option_spacings["□是"].get(f"{{{_WORD_NS['w']}}}before") == "0"
    assert option_spacings["□是"].get(f"{{{_WORD_NS['w']}}}after") == "0"
    for text in ["□否", "□不适用"]:
        spacing = option_spacings[text]
        assert spacing.get(f"{{{_WORD_NS['w']}}}before") == expected_gap_twips
        assert spacing.get(f"{{{_WORD_NS['w']}}}after") == "0"
    for spacing in option_spacings.values():
        assert spacing.get(f"{{{_WORD_NS['w']}}}lineRule") == "exact"
        assert spacing.get(f"{{{_WORD_NS['w']}}}line") == expected_line_twips

    # docGrid(15.6pt 行网格)下必须关闭网格吸附，否则首项 before=0 与其余项
    # before=3pt 会被吸附成“首项到第二项间距偏大”的视觉不一致（段落里存储的
    # 间距其实一致）。snapToGrid=0 让精确间距原样呈现，各选项间距保持一致。
    for text, snap in option_snaps.items():
        assert snap is not None, f"option paragraph {text!r} should disable snapToGrid"
        assert snap.get(f"{{{_WORD_NS['w']}}}val") == "0", (
            f"option paragraph {text!r} must set snapToGrid=0 for uniform inter-option spacing"
        )
