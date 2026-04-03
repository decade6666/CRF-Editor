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
    assert field["inline_mark"] is True
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
