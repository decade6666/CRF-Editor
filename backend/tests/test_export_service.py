from pathlib import Path
import os
import re
import tempfile

from docx import Document
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from src.models import Base
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.visit import Visit
from src.models.visit_form import VisitForm
from src.services.export_service import ExportService


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



def create_form(
    session: Session,
    project_id: int,
    *,
    name: str,
    order_index: int | None = None,
) -> Form:
    form = Form(
        project_id=project_id,
        name=name,
        code=f"{name}_CODE",
        order_index=order_index,
    )
    session.add(form)
    session.flush()
    return form



def create_visit(
    session: Session,
    project_id: int,
    *,
    name: str,
    sequence: int,
) -> Visit:
    visit = Visit(
        project_id=project_id,
        name=name,
        code=f"{name}_CODE",
        sequence=sequence,
    )
    session.add(visit)
    session.flush()
    return visit



def create_visit_form(
    session: Session,
    visit_id: int,
    form_id: int,
    *,
    sequence: int,
) -> VisitForm:
    visit_form = VisitForm(visit_id=visit_id, form_id=form_id, sequence=sequence)
    session.add(visit_form)
    session.flush()
    return visit_form



def create_field_definition(
    session: Session,
    project_id: int,
    *,
    variable_name: str,
    label: str,
    field_type: str = "文本",
) -> FieldDefinition:
    field_definition = FieldDefinition(
        project_id=project_id,
        variable_name=variable_name,
        label=label,
        field_type=field_type,
    )
    session.add(field_definition)
    session.flush()
    return field_definition



def create_form_field(
    session: Session,
    form_id: int,
    field_definition_id: int,
    *,
    sort_order: int,
    default_value: str | None = None,
) -> FormField:
    form_field = FormField(
        form_id=form_id,
        field_definition_id=field_definition_id,
        sort_order=sort_order,
        default_value=default_value,
    )
    session.add(form_field)
    session.flush()
    return form_field



def export_document(session: Session, project_id: int, tmp_path: Path) -> Document:
    output_path = tmp_path / f"project-{project_id}.docx"
    ok = ExportService(session).export_project_to_word(project_id, str(output_path))
    assert ok is True
    return Document(output_path)



def extract_form_headings(doc: Document) -> list[str]:
    headings: list[str] = []
    for paragraph in doc.paragraphs:
        text = paragraph.text.strip()
        if re.match(r"^\d+\.\s+", text):
            headings.append(text)
    return headings



def test_export_project_renders_one_table_per_form_for_standard_fields(
    session: Session,
    tmp_path: Path,
) -> None:
    project = create_project(session)
    form = create_form(session, project.id, name="生命体征", order_index=1)
    visit = create_visit(session, project.id, name="筛选期", sequence=1)
    create_visit_form(session, visit.id, form.id, sequence=7)

    systolic = create_field_definition(
        session,
        project.id,
        variable_name="SYSBP",
        label="收缩压",
    )
    diastolic = create_field_definition(
        session,
        project.id,
        variable_name="DIABP",
        label="舒张压",
    )
    create_form_field(session, form.id, systolic.id, sort_order=1, default_value="120")
    create_form_field(session, form.id, diastolic.id, sort_order=2, default_value="80")

    doc = export_document(session, project.id, tmp_path)

    assert len(doc.tables) == 3
    form_table = doc.tables[2]
    assert len(form_table.rows) == 2
    assert len(form_table.columns) == 2
    assert form_table.cell(0, 0).text.strip() == "收缩压"
    assert form_table.cell(1, 0).text.strip() == "舒张压"



def test_export_project_sorts_form_headings_by_order_index_then_id(
    session: Session,
    tmp_path: Path,
) -> None:
    project = create_project(session)
    create_form(session, project.id, name="Alpha", order_index=2)
    create_form(session, project.id, name="Zeta", order_index=1)
    create_form(session, project.id, name="LaterById", order_index=None)
    create_form(session, project.id, name="LastById", order_index=None)

    doc = export_document(session, project.id, tmp_path)

    assert extract_form_headings(doc) == [
        "1. Zeta",
        "2. Alpha",
        "3. LaterById",
        "4. LastById",
    ]



