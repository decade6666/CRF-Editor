from __future__ import annotations

import sqlite3
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
from src.models.codelist import CodeList, CodeListOption
from src.repositories.form_field_repository import FormFieldRepository
from src.services.docx_import_service import DocxImportService
from src.services.export_service import ExportService
from src.services.field_rendering import build_inline_table_model, extract_default_lines
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
    codelist_id: int | None = None,
) -> FieldDefinition:
    field_definition = FieldDefinition(
        project_id=project_id,
        variable_name=variable_name,
        label=label,
        field_type=field_type,
        unit_id=unit_id,
        codelist_id=codelist_id,
    )
    session.add(field_definition)
    session.flush()
    return field_definition


def create_codelist(
    session: Session,
    project_id: int,
    *,
    name: str = "性别",
    code: str = "CL_SEX",
    option_metadata: list[tuple[str | None, str, int]] | None = None,
) -> CodeList:
    codelist = CodeList(project_id=project_id, name=name, code=code)
    session.add(codelist)
    session.flush()

    for index, (option_code, decode, trailing_underscore) in enumerate(option_metadata or [], start=1):
        session.add(CodeListOption(
            codelist_id=codelist.id,
            code=option_code,
            decode=decode,
            trailing_underscore=trailing_underscore,
            order_index=index,
        ))
    session.flush()
    return codelist


def create_form_field(
    session: Session,
    form_id: int,
    field_definition_id: int,
    *,
    order_index: int = 1,
    inline_mark: int = 0,
    default_value: str | None = None,
    label_override: str | None = None,
) -> FormField:
    form_field = FormField(
        form_id=form_id,
        field_definition_id=field_definition_id,
        order_index=order_index,
        inline_mark=inline_mark,
        default_value=default_value,
        label_override=label_override,
    )
    session.add(form_field)
    session.flush()
    return form_field


def build_docx_field_info(
    *,
    label: str = "模板字段",
    field_type: str = "多选（纵向）",
    options: list[str] | None = None,
) -> dict:
    return {
        "label": label,
        "field_type": field_type,
        "options": options or ["男_", "女"],
        "inline_mark": True,
    }


