"""client.py 单元测试（HTTP 桩）：白名单、认证头、错误映射、结果查询。"""

from __future__ import annotations

import pytest

from agent_bridge.client import (
    ALLOWED_TOOLS,
    AgentClientError,
    BackendClient,
)
from conftest import TEN_TOOLS, build_manifest


def _client(transport) -> BackendClient:
    import httpx

    http_client = httpx.Client(transport=transport, follow_redirects=False, trust_env=False)
    return BackendClient("http://127.0.0.1:8000/api", "test-token", transport=http_client)


def test_allowlist_exactly_ten_tools():
    assert set(ALLOWED_TOOLS) == set(TEN_TOOLS)


def test_fetch_manifest_sends_bearer(backend_client_with_transport):
    client, transport = backend_client_with_transport
    transport.add("GET", "/agent/tools", 200, build_manifest())
    manifest = client.fetch_manifest()
    assert {t["name"] for t in manifest["tools"]} == set(TEN_TOOLS)
    request = transport.requests[-1]
    assert request["headers"]["authorization"] == "Bearer test-token"


def test_call_tool_forwards_arguments(backend_client_with_transport):
    client, transport = backend_client_with_transport
    transport.add("POST", "/agent/tools/crf_list_projects", 200, {"data": {"projects": []}})
    result = client.call_tool("crf_list_projects", {})
    assert result["data"]["projects"] == []
    request = transport.requests[-1]
    assert request["method"] == "POST"
    assert request["json"] == {}


def test_unknown_tool_rejected_without_request(backend_client_with_transport):
    client, transport = backend_client_with_transport
    with pytest.raises(AgentClientError):
        client.call_tool("manage_entity", {"table": "user"})
    assert transport.requests == []


def test_401_maps_to_tool_rejected(backend_client_with_transport):
    client, transport = backend_client_with_transport
    transport.add("POST", "/agent/tools/crf_list_projects", 401, {"detail": "凭据无效或已失效"})
    with pytest.raises(AgentClientError) as exc:
        client.call_tool("crf_list_projects", {})
    assert exc.value.code == "TOOL_REJECTED"
    assert "凭据" in exc.value.message


def test_409_maps_to_tool_rejected_with_detail(backend_client_with_transport):
    client, transport = backend_client_with_transport
    transport.add("POST", "/agent/tools/crf_add_form_field", 409, {"detail": "项目内容已变化"})
    with pytest.raises(AgentClientError) as exc:
        client.call_tool("crf_add_form_field", {})
    assert exc.value.code == "TOOL_REJECTED"
    assert "项目内容已变化" in exc.value.message


def test_500_maps_to_backend_unavailable(backend_client_with_transport):
    client, transport = backend_client_with_transport
    transport.add("POST", "/agent/tools/crf_list_projects", 500, {"detail": "内部服务器错误"})
    with pytest.raises(AgentClientError) as exc:
        client.call_tool("crf_list_projects", {})
    assert exc.value.code == "BACKEND_UNAVAILABLE"


def test_lookup_operation_unknown_outcome(backend_client_with_transport):
    client, transport = backend_client_with_transport
    transport.add("POST", "/agent/operations/req-x", 404, {"code": "UNKNOWN_OUTCOME"})
    with pytest.raises(AgentClientError) as exc:
        client.lookup_operation("crf_add_form_field", {"request_id": "req-x"})
    assert exc.value.code == "UNKNOWN_OUTCOME"
    assert "同一 request_id" in exc.value.message


def test_lookup_operation_returns_result(backend_client_with_transport):
    client, transport = backend_client_with_transport
    transport.add("POST", "/agent/operations/req-y", 200, {"data": {"form_field_id": 5}})
    result = client.lookup_operation("crf_update_form_field_instance", {"request_id": "req-y"})
    assert result["data"]["form_field_id"] == 5
    request = transport.requests[-1]
    assert request["method"] == "POST"
    assert request["json"] == {
        "tool_name": "crf_update_form_field_instance",
        "arguments": {"request_id": "req-y"},
    }


@pytest.fixture
def backend_client_with_transport(fake_transport):
    client = _client(fake_transport)
    return client, fake_transport


def test_response_limit_stops_the_stream_early(monkeypatch):
    import httpx

    from agent_bridge import client as client_module

    monkeypatch.setattr(client_module, "MAX_RESPONSE_BYTES", 32)
    consumed = []

    class Body(httpx.SyncByteStream):
        def __iter__(self):
            consumed.append(1)
            yield b"x" * 33
            consumed.append(2)
            yield b"y" * 10

    def respond(request):
        return httpx.Response(200, stream=Body())

    with httpx.Client(transport=httpx.MockTransport(respond)) as transport:
        backend = client_module.BackendClient("https://backend.invalid/api", "test-token", transport)
        with pytest.raises(AgentClientError):
            backend.fetch_manifest()
    assert consumed == [1], "超限后必须停止读取，不消耗后续块"


def test_mutation_timeout_reports_unknown_outcome_with_stable_identity():
    import httpx

    from agent_bridge.client import AgentClientError, BackendClient

    def respond(request):
        raise httpx.ReadTimeout("synthetic local read timeout", request=request)

    with httpx.Client(transport=httpx.MockTransport(respond)) as transport:
        backend = BackendClient("https://backend.invalid/api", "test-token", transport)
        with pytest.raises(AgentClientError) as exc:
            backend.call_tool("crf_update_form_field_instance", {"request_id": "stable-review-id"})
    assert exc.value.code == "UNKNOWN_OUTCOME"
    assert "stable-review-id" in exc.value.message
    assert "同一 request_id" in exc.value.message