def test_export_project_visit_flow_uses_cross_marks_and_order_index_sorting(
    session: Session,
    tmp_path: Path,
) -> None:
    project = create_project(session)
    alpha = create_form(session, project.id, name="Alpha", order_index=2)
    zeta = create_form(session, project.id, name="Zeta", order_index=1)
    later_by_id = create_form(session, project.id, name="LaterById", order_index=None)
    last_by_id = create_form(session, project.id, name="LastById", order_index=None)
    visit = create_visit(session, project.id, name="筛选期", sequence=1)
    create_visit_form(session, visit.id, alpha.id, sequence=9)
    create_visit_form(session, visit.id, zeta.id, sequence=5)
    create_visit_form(session, visit.id, later_by_id.id, sequence=4)
    create_visit_form(session, visit.id, last_by_id.id, sequence=3)

    doc = export_document(session, project.id, tmp_path)

    visit_flow_table = doc.tables[1]
    assert visit_flow_table.cell(1, 0).text.strip() == "Zeta"
    assert visit_flow_table.cell(2, 0).text.strip() == "Alpha"
    assert visit_flow_table.cell(3, 0).text.strip() == "LaterById"
    assert visit_flow_table.cell(4, 0).text.strip() == "LastById"
    assert visit_flow_table.cell(1, 1).text.strip() == "×"
    assert visit_flow_table.cell(2, 1).text.strip() == "×"
    assert visit_flow_table.cell(3, 1).text.strip() == "×"
    assert visit_flow_table.cell(4, 1).text.strip() == "×"


def test_export_project_groups_adjacent_inline_fields_into_one_table(
    session: Session,
    tmp_path: Path,
) -> None:
    project = create_project(session)
    form = create_form(session, project.id, name="实验室检查", order_index=1)

    field_a = create_field_definition(
        session,
        project.id,
        variable_name="LAB_A",
        label="字段A",
    )
    field_b = create_field_definition(
        session,
        project.id,
        variable_name="LAB_B",
        label="字段B",
    )
    create_form_field(session, form.id, field_a.id, sort_order=1, default_value="第一行\n第二行")
    create_form_field(session, form.id, field_b.id, sort_order=2, default_value="仅一行")

    form.form_fields[0].inline_mark = 1
    form.form_fields[0].label_override = "覆盖标签A"
    form.form_fields[1].inline_mark = 1
    session.flush()

    doc = export_document(session, project.id, tmp_path)

    assert len(doc.tables) == 3
    inline_table = doc.tables[2]
    assert len(inline_table.columns) == 2
    assert inline_table.cell(0, 0).text.strip() == "覆盖标签A"
    assert inline_table.cell(0, 1).text.strip() == "字段B"
    assert inline_table.cell(1, 0).text.strip() == "第一行"
    assert inline_table.cell(1, 1).text.strip() == "仅一行"
    assert inline_table.cell(2, 0).text.strip() == "第二行"


def test_export_project_renders_cover_table_with_three_rows_two_cols(
    session: Session,
    tmp_path: Path,
) -> None:
    project = create_project(session)
    project.trial_name = "试验名称"
    project.protocol_number = "P-001"
    project.crf_version = "V1.0"
    doc = export_document(session, project.id, tmp_path)

    assert any("试验名称" in p.text for p in doc.paragraphs)
    assert any("V1.0" in p.text for p in doc.paragraphs)
    cover_table = doc.tables[0]
    assert len(cover_table.rows) == 3
    assert len(cover_table.columns) == 2
    assert cover_table.cell(0, 0).text.strip() == "方案编号"
    assert cover_table.cell(0, 1).text.strip() == "P-001"
    assert cover_table.cell(1, 0).text.strip() == "中心编号"
    assert cover_table.cell(2, 0).text.strip() == "筛选号"


