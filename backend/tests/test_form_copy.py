"""表单复制（/api/forms/{id}/copy）字段实例属性回归测试。

覆盖：三条复制路径共用 FormField 复制函数后，字段实例的全部展示属性
（底纹 / 文字色 / 加粗 / 字号）随复制保留，且复制清单由模型列推导。
"""

from datetime import datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from helpers import auth_headers, login_as
from src.models.form_field import FormField
from src.services.form_field_copy import (
    CALLER_SUPPLIED_ATTRS,
    COPIED_ATTRS,
    NEVER_COPIED_ATTRS,
    copy_form_field,
)

# 四个展示属性均取非默认值
_STYLES = {"bg_color": "FFF2CC", "text_color": "C00000", "label_bold": 0, "label_font_size": "large"}


@pytest.fixture
def auth_client(client: TestClient) -> TestClient:
    """复用 conftest 的共享 client，登录 alice 并带上鉴权头。"""
    client.headers.update(auth_headers(login_as(client, "alice")))
    return client


@pytest.fixture
def styled_form_id(auth_client: TestClient) -> int:
    """建项目 + 表单 + 一个带全部展示属性的字段实例，返回 form_id。"""
    project = auth_client.post("/api/projects", json={"name": "copy_styles", "version": "1.0"})
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]

    field_def = auth_client.post(
        f"/api/projects/{project_id}/field-definitions",
        json={"variable_name": "STYLED", "label": "样式字段", "field_type": "文本"},
    )
    assert field_def.status_code == 201, field_def.text

    form = auth_client.post(f"/api/projects/{project_id}/forms", json={"name": "StyledForm"})
    assert form.status_code == 201, form.text
    form_id = form.json()["id"]

    form_field = auth_client.post(
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


def test_should_keep_field_styles_when_copying_form(auth_client: TestClient, styled_form_id: int) -> None:
    """复制表单后，字段实例的四个展示属性与原字段一致。"""
    src = auth_client.get(f"/api/forms/{styled_form_id}/fields").json()[0]
    # 先确认种子已落库，避免源与副本同为空值时假通过
    assert {key: src[key] for key in _STYLES} == _STYLES

    resp = auth_client.post(f"/api/forms/{styled_form_id}/copy")
    assert resp.status_code == 201, resp.text
    new_form_id = resp.json()["id"]

    copied_fields = auth_client.get(f"/api/forms/{new_form_id}/fields").json()
    assert len(copied_fields) == 1
    copied = copied_fields[0]

    assert {key: copied[key] for key in _STYLES} == _STYLES


def _sample_value(column: Any, index: int) -> object:
    """按列类型生成一个区别于默认值的样本值（新增列自动获得样本）。"""
    type_name = column.type.__class__.__name__
    if type_name == "Integer":
        return 1000 + index
    if type_name == "DateTime":
        return datetime(2024, 5, 6, 7, 8, 9)
    return f"value_{column.name}_{index}"


def test_should_copy_every_payload_column_of_form_field() -> None:
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
