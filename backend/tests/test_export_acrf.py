from __future__ import annotations

from pathlib import Path
from zipfile import ZipFile

from docx import Document
from lxml import etree
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from src.models import Base
from src.models.codelist import CodeList, CodeListOption
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.user import User
from src.models.visit import Visit
from src.models.visit_form import VisitForm
from src.services.export_service import (
    ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU,
    ACRF_ANNOTATION_EMU_PER_01CM,
    ExportService,
    LayoutDecision,
    Segment,
)
from src.services.word_table_parity import extract_docx_form_table_fields

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "wps": "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
}


def _document_xml_tree(docx_path: Path) -> etree._Element:
    with ZipFile(docx_path) as archive:
        return etree.fromstring(archive.read("word/document.xml"))


def _annotation_texts(docx_path: Path) -> list[str]:
    tree = _document_xml_tree(docx_path)
    return tree.xpath("//wps:txbx//w:t/text()", namespaces=NS)


def _annotation_anchor_count(docx_path: Path) -> int:
    tree = _document_xml_tree(docx_path)
    return len(tree.xpath("//wp:anchor", namespaces=NS))


def _annotation_shape_count(docx_path: Path) -> int:
    tree = _document_xml_tree(docx_path)
    return len(tree.xpath("//wps:wsp", namespaces=NS))


def _annotation_docpr_ids(docx_path: Path) -> list[str]:
    tree = _document_xml_tree(docx_path)
    return tree.xpath("//wp:docPr/@id", namespaces=NS)


def _annotation_offsets_by_text(docx_path: Path) -> dict[str, int]:
    tree = _document_xml_tree(docx_path)
    offsets: dict[str, int] = {}
    for anchor in tree.xpath("//wp:anchor", namespaces=NS):
        texts = anchor.xpath(".//wps:txbx//w:t/text()", namespaces=NS)
        if not texts:
            continue
        pos_offsets = anchor.xpath("./wp:positionV/wp:posOffset/text()", namespaces=NS)
        if not pos_offsets:
            continue
        offsets["".join(texts)] = int(pos_offsets[0])
    return offsets


def _assert_anchors_wrapped_in_drawing(docx_path: Path) -> None:
    """每个 wp:anchor 必须包在 w:drawing 里、且 drawing 在 w:r 内。

    缺少 w:drawing 包裹会产生非法 OOXML（wp:anchor 直挂 w:r），
    导致 Word 判定文档损坏、无法打开。
    """
    tree = _document_xml_tree(docx_path)
    anchors = tree.xpath("//wp:anchor", namespaces=NS)
    assert anchors, "aCRF 应至少包含一个浮动注释 anchor"
    for anchor in anchors:
        drawing = anchor.getparent()
        assert drawing is not None and drawing.tag == f"{{{NS['w']}}}drawing"
        run = drawing.getparent()
        assert run is not None and run.tag == f"{{{NS['w']}}}r"


def _assert_no_annotation_nodes(docx_path: Path) -> None:
    tree = _document_xml_tree(docx_path)
    assert tree.xpath("//wp:anchor", namespaces=NS) == []
    assert tree.xpath("//wps:wsp", namespaces=NS) == []
    assert tree.xpath("//wps:txbx//w:t", namespaces=NS) == []


def _create_project(session: Session, name: str = "Annotated Project") -> Project:
    suffix = session.query(User).count() + 1
    owner = User(username=f"user_{name.replace(' ', '_')}_{suffix}")
    session.add(owner)
    session.flush()
    project = Project(name=name, version="v1.0", owner_id=owner.id)
    session.add(project)
    session.flush()
    return project


def _create_visit(session: Session, project_id: int, name: str = "Visit 1") -> Visit:
    visit = Visit(project_id=project_id, name=name, code=f"{name}_CODE", sequence=1)
    session.add(visit)
    session.flush()
    return visit


