from __future__ import annotations

from typing import Iterator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from src.models import Base
from src.models.codelist import CodeListOption
from src.models.project import Project
from src.routers.import_docx import _build_preview_forms
from src.services import docx_import_service as M
from src.services.docx_import_service import DocxImportService


@pytest.fixture
def session() -> Iterator[Session]:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    with session_factory() as db_session:
        yield db_session

    engine.dispose()


def _create_project(session: Session, name: str = "规则测试项目") -> Project:
    project = Project(name=name, version="v1.0")
    session.add(project)
    session.flush()
    return project


def test_detect_field_type_underscores_to_text() -> None:
    field_type, config = M._detect_field_type("______________")

    assert field_type == "文本"
    assert config == {}


def test_choice_layout_no_line_break_is_horizontal() -> None:
    assert M._choice_layout(False) == ("单选", "多选")


def test_choice_layout_with_line_break_is_vertical() -> None:
    assert M._choice_layout(True) == ("单选（纵向）", "多选（纵向）")


def test_choice_layout_returns_both_types() -> None:
    single, multi = M._choice_layout(False)
    assert single == "单选"
    assert multi == "多选"


def test_infer_trailing_underscore_describe() -> None:
    assert M._infer_trailing_underscore("其他，请描述") == 1


def test_infer_trailing_underscore_no_marker() -> None:
    assert M._infer_trailing_underscore("男") == 0


def test_infer_trailing_underscore_explicit_underscore() -> None:
    assert M._infer_trailing_underscore("其他民族______") == 1


def test_create_field_definition_accepts_dict_options(session: Session) -> None:
    service = DocxImportService(session)
    project = _create_project(session, name="字典选项项目")
    field_info = {
        "label": "民族",
        "field_type": "单选",
        "options": [
            {"decode": "汉族", "trailing_underscore": 0},
            {"decode": "其他民族", "trailing_underscore": 1},
        ],
    }

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
    assert [(option.decode, option.trailing_underscore) for option in options] == [
        ("汉族", 0),
        ("其他民族", 1),
    ]


def test_create_field_definition_accepts_str_options(session: Session) -> None:
    service = DocxImportService(session)
    project = _create_project(session, name="字符串选项项目")
    field_info = {
        "label": "性别",
        "field_type": "单选",
        "options": ["男_", "女"],
    }

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
    assert [(option.decode, option.trailing_underscore) for option in options] == [
        ("男_", 0),
        ("女", 0),
    ]


def test_build_preview_forms_accepts_dict_options() -> None:
    preview_forms = _build_preview_forms(
        [
            {
                "name": "人口学资料",
                "fields": [
                    {
                        "label": "民族",
                        "field_type": "单选",
                        "options": [
                            {"decode": "汉族", "trailing_underscore": 0},
                            {"decode": "其他民族", "trailing_underscore": 1},
                        ],
                    }
                ],
            }
        ]
    )

    assert preview_forms[0].fields is not None
    assert preview_forms[0].fields[0].options == [
        {"decode": "汉族", "trailing_underscore": 0},
        {"decode": "其他民族", "trailing_underscore": 1},
    ]


def test_normalize_binary_choice_order_for_yes_no_label() -> None:
    options = [
        {"decode": "否", "trailing_underscore": 0},
        {"decode": "是", "trailing_underscore": 0},
    ]

    assert M._normalize_binary_choice_order("是否回收药物", options) == [
        {"decode": "是", "trailing_underscore": 0},
        {"decode": "否", "trailing_underscore": 0},
    ]


def test_date_not_overtrigger_as_datetime() -> None:
    text = "|__|__|__|__|年|__|__|月|__|__|日\n|__|__|:|__|__|"

    field_type, config = M._detect_field_type(text)

    assert field_type == "日期"
    assert config == {"date_format": "YYYY-MM-DD"}


def test_date_time_preserves_hh_mm() -> None:
    text = "|__|__|__|__|年|__|__|月|__|__|日 |__|__|:|__|__|"

    field_type, config = M._detect_field_type(text)

    assert field_type == "日期时间"
    assert config == {"date_format": "yyyy-MM-dd HH:mm"}


def test_date_time_preserves_hh_mm_ss() -> None:
    text = "|__|__|__|__|年|__|__|月|__|__|日 |__|__|:|__|__|:|__|__|"

    field_type, config = M._detect_field_type(text)

    assert field_type == "日期时间"
    assert config == {"date_format": "yyyy-MM-dd HH:mm:ss"}


def test_build_choice_options_strips_trailing_underscore_from_decode() -> None:
    options = M._build_choice_options("○汉族  ○其他民族______", "○")

    assert options == [
        {"decode": "汉族", "trailing_underscore": 0},
        {"decode": "其他民族", "trailing_underscore": 1},
    ]


def test_collect_select_options_returns_marker_tuple() -> None:
    tuples = [
        M._build_choice_options("○正常 ○异常", "○"),
        M._build_choice_options("□选项1 □选项2", "□"),
    ]
    assert len(tuples[0]) == 2
    assert len(tuples[1]) == 2
    assert all(isinstance(o["trailing_underscore"], int) for o in tuples[0])
    assert all(isinstance(o["trailing_underscore"], int) for o in tuples[1])


def test_detect_field_type_no_line_break_is_horizontal() -> None:
    text = "○高中及高中以下  ○本科  ○硕士  ○博士"

    field_type, config = M._detect_field_type(text)

    assert field_type == "单选"
    assert len(config.get("options", [])) == 4


def test_detect_field_type_multiline_is_vertical_single() -> None:
    text = "○正常\n○异常无临床意义\n○异常有临床意义"

    field_type, config = M._detect_field_type(text)

    assert field_type == "单选（纵向）"
    assert len(config.get("options", [])) == 3


def test_detect_field_type_multiline_is_vertical_multi() -> None:
    text = "□未采取措施\n□药物治疗\n□非药物治疗\n□其他，请描述"

    field_type, config = M._detect_field_type(text)

    assert field_type == "多选（纵向）"
    assert len(config.get("options", [])) == 4
