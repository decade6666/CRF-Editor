"""日期 / 日期时间 / 时间占位文本与控件权重（Word 导出与列宽共用）。"""

import pytest
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from types import SimpleNamespace

from src.models import Base
from src.models.field_definition import FieldDefinition
from src.models.project import Project
from src.services.export_service import ExportService
from src.services.field_rendering import (
    build_field_control_weight,
    render_date_time_placeholder,
    resolve_time_precision,
)


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    with session_factory() as db_session:
        yield db_session

    engine.dispose()


def _form_field(session: Session, field_type: str, date_format=None):
    project = Project(name="p", version="1.0")
    session.add(project)
    session.flush()
    field_def = FieldDefinition(
        project_id=project.id,
        variable_name="F1",
        label="字段",
        field_type=field_type,
        date_format=date_format,
    )
    session.add(field_def)
    session.flush()

    return SimpleNamespace(field_definition=field_def, default_value=None, inline_mark=0)


@pytest.mark.parametrize(
    ("date_format", "expected"),
    [
        (None, "minute"),
        ("", "minute"),
        ("yyyy-MM-dd", "minute"),
        ("yyyy-MM-dd HH", "hour"),
        ("HH", "hour"),
        ("hh AP", "hour"),
        ("YYYY-MM-DD HH", "hour"),
        ("yyyy-MM-dd HH:mm", "minute"),
        ("HH:mm", "minute"),
        ("hh:mm AP", "minute"),
        ("yyyy-MM-dd HH:mm:ss", "second"),
        ("HH:mm:ss", "second"),
        ("hh:mm:ss AP", "second"),
    ],
)
def test_resolve_time_precision(date_format, expected):
    assert resolve_time_precision(date_format) == expected


def test_render_date_time_placeholder_new_and_existing_formats():
    date_only = "|__|__|__|__|年|__|__|月|__|__|日"
    assert render_date_time_placeholder("日期", "yyyy-MM-dd") == date_only
    assert render_date_time_placeholder("日期时间", "yyyy-MM-dd HH") == f"{date_only}  |__|__|时"
    assert render_date_time_placeholder("日期时间", "yyyy-MM-dd HH:mm") == f"{date_only}  |__|__|时|__|__|分"
    assert (
        render_date_time_placeholder("日期时间", "yyyy-MM-dd HH:mm:ss")
        == f"{date_only}  |__|__|时|__|__|分|__|__|秒"
    )
    assert render_date_time_placeholder("时间", "HH") == "|__|__|时"
    assert render_date_time_placeholder("时间", "hh AP") == "|__|__|时"
    assert render_date_time_placeholder("时间", "HH:mm") == "|__|__|时|__|__|分"
    assert render_date_time_placeholder("时间", "HH:mm:ss") == "|__|__|时|__|__|分|__|__|秒"


def test_render_date_time_placeholder_defaults_to_minute_without_format():
    date_only = "|__|__|__|__|年|__|__|月|__|__|日"
    assert render_date_time_placeholder("日期时间", None) == f"{date_only}  |__|__|时|__|__|分"
    assert render_date_time_placeholder("时间", None) == "|__|__|时|__|__|分"


def test_render_date_time_placeholder_returns_none_for_other_types():
    assert render_date_time_placeholder("文本", "yyyy-MM-dd HH") is None
    assert render_date_time_placeholder("数值", None) is None


@pytest.mark.parametrize(
    ("field_type", "date_format", "expected"),
    [
        ("日期时间", "yyyy-MM-dd HH", "|__|__|__|__|年|__|__|月|__|__|日  |__|__|时"),
        ("日期时间", None, "|__|__|__|__|年|__|__|月|__|__|日  |__|__|时|__|__|分"),
        ("日期时间", "yyyy-MM-dd HH:mm:ss", "|__|__|__|__|年|__|__|月|__|__|日  |__|__|时|__|__|分|__|__|秒"),
        ("时间", "HH", "|__|__|时"),
        ("时间", "hh AP", "|__|__|时"),
        ("时间", None, "|__|__|时|__|__|分"),
        ("时间", "HH:mm:ss", "|__|__|时|__|__|分|__|__|秒"),
    ],
)
def test_export_render_field_control(session, field_type, date_format, expected):
    holder = _form_field(session, field_type, date_format)

    assert ExportService(session)._render_field_control(holder.field_definition) == expected


@pytest.mark.parametrize(
    ("field_type", "date_format", "expected"),
    [
        ("日期", "yyyy-MM-dd", 33),
        ("日期时间", "yyyy-MM-dd HH", 44),
        ("日期时间", "yyyy-MM-dd HH:mm", 53),
        ("日期时间", "yyyy-MM-dd HH:mm:ss", 62),
        ("时间", "HH", 9),
        ("时间", "HH:mm", 18),
        ("时间", "HH:mm:ss", 27),
    ],
)
def test_build_field_control_weight_matches_export_placeholder(session, field_type, date_format, expected):
    holder = _form_field(session, field_type, date_format)

    assert build_field_control_weight(holder) == expected
