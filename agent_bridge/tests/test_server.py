"""server.py 单元测试：清单校验、工具列表与 call_tool 结果构造。"""

from __future__ import annotations

import asyncio
import json

import pytest
from mcp import types as mcp_types

from agent_bridge.client import AgentClientError
from agent_bridge.config import ConfigError
from agent_bridge.server import _local_schema_check, _ok_result, _error_result, build_server
from conftest import TEN_TOOLS, build_manifest


class _StubBackend:
    """记录调用的后端替身。"""

    def __init__(self, script=None):
        self.calls = []
        self._script = script or {}

    def call_tool(self, name, arguments):
        self.calls.append((name, arguments))
        if name in self._script:
            return self._script[name]
        raise AgentClientError(f"未脚本化: {name}", "TOOL_REJECTED", 400)


def test_build_server_accepts_matching_manifest():
    backend = _StubBackend()
    server = build_server(backend, build_manifest())
    assert server.name == "crf-editor"


def test_build_server_rejects_manifest_drift():
    backend = _StubBackend()
    with pytest.raises(Exception):
        build_server(backend, build_manifest(tool_names=TEN_TOOLS[:-1]))


def test_build_server_rejects_remote_schema_refs():
    manifest = build_manifest()
    manifest["tools"][0]["inputSchema"] = {"$ref": "http://evil.example/schema.json"}
    with pytest.raises(Exception):
        build_server(_StubBackend(), manifest)


def test_local_schema_check_allows_resolvable_internal_refs_and_rejects_others():
    # 本地引用必须可解析：指向文档内存在的 $defs；远程/未解析/非本地一律拒绝
    assert _local_schema_check({"$ref": "#/$defs/x", "$defs": {"x": {"type": "object"}}})
    assert _local_schema_check({"$ref": "#"})
    assert not _local_schema_check({"$ref": "http://example.org/x"})
    assert not _local_schema_check({"$ref": "#/$defs/missing"})
    assert not _local_schema_check({"$dynamicRef": "https://schemas.invalid/meta.json"})
    assert not _local_schema_check({"$recursiveRef": "https://schemas.invalid/meta.json"})
    assert not _local_schema_check("not-a-schema")


def test_build_server_rejects_duplicate_tool_names():
    manifest = build_manifest()
    manifest["tools"].append(dict(manifest["tools"][0]))
    with pytest.raises(Exception):
        build_server(_StubBackend(), manifest)


@pytest.mark.parametrize("schema_key", ["inputSchema", "outputSchema"])
def test_build_server_requires_both_schemas(schema_key):
    manifest = build_manifest()
    del manifest["tools"][0][schema_key]
    with pytest.raises(Exception):
        build_server(_StubBackend(), manifest)


def test_build_server_rejects_unresolvable_local_ref():
    manifest = build_manifest()
    manifest["tools"][2]["inputSchema"] = {
        "type": "object",
        "properties": {"project_id": {"$ref": "#/$defs/absent"}},
    }
    with pytest.raises(Exception):
        build_server(_StubBackend(), manifest)


def test_build_server_accepts_local_resolvable_refs():
    manifest = build_manifest()
    manifest["tools"][2]["inputSchema"] = {
        "type": "object",
        "$defs": {"positive": {"type": "integer", "minimum": 1}},
        "properties": {"project_id": {"$ref": "#/$defs/positive"}},
        "required": ["project_id"],
        "additionalProperties": False,
    }
    server = build_server(_StubBackend(), manifest)
    assert server.name == "crf-editor"


# 存在但畸形的 schema 必须在服务任何工具之前被元 schema 格式校验拒绝
# （构造 validator / 只查 dict 与本地引用都不等于格式校验）。
_MALFORMED_SCHEMAS = [
    {"type": 42},  # 主验收证据形状：type 非字符串
    {"type": "num"},  # type 不在 simpleTypes 枚举内
    {"type": "object", "required": "project_id"},  # required 必须是字符串数组
    {"$ref": 17},  # 引用值必须为字符串（本地引用检查只收集字符串值，挡不住它）
    {"type": "object", "properties": ["x"]},  # properties 必须是对象
    {"type": "object", "properties": {"x": {"type": 42}}},  # 嵌套位置畸形同样拒绝
]


@pytest.mark.parametrize("schema_key", ["inputSchema", "outputSchema"])
@pytest.mark.parametrize("malformed", _MALFORMED_SCHEMAS, ids=lambda s: json.dumps(s, ensure_ascii=False))
def test_build_server_rejects_present_but_malformed_schema(schema_key, malformed):
    manifest = build_manifest()
    manifest["tools"][0][schema_key] = malformed
    with pytest.raises(ConfigError) as excinfo:
        build_server(_StubBackend(), manifest)
    # 拒绝信息必须脱敏：不回显 schema 载荷、库细节或原始 traceback
    message = str(excinfo.value)
    assert json.dumps(malformed) not in message
    assert "Traceback" not in message
    assert "SchemaError" not in message


@pytest.mark.parametrize("schema_key", ["inputSchema", "outputSchema"])
def test_malformed_schema_key_is_reported_with_tool_name(schema_key):
    """拒绝信息带工具名（便于定位），但不携带 schema/input 值。"""
    manifest = build_manifest()
    manifest["tools"][2][schema_key] = {"type": 42}
    with pytest.raises(ConfigError) as excinfo:
        build_server(_StubBackend(), manifest)
    assert "crf_get_form_detail" in str(excinfo.value)