def build_template_db(
    tmp_path: Path,
    *,
    with_unit: bool,
    with_trailing_underscore: bool = False,
    codelist_name: str = "性别",
    option_metadata: list[tuple[str | None, str, int]] | None = None,
) -> tuple[Path, int]:
    db_path = tmp_path / ("template_with_unit.db" if with_unit else "template_without_unit.db")
    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    with session_factory() as template_session:
        project = create_project(template_session, name="模板项目")
        form = create_form(template_session, project.id, name="模板表单")
        unit_id = None
        codelist_id = None

        if with_unit:
            unit = Unit(project_id=project.id, symbol="支", code="ZHI")
            template_session.add(unit)
            template_session.flush()
            unit_id = unit.id

        if with_trailing_underscore:
            codelist = create_codelist(
                template_session,
                project.id,
                name=codelist_name,
                code="CL_SEX",
                option_metadata=option_metadata or [
                    ("1", "男", 1),
                    ("2", "女", 0),
                ],
            )
            codelist_id = codelist.id

        field_definition = create_field_definition(
            template_session,
            project.id,
            variable_name="TEMP_FIELD",
            label="模板字段",
            field_type="单选" if with_trailing_underscore else "文本",
            unit_id=unit_id,
            codelist_id=codelist_id,
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


def test_get_template_form_fields_returns_structured_option_metadata(
    tmp_path: Path,
    session: Session,
) -> None:
    template_path, form_id = build_template_db(
        tmp_path,
        with_unit=False,
        with_trailing_underscore=True,
    )
    service = ImportService(session)

    fields = service.get_template_form_fields(str(template_path), form_id)

    assert len(fields) == 1
    options = fields[0]["options"]
    assert [
        {key: option[key] for key in ("code", "decode", "trailing_underscore")}
        for option in options
    ] == [
        {"code": "1", "decode": "男", "trailing_underscore": 1},
        {"code": "2", "decode": "女", "trailing_underscore": 0},
    ]


def test_update_inline_mark_preserves_default_value_when_disabling(session: Session) -> None:
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
    assert refreshed.default_value == "some text"
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


def test_import_forms_preserves_trailing_underscore_metadata(tmp_path: Path, session: Session) -> None:
    template_path, form_id = build_template_db(
        tmp_path,
        with_unit=False,
        with_trailing_underscore=True,
    )
    target_project = create_project(session, name="目标项目")
    service = ImportService(session)

    summary = service.import_forms(
        target_project.id,
        str(template_path),
        source_project_id=1,
        form_ids=[form_id],
    )
    session.commit()

    assert summary["imported_form_count"] == 1

    imported_codelist = session.query(CodeList).filter(
        CodeList.project_id == target_project.id,
        CodeList.name == "性别",
    ).one()
    options = session.query(CodeListOption).filter(
        CodeListOption.codelist_id == imported_codelist.id,
    ).order_by(CodeListOption.order_index, CodeListOption.id).all()

    assert [option.decode for option in options] == ["男", "女"]
    assert [option.trailing_underscore for option in options] == [1, 0]



def test_imported_trailing_underscore_matches_export_semantics(tmp_path: Path, session: Session) -> None:
    template_path, form_id = build_template_db(
        tmp_path,
        with_unit=False,
        with_trailing_underscore=True,
    )
    target_project = create_project(session, name="导出目标项目")
    service = ImportService(session)

    service.import_forms(
        target_project.id,
        str(template_path),
        source_project_id=1,
        form_ids=[form_id],
    )
    session.commit()

    imported_field_definition = session.query(FieldDefinition).filter(
        FieldDefinition.project_id == target_project.id,
        FieldDefinition.label == "模板字段",
        FieldDefinition.field_type == "单选",
    ).one()
    exported_labels = ExportService(session)._get_option_labels(imported_field_definition)

    assert exported_labels == ["男______", "女"]



def test_import_forms_reuses_same_named_codelist_when_option_signature_matches(
    tmp_path: Path,
    session: Session,
) -> None:
    template_path, form_id = build_template_db(
        tmp_path,
        with_unit=False,
        with_trailing_underscore=True,
    )
    target_project = create_project(session, name="同名字典目标项目")
    existing_codelist = create_codelist(
        session,
        target_project.id,
        name="性别",
        code="CL_EXIST",
        option_metadata=[
            ("1", "男", 1),
            ("2", "女", 0),
        ],
    )

    service = ImportService(session)
    service.import_forms(
        target_project.id,
        str(template_path),
        source_project_id=1,
        form_ids=[form_id],
    )
    session.commit()

    codelists = session.query(CodeList).filter(
        CodeList.project_id == target_project.id,
    ).order_by(CodeList.id).all()
    assert [codelist.name for codelist in codelists] == ["性别"]

    reused_options = session.query(CodeListOption).filter(
        CodeListOption.codelist_id == existing_codelist.id,
    ).order_by(CodeListOption.order_index, CodeListOption.id).all()
    imported_field_definition = session.query(FieldDefinition).filter(
        FieldDefinition.project_id == target_project.id,
        FieldDefinition.label == "模板字段",
    ).one()

    assert imported_field_definition.codelist_id == existing_codelist.id
    assert [option.decode for option in reused_options] == ["男", "女"]
    assert [option.trailing_underscore for option in reused_options] == [1, 0]
    assert ExportService(session)._get_option_labels(imported_field_definition) == ["男______", "女"]


@pytest.mark.parametrize(
    ("template_options", "existing_options"),
    [
        (
            [("1", "男", 1), ("2", "女", 0)],
            [("1", "男", 0), ("2", "女", 0)],
        ),
        (
            [("1", "男", 1), ("2", "女", 0)],
            [("X", "男", 1), ("2", "女", 0)],
        ),
        (
            [("1", "男", 1), ("2", "女", 0)],
            [("2", "女", 0), ("1", "男", 1)],
        ),
    ],
    ids=["trailing-underscore-mismatch", "code-mismatch", "order-mismatch"],
)
def test_import_forms_creates_import_suffixed_codelist_when_same_name_signature_conflicts(
    tmp_path: Path,
    session: Session,
    template_options: list[tuple[str | None, str, int]],
    existing_options: list[tuple[str | None, str, int]],
) -> None:
    template_path, form_id = build_template_db(
        tmp_path,
        with_unit=False,
        with_trailing_underscore=True,
        option_metadata=template_options,
    )
    target_project = create_project(session, name="冲突字典目标项目")
    existing_codelist = create_codelist(
        session,
        target_project.id,
        name="性别",
        code="CL_EXIST",
        option_metadata=existing_options,
    )

    service = ImportService(session)
    service.import_forms(
        target_project.id,
        str(template_path),
        source_project_id=1,
        form_ids=[form_id],
    )
    session.commit()

    codelists = session.query(CodeList).filter(
        CodeList.project_id == target_project.id,
    ).order_by(CodeList.id).all()
    assert [codelist.name for codelist in codelists] == ["性别", "性别（导入）"]

    original_options = session.query(CodeListOption).filter(
        CodeListOption.codelist_id == existing_codelist.id,
    ).order_by(CodeListOption.order_index, CodeListOption.id).all()
    assert [(option.code, option.decode, option.trailing_underscore) for option in original_options] == existing_options

    imported_codelist = next(codelist for codelist in codelists if codelist.name == "性别（导入）")
    imported_options = session.query(CodeListOption).filter(
        CodeListOption.codelist_id == imported_codelist.id,
    ).order_by(CodeListOption.order_index, CodeListOption.id).all()
    imported_field_definition = session.query(FieldDefinition).filter(
        FieldDefinition.project_id == target_project.id,
        FieldDefinition.label == "模板字段",
    ).one()

    assert imported_field_definition.codelist_id == imported_codelist.id
    assert [(option.code, option.decode, option.trailing_underscore) for option in imported_options] == template_options


def test_docx_import_creates_codelist_for_vertical_multiselect(session: Session) -> None:
    service = DocxImportService(session)
    project = create_project(session, name="DOCX目标项目")
    field_info = build_docx_field_info(options=["恶心", "呕吐"])

    field_definition = service._create_field_definition(
        session,
        project.id,
        field_info,
        existing_units={},
        existing_codelists={},
        existing_vars=set(),
    )

    assert field_definition is not None
    assert field_definition.field_type == "多选（纵向）"
    assert field_definition.codelist_id is not None
    options = session.query(CodeListOption).filter(
        CodeListOption.codelist_id == field_definition.codelist_id,
    ).order_by(CodeListOption.order_index, CodeListOption.id).all()
    assert [option.decode for option in options] == ["恶心", "呕吐"]



def test_docx_import_preserves_literal_trailing_underscore_text(session: Session) -> None:
    service = DocxImportService(session)
    project = create_project(session, name="DOCX尾线项目")
    field_info = build_docx_field_info(options=["男_", "女"])

    field_definition = service._create_field_definition(
        session,
        project.id,
        field_info,
        existing_units={},
        existing_codelists={},
        existing_vars=set(),
    )

    assert field_definition is not None
    options = session.query(CodeListOption).filter(
        CodeListOption.codelist_id == field_definition.codelist_id,
    ).order_by(CodeListOption.order_index, CodeListOption.id).all()
    assert [(option.decode, option.trailing_underscore) for option in options] == [("男_", 0), ("女", 0)]



def test_export_service_renders_vertical_multiselect_one_option_per_line(session: Session) -> None:
    project = create_project(session, name="导出项目")
    codelist = create_codelist(
        session,
        project.id,
        name="不良反应",
        code="CL_AE",
        option_metadata=[
            ("1", "恶心", 0),
            ("2", "呕吐", 0),
        ],
    )
    field_definition = create_field_definition(
        session,
        project.id,
        variable_name="FIELD_AE",
        label="不良反应",
        field_type="多选（纵向）",
        codelist_id=codelist.id,
    )
    field_definition.codelist = codelist

    rendered = ExportService(session)._render_field_control(field_definition)

    assert rendered == "□ 恶心\n□ 呕吐"



def test_docx_imported_literal_trailing_underscore_matches_export_semantics(session: Session) -> None:
    service = DocxImportService(session)
    project = create_project(session, name="DOCX导出项目")
    field_info = build_docx_field_info(field_type="单选", options=["男_", "女"])

    field_definition = service._create_field_definition(
        session,
        project.id,
        field_info,
        existing_units={},
        existing_codelists={},
        existing_vars=set(),
    )
    assert field_definition is not None
    exported_labels = ExportService(session)._get_option_labels(field_definition)
    assert exported_labels == ["男_", "女"]



def test_extract_default_lines_preserves_blank_lines_spaces_and_crlf(session: Session) -> None:
    project = create_project(session, name="默认值项目")
    form = create_form(session, project.id)
    field_definition = create_field_definition(
        session,
        project.id,
        variable_name="FIELD_TEXT",
        label="文本字段",
        field_type="文本",
    )
    form_field = create_form_field(
        session,
        form.id,
        field_definition.id,
        inline_mark=1,
        default_value="A\r\n\r\n B ",
    )
    form_field.field_definition = field_definition

    assert extract_default_lines(form_field) == ["A", "", " B "]



def test_build_inline_table_model_preserves_row_alignment_and_label_override(session: Session) -> None:
    project = create_project(session, name="表格项目")
    form = create_form(session, project.id)
    field_definition_a = create_field_definition(
        session,
        project.id,
        variable_name="FIELD_A",
        label="字段A",
        field_type="文本",
    )
    field_definition_b = create_field_definition(
        session,
        project.id,
        variable_name="FIELD_B",
        label="字段B",
        field_type="文本",
    )
    field_a = create_form_field(
        session,
        form.id,
        field_definition_a.id,
        inline_mark=1,
        default_value="第一行\n第二行",
        label_override="覆盖标签A",
    )
    field_b = create_form_field(
        session,
        form.id,
        field_definition_b.id,
        inline_mark=1,
        default_value="仅一行",
    )
    field_a.field_definition = field_definition_a
    field_b.field_definition = field_definition_b

    headers, rows, field_defs = build_inline_table_model([field_a, field_b])

    assert headers == ["覆盖标签A", "字段B"]
    assert rows == [["第一行", "仅一行"], ["第二行", None]]
    assert field_defs == [field_definition_a, field_definition_b]



def test_export_service_does_not_duplicate_semantic_trailing_underscore(session: Session) -> None:
    project = create_project(session, name="下划线项目")
    codelist = create_codelist(
        session,
        project.id,
        name="性别",
        code="CL_SEX",
        option_metadata=[
            ("1", "男_", 1),
        ],
    )
    field_definition = create_field_definition(
        session,
        project.id,
        variable_name="FIELD_SEX",
        label="性别",
        field_type="单选",
        codelist_id=codelist.id,
    )
    field_definition.codelist = codelist

    assert ExportService(session)._get_option_labels(field_definition) == ["男_"]



def test_template_import_preview_contract_includes_default_inline_and_option_semantics(
    tmp_path: Path,
    session: Session,
) -> None:
    template_path, form_id = build_template_db(
        tmp_path,
        with_unit=False,
        with_trailing_underscore=True,
    )
    service = ImportService(session)

    fields = service.get_template_form_fields(str(template_path), form_id)

    assert len(fields) == 1
    field = fields[0]
    assert field["default_value"] == "模板默认值"
    assert field["inline_mark"] == 1  # integer flag (Task 3.1: raw inline_mark)
    assert field["unit_symbol"] is None
    assert [
        {key: option[key] for key in ("code", "decode", "trailing_underscore")}
        for option in field["options"]
    ] == [
        {"code": "1", "decode": "男", "trailing_underscore": 1},
        {"code": "2", "decode": "女", "trailing_underscore": 0},
    ]



def test_import_forms_increments_import_suffix_for_repeated_codelist_conflicts(
    tmp_path: Path,
    session: Session,
) -> None:
    template_path, form_id = build_template_db(
        tmp_path,
        with_unit=False,
        with_trailing_underscore=True,
    )
    target_project = create_project(session, name="重复冲突目标项目")
    create_codelist(
        session,
        target_project.id,
        name="性别",
        code="CL_EXIST",
        option_metadata=[
            ("1", "男", 0),
            ("2", "女", 0),
        ],
    )
    create_codelist(
        session,
        target_project.id,
        name="性别（导入）",
        code="CL_EXIST_IMP",
        option_metadata=[
            ("1", "男", 0),
            ("2", "女", 0),
        ],
    )

    service = ImportService(session)
    service.import_forms(
        target_project.id,
        str(template_path),
        source_project_id=1,
        form_ids=[form_id],
    )
    session.commit()

    codelists = session.query(CodeList).filter(
        CodeList.project_id == target_project.id,
    ).order_by(CodeList.id).all()
    imported_codelist = next(codelist for codelist in codelists if codelist.name == "性别（导入2）")
    imported_field_definition = session.query(FieldDefinition).filter(
        FieldDefinition.project_id == target_project.id,
        FieldDefinition.label == "模板字段",
    ).one()

    assert [codelist.name for codelist in codelists] == ["性别", "性别（导入）", "性别（导入2）"]
    assert imported_field_definition.codelist_id == imported_codelist.id


# =============================================================================
# Task 3.5: 模板预览与执行一致性测试
# =============================================================================


def build_template_db_with_structural_rows(
    tmp_path: Path,
) -> tuple[Path, int]:
    """构建包含普通字段、标签行和日志行的模板数据库"""
    db_path = tmp_path / "template_structural.db"
    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    with session_factory() as template_session:
        project = create_project(template_session, name="结构行模板项目")
        form = create_form(template_session, project.id, name="结构行表单")

        # 日志行（is_log_row=1）
        log_row = FormField(
            form_id=form.id,
            field_definition_id=None,
            order_index=1,
            label_override="=== 筛选日志 ===",
            is_log_row=1,
        )
        template_session.add(log_row)

        # 普通字段
        fd_a = create_field_definition(
            template_session,
            project.id,
            variable_name="FIELD_A",
            label="字段A",
            field_type="文本",
        )
        ff_a = FormField(
            form_id=form.id,
            field_definition_id=fd_a.id,
            order_index=2,
        )
        template_session.add(ff_a)

        # 标签行（field_type='标签'）
        fd_label = create_field_definition(
            template_session,
            project.id,
            variable_name="_LABEL_1",
            label="--- 访视信息 ---",
            field_type="标签",
        )
        ff_label = FormField(
            form_id=form.id,
            field_definition_id=fd_label.id,
            order_index=3,
        )
        template_session.add(ff_label)

        # 带样式的字段
        fd_b = create_field_definition(
            template_session,
            project.id,
            variable_name="FIELD_B",
            label="字段B",
            field_type="文本",
        )
        ff_b = FormField(
            form_id=form.id,
            field_definition_id=fd_b.id,
            order_index=4,
            bg_color="FFEEEE",
            text_color="CC0000",
        )
        template_session.add(ff_b)

        template_session.commit()
        return db_path, form.id


def test_template_preview_includes_structural_rows(tmp_path: Path, session: Session) -> None:
    """Task 3.5: 预览返回结构行（日志行、标签行），且可勾选"""
    template_path, form_id = build_template_db_with_structural_rows(tmp_path)
    service = ImportService(session)

    fields = service.get_template_form_fields(str(template_path), form_id)

    # 应有 4 项：日志行、字段A、标签行、字段B
    assert len(fields) == 4

    # 日志行检查
    log_row = next((f for f in fields if f.get("is_log_row")), None)
    assert log_row is not None
    assert log_row["field_type"] == "日志行"
    assert log_row["label"] == "=== 筛选日志 ==="
    assert log_row["field_definition"] is None

    # 标签行检查
    label_row = next((f for f in fields if f["field_type"] == "标签"), None)
    assert label_row is not None
    assert label_row["label"] == "--- 访视信息 ---"
    assert label_row["field_definition"] is not None

    # 所有字段都有 id，可勾选
    assert all(f["id"] is not None for f in fields)


def test_template_preview_field_ids_are_form_field_ids(tmp_path: Path, session: Session) -> None:
    """Task 3.5: field_ids 使用源 form_field.id"""
    template_path, form_id = build_template_db_with_structural_rows(tmp_path)
    service = ImportService(session)

    fields = service.get_template_form_fields(str(template_path), form_id)

    # 从模板数据库读取真实 form_field id
    engine = create_engine(f"sqlite+pysqlite:///{template_path.as_posix()}")
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    with session_factory() as template_session:
        form_fields = template_session.query(FormField).filter(
            FormField.form_id == form_id,
        ).order_by(FormField.order_index).all()
        expected_ids = [ff.id for ff in form_fields]

    # 预览返回的 id 应与 form_field.id 一致
    preview_ids = [f["id"] for f in fields]
    assert preview_ids == expected_ids


def test_template_import_preserves_order_after_partial_selection(
    tmp_path: Path,
    session: Session,
) -> None:
    """Task 3.5: 部分选中后导入顺序与预览一致"""
    template_path, form_id = build_template_db_with_structural_rows(tmp_path)
    service = ImportService(session)

    # 获取预览
    fields = service.get_template_form_fields(str(template_path), form_id)
    assert len(fields) == 4

    # 仅选中字段A和字段B（跳过日志行和标签行）
    selected_ids = [f["id"] for f in fields if f["field_type"] not in ("日志行", "标签")]
    assert len(selected_ids) == 2

    # 创建目标项目并导入
    target_project = create_project(session, name="部分导入目标项目")
    service.import_forms(
        target_project.id,
        str(template_path),
        source_project_id=1,
        form_ids=[form_id],
        field_ids=selected_ids,
    )
    session.commit()

    # 验证导入结果
    imported_form = session.query(Form).filter(
        Form.project_id == target_project.id,
    ).first()
    assert imported_form is not None

    imported_fields = session.query(FormField).filter(
        FormField.form_id == imported_form.id,
    ).order_by(FormField.order_index).all()

    # 仅导入 2 个字段，顺序保持
    assert len(imported_fields) == 2
    imported_labels = [
        ff.label_override or ff.field_definition.label
        for ff in imported_fields
        if ff.field_definition
    ]
    assert imported_labels == ["字段A", "字段B"]


def test_template_import_preserves_styling_attributes(
    tmp_path: Path,
    session: Session,
) -> None:
    """Task 3.5: 导入执行复制 bg_color、text_color 样式属性"""
    template_path, form_id = build_template_db_with_structural_rows(tmp_path)
    service = ImportService(session)

    # 获取预览中带样式的字段
    fields = service.get_template_form_fields(str(template_path), form_id)
    styled_field = next((f for f in fields if f.get("bg_color")), None)
    assert styled_field is not None
    assert styled_field["bg_color"] == "FFEEEE"
    assert styled_field["text_color"] == "CC0000"

    # 导入
    target_project = create_project(session, name="样式导入目标项目")
    service.import_forms(
        target_project.id,
        str(template_path),
        source_project_id=1,
        form_ids=[form_id],
    )
    session.commit()

    # 验证样式属性已复制
    imported_ff = session.query(FormField).join(FieldDefinition).filter(
        FormField.form_id == Form.id,
        Form.project_id == target_project.id,
        FieldDefinition.variable_name == "FIELD_B",
    ).first()
    assert imported_ff is not None
    assert imported_ff.bg_color == "FFEEEE"
    assert imported_ff.text_color == "CC0000"


def test_template_import_rejects_invalid_field_ids(
    tmp_path: Path,
    session: Session,
) -> None:
    """Task 3.5: 非法 field_ids 被拒绝"""
    template_path, form_id = build_template_db_with_structural_rows(tmp_path)
    service = ImportService(session)

    # 获取有效 field_ids
    fields = service.get_template_form_fields(str(template_path), form_id)
    valid_ids = [f["id"] for f in fields]

    # 使用无效 id（不存在于模板中）
    invalid_ids = [999999]

    target_project = create_project(session, name="非法ID目标项目")

    # 导入应抛出异常
    with pytest.raises(ValueError, match="field_ids"):
        service.import_forms(
            target_project.id,
            str(template_path),
            source_project_id=1,
            form_ids=[form_id],
            field_ids=invalid_ids,
        )


def test_template_compatibility_check_rejects_missing_columns(
    tmp_path: Path,
    session: Session,
) -> None:
    """Task 3.4: 不兼容模板返回稳定错误码"""
    # 创建缺少 order_index 列的模板库
    db_path = tmp_path / "legacy_template.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute("""
        CREATE TABLE project (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            version TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE form (
            id INTEGER PRIMARY KEY,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            code TEXT,
            domain TEXT
        )
    """)
    conn.execute("INSERT INTO project (id, name, version) VALUES (1, '旧模板', 'v1')")
    conn.execute("INSERT INTO form (id, project_id, name, code) VALUES (1, 1, '表单A', 'FORM_A')")
    conn.commit()
    conn.close()

    service = ImportService(session)

    # 应抛出兼容性错误
    with pytest.raises(ValueError, match="模板库不兼容"):
        service.get_template_projects(str(db_path))


def test_template_access_is_readonly(
    tmp_path: Path,
    session: Session,
) -> None:
    """Task 3.4: 模板访问严格只读，不修改源库"""
    template_path, form_id = build_template_db(tmp_path, with_unit=True)
    service = ImportService(session)

    # 获取原始文件大小
    original_size = template_path.stat().st_size

    # 多次访问模板
    for _ in range(3):
        fields = service.get_template_form_fields(str(template_path), form_id)
        assert len(fields) == 1

    # 文件大小应保持不变（无写入）
    assert template_path.stat().st_size == original_size


def test_import_forms_preserves_bg_color_text_color(
    tmp_path: Path,
    session: Session,
) -> None:
    """Task 3.6: 导入执行复制 bg_color/text_color"""
    template_path, form_id = build_template_db_with_structural_rows(tmp_path)
    service = ImportService(session)

    # 获取带样式字段
    fields = service.get_template_form_fields(str(template_path), form_id)
    styled_field = next((f for f in fields if f.get("bg_color")), None)
    assert styled_field is not None, "模板应包含样式字段"

    target_project = create_project(session, name="样式导入目标项目")
    service.import_forms(
        target_project.id,
        str(template_path),
        source_project_id=1,
        form_ids=[form_id],
    )
    session.commit()

    # 验证样式被复制
    imported_form = session.query(Form).filter(
        Form.project_id == target_project.id,
        Form.name == "结构行表单",
    ).one()

    imported_ff = session.query(FormField).filter(
        FormField.form_id == imported_form.id,
        FormField.bg_color == "FFEEEE",
    ).first()
    assert imported_ff is not None
    assert imported_ff.text_color == "CC0000"


# =============================================================================
# Task 3.5/3.7: 模板迁移脚本测试
# =============================================================================


def test_migration_script_outputs_new_file(tmp_path: Path) -> None:
    """Task 3.7: 迁移脚本输出新文件，原文件保持不变"""
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from scripts.migrate_template_db import migrate_template

    # 创建一个旧版模板库（缺少 order_index 等列）
    old_db_path = tmp_path / "old_template.db"
    conn = sqlite3.connect(str(old_db_path))

    # 创建表但不添加必需列
    conn.execute("""
        CREATE TABLE form (
            id INTEGER PRIMARY KEY,
            project_id INTEGER,
            name TEXT,
            version TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE form_field (
            id INTEGER PRIMARY KEY,
            form_id INTEGER,
            field_definition_id INTEGER,
            label_override TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE field_definition (
            id INTEGER PRIMARY KEY,
            project_id INTEGER,
            variable_name TEXT,
            label TEXT,
            field_type TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE codelist_option (
            id INTEGER PRIMARY KEY,
            codelist_id INTEGER,
            code TEXT,
            decode TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE unit (
            id INTEGER PRIMARY KEY,
            project_id INTEGER,
            name TEXT,
            symbol TEXT
        )
    """)
    conn.commit()
    conn.close()

    # 运行迁移脚本
    output_path = tmp_path / "migrated_template.db"
    report = migrate_template(old_db_path, output_path)

    # 验证迁移成功
    assert report.get("success") is True
    assert report.get("error") is None

    # 验证原文件未改变
    old_conn = sqlite3.connect(str(old_db_path))
    old_cols = old_conn.execute("PRAGMA table_info(form_field)").fetchall()
    old_conn.close()
    old_col_names = {row[1] for row in old_cols}
    assert "order_index" not in old_col_names  # 原文件仍缺少列

    # 验证新文件有必需列
    new_conn = sqlite3.connect(str(output_path))
    new_cols = new_conn.execute("PRAGMA table_info(form_field)").fetchall()
    new_conn.close()
    new_col_names = {row[1] for row in new_cols}
    assert "order_index" in new_col_names
    assert "is_log_row" in new_col_names
    assert "inline_mark" in new_col_names
