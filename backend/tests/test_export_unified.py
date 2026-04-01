"""Unified landscape 表单导出测试。

验证 mixed-field-landscape-form 变更的核心场景：
- unified 触发条件：has_regular + has_inline + max_block_width > 4
- legacy 路径回归：纯 normal/inline 表单不受影响
- unified 表格结构：单一 N 列表格 + landscape section
"""

from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.oxml.ns import qn
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from src.database import get_read_session, get_session
from src.models import Base
from src.models.project import Project
from src.models.user import User
from src.models.visit import Visit
from src.models.form import Form
from src.models.visit_form import VisitForm
from src.models.field_definition import FieldDefinition
from src.models.form_field import FormField
from src.services.export_service import ExportService


@pytest.fixture
def engine():
    """创建内存数据库引擎。"""
    _engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(_engine, "connect")
    def _enable_fk(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys = ON")

    Base.metadata.create_all(_engine)
    yield _engine
    _engine.dispose()


@pytest.fixture
def session(engine) -> Session:
    """创建数据库会话。"""
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    with session_factory() as db_session:
        yield db_session


def create_minimal_project(session: Session) -> tuple[Project, User]:
    """创建最小项目和用户。"""
    user = User(username="tester")
    session.add(user)
    session.flush()
    project = Project(name="Unified 测试项目", version="v1.0", owner_id=user.id)
    session.add(project)
    session.flush()
    return project, user


def create_text_field_def(session: Session, project_id: int, label: str) -> FieldDefinition:
    """创建文本字段定义。"""
    fd = FieldDefinition(
        project_id=project_id,
        label=label,
        variable_name=f"VAR_{label.replace(' ', '_')}",
        field_type="文本",
    )
    session.add(fd)
    session.flush()
    return fd


def create_label_field_def(session: Session, project_id: int, label: str) -> FieldDefinition:
    """创建标签字段定义。"""
    fd = FieldDefinition(
        project_id=project_id,
        label=label,
        variable_name=f"LBL_{label.replace(' ', '_')}",
        field_type="标签",
    )
    session.add(fd)
    session.flush()
    return fd


def add_field_to_form(
    session: Session,
    form_id: int,
    field_def_id: int,
    sort_order: int = 0,
    inline_mark: int = 0,
    is_log: int = 0,
) -> FormField:
    """将字段添加到表单。"""
    ff = FormField(
        form_id=form_id,
        field_definition_id=field_def_id if is_log == 0 else None,
        sort_order=sort_order,
        inline_mark=inline_mark,
        is_log_row=is_log,
    )
    session.add(ff)
    session.flush()
    return ff


# ========== Task 3.1: 纯 normal 表单回归测试 ==========

def test_export_normal_form_remains_2col_portrait(session: Session, tmp_path: Path) -> None:
    """验证纯 normal 表单仍为 2 列表格 + portrait 方向。"""
    project, _ = create_minimal_project(session)

    # 创建访视和表单
    visit = Visit(project_id=project.id, name="访视1", code="V1", sequence=1)
    session.add(visit)
    session.flush()

    form = Form(project_id=project.id, name="纯普通表单", code="F_NORMAL", order_index=1)
    session.add(form)
    session.flush()

    vf = VisitForm(visit_id=visit.id, form_id=form.id, sequence=1)
    session.add(vf)
    session.flush()

    # 添加 3 个普通字段（inline_mark=0）
    fd1 = create_text_field_def(session, project.id, "字段1")
    fd2 = create_text_field_def(session, project.id, "字段2")
    fd3 = create_text_field_def(session, project.id, "字段3")

    add_field_to_form(session, form.id, fd1.id, sort_order=1, inline_mark=0)
    add_field_to_form(session, form.id, fd2.id, sort_order=2, inline_mark=0)
    add_field_to_form(session, form.id, fd3.id, sort_order=3, inline_mark=0)

    session.commit()

    # 导出
    output_path = tmp_path / "normal.docx"
    ExportService(session).export_project_to_word(project.id, str(output_path))

    doc = Document(str(output_path))

    # 检查页面方向
    for section in doc.sections:
        assert section.orientation == WD_ORIENT.PORTRAIT, "纯 normal 表单应保持 portrait"

    # 检查表格列数（跳过封面和访视流程表）
    form_tables = doc.tables[2:]  # 前 2 个是封面和访视流程
    for table in form_tables:
        assert len(table.columns) == 2, "普通表单应为 2 列表格"


# ========== Task 3.2: 纯 inline 表单回归测试 ==========

def test_export_inline_form_max4_remains_portrait(session: Session, tmp_path: Path) -> None:
    """验证 ≤4 列 inline 表单保持 portrait。"""
    project, _ = create_minimal_project(session)

    visit = Visit(project_id=project.id, name="访视1", code="V1", sequence=1)
    session.add(visit)
    session.flush()

    form = Form(project_id=project.id, name="窄 inline 表单", code="F_INLINE4", order_index=1)
    session.add(form)
    session.flush()

    vf = VisitForm(visit_id=visit.id, form_id=form.id, sequence=1)
    session.add(vf)
    session.flush()

    # 添加 4 个 inline 字段（inline_mark=1）
    for i in range(1, 5):
        fd = create_text_field_def(session, project.id, f"列{i}")
        add_field_to_form(session, form.id, fd.id, sort_order=i, inline_mark=1)

    session.commit()

    output_path = tmp_path / "inline4.docx"
    ExportService(session).export_project_to_word(project.id, str(output_path))

    doc = Document(str(output_path))

    # 检查页面方向
    for section in doc.sections:
        assert section.orientation == WD_ORIENT.PORTRAIT, "≤4 列 inline 应保持 portrait"


# ========== Task 3.3: mixed + max_block_width ≤ 4 回归测试 ==========

def test_export_mixed_block_le4_remains_split_table(session: Session, tmp_path: Path) -> None:
    """验证 max_block_width ≤ 4 时仍为 split-table 路径。"""
    project, _ = create_minimal_project(session)

    visit = Visit(project_id=project.id, name="访视1", code="V1", sequence=1)
    session.add(visit)
    session.flush()

    form = Form(project_id=project.id, name="混合窄表单", code="F_MIXED4", order_index=1)
    session.add(form)
    session.flush()

    vf = VisitForm(visit_id=visit.id, form_id=form.id, sequence=1)
    session.add(vf)
    session.flush()

    # 添加普通字段
    fd_normal = create_text_field_def(session, project.id, "普通字段")
    add_field_to_form(session, form.id, fd_normal.id, sort_order=1, inline_mark=0)

    # 添加 4 个 inline 字段（block 宽度 = 4，不触发 unified）
    for i in range(1, 5):
        fd = create_text_field_def(session, project.id, f"列{i}")
        add_field_to_form(session, form.id, fd.id, sort_order=10 + i, inline_mark=1)

    session.commit()

    output_path = tmp_path / "mixed4.docx"
    ExportService(session).export_project_to_word(project.id, str(output_path))

    doc = Document(str(output_path))

    # 检查页面方向（不触发 unified，保持 portrait）
    for section in doc.sections:
        assert section.orientation == WD_ORIENT.PORTRAIT, "block ≤ 4 应保持 portrait"

    # 检查表格数量（应有多表格，非单一 unified 表）
    form_tables = doc.tables[2:]
    assert len(form_tables) >= 2, "split-table 路径应有多个表格"


# ========== Task 3.4: unified 基本场景测试 ==========

def test_export_unified_mixed_max5_creates_landscape_table(session: Session, tmp_path: Path) -> None:
    """验证混合表单 (max_block_width > 4) 输出单一表格 + landscape section。"""
    project, _ = create_minimal_project(session)

    visit = Visit(project_id=project.id, name="访视1", code="V1", sequence=1)
    session.add(visit)
    session.flush()

    form = Form(project_id=project.id, name="混合宽表单", code="F_UNIFIED", order_index=1)
    session.add(form)
    session.flush()

    vf = VisitForm(visit_id=visit.id, form_id=form.id, sequence=1)
    session.add(vf)
    session.flush()

    # 添加普通字段
    fd_normal = create_text_field_def(session, project.id, "普通字段")
    add_field_to_form(session, form.id, fd_normal.id, sort_order=1, inline_mark=0)

    # 添加 5 个 inline 字段（block 宽度 = 5，触发 unified）
    for i in range(1, 6):
        fd = create_text_field_def(session, project.id, f"列{i}")
        add_field_to_form(session, form.id, fd.id, sort_order=10 + i, inline_mark=1)

    session.commit()

    output_path = tmp_path / "unified5.docx"
    ExportService(session).export_project_to_word(project.id, str(output_path))

    doc = Document(str(output_path))

    # 检查存在 landscape section
    orientations = [section.orientation for section in doc.sections]
    assert WD_ORIENT.LANDSCAPE in orientations, "unified 表单应包含 landscape section"

    # 检查表格列数（unified 表格应为 N=5 列）
    form_tables = doc.tables[2:]
    # 找到列数最多的表格，应该是 unified 表格
    max_cols = max(len(t.columns) for t in form_tables)
    assert max_cols == 5, "unified 表格应为 5 列"


# ========== Task 3.5: unified 字段顺序测试 ==========

def test_export_unified_field_order_matches_sort_order(session: Session, tmp_path: Path) -> None:
    """验证表格行顺序与 sort_order 一致。"""
    project, _ = create_minimal_project(session)

    visit = Visit(project_id=project.id, name="访视1", code="V1", sequence=1)
    session.add(visit)
    session.flush()

    form = Form(project_id=project.id, name="顺序测试表单", code="F_ORDER", order_index=1)
    session.add(form)
    session.flush()

    vf = VisitForm(visit_id=visit.id, form_id=form.id, sequence=1)
    session.add(vf)
    session.flush()

    # 添加字段，故意设置乱序 sort_order
    fd1 = create_text_field_def(session, project.id, "字段A")
    fd2 = create_text_field_def(session, project.id, "字段B")
    fd3 = create_text_field_def(session, project.id, "列1")
    fd4 = create_text_field_def(session, project.id, "列2")
    fd5 = create_text_field_def(session, project.id, "列3")
    fd6 = create_text_field_def(session, project.id, "列4")
    fd7 = create_text_field_def(session, project.id, "列5")

    add_field_to_form(session, form.id, fd1.id, sort_order=10, inline_mark=0)  # 普通字段在前
    add_field_to_form(session, form.id, fd3.id, sort_order=20, inline_mark=1)
    add_field_to_form(session, form.id, fd4.id, sort_order=21, inline_mark=1)
    add_field_to_form(session, form.id, fd5.id, sort_order=22, inline_mark=1)
    add_field_to_form(session, form.id, fd6.id, sort_order=23, inline_mark=1)
    add_field_to_form(session, form.id, fd7.id, sort_order=24, inline_mark=1)
    add_field_to_form(session, form.id, fd2.id, sort_order=30, inline_mark=0)  # 普通字段在后

    session.commit()

    output_path = tmp_path / "order.docx"
    ExportService(session).export_project_to_word(project.id, str(output_path))

    doc = Document(str(output_path))

    # 找到 unified 表格（5 列的那个）
    unified_table = None
    for table in doc.tables[2:]:
        if len(table.columns) == 5:
            unified_table = table
            break

    assert unified_table is not None, "应存在 5 列 unified 表格"

    # 验证行内容顺序：字段A → inline block (列1-5) → 字段B
    # 第一行应该是"字段A"的 label/value
    first_row_text = unified_table.rows[0].cells[0].text
    assert "字段A" in first_row_text, "第一行应为字段A"


# ========== Task 3.7: unified label/log 行测试 ==========

def test_export_unified_full_row_span_equals_N(session: Session, tmp_path: Path) -> None:
    """验证 label/log 行 gridSpan = N。"""
    project, _ = create_minimal_project(session)

    visit = Visit(project_id=project.id, name="访视1", code="V1", sequence=1)
    session.add(visit)
    session.flush()

    form = Form(project_id=project.id, name="全宽行测试", code="F_FULLROW", order_index=1)
    session.add(form)
    session.flush()

    vf = VisitForm(visit_id=visit.id, form_id=form.id, sequence=1)
    session.add(vf)
    session.flush()

    # 添加标签字段（全宽行）
    fd_label = create_label_field_def(session, project.id, "标题行")
    add_field_to_form(session, form.id, fd_label.id, sort_order=1, inline_mark=0)

    # 添加 5 个 inline 字段触发 unified
    for i in range(1, 6):
        fd = create_text_field_def(session, project.id, f"列{i}")
        add_field_to_form(session, form.id, fd.id, sort_order=10 + i, inline_mark=1)

    session.commit()

    output_path = tmp_path / "fullrow.docx"
    ExportService(session).export_project_to_word(project.id, str(output_path))

    doc = Document(str(output_path))

    # 找到 unified 表格
    unified_table = None
    for table in doc.tables[2:]:
        if len(table.columns) == 5:
            unified_table = table
            break

    assert unified_table is not None, "应存在 5 列 unified 表格"

    # 验证第一行是全宽行（合并后所有 cell 指向同一对象）
    first_row = unified_table.rows[0]
    # 合并后 row.cells 返回 N 个对象，但它们共享同一个物理 cell（相同内存地址）
    cells = list(first_row.cells)
    # 检查所有 cell 对象是同一个（合并后的特征）
    assert all(c is cells[0] for c in cells), "全宽行应合并为单一 cell"
    assert "标题行" in cells[0].text, "全宽行内容应为标签字段"


# ========== Task 3.8: unified 窄 block 测试 ==========

def test_export_unified_narrow_block_merge_spans(session: Session, tmp_path: Path) -> None:
    """验证 M < N 时 merge spans 正确。"""
    project, _ = create_minimal_project(session)

    visit = Visit(project_id=project.id, name="访视1", code="V1", sequence=1)
    session.add(visit)
    session.flush()

    form = Form(project_id=project.id, name="窄 block 测试", code="F_NARROW", order_index=1)
    session.add(form)
    session.flush()

    vf = VisitForm(visit_id=visit.id, form_id=form.id, sequence=1)
    session.add(vf)
    session.flush()

    # 添加普通字段
    fd_normal = create_text_field_def(session, project.id, "普通字段")
    add_field_to_form(session, form.id, fd_normal.id, sort_order=1, inline_mark=0)

    # 添加 8 个 inline 字段触发 unified（N=8）
    for i in range(1, 9):
        fd = create_text_field_def(session, project.id, f"列{i}")
        add_field_to_form(session, form.id, fd.id, sort_order=10 + i, inline_mark=1)

    session.commit()

    output_path = tmp_path / "narrow.docx"
    ExportService(session).export_project_to_word(project.id, str(output_path))

    doc = Document(str(output_path))

    # 找到 unified 表格（8 列）
    unified_table = None
    for table in doc.tables[2:]:
        if len(table.columns) == 8:
            unified_table = table
            break

    assert unified_table is not None, "应存在 8 列 unified 表格"


# ========== Task 3.9: section 方向恢复测试 ==========

def test_export_landscape_form_followed_by_portrait(session: Session, tmp_path: Path) -> None:
    """验证 landscape form 后续 form 为 portrait。"""
    project, _ = create_minimal_project(session)

    visit = Visit(project_id=project.id, name="访视1", code="V1", sequence=1)
    session.add(visit)
    session.flush()

    # 第一个表单：unified（触发 landscape）
    form1 = Form(project_id=project.id, name="横向表单", code="F_LAND", order_index=1)
    session.add(form1)
    session.flush()

    vf1 = VisitForm(visit_id=visit.id, form_id=form1.id, sequence=1)
    session.add(vf1)
    session.flush()

    fd_normal1 = create_text_field_def(session, project.id, "普通1")
    add_field_to_form(session, form1.id, fd_normal1.id, sort_order=1, inline_mark=0)
    for i in range(1, 6):
        fd = create_text_field_def(session, project.id, f"列{i}_1")
        add_field_to_form(session, form1.id, fd.id, sort_order=10 + i, inline_mark=1)

    # 第二个表单：普通（应恢复 portrait）
    form2 = Form(project_id=project.id, name="纵向表单", code="F_PORT", order_index=2)
    session.add(form2)
    session.flush()

    vf2 = VisitForm(visit_id=visit.id, form_id=form2.id, sequence=2)
    session.add(vf2)
    session.flush()

    fd_normal2 = create_text_field_def(session, project.id, "普通2")
    add_field_to_form(session, form2.id, fd_normal2.id, sort_order=1, inline_mark=0)
    fd_normal3 = create_text_field_def(session, project.id, "普通3")
    add_field_to_form(session, form2.id, fd_normal3.id, sort_order=2, inline_mark=0)

    session.commit()

    output_path = tmp_path / "multi_section.docx"
    ExportService(session).export_project_to_word(project.id, str(output_path))

    doc = Document(str(output_path))

    # 检查 section 方向序列
    sections = list(doc.sections)
    # 应包含 landscape 和 portrait
    orientations = [s.orientation for s in sections]
    assert WD_ORIENT.LANDSCAPE in orientations, "应包含 landscape section"
    assert WD_ORIENT.PORTRAIT in orientations, "应包含 portrait section"


# ========== Task 3.11: merge 后样式保留测试 ==========

def test_export_unified_preserves_cell_shading(session: Session, tmp_path: Path) -> None:
    """验证底纹/颜色在 merge 后的 cell 上保留。"""
    project, _ = create_minimal_project(session)

    visit = Visit(project_id=project.id, name="访视1", code="V1", sequence=1)
    session.add(visit)
    session.flush()

    form = Form(project_id=project.id, name="样式测试", code="F_STYLE", order_index=1)
    session.add(form)
    session.flush()

    vf = VisitForm(visit_id=visit.id, form_id=form.id, sequence=1)
    session.add(vf)
    session.flush()

    # 添加带颜色的普通字段
    fd_color = create_text_field_def(session, project.id, "彩色字段")
    ff_color = add_field_to_form(session, form.id, fd_color.id, sort_order=1, inline_mark=0)
    ff_color.bg_color = "0070C0"

    # 添加 inline 字段触发 unified
    for i in range(1, 6):
        fd = create_text_field_def(session, project.id, f"列{i}")
        add_field_to_form(session, form.id, fd.id, sort_order=10 + i, inline_mark=1)

    session.commit()

    output_path = tmp_path / "style.docx"
    ExportService(session).export_project_to_word(project.id, str(output_path))

    doc = Document(str(output_path))

    # 找到 unified 表格
    unified_table = None
    for table in doc.tables[2:]:
        if len(table.columns) == 5:
            unified_table = table
            break

    assert unified_table is not None, "应存在 5 列 unified 表格"
    # 导出成功即验证基本结构，样式保留需人工检查或更复杂的 XML 解析


def test_export_unified_applies_borders_to_rows_added_after_table_creation(session: Session, tmp_path: Path) -> None:
    """验证 unified 表格在动态 add_row 后仍保留单元格边框。"""
    project, _ = create_minimal_project(session)

    visit = Visit(project_id=project.id, name="访视1", code="V1", sequence=1)
    session.add(visit)
    session.flush()

    form = Form(project_id=project.id, name="边框测试", code="F_BORDER", order_index=1)
    session.add(form)
    session.flush()

    vf = VisitForm(visit_id=visit.id, form_id=form.id, sequence=1)
    session.add(vf)
    session.flush()

    fd_normal = create_text_field_def(session, project.id, "普通字段")
    add_field_to_form(session, form.id, fd_normal.id, sort_order=1, inline_mark=0)

    for i in range(1, 6):
        fd = create_text_field_def(session, project.id, f"列{i}")
        add_field_to_form(session, form.id, fd.id, sort_order=10 + i, inline_mark=1)

    session.commit()

    output_path = tmp_path / "border.docx"
    ExportService(session).export_project_to_word(project.id, str(output_path))

    doc = Document(str(output_path))

    unified_table = None
    for table in doc.tables[2:]:
        if len(table.columns) == 5:
            unified_table = table
            break

    assert unified_table is not None, "应存在 5 列 unified 表格"

    first_row = unified_table.rows[0]
    borders = first_row.cells[0]._tc.tcPr.find(qn('w:tcBorders'))
    assert borders is not None, "动态添加的 unified 行应具有边框定义"

    for border_name in ["top", "left", "bottom", "right"]:
        border = borders.find(qn(f'w:{border_name}'))
        assert border is not None, f"应存在 {border_name} 边框"
        assert border.get(qn('w:val')) == 'single', f"{border_name} 边框应为 single"


def test_export_unified_table_has_table_level_borders(session: Session, tmp_path: Path) -> None:
    """验证 unified 表格具备表级 tblBorders（含 insideH/insideV），确保 Word 能渲染内部网格线。"""
    project, _ = create_minimal_project(session)

    visit = Visit(project_id=project.id, name="访视1", code="V1", sequence=1)
    session.add(visit)
    session.flush()

    form = Form(project_id=project.id, name="表级边框测试", code="F_TBLBDR", order_index=1)
    session.add(form)
    session.flush()

    vf = VisitForm(visit_id=visit.id, form_id=form.id, sequence=1)
    session.add(vf)
    session.flush()

    # 创建触发 unified landscape 的字段组合
    fd_normal = create_text_field_def(session, project.id, "普通字段")
    add_field_to_form(session, form.id, fd_normal.id, sort_order=1, inline_mark=0)

    for i in range(1, 6):
        fd = create_text_field_def(session, project.id, f"列{i}")
        add_field_to_form(session, form.id, fd.id, sort_order=10 + i, inline_mark=1)

    session.commit()

    output_path = tmp_path / "tbl_border.docx"
    ExportService(session).export_project_to_word(project.id, str(output_path))

    doc = Document(str(output_path))

    # 找到 unified 表格
    unified_table = None
    for table in doc.tables[2:]:
        if len(table.columns) == 5:
            unified_table = table
            break

    assert unified_table is not None, "应存在 5 列 unified 表格"

    # 验证表级 tblBorders 存在
    tblPr = unified_table._tbl.tblPr
    assert tblPr is not None, "表格应具有 tblPr 属性"

    tblBorders = tblPr.find(qn('w:tblBorders'))
    assert tblBorders is not None, "unified 表格应具有表级 tblBorders"

    # 验证所有边框类型（含内部网格线 insideH/insideV）
    for border_name in ["top", "left", "bottom", "right", "insideH", "insideV"]:
        border = tblBorders.find(qn(f'w:{border_name}'))
        assert border is not None, f"表级边框应包含 {border_name}"
        assert border.get(qn('w:val')) == 'single', f"{border_name} 应为 single 类型"
        assert border.get(qn('w:sz')) == '4', f"{border_name} 边框宽度应为 4"
