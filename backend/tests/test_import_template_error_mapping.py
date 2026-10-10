"""模板导入错误映射特征测试（`import_template.py` 三个端点）。

锁定三类异常到 HTTP 响应的映射，改造前即为绿色（characterization）：
- `FileNotFoundError` → 404（detail = 异常消息）；
- `ValueError` 含「模板库不兼容」→ 400 结构化 JSON（detail + code=TEMPLATE_INCOMPATIBLE）；
- 其余 `ValueError` → 400（detail = 异常消息，无 code）；
- `execute_import` 另有兜底：其他异常 → 500（detail 固定文案）。

服务层方法被替换为抛异常，以精确锁定「映射」本身，不依赖模板库内部实现。
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from helpers import auth_headers, login_as
from src.routers import import_template as import_template_router
from src.services.import_service import ImportService


@pytest.fixture
def auth_token(client: TestClient) -> str:
    return login_as(client, "alice")


@pytest.fixture
def project_id(client: TestClient, auth_token: str) -> int:
    resp = client.post(
        "/api/projects",
        json={"name": "错误映射项目", "version": "1.0"},
        headers=auth_headers(auth_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _raiser(exc: Exception):
    def _raise(*args, **kwargs):
        raise exc

    return _raise


# 端点 → (被替换的服务方法名, 发请求的函数)
def _call_preview(client: TestClient, project_id: int, token: str):
    return client.post(
        f"/api/projects/{project_id}/import-template",
        headers=auth_headers(token),
    )


def _call_form_fields(client: TestClient, project_id: int, token: str):
    return client.get(
        f"/api/projects/{project_id}/import-template/form-fields?form_id=1",
        headers=auth_headers(token),
    )


def _call_execute(client: TestClient, project_id: int, token: str):
    return client.post(
        f"/api/projects/{project_id}/import-template/execute",
        json={"source_project_id": 1, "form_ids": [1]},
        headers=auth_headers(token),
    )


_ENDPOINTS = [
    pytest.param("get_template_projects", _call_preview, id="preview_import"),
    pytest.param("get_template_form_fields", _call_form_fields, id="preview_form_fields"),
    pytest.param("import_forms", _call_execute, id="execute_import"),
]


@pytest.fixture(autouse=True)
def _patch_template_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        import_template_router,
        "get_config",
        lambda: SimpleNamespace(template_path="/tmp/fake-template.db"),
    )


@pytest.mark.parametrize(("service_method", "call"), _ENDPOINTS)
def test_file_not_found_maps_to_404(
    client: TestClient,
    project_id: int,
    auth_token: str,
    monkeypatch: pytest.MonkeyPatch,
    service_method: str,
    call,
) -> None:
    monkeypatch.setattr(
        ImportService, service_method, _raiser(FileNotFoundError("模板文件不存在: /tmp/fake-template.db"))
    )

    resp = call(client, project_id, auth_token)

    assert resp.status_code == 404, resp.text
    assert resp.json()["detail"] == "模板文件不存在: /tmp/fake-template.db"


@pytest.mark.parametrize(("service_method", "call"), _ENDPOINTS)
def test_incompatible_template_maps_to_structured_json(
    client: TestClient,
    project_id: int,
    auth_token: str,
    monkeypatch: pytest.MonkeyPatch,
    service_method: str,
    call,
) -> None:
    monkeypatch.setattr(
        ImportService,
        service_method,
        _raiser(ValueError("模板库不兼容：form_field 缺少列 label_bold")),
    )

    resp = call(client, project_id, auth_token)

    assert resp.status_code == 400, resp.text
    body = resp.json()
    assert body["code"] == "TEMPLATE_INCOMPATIBLE"
    assert "模板库不兼容" in body["detail"]


@pytest.mark.parametrize(("service_method", "call"), _ENDPOINTS)
def test_plain_value_error_maps_to_400(
    client: TestClient,
    project_id: int,
    auth_token: str,
    monkeypatch: pytest.MonkeyPatch,
    service_method: str,
    call,
) -> None:
    monkeypatch.setattr(ImportService, service_method, _raiser(ValueError("表单不存在")))

    resp = call(client, project_id, auth_token)

    assert resp.status_code == 400, resp.text
    body = resp.json()
    assert body["detail"] == "表单不存在"
    assert "code" not in body


def test_execute_import_unexpected_error_maps_to_500(
    client: TestClient,
    project_id: int,
    auth_token: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(ImportService, "import_forms", _raiser(RuntimeError("boom")))

    resp = _call_execute(client, project_id, auth_token)

    assert resp.status_code == 500, resp.text
    assert resp.json()["detail"] == "导入失败，请检查模板文件是否有效"


def test_preview_import_requires_configured_template_path(
    client: TestClient,
    project_id: int,
    auth_token: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        import_template_router,
        "get_config",
        lambda: SimpleNamespace(template_path=""),
    )

    resp = _call_preview(client, project_id, auth_token)

    assert resp.status_code == 400, resp.text
    assert "未配置模板路径" in resp.json()["detail"]


def test_compatibility_error_helper_shape() -> None:
    """`_compatibility_error` 的结构与 `template_fields` 路由共用，形状必须稳定。"""
    import json

    response = import_template_router._compatibility_error("模板库不兼容：X")
    assert response.status_code == 400
    assert json.loads(response.body) == {"detail": "模板库不兼容：X", "code": "TEMPLATE_INCOMPATIBLE"}
