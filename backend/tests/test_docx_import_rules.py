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


@pytest.mark.parametrize(
    ("text", "expected_decode", "expected_description"),
    [
        ("其他，请描述", "其他，请描述", False),
        ("其他民族______", "其他民族", True),
        ("其他民族＿＿＿＿", "其他民族", True),
        ("男_", "男", True),
        ("______", "", False),
    ],
)
def test_split_option_trailing_underscore_only_follows_literal_tail(
    text: str,
    expected_decode: str,
    expected_description: bool,
) -> None:
    assert M._split_option_trailing_underscore(text) == (
        expected_decode,
        expected_description,
    )



def test_create_field_definition_accepts_dict_options(session: Session) -> None:
    service = DocxImportService(session)
    project = _create_project(session, name="字典选项项目")
    field_info = {
        "label": "民族",
        "field_type": "单选",
        "options": [
            {"decode": "汉族"},
            {"decode": "其他民族"},
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
    assert [option.decode for option in options] == ["汉族", "其他民族"]



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
    assert [option.decode for option in options] == ["男_", "女"]



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
                            {"decode": "汉族"},
                            {"decode": "其他民族"},
                        ],
                    }
                ],
            }
        ]
    )

    assert preview_forms[0].fields is not None
    assert preview_forms[0].fields[0].options == [
        {"decode": "汉族"},
        {"decode": "其他民族"},
    ]



def test_normalize_binary_choice_order_for_yes_no_label() -> None:
    options = [
        {"decode": "否"},
        {"decode": "是"},
    ]

    assert M._normalize_binary_choice_order("是否回收药物", options) == [
        {"decode": "是"},
        {"decode": "否"},
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



def test_build_choice_options_marks_description_fields() -> None:
    options = M._build_choice_options("○汉族  ○其他民族______", "○")

    assert options == [
        {"decode": "汉族", "_src_order": 1},
        {"decode": "其他民族", "_src_order": 2, "needs_description": True},
    ]



def test_expand_underscore_option_fields_appends_description_text_fields() -> None:
    fields = [
        {
            "label": "民族",
            "field_type": "单选",
            "inline_mark": True,
            "options": [
                {"decode": "汉族"},
                {"decode": "其他民族", "needs_description": True},
                {"decode": "其他，", "needs_description": True},
            ],
        }
    ]

    expanded = M._expand_underscore_option_fields(fields)

    assert expanded == [
        {
            "label": "民族",
            "field_type": "单选",
            "inline_mark": True,
            "options": [
                {"decode": "汉族"},
                {"decode": "其他民族"},
                {"decode": "其他，"},
            ],
        },
        {"label": "其他民族描述", "field_type": "文本", "inline_mark": True},
        {"label": "其他描述", "field_type": "文本", "inline_mark": True},
    ]



def test_expand_description_fields_follow_word_source_order_after_binary_normalization() -> None:
    """「否/是」重排后，描述字段仍按 Word 源顺序生成，而非重排后的列表序。"""
    fields = [
        {
            "label": "是否吸烟",
            "field_type": "单选",
            "options": [
                {"decode": "是", "_src_order": 1, "needs_description": True},
                {"decode": "否", "_src_order": 0, "needs_description": True},
            ],
        }
    ]

    expanded = M._expand_underscore_option_fields(fields)

    assert [f["label"] for f in expanded[1:]] == ["否描述", "是描述"]
    # 临时键必须全部消费，不泄漏进预览/建库
    assert all(
        "_src_order" not in str(f) and "needs_description" not in str(f)
        for f in expanded
    )


def test_collect_select_options_returns_decode_dicts() -> None:
    tuples = [
        M._build_choice_options("○正常 ○异常", "○"),
        M._build_choice_options("□选项1 □选项2", "□"),
    ]
    assert len(tuples[0]) == 2
    assert len(tuples[1]) == 2
    assert all("decode" in option for option in tuples[0])
    assert all("decode" in option for option in tuples[1])
    # 源序临时键仅解析期存活，用于重排后保持描述字段顺序（首片段为空串被跳过，序从 1 起）
    assert [option["_src_order"] for option in tuples[0]] == [1, 2]



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
