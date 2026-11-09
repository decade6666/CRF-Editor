"""适配器测试共享夹具：SDK 客户端进程环境、传输桩与清单构造。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().resolve().parents[2]
AGENT_BRIDGE = REPO_ROOT / "agent_bridge"

TEN_TOOLS = [
    "crf_list_projects",
    "crf_get_project_outline",
    "crf_get_form_detail",
    "crf_search_field_definitions",
    "crf_get_reference_impact",
    "crf_add_form_field",
    "crf_update_form_field_instance",
    "crf_reorder_form_fields",
    "crf_preview_shared_definition_change",
    "crf_apply_shared_definition_change",
]


def build_manifest(tool_names=None):
    """与后端 build_manifest 同构的测试清单（静态 schema，无项目文本）。"""
    return {
        "contract_version": "1.1.0",
        "tools": [
            {
                "name": name,
                "description": f"CRF 工具 {name}",
                "permission": "read_write"
                if name.split("_")[1] in ("add", "update", "reorder", "preview", "apply")
                else "read",
                "inputSchema": {
                    "type": "object",
                    "properties": (
                        {}
                        if name == "crf_list_projects"
                        else {"project_id": {"type": "integer"}, "form_id": {"type": "integer"}}
                    ),
                    "required": [] if name == "crf_list_projects" else ["project_id"],
                    "additionalProperties": False,
                },
                "outputSchema": {
                    "type": "object",
                    "properties": {
                        "data": {"type": "object"},
                        "project_fingerprint": {"type": ["string", "null"]},
                        "warnings": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["data"],
                    "additionalProperties": False,
                },
            }
            for name in (tool_names or TEN_TOOLS)
        ],
    }


class FakeTransport:
    """httpx.Client 传输替身：记录请求并按脚本回放响应（挂到 client._client._transport）。"""

    def __init__(self, script=None):
        self.requests = []
        self._script = script or {}

    def add(self, method: str, path: str, status: int = 200, json_body: dict | None = None):
        self._script[(method, path)] = (status, json_body or {})

    def handle_request(self, request):
        from urllib.parse import urlsplit

        from httpx import Response

        path = urlsplit(str(request.url)).path
        # 路径含 /api 前缀（api_url 基址），键按去掉 /api 的路由匹配
        route = path[len("/api") :] if path.startswith("/api/") else path
        self.requests.append(
            {
                "method": request.method,
                "path": path,
                "route": route,
                "json": json.loads(request.content.decode("utf-8")) if request.content else None,
                "headers": dict(request.headers),
            }
        )
        key = (request.method, route)
        if key not in self._script:
            return Response(404, json={"detail": "not scripted"})
        status, body = self._script[key]
        return Response(status, json=body)

    def close(self):
        pass


@pytest.fixture
def fake_transport():
    return FakeTransport()