def _create_form(
    session: Session,
    project_id: int,
    *,
    name: str,
    code: str,
    order_index: int,
    domain: str | None = None,
) -> Form:
    form = Form(
        project_id=project_id,
        name=name,
        code=code,
        domain=domain,
        order_index=order_index,
    )
    session.add(form)
    session.flush()
    return form


def _attach_form_to_visit(session: Session, visit: Visit, form: Form, sequence: int) -> None:
    session.add(VisitForm(visit_id=visit.id, form_id=form.id, sequence=sequence))
    session.flush()


def _create_codelist(session: Session, project_id: int, name: str) -> CodeList:
    codelist = CodeList(project_id=project_id, name=name, code=f"{name}_CODE")
    session.add(codelist)
    session.flush()
    for index, decode in enumerate(("Option A", "Option B"), start=1):
        session.add(
            CodeListOption(
                codelist_id=codelist.id,
                code=f"OPT{index}",
                decode=decode,
                order_index=index,
            )
        )
    session.flush()
    return codelist


def _create_field_definition(
    session: Session,
    project_id: int,
    *,
    variable_name: str,
    label: str,
    field_type: str = "文本",
    codelist: CodeList | None = None,
) -> FieldDefinition:
    field_definition = FieldDefinition(
        project_id=project_id,
        variable_name=variable_name,
        label=label,
        field_type=field_type,
        codelist_id=codelist.id if codelist is not None else None,
    )
    session.add(field_definition)
    session.flush()
    return field_definition


def _add_form_field(
    session: Session,
    form: Form,
    *,
    order_index: int,
    field_definition: FieldDefinition | None = None,
    inline_mark: int = 0,
    is_log_row: int = 0,
    label_override: str | None = None,
    default_value: str | None = None,
) -> FormField:
    form_field = FormField(
        form_id=form.id,
        field_definition_id=field_definition.id if field_definition is not None else None,
        order_index=order_index,
        inline_mark=inline_mark,
        is_log_row=is_log_row,
        label_override=label_override,
        default_value=default_value,
    )
    session.add(form_field)
    session.flush()
    return form_field


def _export_project_pair(session: Session, project_id: int, tmp_path: Path) -> tuple[Path, Path]:
    export_service = ExportService(session)
    ecrf_path = tmp_path / "project-ecrf.docx"
    acrf_path = tmp_path / "project-acrf.docx"

    assert export_service.export_project_to_word(
        project_id,
        str(ecrf_path),
        annotated=False,
        bake_toc_page_numbers=False,
    )
    assert export_service.export_project_to_word(
        project_id,
        str(acrf_path),
        annotated=True,
        bake_toc_page_numbers=False,
    )
    return ecrf_path, acrf_path


def _build_legacy_fixture(session: Session) -> Project:
    project = _create_project(session, name="Annotated Export")
    visit = _create_visit(session, project.id)

    legacy_form = _create_form(
        session,
        project.id,
        name="Legacy Form",
        code="FORM_LEGACY",
        order_index=1,
        domain="LB",
    )
    inline_form = _create_form(
        session,
        project.id,
        name="Inline Form",
        code="FORM_INLINE",
        order_index=2,
        domain=None,
    )
    _attach_form_to_visit(session, visit, legacy_form, sequence=1)
    _attach_form_to_visit(session, visit, inline_form, sequence=2)

    choice_list = _create_codelist(session, project.id, "Legacy Choices")

    regular = _create_field_definition(
        session,
        project.id,
        variable_name="LEGACY_REG",
        label="Regular Field",
    )
    label = _create_field_definition(
        session,
        project.id,
        variable_name="LEGACY_LABEL",
        label="Section Label",
        field_type="标签",
    )
    vertical_single = _create_field_definition(
        session,
        project.id,
        variable_name="LEGACY_V_SINGLE",
        label="Vertical Single",
        field_type="单选（纵向）",
        codelist=choice_list,
    )
    vertical_multi = _create_field_definition(
        session,
        project.id,
        variable_name="LEGACY_V_MULTI",
        label="Vertical Multi",
        field_type="多选（纵向）",
        codelist=choice_list,
    )

    _add_form_field(session, legacy_form, order_index=1, field_definition=regular)
    _add_form_field(session, legacy_form, order_index=2, field_definition=label)
    _add_form_field(
        session,
        legacy_form,
        order_index=3,
        field_definition=None,
        is_log_row=1,
        label_override="Standalone log row",
    )
    _add_form_field(session, legacy_form, order_index=4, field_definition=vertical_single)
    _add_form_field(session, legacy_form, order_index=5, field_definition=vertical_multi)

    for order_index, variable_name in enumerate(("INLINE_ONE", "INLINE_TWO", "INLINE_THREE"), start=1):
        inline_field = _create_field_definition(
            session,
            project.id,
            variable_name=variable_name,
            label=variable_name.replace("_", " ").title(),
        )
        _add_form_field(
            session,
            inline_form,
            order_index=order_index,
            field_definition=inline_field,
            inline_mark=1,
        )

    session.commit()
    return project