def test_call_tool_ok_and_error_results():
    ok = _ok_result({"data": {}})
    assert ok.isError is False
    assert ok.structuredContent == {"data": {}}
    assert ok.content[0].text == json.dumps({"data": {}}, ensure_ascii=False)

    err = _error_result("项目内容已变化", "TOOL_REJECTED")
    assert err.isError is True
    assert err.structuredContent["error"]["code"] == "TOOL_REJECTED"


async def _invoke_call_tool(server, name, arguments):
    """通过低层 Server 的内部注册表触发 call_tool 装饰器（真实 handler 路径）。

    handler 返回 ServerResult 包装；解包 root 取 CallToolResult。"""
    handler = server.request_handlers[mcp_types.CallToolRequest]
    request = mcp_types.CallToolRequest(params=mcp_types.CallToolRequestParams(name=name, arguments=arguments or {}))
    server_result = await handler(request)
    return getattr(server_result, "root", server_result)


@pytest.mark.anyio
async def test_call_tool_dispatches_to_backend():
    backend = _StubBackend(script={"crf_list_projects": {"data": {"projects": [{"id": 1}]}}})
    server = build_server(backend, build_manifest())
    result = await _invoke_call_tool(server, "crf_list_projects", {})
    assert backend.calls == [("crf_list_projects", {})]
    assert result.isError is False


@pytest.mark.anyio
async def test_call_tool_unknown_tool_is_error():
    backend = _StubBackend()
    server = build_server(backend, build_manifest())
    result = await _invoke_call_tool(server, "manage_entity", {"table": "user"})
    assert result.isError is True
    assert backend.calls == []


@pytest.mark.anyio
async def test_call_tool_backend_rejection_is_error():
    backend = _StubBackend()  # 全部未脚本化 → TOOL_REJECTED
    server = build_server(backend, build_manifest())
    # {"project_id": 1} 满足测试清单的输入 schema（仅要求 project_id），
    # 因此由桩后端自身的 TOOL_REJECTED 分支（而非 SDK 输入校验）产生错误
    result = await _invoke_call_tool(server, "crf_get_form_detail", {"project_id": 1})
    assert result.isError is True
    error = result.structuredContent["error"]
    assert error["code"] == "TOOL_REJECTED"
    assert backend.calls == [("crf_get_form_detail", {"project_id": 1})]


@pytest.fixture(params=["asyncio"])
def anyio_backend(request):
    return request.param


def test_build_server_rejects_remote_ref_in_output_schema():
    manifest = build_manifest()
    manifest["tools"][0]["outputSchema"] = {"$ref": "http://evil.example/schema.json"}
    with pytest.raises(Exception):
        build_server(_StubBackend(), manifest)


@pytest.mark.anyio
async def test_output_schema_mismatch_is_rejected_without_echo():
    import json as json_module

    manifest = build_manifest()
    # 收紧 outputSchema：要求 data.projects 必须存在
    manifest["tools"][0]["outputSchema"] = {
        "type": "object",
        "properties": {
            "data": {
                "type": "object",
                "required": ["projects"],
                "properties": {"projects": {"type": "array"}},
            }
        },
        "required": ["data"],
    }
    backend = _StubBackend(script={"crf_list_projects": {"unexpected": "payload"}})
    server = build_server(backend, manifest)
    result = await _invoke_call_tool(server, "crf_list_projects", {})
    assert result.isError is True
    error = result.structuredContent["error"]
    assert error["code"] == "OUTPUT_INVALID"
    # 不回显不合格输出内容
    assert "unexpected" not in json_module.dumps(result.structuredContent)


@pytest.mark.anyio
async def test_output_matching_schema_passes():
    manifest = build_manifest()
    manifest["tools"][0]["outputSchema"] = {
        "type": "object",
        "properties": {
            "data": {
                "type": "object",
                "required": ["projects"],
                "properties": {"projects": {"type": "array"}},
            }
        },
        "required": ["data"],
    }
    backend = _StubBackend(script={"crf_list_projects": {"data": {"projects": []}}})
    server = build_server(backend, manifest)
    result = await _invoke_call_tool(server, "crf_list_projects", {})
    assert result.isError is False


@pytest.mark.anyio
async def test_output_validation_library_exception_is_safe_error():
    """格式合法、引用可解析但验证时库异常（自引用 # 死循环）→ 安全协议错误，不回显异常细节。

    旧的 multipleOf:0 触发器现已被启动期元 schema 门禁（正确地）拒绝，
    无法再到达运行时路径；自引用 # 通过两道启动门禁，验证时才抛 RecursionError。"""
    import json as json_module

    manifest = build_manifest()
    manifest["tools"][0]["outputSchema"] = {"$ref": "#"}
    backend = _StubBackend(script={"crf_list_projects": 1})
    server = build_server(backend, manifest)
    result = await _invoke_call_tool(server, "crf_list_projects", {})
    assert result.isError is True
    error = result.structuredContent["error"]
    assert error["code"] == "OUTPUT_INVALID"
    payload_text = json_module.dumps(result.structuredContent)
    assert "RecursionError" not in payload_text
    assert "Traceback" not in payload_text