def test_export_project_uses_visit_flow_skeleton_when_no_visits(
    session: Session,
    tmp_path: Path,
) -> None:
    project = create_project(session)

    doc = export_document(session, project.id, tmp_path)

    visit_flow_table = doc.tables[1]
    assert len(visit_flow_table.rows) == 1
    assert len(visit_flow_table.columns) == 1
    assert visit_flow_table.cell(0, 0).text.strip() == "访视名称"
    assert "暂无访视数据" not in [paragraph.text for paragraph in doc.paragraphs]


def test_export_project_renders_empty_form_as_single_empty_skeleton_row(
    session: Session,
    tmp_path: Path,
) -> None:
    project = create_project(session)
    create_form(session, project.id, name="空白表", order_index=1)

    doc = export_document(session, project.id, tmp_path)

    form_table = doc.tables[2]
    assert len(form_table.rows) == 1
    assert len(form_table.columns) == 2
    assert form_table.cell(0, 0).text.strip() == ""
    assert form_table.cell(0, 1).text.strip() == ""


def test_export_project_table_count_matches_cover_visit_and_forms(
    session: Session,
    tmp_path: Path,
) -> None:
    project = create_project(session)
    form_a = create_form(session, project.id, name="实验室检查", order_index=1)
    form_b = create_form(session, project.id, name="生命体征", order_index=2)
    visit_a = create_visit(session, project.id, name="筛选期", sequence=1)
    visit_b = create_visit(session, project.id, name="基线期", sequence=2)
    create_visit_form(session, visit_a.id, form_a.id, sequence=1)
    create_visit_form(session, visit_b.id, form_b.id, sequence=1)

    fd_a = create_field_definition(session, project.id, variable_name="LAB", label="实验室")
    fd_b = create_field_definition(session, project.id, variable_name="VITAL", label="体征")
    create_form_field(session, form_a.id, fd_a.id, sort_order=1, default_value="A")
    create_form_field(session, form_b.id, fd_b.id, sort_order=1, default_value="B")

    doc = export_document(session, project.id, tmp_path)

    assert len(doc.tables) == 2 + len(project.forms)
    visit_flow_table = doc.tables[1]
    assert len(visit_flow_table.rows) == len(project.forms) + 1
    assert len(visit_flow_table.columns) == len(project.visits) + 1


def test_export_no_forms_produces_3_tables(
    session: Session,
    tmp_path: Path,
) -> None:
    project = create_project(session)

    doc = export_document(session, project.id, tmp_path)

    assert len(doc.tables) >= 3
    empty_form_table = doc.tables[2]
    assert len(empty_form_table.rows) == 1
    assert len(empty_form_table.columns) == 2


def test_export_project_preserves_skip_first_two_tables_import_assumption(
    session: Session,
    tmp_path: Path,
) -> None:
    project = create_project(session)
    form = create_form(session, project.id, name="实验室检查", order_index=1)
    visit = create_visit(session, project.id, name="筛选期", sequence=1)
    create_visit_form(session, visit.id, form.id, sequence=1)
    field_definition = create_field_definition(session, project.id, variable_name="LAB", label="实验室")
    create_form_field(session, form.id, field_definition.id, sort_order=1, default_value="值")

    doc = export_document(session, project.id, tmp_path)

    assert doc.tables[0].cell(0, 0).text.strip() != "访视名称"
    assert doc.tables[1].cell(0, 0).text.strip() == "访视名称"
    assert doc.tables[2].cell(0, 0).text.strip() == "实验室"


# ---------------------------------------------------------------------------
# Phase 4.4: PBT 属性测试（hypothesis）
# ---------------------------------------------------------------------------

def _make_in_memory_session():
    """创建内存 SQLite session（供 hypothesis 测试使用，独立于 pytest fixture）"""
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)(), engine