def _build_unified_fixture(session: Session) -> tuple[Form, list[Segment], LayoutDecision]:
    project = _create_project(session, name="Unified Annotations")
    form = _create_form(
        session,
        project.id,
        name="Unified Form",
        code="FORM_UNIFIED",
        order_index=1,
        domain="QS",
    )

    regular = _create_field_definition(
        session,
        project.id,
        variable_name="UNI_REGULAR",
        label="Unified Regular",
    )
    label = _create_field_definition(
        session,
        project.id,
        variable_name="UNI_LABEL",
        label="Unified Label",
        field_type="标签",
    )

    regular_field = _add_form_field(session, form, order_index=1, field_definition=regular)
    label_field = _add_form_field(session, form, order_index=2, field_definition=label)
    log_field = _add_form_field(
        session,
        form,
        order_index=3,
        field_definition=None,
        is_log_row=1,
        label_override="Unified log row",
    )

    inline_fields: list[FormField] = []
    for order_index, variable_name in enumerate(
        ("UNI_INLINE_1", "UNI_INLINE_2", "UNI_INLINE_3", "UNI_INLINE_4", "UNI_INLINE_5"),
        start=10,
    ):
        inline_definition = _create_field_definition(
            session,
            project.id,
            variable_name=variable_name,
            label=variable_name.replace("_", " ").title(),
        )
        inline_fields.append(
            _add_form_field(
                session,
                form,
                order_index=order_index,
                field_definition=inline_definition,
                inline_mark=1,
            )
        )

    session.commit()
    segments = [
        Segment("regular_field", [regular_field]),
        Segment("full_row", [label_field]),
        Segment("full_row", [log_field]),
        Segment("inline_block", inline_fields),
    ]
    layout = LayoutDecision("unified_landscape", column_count=5, label_span=2, value_span=3)
    return form, segments, layout


def _save_unified_doc(
    session: Session,
    tmp_path: Path,
    *,
    annotated: bool,
) -> Path:
    form, segments, layout = _build_unified_fixture(session)
    document = Document()
    export_service = ExportService(session)
    export_service._apply_document_style(document)
    export_service._add_toc_heading(
        document,
        "1. Unified Form",
        level=1,
        form_domain=form.domain,
        annotated=annotated,
    )
    export_service._build_unified_table(
        document,
        segments,
        layout,
        form_id=form.id,
        available_cm=export_service.LANDSCAPE_CONTENT_WIDTH_CM,
        annotated=annotated,
    )
    output_path = tmp_path / ("unified-annotated.docx" if annotated else "unified-plain.docx")
    document.save(output_path)
    return output_path


def _assert_unique_docpr_ids(docx_path: Path) -> None:
    docpr_ids = _annotation_docpr_ids(docx_path)
    assert docpr_ids
    assert len(docpr_ids) == len(set(docpr_ids))


