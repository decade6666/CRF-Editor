"""Word 导出错误语义回归测试。

ExportError 必须原样透出：HTTP 400 + 具体 detail + code，
而不是被吞成 500「导出失败，请稍后重试或联系管理员」；
失败时路由创建的临时 .docx 必须删除。
"""

import logging
import os
import tempfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from helpers import auth_headers, login_as
from main import app
from src.database import get_read_session
from src.routers.export import _remove_temp_file
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.user import User
from src.models.visit import Visit
from src.models.visit_form import VisitForm


@pytest.fixture(autouse=True)
def _override_read_session(engine: Engine) -> Iterator[None]:
    """导出路由依赖 get_read_session；共享 client 夹具未覆盖它，这里补上内存引擎。"""

    def _override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_read_session] = _override
    yield
    app.dependency_overrides.pop(get_read_session, None)


def _seed_project_with_invalid_annotation_positions(session: Session, owner_id: int) -> int:
    """直接写库造出非法 annotation_positions（绕过 API 规范化），返回 project_id。"""
    project = Project(name="aCRF导出错误项目", version="1.0", owner_id=owner_id, order_index=1)
    session.add(project)
    session.flush()
    form = Form(project_id=project.id, name="知情同意", code="ICF", order_index=1, domain="DM")
    form.annotation_positions = '{"_bad":{"y":1}}'
    visit = Visit(project_id=project.id, name="访视1", code="V1", sequence=1)
    session.add_all([form, visit])
    session.flush()
    session.add(VisitForm(visit_id=visit.id, form_id=form.id, sequence=1))
    field_definition = FieldDefinition(
        project_id=project.id, variable_name="AGE", label="年龄", field_type="文本", order_index=1
    )
    session.add(field_definition)
    session.flush()
    session.add(FormField(form_id=form.id, field_definition_id=field_definition.id, order_index=1, inline_mark=0))
    session.flush()
    return project.id


def test_export_word_returns_specific_error_and_removes_temp_file(
    client: TestClient,
    engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = login_as(client, "alice")
    with Session(engine) as session:
        owner = session.scalar(select(User).where(User.username == "alice"))
        project_id = _seed_project_with_invalid_annotation_positions(session, owner.id)
        session.commit()

    created: list[str] = []
    real_named_temporary_file = tempfile.NamedTemporaryFile

    def _spy_named_temporary_file(*args: Any, **kwargs: Any) -> Any:
        handle = real_named_temporary_file(*args, **kwargs)
        created.append(handle.name)
        return handle

    monkeypatch.setattr("src.routers.export.tempfile.NamedTemporaryFile", _spy_named_temporary_file)

    resp = client.post(
        f"/api/projects/{project_id}/export/word",
        json={"annotated": True},
        headers=auth_headers(token),
    )

    # 路由确实创建过临时 .docx，且失败后已删除
    assert created, "导出路由应创建临时 .docx 文件"
    assert all(name.endswith(".docx") for name in created)
    assert all(not os.path.exists(name) for name in created), f"临时文件未清理: {created}"

    assert resp.status_code == 400, resp.text
    body = resp.json()
    assert body["code"] == "EXPORT_DATA_INCOMPATIBLE"
    assert "annotation_positions" in body["detail"]
    assert body["detail"] != "导出失败，请稍后重试或联系管理员"


def test_remove_temp_file_logs_warning_instead_of_swallowing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """临时文件删除失败必须留痕（项目规范禁止静默吞错），且不把异常抛给调用方。"""
    target = tmp_path / "leftover.docx"
    target.write_bytes(b"x")

    def _raise_permission_error(path: str) -> None:
        raise PermissionError("文件被占用")

    monkeypatch.setattr(os, "unlink", _raise_permission_error)

    with caplog.at_level(logging.WARNING, logger="src.routers.export"):
        _remove_temp_file(str(target))  # 不应抛出

    assert any("删除导出临时文件失败" in record.getMessage() for record in caplog.records)


def _create_plain_project(client: TestClient, token: str) -> int:
    resp = client.post(
        "/api/projects",
        json={"name": "导出失败分支项目", "version": "1.0", "db_type": "其他", "trial_name": "测试项目"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _raise_unlink(path: object, *args: Any, **kwargs: Any) -> None:
    raise PermissionError("文件被占用")


def test_export_word_generate_failure_survives_unlink_oserror(
    client: TestClient,
    engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """生成失败分支：临时文件删除撞上 OSError 也不得把具体原因吞成通用 500。"""

    def _fail_generate(*args: Any, **kwargs: Any) -> bool:
        return False

    token = login_as(client, "alice")
    project_id = _create_plain_project(client, token)
    monkeypatch.setattr("src.routers.export.ExportService.export_project_to_word", _fail_generate)
    monkeypatch.setattr(os, "unlink", _raise_unlink)

    resp = client.post(f"/api/projects/{project_id}/export/word", json={}, headers=auth_headers(token))

    assert resp.status_code == 500, resp.text
    assert resp.json()["detail"] == "导出失败，请检查项目数据是否完整"


def test_export_word_validate_failure_survives_unlink_oserror(
    client: TestClient,
    engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """产出校验失败分支：临时文件删除撞上 OSError 同样不得吞掉具体 reason。"""

    def _ok_generate(*args: Any, **kwargs: Any) -> bool:
        return True

    def _fail_validate(path: str) -> tuple[bool, str]:
        return False, "校验原因样例"

    token = login_as(client, "alice")
    project_id = _create_plain_project(client, token)
    monkeypatch.setattr("src.routers.export.ExportService.export_project_to_word", _ok_generate)
    monkeypatch.setattr("src.routers.export.ExportService._validate_output", _fail_validate)
    monkeypatch.setattr(os, "unlink", _raise_unlink)

    resp = client.post(f"/api/projects/{project_id}/export/word", json={}, headers=auth_headers(token))

    assert resp.status_code == 500, resp.text
    assert resp.json()["detail"] == "导出失败: 校验原因样例"