def test_apply_timeout_guides_same_change_id_retry():
    import httpx

    from agent_bridge.client import AgentClientError, BackendClient

    def respond(request):
        raise httpx.ReadTimeout("synthetic local read timeout", request=request)

    with httpx.Client(transport=httpx.MockTransport(respond)) as transport:
        backend = BackendClient("https://backend.invalid/api", "test-token", transport)
        with pytest.raises(AgentClientError) as exc:
            backend.call_tool("crf_apply_shared_definition_change", {"project_id": 1, "change_id": 42})
    assert exc.value.code == "UNKNOWN_OUTCOME"
    assert "42" in exc.value.message
    assert "相同 change_id" in exc.value.message


def test_backend_domain_code_passes_through():
    import httpx

    from agent_bridge.client import BackendClient
    from conftest import FakeTransport

    transport = FakeTransport()
    transport.add("POST", "/agent/tools/crf_add_form_field", 409, {"detail": "项目内容已变化", "code": "STALE_STATE"})
    client = BackendClient("http://127.0.0.1:8000/api", "test-token", httpx.Client(transport=transport))
    with pytest.raises(AgentClientError) as exc:
        client.call_tool("crf_add_form_field", {})
    assert exc.value.code == "STALE_STATE"
    assert "项目内容已变化" in exc.value.message


def test_timeout_recovery_returns_schema_valid_committed_envelope():
    """IR1 回归：POST 超时但写已提交 → 至多一次固定结果查询返回与原派发相同的
    封闭信封，并通过该工具 manifest 输出 schema 校验（指纹只在信封顶层，
    data 不含 project_fingerprint 键——后端存储查询若嵌错位置即在此失败）。
    查询请求体必须携带原始工具名与原始参数（后端按同一身份规则绑定）。"""
    import httpx
    import json as json_module
    import jsonschema

    from agent_bridge.client import BackendClient
    from conftest import build_manifest

    manifest = build_manifest()
    output_schema = next(t["outputSchema"] for t in manifest["tools"] if t["name"] == "crf_add_form_field")
    committed_envelope = {
        "data": {"form_field_id": 7, "definition_id": 3, "definition_created": True, "replay": None},
        "project_fingerprint": "a" * 64,
        "warnings": [],
    }
    original_arguments = {"project_id": 1, "request_id": "lookup-recover-1"}
    state = {"posted": False, "lookups": 0, "lookup_body": None}

    def handler(request):
        if request.method == "POST" and "/agent/tools/" in request.url.path:
            state["posted"] = True
            raise httpx.ReadTimeout("synthetic local read timeout", request=request)
        assert request.url.path.endswith("/agent/operations/lookup-recover-1")
        state["lookups"] += 1
        state["lookup_body"] = json_module.loads(request.content.decode("utf-8"))
        return httpx.Response(200, json=committed_envelope)

    with httpx.Client(transport=httpx.MockTransport(handler)) as transport:
        backend = BackendClient("https://backend.invalid/api", "test-token", transport=transport)
        result = backend.call_tool("crf_add_form_field", original_arguments)

    assert state["posted"] is True
    assert state["lookups"] == 1  # 设计允许的至多一次固定查询
    assert state["lookup_body"] == {"tool_name": "crf_add_form_field", "arguments": original_arguments}
    assert result == committed_envelope
    # 与原派发同一封闭信封：通过生成的 manifest 输出 schema 校验
    jsonschema.Draft202012Validator(output_schema).validate(result)
    assert "project_fingerprint" not in result["data"]


def test_timeout_with_identity_conflict_surfaces_identity_reused():
    """POST 超时后固定查询返回 409 IDENTITY_REUSED：确定结论原样上抛（恰好一次查询）。"""
    import httpx

    from agent_bridge.client import ERR_IDENTITY_REUSED, AgentClientError, BackendClient

    state = {"lookups": 0}

    def handler(request):
        if "/agent/tools/" in request.url.path:
            raise httpx.ReadTimeout("synthetic local read timeout", request=request)
        state["lookups"] += 1
        return httpx.Response(
            409,
            json={"detail": "request_id 已被用于不同请求；请新换一个 request_id", "code": "IDENTITY_REUSED"},
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as transport:
        backend = BackendClient("https://backend.invalid/api", "test-token", transport=transport)
        with pytest.raises(AgentClientError) as exc:
            backend.call_tool(
                "crf_add_form_field",
                {"project_id": 1, "request_id": "identity-conflict-1"},
            )
    assert exc.value.code == ERR_IDENTITY_REUSED
    assert state["lookups"] == 1


def test_read_tool_timeout_does_not_lookup():
    """读工具响应超时：不做结果查询（零查询），返回 BACKEND_UNAVAILABLE。"""
    import httpx

    from agent_bridge.client import AgentClientError, BackendClient

    state = {"lookups": 0}

    def handler(request):
        if "/agent/operations/" in request.url.path:
            state["lookups"] += 1
        raise httpx.ReadTimeout("synthetic local read timeout", request=request)

    with httpx.Client(transport=httpx.MockTransport(handler)) as transport:
        backend = BackendClient("https://backend.invalid/api", "test-token", transport=transport)
        with pytest.raises(AgentClientError) as exc:
            backend.call_tool("crf_get_form_detail", {"project_id": 1, "request_id": "read-timeout-1"})
    assert exc.value.code == "BACKEND_UNAVAILABLE"
    assert state["lookups"] == 0