def _assert_annotation_counts(texts: list[str], expected_once: list[str], absent: list[str]) -> None:
    for text in expected_once:
        assert texts.count(text) == 1, f"{text!r} should appear exactly once in annotation boxes"
    for text in absent:
        assert text not in texts, f"{text!r} should not be rendered as an annotation box"


def _make_engine():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _enable_fk(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys = ON")

    Base.metadata.create_all(engine)
    return engine


def test_acrf_export_adds_expected_annotation_boxes_and_preserves_form_tables(tmp_path: Path) -> None:
    engine = _make_engine()
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        with session_factory() as session:
            project = _build_legacy_fixture(session)
            ecrf_path, acrf_path = _export_project_pair(session, project.id, tmp_path)

        acrf_texts = _annotation_texts(acrf_path)
        expected_texts = [
            "LB",
            "LEGACY_REG",
            "LEGACY_LABEL",
            "LEGACY_V_SINGLE",
            "LEGACY_V_MULTI",
            "INLINE_ONE",
            "INLINE_TWO",
            "INLINE_THREE",
        ]
        _assert_annotation_counts(acrf_texts, expected_texts, absent=["Standalone log row"])
        assert _annotation_anchor_count(acrf_path) == len(expected_texts)
        assert _annotation_shape_count(acrf_path) == len(expected_texts)
        _assert_anchors_wrapped_in_drawing(acrf_path)
        _assert_unique_docpr_ids(acrf_path)
        _assert_no_annotation_nodes(ecrf_path)
        assert extract_docx_form_table_fields(acrf_path) == extract_docx_form_table_fields(ecrf_path)
    finally:
        engine.dispose()


def test_unified_annotation_helpers_only_emit_boxes_for_annotated_output(tmp_path: Path) -> None:
    engine = _make_engine()
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        with session_factory() as session:
            plain_path = _save_unified_doc(session, tmp_path, annotated=False)
        with session_factory() as session:
            annotated_path = _save_unified_doc(session, tmp_path, annotated=True)

        _assert_no_annotation_nodes(plain_path)
        annotated_texts = _annotation_texts(annotated_path)
        expected_texts = [
            "QS",
            "UNI_REGULAR",
            "UNI_LABEL",
            "UNI_INLINE_1",
            "UNI_INLINE_2",
            "UNI_INLINE_3",
            "UNI_INLINE_4",
            "UNI_INLINE_5",
        ]
        _assert_annotation_counts(annotated_texts, expected_texts, absent=["Unified log row"])
        assert _annotation_anchor_count(annotated_path) == len(expected_texts)
        assert _annotation_shape_count(annotated_path) == len(expected_texts)
        _assert_unique_docpr_ids(annotated_path)
    finally:
        engine.dispose()


def test_acrf_export_applies_annotation_delta_y_offsets(tmp_path: Path) -> None:
    engine = _make_engine()
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        with session_factory() as session:
            project = _create_project(session, name="Offset Project")
            visit = _create_visit(session, project.id)
            form = _create_form(
                session,
                project.id,
                name="Offset Form",
                code="OFFSET_FORM",
                order_index=1,
                domain="DM",
            )
            form.annotation_positions = (
                '{"_form":{"y":25},"OFFSET_VAR":{"y":-40},"CLAMP_VAR":{"y":999}}'
            )
            offset_field = _create_field_definition(
                session,
                project.id,
                variable_name="OFFSET_VAR",
                label="Offset Field",
            )
            clamp_field = _create_field_definition(
                session,
                project.id,
                variable_name="CLAMP_VAR",
                label="Clamp Field",
            )
            _add_form_field(
                session,
                form,
                order_index=1,
                field_definition=offset_field,
            )
            _add_form_field(
                session,
                form,
                order_index=2,
                field_definition=clamp_field,
            )
            _attach_form_to_visit(session, visit, form, sequence=1)
            ecrf_path, acrf_path = _export_project_pair(session, project.id, tmp_path)

        offsets = _annotation_offsets_by_text(acrf_path)
        assert offsets["DM"] == (
            ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU
            + 25 * ACRF_ANNOTATION_EMU_PER_01CM
        )
        assert offsets["OFFSET_VAR"] == (
            ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU
            - 40 * ACRF_ANNOTATION_EMU_PER_01CM
        )
        assert offsets["CLAMP_VAR"] == (
            ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU
            + 200 * ACRF_ANNOTATION_EMU_PER_01CM
        )
        assert extract_docx_form_table_fields(acrf_path) == extract_docx_form_table_fields(ecrf_path)
    finally:
        engine.dispose()


def test_acrf_export_trims_variable_name_for_annotation_lookup(tmp_path: Path) -> None:
    engine = _make_engine()
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        with session_factory() as session:
            project = _create_project(session, name="Trimmed Offset Project")
            visit = _create_visit(session, project.id)
            form = _create_form(
                session,
                project.id,
                name="Trimmed Offset Form",
                code="TRIMMED_OFFSET_FORM",
                order_index=1,
                domain="DM",
            )
            form.annotation_positions = '{"OFFSET_VAR":{"y":30}}'
            offset_field = _create_field_definition(
                session,
                project.id,
                variable_name="  OFFSET_VAR  ",
                label="Offset Field",
            )
            _add_form_field(
                session,
                form,
                order_index=1,
                field_definition=offset_field,
            )
            _attach_form_to_visit(session, visit, form, sequence=1)

            output_path = tmp_path / "trimmed-offset-acrf.docx"
            ok = ExportService(session).export_project_to_word(
                project.id,
                str(output_path),
                annotated=True,
            )

            assert ok is True

        offsets = _annotation_offsets_by_text(output_path)
        assert offsets["OFFSET_VAR"] == (
            ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU
            + 30 * ACRF_ANNOTATION_EMU_PER_01CM
        )
        assert "  OFFSET_VAR  " not in offsets
    finally:
        engine.dispose()


def test_plain_export_ignores_invalid_annotation_positions(tmp_path: Path) -> None:
    engine = _make_engine()
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        with session_factory() as session:
            project = _create_project(session, name="Plain Invalid Offset Project")
            visit = _create_visit(session, project.id)
            form = _create_form(
                session,
                project.id,
                name="Plain Invalid Offset Form",
                code="PLAIN_INVALID_OFFSET_FORM",
                order_index=1,
                domain="DM",
            )
            form.annotation_positions = '{"_bad":{"y":1}}'
            offset_field = _create_field_definition(
                session,
                project.id,
                variable_name="OFFSET_VAR",
                label="Offset Field",
            )
            _add_form_field(
                session,
                form,
                order_index=1,
                field_definition=offset_field,
            )
            _attach_form_to_visit(session, visit, form, sequence=1)

            output_path = tmp_path / "plain-invalid-acrf.docx"
            ok = ExportService(session).export_project_to_word(
                project.id,
                str(output_path),
                annotated=False,
            )

            assert ok is True

        _assert_no_annotation_nodes(output_path)
    finally:
        engine.dispose()


def test_acrf_export_rejects_invalid_annotation_positions(tmp_path: Path) -> None:
    engine = _make_engine()
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        with session_factory() as session:
            project = _create_project(session, name="Invalid Offset Project")
            visit = _create_visit(session, project.id)
            form = _create_form(
                session,
                project.id,
                name="Invalid Offset Form",
                code="INVALID_OFFSET_FORM",
                order_index=1,
                domain="DM",
            )
            form.annotation_positions = '{"_bad":{"y":1}}'
            offset_field = _create_field_definition(
                session,
                project.id,
                variable_name="OFFSET_VAR",
                label="Offset Field",
            )
            _add_form_field(
                session,
                form,
                order_index=1,
                field_definition=offset_field,
            )
            _attach_form_to_visit(session, visit, form, sequence=1)

            ok = ExportService(session).export_project_to_word(
                project.id,
                str(tmp_path / "invalid-acrf.docx"),
                annotated=True,
            )

            assert ok is False
    finally:
        engine.dispose()
