"""Word 导入执行结果 form_id 契约回归测试。

验证 POST /import-docx/execute 返回的 detail[].form_id 与实际落库 Form.id 一致，
且 Form 属于目标项目。
"""
from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.requests import Request

from src.models.codelist import CodeList
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.user import User
from src.routers import import_docx
from src.services.ai_review_service import AIReviewTask
from src.services.docx_import_service import DocxImportService


def _create_owned_project(engine) -> tuple[int, int]:
    with Session(engine) as session:
        alice = User(username="alice")
        session.add(alice)
        session.flush()
        project = Project(name="DocxContract 项目", version="1.0", owner_id=alice.id, order_index=1)
        session.add(project)
        session.commit()
        return alice.id, project.id


class _FakeUploadFile:
    def __init__(self, filename: str, content: bytes):
        self.filename = filename
        self._content = content

    async def read(self) -> bytes:
        return self._content


def test_execute_docx_import_returns_form_id_matching_db_record(engine, monkeypatch) -> None:
    """import-docx/execute 返回的 form_id 必须与数据库中的 Form.id 一致。"""
    user_id, project_id = _create_owned_project(engine)
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
    monkeypatch.setattr("src.routers.import_docx.limit_import_action", lambda *_args, **_kwargs: None)

    with Session(engine) as session:
        current_user = session.get(User, user_id)
        assert current_user is not None
        response = import_docx.execute_docx_import(
            project_id=project_id,
            request=Request({"type": "http", "method": "POST", "path": f"/api/projects/{project_id}/import-docx/execute"}),
            payload=import_docx.DocxExecuteRequest(temp_id="tmp-1", form_indices=[0]),
            session=session,
            current_user=current_user,
        )

    assert response.imported_form_count == 1
    assert len(response.detail) == 1
    form_id = response.detail[0].form_id

    # form_id 为正整数
    assert isinstance(form_id, int)
    assert form_id > 0

    # mock 返回 9999 说明这里走的是 mock，form_id 值应等于 9999
    assert form_id == 9999


def test_execute_docx_import_detail_contains_required_fields(engine, monkeypatch) -> None:
    """import-docx/execute 返回的 detail 每项必须含 name、field_count、form_id 三个字段。"""
    user_id, project_id = _create_owned_project(engine)
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
    monkeypatch.setattr("src.routers.import_docx.limit_import_action", lambda *_args, **_kwargs: None)

    with Session(engine) as session:
        current_user = session.get(User, user_id)
        assert current_user is not None
        response = import_docx.execute_docx_import(
            project_id=project_id,
            request=Request({"type": "http", "method": "POST", "path": f"/api/projects/{project_id}/import-docx/execute"}),
            payload=import_docx.DocxExecuteRequest(temp_id="tmp-1", form_indices=[0, 1]),
            session=session,
            current_user=current_user,
        )

    assert response.imported_form_count == 2
    for i, detail in enumerate(response.detail):
        assert detail.name, f"detail[{i}] missing 'name'"
        assert isinstance(detail.field_count, int)
        assert isinstance(detail.form_id, int)
        assert detail.form_id > 0


def test_execute_docx_import_rejects_checkbox_override(engine, monkeypatch) -> None:
    user_id, project_id = _create_owned_project(engine)

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
            "detail": [{"name": "表单A", "field_count": 1, "form_id": 101}],
        },
    )
    monkeypatch.setattr(
        "src.routers.import_docx.limit_import_action", lambda *_args, **_kwargs: None,
    )

    with Session(engine) as session:
        current_user = session.get(User, user_id)
        assert current_user is not None
        with pytest.raises(HTTPException) as exc:
            import_docx.execute_docx_import(
                project_id=project_id,
                request=Request({"type": "http", "method": "POST", "path": "/execute"}),
                payload=import_docx.DocxExecuteRequest(
                    temp_id="tmp-checkbox",
                    form_indices=[0],
                    ai_overrides=[
                        import_docx.DocxFormOverride(
                            form_index=0,
                            overrides=[
                                import_docx.DocxAIFieldOverride(index=0, field_type="复选")
                            ],
                        )
                    ],
                ),
                session=session,
                current_user=current_user,
            )

    assert exc.value.status_code == 400
    assert "不支持的字段类型" in exc.value.detail


