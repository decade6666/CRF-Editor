"""Word 导入临时文件归属校验测试。

漏洞背景：临时编号曾是 12 位且按前缀匹配，任何登录用户都能用别人的编号
读取、导入、删除其上传的文件。修复后编号为 32 位十六进制，文件名内嵌
「上传者 + 项目」归属，所有带编号的接口先做归属校验；别人的编号与
不存在的编号返回完全相同的响应。
"""
from __future__ import annotations

import re
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import src.services.ai_review_service as ai_review_service
from helpers import auth_headers, login_as, seed_user
from src.models.form import Form
from src.services import docx_import_service as dis
from src.services import docx_screenshot_service as dss
from src.services.ai_review_service import AIReviewTask
from src.services.docx_import_service import DocxImportService
from src.services.docx_screenshot_service import DocxScreenshotService, ScreenshotTask


@pytest.fixture(autouse=True)
def _isolated_temp_dirs(tmp_path, monkeypatch):
    """上传目录与截图缓存都指到临时目录；清空进程内任务注册表防跨测试泄漏。"""
    monkeypatch.setattr(DocxImportService, "TEMP_DIR", str(tmp_path / "docx_temp"))
    monkeypatch.setattr(DocxScreenshotService, "BASE_DIR", str(tmp_path / "docx_temp"))
    ai_review_service._ai_tasks.clear()
    with dss._tasks_lock:
        dss._tasks.clear()
    yield
    ai_review_service._ai_tasks.clear()
    with dss._tasks_lock:
        dss._tasks.clear()


def _create_project(client: TestClient, token: str, name: str) -> int:
    r = client.post("/api/projects", json={"name": name, "version": "1.0"}, headers=auth_headers(token))
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _upload_for(user_id: int, project_id: int, content: bytes = b"PK\x03\x04 placeholder docx") -> tuple[str, Path]:
    temp_id, file_path = DocxImportService.save_temp_file(
        content, "样本.docx", user_id=user_id, project_id=project_id
    )
    return temp_id, Path(file_path)


def _seed_upload(user_id: int, project_id: int, temp_id: str | None = None) -> tuple[str, Path]:
    """直接按「编号_归属_文件名」的目标格式落盘，供 API 测试播种，不依赖 save_temp_file 签名。"""
    temp_id = temp_id or uuid.uuid4().hex
    temp_dir = Path(DocxImportService.TEMP_DIR)
    temp_dir.mkdir(parents=True, exist_ok=True)
    path = temp_dir / f"{temp_id}_u{user_id}_p{project_id}_样本.docx"
    path.write_bytes(b"PK\x03\x04 placeholder docx")
    return temp_id, path


def _call_path_endpoint(client: TestClient, token: str, project_id: int, temp_id: str, endpoint: str):
    url = f"/api/projects/{project_id}/import-docx/{temp_id}/{endpoint}"
    if endpoint == "screenshots/start":
        return client.post(url, json={"form_names": []}, headers=auth_headers(token))
    return client.get(url, headers=auth_headers(token))


# ── 单元测试：服务层 ──


def test_should_mint_32_hex_temp_id_bound_to_owner_and_project():
    temp_id, file_path = _upload_for(7, 9)
    assert re.fullmatch(dis.TEMP_ID_PATTERN, temp_id)
    stored_name = Path(file_path).name
    assert stored_name.startswith(f"{temp_id}_u7_p9_")
    assert stored_name.endswith("_样本.docx")


def test_should_find_upload_only_for_same_user_and_project():
    temp_id, file_path = _upload_for(7, 9)
    assert DocxImportService.get_owned_temp_path(temp_id, user_id=7, project_id=9) == str(file_path)
    assert DocxImportService.get_owned_temp_path(temp_id, user_id=8, project_id=9) is None
    assert DocxImportService.get_owned_temp_path(temp_id, user_id=7, project_id=10) is None


def test_should_treat_malformed_temp_id_as_missing():
    first_id, first_path = _upload_for(1, 1)
    second_id, second_path = _upload_for(1, 1)
    assert first_id != second_id
    for bad in ["", "a", "a" * 31, "a" * 33, "A" * 32, "g" * 32, f"../{'a' * 29}"]:
        assert DocxImportService.get_owned_temp_path(bad, user_id=1, project_id=1) is None
        DocxImportService.cleanup_temp(bad)
        assert first_path.exists() and second_path.exists()


# ── API 测试：编号格式校验 ──

# 注意：含 `..` 或 `/` 的编号在路径参数场景下会被 HTTP 客户端在路由前
# 归一化/切断，无法经由客户端断言 422；这些形状由服务层
# test_should_treat_malformed_temp_id_as_missing 覆盖，并在请求体场景
# （execute）中通过 Pydantic pattern 断言 422。

_PATH_ENDPOINTS = [
    "ai-review/status",
    "screenshots/start",
    "screenshots/status",
    "screenshots/pages/1",
]
_BAD_PATH_IDS = ["a", "a" * 31, "a" * 33, "A" * 32, "g" * 32]


