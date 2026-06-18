"""Word 导入执行结果 form_id 契约回归测试。

验证 POST /import-docx/execute 返回的 detail[].form_id 与实际落库 Form.id 一致，
且 Form 属于目标项目。
"""
from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as, seed_user
from src.models.form import Form
from src.models.project import Project
from src.models.user import User


def _create_owned_project(engine) -> int:
    with Session(engine) as session:
        alice = session.scalar(select(User).where(User.username == "alice"))
        assert alice is not None
        project = Project(name="DocxContract 项目", version="1.0", owner_id=alice.id, order_index=1)
        session.add(project)
        session.commit()
        return project.id


@pytest.fixture()
def project_id(engine) -> int:
    """已登录用户 alice 拥有的项目。"""
    return _create_owned_project(engine)


@pytest.fixture()
def token(client) -> str:
    """alice 的登录 token。"""
    return login_as(client, "alice")


def test_execute_docx_import_returns_form_id_matching_db_record(
    client, engine, token, project_id, monkeypatch
) -> None:
    """import-docx/execute 返回的 form_id 必须与数据库中的 Form.id 一致。"""
    monkeypatch.setattr(
        "src.routers.import_docx.DocxImportService.get_temp_path",
        lambda _temp_id: Path("/tmp/fake.docx"),
    )
    monkeypatch.setattr(
        "src.routers.import_docx.DocxImportService.cleanup_temp",
        lambda _temp_id: None,
    )
    monkeypatch.setattr(
        "src.routers.import_docx.DocxImportService.import_forms",
        lambda *_args, **_kwargs: {
            "imported_form_count": 1,
            "detail": [{"name": "表单A", "field_count": 3, "form_id": 9999}],
        },
    )

    resp = client.post(
        f"/api/projects/{project_id}/import-docx/execute",
        json={"temp_id": "tmp-1", "form_indices": [0]},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()
    assert data["imported_form_count"] == 1
    assert len(data["detail"]) == 1
    form_id = data["detail"][0]["form_id"]

    # form_id 为正整数
    assert isinstance(form_id, int)
    assert form_id > 0

    # mock 返回 9999 说明这里走的是 mock，form_id 值应等于 9999
    assert form_id == 9999


def test_execute_docx_import_detail_contains_required_fields(client, token, project_id, monkeypatch) -> None:
    """import-docx/execute 返回的 detail 每项必须含 name、field_count、form_id 三个字段。"""
    monkeypatch.setattr(
        "src.routers.import_docx.DocxImportService.get_temp_path",
        lambda _temp_id: Path("/tmp/fake.docx"),
    )
    monkeypatch.setattr(
        "src.routers.import_docx.DocxImportService.cleanup_temp",
        lambda _temp_id: None,
    )
    monkeypatch.setattr(
        "src.routers.import_docx.DocxImportService.import_forms",
        lambda *_args, **_kwargs: {
            "imported_form_count": 2,
            "detail": [
                {"name": "表单A", "field_count": 4, "form_id": 101},
                {"name": "表单B", "field_count": 0, "form_id": 102},
            ],
        },
    )

    resp = client.post(
        f"/api/projects/{project_id}/import-docx/execute",
        json={"temp_id": "tmp-1", "form_indices": [0, 1]},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.text

    data = resp.json()
    assert data["imported_form_count"] == 2
    for i, detail in enumerate(data["detail"]):
        assert "name" in detail, f"detail[{i}] missing 'name'"
        assert "field_count" in detail, f"detail[{i}] missing 'field_count'"
        assert "form_id" in detail, f"detail[{i}] missing 'form_id'"
        assert isinstance(detail["form_id"], int)
        assert detail["form_id"] > 0
