"""表单复制（/api/forms/{id}/copy）字段实例属性回归测试。

覆盖：三条复制路径共用 FormField 复制函数后，字段实例的全部展示属性
（底纹 / 文字色 / 加粗 / 字号）随复制保留，且复制清单由模型列推导。
"""
from datetime import datetime
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from helpers import auth_headers, login_as
from main import app
from src.config import AdminConfig, AppConfig, AuthConfig
from src.database import get_session
from src.models import Base
from src.models.form_field import FormField
from src.services.form_field_copy import (
    CALLER_SUPPLIED_ATTRS,
    COPIED_ATTRS,
    NEVER_COPIED_ATTRS,
    copy_form_field,
)

_TEST_CONFIG = AppConfig(
    auth=AuthConfig(secret_key="test-secret-key-for-testing"),
    admin=AdminConfig(username="admin"),
)

# 四个展示属性均取非默认值
_STYLES = {"bg_color": "FFF2CC", "text_color": "C00000", "label_bold": 0, "label_font_size": "large"}


@pytest.fixture
def engine():
    _engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(_engine, "connect")
    def _enable_fk(dbapi_conn, connection_record):
        dbapi_conn.execute("PRAGMA foreign_keys = ON")

    Base.metadata.create_all(_engine)
    yield _engine
    _engine.dispose()


@pytest.fixture
def client(engine):
    def _override():
        with Session(engine) as session:
            with session.begin():
                yield session

    app.dependency_overrides[get_session] = _override
    with patch("main.get_config", return_value=_TEST_CONFIG), \
         patch("src.database.get_config", return_value=_TEST_CONFIG), \
         patch("src.services.auth_service.get_config", return_value=_TEST_CONFIG), \
         patch("src.services.user_admin_service.get_config", return_value=_TEST_CONFIG), \
         patch("src.routers.admin.get_config", return_value=_TEST_CONFIG), \
         patch("main.init_db"):
        with TestClient(app, raise_server_exceptions=False) as c:
            token = login_as(c, "alice")
            c.headers.update(auth_headers(token))
            yield c
    app.dependency_overrides.clear()


@pytest.fixture
def styled_form_id(client: TestClient) -> int:
    """建项目 + 表单 + 一个带全部展示属性的字段实例，返回 form_id。"""
    project = client.post("/api/projects", json={"name": "copy_styles", "version": "1.0"})
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]

    field_def = client.post(
        f"/api/projects/{project_id}/field-definitions",
        json={"variable_name": "STYLED", "label": "样式字段", "field_type": "文本"},
    )
    assert field_def.status_code == 201, field_def.text

    form = client.post(f"/api/projects/{project_id}/forms", json={"name": "StyledForm"})
    assert form.status_code == 201, form.text
    form_id = form.json()["id"]

    form_field = client.post(
        f"/api/forms/{form_id}/fields",
        json={
            "field_definition_id": field_def.json()["id"],
            "required": 1,
            "label_override": "覆盖标签",
            "help_text": "帮助文本",
            "default_value": "默认值",
            "inline_mark": 1,
            **_STYLES,
        },
    )
    assert form_field.status_code == 201, form_field.text
    return form_id


def test_should_keep_field_styles_when_copying_form(client: TestClient, styled_form_id: int):
    """复制表单后，字段实例的四个展示属性与原字段一致。"""
    src = client.get(f"/api/forms/{styled_form_id}/fields").json()[0]
    # 先确认种子已落库，避免源与副本同为空值时假通过
    assert {key: src[key] for key in _STYLES} == _STYLES

    resp = client.post(f"/api/forms/{styled_form_id}/copy")
    assert resp.status_code == 201, resp.text
    new_form_id = resp.json()["id"]

    copied_fields = client.get(f"/api/forms/{new_form_id}/fields").json()
    assert len(copied_fields) == 1
    copied = copied_fields[0]

    assert {key: copied[key] for key in _STYLES} == _STYLES


def _sample_value(column, index: int) -> object:
    """按列类型生成一个区别于默认值的样本值（新增列自动获得样本）。"""
    type_name = column.type.__class__.__name__
    if type_name == "Integer":
        return 1000 + index
    if type_name == "DateTime":
        return datetime(2024, 5, 6, 7, 8, 9)
    return f"value_{column.name}_{index}"


def test_should_copy_every_payload_column_of_form_field():
    """复制函数覆盖模型全部可复制列；form_id / 外键 / 排序由调用方给定。"""
    all_columns = {c.name for c in FormField.__table__.columns}
    assert CALLER_SUPPLIED_ATTRS == {"form_id", "field_definition_id", "order_index"}
    assert NEVER_COPIED_ATTRS == {"id", "created_at", "updated_at"}
    assert set(COPIED_ATTRS) == all_columns - CALLER_SUPPLIED_ATTRS - NEVER_COPIED_ATTRS

    src = FormField(
        form_id=11,
        field_definition_id=22,
        order_index=33,
        created_at=datetime(2020, 1, 1),
        updated_at=datetime(2020, 1, 2),
    )
    for index, attr in enumerate(COPIED_ATTRS):
        setattr(src, attr, _sample_value(FormField.__table__.columns[attr], index))

    copied = copy_form_field(src, form_id=101, field_definition_id=202, order_index=303)

    for attr in COPIED_ATTRS:
        assert getattr(copied, attr) == getattr(src, attr), f"{attr} 未被复制"
    assert copied.form_id == 101
    assert copied.field_definition_id == 202
    assert copied.order_index == 303
    # 主键与时间戳由数据库重新生成，不继承源实例
    assert copied.id is None
    assert copied.created_at is None
    assert copied.updated_at is None
