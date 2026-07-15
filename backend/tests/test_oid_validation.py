"""OID 字符集校验（req2）

契约：OID 只允许由字母、数字、`.`、`_`、`-` 组成（`^[A-Za-z0-9._-]+$`）。
- 必填 `variable_name`（字段定义 Create）：空值 / 非法字符被拒。
- 可选 OID 字段（字段定义 Update、表单 code、码表 code、选项 code）：空 / 空白归一为未设（None），有值才校验字符集。
- 仅在写入边界（Create/Update schema）拦截，不做存量迁移。
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from fastapi.testclient import TestClient
from helpers import auth_headers, login_as

from src.schemas.field import FieldDefinitionCreate, FieldDefinitionUpdate
from src.schemas.form import FormCreate, FormUpdate
from src.schemas.codelist import (
    CodeListCreate,
    CodeListUpdate,
    CodeListOptionCreate,
    CodeListOptionUpdate,
    CodeListOptionBatchUpdate,
)


VALID_OIDS = ["AE01", "a.b-c_d", "DM.01", "X", "A_1-2.3"]
INVALID_OIDS = ["AE 01", "中文", "a/b", "a@b", "a#b", "a:b", "a+b", "AE*"]


# --------- 字段定义 variable_name（必填）---------

@pytest.mark.parametrize("oid", VALID_OIDS)
def test_field_create_accepts_valid_variable_name(oid: str) -> None:
    model = FieldDefinitionCreate(variable_name=oid, label="标签", field_type="文本")
    assert model.variable_name == oid


@pytest.mark.parametrize("oid", INVALID_OIDS)
def test_field_create_rejects_invalid_variable_name(oid: str) -> None:
    with pytest.raises(ValidationError):
        FieldDefinitionCreate(variable_name=oid, label="标签", field_type="文本")


@pytest.mark.parametrize("bad", ["", "   "])
def test_field_create_rejects_empty_variable_name(bad: str) -> None:
    with pytest.raises(ValidationError):
        FieldDefinitionCreate(variable_name=bad, label="标签", field_type="文本")


def test_field_create_strips_surrounding_whitespace() -> None:
    model = FieldDefinitionCreate(variable_name="  AE01  ", label="标签", field_type="文本")
    assert model.variable_name == "AE01"


# --------- 字段定义 variable_name（Update，可选）---------

def test_field_update_optional_empty_becomes_none() -> None:
    for bad in (None, "", "   "):
        model = FieldDefinitionUpdate(variable_name=bad)
        assert model.variable_name is None


@pytest.mark.parametrize("oid", INVALID_OIDS)
def test_field_update_rejects_invalid_variable_name(oid: str) -> None:
    with pytest.raises(ValidationError):
        FieldDefinitionUpdate(variable_name=oid)


@pytest.mark.parametrize("oid", VALID_OIDS)
def test_field_update_accepts_valid_variable_name(oid: str) -> None:
    assert FieldDefinitionUpdate(variable_name=oid).variable_name == oid


# --------- 表单 code（可选）---------

@pytest.mark.parametrize("model_cls", [FormCreate, FormUpdate])
def test_form_code_optional_empty_becomes_none(model_cls) -> None:
    kwargs = {"name": "表单"} if model_cls is FormCreate else {}
    for bad in (None, "", "  "):
        model = model_cls(code=bad, **kwargs)
        assert model.code is None


@pytest.mark.parametrize("oid", INVALID_OIDS)
def test_form_code_rejects_invalid(oid: str) -> None:
    with pytest.raises(ValidationError):
        FormCreate(name="表单", code=oid)
    with pytest.raises(ValidationError):
        FormUpdate(code=oid)


def test_form_code_accepts_valid() -> None:
    assert FormCreate(name="表单", code="DM.01").code == "DM.01"


# --------- 码表 / 选项 code（可选）---------

@pytest.mark.parametrize(
    "model_cls,required",
    [
        (CodeListCreate, {"name": "码表"}),
        (CodeListUpdate, {}),
        (CodeListOptionCreate, {"decode": "解码"}),
        (CodeListOptionUpdate, {}),
        (CodeListOptionBatchUpdate, {"decode": "解码"}),
    ],
)
def test_codelist_code_optional_empty_becomes_none(model_cls, required) -> None:
    for bad in (None, "", "  "):
        model = model_cls(code=bad, **required)
        assert model.code is None


@pytest.mark.parametrize(
    "model_cls,required",
    [
        (CodeListCreate, {"name": "码表"}),
        (CodeListUpdate, {}),
        (CodeListOptionCreate, {"decode": "解码"}),
        (CodeListOptionUpdate, {}),
        (CodeListOptionBatchUpdate, {"decode": "解码"}),
    ],
)
@pytest.mark.parametrize("oid", ["中文", "a/b", "a b"])
def test_codelist_code_rejects_invalid(model_cls, required, oid: str) -> None:
    with pytest.raises(ValidationError):
        model_cls(code=oid, **required)


def test_codelist_code_accepts_valid() -> None:
    assert CodeListCreate(name="码表", code="LB-1").code == "LB-1"
    assert CodeListOptionCreate(decode="解码", code="OPT_1").code == "OPT_1"


# --------- 路由层 422（代表性端点）---------

@pytest.fixture
def auth_token(client: TestClient) -> str:
    return login_as(client, "alice")


@pytest.fixture
def project_id(client: TestClient, auth_token: str) -> int:
    resp = client.post(
        "/api/projects",
        json={"name": "OID 项目", "version": "1.0"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_route_field_definition_rejects_invalid_oid(client, project_id, auth_token) -> None:
    resp = client.post(
        f"/api/projects/{project_id}/field-definitions",
        json={"variable_name": "AE 01", "label": "标签", "field_type": "文本"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 422, resp.text


def test_route_field_definition_accepts_valid_oid(client, project_id, auth_token) -> None:
    resp = client.post(
        f"/api/projects/{project_id}/field-definitions",
        json={"variable_name": "AE01", "label": "标签", "field_type": "文本"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text


def test_route_form_rejects_invalid_code(client, project_id, auth_token) -> None:
    resp = client.post(
        f"/api/projects/{project_id}/forms",
        json={"name": "表单", "code": "AE/01"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 422, resp.text


def test_route_codelist_rejects_invalid_code(client, project_id, auth_token) -> None:
    resp = client.post(
        f"/api/projects/{project_id}/codelists",
        json={"name": "码表", "code": "中文"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 422, resp.text
