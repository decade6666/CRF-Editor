from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import pytest

from helpers import auth_headers, login_as
from src.models.codelist import CodeList, CodeListOption


@pytest.fixture
def auth_token(client: TestClient) -> str:
    return login_as(client, "alice")


def _create_project(client: TestClient, auth_token: str) -> int:
    resp = client.post(
        "/api/projects",
        json={"name": "字典项目", "version": "1.0"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_codelist(client: TestClient, project_id: int, auth_token: str) -> int:
    resp = client.post(
        f"/api/projects/{project_id}/codelists",
        json={"name": "性别", "code": "CL_SEX", "description": "保留说明"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _add_option(client: TestClient, project_id: int, codelist_id: int, auth_token: str, code: str, decode: str, trailing_underscore: int, order_index: int):
    resp = client.post(
        f"/api/projects/{project_id}/codelists/{codelist_id}/options",
        json={"code": code, "decode": decode, "trailing_underscore": trailing_underscore, "order_index": order_index},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_replace_codelist_snapshot_preserves_description_and_replaces_options(
    client: TestClient,
    auth_token: str,
    engine,
) -> None:
    project_id = _create_project(client, auth_token)
    codelist_id = _create_codelist(client, project_id, auth_token)
    first = _add_option(client, project_id, codelist_id, auth_token, "1", "男", 1, 1)
    _add_option(client, project_id, codelist_id, auth_token, "2", "女", 0, 2)

    resp = client.put(
        f"/api/projects/{project_id}/codelists/{codelist_id}/snapshot",
        json={
            "name": "性别字典",
            "description": "保留说明",
            "options": [
                {"id": first["id"], "code": "1", "decode": "男性", "trailing_underscore": 1},
                {"code": "3", "decode": "未知", "trailing_underscore": 0},
            ],
        },
        headers=auth_headers(auth_token),
    )

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    assert payload["name"] == "性别字典"
    assert payload["description"] == "保留说明"
    assert [(opt["code"], opt["decode"], opt["trailing_underscore"], opt["order_index"]) for opt in payload["options"]] == [
        ("1", "男性", 1, 1),
        ("3", "未知", 0, 2),
    ]

    list_resp = client.get(
        f"/api/projects/{project_id}/codelists",
        headers=auth_headers(auth_token),
    )
    assert list_resp.status_code == 200, list_resp.text
    matched = next(item for item in list_resp.json() if item["id"] == codelist_id)
    assert matched["description"] == "保留说明"
    assert [(opt["code"], opt["decode"], opt["order_index"]) for opt in matched["options"]] == [
        ("1", "男性", 1),
        ("3", "未知", 2),
    ]

    with Session(engine) as session:
        codelist = session.get(CodeList, codelist_id)
        assert codelist is not None
        assert codelist.description == "保留说明"
        options = session.query(CodeListOption).filter(CodeListOption.codelist_id == codelist_id).order_by(CodeListOption.order_index, CodeListOption.id).all()
        assert [(opt.code, opt.decode, opt.trailing_underscore, opt.order_index) for opt in options] == [
            ("1", "男性", 1, 1),
            ("3", "未知", 0, 2),
        ]


def test_replace_codelist_snapshot_is_atomic_when_new_option_conflicts(
    client: TestClient,
    auth_token: str,
    engine,
) -> None:
    project_id = _create_project(client, auth_token)
    codelist_id = _create_codelist(client, project_id, auth_token)
    first = _add_option(client, project_id, codelist_id, auth_token, "1", "男", 1, 1)
    second = _add_option(client, project_id, codelist_id, auth_token, "2", "女", 0, 2)

    resp = client.put(
        f"/api/projects/{project_id}/codelists/{codelist_id}/snapshot",
        json={
            "name": "错误提交",
            "description": "不应生效",
            "options": [
                {"id": first["id"], "code": "1", "decode": "男", "trailing_underscore": 1},
                {"id": second["id"], "code": "2", "decode": "女", "trailing_underscore": 0},
                {"code": "1", "decode": "男", "trailing_underscore": 0},
            ],
        },
        headers=auth_headers(auth_token),
    )

    assert resp.status_code >= 400, resp.text

    list_resp = client.get(
        f"/api/projects/{project_id}/codelists",
        headers=auth_headers(auth_token),
    )
    assert list_resp.status_code == 200, list_resp.text
    matched = next(item for item in list_resp.json() if item["id"] == codelist_id)
    assert matched["name"] == "性别"
    assert matched["description"] == "保留说明"
    assert [(opt["code"], opt["decode"], opt["trailing_underscore"], opt["order_index"]) for opt in matched["options"]] == [
        ("1", "男", 1, 1),
        ("2", "女", 0, 2),
    ]

    with Session(engine) as session:
        codelist = session.get(CodeList, codelist_id)
        assert codelist is not None
        assert codelist.name == "性别"
        assert codelist.description == "保留说明"
        options = session.query(CodeListOption).filter(CodeListOption.codelist_id == codelist_id).order_by(CodeListOption.order_index, CodeListOption.id).all()
        assert [(opt.code, opt.decode, opt.trailing_underscore, opt.order_index) for opt in options] == [
            ("1", "男", 1, 1),
            ("2", "女", 0, 2),
        ]
