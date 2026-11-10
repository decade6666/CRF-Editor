"""Word 导入执行结果 form_id 契约回归测试。

验证 POST /import-docx/execute 返回的 detail[].form_id 与实际落库 Form.id 一致，
且 Form 属于目标项目；AI 复核移除后退役输入按 422 拒绝。
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from starlette.requests import Request

from helpers import auth_headers, login_as, seed_user
from src.models.codelist import CodeList
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.user import User
from src.routers import import_docx
from src.services.docx_import_service import DocxImportService

# 临时编号现为 32 位小写十六进制（DocxExecuteRequest 按 pattern 校验）。
TEMP_ID = "b" * 32
PREVIEW_TEMP_ID = "c" * 32


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
        "src.routers.import_docx.DocxImportService.get_owned_temp_path",
        lambda _temp_id, **_kw: Path("/tmp/fake.docx"),
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
            request=Request(
                {"type": "http", "method": "POST", "path": f"/api/projects/{project_id}/import-docx/execute"}
            ),
            payload=import_docx.DocxExecuteRequest(temp_id=TEMP_ID, form_indices=[0]),
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
        "src.routers.import_docx.DocxImportService.get_owned_temp_path",
        lambda _temp_id, **_kw: Path("/tmp/fake.docx"),
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
            request=Request(
                {"type": "http", "method": "POST", "path": f"/api/projects/{project_id}/import-docx/execute"}
            ),
            payload=import_docx.DocxExecuteRequest(temp_id=TEMP_ID, form_indices=[0, 1]),
            session=session,
            current_user=current_user,
        )

    assert response.imported_form_count == 2
    for i, detail in enumerate(response.detail):
        assert detail.name, f"detail[{i}] missing 'name'"
        assert isinstance(detail.field_count, int)
        assert isinstance(detail.form_id, int)
        assert detail.form_id > 0


@pytest.mark.unit
def test_execute_request_model_rejects_ai_overrides_field() -> None:
    """已退役的 ai_overrides 字段在请求模型层被 422 拒绝（写库之前）。"""

    with pytest.raises(HTTPException) as exc:
        import_docx.DocxExecuteRequest(temp_id=TEMP_ID, form_indices=[0], ai_overrides=[])

    assert exc.value.status_code == 422
    assert "刷新" in exc.value.detail


def _seed_execute_scenario(
    client: TestClient,
    engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> tuple[str, int, str, Path, list]:
    """为执行接口播种：用户 + 项目 + 归属上传文件；返回 (project_id, temp_id, 上传路径, import 调用记录)。"""
    token = login_as(client, "alice")
    user_id = seed_user(client, "alice")
    r = client.post("/api/projects", json={"name": "覆盖残留项目", "version": "1.0"}, headers=auth_headers(token))
    assert r.status_code in (200, 201), r.text
    project_id = r.json()["id"]

    temp_id, name = DocxImportService.build_owned_filename("样本.docx", user_id=user_id, project_id=project_id)
    temp_dir = tmp_path / "docx_temp"
    monkeypatch.setattr(DocxImportService, "TEMP_DIR", str(temp_dir))
    temp_dir.mkdir(parents=True, exist_ok=True)
    upload_path = temp_dir / name
    upload_path.write_bytes(b"PK\x03\x04 placeholder docx")

    import_calls: list = []
    monkeypatch.setattr(
        DocxImportService,
        "import_forms",
        lambda *args, **kwargs: import_calls.append((args, kwargs)) or {"imported_form_count": 0, "detail": []},
    )
    return token, project_id, temp_id, upload_path, import_calls


@pytest.mark.integration
def test_execute_docx_import_rejects_stale_ai_overrides_with_sanitized_422(
    client, engine, monkeypatch, tmp_path, caplog
) -> None:
    """携带已退役 ai_overrides 的执行请求必须 422、不回显提交值（响应与日志）、零写入。"""
    token, project_id, temp_id, upload_path, import_calls = _seed_execute_scenario(
        client, engine, monkeypatch, tmp_path
    )
    fake_credential = "fake-credential-marker-9f3a"

    with caplog.at_level(logging.DEBUG):
        response = client.post(
            f"/api/projects/{project_id}/import-docx/execute",
            json={
                "temp_id": temp_id,
                "form_indices": [0],
                "ai_overrides": [
                    {"form_index": 0, "overrides": [{"index": 0, "field_type": fake_credential}]},
                ],
            },
            headers=auth_headers(token),
        )

    assert response.status_code == 422, response.text
    assert "刷新" in response.text
    assert fake_credential not in response.text, "错误响应不得回显提交的字段类型值"
    assert fake_credential not in caplog.text, "错误路径不得把提交值写入日志"
    assert import_calls == [], "携带 ai_overrides 的请求不得触发导入"
    assert upload_path.exists(), "请求不得消费上传文件"
    with Session(engine) as session:
        form_count = session.scalar(select(func.count()).select_from(Form).where(Form.project_id == project_id))
    assert form_count == 0, "拒绝路径不得产生表单写入"


@pytest.mark.integration
@pytest.mark.parametrize("stale_value", [None, []])
def test_execute_docx_import_rejects_empty_or_null_ai_overrides_too(
    client, engine, monkeypatch, tmp_path, stale_value
) -> None:
    """ai_overrides 即使为 null / 空列表也按退役输入拒绝（用户确认的行为）。"""
    token, project_id, temp_id, _upload_path, import_calls = _seed_execute_scenario(
        client, engine, monkeypatch, tmp_path
    )

    response = client.post(
        f"/api/projects/{project_id}/import-docx/execute",
        json={"temp_id": temp_id, "form_indices": [0], "ai_overrides": stale_value},
        headers=auth_headers(token),
    )

    assert response.status_code == 422, response.text
    assert import_calls == []


@pytest.mark.integration
def test_execute_stale_ai_overrides_422_hides_project_and_upload_existence(
    client, engine, monkeypatch, tmp_path, caplog
) -> None:
    """跨项目 / 缺失项目的退役输入请求得到同一份 422 文案：不泄露存在性，也不消费上传。"""
    token_a, project_a, temp_id, upload_path, _calls = _seed_execute_scenario(client, engine, monkeypatch, tmp_path)
    token_b = login_as(client, "bob")
    r = client.post("/api/projects", json={"name": "他者项目", "version": "1.0"}, headers=auth_headers(token_b))
    assert r.status_code in (200, 201), r.text
    project_b = r.json()["id"]
    missing_id = "9" * 32
    assert missing_id != temp_id
    fake_credential = "fake-credential-marker-9f3a"

    def _stale_body(temp_id_value: str) -> dict:
        return {
            "temp_id": temp_id_value,
            "form_indices": [0],
            "ai_overrides": [{"form_index": 0, "overrides": [{"index": 0, "field_type": fake_credential}]}],
        }

    with caplog.at_level(logging.DEBUG):
        foreign_resp = client.post(
            f"/api/projects/{project_b}/import-docx/execute",
            json=_stale_body(temp_id),
            headers=auth_headers(token_b),
        )
        missing_resp = client.post(
            f"/api/projects/{project_b}/import-docx/execute",
            json=_stale_body(missing_id),
            headers=auth_headers(token_b),
        )

    assert foreign_resp.status_code == 422, foreign_resp.text
    assert missing_resp.status_code == 422, missing_resp.text
    assert foreign_resp.text == missing_resp.text, "外来与缺失编号的退役输入应答必须逐字节一致"
    assert "刷新" in foreign_resp.text
    assert fake_credential not in foreign_resp.text and fake_credential not in caplog.text
    assert upload_path.exists(), "跨项目请求不得消费 A 的上传文件"
    with Session(engine) as session:
        forms_in_b = session.scalar(select(func.count()).select_from(Form).where(Form.project_id == project_b))
    assert forms_in_b == 0, "拒绝路径不得产生表单写入"


@pytest.mark.integration
def test_execute_unauthenticated_stale_ai_overrides_stays_401(client, monkeypatch, tmp_path) -> None:
    """未认证的退役输入请求先被认证门禁拦截（401 优先于 422），且无任何写入路径可达。"""
    token, project_id, temp_id, _upload_path, import_calls = _seed_execute_scenario(client, None, monkeypatch, tmp_path)

    response = client.post(
        f"/api/projects/{project_id}/import-docx/execute",
        json={"temp_id": temp_id, "form_indices": [0], "ai_overrides": []},
    )

    assert response.status_code == 401, response.text
    assert import_calls == []


@pytest.mark.integration
def test_preview_docx_import_response_has_no_ai_fields(engine, monkeypatch) -> None:
    """import-docx/preview 返回的响应在 AI 复核移除后不得再携带任何 AI 字段。"""
    user_id, project_id = _create_owned_project(engine)
    # 归属名铸造处固定 temp_id，落盘经流式接缝打桩：断言保持不变。
    monkeypatch.setattr(
        "src.routers.import_docx.DocxImportService.build_owned_filename",
        lambda _filename, **_kw: (PREVIEW_TEMP_ID, f"{PREVIEW_TEMP_ID}_u{user_id}_p{project_id}_test.docx"),
    )

    async def _fake_stream_upload(_reader, _dest, **_kwargs):
        return 0

    monkeypatch.setattr("src.routers.import_docx.stream_upload_to_file", _fake_stream_upload)
    monkeypatch.setattr(
        "src.routers.import_docx.DocxImportService.parse_full",
        lambda _path, **_kw: [{"name": "表单A", "fields": [{"label": "字段1", "field_type": "文本"}]}],
    )
    monkeypatch.setattr(
        "src.routers.import_docx.DocxScreenshotService.start",
        lambda **_kwargs: None,
    )
    monkeypatch.setattr("src.routers.import_docx.limit_import_action", lambda *_args, **_kwargs: None)

    with Session(engine) as session:
        current_user = session.get(User, user_id)
        assert current_user is not None
        response = asyncio.run(
            import_docx.preview_docx_import(
                project_id=project_id,
                request=Request(
                    {"type": "http", "method": "POST", "path": f"/api/projects/{project_id}/import-docx/preview"}
                ),
                file=_FakeUploadFile("test.docx", b"fake-docx"),
                session=session,
                current_user=current_user,
            )
        )

    assert response.temp_id == PREVIEW_TEMP_ID
    assert set(type(response).model_fields) == {"forms", "temp_id"}
    assert not hasattr(response, "ai_error")
    assert not hasattr(response, "ai_task_id")
    assert len(response.forms) == 1
    assert response.forms[0].name == "表单A"
    assert not hasattr(response.forms[0], "ai_suggestions")
    form_fields = response.forms[0].fields or []
    assert form_fields and type(form_fields[0]).model_fields.keys() >= {"index", "label", "field_type"}


@pytest.mark.integration
def test_create_form_logs_zero_based_non_log_preview_index_on_failure(engine, monkeypatch, caplog) -> None:
    """字段创建失败的定位日志必须使用预览 fields[] 的零基序号（日志行不占位）。"""
    _user_id, project_id = _create_owned_project(engine)
    parsed_forms = [
        {
            "name": "表单A",
            "fields": [
                {"type": "log_row"},
                {"label": "字段A", "field_type": "文本"},
                {"type": "log_row"},
                {"label": "字段B", "field_type": "单选", "options": ["是", "否"]},
            ],
        }
    ]
    # 字段B 是第二个非日志行字段：预览零基序号为 1（与 DocxFieldPreview.index 对齐）。
    original_create = DocxImportService._create_field_definition

    def _fail_on_second_real_field(
        self: DocxImportService,
        s: Session,
        project_id: int,
        field_info: dict,
        *args,
        **kwargs,
    ):
        if field_info.get("label") == "字段B":
            raise RuntimeError("boom-字段B")
        return original_create(self, s, project_id, field_info, *args, **kwargs)

    monkeypatch.setattr(DocxImportService, "_create_field_definition", _fail_on_second_real_field)

    with Session(engine) as session:
        service = DocxImportService(session)
        monkeypatch.setattr(service, "parse_full", lambda _path, **_kw: parsed_forms)

        with caplog.at_level(logging.ERROR, logger="src.services.docx_import_service"):
            with pytest.raises(RuntimeError, match="boom-字段B"):
                service.import_forms(project_id, "/tmp/fake.docx", [0])

    error_records = [r for r in caplog.records if "创建字段定义失败" in r.getMessage()]
    assert error_records, "字段创建失败必须留下定位日志"
    message = error_records[-1].getMessage()
    assert "字段#1" in message, f"失败日志必须为零基非日志行序号（字段B 预览序号 1），实际: {message}"
    assert "字段#2" not in message, f"失败日志不得使用一基序号: {message}"
    assert "字段B" in message and "boom-字段B" in message


@pytest.mark.integration
def test_import_forms_preserves_log_row_position_and_choice_options(engine, monkeypatch) -> None:
    """确定性导入：日志行保持原位、单选字段带选项建字典（AI 覆盖移除后不变的活路径）。"""
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
        monkeypatch.setattr(service, "parse_full", lambda _path, **_kw: parsed_forms)

        summary = service.import_forms(project_id, "/tmp/fake.docx", [0])

        imported_form_id = summary["detail"][0]["form_id"]
        imported_form = session.get(Form, imported_form_id)
        assert imported_form is not None

        defs = session.scalars(
            select(FieldDefinition).where(FieldDefinition.project_id == project_id).order_by(FieldDefinition.id)
        ).all()
        defs_by_label = {field_def.label: field_def for field_def in defs}

        assert summary["imported_form_count"] == 1
        assert summary["detail"][0]["field_count"] == 2
        assert defs_by_label["字段A"].field_type == "文本"
        assert defs_by_label["字段B"].field_type == "单选"
        assert defs_by_label["字段B"].codelist_id is not None
        codelist = session.get(CodeList, defs_by_label["字段B"].codelist_id)
        assert codelist is not None and codelist.project_id == project_id

        form_fields = session.scalars(
            select(FormField).where(FormField.form_id == imported_form_id).order_by(FormField.order_index)
        ).all()
        assert [field.is_log_row for field in form_fields] == [0, 1, 0]