@pytest.mark.parametrize("endpoint", _PATH_ENDPOINTS)
@pytest.mark.parametrize("bad_id", _BAD_PATH_IDS)
def test_should_return_422_for_malformed_temp_id_in_path(client, bad_id, endpoint):
    token = login_as(client, "alice")
    project_id = _create_project(client, token, "A项目")
    response = _call_path_endpoint(client, token, project_id, bad_id, endpoint)
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("bad_id", ["", "a", "a" * 31, "a" * 33, "A" * 32, "g" * 32, f"../{'a' * 29}"])
def test_should_return_422_for_malformed_temp_id_in_execute_body(client, bad_id):
    token = login_as(client, "alice")
    project_id = _create_project(client, token, "A项目")
    response = client.post(
        f"/api/projects/{project_id}/import-docx/execute",
        json={"temp_id": bad_id, "form_indices": [0]},
        headers=auth_headers(token),
    )
    assert response.status_code == 422, response.text


# ── API 测试：归属校验 ──


def test_should_answer_foreign_temp_id_like_missing_one_on_every_endpoint(client):
    token_a = login_as(client, "alice")
    token_b = login_as(client, "bob")
    user_a = seed_user(client, "alice")
    project_a = _create_project(client, token_a, "A项目")
    project_b = _create_project(client, token_b, "B项目")

    temp_id, file_path = _seed_upload(user_a, project_a)
    missing_id = uuid.uuid4().hex
    assert missing_id != temp_id

    # A 的截图任务已完成、AI 任务已结束：B 不允许借 A 的编号看到其中任何内容。
    # 攻击面是 B 在自己的项目下引用 A 的编号（项目归属校验对 B 的项目放行）。
    page_png = file_path.parent / "page.png"
    page_png.write_bytes(b"\x89PNG fake")
    DocxScreenshotService._set_task(
        temp_id, ScreenshotTask(status="done", pages=[str(page_png)], page_count=1)
    )
    ai_review_service._ai_tasks[temp_id] = AIReviewTask(status="done", total=2, completed=2)

    for endpoint in _PATH_ENDPOINTS:
        foreign = _call_path_endpoint(client, token_b, project_b, temp_id, endpoint)
        missing = _call_path_endpoint(client, token_b, project_b, missing_id, endpoint)
        assert foreign.status_code == missing.status_code, (endpoint, foreign.text, missing.text)
        assert foreign.text == missing.text, endpoint

    foreign_exec = client.post(
        f"/api/projects/{project_b}/import-docx/execute",
        json={"temp_id": temp_id, "form_indices": [0]},
        headers=auth_headers(token_b),
    )
    missing_exec = client.post(
        f"/api/projects/{project_b}/import-docx/execute",
        json={"temp_id": missing_id, "form_indices": [0]},
        headers=auth_headers(token_b),
    )
    assert foreign_exec.status_code == missing_exec.status_code, (
        foreign_exec.text,
        missing_exec.text,
    )
    assert foreign_exec.text == missing_exec.text

    assert file_path.exists(), "B 不得删除 A 的上传文件"


def test_should_keep_owner_upload_when_other_user_executes_it(client, engine):
    token_a = login_as(client, "alice")
    token_b = login_as(client, "bob")
    user_a = seed_user(client, "alice")
    project_a = _create_project(client, token_a, "A项目")
    project_b = _create_project(client, token_b, "B项目")

    temp_id, file_path = _seed_upload(user_a, project_a)

    response = client.post(
        f"/api/projects/{project_b}/import-docx/execute",
        json={"temp_id": temp_id, "form_indices": [0]},
        headers=auth_headers(token_b),
    )

    assert response.status_code == 400, response.text
    assert response.json()["detail"] == "临时文件已过期，请重新上传"
    assert file_path.exists(), "B 执行导入后 A 的上传文件必须仍在磁盘上"
    with Session(engine) as session:
        forms_in_b = session.scalar(
            select(func.count()).select_from(Form).where(Form.project_id == project_b)
        )
    assert forms_in_b == 0, "B 的项目里不得出现 A 的表单"


def test_should_reject_owner_temp_id_in_another_project_of_same_owner(client):
    token_a = login_as(client, "alice")
    user_a = seed_user(client, "alice")
    project_1 = _create_project(client, token_a, "项目一")
    project_2 = _create_project(client, token_a, "项目二")

    temp_id, file_path = _seed_upload(user_a, project_1)

    status_other = _call_path_endpoint(client, token_a, project_2, temp_id, "screenshots/status")
    assert status_other.status_code == 200
    assert status_other.json() == {
        "status": "idle",
        "page_count": 0,
        "error": None,
        "page_ranges": {},
        "field_pages": {},
    }

    exec_other = client.post(
        f"/api/projects/{project_2}/import-docx/execute",
        json={"temp_id": temp_id, "form_indices": [0]},
        headers=auth_headers(token_a),
    )
    assert exec_other.status_code == 400
    assert exec_other.json()["detail"] == "临时文件已过期，请重新上传"
    assert file_path.exists()