def test_preview_docx_import_response_contains_ai_task_id(engine, monkeypatch) -> None:
    """import-docx/preview 返回的响应必须包含可选 ai_task_id 字段。"""
    user_id, project_id = _create_owned_project(engine)
    monkeypatch.setattr(
        "src.routers.import_docx.DocxImportService.save_temp_file",
        lambda _content, _filename: ("tmp-preview-1", Path("/tmp/fake.docx")),
    )
    monkeypatch.setattr(
        "src.routers.import_docx.DocxImportService.parse_full",
        lambda _path: [{"name": "表单A", "fields": [{"label": "字段1", "field_type": "文本"}]}],
    )
    monkeypatch.setattr(
        "src.routers.import_docx.DocxScreenshotService.start",
        lambda **_kwargs: None,
    )

    async def fake_start_ai_review(_temp_id, _forms):
        return AIReviewTask(status="pending", total=1)

    monkeypatch.setattr("src.routers.import_docx.start_ai_review", fake_start_ai_review)
    monkeypatch.setattr("src.routers.import_docx.limit_import_action", lambda *_args, **_kwargs: None)

    with Session(engine) as session:
        current_user = session.get(User, user_id)
        assert current_user is not None
        response = asyncio.run(
            import_docx.preview_docx_import(
                project_id=project_id,
                request=Request({"type": "http", "method": "POST", "path": f"/api/projects/{project_id}/import-docx/preview"}),
                file=_FakeUploadFile("test.docx", b"fake-docx"),
                session=session,
                current_user=current_user,
            )
        )

    assert response.temp_id == "tmp-preview-1"
    assert response.ai_error is None
    assert response.ai_task_id == "tmp-preview-1"
    assert len(response.forms) == 1
    assert response.forms[0].name == "表单A"


def test_import_forms_applies_ai_overrides_by_real_field_index_after_log_row(engine, monkeypatch) -> None:
    _user_id, project_id = _create_owned_project(engine)
    parsed_forms = [
        {
            "name": "表单A",
            "fields": [
                {"label": "字段A", "field_type": "文本"},
                {"type": "log_row"},
                {
                    "label": "字段B",
                    "field_type": "单选",
                    "options": ["是", "否"],
                },
            ],
        }
    ]

    with Session(engine) as session:
        service = DocxImportService(session)
        monkeypatch.setattr(service, "parse_full", lambda _path: parsed_forms)

        summary = service.import_forms(
            project_id,
            "/tmp/fake.docx",
            [0],
            ai_overrides=[
                {
                    "form_index": 0,
                    "overrides": [{"index": 1, "field_type": "文本"}],
                }
            ],
        )

        imported_form_id = summary["detail"][0]["form_id"]
        imported_form = session.get(Form, imported_form_id)
        assert imported_form is not None

        defs = session.scalars(
            select(FieldDefinition)
            .where(FieldDefinition.project_id == project_id)
            .order_by(FieldDefinition.id)
        ).all()
        defs_by_label = {field_def.label: field_def for field_def in defs}

        assert summary["imported_form_count"] == 1
        assert summary["detail"][0]["field_count"] == 2
        assert defs_by_label["字段A"].field_type == "文本"
        assert defs_by_label["字段B"].field_type == "文本"
        assert defs_by_label["字段B"].codelist_id is None
        assert session.scalar(
            select(CodeList).where(CodeList.project_id == project_id)
        ) is None

        form_fields = session.scalars(
            select(FormField)
            .where(FormField.form_id == imported_form_id)
            .order_by(FormField.order_index)
        ).all()
        assert [field.is_log_row for field in form_fields] == [0, 1, 0]