@given(form_count=st.integers(min_value=0, max_value=5))
@settings(max_examples=15, deadline=None)
def test_pbt_p1_export_always_produces_nonempty_file(form_count: int) -> None:
    """P1: 任意表单数量的项目导出后文件大小 > 0"""
    db, engine = _make_in_memory_session()
    try:
        from src.models.project import Project
        from src.models.form import Form

        project = Project(name="PBT项目", version="v1.0")
        db.add(project)
        db.flush()
        for i in range(form_count):
            db.add(Form(project_id=project.id, name=f"表单{i}", code=f"F{i}", order_index=i))
        db.flush()

        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
            output_path = f.name
        try:
            ok = ExportService(db).export_project_to_word(project.id, output_path)
            assert ok is True, "export_project_to_word 应返回 True"
            assert os.path.getsize(output_path) > 0, "导出文件不应为 0 字节"
        finally:
            os.unlink(output_path)
    finally:
        db.close()
        engine.dispose()


@given(form_count=st.integers(min_value=0, max_value=5))
@settings(max_examples=15, deadline=None)
def test_pbt_p2_export_always_produces_valid_docx(form_count: int) -> None:
    """P2: 任意表单数量的项目导出后 Document() 可正常打开"""
    db, engine = _make_in_memory_session()
    try:
        from src.models.project import Project
        from src.models.form import Form

        project = Project(name="PBT项目", version="v1.0")
        db.add(project)
        db.flush()
        for i in range(form_count):
            db.add(Form(project_id=project.id, name=f"表单{i}", code=f"F{i}", order_index=i))
        db.flush()

        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
            output_path = f.name
        try:
            ExportService(db).export_project_to_word(project.id, output_path)
            doc = Document(output_path)  # 不应抛出异常
            assert len(doc.tables) >= 3, "导出文档应至少包含3张表格"
        finally:
            os.unlink(output_path)
    finally:
        db.close()
        engine.dispose()


@given(form_count=st.integers(min_value=1, max_value=4))
@settings(max_examples=10, deadline=None)
def test_pbt_p8_export_is_idempotent_in_structure(form_count: int) -> None:
    """P8: 同一项目导出两次，表格数量结构一致（幂等性）"""
    db, engine = _make_in_memory_session()
    try:
        from src.models.project import Project
        from src.models.form import Form

        project = Project(name="PBT项目", version="v1.0")
        db.add(project)
        db.flush()
        for i in range(form_count):
            db.add(Form(project_id=project.id, name=f"表单{i}", code=f"F{i}", order_index=i))
        db.flush()

        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f1, \
             tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f2:
            path1, path2 = f1.name, f2.name
        try:
            ExportService(db).export_project_to_word(project.id, path1)
            ExportService(db).export_project_to_word(project.id, path2)
            doc1, doc2 = Document(path1), Document(path2)
            assert len(doc1.tables) == len(doc2.tables), "两次导出表格数量应相同"
        finally:
            os.unlink(path1)
            os.unlink(path2)
    finally:
        db.close()
        engine.dispose()


@given(trial_name=st.one_of(
    st.none(),
    st.text(
        alphabet=st.characters(min_codepoint=32, max_codepoint=0x9FFF, blacklist_categories=("Cc", "Cs")),
        min_size=1,
        max_size=50,
    ),
))
@settings(max_examples=10, deadline=None)
def test_pbt_p9_empty_form_always_has_skeleton_table(trial_name) -> None:
    """P9: 空表单（无字段）导出后仍有骨架表格"""
    db, engine = _make_in_memory_session()
    try:
        from src.models.project import Project
        from src.models.form import Form

        project = Project(name="PBT空表单", version="v1.0", trial_name=trial_name)
        db.add(project)
        db.flush()
        db.add(Form(project_id=project.id, name="空白表单", code="EMPTY", order_index=1))
        db.flush()

        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as f:
            output_path = f.name
        try:
            ExportService(db).export_project_to_word(project.id, output_path)
            doc = Document(output_path)
            assert len(doc.tables) >= 3, "空表单项目也应有 >= 3 张表格（封面+访视图+骨架）"
            form_table = doc.tables[2]
            assert len(form_table.rows) >= 1
            assert len(form_table.columns) == 2
        finally:
            os.unlink(output_path)
    finally:
        db.close()
        engine.dispose()
